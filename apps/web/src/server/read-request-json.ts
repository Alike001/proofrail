import "server-only";

import { WebServiceError } from "./api-errors";

export async function readRequestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new WebServiceError("INVALID_JSON", "The request body must be valid JSON.", 400);
  }
}
