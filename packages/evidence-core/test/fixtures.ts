import type {
  EvidenceBuildInput,
  GleifSourceEvidence,
  SecSourceEvidence
} from "../src/index.js";

export const ISSUED_AT = Math.floor(Date.UTC(2026, 7, 16, 12, 0, 0) / 1000);
export const CIK = "0000320193";
export const LEI = "5493001KJTIIGC8Y1R12";
export const REGISTRY_ADDRESS = "0x0000000000000000000000000000000000000677";
export const NONCE = `0x${"0".repeat(63)}1` as const;
export const SEC_HASH = `0x${"1".repeat(64)}` as const;
export const GLEIF_HASH = `0x${"2".repeat(64)}` as const;

export function makeSec(
  overrides: Partial<SecSourceEvidence> = {}
): SecSourceEvidence {
  return {
    source: "SEC",
    resolved: true,
    cik: CIK,
    legalName: "Apple Inc.",
    latestFilingDate: "2026-08-01",
    latestFilingForm: "10-Q",
    retrievedAt: ISSUED_AT - 30,
    snapshotHash: SEC_HASH,
    sourceUrl: `https://data.sec.gov/submissions/CIK${CIK}.json`,
    ...overrides
  };
}

export function makeGleif(
  overrides: Partial<GleifSourceEvidence> = {}
): GleifSourceEvidence {
  return {
    source: "GLEIF",
    resolved: true,
    lei: LEI,
    legalName: "APPLE INC",
    entityStatus: "ACTIVE",
    retrievedAt: ISSUED_AT - 20,
    snapshotHash: GLEIF_HASH,
    sourceUrl: `https://api.gleif.org/api/v1/lei-records/${LEI}`,
    ...overrides
  };
}

export function makeInput(
  overrides: Partial<EvidenceBuildInput> = {}
): EvidenceBuildInput {
  return {
    chainId: 677,
    registryAddress: REGISTRY_ADDRESS,
    nonce: NONCE,
    issuedAt: ISSUED_AT,
    sec: makeSec(),
    gleif: makeGleif(),
    ...overrides
  };
}
