ALTER TABLE "receipts" DROP CONSTRAINT "receipts_cik_check";--> statement-breakpoint
ALTER TABLE "current_receipts" ADD CONSTRAINT "current_receipts_pair_key_check" CHECK ("current_receipts"."pair_key" ~ '^0x[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "current_receipts" ADD CONSTRAINT "current_receipts_packet_hash_check" CHECK ("current_receipts"."packet_hash" ~ '^0x[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "current_receipts" ADD CONSTRAINT "current_receipts_block_check" CHECK ("current_receipts"."block_number" >= 0);--> statement-breakpoint
ALTER TABLE "current_receipts" ADD CONSTRAINT "current_receipts_log_check" CHECK ("current_receipts"."log_index" >= 0);--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_pair_key_check" CHECK ("receipts"."pair_key" ~ '^0x[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_publisher_check" CHECK ("receipts"."publisher_address" ~ '^0x[0-9a-f]{40}$');--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_attestor_check" CHECK ("receipts"."attestor_address" ~ '^0x[0-9a-f]{40}$');--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transaction_hash_check" CHECK ("receipts"."transaction_hash" ~ '^0x[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_log_index_check" CHECK ("receipts"."log_index" >= 0);--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_block_number_check" CHECK ("receipts"."block_number" >= 0);--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_block_hash_check" CHECK ("receipts"."block_hash" ~ '^0x[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_cik_check" CHECK ("receipts"."cik" ~ '^[0-9]{10}$' and "receipts"."cik" <> '0000000000');