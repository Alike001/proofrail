import { getAddress, isAddress } from "viem";

import { EvidenceValidationError } from "./errors.js";
import { normalizeCik, normalizeLei } from "./identifiers.js";
import type {
  GleifSourceEvidence,
  SecSourceEvidence
} from "./types.js";

const BYTES_32_PATTERN = /^0x[0-9a-fA-F]{64}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export function validateChainId(chainId: number): number {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new EvidenceValidationError(
      "INVALID_CHAIN_ID",
      "Chain ID must be a positive safe integer."
    );
  }

  return chainId;
}

export function normalizeRegistryAddress(input: string): `0x${string}` {
  if (!isAddress(input, { strict: false })) {
    throw new EvidenceValidationError(
      "INVALID_REGISTRY_ADDRESS",
      "Registry address must be a valid EVM address."
    );
  }

  return getAddress(input.toLowerCase()).toLowerCase() as `0x${string}`;
}

export function normalizeNonce(input: string): `0x${string}` {
  if (!BYTES_32_PATTERN.test(input) || /^0x0{64}$/u.test(input)) {
    throw new EvidenceValidationError(
      "INVALID_NONCE",
      "Nonce must be a non-zero 32-byte hexadecimal value."
    );
  }

  return input.toLowerCase() as `0x${string}`;
}

export function validateTimestamp(input: number, label: string): number {
  if (!Number.isSafeInteger(input) || input < 0) {
    throw new EvidenceValidationError(
      "INVALID_TIMESTAMP",
      `${label} must be a non-negative Unix timestamp in seconds.`
    );
  }

  return input;
}

export function validateSecEvidence(
  evidence: SecSourceEvidence
): SecSourceEvidence {
  normalizeCik(evidence.cik);
  validateTimestamp(evidence.retrievedAt, "SEC retrieval time");
  validateSourceUrl(evidence.sourceUrl, "SEC");

  if (evidence.resolved) {
    assertNonEmpty(evidence.legalName, "Resolved SEC evidence requires a legal name.");
    assertSnapshotHash(evidence.snapshotHash, "SEC");

    if (evidence.latestFilingDate !== null) {
      validateDateOnly(evidence.latestFilingDate, "SEC filing date");
      assertNonEmpty(
        evidence.latestFilingForm,
        "An SEC filing date requires a filing form."
      );
    } else if (evidence.latestFilingForm !== null) {
      throw new EvidenceValidationError(
        "INVALID_SOURCE_EVIDENCE",
        "An SEC filing form cannot exist without a filing date."
      );
    }
  } else {
    assertUnresolvedFields(
      [
        evidence.legalName,
        evidence.latestFilingDate,
        evidence.latestFilingForm,
        evidence.snapshotHash
      ],
      "SEC"
    );
  }

  return evidence;
}

export function validateGleifEvidence(
  evidence: GleifSourceEvidence
): GleifSourceEvidence {
  normalizeLei(evidence.lei);
  validateTimestamp(evidence.retrievedAt, "GLEIF retrieval time");
  validateSourceUrl(evidence.sourceUrl, "GLEIF");

  if (evidence.resolved) {
    assertNonEmpty(
      evidence.legalName,
      "Resolved GLEIF evidence requires a legal name."
    );
    assertNonEmpty(
      evidence.entityStatus,
      "Resolved GLEIF evidence requires an entity status."
    );
    assertSnapshotHash(evidence.snapshotHash, "GLEIF");
  } else {
    assertUnresolvedFields(
      [evidence.legalName, evidence.entityStatus, evidence.snapshotHash],
      "GLEIF"
    );
  }

  return evidence;
}

function assertNonEmpty(
  value: string | null,
  message: string
): asserts value is string {
  if (value === null || value.trim() === "") {
    throw new EvidenceValidationError("INVALID_SOURCE_EVIDENCE", message);
  }
}

function assertSnapshotHash(
  value: string | null,
  source: string
): asserts value is `0x${string}` {
  if (value === null || !BYTES_32_PATTERN.test(value)) {
    throw new EvidenceValidationError(
      "INVALID_SOURCE_EVIDENCE",
      `${source} snapshot hash must be a 32-byte hexadecimal value.`
    );
  }
}

function assertUnresolvedFields(
  values: readonly (string | null)[],
  source: string
): void {
  if (values.some((value) => value !== null)) {
    throw new EvidenceValidationError(
      "INVALID_SOURCE_EVIDENCE",
      `Unresolved ${source} evidence cannot contain resolved record fields.`
    );
  }
}

function validateDateOnly(value: string, label: string): void {
  if (!DATE_PATTERN.test(value)) {
    throw new EvidenceValidationError(
      "INVALID_SOURCE_EVIDENCE",
      `${label} must use YYYY-MM-DD.`
    );
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new EvidenceValidationError(
      "INVALID_SOURCE_EVIDENCE",
      `${label} must be a real calendar date.`
    );
  }
}

function validateSourceUrl(value: string, source: string): void {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new EvidenceValidationError(
      "INVALID_SOURCE_EVIDENCE",
      `${source} source URL is invalid.`
    );
  }

  if (parsed.protocol !== "https:") {
    throw new EvidenceValidationError(
      "INVALID_SOURCE_EVIDENCE",
      `${source} source URL must use HTTPS.`
    );
  }
}
