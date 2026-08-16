import {
  encodePacked,
  keccak256,
  stringToHex
} from "viem";
import type { Hex } from "viem";

import { canonicalize } from "./canonical.js";
import type { CanonicalValue } from "./canonical.js";
import { hashCanonicalPacket } from "./hashing.js";
import { normalizeCik, normalizeLei } from "./identifiers.js";
import { evaluatePolicy } from "./policy.js";
import type {
  EvidenceBuildInput,
  EvidencePacketV1,
  GleifSourceEvidence,
  HashedEvidencePacket,
  ReplayResult,
  SecSourceEvidence
} from "./types.js";
import {
  POLICY_VERSION,
  RECEIPT_LIFETIME_SECONDS,
  SCHEMA_VERSION
} from "./types.js";
import {
  normalizeNonce,
  normalizeRegistryAddress,
  validateChainId,
  validateTimestamp
} from "./validation.js";

export function createEvidencePacket(
  input: EvidenceBuildInput
): HashedEvidencePacket {
  const chainId = validateChainId(input.chainId);
  const registryAddress = normalizeRegistryAddress(input.registryAddress);
  const nonce = normalizeNonce(input.nonce);
  const issuedAt = validateTimestamp(input.issuedAt, "Packet issue time");
  const cik = normalizeCik(input.sec.cik);
  const lei = normalizeLei(input.gleif.lei);
  const evaluation = evaluatePolicy({
    sec: input.sec,
    gleif: input.gleif,
    issuedAt
  });
  const secSource = copySecSource(input.sec);
  const gleifSource = copyGleifSource(input.gleif);

  const packet: EvidencePacketV1 = {
    schemaVersion: SCHEMA_VERSION,
    policyVersion: POLICY_VERSION,
    chainId,
    registryAddress,
    identifiers: { cik, lei },
    sources: {
      sec: {
        ...secSource,
        cik,
        normalizedLegalName: evaluation.normalizedSecName
      },
      gleif: {
        ...gleifSource,
        lei,
        normalizedLegalName: evaluation.normalizedGleifName
      }
    },
    policy: {
      passed: evaluation.passed,
      checks: evaluation.checks,
      failureReasons: evaluation.failureReasons,
      recentFilingCutoff: evaluation.recentFilingCutoff
    },
    issuedAt,
    expiresAt: issuedAt + RECEIPT_LIFETIME_SECONDS,
    nonce
  };
  const canonicalPacket = canonicalize(
    packet as unknown as CanonicalValue
  );

  return {
    packet,
    canonicalPacket,
    packetHash: hashCanonicalPacket(canonicalPacket)
  };
}

export function replayEvidencePacket(packet: EvidencePacketV1): ReplayResult {
  const providedCanonicalPacket = canonicalize(
    packet as unknown as CanonicalValue
  );
  const replayed = createEvidencePacket({
    chainId: packet.chainId,
    registryAddress: packet.registryAddress,
    nonce: packet.nonce,
    issuedAt: packet.issuedAt,
    sec: stripSecDerivedFields(packet.sources.sec),
    gleif: stripGleifDerivedFields(packet.sources.gleif)
  });

  return {
    deterministic: providedCanonicalPacket === replayed.canonicalPacket,
    providedCanonicalPacket,
    providedPacketHash: hashCanonicalPacket(providedCanonicalPacket),
    replayed
  };
}

export function computePairKey(cikInput: string, leiInput: string): Hex {
  const cik = normalizeCik(cikInput);
  const lei = normalizeLei(leiInput);
  return keccak256(
    encodePacked(
      ["uint64", "bytes20"],
      [BigInt(cik), stringToHex(lei, { size: 20 })]
    )
  );
}

function stripSecDerivedFields(
  source: EvidencePacketV1["sources"]["sec"]
): SecSourceEvidence {
  return copySecSource(source);
}

function copySecSource(source: SecSourceEvidence): SecSourceEvidence {
  return {
    source: "SEC",
    resolved: source.resolved,
    cik: source.cik,
    legalName: source.legalName,
    latestFilingDate: source.latestFilingDate,
    latestFilingForm: source.latestFilingForm,
    retrievedAt: source.retrievedAt,
    snapshotHash: source.snapshotHash,
    sourceUrl: source.sourceUrl
  };
}

function stripGleifDerivedFields(
  source: EvidencePacketV1["sources"]["gleif"]
): GleifSourceEvidence {
  return copyGleifSource(source);
}

function copyGleifSource(source: GleifSourceEvidence): GleifSourceEvidence {
  return {
    source: "GLEIF",
    resolved: source.resolved,
    lei: source.lei,
    legalName: source.legalName,
    entityStatus: source.entityStatus,
    retrievedAt: source.retrievedAt,
    snapshotHash: source.snapshotHash,
    sourceUrl: source.sourceUrl
  };
}
