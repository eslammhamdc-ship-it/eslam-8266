import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import { auditLogs, records, serviceRequests, teamMemberships, companyAssignments } from "../database/schema";
import { authed } from "../middleware/auth";

async function member(userId: string) {
  const [m] = await db.select().from(teamMemberships).where(
    and(eq(teamMemberships.userId, userId), eq(teamMemberships.active, "active")),
  ).limit(1);
  return m;
}
const isBranch = (m: NonNullable<Awaited<ReturnType<typeof member>>>) =>
  m.role === "branch_manager" && m.department === "branch";
const isAviationManager = (m: NonNullable<Awaited<ReturnType<typeof member>>>) =>
  m.role === "department_manager" && m.department === "aviation";
const isSales = (m: NonNullable<Awaited<ReturnType<typeof member>>>) =>
  m.department === "sales" && ["department_manager", "sales_rep"].includes(m.role);

export const aviation = {
  create: authed.input(z.object({
    companyRecordId: z.string().nullable().optional(),
    requestType: z.string().trim().min(2).max(80),
    details: z.record(z.string(), z.unknown()),
  })).handler(async ({ input, context }) => {
    const m = await member(context.user.id);
    if (!m || (!isBranch(m) && !isSales(m))) throw new ORPCError("FORBIDDEN");
    if (input.companyRecordId) {
      const [company] = await db.select().from(records).where(
        and(eq(records.id, input.companyRecordId), eq(records.kind, "company")),
      ).limit(1);
      const [assignment] = await db.select().from(companyAssignments).where(eq(companyAssignments.companyRecordId, input.companyRecordId)).limit(1);
      const isSalesManager = m.role === "department_manager" && m.department === "sales";
      const hasCompanyAccess = company && (isBranch(m) || isSalesManager ||
        (company.ownerId === context.user.id && !assignment) || assignment?.assigneeUserId === context.user.id);
      if (!hasCompanyAccess) throw new ORPCError("NOT_FOUND", { message: "الشركة غير متاحة لحسابك" });
    }
    const timestamp = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      department: "aviation" as const,
      companyRecordId: input.companyRecordId ?? null,
      createdBy: context.user.id,
      assignedTo: null,
      status: "new" as const,
      requestType: input.requestType,
      details: input.details,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await db.insert(serviceRequests).values(row);
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(), actorUserId: context.user.id, action: "aviation.request.created",
      entityType: "service_request", entityId: row.id, before: null,
      after: { status: row.status, requestType: row.requestType, companyRecordId: row.companyRecordId },
      createdAt: timestamp,
    });
    return { id: row.id, requestType: row.requestType, status: row.status, companyRecordId: row.companyRecordId, createdAt: row.createdAt };
  }),

  list: authed.handler(async ({ context }) => {
    const m = await member(context.user.id);
    if (!m) throw new ORPCError("FORBIDDEN");
    if (isBranch(m) || isAviationManager(m)) return db.select().from(serviceRequests);
    if (m.department === "aviation" && m.role === "aviation_agent") {
      return db.select().from(serviceRequests).where(eq(serviceRequests.assignedTo, context.user.id));
    }
    if (isSales(m)) return db.select({ id: serviceRequests.id, requestType: serviceRequests.requestType, companyRecordId: serviceRequests.companyRecordId, status: serviceRequests.status, createdAt: serviceRequests.createdAt, updatedAt: serviceRequests.updatedAt }).from(serviceRequests).where(eq(serviceRequests.createdBy, context.user.id));
    throw new ORPCError("FORBIDDEN");
  }),

  assign: authed.input(z.object({
    requestId: z.string().min(1),
    assigneeUserId: z.string().min(1),
  })).handler(async ({ input, context }) => {
    const m = await member(context.user.id);
    if (!m || (!isBranch(m) && !isAviationManager(m))) throw new ORPCError("FORBIDDEN");
    const [request] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, input.requestId)).limit(1);
    if (!request) throw new ORPCError("NOT_FOUND");
    const [assignee] = await db.select().from(teamMemberships).where(
      and(eq(teamMemberships.userId, input.assigneeUserId), eq(teamMemberships.department, "aviation"),
        eq(teamMemberships.role, "aviation_agent"), eq(teamMemberships.active, "active")),
    ).limit(1);
    if (!assignee) throw new ORPCError("BAD_REQUEST", { message: "الموظف المحدد ليس موظف طيران نشطًا" });
    const timestamp = new Date().toISOString();
    await db.update(serviceRequests).set({ assignedTo: input.assigneeUserId, status: "assigned", updatedAt: timestamp })
      .where(eq(serviceRequests.id, input.requestId));
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(), actorUserId: context.user.id, action: "aviation.request.assigned",
      entityType: "service_request", entityId: request.id,
      before: { assignedTo: request.assignedTo, status: request.status },
      after: { assignedTo: input.assigneeUserId, status: "assigned" }, createdAt: timestamp,
    });
    return { ok: true };
  }),

  updateStatus: authed.input(z.object({
    requestId: z.string().min(1),
    status: z.enum(["in_progress", "waiting_customer", "completed", "cancelled"]),
  })).handler(async ({ input, context }) => {
    const m = await member(context.user.id);
    if (!m) throw new ORPCError("FORBIDDEN");
    const [request] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, input.requestId)).limit(1);
    if (!request) throw new ORPCError("NOT_FOUND");
    const manager = isBranch(m) || isAviationManager(m);
    const assignedAgent = m.department === "aviation" && m.role === "aviation_agent" && request.assignedTo === context.user.id;
    if (!manager && !assignedAgent) throw new ORPCError("FORBIDDEN");
    const timestamp = new Date().toISOString();
    await db.update(serviceRequests).set({ status: input.status, updatedAt: timestamp }).where(eq(serviceRequests.id, request.id));
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(), actorUserId: context.user.id, action: "aviation.request.status_changed",
      entityType: "service_request", entityId: request.id,
      before: { status: request.status }, after: { status: input.status }, createdAt: timestamp,
    });
    return { ok: true };
  }),
};
