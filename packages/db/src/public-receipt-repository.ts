import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { ProofRailDatabase } from "./client.js";
import { DatabaseInvariantError } from "./errors.js";
import {
  chainEvents,
  currentReceipts,
  evidenceDrafts,
  receipts,
  sourceSnapshots
} from "./schema.js";

type HexString = `0x${string}`;

export interface PublicReceiptBundleRecord {
  readonly chainEvent: {
    readonly contractAddress: string;
  };
  readonly currentPacketHash: string | null;
  readonly draft: {
    readonly canonicalPacket: string;
    readonly cik: string;
    readonly expiresAt: Date;
    readonly issuedAt: Date;
    readonly lei: string;
    readonly packet: typeof evidenceDrafts.$inferSelect.packet;
    readonly packetHash: string;
    readonly pairKey: string;
  };
  readonly gleifSnapshot: SnapshotRecord;
  readonly receipt: {
    readonly attestorAddress: string;
    readonly blockHash: string;
    readonly blockNumber: bigint;
    readonly cik: string;
    readonly expiresAt: Date;
    readonly issuedAt: Date;
    readonly lei: string;
    readonly packetHash: string;
    readonly pairKey: string;
    readonly policyVersion: number;
    readonly publisherAddress: string;
    readonly schemaVersion: number;
    readonly transactionHash: string;
  };
  readonly secSnapshot: SnapshotRecord;
}

interface SnapshotRecord {
  readonly body: Uint8Array;
  readonly responseHeaders: typeof sourceSnapshots.$inferSelect.responseHeaders;
  readonly snapshotHash: string;
  readonly source: typeof sourceSnapshots.$inferSelect.source;
}

const secSnapshots = alias(sourceSnapshots, "receipt_sec_snapshot");
const gleifSnapshots = alias(sourceSnapshots, "receipt_gleif_snapshot");

export class PublicReceiptRepository {
  readonly #db: ProofRailDatabase;

  constructor(db: ProofRailDatabase) {
    this.#db = db;
  }

  async findBundle(
    packetHash: HexString,
    chainId: number,
    contractAddress: HexString
  ): Promise<PublicReceiptBundleRecord | null> {
    assertHash(packetHash);
    assertChain(chainId);
    assertAddress(contractAddress);
    const [row] = await this.#db
      .select({
        chainEvent: {
          contractAddress: chainEvents.contractAddress
        },
        currentPacketHash: currentReceipts.packetHash,
        draft: {
          canonicalPacket: evidenceDrafts.canonicalPacket,
          cik: evidenceDrafts.cik,
          expiresAt: evidenceDrafts.expiresAt,
          issuedAt: evidenceDrafts.issuedAt,
          lei: evidenceDrafts.lei,
          packet: evidenceDrafts.packet,
          packetHash: evidenceDrafts.packetHash,
          pairKey: evidenceDrafts.pairKey
        },
        gleifSnapshot: {
          body: gleifSnapshots.body,
          responseHeaders: gleifSnapshots.responseHeaders,
          snapshotHash: gleifSnapshots.snapshotHash,
          source: gleifSnapshots.source
        },
        receipt: {
          attestorAddress: receipts.attestorAddress,
          blockHash: receipts.blockHash,
          blockNumber: receipts.blockNumber,
          cik: receipts.cik,
          expiresAt: receipts.expiresAt,
          issuedAt: receipts.issuedAt,
          lei: receipts.lei,
          packetHash: receipts.packetHash,
          pairKey: receipts.pairKey,
          policyVersion: receipts.policyVersion,
          publisherAddress: receipts.publisherAddress,
          schemaVersion: receipts.schemaVersion,
          transactionHash: receipts.transactionHash
        },
        secSnapshot: {
          body: secSnapshots.body,
          responseHeaders: secSnapshots.responseHeaders,
          snapshotHash: secSnapshots.snapshotHash,
          source: secSnapshots.source
        }
      })
      .from(receipts)
      .innerJoin(evidenceDrafts, eq(receipts.packetHash, evidenceDrafts.packetHash))
      .innerJoin(chainEvents, eq(receipts.chainEventId, chainEvents.id))
      .innerJoin(secSnapshots, eq(evidenceDrafts.secSnapshotId, secSnapshots.id))
      .innerJoin(gleifSnapshots, eq(evidenceDrafts.gleifSnapshotId, gleifSnapshots.id))
      .leftJoin(currentReceipts, eq(receipts.pairKey, currentReceipts.pairKey))
      .where(
        and(
          eq(receipts.packetHash, packetHash),
          eq(chainEvents.chainId, chainId),
          eq(chainEvents.contractAddress, contractAddress)
        )
      )
      .limit(1);
    return row ?? null;
  }
}

function assertHash(value: string): void {
  if (!/^0x[0-9a-f]{64}$/u.test(value)) {
    throw new DatabaseInvariantError("The receipt packet hash is invalid.");
  }
}

function assertAddress(value: string): void {
  if (!/^0x[0-9a-f]{40}$/u.test(value)) {
    throw new DatabaseInvariantError("The receipt registry address is invalid.");
  }
}

function assertChain(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DatabaseInvariantError("The receipt chain ID is invalid.");
  }
}
