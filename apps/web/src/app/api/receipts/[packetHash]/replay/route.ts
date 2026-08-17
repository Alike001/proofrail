import { apiErrorResponse } from "../../../../../server/api-errors";
import { replaySavedReceiptFromEnvironment } from "../../../../../server/public-receipt-runtime";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { readonly params: Promise<{ readonly packetHash: string }> }
): Promise<Response> {
  try {
    const { packetHash } = await context.params;
    const replay = await replaySavedReceiptFromEnvironment(packetHash);
    return Response.json({ ok: true, replay });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
