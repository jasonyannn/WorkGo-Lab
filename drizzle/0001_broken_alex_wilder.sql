CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`kind` text DEFAULT 'text' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`position` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_blocks_document_position` ON `blocks` (`document_id`,`position`);--> statement-breakpoint
ALTER TABLE `workspace_members` ADD `role` text DEFAULT 'member' NOT NULL;