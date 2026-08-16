import { EvidenceValidationError } from "../src/index.js";
import {
  normalizeNonce,
  normalizeRegistryAddress,
  validateChainId,
  validateGleifEvidence,
  validateSecEvidence,
  validateTimestamp
} from "../src/validation.js";
import {
  GLEIF_HASH,
  NONCE,
  SEC_HASH,
  makeGleif,
  makeSec
} from "./fixtures.js";

describe("packet field validation", () => {
  it("normalizes valid scalar fields", () => {
    const uppercaseAddress = "0x000000000000000000000000000000000000ABCD";
    expect(validateChainId(677)).toBe(677);
    expect(normalizeRegistryAddress(uppercaseAddress)).toBe(
      "0x000000000000000000000000000000000000abcd"
    );
    expect(normalizeNonce(NONCE.toUpperCase().replace("0X", "0x"))).toBe(NONCE);
    expect(validateTimestamp(0, "time")).toBe(0);
  });

  it.each([0, -1, 1.5])("rejects invalid chain ID %s", (value) => {
    expect(() => validateChainId(value)).toThrow(EvidenceValidationError);
  });

  it.each([-1, 1.5])("rejects invalid timestamp %s", (value) => {
    expect(() => validateTimestamp(value, "time")).toThrow(
      EvidenceValidationError
    );
  });

  it.each([
    "0x0000000000000000000000000000000000000000z",
    "not-an-address"
  ])("rejects invalid address %s", (value) => {
    expect(() => normalizeRegistryAddress(value)).toThrow(
      EvidenceValidationError
    );
  });

  it.each([`0x${"0".repeat(64)}`, "0x1234"])(
    "rejects invalid nonce %s",
    (value) => {
      expect(() => normalizeNonce(value)).toThrow(EvidenceValidationError);
    }
  );
});

describe("SEC evidence validation", () => {
  it("accepts resolved and clean unresolved evidence", () => {
    expect(validateSecEvidence(makeSec()).snapshotHash).toBe(SEC_HASH);
    expect(
      validateSecEvidence(
        makeSec({
          resolved: false,
          legalName: null,
          latestFilingDate: null,
          latestFilingForm: null,
          snapshotHash: null
        })
      ).resolved
    ).toBe(false);
  });

  it.each([
    makeSec({ legalName: " " }),
    makeSec({ snapshotHash: "0x12" }),
    makeSec({ latestFilingDate: "2026/08/01" }),
    makeSec({ latestFilingDate: "2026-02-30" }),
    makeSec({ latestFilingForm: null }),
    makeSec({ latestFilingDate: null, latestFilingForm: "10-Q" }),
    makeSec({ resolved: false, legalName: "Apple Inc." }),
    makeSec({ sourceUrl: "not a url" }),
    makeSec({ sourceUrl: "http://data.sec.gov/example" })
  ])("rejects inconsistent SEC evidence", (evidence) => {
    expect(() => validateSecEvidence(evidence)).toThrow(
      EvidenceValidationError
    );
  });
});

describe("GLEIF evidence validation", () => {
  it("accepts resolved and clean unresolved evidence", () => {
    expect(validateGleifEvidence(makeGleif()).snapshotHash).toBe(GLEIF_HASH);
    expect(
      validateGleifEvidence(
        makeGleif({
          resolved: false,
          legalName: null,
          entityStatus: null,
          snapshotHash: null
        })
      ).resolved
    ).toBe(false);
  });

  it.each([
    makeGleif({ legalName: "" }),
    makeGleif({ entityStatus: "" }),
    makeGleif({ snapshotHash: "0x12" }),
    makeGleif({ resolved: false, entityStatus: "ACTIVE" })
  ])("rejects inconsistent GLEIF evidence", (evidence) => {
    expect(() => validateGleifEvidence(evidence)).toThrow(
      EvidenceValidationError
    );
  });
});
