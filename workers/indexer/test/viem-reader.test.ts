import type { PublicClient } from "viem";
import { stringToHex } from "viem";

import {
  IndexerDataError,
  createViemChainReader
} from "../src/index.js";

const ADDRESS = "0x0000000000000000000000000000000000000677" as const;
const HASH = `0x${"1".repeat(64)}` as const;
const PARENT = `0x${"2".repeat(64)}` as const;

describe("viem chain reader", () => {
  it("maps numbered blocks, decoded logs, and transaction receipts", async () => {
    const client = {
      getBlock: vi.fn().mockResolvedValue({ hash: HASH, number: 10n, parentHash: PARENT }),
      getBlockNumber: vi.fn().mockResolvedValue(20n),
      getChainId: vi.fn().mockResolvedValue(677),
      getLogs: vi.fn().mockResolvedValue([
        {
          address: ADDRESS,
          args: {
            attestor: ADDRESS,
            cik: 1n,
            expiresAt: 2n,
            issuedAt: 1n,
            lei: stringToHex("HWUPKR0MPOU8FGXBT394", { size: 20 }),
            nonce: HASH,
            packetHash: HASH,
            pairKey: HASH,
            policyVersion: 1,
            publisher: ADDRESS,
            schemaVersion: 1
          },
          blockHash: HASH,
          blockNumber: 10n,
          logIndex: 0,
          removed: false,
          transactionHash: HASH
        }
      ]),
      getTransactionReceipt: vi.fn().mockResolvedValue({
        blockHash: HASH,
        blockNumber: 10n,
        status: "success",
        transactionHash: HASH
      })
    } as unknown as PublicClient;
    const reader = createViemChainReader(client);
    await expect(reader.getBlock(10n)).resolves.toEqual({
      hash: HASH,
      number: 10n,
      parentHash: PARENT
    });
    await expect(reader.getBlockNumber()).resolves.toBe(20n);
    await expect(reader.getChainId()).resolves.toBe(677);
    await expect(reader.getEvidenceLogs(ADDRESS, 10n, 10n)).resolves.toHaveLength(1);
    await expect(reader.getTransactionReceipt(HASH)).resolves.toMatchObject({
      status: "success"
    });
  });

  it.each([
    [{ hash: null, number: 10n, parentHash: PARENT }, "pending block"],
    [{ hash: HASH, number: null, parentHash: PARENT }, "pending block"]
  ])("rejects incomplete numbered block %#", async (block, expected) => {
    const client = { getBlock: vi.fn().mockResolvedValue(block) } as unknown as PublicClient;
    await expect(createViemChainReader(client).getBlock(10n)).rejects.toThrow(expected);
  });

  it("rejects a pending decoded log", async () => {
    const client = {
      getLogs: vi.fn().mockResolvedValue([
        {
          address: ADDRESS,
          args: {},
          blockHash: null,
          blockNumber: null,
          logIndex: null,
          removed: false,
          transactionHash: null
        }
      ])
    } as unknown as PublicClient;
    await expect(
      createViemChainReader(client).getEvidenceLogs(ADDRESS, 1n, 1n)
    ).rejects.toThrow(IndexerDataError);
  });
});
