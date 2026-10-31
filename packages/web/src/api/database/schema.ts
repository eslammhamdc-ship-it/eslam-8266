import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";
export * from "./auth-schema";
export const records = sqliteTable(
  "crm_records",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind").notNull(),
    companyId: text("company_id"),
    data: text("data", { mode: "json" }).$type<Record<string, any>>().notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("crm_owner").on(t.ownerId)],
);

 
/** Branch membership is authoritative for API authorization, not UI visibility. */
export const teamMemberships = sqliteTable(
  "team_memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    department: text("department", { enum: ["branch", "sales", "aviation"] }).notNull(),
    role: text("role", { enum: ["branch_manager", "department_manager", "sales_rep", "aviation_agent"] }).notNull(),
    active: text("active", { enum: ["active", "suspended"] }).notNull().default("active"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("team_memberships_user_unique").on(t.userId),
    index("team_memberships_department_role").on(t.department, t.role),
  ],
);

export const serviceRequests = sqliteTable(
  "service_requests",
  {
    id: text("id").primaryKey(),
    department: text("department", { enum: ["aviation"] }).notNull().default("aviation"),
    companyRecordId: text("company_record_id"),
    createdBy: text("created_by").notNull(),
    assignedTo: text("assigned_to"),
    status: text("status", { enum: ["new", "assigned", "in_progress", "waiting_customer", "completed", "cancelled"] }).notNull().default("new"),
    requestType: text("request_type").notNull(),
    details: text("details", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("service_requests_assignee").on(t.assignedTo, t.status),
    index("service_requests_creator").on(t.createdBy, t.createdAt),
    index("service_requests_company").on(t.companyRecordId),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: text("before_state", { mode: "json" }).$type<Record<string, unknown> | null>(),
    after: text("after_state", { mode: "json" }).$type<Record<string, unknown> | null>(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("audit_logs_actor_time").on(t.actorUserId, t.createdAt),
    index("audit_logs_entity").on(t.entityType, t.entityId),
  ],
);
