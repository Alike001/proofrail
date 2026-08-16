import { getAddress, isAddress } from "viem";
import type { Address } from "viem";

import { IndexerConfigurationError } from "./errors.js";

export interface IndexerConfiguration {
  readonly chainId: number;
  readonly contractAddress: Address;
  readonly deploymentBlock: bigint;
  readonly confirmationDepth: number;
  readonly batchSize: number;
}

export interface IndexerRuntimeConfiguration extends IndexerConfiguration {
  readonly databaseUrl: string;
  readonly pollIntervalMs: number;
  readonly rpcUrl: string;
}

export function parseRuntimeConfiguration(
  environment: NodeJS.ProcessEnv
): IndexerRuntimeConfiguration {
  const databaseUrl = required(environment.DATABASE_URL, "DATABASE_URL");
  const rpcUrl = required(environment.BOT_RPC_URL, "BOT_RPC_URL");
  const contractAddress = required(
    environment.EVIDENCE_REGISTRY_ADDRESS,
    "EVIDENCE_REGISTRY_ADDRESS"
  );
  const configuration = {
    chainId: integer(environment.BOT_CHAIN_ID ?? "677", "BOT_CHAIN_ID", 1),
    contractAddress,
    deploymentBlock: bigInteger(
      required(environment.REGISTRY_DEPLOYMENT_BLOCK, "REGISTRY_DEPLOYMENT_BLOCK"),
      "REGISTRY_DEPLOYMENT_BLOCK"
    ),
    confirmationDepth: integer(
      environment.INDEXER_CONFIRMATIONS ?? "12",
      "INDEXER_CONFIRMATIONS",
      0
    ),
    batchSize: integer(environment.INDEXER_BATCH_SIZE ?? "2000", "INDEXER_BATCH_SIZE", 1)
  };
  return {
    ...assertIndexerConfiguration(configuration),
    databaseUrl,
    pollIntervalMs: integer(
      environment.INDEXER_POLL_INTERVAL_MS ?? "3000",
      "INDEXER_POLL_INTERVAL_MS",
      250
    ),
    rpcUrl
  };
}

export function assertIndexerConfiguration(input: {
  readonly chainId: number;
  readonly contractAddress: string;
  readonly deploymentBlock: bigint;
  readonly confirmationDepth: number;
  readonly batchSize: number;
}): IndexerConfiguration {
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) {
    throw new IndexerConfigurationError("The indexer chain ID must be a positive safe integer.");
  }
  if (!isAddress(input.contractAddress, { strict: false })) {
    throw new IndexerConfigurationError("The registry address must be a valid EVM address.");
  }
  if (input.deploymentBlock < 0n) {
    throw new IndexerConfigurationError("The registry deployment block cannot be negative.");
  }
  if (!Number.isSafeInteger(input.confirmationDepth) || input.confirmationDepth < 0) {
    throw new IndexerConfigurationError(
      "The confirmation depth must be a non-negative safe integer."
    );
  }
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize <= 0) {
    throw new IndexerConfigurationError("The indexer batch size must be a positive safe integer.");
  }
  return {
    ...input,
    contractAddress: getAddress(input.contractAddress).toLowerCase() as Address
  };
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === "") {
    throw new IndexerConfigurationError(`${name} is required.`);
  }
  return value;
}

function integer(value: string, name: string, minimum: number): number {
  if (!/^[0-9]+$/u.test(value)) {
    throw new IndexerConfigurationError(`${name} must be a decimal integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new IndexerConfigurationError(`${name} is outside its supported range.`);
  }
  return parsed;
}

function bigInteger(value: string, name: string): bigint {
  if (!/^[0-9]+$/u.test(value)) {
    throw new IndexerConfigurationError(`${name} must be a non-negative decimal integer.`);
  }
  return BigInt(value);
}
