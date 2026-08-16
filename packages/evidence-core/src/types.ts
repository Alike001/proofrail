import type { Address, Hex } from "viem";

export const SCHEMA_VERSION = 1 as const;
export const POLICY_VERSION = 1 as const;
export const SOURCE_FRESHNESS_SECONDS = 10 * 60;
export const RECEIPT_LIFETIME_SECONDS = 24 * 60 * 60;
export const RECENT_FILING_MONTHS = 18;

export interface SecSourceEvidence {
  readonly source: "SEC";
  readonly resolved: boolean;
  readonly cik: string;
  readonly legalName: string | null;
  readonly latestFilingDate: string | null;
  readonly latestFilingForm: string | null;
  readonly retrievedAt: number;
  readonly snapshotHash: Hex | null;
  readonly sourceUrl: string;
}

export interface GleifSourceEvidence {
  readonly source: "GLEIF";
  readonly resolved: boolean;
  readonly lei: string;
  readonly legalName: string | null;
  readonly entityStatus: string | null;
  readonly retrievedAt: number;
  readonly snapshotHash: Hex | null;
  readonly sourceUrl: string;
}

export type PolicyCheckCode =
  | "SEC_IDENTIFIER_RESOLVED"
  | "GLEIF_IDENTIFIER_RESOLVED"
  | "LEGAL_NAME_MATCH"
  | "GLEIF_ENTITY_ACTIVE"
  | "SEC_RECENT_FILING"
  | "SEC_SNAPSHOT_FRESH"
  | "GLEIF_SNAPSHOT_FRESH";

export type PolicyCheckStatus = "PASS" | "FAIL" | "NOT_EVALUATED";

export interface PolicyCheck {
  readonly code: PolicyCheckCode;
  readonly status: PolicyCheckStatus;
  readonly observed: string;
}

export type PolicyFailureReason =
  | "SEC_IDENTIFIER_UNRESOLVED"
  | "GLEIF_IDENTIFIER_UNRESOLVED"
  | "LEGAL_NAME_MISMATCH"
  | "GLEIF_ENTITY_NOT_ACTIVE"
  | "SEC_RECENT_FILING_MISSING"
  | "SEC_SNAPSHOT_STALE"
  | "GLEIF_SNAPSHOT_STALE"
  | "SEC_SNAPSHOT_FROM_FUTURE"
  | "GLEIF_SNAPSHOT_FROM_FUTURE";

export interface PolicyEvaluation {
  readonly passed: boolean;
  readonly checks: readonly PolicyCheck[];
  readonly failureReasons: readonly PolicyFailureReason[];
  readonly normalizedSecName: string | null;
  readonly normalizedGleifName: string | null;
  readonly recentFilingCutoff: string;
}

export interface EvidenceBuildInput {
  readonly chainId: number;
  readonly registryAddress: string;
  readonly nonce: string;
  readonly issuedAt: number;
  readonly sec: SecSourceEvidence;
  readonly gleif: GleifSourceEvidence;
}

export interface EvidencePacketV1 {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly policyVersion: typeof POLICY_VERSION;
  readonly chainId: number;
  readonly registryAddress: Address;
  readonly identifiers: {
    readonly cik: string;
    readonly lei: string;
  };
  readonly sources: {
    readonly sec: SecSourceEvidence & {
      readonly normalizedLegalName: string | null;
    };
    readonly gleif: GleifSourceEvidence & {
      readonly normalizedLegalName: string | null;
    };
  };
  readonly policy: {
    readonly passed: boolean;
    readonly checks: readonly PolicyCheck[];
    readonly failureReasons: readonly PolicyFailureReason[];
    readonly recentFilingCutoff: string;
  };
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly nonce: Hex;
}

export interface HashedEvidencePacket {
  readonly packet: EvidencePacketV1;
  readonly canonicalPacket: string;
  readonly packetHash: Hex;
}

export interface ReplayResult {
  readonly deterministic: boolean;
  readonly providedCanonicalPacket: string;
  readonly providedPacketHash: Hex;
  readonly replayed: HashedEvidencePacket;
}
