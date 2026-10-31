CREATE TABLE `team_memberships` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `department` text NOT NULL,
  `role` text NOT NULL,
  `active` text DEFAULT 'active' NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_memberships_user_unique` ON `team_memberships` (`user_id`);
--> statement-breakpoint
CREATE INDEX `team_memberships_department_role` ON `team_memberships` (`department`, `role`);
--> statement-breakpoint
CREATE TABLE `service_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `department` text DEFAULT 'aviation' NOT NULL,
  `company_record_id` text,
  `created_by` text NOT NULL,
  `assigned_to` text,
  `status` text DEFAULT 'new' NOT NULL,
  `request_type` text NOT NULL,
  `details` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `service_requests_assignee` ON `service_requests` (`assigned_to`, `status`);
--> statement-breakpoint
CREATE INDEX `service_requests_creator` ON `service_requests` (`created_by`, `created_at`);
--> statement-breakpoint
CREATE INDEX `service_requests_company` ON `service_requests` (`company_record_id`);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_user_id` text NOT NULL,
  `action` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `before_state` text,
  `after_state` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_actor_time` ON `audit_logs` (`actor_user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity` ON `audit_logs` (`entity_type`, `entity_id`);
