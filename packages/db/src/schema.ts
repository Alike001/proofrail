import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import type { EvidencePacketV1 } from "@proofrail/evidence-core";
import type { CapturedResponseHeaders } from "@proofrail/source-service";

export type EvidenceSourceName = "SEC" | "GLEIF";
export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface SignedEnvelopeDocument {
  readonly domain: Readonly<Record<string, JsonValue>>;
  readonly message: Readonly<Record<string, JsonValue>>;
  readonly primaryType: string;
  readonly types: Readonly<Record<string, readonly Readonly<Record<string, string>>[]>>;
}

export type ChainEventDocument = Readonly<Record<string, JsonValue>>;

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value) {
    return new Uint8Array(value);
  },
  toDriver(value) {
    return Buffer.from(value);
  }
});

const ZERO_HASH_SQL = sql.raw("'0x0000000000000000000000000000000000000000000000000000000000000000'");

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const sourceSnapshots = pgTable(
  "source_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: text("source").$type<EvidenceSourceName>().notNull(),
    sourceUrl: text("source_url").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    responseHeaders: jsonb("response_headers")
      .$type<CapturedResponseHeaders>()
      .notNull(),
    body: bytea("body").notNull(),
    snapshotHash: char("snapshot_hash", { length: 66 }).notNull(),
    createdAt
  },
  (table) => [
    check("source_snapshots_source_check", sql`${table.source} in ('SEC', 'GLEIF')`),
    check("source_snapshots_body_check", sql`octet_length(${table.body}) > 0`),
    check(
      "source_snapshots_hash_check",
      sql`${table.snapshotHash} ~ '^0x[0-9a-f]{64}$'`
    ),
    index("source_snapshots_hash_idx").on(table.source, table.snapshotHash),
    index("source_snapshots_retrieved_at_idx").on(table.retrievedAt)
  ]
);

