import type {
  IndexerCursorRecord,
  ReceiptBatchResult,
  ReceiptEventBatch,
  ResetIndexResult
} from "@proofrail/db";
import { stringToHex } from "viem";
import type { Address, Hex } from "viem";

import {
  EvidenceReceiptIndexer
} from "../src/index.js";
import type {
  EvidenceReceiptLog,
  IndexedBlock,
  IndexedTransactionReceipt,
  IndexerChainReader,
  IndexerStore
} from "../src/index.js";

const REGISTRY = "0x0000000000000000000000000000000000000677" as const;
const PUBLISHER = "0x0000000000000000000000000000000000000001" as const;
const ATTESTOR = "0x0000000000000000000000000000000000000002" as const;
const LEI = "HWUPKR0MPOU8FGXBT394";

describe("durable evidence receipt indexer", () => {
  it("waits until the confirmation depth exists", async () => {
    const chain = new FakeChain();
    chain.latestBlock = 11n;
    const store = new MemoryStore();
    await expect(indexer(chain, store).runOnce()).resolves.toMatchObject({
      confirmedHead: null,
      status: "waiting-for-confirmations"
    });
    expect(store.batches).toHaveLength(0);
  });

  it("clears derived state when the saved cursor is no longer confirmed", async () => {
    const chain = new FakeChain();
    chain.latestBlock = 11n;
    const store = new MemoryStore({
      lastProcessedBlock: 100n,
      lastVerifiedBlockHash: blockHash(100n)
    });
    await expect(indexer(chain, store).runOnce()).resolves.toMatchObject({
      reorgRecovered: true,
      status: "waiting-for-confirmations"
    });
    expect(store.resetCalls).toBe(1);

    chain.latestBlock = 109n;
    store.cursor = {
      lastProcessedBlock: 100n,
      lastVerifiedBlockHash: blockHash(100n)
    };
    await expect(indexer(chain, store).runOnce()).resolves.toMatchObject({
      reorgRecovered: true,
      status: "caught-up"
    });
    expect(store.resetCalls).toBe(2);
  });

  it("backfills the inclusive confirmed range and decodes receipt data", async () => {
    const chain = new FakeChain();
    chain.latestBlock = 115n;
    chain.logs = [makeLog({ blockNumber: 101n })];
    const store = new MemoryStore();
    const result = await indexer(chain, store).runOnce();
    expect(result).toMatchObject({
      confirmedHead: 103n,
      fromBlock: 100n,
      insertedEvents: 1,
      status: "indexed",
      toBlock: 103n
    });
    expect(chain.logRanges).toEqual([[100n, 103n]]);
    expect(store.batches[0]?.events[0]).toMatchObject({
      attestorAddress: ATTESTOR,
      cik: "0000320193",
      contractAddress: REGISTRY,
      lei: LEI,
      publisherAddress: PUBLISHER
    });
    expect(store.batches[0]?.events[0]?.rawEvent).toMatchObject({
      eventName: "EvidenceReceiptPublished",
      removed: false
    });
  });

  it("resumes after the persisted cursor and reports caught up without writes", async () => {
    const chain = new FakeChain();
    chain.latestBlock = 112n;
    const store = new MemoryStore({
      lastProcessedBlock: 100n,
      lastVerifiedBlockHash: blockHash(100n)
    });
    await expect(indexer(chain, store).runOnce()).resolves.toMatchObject({
      status: "caught-up"
    });
    expect(store.batches).toHaveLength(0);
  });

  it("verifies the cursor parent before processing the next range", async () => {
    const chain = new FakeChain();
    chain.latestBlock = 114n;
    const store = new MemoryStore({
      lastProcessedBlock: 100n,
      lastVerifiedBlockHash: blockHash(100n)
    });
    await indexer(chain, store).runOnce();
    expect(store.batches[0]).toMatchObject({ fromBlock: 101n, toBlock: 102n });
  });

  it("resets and rebuilds when the saved cursor hash is no longer canonical", async () => {
    const chain = new FakeChain();
    chain.latestBlock = 112n;
    const store = new MemoryStore({
      lastProcessedBlock: 100n,
      lastVerifiedBlockHash: hash(999)
    });
    await expect(indexer(chain, store).runOnce()).resolves.toMatchObject({
      fromBlock: 100n,
      reorgRecovered: true,
      status: "indexed"
    });
    expect(store.resetCalls).toBe(1);
  });

  it("resets when the next block does not descend from the saved cursor", async () => {
    const chain = new FakeChain();
    chain.latestBlock = 114n;
    chain.blocks.set(101n, {
      hash: blockHash(101n),
      number: 101n,
      parentHash: hash(999)
    });
    const store = new MemoryStore({
      lastProcessedBlock: 100n,
      lastVerifiedBlockHash: blockHash(100n)
    });
    await expect(indexer(chain, store).runOnce()).resolves.toMatchObject({
      fromBlock: 100n,
      reorgRecovered: true
    });
    expect(store.resetCalls).toBe(1);
  });

  it("clears derived state when a log is marked removed", async () => {
    const chain = new FakeChain();
    chain.latestBlock = 112n;
    chain.logs = [makeLog({ removed: true })];
    const store = new MemoryStore();
    await expect(indexer(chain, store).runOnce()).resolves.toMatchObject({
      reorgRecovered: true,
      status: "reorg-reset"
    });
    expect(store.resetCalls).toBe(1);
    expect(store.batches).toHaveLength(0);
  });

  it("does not commit a range whose end block changes during the read", async () => {
    const chain = new FakeChain();
    chain.latestBlock = 112n;
    chain.changeBlockHashAfterFirstRead = 100n;
    const store = new MemoryStore();
    await expect(indexer(chain, store).runOnce()).resolves.toMatchObject({
      status: "reorg-reset"
    });
    expect(store.resetCalls).toBe(1);
    expect(store.batches).toHaveLength(0);
  });

  it("rejects the wrong chain and leaves the database untouched", async () => {
    const chain = new FakeChain();
    chain.chainId = 968;
    const store = new MemoryStore();
    await expect(indexer(chain, store).runOnce()).rejects.toThrow("chain ID 968");
    expect(store.resetCalls).toBe(0);
    expect(store.batches).toHaveLength(0);
  });

  it("propagates RPC failure without advancing or resetting state", async () => {
    const chain = new FakeChain();
    chain.blockNumberError = new Error("RPC unavailable");
    const store = new MemoryStore();
    await expect(indexer(chain, store).runOnce()).rejects.toThrow("RPC unavailable");
    expect(store.resetCalls).toBe(0);
    expect(store.batches).toHaveLength(0);
  });

  it.each([
    [makeLog({ address: PUBLISHER }), "outside the requested"],
    [makeLog({ blockNumber: 99n }), "outside the requested"],
    [makeLog({ args: { cik: 10_000_000_000n } }), "exceeds ten"],
    [makeLog({ args: { issuedAt: 9_007_199_254_740_992n } }), "issuedAt"],
    [makeLog({ transactionHash: "0x01" }), "32-byte hash"]
  ])("rejects malformed event data %#", async (log, expected) => {
    const chain = new FakeChain();
    chain.latestBlock = 112n;
    chain.logs = [log];
    chain.receipts.set(log.transactionHash, receiptFor(log));
    const store = new MemoryStore();
    await expect(indexer(chain, store).runOnce()).rejects.toThrow(expected);
    expect(store.batches).toHaveLength(0);
  });

  it.each(["reverted", "wrong-block"] as const)(
    "rejects a %s transaction receipt",
    async (failure) => {
      const chain = new FakeChain();
      chain.latestBlock = 112n;
      const log = makeLog();
      chain.logs = [log];
      chain.receipts.set(log.transactionHash, {
        ...receiptFor(log),
        ...(failure === "reverted"
          ? { status: "reverted" as const }
          : { blockHash: hash(999) })
      });
      const store = new MemoryStore();
      await expect(indexer(chain, store).runOnce()).rejects.toThrow(
        "successful canonical transaction"
      );
      expect(store.batches).toHaveLength(0);
    }
  );
});

