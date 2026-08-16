import {
  SecSubmissionsClient,
  parseSecSubmissions
} from "../src/index.js";
import {
  CIK,
  NOW_MS,
  immediateGate,
  jsonResponse,
  secPayload
} from "./fixtures.js";

describe("SEC submissions adapter", () => {
  it("retrieves exact official evidence through a declared server agent", async () => {
    let capturedUrl = "";
    let capturedHeaders = new Headers();
    let capturedCache: RequestCache | undefined;
    const payload = secPayload();
    const fetchImpl: typeof fetch = (input, init) => {
      capturedUrl = input instanceof Request ? input.url : input.toString();
      capturedHeaders = new Headers(init?.headers);
      capturedCache = init?.cache;
      return Promise.resolve(
        jsonResponse(payload, { headers: { etag: '"sec-1"' } })
      );
    };
    const client = new SecSubmissionsClient(
      { userAgent: "ProofRail maintainer@example.com" },
      { fetchImpl, gate: immediateGate, nowMs: () => NOW_MS }
    );
    const result = await client.retrieve(CIK);

    expect(capturedUrl).toBe(`https://data.sec.gov/submissions/CIK${CIK}.json`);
    expect(capturedHeaders.get("user-agent")).toBe(
      "ProofRail maintainer@example.com"
    );
    expect(capturedCache).toBe("no-store");
    expect(result.evidence).toMatchObject({
      cik: CIK,
      latestFilingDate: "2026-08-01",
      latestFilingForm: "10-Q",
      legalName: "Apple Inc.",
      resolved: true,
      retrievedAt: NOW_MS / 1_000,
      source: "SEC"
    });
    expect(new TextDecoder().decode(result.snapshot.body)).toBe(
      JSON.stringify(payload)
    );
    expect(result.evidence.snapshotHash).toBe(result.snapshot.snapshotHash);
  });

  it("selects the newest filing rather than trusting response order", () => {
    const parsed = parseSecSubmissions(
      secPayload({
        filings: {
          recent: {
            filingDate: ["2025-01-01", "2026-07-30"],
            form: ["8-K", "10-Q"]
          }
        }
      }),
      CIK
    );
    expect(parsed).toMatchObject({
      latestFilingDate: "2026-07-30",
      latestFilingForm: "10-Q"
    });
  });

  it("accepts a numeric-string CIK in the official response", () => {
    expect(parseSecSubmissions(secPayload({ cik: "320193" }), CIK)).toMatchObject({
      legalName: "Apple Inc."
    });
  });

  it("allows a resolved entity with no filings", () => {
    expect(
      parseSecSubmissions(
        secPayload({ filings: { recent: { filingDate: [], form: [] } } }),
        CIK
      )
    ).toMatchObject({ latestFilingDate: null, latestFilingForm: null });
  });

  it("rejects mismatched identifiers and malformed filing columns", () => {
    expect(() => parseSecSubmissions(secPayload({ cik: 789019 }), CIK)).toThrow(
      expect.objectContaining({ code: "SOURCE_IDENTIFIER_MISMATCH" })
    );
    expect(() =>
      parseSecSubmissions(
        secPayload({
          filings: {
            recent: { filingDate: ["2026-08-01"], form: [] }
          }
        }),
        CIK
      )
    ).toThrow(expect.objectContaining({ code: "SOURCE_SCHEMA_ERROR" }));
    expect(() =>
      parseSecSubmissions(
        secPayload({
          filings: {
            recent: { filingDate: ["2026-02-30"], form: ["10-Q"] }
          }
        }),
        CIK
      )
    ).toThrow(expect.objectContaining({ code: "SOURCE_SCHEMA_ERROR" }));
    expect(() =>
      parseSecSubmissions(
        secPayload({
          filings: {
            recent: { filingDate: ["not-a-date"], form: ["10-Q"] }
          }
        }),
        CIK
      )
    ).toThrow(expect.objectContaining({ code: "SOURCE_SCHEMA_ERROR" }));
  });

  it.each([0, -1, 1.5, "not-a-cik"])(
    "rejects malformed response CIK %s",
    (cik) => {
      expect(() => parseSecSubmissions(secPayload({ cik }), CIK)).toThrow(
        expect.objectContaining({ code: "SOURCE_SCHEMA_ERROR" })
      );
    }
  );

  it("requires a truthful configured contact identity", () => {
    expect(
      () => new SecSubmissionsClient({ userAgent: "generic-bot" })
    ).toThrow(
      expect.objectContaining({
        code: "SOURCE_CONFIGURATION_ERROR",
        source: "SEC"
      })
    );
    expect(
      () => new SecSubmissionsClient({ userAgent: "ProofRail contact@example.com" })
    ).not.toThrow();
  });
});
