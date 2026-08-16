import { hashSourceSnapshot } from "@proofrail/evidence-core";

import {
  SourceServiceError,
  fetchExactJson
} from "../src/index.js";

const URL = "https://example.test/record";
const NOW_MS = 2_000_000_000_000;

function request(overrides: Partial<Parameters<typeof fetchExactJson>[0]> = {}) {
  return {
    source: "GLEIF" as const,
    sourceUrl: URL,
    headers: { Accept: "application/json" },
    timeoutMs: 1_000,
    maxBodyBytes: 1_024,
    ...overrides
  };
}

describe("exact JSON retrieval", () => {
  it("retains exact bytes, selected headers, retrieval time, and hash", async () => {
    const exactBody = '{"data":{"value":"é"}}\n';
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(new Response(exactBody, {
        headers: {
          "cache-control": "max-age=60",
          "content-type": "application/vnd.api+json; charset=utf-8",
          date: "Sun, 16 Aug 2026 17:10:00 GMT",
          etag: '"record-1"',
          "last-modified": "Sun, 16 Aug 2026 17:00:00 GMT"
        }
      }));
    const result = await fetchExactJson(request(), {
      fetchImpl,
      nowMs: () => NOW_MS
    });

    expect(new TextDecoder().decode(result.snapshot.body)).toBe(exactBody);
    expect(result.snapshot.snapshotHash).toBe(hashSourceSnapshot(exactBody));
    expect(result.snapshot.retrievedAt).toBe(NOW_MS / 1_000);
    expect(result.snapshot.responseHeaders).toEqual({
      cacheControl: "max-age=60",
      contentType: "application/vnd.api+json; charset=utf-8",
      date: "Sun, 16 Aug 2026 17:10:00 GMT",
      etag: '"record-1"',
      lastModified: "Sun, 16 Aug 2026 17:00:00 GMT"
    });
  });

  it.each([
    [404, "SOURCE_NOT_FOUND"],
    [403, "SOURCE_HTTP_ERROR"],
    [500, "SOURCE_HTTP_ERROR"]
  ])("classifies HTTP %i", async (status, code) => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(new Response("blocked", { status }));
    await expect(fetchExactJson(request(), { fetchImpl })).rejects.toMatchObject({
      code,
      status
    });
  });

  it("rejects a non-JSON content type", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response("<html></html>", {
          headers: { "content-type": "text/html" }
        })
      );
    await expect(fetchExactJson(request(), { fetchImpl })).rejects.toMatchObject({
      code: "SOURCE_CONTENT_TYPE_ERROR"
    });
  });

  it("rejects declared and actual oversized bodies", async () => {
    const declaredFetch: typeof fetch = () =>
      Promise.resolve(new Response("{}", {
        headers: { "content-length": "2048", "content-type": "application/json" }
      }));
    await expect(fetchExactJson(request(), { fetchImpl: declaredFetch })).rejects.toMatchObject({
      code: "SOURCE_BODY_TOO_LARGE"
    });

    const actualFetch: typeof fetch = () =>
      Promise.resolve(new Response(JSON.stringify({ value: "x".repeat(2_000) }), {
        headers: { "content-type": "application/json" }
      }));
    await expect(fetchExactJson(request(), { fetchImpl: actualFetch })).rejects.toMatchObject({
      code: "SOURCE_BODY_TOO_LARGE"
    });
  });

  it("rejects invalid UTF-8 and invalid JSON", async () => {
    const invalidUtf8: typeof fetch = () =>
      Promise.resolve(new Response(Uint8Array.from([0xc3, 0x28]), {
        headers: { "content-type": "application/json" }
      }));
    await expect(fetchExactJson(request(), { fetchImpl: invalidUtf8 })).rejects.toMatchObject({
      code: "SOURCE_INVALID_UTF8"
    });

    const invalidJson: typeof fetch = () =>
      Promise.resolve(
        new Response("{", { headers: { "content-type": "application/json" } })
      );
    await expect(fetchExactJson(request(), { fetchImpl: invalidJson })).rejects.toMatchObject({
      code: "SOURCE_INVALID_JSON"
    });
  });

  it("separates timeouts from other network failures", async () => {
    const timeoutFetch: typeof fetch = () =>
      Promise.reject(new DOMException("timed out", "TimeoutError"));
    await expect(fetchExactJson(request(), { fetchImpl: timeoutFetch })).rejects.toMatchObject({
      code: "SOURCE_TIMEOUT"
    });

    const networkFetch: typeof fetch = () =>
      Promise.reject(new Error("connection reset"));
    await expect(fetchExactJson(request(), { fetchImpl: networkFetch })).rejects.toBeInstanceOf(
      SourceServiceError
    );
    await expect(fetchExactJson(request(), { fetchImpl: networkFetch })).rejects.toMatchObject({
      code: "SOURCE_NETWORK_ERROR"
    });
  });
});
