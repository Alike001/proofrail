import type {
  IndexerCursorRecord,
  ReceiptBatchResult,
  ReceiptEventBatch,
  ResetIndexResult
} from "@proofrail/db";
import type { Address, Hex } from "viem";

export interface IndexedBlock {
  readonly hash: Hex;
  readonly number: bigint;
  readonly parentHash: Hex;
}

export interface IndexedTransactionReceipt {
  readonly blockHash: Hex;
  readonly blockNumber: bigint;
  readonly status: "reverted" | "success";
  readonly transactionHash: Hex;
}

export interface EvidenceReceiptLog {
  readonly address: Address;
  readonly args: {
    readonly attestor: Address;
    readonly cik: bigint;
    readonly expiresAt: bigint;
    readonly issuedAt: bigint;
    readonly lei: Hex;
    readonly nonce: Hex;
    readonly packetHash: Hex;
    readonly pairKey: Hex;
    readonly policyVersion: number;
    readonly publisher: Address;
    readonly schemaVersion: number;
  };
  readonly blockHash: Hex;
  readonly blockNumber: bigint;
  readonly logIndex: number;
  readonly removed: boolean;
  readonly transactionHash: Hex;
}

export interface IndexerChainReader {
  getBlock(blockNumber: bigint): Promise<IndexedBlock>;
  getBlockNumber(): Promise<bigint>;
  getChainId(): Promise<number>;
  getEvidenceLogs(
    address: Address,
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<readonly EvidenceReceiptLog[]>;
  getTransactionReceipt(transactionHash: Hex): Promise<IndexedTransactionReceipt>;
}

export interface IndexerStore {
  getCursor(chainId: number, contractAddress: Address): Promise<IndexerCursorRecord | null>;
  ingestBatch(batch: ReceiptEventBatch): Promise<ReceiptBatchResult>;
  resetContractIndex(
    chainId: number,
    contractAddress: Address
  ): Promise<ResetIndexResult>;
}
