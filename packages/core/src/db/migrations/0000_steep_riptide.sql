CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`test_result_id` text NOT NULL,
	`action` text NOT NULL,
	`comment` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`test_result_id`) REFERENCES `test_results`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`total_tests` integer NOT NULL,
	`passed` integer NOT NULL,
	`failed` integer NOT NULL,
	`config_snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `test_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`suite_id` text,
	`test_id` text NOT NULL,
	`quality_score` integer NOT NULL,
	`fidelity_score` integer NOT NULL,
	`quality_reasoning` text NOT NULL,
	`fidelity_reasoning` text NOT NULL,
	`passed` integer NOT NULL,
	`conversation` text NOT NULL,
	`reference_conversation` text NOT NULL,
	`config_snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
