import type { PublishedReceiptEvent } from "@proofrail/db";
import { getAddress, hexToString } from "viem";
import type { Address, Hex } from "viem";

import type { IndexerConfiguration } from "./config.js";
import { assertIndexerConfiguration } from "./config.js";
import { IndexerDataError } from "./errors.js";
import type {
  EvidenceReceiptLog,
  IndexedTransactionReceipt,
  IndexerChainReader,
  IndexerStore
} from "./types.js";

export interface IndexerRunResult {
  readonly confirmedHead: bigint | null;
  readonly fromBlock: bigint | null;
  readonly insertedEvents: number;
  readonly latestBlock: bigint;
  readonly reorgRecovered: boolean;
  readonly status: "caught-up" | "indexed" | "reorg-reset" | "waiting-for-confirmations";
  readonly toBlock: bigint | null;
}

export class EvidenceReceiptIndexer {
  readonly #chain: IndexerChainReader;
  readonly #configuration: IndexerConfiguration;
  readonly #store: IndexerStore;

  constructor(
    chain: IndexerChainReader,
    store: IndexerStore,
    configuration: IndexerConfiguration
  ) {
    this.#chain = chain;
    this.#store = store;
    this.#configuration = assertIndexerConfiguration(configuration);
  }

  async runOnce(): Promise<IndexerRunResult> {
    const observedChainId = await this.#chain.getChainId();
    if (observedChainId !== this.#configuration.chainId) {
      throw new IndexerDataError(
        `The RPC chain ID ${String(observedChainId)} does not match configured chain ${String(this.#configuration.chainId)}.`
      );
    }
    const latestBlock = await this.#chain.getBlockNumber();
    const confirmations = BigInt(this.#configuration.confirmationDepth);
    let cursor = await this.#store.getCursor(
      this.#configuration.chainId,
      this.#configuration.contractAddress
    );
    if (latestBlock < confirmations) {
      const resetRequired = cursor !== null;
      if (resetRequired) {
        await this.#reset();
      }
      return emptyResult(
        "waiting-for-confirmations",
        latestBlock,
        null,
        resetRequired
      );
    }
    const confirmedHead = latestBlock - confirmations;
    let reorgRecovered = false;

    if (cursor !== null && cursor.lastProcessedBlock > confirmedHead) {
      await this.#reset();
      cursor = null;
      reorgRecovered = true;
    }
    if (cursor !== null) {
      const savedBlock = await this.#chain.getBlock(cursor.lastProcessedBlock);
      if (
        savedBlock.hash.toLowerCase() !== cursor.lastVerifiedBlockHash ||
        savedBlock.number !== cursor.lastProcessedBlock ||
        cursor.lastProcessedBlock < this.#configuration.deploymentBlock
      ) {
        await this.#reset();
        cursor = null;
        reorgRecovered = true;
      }
    }

    let fromBlock =
      cursor === null
        ? this.#configuration.deploymentBlock
        : cursor.lastProcessedBlock + 1n;
    if (fromBlock > confirmedHead) {
      return emptyResult("caught-up", latestBlock, confirmedHead, reorgRecovered);
    }

    if (cursor !== null) {
      const firstBlock = await this.#chain.getBlock(fromBlock);
      if (firstBlock.parentHash.toLowerCase() !== cursor.lastVerifiedBlockHash) {
        await this.#reset();
        reorgRecovered = true;
        fromBlock = this.#configuration.deploymentBlock;
        if (fromBlock > confirmedHead) {
          return emptyResult("reorg-reset", latestBlock, confirmedHead, true);
        }
      }
    }

    const toBlock = minimum(
      fromBlock + BigInt(this.#configuration.batchSize) - 1n,
      confirmedHead
    );
    const rangeEndBeforeRead = await this.#chain.getBlock(toBlock);
    const logs = await this.#chain.getEvidenceLogs(
      this.#configuration.contractAddress,
      fromBlock,
      toBlock
    );
    let decodedEvents: readonly PublishedReceiptEvent[];
    try {
      decodedEvents = await decodeAndVerifyLogs(
        this.#chain,
        logs,
        this.#configuration.chainId,
        this.#configuration.contractAddress,
        fromBlock,
        toBlock
      );
    } catch (error) {
      if (error instanceof ReorganizationObservedError) {
        await this.#reset();
        return {
          ...emptyResult("reorg-reset", latestBlock, confirmedHead, true),
          fromBlock,
          toBlock
        };
      }
      throw error;
    }
    const rangeEndAfterRead = await this.#chain.getBlock(toBlock);
    if (
      rangeEndAfterRead.hash !== rangeEndBeforeRead.hash ||
      rangeEndAfterRead.number !== rangeEndBeforeRead.number
    ) {
      await this.#reset();
      return {
        ...emptyResult("reorg-reset", latestBlock, confirmedHead, true),
        fromBlock,
        toBlock
      };
    }
    const result = await this.#store.ingestBatch({
      chainId: this.#configuration.chainId,
      contractAddress: this.#configuration.contractAddress,
      events: decodedEvents,
      fromBlock,
      toBlock,
      toBlockHash: rangeEndAfterRead.hash.toLowerCase() as Hex
    });
    return {
      confirmedHead,
      fromBlock,
      insertedEvents: result.insertedEvents,
      latestBlock,
      reorgRecovered,
      status: "indexed",
      toBlock
    };
  }

  async #reset(): Promise<void> {
    await this.#store.resetContractIndex(
      this.#configuration.chainId,
      this.#configuration.contractAddress
    );
  }
}

