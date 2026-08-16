import {
  computePairKey,
  createEvidencePacket,
  hashSourceSnapshot
} from "@proofrail/evidence-core";
import type {
  GleifSourceEvidence,
  SecSourceEvidence
} from "@proofrail/evidence-core";
import type { SourceSnapshot } from "@proofrail/source-service";

import type {
  PersistDraftInput,
  PublishedReceiptEvent,
  ReceiptEventBatch,
  SignedEnvelopeDocument
} from "../src/index.js";

export const CIK = "0000320193";
export const LEI = "HWUPKR0MPOU8FGXBT394";
export const CHAIN_ID = 677;
export const REGISTRY = "0x0000000000000000000000000000000000000677" as const;
export const PUBLISHER = "0x0000000000000000000000000000000000000001" as const;
export const ATTESTOR = "0x0000000000000000000000000000000000000002" as const;
export const ISSUED_AT = 2_000_000_000;
export const SEC_BODY = new TextEncoder().encode('{"source":"SEC","name":"Apple Inc."}');
export const GLEIF_BODY = new TextEncoder().encode(
  '{"source":"GLEIF","legalName":"Apple Inc.","status":"ACTIVE"}'
);

const RESPONSE_HEADERS = {
  cacheControl: null,
  contentType: "application/json",
  date: null,
  etag: null,
  lastModified: null
} as const;

export function makeDraftInput(): PersistDraftInput {
  const secSnapshot = makeSnapshot("SEC", SEC_BODY, ISSUED_AT - 30);
  const gleifSnapshot = makeSnapshot("GLEIF", GLEIF_BODY, ISSUED_AT - 20);
  const sec: SecSourceEvidence = {
    source: "SEC",
    resolved: true,
    cik: CIK,
    legalName: "Apple Inc.",
    latestFilingDate: "2033-04-01",
    latestFilingForm: "10-Q",
    retrievedAt: secSnapshot.retrievedAt,
    snapshotHash: secSnapshot.snapshotHash,
    sourceUrl: secSnapshot.sourceUrl
  };
  const gleif: GleifSourceEvidence = {
    source: "GLEIF",
    resolved: true,
    lei: LEI,
    legalName: "Apple Inc.",
    entityStatus: "ACTIVE",
    retrievedAt: gleifSnapshot.retrievedAt,
    snapshotHash: gleifSnapshot.snapshotHash,
    sourceUrl: gleifSnapshot.sourceUrl
  };
  const packet = createEvidencePacket({
    chainId: CHAIN_ID,
    registryAddress: REGISTRY,
    nonce: hash(90),
    issuedAt: ISSUED_AT,
    sec,
    gleif
  });
  return {
    packet,
    pairKey: computePairKey(CIK, LEI),
    secSnapshot,
    gleifSnapshot
  };
}

export function makeEvent(
  overrides: Partial<PublishedReceiptEvent> = {}
): PublishedReceiptEvent {
  return {
    chainId: CHAIN_ID,
    contractAddress: REGISTRY,
    transactionHash: hash(10),
    logIndex: 0,
    blockNumber: 100n,
    blockHash: hash(11),
    packetHash: hash(12),
    pairKey: computePairKey(CIK, LEI),
    nonce: hash(13),
    cik: CIK,
    lei: LEI,
    issuedAt: ISSUED_AT,
    expiresAt: ISSUED_AT + 86_400,
    schemaVersion: 1,
    policyVersion: 1,
    publisherAddress: PUBLISHER,
    attestorAddress: ATTESTOR,
    rawEvent: { eventName: "EvidenceReceiptPublished" },
    ...overrides
  };
}

export function makeBatch(
  overrides: Partial<ReceiptEventBatch> = {}
): ReceiptEventBatch {
  return {
    chainId: CHAIN_ID,
    contractAddress: REGISTRY,
    fromBlock: 100n,
    toBlock: 100n,
    toBlockHash: hash(11),
    events: [makeEvent()],
    ...overrides
  };
}

export function makeTypedData(input = makeDraftInput()): SignedEnvelopeDocument {
  return {
    domain: {
      name: "ProofRailEvidenceRegistry",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: REGISTRY
    },
    message: {
      packetHash: input.packet.packetHash,
      pairKey: input.pairKey,
      nonce: input.packet.packet.nonce,
      publisher: PUBLISHER
    },
    primaryType: "EvidenceEnvelope",
    types: { EvidenceEnvelope: [{ name: "publisher", type: "address" }] }
  };
}

export function hash(seed: number): `0x${string}` {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}

function makeSnapshot(
  source: "SEC" | "GLEIF",
  body: Uint8Array,
  retrievedAt: number
): SourceSnapshot {
  const sourceUrl =
    source === "SEC"
      ? `https://data.sec.gov/submissions/CIK${CIK}.json`
      : `https://api.gleif.org/api/v1/lei-records/${LEI}`;
  return {
    source,
    sourceUrl,
    retrievedAt,
    responseHeaders: RESPONSE_HEADERS,
    body,
    snapshotHash: hashSourceSnapshot(body)
  };
}