export const evidenceDrafts = pgTable(
  "evidence_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    secSnapshotId: uuid("sec_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id),
    gleifSnapshotId: uuid("gleif_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id),
    chainId: bigint("chain_id", { mode: "number" }).notNull(),
    registryAddress: char("registry_address", { length: 42 }).notNull(),
    cik: char("cik", { length: 10 }).notNull(),
    lei: char("lei", { length: 20 }).notNull(),
    pairKey: char("pair_key", { length: 66 }).notNull(),
    normalizedSecName: text("normalized_sec_name"),
    normalizedGleifName: text("normalized_gleif_name"),
    policyPassed: boolean("policy_passed").notNull(),
    policyResult: jsonb("policy_result")
      .$type<EvidencePacketV1["policy"]>()
      .notNull(),
    packet: jsonb("packet").$type<EvidencePacketV1>().notNull(),
    canonicalPacket: text("canonical_packet").notNull(),
    packetHash: char("packet_hash", { length: 66 }).notNull(),
    nonce: char("nonce", { length: 66 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt
  },
  (table) => [
    uniqueIndex("evidence_drafts_packet_hash_uidx").on(table.packetHash),
    uniqueIndex("evidence_drafts_nonce_uidx").on(table.nonce),
    check("evidence_drafts_chain_id_check", sql`${table.chainId} > 0`),
    check(
      "evidence_drafts_registry_check",
      sql`${table.registryAddress} ~ '^0x[0-9a-f]{40}$'`
    ),
    check(
      "evidence_drafts_cik_check",
      sql`${table.cik} ~ '^[0-9]{10}$' and ${table.cik} <> '0000000000'`
    ),
    check(
      "evidence_drafts_lei_check",
      sql`${table.lei} ~ '^[A-Z0-9]{18}[0-9]{2}$'`
    ),
    check(
      "evidence_drafts_pair_key_check",
      sql`${table.pairKey} ~ '^0x[0-9a-f]{64}$'`
    ),
    check(
      "evidence_drafts_packet_hash_check",
      sql`${table.packetHash} ~ '^0x[0-9a-f]{64}$'`
    ),
    check(
      "evidence_drafts_nonce_check",
      sql`${table.nonce} ~ '^0x[0-9a-f]{64}$' and ${table.nonce} <> ${ZERO_HASH_SQL}`
    ),
    check(
      "evidence_drafts_snapshot_distinct_check",
      sql`${table.secSnapshotId} <> ${table.gleifSnapshotId}`
    ),
    check(
      "evidence_drafts_expiry_check",
      sql`${table.expiresAt} > ${table.issuedAt}`
    )
  ]
);

export const signedEnvelopes = pgTable(
  "signed_envelopes",
  {
    packetHash: char("packet_hash", { length: 66 })
      .primaryKey()
      .references(() => evidenceDrafts.packetHash),
    typedData: jsonb("typed_data").$type<SignedEnvelopeDocument>().notNull(),
    signature: char("signature", { length: 132 }).notNull(),
    signerAddress: char("signer_address", { length: 42 }).notNull(),
    publisherAddress: char("publisher_address", { length: 42 }).notNull(),
    createdAt
  },
  (table) => [
    check(
      "signed_envelopes_signature_check",
      sql`${table.signature} ~ '^0x[0-9a-f]{130}$'`
    ),
    check(
      "signed_envelopes_signer_check",
      sql`${table.signerAddress} ~ '^0x[0-9a-f]{40}$'`
    ),
    check(
      "signed_envelopes_publisher_check",
      sql`${table.publisherAddress} ~ '^0x[0-9a-f]{40}$'`
    )
  ]
);

export const chainEvents = pgTable(
  "chain_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chainId: bigint("chain_id", { mode: "number" }).notNull(),
    contractAddress: char("contract_address", { length: 42 }).notNull(),
    transactionHash: char("transaction_hash", { length: 66 }).notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockHash: char("block_hash", { length: 66 }).notNull(),
    packetHash: char("packet_hash", { length: 66 }).notNull(),
    pairKey: char("pair_key", { length: 66 }).notNull(),
    nonce: char("nonce", { length: 66 }).notNull(),
    rawEvent: jsonb("raw_event").$type<ChainEventDocument>().notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    uniqueIndex("chain_events_location_uidx").on(
      table.chainId,
      table.transactionHash,
      table.logIndex
    ),
    uniqueIndex("chain_events_packet_hash_uidx").on(
      table.chainId,
      table.contractAddress,
      table.packetHash
    ),
    index("chain_events_block_idx").on(
      table.chainId,
      table.contractAddress,
      table.blockNumber
    ),
    check("chain_events_chain_id_check", sql`${table.chainId} > 0`),
    check("chain_events_log_index_check", sql`${table.logIndex} >= 0`),
    check("chain_events_block_number_check", sql`${table.blockNumber} >= 0`),
    check(
      "chain_events_contract_check",
      sql`${table.contractAddress} ~ '^0x[0-9a-f]{40}$'`
    ),
    check(
      "chain_events_transaction_hash_check",
      sql`${table.transactionHash} ~ '^0x[0-9a-f]{64}$'`
    ),
    check(
      "chain_events_block_hash_check",
      sql`${table.blockHash} ~ '^0x[0-9a-f]{64}$'`
    ),
    check(
      "chain_events_packet_hash_check",
      sql`${table.packetHash} ~ '^0x[0-9a-f]{64}$'`
    ),
    check(
      "chain_events_pair_key_check",
      sql`${table.pairKey} ~ '^0x[0-9a-f]{64}$'`
    ),
    check("chain_events_nonce_check", sql`${table.nonce} ~ '^0x[0-9a-f]{64}$'`)
  ]
);

