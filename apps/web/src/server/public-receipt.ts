import "server-only";

import {
  evaluatePolicy,
  hashSourceSnapshot,
  replayEvidencePacket
} from "@proofrail/evidence-core";
import type { PublicReceiptBundleRecord } from "@proofrail/db";
import type { PublicReceiptRepository } from "@proofrail/db/runtime";
import type {
  RetrievedGleifEvidence,
  RetrievedSecEvidence
} from "@proofrail/source-service";
import type { Hex } from "viem";

import type {
  ChainVerification,
  PublicReceiptView,
  ReceiptSourceView,
  RecheckResponse,
  ReplayResponse
} from "../lib/receipt-contract";
import { BOT_CHAIN_ID } from "../lib/site";
import { WebServiceError } from "./api-errors";

export type ReceiptBundle = PublicReceiptBundleRecord;

interface ReceiptRepositoryBoundary {
  findBundle: PublicReceiptRepository["findBundle"];
}

interface SourceClient<T> {
  retrieve(identifier: string): Promise<T>;
}

export interface ReceiptDependencies {
  readonly chainId: number;
  readonly contractAddress: `0x${string}`;
  readonly nowSeconds: () => number;
  readonly repository: ReceiptRepositoryBoundary;
  readonly verifyChain: (bundle: ReceiptBundle) => Promise<ChainVerification>;
}

export interface RecheckDependencies extends Omit<ReceiptDependencies, "verifyChain"> {
  readonly gleif: SourceClient<RetrievedGleifEvidence>;
  readonly sec: SourceClient<RetrievedSecEvidence>;
}

export interface ReceiptArtifact {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly filename: string;
}

export async function loadPublicReceipt(
  packetHashInput: string,
  dependencies: ReceiptDependencies
): Promise<PublicReceiptView> {
  const packetHash = parsePacketHash(packetHashInput);
  const bundle = await findRequiredBundle(packetHash, dependencies);
  const replay = replayEvidencePacket(bundle.draft.packet);
  const savedIntegrity = verifySavedIntegrity(
    bundle,
    replay.providedCanonicalPacket,
    replay.providedPacketHash
  );
  const chainVerification = await dependencies.verifyChain(bundle);
  const invalid = !savedIntegrity
    || !replay.deterministic
    || bundle.currentPacketHash === null
    || chainVerification === "MISMATCH";
  const expired = dependencies.nowSeconds() >= toUnixSeconds(bundle.receipt.expiresAt);
  const superseded = bundle.currentPacketHash !== null
    && bundle.currentPacketHash !== bundle.receipt.packetHash;
  const state = invalid ? "INVALID" : expired ? "EXPIRED" : superseded ? "SUPERSEDED" : "CURRENT";
  const base = `/api/receipts/${packetHash}/download`;

  return {
    attestor: bundle.receipt.attestorAddress as `0x${string}`,
    blockHash: bundle.receipt.blockHash as `0x${string}`,
    blockNumber: bundle.receipt.blockNumber.toString(),
    canonicalPacketDownload: `${base}/packet`,
    chainId: BOT_CHAIN_ID,
    chainVerification,
    cik: bundle.receipt.cik,
    contractAddress: bundle.chainEvent.contractAddress as `0x${string}`,
    expiresAt: bundle.receipt.expiresAt.toISOString(),
    gleifSnapshotDownload: `${base}/gleif`,
    issuedAt: bundle.receipt.issuedAt.toISOString(),
    lei: bundle.receipt.lei,
    packet: bundle.draft.packet,
    packetHash,
    policyChecks: bundle.draft.packet.policy.checks,
    policyPassed: bundle.draft.packet.policy.passed,
    policyVersion: bundle.receipt.policyVersion,
    publisher: bundle.receipt.publisherAddress as `0x${string}`,
    replayDeterministic: replay.deterministic
      && replay.providedPacketHash === bundle.receipt.packetHash,
    secSnapshotDownload: `${base}/sec`,
    state,
    transactionHash: bundle.receipt.transactionHash as `0x${string}`
  };
}

export async function replaySavedReceipt(
  packetHashInput: string,
  dependencies: Omit<ReceiptDependencies, "verifyChain">
): Promise<ReplayResponse["replay"]> {
  const packetHash = parsePacketHash(packetHashInput);
  const bundle = await findRequiredBundle(packetHash, dependencies);
  const replay = replayEvidencePacket(bundle.draft.packet);
  const deterministic = replay.deterministic
    && replay.providedPacketHash === packetHash
    && verifySavedIntegrity(
      bundle,
      replay.providedCanonicalPacket,
      replay.providedPacketHash
    );
  return {
    deterministic,
    packetHash: replay.providedPacketHash,
    policyChecks: replay.replayed.packet.policy.checks,
    policyPassed: replay.replayed.packet.policy.passed
  };
}

