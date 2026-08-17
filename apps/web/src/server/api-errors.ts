import "server-only";

import { EvidenceValidationError } from "@proofrail/evidence-core";
import { EnvelopeSigningError } from "@proofrail/envelope-signer";
import { SourceServiceError } from "@proofrail/source-service";

import type { ApiErrorView } from "../lib/build-contract";

export class WebServiceError extends Error {
  readonly code: string;
  readonly field: ApiErrorView["field"];
  readonly status: number;

  constructor(
    code: string,
    message: string,
    status: number,
    field?: ApiErrorView["field"]
  ) {
    super(message);
    this.name = "WebServiceError";
    this.code = code;
    this.field = field;
    this.status = status;
  }
}

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof WebServiceError) {
    return Response.json(
      { ok: false, error: compactError(error.code, error.message, error.field) },
      { status: error.status }
    );
  }
  if (error instanceof EvidenceValidationError) {
    const field = error.code === "INVALID_CIK" ? "cik" : error.code === "INVALID_LEI" ? "lei" : undefined;
    return Response.json(
      { ok: false, error: compactError(error.code, error.message, field) },
      { status: 400 }
    );
  }
  if (error instanceof EnvelopeSigningError) {
    const publisherError = error.message.toLowerCase().includes("publisher");
    return Response.json(
      {
        ok: false,
        error: compactError(
          publisherError ? "INVALID_PUBLISHER" : "ENVELOPE_UNAVAILABLE",
          error.message,
          publisherError ? "publisher" : undefined
        )
      },
      { status: publisherError ? 400 : 409 }
    );
  }
  if (error instanceof SourceServiceError) {
    const status = error.code === "SOURCE_NOT_FOUND" ? 404 : 503;
    return Response.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          source: error.source
        }
      },
      { status }
    );
  }

  return Response.json(
    {
      ok: false,
      error: compactError(
        "INTERNAL_ERROR",
        "ProofRail could not complete this request. No evidence was published."
      )
    },
    { status: 500 }
  );
}

function compactError(
  code: string,
  message: string,
  field?: ApiErrorView["field"]
): ApiErrorView {
  return field === undefined ? { code, message } : { code, field, message };
}
