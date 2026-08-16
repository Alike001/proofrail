import {
  IndexerConfigurationError,
  assertIndexerConfiguration,
  parseRuntimeConfiguration
} from "../src/index.js";

const REGISTRY = "0x0000000000000000000000000000000000000677";

describe("indexer configuration", () => {
  it("parses required runtime values and safe defaults", () => {
    expect(
      parseRuntimeConfiguration({
        BOT_RPC_URL: "http://127.0.0.1:8545",
        DATABASE_URL: "postgresql://proofrail:test@localhost/proofrail",
        EVIDENCE_REGISTRY_ADDRESS: REGISTRY,
        REGISTRY_DEPLOYMENT_BLOCK: "123"
      })
    ).toEqual({
      batchSize: 2000,
      chainId: 677,
      confirmationDepth: 12,
      contractAddress: REGISTRY,
      databaseUrl: "postgresql://proofrail:test@localhost/proofrail",
      deploymentBlock: 123n,
      pollIntervalMs: 3000,
      rpcUrl: "http://127.0.0.1:8545"
    });
  });

  it.each([
    [{}, "DATABASE_URL"],
    [{ DATABASE_URL: "db" }, "BOT_RPC_URL"],
    [{ DATABASE_URL: "db", BOT_RPC_URL: "rpc" }, "EVIDENCE_REGISTRY_ADDRESS"],
    [
      {
        DATABASE_URL: "db",
        BOT_RPC_URL: "rpc",
        EVIDENCE_REGISTRY_ADDRESS: REGISTRY
      },
      "REGISTRY_DEPLOYMENT_BLOCK"
    ]
  ])("requires runtime environment values", (environment, expected) => {
    expect(() => parseRuntimeConfiguration(environment)).toThrow(expected);
  });

  it.each([
    [{ chainId: 0 }, "chain ID"],
    [{ contractAddress: "bad" }, "registry address"],
    [{ deploymentBlock: -1n }, "deployment block"],
    [{ confirmationDepth: -1 }, "confirmation depth"],
    [{ batchSize: 0 }, "batch size"]
  ])("rejects invalid core configuration %o", (override, expected) => {
    expect(() =>
      assertIndexerConfiguration({
        batchSize: 10,
        chainId: 677,
        confirmationDepth: 12,
        contractAddress: REGISTRY,
        deploymentBlock: 1n,
        ...override
      })
    ).toThrow(expected);
  });

  it.each([
    ["BOT_CHAIN_ID", "abc"],
    ["INDEXER_CONFIRMATIONS", "-1"],
    ["INDEXER_BATCH_SIZE", "0"],
    ["INDEXER_POLL_INTERVAL_MS", "100"],
    ["REGISTRY_DEPLOYMENT_BLOCK", "-1"]
  ])("rejects invalid environment integer %s", (name, value) => {
    expect(() =>
      parseRuntimeConfiguration({
        BOT_RPC_URL: "rpc",
        DATABASE_URL: "db",
        EVIDENCE_REGISTRY_ADDRESS: REGISTRY,
        REGISTRY_DEPLOYMENT_BLOCK: "1",
        [name]: value
      })
    ).toThrow(IndexerConfigurationError);
  });
});
