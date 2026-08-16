CREATE TABLE "chain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" bigint NOT NULL,
	"contract_address" char(42) NOT NULL,
	"transaction_hash" char(66) NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" char(66) NOT NULL,
	"packet_hash" char(66) NOT NULL,
	"pair_key" char(66) NOT NULL,
	"nonce" char(66) NOT NULL,
	"raw_event" jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chain_events_chain_id_check" CHECK ("chain_events"."chain_id" > 0),
	CONSTRAINT "chain_events_log_index_check" CHECK ("chain_events"."log_index" >= 0),
	CONSTRAINT "chain_events_block_number_check" CHECK ("chain_events"."block_number" >= 0),
	CONSTRAINT "chain_events_contract_check" CHECK ("chain_events"."contract_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "chain_events_transaction_hash_check" CHECK ("chain_events"."transaction_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "chain_events_block_hash_check" CHECK ("chain_events"."block_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "chain_events_packet_hash_check" CHECK ("chain_events"."packet_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "chain_events_pair_key_check" CHECK ("chain_events"."pair_key" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "chain_events_nonce_check" CHECK ("chain_events"."nonce" ~ '^0x[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "current_receipts" (
	"pair_key" char(66) PRIMARY KEY NOT NULL,
	"packet_hash" char(66) NOT NULL,
	"block_number" bigint NOT NULL,
	"log_index" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sec_snapshot_id" uuid NOT NULL,
	"gleif_snapshot_id" uuid NOT NULL,
	"chain_id" bigint NOT NULL,
	"registry_address" char(42) NOT NULL,
	"cik" char(10) NOT NULL,
	"lei" char(20) NOT NULL,
	"pair_key" char(66) NOT NULL,
	"normalized_sec_name" text,
	"normalized_gleif_name" text,
	"policy_passed" boolean NOT NULL,
	"policy_result" jsonb NOT NULL,
	"packet" jsonb NOT NULL,
	"canonical_packet" text NOT NULL,
	"packet_hash" char(66) NOT NULL,
	"nonce" char(66) NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_drafts_chain_id_check" CHECK ("evidence_drafts"."chain_id" > 0),
	CONSTRAINT "evidence_drafts_registry_check" CHECK ("evidence_drafts"."registry_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "evidence_drafts_cik_check" CHECK ("evidence_drafts"."cik" ~ '^[0-9]{10}$' and "evidence_drafts"."cik" <> '0000000000'),
	CONSTRAINT "evidence_drafts_lei_check" CHECK ("evidence_drafts"."lei" ~ '^[A-Z0-9]{18}[0-9]{2}$'),
	CONSTRAINT "evidence_drafts_pair_key_check" CHECK ("evidence_drafts"."pair_key" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "evidence_drafts_packet_hash_check" CHECK ("evidence_drafts"."packet_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "evidence_drafts_nonce_check" CHECK ("evidence_drafts"."nonce" ~ '^0x[0-9a-f]{64}$' and "evidence_drafts"."nonce" <> '0x0000000000000000000000000000000000000000000000000000000000000000'),
	CONSTRAINT "evidence_drafts_snapshot_distinct_check" CHECK ("evidence_drafts"."sec_snapshot_id" <> "evidence_drafts"."gleif_snapshot_id"),
	CONSTRAINT "evidence_drafts_expiry_check" CHECK ("evidence_drafts"."expires_at" > "evidence_drafts"."issued_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_drafts_packet_hash_uidx" ON "evidence_drafts" USING btree ("packet_hash");
--> statement-breakpoint
CREATE TABLE "indexer_cursors" (
	"chain_id" bigint NOT NULL,
	"contract_address" char(42) NOT NULL,
	"last_processed_block" bigint NOT NULL,
	"last_verified_block_hash" char(66) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indexer_cursors_chain_id_contract_address_pk" PRIMARY KEY("chain_id","contract_address"),
	CONSTRAINT "indexer_cursors_chain_id_check" CHECK ("indexer_cursors"."chain_id" > 0),
	CONSTRAINT "indexer_cursors_contract_check" CHECK ("indexer_cursors"."contract_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "indexer_cursors_block_check" CHECK ("indexer_cursors"."last_processed_block" >= 0),
	CONSTRAINT "indexer_cursors_hash_check" CHECK ("indexer_cursors"."last_verified_block_hash" ~ '^0x[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"packet_hash" char(66) PRIMARY KEY NOT NULL,
	"chain_event_id" uuid NOT NULL,
	"pair_key" char(66) NOT NULL,
	"cik" char(10) NOT NULL,
	"lei" char(20) NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"schema_version" integer NOT NULL,
	"policy_version" integer NOT NULL,
	"publisher_address" char(42) NOT NULL,
	"attestor_address" char(42) NOT NULL,
	"transaction_hash" char(66) NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" char(66) NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_chain_event_id_unique" UNIQUE("chain_event_id"),
	CONSTRAINT "receipts_packet_hash_check" CHECK ("receipts"."packet_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "receipts_cik_check" CHECK ("receipts"."cik" ~ '^[0-9]{10}$'),
	CONSTRAINT "receipts_lei_check" CHECK ("receipts"."lei" ~ '^[A-Z0-9]{18}[0-9]{2}$'),
	CONSTRAINT "receipts_expiry_check" CHECK ("receipts"."expires_at" > "receipts"."issued_at"),
	CONSTRAINT "receipts_versions_check" CHECK ("receipts"."schema_version" > 0 and "receipts"."policy_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "signed_envelopes" (
	"packet_hash" char(66) PRIMARY KEY NOT NULL,
	"typed_data" jsonb NOT NULL,
	"signature" char(132) NOT NULL,
	"signer_address" char(42) NOT NULL,
	"publisher_address" char(42) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signed_envelopes_signature_check" CHECK ("signed_envelopes"."signature" ~ '^0x[0-9a-f]{130}$'),
	CONSTRAINT "signed_envelopes_signer_check" CHECK ("signed_envelopes"."signer_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "signed_envelopes_publisher_check" CHECK ("signed_envelopes"."publisher_address" ~ '^0x[0-9a-f]{40}$')
);
--> statement-breakpoint
CREATE TABLE "source_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"response_headers" jsonb NOT NULL,
	"body" "bytea" NOT NULL,
	"snapshot_hash" char(66) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_snapshots_source_check" CHECK ("source_snapshots"."source" in ('SEC', 'GLEIF')),
	CONSTRAINT "source_snapshots_body_check" CHECK (octet_length("source_snapshots"."body") > 0),
	CONSTRAINT "source_snapshots_hash_check" CHECK ("source_snapshots"."snapshot_hash" ~ '^0x[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "current_receipts" ADD CONSTRAINT "current_receipts_packet_hash_receipts_packet_hash_fk" FOREIGN KEY ("packet_hash") REFERENCES "public"."receipts"("packet_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_drafts" ADD CONSTRAINT "evidence_drafts_sec_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("sec_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_drafts" ADD CONSTRAINT "evidence_drafts_gleif_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("gleif_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_chain_event_id_chain_events_id_fk" FOREIGN KEY ("chain_event_id") REFERENCES "public"."chain_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signed_envelopes" ADD CONSTRAINT "signed_envelopes_packet_hash_evidence_drafts_packet_hash_fk" FOREIGN KEY ("packet_hash") REFERENCES "public"."evidence_drafts"("packet_hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chain_events_location_uidx" ON "chain_events" USING btree ("chain_id","transaction_hash","log_index");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_events_packet_hash_uidx" ON "chain_events" USING btree ("chain_id","contract_address","packet_hash");--> statement-breakpoint
CREATE INDEX "chain_events_block_idx" ON "chain_events" USING btree ("chain_id","contract_address","block_number");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_drafts_nonce_uidx" ON "evidence_drafts" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "receipts_pair_order_idx" ON "receipts" USING btree ("pair_key","block_number","log_index");--> statement-breakpoint
CREATE INDEX "source_snapshots_hash_idx" ON "source_snapshots" USING btree ("source","snapshot_hash");--> statement-breakpoint
CREATE INDEX "source_snapshots_retrieved_at_idx" ON "source_snapshots" USING btree ("retrieved_at");
--> statement-breakpoint
CREATE FUNCTION proofrail_reject_immutable_change() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'ProofRail immutable record % cannot be changed', TG_TABLE_NAME
		USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER source_snapshots_immutable
	BEFORE UPDATE OR DELETE ON "source_snapshots"
	FOR EACH ROW EXECUTE FUNCTION proofrail_reject_immutable_change();
--> statement-breakpoint
CREATE TRIGGER evidence_drafts_immutable
	BEFORE UPDATE OR DELETE ON "evidence_drafts"
	FOR EACH ROW EXECUTE FUNCTION proofrail_reject_immutable_change();
--> statement-breakpoint
CREATE TRIGGER signed_envelopes_immutable
	BEFORE UPDATE OR DELETE ON "signed_envelopes"
	FOR EACH ROW EXECUTE FUNCTION proofrail_reject_immutable_change();
