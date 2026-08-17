import "server-only";

import {
  EvidenceValidationError,
  computePairKey,
  createEvidencePacket,
  normalizeCik,
  normalizeLei
} from "@proofrail/evidence-core";
import type { EvidenceRepository } from "@proofrail/db/runtime";
import type { EnvelopeSigner } from "@proofrail/envelope-signer";
import type {
  RetrievedGleifEvidence,
  RetrievedSecEvidence
} from "@proofrail/source-service";
import type { Hex } from "viem";

import type {
  EvidenceDraftView,
  PublishEnvelopeView
} from "../lib/build-contract";
import { BOT_CHAIN_ID } from "../lib/site";
import { WebServiceError } from "./api-errors";

interface SourceClient<T> {
  retrieve(identifier: string): Promise<T>;
}

interface BuildRepository {
  createDraft(input: Parameters<EvidenceRepository["createDraft"]>[0]): Promise<{ readonly id: string }>;
}

interface EnvelopeRepository {
  findDraftById(draftId: string): ReturnType<EvidenceRepository["findDraftById"]>;
  saveSignedEnvelope(
    input: Parameters<EvidenceRepository["saveSignedEnvelope"]>[0]
  ): ReturnType<EvidenceRepository["saveSignedEnvelope"]>;
}

interface DraftSigner {
  signDraft: EnvelopeSigner["signDraft"];
}

export interface BuildWorkflowDependencies {
  readonly gleif: SourceClient<RetrievedGleifEvidence>;
  readonly nonce: () => Hex;
  readonly nowSeconds: () => number;
  readonly registryAddress: string;
  readonly repository: BuildRepository;
  readonly sec: SourceClient<RetrievedSecEvidence>;
}

export interface EnvelopeWorkflowDependencies {
  readonly nowSeconds: () => number;
  readonly registryAddress: `0x${string}`;
  readonly repository: EnvelopeRepository;
  readonly signer: DraftSigner;
}

export async function buildEvidenceDraft(
  input: unknown,
  dependencies: BuildWorkflowDependencies
): Promise<EvidenceDraftView> {
  const identifiers = parseBuildInput(input);
  const [sec, gleif] = await Promise.all([
    dependencies.sec.retrieve(identifiers.cik),
    dependencies.gleif.retrieve(identifiers.lei)
  ]);
  const packet = createEvidencePacket({
    chainId: BOT_CHAIN_ID,
    gleif: gleif.evidence,
    issuedAt: dependencies.nowSeconds(),
    nonce: dependencies.nonce(),
    registryAddress: dependencies.registryAddress,
    sec: sec.evidence
  });
  const pairKey = computePairKey(identifiers.cik, identifiers.lei);
  const draft = await dependencies.repository.createDraft({
    gleifSnapshot: gleif.snapshot,
    packet,
    pairKey,
    secSnapshot: sec.snapshot
  });
  return {
    canonicalPacket: packet.canonicalPacket,
    draftId: draft.id,
    packet: packet.packet,
    packetHash: packet.packetHash,
    pairKey
  };
}

export async function issueEnvelope(
  draftId: string,
  input: unknown,
  dependencies: EnvelopeWorkflowDependencies
): Promise<PublishEnvelopeView> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(draftId)) {
    throw new WebServiceError("INVALID_DRAFT_ID", "The evidence draft ID is invalid.", 400);
  }
  const publisher = parsePublisher(input);
  const draft = await dependencies.repository.findDraftById(draftId);
  if (draft === null) {
    throw new WebServiceError("DRAFT_NOT_FOUND", "The evidence draft was not found.", 404);
  }
  const signed = await dependencies.signer.signDraft(
    draft,
    publisher,
    dependencies.nowSeconds()
  );
  const stored = await dependencies.repository.saveSignedEnvelope(signed.persisted);
  const message = stored.typedData.message;
  return {
    attestorAddress: stored.signerAddress as `0x${string}`,
    chainId: BOT_CHAIN_ID,
    contractAddress: dependencies.registryAddress,
    digest: signed.digest,
    envelope: {
      cik: requireDocumentString(message.cik, "CIK"),
      expiresAt: requireDocumentString(message.expiresAt, "expiry"),
      issuedAt: requireDocumentString(message.issuedAt, "issue time"),
      lei: requireDocumentHex(message.lei, "LEI"),
      nonce: requireDocumentHex(message.nonce, "nonce"),
      packetHash: requireDocumentHex(message.packetHash, "packet hash"),
      pairKey: requireDocumentHex(message.pairKey, "pair key"),
      policyPassed: message.policyPassed === true,
      policyVersion: requireDocumentNumber(message.policyVersion, "policy version"),
      publisher: requireDocumentHex(message.publisher, "publisher"),
      schemaVersion: requireDocumentNumber(message.schemaVersion, "schema version")
    },
    signature: stored.signature as `0x${string}`
  };
}

function parseBuildInput(value: unknown): { readonly cik: string; readonly lei: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WebServiceError("INVALID_REQUEST", "Enter one CIK and one LEI.", 400);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.cik !== "string" || typeof record.lei !== "string") {
    throw new WebServiceError("INVALID_REQUEST", "CIK and LEI must be text values.", 400);
  }
  return { cik: normalizeCik(record.cik), lei: normalizeLei(record.lei) };
}

function parsePublisher(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WebServiceError("INVALID_REQUEST", "Select a publisher wallet.", 400, "publisher");
  }
  const publisher = (value as Record<string, unknown>).publisher;
  if (typeof publisher !== "string") {
    throw new WebServiceError("INVALID_PUBLISHER", "The publisher wallet is invalid.", 400, "publisher");
  }
  return publisher;
}

function requireDocumentString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new EvidenceValidationError("INVALID_SOURCE_EVIDENCE", `Stored ${label} is invalid.`);
  }
  return value;
}

function requireDocumentHex(value: unknown, label: string): `0x${string}` {
  const parsed = requireDocumentString(value, label);
  if (!/^0x[0-9a-f]+$/u.test(parsed)) {
    throw new EvidenceValidationError("INVALID_SOURCE_EVIDENCE", `Stored ${label} is invalid.`);
  }
  return parsed as `0x${string}`;
}

function requireDocumentNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new EvidenceValidationError("INVALID_SOURCE_EVIDENCE", `Stored ${label} is invalid.`);
  }
  return value;
}
