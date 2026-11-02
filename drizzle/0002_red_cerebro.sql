ALTER TABLE `documents` ADD `parent_id` text REFERENCES documents(id);--> statement-breakpoint
CREATE INDEX `idx_documents_parent` ON `documents` (`parent_id`);