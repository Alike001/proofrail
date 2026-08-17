import { apiErrorResponse } from "../../../../../server/api-errors";
import { recheckLiveReceiptFromEnvironment } from "../../../../../server/public-receipt-runtime";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { readonly params: Promise<{ readonly packetHash: string }> }
): Promise<Response> {
  try {
    const { packetHash } = await context.params;
    const recheck = await recheckLiveReceiptFromEnvironment(packetHash);
    return Response.json({ ok: true, recheck });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