export const receipts = pgTable(
  "receipts",
  {
    packetHash: char("packet_hash", { length: 66 }).primaryKey(),
    chainEventId: uuid("chain_event_id")
      .notNull()
      .unique()
      .references(() => chainEvents.id, { onDelete: "cascade" }),
    pairKey: char("pair_key", { length: 66 }).notNull(),
    cik: char("cik", { length: 10 }).notNull(),
    lei: char("lei", { length: 20 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    schemaVersion: integer("schema_version").notNull(),
    policyVersion: integer("policy_version").notNull(),
    publisherAddress: char("publisher_address", { length: 42 }).notNull(),
    attestorAddress: char("attestor_address", { length: 42 }).notNull(),
    transactionHash: char("transaction_hash", { length: 66 }).notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockHash: char("block_hash", { length: 66 }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    index("receipts_pair_order_idx").on(
      table.pairKey,
      table.blockNumber,
      table.logIndex
    ),
    check(
      "receipts_packet_hash_check",
      sql`${table.packetHash} ~ '^0x[0-9a-f]{64}$'`
    ),
    check(
      "receipts_pair_key_check",
      sql`${table.pairKey} ~ '^0x[0-9a-f]{64}$'`
    ),
    check(
      "receipts_cik_check",
      sql`${table.cik} ~ '^[0-9]{10}$' and ${table.cik} <> '0000000000'`
    ),
    check("receipts_lei_check", sql`${table.lei} ~ '^[A-Z0-9]{18}[0-9]{2}$'`),
    check("receipts_expiry_check", sql`${table.expiresAt} > ${table.issuedAt}`),
    check("receipts_versions_check", sql`${table.schemaVersion} > 0 and ${table.policyVersion} > 0`),
    check(
      "receipts_publisher_check",
      sql`${table.publisherAddress} ~ '^0x[0-9a-f]{40}$'`
    ),
    check(
      "receipts_attestor_check",
      sql`${table.attestorAddress} ~ '^0x[0-9a-f]{40}$'`
    ),
    check(
      "receipts_transaction_hash_check",
      sql`${table.transactionHash} ~ '^0x[0-9a-f]{64}$'`
    ),
    check("receipts_log_index_check", sql`${table.logIndex} >= 0`),
    check("receipts_block_number_check", sql`${table.blockNumber} >= 0`),
    check(
      "receipts_block_hash_check",
      sql`${table.blockHash} ~ '^0x[0-9a-f]{64}$'`
    )
  ]
);

export const currentReceipts = pgTable(
  "current_receipts",
  {
    pairKey: char("pair_key", { length: 66 }).primaryKey(),
    packetHash: char("packet_hash", { length: 66 })
      .notNull()
      .references(() => receipts.packetHash, { onDelete: "cascade" }),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    logIndex: integer("log_index").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    check(
      "current_receipts_pair_key_check",
      sql`${table.pairKey} ~ '^0x[0-9a-f]{64}$'`
    ),
    check(
      "current_receipts_packet_hash_check",
      sql`${table.packetHash} ~ '^0x[0-9a-f]{64}$'`
    ),
    check("current_receipts_block_check", sql`${table.blockNumber} >= 0`),
    check("current_receipts_log_check", sql`${table.logIndex} >= 0`)
  ]
);

export const indexerCursors = pgTable(
  "indexer_cursors",
  {
    chainId: bigint("chain_id", { mode: "number" }).notNull(),
    contractAddress: char("contract_address", { length: 42 }).notNull(),
    lastProcessedBlock: bigint("last_processed_block", { mode: "bigint" }).notNull(),
    lastVerifiedBlockHash: char("last_verified_block_hash", { length: 66 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.contractAddress] }),
    check("indexer_cursors_chain_id_check", sql`${table.chainId} > 0`),
    check(
      "indexer_cursors_contract_check",
      sql`${table.contractAddress} ~ '^0x[0-9a-f]{40}$'`
    ),
    check(
      "indexer_cursors_block_check",
      sql`${table.lastProcessedBlock} >= 0`
    ),
    check(
      "indexer_cursors_hash_check",
      sql`${table.lastVerifiedBlockHash} ~ '^0x[0-9a-f]{64}$'`
    )
  ]
);