export async function recheckLiveReceipt(
  packetHashInput: string,
  dependencies: RecheckDependencies
): Promise<RecheckResponse["recheck"]> {
  const packetHash = parsePacketHash(packetHashInput);
  const bundle = await findRequiredBundle(packetHash, dependencies);
  const [sec, gleif] = await Promise.all([
    dependencies.sec.retrieve(bundle.receipt.cik),
    dependencies.gleif.retrieve(bundle.receipt.lei)
  ]);
  const checkedAt = dependencies.nowSeconds();
  const policy = evaluatePolicy({ sec: sec.evidence, gleif: gleif.evidence, issuedAt: checkedAt });
  return {
    changed: sec.snapshot.snapshotHash !== bundle.secSnapshot.snapshotHash
      || gleif.snapshot.snapshotHash !== bundle.gleifSnapshot.snapshotHash,
    checkedAt: new Date(checkedAt * 1_000).toISOString(),
    gleif: sourceView("GLEIF", gleif.evidence),
    policyChecks: policy.checks,
    policyPassed: policy.passed,
    sec: sourceView("SEC", sec.evidence)
  };
}

export function selectReceiptArtifact(
  bundle: ReceiptBundle,
  packetHash: Hex,
  artifact: string
): ReceiptArtifact {
  if (artifact === "packet") {
    return {
      body: new TextEncoder().encode(bundle.draft.canonicalPacket),
      contentType: "application/json; charset=utf-8",
      filename: `proofrail-${packetHash.slice(2, 10)}-packet.json`
    };
  }
  const snapshot = artifact === "sec"
    ? bundle.secSnapshot
    : artifact === "gleif"
      ? bundle.gleifSnapshot
      : null;
  if (snapshot === null) {
    throw new WebServiceError("ARTIFACT_NOT_FOUND", "The receipt artifact was not found.", 404);
  }
  return {
    body: snapshot.body,
    contentType: snapshot.responseHeaders.contentType,
    filename: `proofrail-${packetHash.slice(2, 10)}-${artifact}-snapshot.json`
  };
}

export async function findRequiredBundle(
  packetHash: Hex,
  dependencies: Pick<ReceiptDependencies, "chainId" | "contractAddress" | "repository">
): Promise<ReceiptBundle> {
  const bundle = await dependencies.repository.findBundle(
    packetHash,
    dependencies.chainId,
    dependencies.contractAddress
  );
  if (bundle === null) {
    throw new WebServiceError("RECEIPT_NOT_FOUND", "The indexed receipt was not found.", 404);
  }
  return bundle;
}

function verifySavedIntegrity(
  bundle: ReceiptBundle,
  replayedCanonicalPacket: string,
  replayedHash: Hex
): boolean {
  const packet = bundle.draft.packet;
  return bundle.draft.canonicalPacket === replayedCanonicalPacket
    && bundle.draft.packetHash === replayedHash
    && bundle.receipt.packetHash === replayedHash
    && bundle.receipt.pairKey === bundle.draft.pairKey
    && bundle.receipt.cik === bundle.draft.cik
    && bundle.receipt.lei === bundle.draft.lei
    && bundle.receipt.issuedAt.getTime() === bundle.draft.issuedAt.getTime()
    && bundle.receipt.expiresAt.getTime() === bundle.draft.expiresAt.getTime()
    && bundle.secSnapshot.source === "SEC"
    && bundle.gleifSnapshot.source === "GLEIF"
    && hashSourceSnapshot(bundle.secSnapshot.body) === packet.sources.sec.snapshotHash
    && hashSourceSnapshot(bundle.gleifSnapshot.body) === packet.sources.gleif.snapshotHash
    && bundle.secSnapshot.snapshotHash === packet.sources.sec.snapshotHash
    && bundle.gleifSnapshot.snapshotHash === packet.sources.gleif.snapshotHash;
}

function sourceView(
  source: "SEC" | "GLEIF",
  evidence: RetrievedSecEvidence["evidence"] | RetrievedGleifEvidence["evidence"]
): ReceiptSourceView {
  if (source === "SEC" && evidence.source === "SEC") {
    return {
      latestFilingDate: evidence.latestFilingDate,
      latestFilingForm: evidence.latestFilingForm,
      legalName: evidence.legalName,
      retrievedAt: new Date(evidence.retrievedAt * 1_000).toISOString(),
      snapshotHash: evidence.snapshotHash ?? zeroHash(),
      source,
      sourceUrl: evidence.sourceUrl
    };
  }
  if (source === "GLEIF" && evidence.source === "GLEIF") {
    return {
      entityStatus: evidence.entityStatus,
      legalName: evidence.legalName,
      retrievedAt: new Date(evidence.retrievedAt * 1_000).toISOString(),
      snapshotHash: evidence.snapshotHash ?? zeroHash(),
      source,
      sourceUrl: evidence.sourceUrl
    };
  }
  throw new WebServiceError("SOURCE_MISMATCH", "The live source response was inconsistent.", 503);
}

export function parsePacketHash(value: string): Hex {
  const normalized = value.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    throw new WebServiceError("INVALID_PACKET_HASH", "The receipt packet hash is invalid.", 400);
  }
  return normalized as Hex;
}

function toUnixSeconds(value: Date): number {
  return Math.floor(value.getTime() / 1_000);
}

function zeroHash(): `0x${string}` {
  return `0x${"0".repeat(64)}`;
}
