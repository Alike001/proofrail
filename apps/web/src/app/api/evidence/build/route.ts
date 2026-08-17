import { apiErrorResponse } from "../../../../server/api-errors";
import { buildEvidenceFromEnvironment } from "../../../../server/evidence-runtime";
import { readRequestJson } from "../../../../server/read-request-json";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readRequestJson(request);
    const draft = await buildEvidenceFromEnvironment(body);
    return Response.json({ ok: true, draft }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
