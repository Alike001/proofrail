import "server-only";

import {
  EvidenceRepository,
  IndexerRepository,
  createDatabaseConnection
} from "@proofrail/db/runtime";

import type { LandingReceipt } from "./landing-data";
import { BOT_CHAIN_ID } from "./site";

export async function loadLandingReceipt(): Promise<LandingReceipt> {
  const databaseUrl = process.env.DATABASE_URL;
  const registryAddress = process.env.EVIDENCE_REGISTRY_ADDRESS;
  if (databaseUrl === undefined || registryAddress === undefined) {
    return {
      kind: "unavailable",
      reason: "The first BOT mainnet receipt will appear after registry deployment."
    };
  }

  const connection = createDatabaseConnection(databaseUrl);
  try {
    const configuredRegistry = parseDatabaseAddress(registryAddress);
    const receipt = await new IndexerRepository(connection.db).findLatestReceipt(
      BOT_CHAIN_ID,
      configuredRegistry
    );
    if (receipt === null) {
      return {
        kind: "unavailable",
        reason: "The registry is configured and waiting for its first indexed receipt."
      };
    }
    const packetHash = parseDatabaseHash(receipt.packetHash);
    const draft = await new EvidenceRepository(connection.db).findDraftByPacketHash(
      packetHash
    );
    return {
      attestor: receipt.attestorAddress,
      cik: receipt.cik,
      entityName: draft?.packet.sources.sec.legalName ?? "Public company receipt",
      expiresAt: receipt.expiresAt.toISOString(),
      issuedAt: receipt.issuedAt.toISOString(),
      kind: "available",
      lei: receipt.lei,
      packetHash,
      policyPassed: true,
      publisher: receipt.publisherAddress,
      registryAddress: configuredRegistry,
      transactionHash: receipt.transactionHash
    };
  } catch {
    return {
      kind: "unavailable",
      reason: "The cached receipt index is temporarily unavailable."
    };
  } finally {
    await connection.close();
  }
}

function parseDatabaseHash(value: string): `0x${string}` {
  if (!/^0x[0-9a-f]{64}$/u.test(value)) {
    throw new Error("The indexed packet hash is malformed.");
  }

  return value as `0x${string}`;
}

function parseDatabaseAddress(value: string): `0x${string}` {
  const normalized = value.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/u.test(normalized)) {
    throw new Error("The configured evidence registry address is malformed.");
  }

  return normalized as `0x${string}`;
}
