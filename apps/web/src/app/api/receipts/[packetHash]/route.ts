import { apiErrorResponse } from "../../../../server/api-errors";
import { loadPublicReceiptFromEnvironment } from "../../../../server/public-receipt-runtime";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly packetHash: string }> }
): Promise<Response> {
  try {
    const { packetHash } = await context.params;
    const receipt = await loadPublicReceiptFromEnvironment(packetHash);
    return Response.json(
      { ok: true, receipt },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