class FakeChain implements IndexerChainReader {
  blockNumberError: Error | null = null;
  blocks = new Map<bigint, IndexedBlock>();
  chainId = 677;
  changeBlockHashAfterFirstRead: bigint | null = null;
  latestBlock = 112n;
  logRanges: [bigint, bigint][] = [];
  logs: EvidenceReceiptLog[] = [];
  receipts = new Map<Hex, IndexedTransactionReceipt>();
  readonly #reads = new Map<bigint, number>();

  getBlock(blockNumber: bigint): Promise<IndexedBlock> {
    const reads = (this.#reads.get(blockNumber) ?? 0) + 1;
    this.#reads.set(blockNumber, reads);
    if (this.changeBlockHashAfterFirstRead === blockNumber && reads > 1) {
      return Promise.resolve({
        hash: hash(9_000 + Number(blockNumber)),
        number: blockNumber,
        parentHash: blockHash(blockNumber - 1n)
      });
    }
    return Promise.resolve(
      this.blocks.get(blockNumber) ?? {
        hash: blockHash(blockNumber),
        number: blockNumber,
        parentHash: blockHash(blockNumber - 1n)
      }
    );
  }

  getBlockNumber(): Promise<bigint> {
    if (this.blockNumberError !== null) {
      return Promise.reject(this.blockNumberError);
    }
    return Promise.resolve(this.latestBlock);
  }

  getChainId(): Promise<number> {
    return Promise.resolve(this.chainId);
  }

  getEvidenceLogs(
    _address: Address,
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<readonly EvidenceReceiptLog[]> {
    this.logRanges.push([fromBlock, toBlock]);
    return Promise.resolve(this.logs);
  }

  getTransactionReceipt(transactionHash: Hex): Promise<IndexedTransactionReceipt> {
    const existing = this.receipts.get(transactionHash);
    if (existing !== undefined) {
      return Promise.resolve(existing);
    }
    const log = this.logs.find((candidate) => candidate.transactionHash === transactionHash);
    if (log === undefined) {
      return Promise.reject(new Error("Missing fake transaction receipt"));
    }
    return Promise.resolve(receiptFor(log));
  }
}

class MemoryStore implements IndexerStore {
  batches: ReceiptEventBatch[] = [];
  cursor: IndexerCursorRecord | null;
  resetCalls = 0;

  constructor(cursor: IndexerCursorRecord | null = null) {
    this.cursor = cursor;
  }

  getCursor(): Promise<IndexerCursorRecord | null> {
    return Promise.resolve(this.cursor);
  }

  ingestBatch(batch: ReceiptEventBatch): Promise<ReceiptBatchResult> {
    this.batches.push(batch);
    this.cursor = {
      lastProcessedBlock: batch.toBlock,
      lastVerifiedBlockHash: batch.toBlockHash
    };
    return Promise.resolve({
      alreadyProcessed: false,
      duplicateEvents: 0,
      insertedEvents: batch.events.length
    });
  }

  resetContractIndex(): Promise<ResetIndexResult> {
    this.resetCalls += 1;
    this.cursor = null;
    return Promise.resolve({ deletedCursor: true, deletedEvents: this.batches.length });
  }
}

function indexer(chain: IndexerChainReader, store: IndexerStore): EvidenceReceiptIndexer {
  return new EvidenceReceiptIndexer(chain, store, {
    batchSize: 10,
    chainId: 677,
    confirmationDepth: 12,
    contractAddress: REGISTRY,
    deploymentBlock: 100n
  });
}

function makeLog(
  override: Partial<Omit<EvidenceReceiptLog, "args">> & {
    readonly args?: Partial<EvidenceReceiptLog["args"]>;
  } = {}
): EvidenceReceiptLog {
  const blockNumber = override.blockNumber ?? 100n;
  const base: EvidenceReceiptLog = {
    address: REGISTRY,
    args: {
      attestor: ATTESTOR,
      cik: 320_193n,
      expiresAt: 2_000_086_400n,
      issuedAt: 2_000_000_000n,
      lei: stringToHex(LEI, { size: 20 }),
      nonce: hash(13),
      packetHash: hash(12),
      pairKey: hash(14),
      policyVersion: 1,
      publisher: PUBLISHER,
      schemaVersion: 1,
      ...override.args
    },
    blockHash: blockHash(blockNumber),
    blockNumber,
    logIndex: 0,
    removed: false,
    transactionHash: hash(10)
  };
  return { ...base, ...override, args: base.args };
}

function receiptFor(log: EvidenceReceiptLog): IndexedTransactionReceipt {
  return {
    blockHash: log.blockHash,
    blockNumber: log.blockNumber,
    status: "success",
    transactionHash: log.transactionHash
  };
}

function blockHash(blockNumber: bigint): Hex {
  return hash(1_000 + Number(blockNumber));
}

function hash(seed: number): Hex {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}
