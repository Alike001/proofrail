import type { PublicClient } from "viem";

import { EVIDENCE_RECEIPT_PUBLISHED_EVENT } from "./abi.js";
import { IndexerDataError } from "./errors.js";
import type {
  EvidenceReceiptLog,
  IndexedBlock,
  IndexedTransactionReceipt,
  IndexerChainReader
} from "./types.js";
import type { Address, Hex } from "viem";

export function createViemChainReader(client: PublicClient): IndexerChainReader {
  return {
    getBlock: async (blockNumber): Promise<IndexedBlock> => {
      const block = await client.getBlock({ blockNumber });
      const uncertainBlock = block as unknown as {
        readonly hash: Hex | null;
        readonly number: bigint | null;
        readonly parentHash: Hex;
      };
      if (uncertainBlock.hash === null || uncertainBlock.number === null) {
        throw new IndexerDataError("The RPC returned a pending block for a numbered query.");
      }
      return {
        hash: uncertainBlock.hash,
        number: uncertainBlock.number,
        parentHash: uncertainBlock.parentHash
      };
    },
    getBlockNumber: () => client.getBlockNumber(),
    getChainId: () => client.getChainId(),
    getEvidenceLogs: async (
      address: Address,
      fromBlock: bigint,
      toBlock: bigint
    ): Promise<readonly EvidenceReceiptLog[]> => {
      const logs = await client.getLogs({
        address,
        event: EVIDENCE_RECEIPT_PUBLISHED_EVENT,
        fromBlock,
        strict: true,
        toBlock
      });
      return logs.map((log) => {
        const uncertainLog = log as unknown as {
          readonly address: Address;
          readonly args: EvidenceReceiptLog["args"];
          readonly blockHash: Hex | null;
          readonly blockNumber: bigint | null;
          readonly logIndex: number | null;
          readonly removed: boolean;
          readonly transactionHash: Hex | null;
        };
        if (
          uncertainLog.blockHash === null ||
          uncertainLog.blockNumber === null ||
          uncertainLog.logIndex === null ||
          uncertainLog.transactionHash === null
        ) {
          throw new IndexerDataError("The RPC returned a pending evidence event.");
        }
        return {
          address: uncertainLog.address,
          args: uncertainLog.args,
          blockHash: uncertainLog.blockHash,
          blockNumber: uncertainLog.blockNumber,
          logIndex: uncertainLog.logIndex,
          removed: uncertainLog.removed,
          transactionHash: uncertainLog.transactionHash
        };
      });
    },
    getTransactionReceipt: async (
      transactionHash: Hex
    ): Promise<IndexedTransactionReceipt> => {
      const receipt = await client.getTransactionReceipt({ hash: transactionHash });
      return {
        blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber,
        status: receipt.status,
        transactionHash: receipt.transactionHash
      };
    }
  };
}
