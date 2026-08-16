export const CIK = "0000320193";
export const LEI = "HWUPKR0MPOU8FGXBT394";
export const NOW_MS = Date.UTC(2026, 7, 16, 17, 10, 0);

export function secPayload(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    cik: 320193,
    name: "Apple Inc.",
    filings: {
      recent: {
        filingDate: ["2026-08-01", "2026-05-02"],
        form: ["10-Q", "8-K"]
      }
    },
    tickers: ["AAPL"],
    ...overrides
  };
}

export function gleifPayload(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    meta: { goldenCopy: { publishDate: "2026-08-16T08:00:00Z" } },
    data: {
      type: "lei-records",
      id: LEI,
      attributes: {
        lei: LEI,
        entity: {
          legalName: { name: "Apple Inc.", language: "en" },
          status: "ACTIVE",
          otherNames: [{ name: "Apple Computer, Inc." }]
        },
        registration: { status: "ISSUED" }
      }
    },
    ...overrides
  };
}

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {}
): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

export const immediateGate = {
  run<T>(task: () => Promise<T>): Promise<T> {
    return task();
  }
};
