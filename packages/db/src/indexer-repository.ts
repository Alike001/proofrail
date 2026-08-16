import {
  computePairKey,
  normalizeCik,
  normalizeLei
} from "@proofrail/evidence-core";
import { and, eq, sql } from "drizzle-orm";

import type { ProofRailDatabase } from "./client.js";
import { DatabaseInvariantError } from "./errors.js";
import {
  chainEvents,
  currentReceipts,
  indexerCursors,
  receipts
} from "./schema.js";
import type { ChainEventDocument } from "./schema.js";

type HexString = `0x${string}`;

export interface PublishedReceiptEvent {
  readonly chainId: number;
  readonly contractAddress: HexString;
  readonly transactionHash: HexString;
  readonly logIndex: number;
  readonly blockNumber: bigint;
  readonly blockHash: HexString;
  readonly packetHash: HexString;
  readonly pairKey: HexString;
  readonly nonce: HexString;
  readonly cik: string;
  readonly lei: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly schemaVersion: number;
  readonly policyVersion: number;
  readonly publisherAddress: HexString;
  readonly attestorAddress: HexString;
  readonly rawEvent: ChainEventDocument;
}

export interface ReceiptEventBatch {
  readonly chainId: number;
  readonly contractAddress: HexString;
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  readonly toBlockHash: HexString;
  readonly events: readonly PublishedReceiptEvent[];
}

export interface ReceiptBatchResult {
  readonly insertedEvents: number;
  readonly duplicateEvents: number;
  readonly alreadyProcessed: boolean;
}

export interface IndexerCursorRecord {
  readonly lastProcessedBlock: bigint;
  readonly lastVerifiedBlockHash: HexString;
}

export interface ResetIndexResult {
  readonly deletedEvents: number;
  readonly deletedCursor: boolean;
}

export class IndexerRepository {
  readonly #db: ProofRailDatabase;

  constructor(db: ProofRailDatabase) {
    this.#db = db;
  }

  async getCursor(
    chainId: number,
    contractAddress: HexString
  ): Promise<IndexerCursorRecord | null> {
    assertPositiveInteger(chainId, "chain ID");
    assertAddress(contractAddress, "contract address");
    const [cursor] = await this.#db
      .select({
        lastProcessedBlock: indexerCursors.lastProcessedBlock,
        lastVerifiedBlockHash: indexerCursors.lastVerifiedBlockHash
      })
      .from(indexerCursors)
      .where(
        and(
          eq(indexerCursors.chainId, chainId),
          eq(indexerCursors.contractAddress, contractAddress)
        )
      )
      .limit(1);
    return cursor === undefined
      ? null
      : {
          lastProcessedBlock: cursor.lastProcessedBlock,
          lastVerifiedBlockHash: cursor.lastVerifiedBlockHash as HexString
        };
  }

