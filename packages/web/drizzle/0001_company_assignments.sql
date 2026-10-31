CREATE TABLE `company_assignments` (
  `id` text PRIMARY KEY NOT NULL,
  `company_record_id` text NOT NULL REFERENCES `crm_records`(`id`) ON DELETE CASCADE,
  `assignee_user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `assigned_by` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_assignments_company_unique` ON `company_assignments` (`company_record_id`);
--> statement-breakpoint
CREATE INDEX `company_assignments_assignee` ON `company_assignments` (`assignee_user_id`);
