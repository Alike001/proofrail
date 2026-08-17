vi.mock("server-only", () => ({}));

import { EvidenceValidationError } from "@proofrail/evidence-core";
import { EnvelopeSigningError } from "@proofrail/envelope-signer";
import { SourceServiceError } from "@proofrail/source-service";

import { WebServiceError, apiErrorResponse } from "../src/server/api-errors";

describe("API error contract", () => {
  it("keeps expected service errors stable and field-linked", async () => {
    const response = apiErrorResponse(
      new WebServiceError("INVALID_PUBLISHER", "Select a wallet.", 400, "publisher")
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_PUBLISHER",
        field: "publisher",
        message: "Select a wallet."
      },
      ok: false
    });
  });

  it("maps identifier validation to the correct input", async () => {
    const cik = apiErrorResponse(new EvidenceValidationError("INVALID_CIK", "Bad CIK."));
    const lei = apiErrorResponse(new EvidenceValidationError("INVALID_LEI", "Bad LEI."));
    expect(await cik.json()).toMatchObject({ error: { field: "cik" } });
    expect(await lei.json()).toMatchObject({ error: { field: "lei" } });
  });

  it("keeps source identity while distinguishing missing data from an outage", async () => {
    const missing = apiErrorResponse(
      new SourceServiceError("SOURCE_NOT_FOUND", "GLEIF", "LEI not found.")
    );
    const outage = apiErrorResponse(
      new SourceServiceError("SOURCE_TIMEOUT", "SEC", "SEC timed out.")
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { source: "GLEIF" } });
    expect(outage.status).toBe(503);
    expect(await outage.json()).toMatchObject({ error: { source: "SEC" } });
  });

  it("does not leak unknown internal error details", async () => {
    const response = apiErrorResponse(new Error("database password leaked"));
    const body: unknown = await response.json();
    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "ProofRail could not complete this request. No evidence was published."
      },
      ok: false
    });
    expect(JSON.stringify(body)).not.toContain("password");
  });

  it("separates publisher mistakes from immutable-envelope conflicts", async () => {
    const publisher = apiErrorResponse(new EnvelopeSigningError("Publisher is invalid."));
    const conflict = apiErrorResponse(new EnvelopeSigningError("Draft domain is invalid."));
    expect(publisher.status).toBe(400);
    expect(await publisher.json()).toMatchObject({
      error: { code: "INVALID_PUBLISHER", field: "publisher" }
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: "ENVELOPE_UNAVAILABLE" } });
  });
});
