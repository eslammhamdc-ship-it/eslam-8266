import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import { records, teamMemberships, companyAssignments, auditLogs } from "../database/schema";
import { authed } from "../middleware/auth";
import { statuses, stages } from "../../shared/constants";
const kind = z.enum(["company", "visit", "followup", "opportunity", "stop", "event"]);
const payload = z.object({
  id: z.string().optional(),
  kind,
  data: z.record(z.string(), z.any()),
  companyId: z.string().nullable().optional(),
  allowDuplicate: z.boolean().optional(),
});
async function accessScope(userId: string) {
  const [m] = await db.select().from(teamMemberships).where(and(
    eq(teamMemberships.userId, userId), eq(teamMemberships.active, "active"),
  )).limit(1);
  if (!m) throw new ORPCError("FORBIDDEN", { message: "الحساب غير مضاف إلى فريق الفرع أو موقوف" });
  if (m.role === "branch_manager" && m.department === "branch") return { manager: true, visible: null as Set<string> | null };
  if (m.department !== "sales" || !["department_manager", "sales_rep"].includes(m.role))
    throw new ORPCError("FORBIDDEN", { message: "قسمك غير مصرح له باستخدام CRM" });
  if (m.role === "department_manager") return { manager: true, visible: null as Set<string> | null };
  const [owned, assigned] = await Promise.all([
    db.select({ id: records.id }).from(records).where(and(eq(records.ownerId, userId), eq(records.kind, "company"))),
    db.select({ companyRecordId: companyAssignments.companyRecordId }).from(companyAssignments).where(eq(companyAssignments.assigneeUserId, userId)),
  ]);
  return { manager: false, visible: new Set([...owned.map(x => x.id), ...assigned.map(x => x.companyRecordId)]) };
}
function canSeeCompany(scope: Awaited<ReturnType<typeof accessScope>>, id: string | null) {
  return scope.manager || (!!id && !!scope.visible?.has(id));
}
function normalize(s: any) {
  return String(s || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]/gu, "");
}
function validate(k: string, d: Record<string, any>) {
  const key =
    k === "company"
      ? "name"
      : k === "visit"
        ? "date"
        : k === "followup"
          ? "action"
          : k === "opportunity"
            ? "description"
            : k === "stop"
              ? "date"
              : "text";
  if (!String(d[key] || "").trim())
    throw new ORPCError("BAD_REQUEST", { message: "أكمل البيانات الأساسية المطلوبة" });
  for (const key of ["date", "due", "nextDue", "expectedClose", "completedAt"])
    if (d[key] && !Number.isFinite(Date.parse(d[key])))
      throw new ORPCError("BAD_REQUEST", { message: "التاريخ غير صحيح" });
  for (const key of ["value", "probability", "order"])
    if (d[key] != null && d[key] !== "" && (!Number.isFinite(Number(d[key])) || Number(d[key]) < 0))
      throw new ORPCError("BAD_REQUEST", { message: "القيمة الرقمية غير صحيحة" });
  if (d.probability && Number(d.probability) > 100)
    throw new ORPCError("BAD_REQUEST", { message: "الاحتمال يجب أن يكون بين صفر و١٠٠" });
  for (const [key, limit] of [
    ["latitude", 90],
    ["longitude", 180],
  ] as const)
    if (
      d[key] != null &&
      d[key] !== "" &&
      (!Number.isFinite(Number(d[key])) || Math.abs(Number(d[key])) > limit)
    )
      throw new ORPCError("BAD_REQUEST", { message: "الإحداثيات غير صحيحة" });
  if (
    k === "company" &&
    Boolean(d.latitude != null && d.latitude !== "") !==
      Boolean(d.longitude != null && d.longitude !== "")
  )
    throw new ORPCError("BAD_REQUEST", { message: "أدخل خط العرض والطول معًا أو اتركهما فارغين" });
  for (const key of ["opensAt", "closesAt"])
    if (d[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d[key]))
      throw new ORPCError("BAD_REQUEST", { message: "وقت العمل غير صحيح" });
  if (d.priority && !["A", "B", "C"].includes(d.priority)) throw new ORPCError("BAD_REQUEST");
  if (k === "visit" && !Array.isArray(d.services || [])) throw new ORPCError("BAD_REQUEST");
  if (k === "visit" && d.customerStatus && !statuses.includes(d.customerStatus))
    throw new ORPCError("BAD_REQUEST");
  if (k === "company") {
    if (!statuses.includes(d.status) || !stages.includes(d.stage))
      throw new ORPCError("BAD_REQUEST", { message: "تصنيف الشركة أو مرحلتها غير صحيح" });
    if (
      !Array.isArray(d.contacts || []) ||
      !Array.isArray(d.usedServices || []) ||
      !Array.isArray(d.neededServices || [])
    )
      throw new ORPCError("BAD_REQUEST");
    for (const key of ["maps", "website"])
      if (d[key] && !String(d[key]).startsWith("https://") && !String(d[key]).startsWith("http://"))
        throw new ORPCError("BAD_REQUEST", {
          message: "الرابط يجب أن يبدأ بـ https:// أو http://",
        });
  }
  if (k === "opportunity" && !stages.includes(d.stage))
    throw new ORPCError("BAD_REQUEST", { message: "مرحلة الفرصة غير صحيحة" });
  if (k === "followup" && !["pending", "done"].includes(d.status))
    throw new ORPCError("BAD_REQUEST");
  if (k === "stop" && !["planned", "completed", "cancelled"].includes(d.status))
    throw new ORPCError("BAD_REQUEST");
}
export const crm = {
  list: authed.handler(async ({ context }) => {
    const scope = await accessScope(context.user.id);
    const all = await db.select().from(records);
    return scope.manager ? all : all.filter(r => r.kind === "company"
      ? canSeeCompany(scope, r.id)
      : r.companyId ? canSeeCompany(scope, r.companyId) : r.ownerId === context.user.id);
  }),
  save: authed.input(payload).handler(async ({ input, context }) => {
    validate(input.kind, input.data);
    const scope = await accessScope(context.user.id);
    const ownerId = context.user.id, now = new Date().toISOString();
    const all = await db.select().from(records);
    const old = input.id ? all.find((r) => r.id === input.id) : undefined;
    if (old && !canSeeCompany(scope, old.kind === "company" ? old.id : old.companyId)) throw new ORPCError("NOT_FOUND");
    if (input.id && !old) throw new ORPCError("NOT_FOUND");
    if (old && old.kind !== input.kind) throw new ORPCError("BAD_REQUEST");
    if (
      input.kind !== "company" &&
      (!input.companyId || !all.some((r) => r.id === input.companyId && r.kind === "company") || !canSeeCompany(scope, input.companyId))
    )
      throw new ORPCError("BAD_REQUEST", { message: "اختر شركة صحيحة" });
    for (const [key, k] of [
      ["visitId", "visit"],
      ["opportunityId", "opportunity"],
    ])
      if (
        input.data[key] &&
        !all.some(
          (r) => r.id === input.data[key] && r.kind === k && r.companyId === input.companyId,
        )
      )
        throw new ORPCError("BAD_REQUEST", { message: "السجل المرتبط لا ينتمي لهذه الشركة" });
    if (input.kind === "followup" && input.data.status === "done" && !input.data.completedAt)
      input.data.completedAt = now;
    if (input.kind === "company" && !input.allowDuplicate) {
      const n = normalize(input.data.name),
        p = normalize(input.data.phone),
        e = normalize(input.data.email);
      if (
        all.some(
          (r) =>
            r.kind === "company" &&
            r.id !== input.id &&
            (normalize(r.data.name) === n ||
              (n.length > 5 &&
                normalize(r.data.name).length > 5 &&
                (n.includes(normalize(r.data.name)) || normalize(r.data.name).includes(n))) ||
              (p && normalize(r.data.phone) === p) ||
              (e && normalize(r.data.email) === e)),
        )
      )
        throw new ORPCError("CONFLICT", {
          message:
            "شركة مشابهة بالاسم أو الهاتف أو البريد موجودة بالفعل. راجعها قبل إضافة نسخة أخرى.",
        });
    }
    const row = {
      id: old?.id || crypto.randomUUID(),
      ownerId: old?.ownerId || ownerId,
      kind: input.kind,
      companyId: input.companyId || null,
      data: input.data,
      createdAt: old?.createdAt || now,
      updatedAt: now,
    };
    const writes: any[] = [
      old
        ? db
            .update(records)
            .set(row)
            .where(and(eq(records.id, row.id), eq(records.ownerId, old?.ownerId || ownerId)))
        : db.insert(records).values(row),
    ];
    if (input.kind === "company" && !old && !scope.manager) writes.push(db.insert(companyAssignments).values({
      id: crypto.randomUUID(), companyRecordId: row.id, assigneeUserId: context.user.id,
      assignedBy: context.user.id, createdAt: now, updatedAt: now,
    }));
    if (input.kind !== "event" && input.kind !== "stop")
      writes.push(
        db.insert(records).values({
          id: crypto.randomUUID(),
          ownerId,
          kind: "event",
          companyId: input.kind === "company" ? row.id : row.companyId,
          data: {
            text:
              input.kind === "company"
                ? `${old ? "تعديل" : "إضافة"} الشركة — ${input.data.status || ""} — ${input.data.stage || ""}`
                : `${old ? "تعديل" : "إضافة"} ${input.kind === "visit" ? "زيارة" : input.kind === "followup" ? "متابعة" : "فرصة بيع"}`,
            relatedId: row.id,
            ...(input.kind === "company" && old && old.data.status !== input.data.status
              ? { statusFrom: old.data.status, statusTo: input.data.status }
              : {}),
          },
          createdAt: now,
          updatedAt: now,
        }),
      );
    if (input.kind === "visit" && input.data.updateCompany) {
      const c = all.find((r) => r.id === row.companyId && r.kind === "company")!;
      const status = input.data.customerStatus || c.data.status;
      const priority = input.data.priority || c.data.priority;
      writes.push(
        db
          .update(records)
          .set({ data: { ...c.data, status, priority }, updatedAt: now })
          .where(and(eq(records.id, c.id), eq(records.ownerId, c.ownerId))),
      );
      writes.push(
        db.insert(records).values({
          id: crypto.randomUUID(),
          ownerId,
          kind: "event",
          companyId: c.id,
          data: {
            text: `تحديث تصنيف الشركة من زيارة: ${status} — أولوية ${priority}`,
            relatedId: row.id,
            ...(status !== c.data.status ? { statusFrom: c.data.status, statusTo: status } : {}),
          },
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    if (input.kind === "visit" && input.data.nextAction && !old)
      writes.push(
        db.insert(records).values({
          id: crypto.randomUUID(),
          ownerId,
          kind: "followup",
          companyId: row.companyId,
          data: {
            action: input.data.nextAction,
            due: input.data.nextDue || "",
            channel: input.data.channel || "واتساب",
            priority:
              input.data.priority || all.find((c) => c.id === row.companyId)?.data.priority || "B",
            status: "pending",
            contact: input.data.contact || "",
            visitId: row.id,
          },
          createdAt: now,
          updatedAt: now,
        }),
      );
    await db.batch(writes as any);
    return row;
  }),
  remove: authed.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const scope = await accessScope(context.user.id);
    const [row] = await db.select().from(records).where(eq(records.id, input.id));
    if (!row || !canSeeCompany(scope, row.kind === "company" ? row.id : row.companyId)) throw new ORPCError("NOT_FOUND");
    if (!scope.manager && row.ownerId !== context.user.id) throw new ORPCError("FORBIDDEN");
    const cond = and(eq(records.ownerId, row.ownerId), eq(records.id, input.id));
    if (row.kind === "company")
      await db.batch([
        db
          .delete(records)
          .where(and(eq(records.ownerId, context.user.id), eq(records.companyId, row.id))),
        db.delete(records).where(cond),
      ]);
    else await db.delete(records).where(cond);
    return { ok: true };
  }),
  restore: authed
    .input(
      z.object({
        rows: z
          .array(
            payload.extend({
              id: z.string(),
              createdAt: z.string().optional(),
              updatedAt: z.string().optional(),
            }),
          )
          .max(5000),
      }),
    )
    .handler(async ({ input, context }) => {
      const scope = await accessScope(context.user.id);
      if (!scope.manager) throw new ORPCError("FORBIDDEN");
      const ids = new Set(input.rows.filter((r) => r.kind === "company").map((r) => r.id));
      for (const r of input.rows) {
        validate(r.kind, r.data);
        if (r.kind !== "company" && (!r.companyId || !ids.has(r.companyId)))
          throw new ORPCError("BAD_REQUEST", { message: "النسخة تحتوي على ارتباط شركة غير صحيح" });
      }
      if (new Set(input.rows.map((r) => r.id)).size !== input.rows.length)
        throw new ORPCError("BAD_REQUEST");
      const existing = await db.select().from(records).where(eq(records.ownerId, context.user.id));
      if (existing.length)
        throw new ORPCError("CONFLICT", {
          message:
            "استعادة النسخة الكاملة متاحة لحساب فارغ فقط لحماية بياناتك. استخدم استيراد CSV لإضافة شركات.",
        });
      for (const r of input.rows) {
        for (const k of ["createdAt", "updatedAt"])
          if ((r as any)[k] && !Number.isFinite(Date.parse((r as any)[k])))
            throw new ORPCError("BAD_REQUEST", { message: "تاريخ النسخة غير صحيح" });
        for (const [key, expected] of [
          ["visitId", "visit"],
          ["opportunityId", "opportunity"],
        ])
          if (
            r.data[key] &&
            !input.rows.some(
              (x) => x.id === r.data[key] && x.kind === expected && x.companyId === r.companyId,
            )
          )
            throw new ORPCError("BAD_REQUEST", { message: "ارتباط غير صحيح في النسخة" });
      }
      const now = new Date().toISOString();
      const mapping = new Map(input.rows.map((r) => [r.id, crypto.randomUUID()]));
      const remap = (d: Record<string, any>) =>
        Object.fromEntries(
          Object.entries(d).map(([k, v]) => [
            k,
            k.endsWith("Id") && typeof v === "string" ? mapping.get(v) || v : v,
          ]),
        );
      if (input.rows.length)
        await db.batch(
          input.rows.map((r) =>
            db.insert(records).values({
              id: mapping.get(r.id)!,
              ownerId: context.user.id,
              kind: r.kind,
              companyId: r.companyId ? mapping.get(r.companyId)! : null,
              data: remap(r.data),
              createdAt: r.createdAt || now,
              updatedAt: r.updatedAt || now,
            }),
          ) as any,
        );
      return { count: input.rows.length };
    }),
};
