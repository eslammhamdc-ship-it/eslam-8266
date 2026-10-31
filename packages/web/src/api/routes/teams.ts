import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import { auditLogs, teamMemberships, user } from "../database/schema";
import { authed } from "../middleware/auth";

const roleSchema = z.enum(["department_manager", "sales_rep", "aviation_agent"]);
const departmentSchema = z.enum(["sales", "aviation"]);
const now = () => new Date().toISOString();

async function membership(userId: string) {
  const [row] = await db.select().from(teamMemberships).where(
    and(eq(teamMemberships.userId, userId), eq(teamMemberships.active, "active")),
  ).limit(1);
  return row;
}

function requireBranchManager(m: Awaited<ReturnType<typeof membership>>) {
  if (!m || m.role !== "branch_manager" || m.department !== "branch") {
    throw new ORPCError("FORBIDDEN", { message: "هذا الإجراء متاح لمدير الفرع فقط" });
  }
}

export const teams = {
  me: authed.handler(async ({ context }) => ({
    membership: await membership(context.user.id) ?? null,
  })),

  bootstrap: authed.input(z.object({ setupKey: z.string().min(24).max(256) })).handler(async ({ input, context }) => {
    const configuredKey = process.env.MIDWAY_BRANCH_SETUP_KEY;
    if (!configuredKey || input.setupKey !== configuredKey) {
      throw new ORPCError("FORBIDDEN", { message: "مفتاح التأسيس غير صحيح أو غير مضبوط" });
    }
    const existing = await db.select({ id: teamMemberships.id }).from(teamMemberships).limit(1);
    if (existing.length) throw new ORPCError("CONFLICT", { message: "تم تأسيس صلاحيات الفرع بالفعل" });
    const timestamp = now();
    await db.insert(teamMemberships).values({
      id: crypto.randomUUID(),
      userId: context.user.id,
      department: "branch",
      role: "branch_manager",
      active: "active",
      createdBy: context.user.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorUserId: context.user.id,
      action: "branch.bootstrap",
      entityType: "team_membership",
      entityId: context.user.id,
      before: null,
      after: { department: "branch", role: "branch_manager" },
      createdAt: timestamp,
    });
    return { ok: true };
  }),

  list: authed.handler(async ({ context }) => {
    const actor = await membership(context.user.id);
    requireBranchManager(actor);
    return db.select({
      id: teamMemberships.id,
      userId: teamMemberships.userId,
      name: user.name,
      email: user.email,
      department: teamMemberships.department,
      role: teamMemberships.role,
      active: teamMemberships.active,
      createdAt: teamMemberships.createdAt,
    }).from(teamMemberships).innerJoin(user, eq(teamMemberships.userId, user.id));
  }),

  assign: authed.input(z.object({
    userId: z.string().min(1),
    department: departmentSchema,
    role: roleSchema,
  })).handler(async ({ input, context }) => {
    const actor = await membership(context.user.id);
    requireBranchManager(actor);
    const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, input.userId)).limit(1);
    if (!target) throw new ORPCError("NOT_FOUND", { message: "المستخدم غير موجود" });
    const [previous] = await db.select().from(teamMemberships).where(eq(teamMemberships.userId, input.userId)).limit(1);
    const timestamp = now();
    const next = {
      department: input.department,
      role: input.role,
      active: "active" as const,
      updatedAt: timestamp,
    };
    if (previous) {
      await db.update(teamMemberships).set(next).where(eq(teamMemberships.id, previous.id));
    } else {
      await db.insert(teamMemberships).values({
        id: crypto.randomUUID(),
        userId: input.userId,
        ...next,
        createdBy: context.user.id,
        createdAt: timestamp,
      });
    }
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorUserId: context.user.id,
      action: previous ? "team.membership.updated" : "team.membership.created",
      entityType: "team_membership",
      entityId: input.userId,
      before: previous ? { department: previous.department, role: previous.role, active: previous.active } : null,
      after: { department: input.department, role: input.role, active: "active" },
      createdAt: timestamp,
    });
    return { ok: true };
  }),

  suspend: authed.input(z.object({ userId: z.string().min(1) })).handler(async ({ input, context }) => {
    const actor = await membership(context.user.id);
    requireBranchManager(actor);
    if (input.userId === context.user.id) throw new ORPCError("BAD_REQUEST", { message: "لا يمكنك إيقاف حسابك بنفسك" });
    const [target] = await db.select().from(teamMemberships).where(eq(teamMemberships.userId, input.userId)).limit(1);
    if (!target || target.role === "branch_manager") throw new ORPCError("NOT_FOUND");
    const timestamp = now();
    await db.update(teamMemberships).set({ active: "suspended", updatedAt: timestamp }).where(eq(teamMemberships.id, target.id));
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorUserId: context.user.id,
      action: "team.membership.suspended",
      entityType: "team_membership",
      entityId: input.userId,
      before: { active: target.active, role: target.role, department: target.department },
      after: { active: "suspended" },
      createdAt: timestamp,
    });
    return { ok: true };
  }),
};
