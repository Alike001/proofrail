import { apiErrorResponse } from "../../../../../server/api-errors";
import { issueEnvelopeFromEnvironment } from "../../../../../server/evidence-runtime";
import { readRequestJson } from "../../../../../server/read-request-json";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly draftId: string }> }
): Promise<Response> {
  try {
    const [{ draftId }, body] = await Promise.all([context.params, readRequestJson(request)]);
    const publication = await issueEnvelopeFromEnvironment(draftId, body);
    return Response.json({ ok: true, publication });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
