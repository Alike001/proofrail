import {
  normalizeCik
} from "@proofrail/evidence-core";
import type { SecSourceEvidence } from "@proofrail/evidence-core";

import { SourceServiceError } from "./errors.js";
import { SerialIntervalGate } from "./rate-gate.js";
import type { RequestGate } from "./rate-gate.js";
import { fetchExactJson } from "./request.js";
import {
  requireArray,
  requireObject,
  requireString,
  schemaError
} from "./schema.js";
import type {
  RetrievedSecEvidence,
  SourceRequestDependencies
} from "./types.js";

const SEC_BASE_URL = "https://data.sec.gov/submissions";
const SEC_TIMEOUT_MS = 12_000;
const SEC_MAX_BODY_BYTES = 12 * 1024 * 1024;
const SEC_MINIMUM_INTERVAL_MS = 125;
const DEFAULT_GATE = new SerialIntervalGate(SEC_MINIMUM_INTERVAL_MS);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export interface SecClientConfig {
  readonly userAgent: string;
}

export interface SecClientDependencies extends SourceRequestDependencies {
  readonly gate?: RequestGate;
}

export class SecSubmissionsClient {
  readonly #userAgent: string;
  readonly #dependencies: SourceRequestDependencies;
  readonly #gate: RequestGate;

  constructor(
    config: SecClientConfig,
    dependencies: SecClientDependencies = {}
  ) {
    this.#userAgent = validateUserAgent(config.userAgent);
    this.#dependencies = dependencies;
    this.#gate = dependencies.gate ?? DEFAULT_GATE;
  }

  async retrieve(cikInput: string): Promise<RetrievedSecEvidence> {
    const cik = normalizeCik(cikInput);
    const sourceUrl = `${SEC_BASE_URL}/CIK${cik}.json`;
    const response = await this.#gate.run(() =>
      fetchExactJson(
        {
          source: "SEC",
          sourceUrl,
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
            "User-Agent": this.#userAgent
          },
          timeoutMs: SEC_TIMEOUT_MS,
          maxBodyBytes: SEC_MAX_BODY_BYTES
        },
        this.#dependencies
      )
    );
    const parsed = parseSecSubmissions(response.json, cik);
    const evidence: SecSourceEvidence = {
      source: "SEC",
      resolved: true,
      cik,
      legalName: parsed.legalName,
      latestFilingDate: parsed.latestFilingDate,
      latestFilingForm: parsed.latestFilingForm,
      retrievedAt: response.snapshot.retrievedAt,
      snapshotHash: response.snapshot.snapshotHash,
      sourceUrl
    };
    return { evidence, snapshot: response.snapshot };
  }
}

export function parseSecSubmissions(
  value: unknown,
  expectedCik: string
): {
  readonly legalName: string;
  readonly latestFilingDate: string | null;
  readonly latestFilingForm: string | null;
} {
  const root = requireObject(value, "SEC", "response");
  const actualCik = parseResponseCik(root.cik);
  if (actualCik !== expectedCik) {
    throw new SourceServiceError(
      "SOURCE_IDENTIFIER_MISMATCH",
      "SEC",
      `SEC returned CIK ${actualCik} for requested CIK ${expectedCik}.`
    );
  }
  const legalName = requireString(root.name, "SEC", "response.name");
  const filings = requireObject(root.filings, "SEC", "response.filings");
  const recent = requireObject(filings.recent, "SEC", "response.filings.recent");
  const dates = requireArray(
    recent.filingDate,
    "SEC",
    "response.filings.recent.filingDate"
  );
  const forms = requireArray(
    recent.form,
    "SEC",
    "response.filings.recent.form"
  );
  if (dates.length !== forms.length) {
    throw schemaError(
      "SEC",
      "SEC recent filing dates and forms must have the same length."
    );
  }

  let latestFilingDate: string | null = null;
  let latestFilingForm: string | null = null;
  for (const [index, dateValue] of dates.entries()) {
    const date = requireString(
      dateValue,
      "SEC",
      `response.filings.recent.filingDate[${String(index)}]`
    );
    const form = requireString(
      forms[index],
      "SEC",
      `response.filings.recent.form[${String(index)}]`
    );
    if (!isIsoDate(date)) {
      throw schemaError("SEC", `SEC filing date ${date} is invalid.`);
    }
    if (latestFilingDate === null || date > latestFilingDate) {
      latestFilingDate = date;
      latestFilingForm = form;
    }
  }

  return { legalName, latestFilingDate, latestFilingForm };
}

function parseResponseCik(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw schemaError("SEC", "response.cik must be a positive integer.");
    }
    return normalizeCik(String(value).padStart(10, "0"));
  }
  if (typeof value === "string" && /^\d{1,10}$/u.test(value)) {
    return normalizeCik(value.padStart(10, "0"));
  }
  throw schemaError("SEC", "response.cik must be an integer CIK.");
}

function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function validateUserAgent(value: string): string {
  const userAgent = value.trim();
  if (!/^.+\s+[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(userAgent)) {
    throw new SourceServiceError(
      "SOURCE_CONFIGURATION_ERROR",
      "SEC",
      "SEC_USER_AGENT must contain an application name and contact email."
    );
  }
  return userAgent;
}
