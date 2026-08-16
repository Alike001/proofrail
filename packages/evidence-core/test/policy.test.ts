import { evaluatePolicy } from "../src/index.js";
import { ISSUED_AT, makeGleif, makeSec } from "./fixtures.js";

function reasonCodes(
  sec = makeSec(),
  gleif = makeGleif(),
  issuedAt = ISSUED_AT
): readonly string[] {
  return evaluatePolicy({ sec, gleif, issuedAt }).failureReasons;
}

describe("policy version 1", () => {
  it("passes matching, active, recent, and fresh evidence", () => {
    const evaluation = evaluatePolicy({
      sec: makeSec(),
      gleif: makeGleif(),
      issuedAt: ISSUED_AT
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.failureReasons).toEqual([]);
    expect(evaluation.checks).toHaveLength(7);
    expect(evaluation.checks.every((check) => check.status === "PASS")).toBe(
      true
    );
    expect(evaluation.normalizedSecName).toBe("apple inc");
    expect(evaluation.normalizedGleifName).toBe("apple inc");
    expect(evaluation.recentFilingCutoff).toBe("2025-02-16");
  });

  it("fails a legal-name mismatch without fuzzy matching", () => {
    expect(reasonCodes(makeSec(), makeGleif({ legalName: "Apple Holdings" }))).toContain(
      "LEGAL_NAME_MISMATCH"
    );
  });

  it("fails an inactive GLEIF record", () => {
    expect(reasonCodes(makeSec(), makeGleif({ entityStatus: "inactive" }))).toContain(
      "GLEIF_ENTITY_NOT_ACTIVE"
    );
  });

  it.each([null, "2025-02-15"])(
    "fails missing or old SEC filing date %s",
    (latestFilingDate) => {
      const latestFilingForm = latestFilingDate === null ? null : "10-K";
      expect(
        reasonCodes(makeSec({ latestFilingDate, latestFilingForm }))
      ).toContain("SEC_RECENT_FILING_MISSING");
    }
  );

  it("passes the exact eighteen-month filing boundary", () => {
    expect(reasonCodes(makeSec({ latestFilingDate: "2025-02-16" }))).not.toContain(
      "SEC_RECENT_FILING_MISSING"
    );
  });

  it("clamps month-end cutoffs to the target calendar month", () => {
    const august31 = Math.floor(Date.UTC(2026, 7, 31, 12) / 1000);
    const evaluation = evaluatePolicy({
      sec: makeSec({
        latestFilingDate: "2025-02-28",
        retrievedAt: august31
      }),
      gleif: makeGleif({ retrievedAt: august31 }),
      issuedAt: august31
    });
    expect(evaluation.recentFilingCutoff).toBe("2025-02-28");
    expect(evaluation.passed).toBe(true);
  });

  it("passes snapshots at exactly ten minutes old", () => {
    expect(
      evaluatePolicy({
        sec: makeSec({ retrievedAt: ISSUED_AT - 600 }),
        gleif: makeGleif({ retrievedAt: ISSUED_AT - 600 }),
        issuedAt: ISSUED_AT
      }).passed
    ).toBe(true);
  });

  it("reports stale sources independently", () => {
    expect(reasonCodes(makeSec({ retrievedAt: ISSUED_AT - 601 }))).toContain(
      "SEC_SNAPSHOT_STALE"
    );
    expect(
      reasonCodes(makeSec(), makeGleif({ retrievedAt: ISSUED_AT - 601 }))
    ).toContain("GLEIF_SNAPSHOT_STALE");
  });

  it("rejects source timestamps from the future", () => {
    const reasons = reasonCodes(
      makeSec({ retrievedAt: ISSUED_AT + 1 }),
      makeGleif({ retrievedAt: ISSUED_AT + 1 })
    );
    expect(reasons).toContain("SEC_SNAPSHOT_FROM_FUTURE");
    expect(reasons).toContain("GLEIF_SNAPSHOT_FROM_FUTURE");
  });

  it("records unresolved root causes and skips dependent checks", () => {
    const evaluation = evaluatePolicy({
      sec: makeSec({
        resolved: false,
        legalName: null,
        latestFilingDate: null,
        latestFilingForm: null,
        snapshotHash: null
      }),
      gleif: makeGleif({
        resolved: false,
        legalName: null,
        entityStatus: null,
        snapshotHash: null
      }),
      issuedAt: ISSUED_AT
    });

    expect(evaluation.passed).toBe(false);
    expect(evaluation.failureReasons).toEqual([
      "SEC_IDENTIFIER_UNRESOLVED",
      "GLEIF_IDENTIFIER_UNRESOLVED"
    ]);
    expect(
      evaluation.checks.filter((check) => check.status === "NOT_EVALUATED")
    ).toHaveLength(5);
  });
});
