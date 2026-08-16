import { createDatabaseConnection, IndexerRepository } from "@proofrail/db";
import { createPublicClient, http } from "viem";

import { parseRuntimeConfiguration } from "./config.js";
import { EvidenceReceiptIndexer } from "./indexer.js";
import { createViemChainReader } from "./viem-reader.js";

const configuration = parseRuntimeConfiguration(process.env);
const connection = createDatabaseConnection(configuration.databaseUrl);
const publicClient = createPublicClient({
  cacheTime: 0,
  transport: http(configuration.rpcUrl)
});
const indexer = new EvidenceReceiptIndexer(
  createViemChainReader(publicClient),
  new IndexerRepository(connection.db),
  configuration
);
const shutdown = new AbortController();

process.once("SIGINT", () => {
  shutdown.abort();
});
process.once("SIGTERM", () => {
  shutdown.abort();
});

try {
  while (!shutdown.signal.aborted) {
    try {
      const result = await indexer.runOnce();
      console.log(JSON.stringify(result, bigintJson));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Unknown indexer failure");
    }
    await delay(configuration.pollIntervalMs);
  }
} finally {
  await connection.close();
}

function bigintJson(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