  async resetContractIndex(
    chainId: number,
    contractAddress: HexString
  ): Promise<ResetIndexResult> {
    assertPositiveInteger(chainId, "chain ID");
    assertAddress(contractAddress, "contract address");
    return this.#db.transaction(async (transaction) => {
      const deletedEvents = await transaction
        .delete(chainEvents)
        .where(
          and(
            eq(chainEvents.chainId, chainId),
            eq(chainEvents.contractAddress, contractAddress)
          )
        )
        .returning({ id: chainEvents.id });
      const deletedCursor = await transaction
        .delete(indexerCursors)
        .where(
          and(
            eq(indexerCursors.chainId, chainId),
            eq(indexerCursors.contractAddress, contractAddress)
          )
        )
        .returning({ chainId: indexerCursors.chainId });
      return {
        deletedEvents: deletedEvents.length,
        deletedCursor: deletedCursor.length === 1
      };
    });
  }

  async ingestBatch(batch: ReceiptEventBatch): Promise<ReceiptBatchResult> {
    assertReceiptBatch(batch);
    return this.#db.transaction(async (transaction) => {
      const [cursor] = await transaction
        .select()
        .from(indexerCursors)
        .where(
          and(
            eq(indexerCursors.chainId, batch.chainId),
            eq(indexerCursors.contractAddress, batch.contractAddress)
          )
        )
        .for("update")
        .limit(1);

      if (cursor !== undefined && batch.toBlock <= cursor.lastProcessedBlock) {
        if (
          batch.toBlock === cursor.lastProcessedBlock &&
          batch.toBlockHash === cursor.lastVerifiedBlockHash
        ) {
          await assertPreviouslyProcessedEvents(transaction, batch.events);
          return {
            insertedEvents: 0,
            duplicateEvents: batch.events.length,
            alreadyProcessed: true
          };
        }
        throw new DatabaseInvariantError(
          "The indexer batch is older than the committed cursor or has a different block hash."
        );
      }
      if (
        cursor !== undefined &&
        batch.fromBlock !== cursor.lastProcessedBlock + 1n
      ) {
        throw new DatabaseInvariantError(
          "The indexer batch does not start at the block after the committed cursor."
        );
      }

      let insertedEvents = 0;
      let duplicateEvents = 0;
      for (const event of batch.events) {
        const [inserted] = await transaction
          .insert(chainEvents)
          .values(chainEventValues(event))
          .onConflictDoNothing({
            target: [
              chainEvents.chainId,
              chainEvents.transactionHash,
              chainEvents.logIndex
            ]
          })
          .returning({ id: chainEvents.id });

        if (inserted === undefined) {
          await assertPreviouslyProcessedEvents(transaction, [event]);
          duplicateEvents += 1;
          continue;
        }

        await transaction.insert(receipts).values({
          packetHash: event.packetHash,
          chainEventId: inserted.id,
          pairKey: event.pairKey,
          cik: event.cik,
          lei: event.lei,
          issuedAt: fromUnixSeconds(event.issuedAt),
          expiresAt: fromUnixSeconds(event.expiresAt),
          schemaVersion: event.schemaVersion,
          policyVersion: event.policyVersion,
          publisherAddress: event.publisherAddress,
          attestorAddress: event.attestorAddress,
          transactionHash: event.transactionHash,
          logIndex: event.logIndex,
          blockNumber: event.blockNumber,
          blockHash: event.blockHash
        });
        await transaction
          .insert(currentReceipts)
          .values({
            pairKey: event.pairKey,
            packetHash: event.packetHash,
            blockNumber: event.blockNumber,
            logIndex: event.logIndex
          })
          .onConflictDoUpdate({
            target: currentReceipts.pairKey,
            set: {
              packetHash: event.packetHash,
              blockNumber: event.blockNumber,
              logIndex: event.logIndex,
              updatedAt: new Date()
            },
            setWhere: sql`
              ${currentReceipts.blockNumber} < ${event.blockNumber}
              or (
                ${currentReceipts.blockNumber} = ${event.blockNumber}
                and ${currentReceipts.logIndex} < ${event.logIndex}
              )
            `
          });
        insertedEvents += 1;
      }

      if (cursor === undefined) {
        await transaction.insert(indexerCursors).values({
          chainId: batch.chainId,
          contractAddress: batch.contractAddress,
          lastProcessedBlock: batch.toBlock,
          lastVerifiedBlockHash: batch.toBlockHash
        });
      } else {
        await transaction
          .update(indexerCursors)
          .set({
            lastProcessedBlock: batch.toBlock,
            lastVerifiedBlockHash: batch.toBlockHash,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(indexerCursors.chainId, batch.chainId),
              eq(indexerCursors.contractAddress, batch.contractAddress)
            )
          );
      }

      return { insertedEvents, duplicateEvents, alreadyProcessed: false };
    });
  }

  async findReceipt(packetHash: HexString) {
    const [row] = await this.#db
      .select()
      .from(receipts)
      .where(eq(receipts.packetHash, packetHash))
      .limit(1);
    return row ?? null;
  }
}

export function assertReceiptBatch(batch: ReceiptEventBatch): void {
  assertPositiveInteger(batch.chainId, "chain ID");
  assertAddress(batch.contractAddress, "contract address");
  assertHash(batch.toBlockHash, "cursor block hash");
  if (batch.fromBlock < 0n || batch.toBlock < batch.fromBlock) {
    throw new DatabaseInvariantError("The indexer block range is invalid.");
  }

  const locations = new Set<string>();
  const packets = new Set<string>();
  for (const event of batch.events) {
    assertEvent(event);
    if (
      event.chainId !== batch.chainId ||
      event.contractAddress !== batch.contractAddress ||
      event.blockNumber < batch.fromBlock ||
      event.blockNumber > batch.toBlock
    ) {
      throw new DatabaseInvariantError(
        "An event does not belong to the supplied chain, contract, or block range."
      );
    }
    const location = `${String(event.chainId)}:${event.transactionHash}:${String(event.logIndex)}`;
    if (locations.has(location) || packets.has(event.packetHash)) {
      throw new DatabaseInvariantError("The indexer batch contains a duplicate event or packet.");
    }
    locations.add(location);
    packets.add(event.packetHash);
  }
}