class ReorganizationObservedError extends Error {}

async function decodeAndVerifyLogs(
  chain: IndexerChainReader,
  logs: readonly EvidenceReceiptLog[],
  chainId: number,
  contractAddress: Address,
  fromBlock: bigint,
  toBlock: bigint
): Promise<readonly PublishedReceiptEvent[]> {
  const receipts = new Map<Hex, IndexedTransactionReceipt>();
  const events: PublishedReceiptEvent[] = [];
  for (const log of logs) {
    if (log.removed) {
      throw new ReorganizationObservedError("The RPC marked an evidence event as removed.");
    }
    if (
      log.address.toLowerCase() !== contractAddress ||
      log.blockNumber < fromBlock ||
      log.blockNumber > toBlock
    ) {
      throw new IndexerDataError("An evidence event is outside the requested contract or range.");
    }
    let receipt = receipts.get(log.transactionHash);
    if (receipt === undefined) {
      receipt = await chain.getTransactionReceipt(log.transactionHash);
      receipts.set(log.transactionHash, receipt);
    }
    if (
      receipt.status !== "success" ||
      receipt.transactionHash !== log.transactionHash ||
      receipt.blockHash !== log.blockHash ||
      receipt.blockNumber !== log.blockNumber
    ) {
      throw new IndexerDataError(
        "An evidence event does not match a successful canonical transaction receipt."
      );
    }
    events.push(decodeEvent(log, chainId, contractAddress));
  }
  return events;
}

function decodeEvent(
  log: EvidenceReceiptLog,
  chainId: number,
  contractAddress: Address
): PublishedReceiptEvent {
  const cikDigits = log.args.cik.toString();
  if (cikDigits.length > 10) {
    throw new IndexerDataError("The event CIK exceeds ten decimal digits.");
  }
  const cik = cikDigits.padStart(10, "0");
  const lei = hexToString(log.args.lei, { size: 20 });
  const issuedAt = toSafeNumber(log.args.issuedAt, "issuedAt");
  const expiresAt = toSafeNumber(log.args.expiresAt, "expiresAt");
  const transactionHash = lowerHash(log.transactionHash, "transaction hash");
  const blockHash = lowerHash(log.blockHash, "block hash");
  const packetHash = lowerHash(log.args.packetHash, "packet hash");
  const pairKey = lowerHash(log.args.pairKey, "pair key");
  const nonce = lowerHash(log.args.nonce, "nonce");
  const publisherAddress = lowerAddress(log.args.publisher);
  const attestorAddress = lowerAddress(log.args.attestor);
  return {
    attestorAddress,
    blockHash,
    blockNumber: log.blockNumber,
    chainId,
    cik,
    contractAddress,
    expiresAt,
    issuedAt,
    lei,
    logIndex: log.logIndex,
    nonce,
    packetHash,
    pairKey,
    policyVersion: log.args.policyVersion,
    publisherAddress,
    rawEvent: {
      address: contractAddress,
      args: {
        attestor: attestorAddress,
        cik,
        expiresAt: String(expiresAt),
        issuedAt: String(issuedAt),
        lei,
        nonce,
        packetHash,
        pairKey,
        policyVersion: log.args.policyVersion,
        publisher: publisherAddress,
        schemaVersion: log.args.schemaVersion
      },
      blockHash,
      blockNumber: log.blockNumber.toString(),
      eventName: "EvidenceReceiptPublished",
      logIndex: log.logIndex,
      removed: false,
      transactionHash
    },
    schemaVersion: log.args.schemaVersion,
    transactionHash
  };
}

function lowerAddress(value: Address): Address {
  return getAddress(value).toLowerCase() as Address;
}

function lowerHash(value: Hex, label: string): Hex {
  const lowered = value.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(lowered)) {
    throw new IndexerDataError(`The ${label} is not a 32-byte hash.`);
  }
  return lowered as Hex;
}

function toSafeNumber(value: bigint, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new IndexerDataError(`The event ${label} is outside the supported range.`);
  }
  return number;
}

function minimum(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function emptyResult(
  status: IndexerRunResult["status"],
  latestBlock: bigint,
  confirmedHead: bigint | null,
  reorgRecovered: boolean
): IndexerRunResult {
  return {
    confirmedHead,
    fromBlock: null,
    insertedEvents: 0,
    latestBlock,
    reorgRecovered,
    status,
    toBlock: null
  };
}
