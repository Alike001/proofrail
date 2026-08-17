import "server-only";

import { randomBytes } from "node:crypto";

import { EvidenceRepository, createDatabaseConnection } from "@proofrail/db/runtime";
import { EnvelopeSigner } from "@proofrail/envelope-signer";
import { GleifLeiClient, SecSubmissionsClient } from "@proofrail/source-service";
import type { Hex } from "viem";

import type { EvidenceDraftView, PublishEnvelopeView } from "../lib/build-contract";
import { BOT_CHAIN_ID } from "../lib/site";
import { WebServiceError } from "./api-errors";
import { buildEvidenceDraft, issueEnvelope } from "./evidence-workflow";

export async function buildEvidenceFromEnvironment(input: unknown): Promise<EvidenceDraftView> {
  const configuration = readBuildConfiguration();
  const connection = createDatabaseConnection(configuration.databaseUrl);
  try {
    return await buildEvidenceDraft(input, {
      gleif: new GleifLeiClient(),
      nonce: createNonce,
      nowSeconds: currentUnixTime,
      registryAddress: configuration.registryAddress,
      repository: new EvidenceRepository(connection.db),
      sec: new SecSubmissionsClient({ userAgent: configuration.secUserAgent })
    });
  } finally {
    await connection.close();
  }
}

export async function issueEnvelopeFromEnvironment(
  draftId: string,
  input: unknown
): Promise<PublishEnvelopeView> {
  const configuration = readEnvelopeConfiguration();
  const connection = createDatabaseConnection(configuration.databaseUrl);
  try {
    const signer = new EnvelopeSigner(configuration.attestorPrivateKey, {
      chainId: BOT_CHAIN_ID,
      registryAddress: configuration.registryAddress
    });
    return await issueEnvelope(draftId, input, {
      nowSeconds: currentUnixTime,
      registryAddress: configuration.registryAddress as `0x${string}`,
      repository: new EvidenceRepository(connection.db),
      signer
    });
  } finally {
    await connection.close();
  }
}

function readSharedConfiguration() {
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const registryAddress = requiredEnvironment("EVIDENCE_REGISTRY_ADDRESS").toLowerCase();
  const configuredChain = Number(process.env.BOT_CHAIN_ID ?? String(BOT_CHAIN_ID));
  if (configuredChain !== BOT_CHAIN_ID) {
    throw new WebServiceError(
      "SERVICE_CONFIGURATION_ERROR",
      "ProofRail publication is not configured for BOT mainnet chain 677.",
      503
    );
  }
  return { databaseUrl, registryAddress };
}

function readBuildConfiguration() {
  return {
    ...readSharedConfiguration(),
    secUserAgent: requiredEnvironment("SEC_USER_AGENT")
  };
}

function readEnvelopeConfiguration() {
  return {
    ...readSharedConfiguration(),
    attestorPrivateKey: requiredEnvironment("ATTESTOR_PRIVATE_KEY") as Hex
  };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") {
    throw new WebServiceError(
      "SERVICE_CONFIGURATION_ERROR",
      "ProofRail evidence publication is not configured yet.",
      503
    );
  }
  return value;
}

function createNonce(): Hex {
  return `0x${randomBytes(32).toString("hex")}`;
}

function currentUnixTime(): number {
  return Math.floor(Date.now() / 1_000);
}
