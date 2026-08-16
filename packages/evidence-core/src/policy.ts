import { normalizeLegalName } from "./normalize.js";
import type {
  GleifSourceEvidence,
  PolicyCheck,
  PolicyCheckStatus,
  PolicyEvaluation,
  PolicyFailureReason,
  SecSourceEvidence
} from "./types.js";
import {
  RECENT_FILING_MONTHS,
  SOURCE_FRESHNESS_SECONDS
} from "./types.js";
import {
  validateGleifEvidence,
  validateSecEvidence,
  validateTimestamp
} from "./validation.js";

export interface PolicyInput {
  readonly sec: SecSourceEvidence;
  readonly gleif: GleifSourceEvidence;
  readonly issuedAt: number;
}

export function evaluatePolicy(input: PolicyInput): PolicyEvaluation {
  const sec = validateSecEvidence(input.sec);
  const gleif = validateGleifEvidence(input.gleif);
  const issuedAt = validateTimestamp(input.issuedAt, "Packet issue time");
  const recentFilingCutoff = subtractCalendarMonths(
    issuedAt,
    RECENT_FILING_MONTHS
  );
  const normalizedSecName = normalizeResolvedName(sec.resolved, sec.legalName);
  const normalizedGleifName = normalizeResolvedName(
    gleif.resolved,
    gleif.legalName
  );
  const checks: PolicyCheck[] = [];
  const failureReasons: PolicyFailureReason[] = [];

  checks.push(
    check(
      "SEC_IDENTIFIER_RESOLVED",
      sec.resolved ? "PASS" : "FAIL",
      sec.resolved ? sec.cik : "unresolved"
    )
  );
  if (!sec.resolved) {
    failureReasons.push("SEC_IDENTIFIER_UNRESOLVED");
  }

  checks.push(
    check(
      "GLEIF_IDENTIFIER_RESOLVED",
      gleif.resolved ? "PASS" : "FAIL",
      gleif.resolved ? gleif.lei : "unresolved"
    )
  );
  if (!gleif.resolved) {
    failureReasons.push("GLEIF_IDENTIFIER_UNRESOLVED");
  }

  if (sec.resolved && gleif.resolved) {
    const namesMatch =
      normalizedSecName !== "" && normalizedSecName === normalizedGleifName;
    checks.push(
      check(
        "LEGAL_NAME_MATCH",
        namesMatch ? "PASS" : "FAIL",
        `${normalizedSecName ?? ""}|${normalizedGleifName ?? ""}`
      )
    );
    if (!namesMatch) {
      failureReasons.push("LEGAL_NAME_MISMATCH");
    }
  } else {
    checks.push(check("LEGAL_NAME_MATCH", "NOT_EVALUATED", "source unresolved"));
  }

  if (gleif.resolved) {
    const normalizedStatus = (gleif.entityStatus ?? "").trim().toUpperCase();
    const active = normalizedStatus === "ACTIVE";
    checks.push(
      check("GLEIF_ENTITY_ACTIVE", active ? "PASS" : "FAIL", normalizedStatus)
    );
    if (!active) {
      failureReasons.push("GLEIF_ENTITY_NOT_ACTIVE");
    }
  } else {
    checks.push(
      check("GLEIF_ENTITY_ACTIVE", "NOT_EVALUATED", "source unresolved")
    );
  }

  if (sec.resolved) {
    const filingIsRecent =
      sec.latestFilingDate !== null &&
      sec.latestFilingDate >= recentFilingCutoff;
    checks.push(
      check(
        "SEC_RECENT_FILING",
        filingIsRecent ? "PASS" : "FAIL",
        sec.latestFilingDate ?? "missing"
      )
    );
    if (!filingIsRecent) {
      failureReasons.push("SEC_RECENT_FILING_MISSING");
    }
  } else {
    checks.push(
      check("SEC_RECENT_FILING", "NOT_EVALUATED", "source unresolved")
    );
  }

  const secFreshness = evaluateFreshness(
    "SEC_SNAPSHOT_FRESH",
    sec.resolved,
    sec.retrievedAt,
    issuedAt,
    "SEC_SNAPSHOT_STALE",
    "SEC_SNAPSHOT_FROM_FUTURE"
  );
  checks.push(secFreshness.check);
  if (secFreshness.failureReason !== null) {
    failureReasons.push(secFreshness.failureReason);
  }

  const gleifFreshness = evaluateFreshness(
    "GLEIF_SNAPSHOT_FRESH",
    gleif.resolved,
    gleif.retrievedAt,
    issuedAt,
    "GLEIF_SNAPSHOT_STALE",
    "GLEIF_SNAPSHOT_FROM_FUTURE"
  );
  checks.push(gleifFreshness.check);
  if (gleifFreshness.failureReason !== null) {
    failureReasons.push(gleifFreshness.failureReason);
  }

  return {
    passed: checks.every((item) => item.status === "PASS"),
    checks,
    failureReasons,
    normalizedSecName,
    normalizedGleifName,
    recentFilingCutoff
  };
}

function check(
  code: PolicyCheck["code"],
  status: PolicyCheckStatus,
  observed: string
): PolicyCheck {
  return { code, status, observed };
}

function evaluateFreshness(
  code: "SEC_SNAPSHOT_FRESH" | "GLEIF_SNAPSHOT_FRESH",
  resolved: boolean,
  retrievedAt: number,
  issuedAt: number,
  staleReason: "SEC_SNAPSHOT_STALE" | "GLEIF_SNAPSHOT_STALE",
  futureReason:
    | "SEC_SNAPSHOT_FROM_FUTURE"
    | "GLEIF_SNAPSHOT_FROM_FUTURE"
): {
  readonly check: PolicyCheck;
  readonly failureReason: PolicyFailureReason | null;
} {
  if (!resolved) {
    return {
      check: check(code, "NOT_EVALUATED", "source unresolved"),
      failureReason: null
    };
  }

  const age = issuedAt - retrievedAt;
  if (age < 0) {
    return {
      check: check(code, "FAIL", `${String(age)} seconds`),
      failureReason: futureReason
    };
  }

  if (age > SOURCE_FRESHNESS_SECONDS) {
    return {
      check: check(code, "FAIL", `${String(age)} seconds`),
      failureReason: staleReason
    };
  }

  return {
    check: check(code, "PASS", `${String(age)} seconds`),
    failureReason: null
  };
}

function normalizeResolvedName(
  resolved: boolean,
  legalName: string | null
): string | null {
  return resolved && legalName !== null ? normalizeLegalName(legalName) : null;
}

function subtractCalendarMonths(timestamp: number, months: number): string {
  const date = new Date(timestamp * 1000);
  const sourceYear = date.getUTCFullYear();
  const sourceMonth = date.getUTCMonth();
  const sourceDay = date.getUTCDate();
  const absoluteMonth = sourceYear * 12 + sourceMonth - months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = absoluteMonth - targetYear * 12;
  const lastTargetDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate();
  const targetDay = Math.min(sourceDay, lastTargetDay);

  return [
    String(targetYear).padStart(4, "0"),
    String(targetMonth + 1).padStart(2, "0"),
    String(targetDay).padStart(2, "0")
  ].join("-");
}
