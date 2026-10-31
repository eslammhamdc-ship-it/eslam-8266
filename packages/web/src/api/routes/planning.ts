import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import { records, teamMemberships, companyAssignments } from "../database/schema";
import { authed } from "../middleware/auth";
async function planningScope(userId: string) {
  const [m] = await db.select().from(teamMemberships).where(and(
    eq(teamMemberships.userId, userId), eq(teamMemberships.active, "active"),
  )).limit(1);
  if (!m || !((m.role === "branch_manager" && m.department === "branch") ||
    (m.department === "sales" && ["department_manager", "sales_rep"].includes(m.role))))
    throw new ORPCError("FORBIDDEN", { message: "غير مصرح لك باستخدام خطة الزيارات" });
  if (m.role === "branch_manager" || m.role === "department_manager") return { manager: true, visible: null as Set<string> | null };
  const [owned, assigned] = await Promise.all([
    db.select({ id: records.id }).from(records).where(and(eq(records.ownerId, userId), eq(records.kind, "company"))),
    db.select({ companyRecordId: companyAssignments.companyRecordId }).from(companyAssignments).where(eq(companyAssignments.assigneeUserId, userId)),
  ]);
  return { manager: false, visible: new Set([...owned.map(x => x.id), ...assigned.map(x => x.companyRecordId)]) };
}
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
export const planning = {
  append: authed
    .input(z.object({ date: day, companyIds: z.array(z.string()).min(1).max(100) }))
    .handler(async ({ input, context }) => {
      const scope = await planningScope(context.user.id);\n      const all = (await db.select().from(records)).filter(r => r.kind === "company" ? (scope.manager || scope.visible!.has(r.id)) : r.companyId ? (scope.manager || scope.visible!.has(r.companyId)) : r.ownerId === context.user.id);
      const ids = [...new Set(input.companyIds)];
      if (ids.some((id) => !all.some((r) => r.id === id && r.kind === "company")))
        throw new ORPCError("BAD_REQUEST", { message: "شركة غير متاحة في حسابك" });
      const existing = all.filter((r) => r.kind === "stop" && r.data.date === input.date);
      const fresh = ids.filter(
        (id) => !existing.some((r) => r.companyId === id && r.data.status === "planned"),
      );
      const offset = Math.max(0, ...existing.map((r) => Number(r.data.order) || 0)),
        now = new Date().toISOString();
      if (fresh.length)
        await db.batch(
          fresh.map((id, i) =>
            db
              .insert(records)
              .values({
                id: crypto.randomUUID(),
                ownerId: context.user.id,
                kind: "stop",
                companyId: id,
                data: {
                  date: input.date,
                  order: offset + i + 1,
                  status: "planned",
                  objective: "زيارة مخططة من الشركات المسجلة",
                },
                createdAt: now,
                updatedAt: now,
              }),
          ) as any,
        );
      return { added: fresh.length, skipped: ids.length - fresh.length };
    }),
  reorder: authed
    .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
    .handler(async ({ input, context }) => {
      const all = await db.select().from(records).where(eq(records.ownerId, context.user.id));
      const stops = input.ids.map((id) => all.find((r) => r.id === id && r.kind === "stop"));
      if (
        new Set(input.ids).size !== input.ids.length ||
        stops.some((r) => !r) ||
        new Set(stops.map((r) => r!.data.date)).size !== 1
      )
        throw new ORPCError("BAD_REQUEST", { message: "يجب ترتيب محطات نفس اليوم فقط" });
      const date = stops[0]!.data.date;
      const rest = all
        .filter((r) => r.kind === "stop" && r.data.date === date && !input.ids.includes(r.id))
        .sort((a, b) => Number(a.data.order) - Number(b.data.order));
      await db.batch(
        [...stops, ...rest].map((r, i) =>
          db
            .update(records)
            .set({ data: { ...r!.data, order: i + 1 }, updatedAt: new Date().toISOString() })
            .where(and(eq(records.id, r!.id), eq(records.ownerId, context.user.id))),
        ) as any,
      );
      return { ok: true };
    }),
};