function assertEvent(event: PublishedReceiptEvent): void {
  assertPositiveInteger(event.chainId, "event chain ID");
  assertAddress(event.contractAddress, "event contract address");
  assertHash(event.transactionHash, "transaction hash");
  assertHash(event.blockHash, "block hash");
  assertHash(event.packetHash, "packet hash");
  assertHash(event.pairKey, "pair key");
  assertHash(event.nonce, "nonce");
  assertAddress(event.publisherAddress, "publisher address");
  assertAddress(event.attestorAddress, "attestor address");
  assertNonNegativeInteger(event.logIndex, "log index");
  assertPositiveInteger(event.schemaVersion, "schema version");
  assertPositiveInteger(event.policyVersion, "policy version");
  if (event.blockNumber < 0n) {
    throw new DatabaseInvariantError("The event block number cannot be negative.");
  }
  if (
    !Number.isSafeInteger(event.issuedAt) ||
    !Number.isSafeInteger(event.expiresAt) ||
    event.issuedAt <= 0 ||
    event.expiresAt <= event.issuedAt
  ) {
    throw new DatabaseInvariantError("The event validity window is invalid.");
  }
  try {
    const cik = normalizeCik(event.cik);
    const lei = normalizeLei(event.lei);
    if (computePairKey(cik, lei) !== event.pairKey) {
      throw new DatabaseInvariantError("The event pair key does not match its CIK and LEI.");
    }
  } catch (error) {
    if (error instanceof DatabaseInvariantError) {
      throw error;
    }
    throw new DatabaseInvariantError("The event contains an invalid CIK or LEI.", {
      cause: error
    });
  }
}

async function assertPreviouslyProcessedEvents(
  transaction: Parameters<Parameters<ProofRailDatabase["transaction"]>[0]>[0],
  events: readonly PublishedReceiptEvent[]
): Promise<void> {
  for (const event of events) {
    const [existing] = await transaction
      .select()
      .from(chainEvents)
      .where(
        and(
          eq(chainEvents.chainId, event.chainId),
          eq(chainEvents.transactionHash, event.transactionHash),
          eq(chainEvents.logIndex, event.logIndex)
        )
      )
      .limit(1);
    if (existing === undefined || !sameEvent(existing, event)) {
      throw new DatabaseInvariantError(
        "A duplicate event location contains different protected event data."
      );
    }
    const [existingReceipt] = await transaction
      .select()
      .from(receipts)
      .where(eq(receipts.chainEventId, existing.id))
      .limit(1);
    if (existingReceipt === undefined || !sameReceipt(existingReceipt, event)) {
      throw new DatabaseInvariantError(
        "A duplicate event location contains different decoded receipt data."
      );
    }
  }
}

function sameEvent(
  existing: typeof chainEvents.$inferSelect,
  event: PublishedReceiptEvent
): boolean {
  return (
    existing.contractAddress === event.contractAddress &&
    existing.blockNumber === event.blockNumber &&
    existing.blockHash === event.blockHash &&
    existing.packetHash === event.packetHash &&
    existing.pairKey === event.pairKey &&
    existing.nonce === event.nonce
  );
}

function sameReceipt(
  existing: typeof receipts.$inferSelect,
  event: PublishedReceiptEvent
): boolean {
  return (
    existing.packetHash === event.packetHash &&
    existing.pairKey === event.pairKey &&
    existing.cik === event.cik &&
    existing.lei === event.lei &&
    existing.issuedAt.valueOf() === event.issuedAt * 1_000 &&
    existing.expiresAt.valueOf() === event.expiresAt * 1_000 &&
    existing.schemaVersion === event.schemaVersion &&
    existing.policyVersion === event.policyVersion &&
    existing.publisherAddress === event.publisherAddress &&
    existing.attestorAddress === event.attestorAddress &&
    existing.transactionHash === event.transactionHash &&
    existing.logIndex === event.logIndex &&
    existing.blockNumber === event.blockNumber &&
    existing.blockHash === event.blockHash
  );
}

function chainEventValues(event: PublishedReceiptEvent) {
  return {
    chainId: event.chainId,
    contractAddress: event.contractAddress,
    transactionHash: event.transactionHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    blockHash: event.blockHash,
    packetHash: event.packetHash,
    pairKey: event.pairKey,
    nonce: event.nonce,
    rawEvent: event.rawEvent
  };
}

function assertHash(value: string, label: string): void {
  if (!/^0x[0-9a-f]{64}$/u.test(value)) {
    throw new DatabaseInvariantError(`The ${label} must be a lowercase 32-byte hex value.`);
  }
}

function assertAddress(value: string, label: string): void {
  if (!/^0x[0-9a-f]{40}$/u.test(value)) {
    throw new DatabaseInvariantError(`The ${label} must be a lowercase EVM address.`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DatabaseInvariantError(`The ${label} must be a positive safe integer.`);
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DatabaseInvariantError(`The ${label} must be a non-negative safe integer.`);
  }
}

function fromUnixSeconds(value: number): Date {
  return new Date(value * 1_000);
}
