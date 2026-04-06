ALTER TABLE `feedback` ADD `type` text NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback` ADD `raw_comment` text NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback` ADD `quality_score_correction` integer;--> statement-breakpoint
ALTER TABLE `feedback` ADD `fidelity_score_correction` integer;