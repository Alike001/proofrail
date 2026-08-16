import { hashSourceSnapshot } from "@proofrail/evidence-core";

import { SourceServiceError } from "./errors.js";
import type { SourceName } from "./errors.js";
import type {
  CapturedResponseHeaders,
  SourceRequestDependencies,
  SourceSnapshot
} from "./types.js";

const JSON_MEDIA_TYPES = new Set([
  "application/json",
  "application/vnd.api+json"
]);

export interface ExactJsonRequest {
  readonly source: SourceName;
  readonly sourceUrl: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxBodyBytes: number;
}

export interface ExactJsonResponse {
  readonly json: unknown;
  readonly snapshot: SourceSnapshot;
}

export async function fetchExactJson(
  request: ExactJsonRequest,
  dependencies: SourceRequestDependencies = {}
): Promise<ExactJsonResponse> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const nowMs = dependencies.nowMs ?? Date.now;
  let response: Response;

  try {
    response = await fetchImpl(request.sourceUrl, {
      cache: "no-store",
      headers: request.headers,
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(request.timeoutMs)
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new SourceServiceError(
        "SOURCE_TIMEOUT",
        request.source,
        `${request.source} did not respond within ${String(request.timeoutMs)}ms.`,
        { cause: error }
      );
    }
    throw new SourceServiceError(
      "SOURCE_NETWORK_ERROR",
      request.source,
      `${request.source} could not be reached.`,
      { cause: error }
    );
  }

  if (!response.ok) {
    const code = response.status === 404 ? "SOURCE_NOT_FOUND" : "SOURCE_HTTP_ERROR";
    throw new SourceServiceError(
      code,
      request.source,
      `${request.source} returned HTTP ${String(response.status)}.`,
      { status: response.status }
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!JSON_MEDIA_TYPES.has(mediaType)) {
    throw new SourceServiceError(
      "SOURCE_CONTENT_TYPE_ERROR",
      request.source,
      `${request.source} returned unsupported content type ${contentType || "missing"}.`
    );
  }

  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/u.test(declaredLength) &&
    Number(declaredLength) > request.maxBodyBytes
  ) {
    throw bodyTooLarge(request);
  }

  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > request.maxBodyBytes) {
    throw bodyTooLarge(request);
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch (error) {
    throw new SourceServiceError(
      "SOURCE_INVALID_UTF8",
      request.source,
      `${request.source} returned invalid UTF-8.`,
      { cause: error }
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (error) {
    throw new SourceServiceError(
      "SOURCE_INVALID_JSON",
      request.source,
      `${request.source} returned invalid JSON.`,
      { cause: error }
    );
  }

  const retrievedAt = Math.floor(nowMs() / 1000);
  return {
    json,
    snapshot: {
      source: request.source,
      sourceUrl: request.sourceUrl,
      retrievedAt,
      responseHeaders: captureHeaders(response.headers, contentType),
      body,
      snapshotHash: hashSourceSnapshot(body)
    }
  };
}

function captureHeaders(
  headers: Headers,
  contentType: string
): CapturedResponseHeaders {
  return {
    contentType,
    cacheControl: headers.get("cache-control"),
    date: headers.get("date"),
    etag: headers.get("etag"),
    lastModified: headers.get("last-modified")
  };
}

function bodyTooLarge(request: ExactJsonRequest): SourceServiceError {
  return new SourceServiceError(
    "SOURCE_BODY_TOO_LARGE",
    request.source,
    `${request.source} exceeded the ${String(request.maxBodyBytes)}-byte response limit.`
  );
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "TimeoutError"
  );
}
