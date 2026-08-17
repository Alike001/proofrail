import "server-only";

import { PublicReceiptRepository, createDatabaseConnection } from "@proofrail/db/runtime";
import { GleifLeiClient, SecSubmissionsClient } from "@proofrail/source-service";
import { createPublicClient, hexToString, http } from "viem";
import type { Hex } from "viem";

import { botMainnet, evidenceRegistryAbi } from "../lib/bot-chain";
import type { ChainVerification, PublicReceiptView } from "../lib/receipt-contract";
import { BOT_CHAIN_ID } from "../lib/site";
import { WebServiceError } from "./api-errors";
import {
  findRequiredBundle,
  loadPublicReceipt,
  parsePacketHash,
  recheckLiveReceipt,
  replaySavedReceipt,
  selectReceiptArtifact
} from "./public-receipt";
import type { ReceiptBundle } from "./public-receipt";

export async function loadReceiptArtifactFromEnvironment(
  packetHashInput: string,
  artifact: string
): Promise<{ readonly body: Uint8Array; readonly contentType: string; readonly filename: string }> {
  const configuration = readReceiptConfiguration();
  const connection = createDatabaseConnection(configuration.databaseUrl);
  try {
    const packetHash = parsePacketHash(packetHashInput);
    const repository = new PublicReceiptRepository(connection.db);
    const bundle = await findRequiredBundle(packetHash, {
      chainId: BOT_CHAIN_ID,
      contractAddress: configuration.contractAddress,
      repository
    });
    return selectReceiptArtifact(bundle, packetHash, artifact);
  } finally {
    await connection.close();
  }
}

export async function loadPublicReceiptFromEnvironment(packetHash: string): Promise<PublicReceiptView> {
  const configuration = readReceiptConfiguration();
  const connection = createDatabaseConnection(configuration.databaseUrl);
  try {
    const repository = new PublicReceiptRepository(connection.db);
    return await loadPublicReceipt(packetHash, {
      chainId: BOT_CHAIN_ID,
      contractAddress: configuration.contractAddress,
      nowSeconds: currentUnixTime,
      repository,
      verifyChain: createChainVerifier(configuration.rpcUrl, configuration.contractAddress)
    });
  } finally {
    await connection.close();
  }
}

export async function replaySavedReceiptFromEnvironment(packetHash: string) {
  const configuration = readReceiptConfiguration();
  const connection = createDatabaseConnection(configuration.databaseUrl);
  try {
    return await replaySavedReceipt(packetHash, {
      chainId: BOT_CHAIN_ID,
      contractAddress: configuration.contractAddress,
      nowSeconds: currentUnixTime,
      repository: new PublicReceiptRepository(connection.db)
    });
  } finally {
    await connection.close();
  }
}

export async function recheckLiveReceiptFromEnvironment(packetHash: string) {
  const configuration = readReceiptConfiguration(true);
  const connection = createDatabaseConnection(configuration.databaseUrl);
  try {
    return await recheckLiveReceipt(packetHash, {
      chainId: BOT_CHAIN_ID,
      contractAddress: configuration.contractAddress,
      gleif: new GleifLeiClient(),
      nowSeconds: currentUnixTime,
      repository: new PublicReceiptRepository(connection.db),
      sec: new SecSubmissionsClient({ userAgent: configuration.secUserAgent })
    });
  } finally {
    await connection.close();
  }
}

function createChainVerifier(rpcUrl: string, contractAddress: `0x${string}`) {
  const client = createPublicClient({
    chain: botMainnet,
    transport: http(rpcUrl, { retryCount: 0, timeout: 3_000 })
  });
  return async (bundle: ReceiptBundle): Promise<ChainVerification> => {
    try {
      const [receipt, latest] = await Promise.all([
        client.readContract({
          abi: evidenceRegistryAbi,
          address: contractAddress,
          args: [bundle.receipt.packetHash as Hex],
          functionName: "receipts"
        }),
        client.readContract({
          abi: evidenceRegistryAbi,
          address: contractAddress,
          args: [bundle.receipt.pairKey as Hex],
          functionName: "latestPacketByPair"
        })
      ]);
      const matches = receipt[0] === bundle.receipt.pairKey
        && receipt[1].toString().padStart(10, "0") === bundle.receipt.cik
        && hexToString(receipt[2], { size: 20 }) === bundle.receipt.lei
        && receipt[3] === BigInt(toUnixSeconds(bundle.receipt.issuedAt))
        && receipt[4] === BigInt(toUnixSeconds(bundle.receipt.expiresAt))
        && receipt[5] === bundle.receipt.schemaVersion
        && receipt[6] === bundle.receipt.policyVersion
        && receipt[7].toLowerCase() === bundle.receipt.publisherAddress
        && receipt[8].toLowerCase() === bundle.receipt.attestorAddress
        && latest === bundle.currentPacketHash;
      return matches ? "VERIFIED" : "MISMATCH";
    } catch {
      return "UNAVAILABLE";
    }
  };
}

function readReceiptConfiguration(requireSource = false) {
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const contractAddress = requiredEnvironment("EVIDENCE_REGISTRY_ADDRESS").toLowerCase();
  const configuredRpcUrl = process.env.BOT_RPC_URL?.trim();
  if (!/^0x[0-9a-f]{40}$/u.test(contractAddress)) {
    throw new WebServiceError("SERVICE_CONFIGURATION_ERROR", "The receipt registry is invalid.", 503);
  }
  const configuredChain = Number(process.env.BOT_CHAIN_ID ?? String(BOT_CHAIN_ID));
  if (configuredChain !== BOT_CHAIN_ID) {
    throw new WebServiceError("SERVICE_CONFIGURATION_ERROR", "The receipt service requires BOT mainnet.", 503);
  }
  return {
    contractAddress: contractAddress as `0x${string}`,
    databaseUrl,
    rpcUrl: configuredRpcUrl === undefined || configuredRpcUrl === ""
      ? botMainnet.rpcUrls.default.http[0]
      : configuredRpcUrl,
    secUserAgent: requireSource ? requiredEnvironment("SEC_USER_AGENT") : ""
  };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") {
    throw new WebServiceError("SERVICE_CONFIGURATION_ERROR", "ProofRail receipts are not configured yet.", 503);
  }
  return value;
}

function currentUnixTime(): number {
  return Math.floor(Date.now() / 1_000);
}

function toUnixSeconds(value: Date): number {
  return Math.floor(value.getTime() / 1_000);
}
