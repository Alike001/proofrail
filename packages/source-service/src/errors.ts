export type SourceName = "SEC" | "GLEIF";

export type SourceErrorCode =
  | "SOURCE_CONFIGURATION_ERROR"
  | "SOURCE_TIMEOUT"
  | "SOURCE_NETWORK_ERROR"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_HTTP_ERROR"
  | "SOURCE_CONTENT_TYPE_ERROR"
  | "SOURCE_BODY_TOO_LARGE"
  | "SOURCE_INVALID_UTF8"
  | "SOURCE_INVALID_JSON"
  | "SOURCE_SCHEMA_ERROR"
  | "SOURCE_IDENTIFIER_MISMATCH";

export class SourceServiceError extends Error {
  readonly code: SourceErrorCode;
  readonly source: SourceName;
  readonly status: number | undefined;

  constructor(
    code: SourceErrorCode,
    source: SourceName,
    message: string,
    options: { readonly cause?: unknown; readonly status?: number } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "SourceServiceError";
    this.code = code;
    this.source = source;
    this.status = options.status;
  }
}
