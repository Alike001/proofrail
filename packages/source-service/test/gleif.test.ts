import {
  GleifLeiClient,
  parseGleifLeiRecord
} from "../src/index.js";
import {
  LEI,
  NOW_MS,
  gleifPayload,
  jsonResponse
} from "./fixtures.js";

describe("GLEIF LEI adapter", () => {
  it("retrieves exact evidence from the JSON:API record", async () => {
    let acceptHeader: string | null = null;
    const payload = gleifPayload();
    const fetchImpl: typeof fetch = (_input, init) => {
      acceptHeader = new Headers(init?.headers).get("accept");
      return Promise.resolve(
        jsonResponse(payload, {
          headers: { "content-type": "application/vnd.api+json" }
        })
      );
    };
    const client = new GleifLeiClient({ fetchImpl, nowMs: () => NOW_MS });
    const result = await client.retrieve(LEI.toLowerCase());

    expect(acceptHeader).toBe("application/vnd.api+json");
    expect(result.evidence).toMatchObject({
      entityStatus: "ACTIVE",
      legalName: "Apple Inc.",
      lei: LEI,
      resolved: true,
      retrievedAt: NOW_MS / 1_000,
      source: "GLEIF"
    });
    expect(new TextDecoder().decode(result.snapshot.body)).toBe(
      JSON.stringify(payload)
    );
    expect(result.evidence.snapshotHash).toBe(result.snapshot.snapshotHash);
  });

  it("accepts harmless new fields", () => {
    expect(
      parseGleifLeiRecord(
        gleifPayload({ futureTopLevelField: { addedByGleif: true } }),
        LEI
      )
    ).toEqual({ entityStatus: "ACTIVE", legalName: "Apple Inc." });
  });

  it("rejects identifier mismatch in either identity field", () => {
    const otherLei = "5493001KJTIIGC8Y1R12";
    expect(() =>
      parseGleifLeiRecord(
        gleifPayload({
          data: {
            type: "lei-records",
            id: otherLei,
            attributes: {
              lei: otherLei,
              entity: {
                legalName: { name: "Bloomberg Finance L.P." },
                status: "ACTIVE"
              }
            }
          }
        }),
        LEI
      )
    ).toThrow(expect.objectContaining({ code: "SOURCE_IDENTIFIER_MISMATCH" }));
  });

  it("rejects unsupported types and malformed LEIs", () => {
    const payload = gleifPayload();
    expect(() =>
      parseGleifLeiRecord(
        { ...payload, data: { ...(payload.data as object), type: "lei-issuers" } },
        LEI
      )
    ).toThrow(expect.objectContaining({ code: "SOURCE_SCHEMA_ERROR" }));
    expect(() =>
      parseGleifLeiRecord(
        {
          ...payload,
          data: { ...(payload.data as object), id: "invalid" }
        },
        LEI
      )
    ).toThrow(expect.objectContaining({ code: "SOURCE_SCHEMA_ERROR" }));
    expect(() =>
      parseGleifLeiRecord(
        {
          ...payload,
          data: { ...(payload.data as object), id: "" }
        },
        LEI
      )
    ).toThrow(expect.objectContaining({ code: "SOURCE_SCHEMA_ERROR" }));
  });
});
