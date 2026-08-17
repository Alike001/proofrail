import { apiErrorResponse } from "../../../../../../server/api-errors";
import { loadReceiptArtifactFromEnvironment } from "../../../../../../server/public-receipt-runtime";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: {
    readonly params: Promise<{ readonly artifact: string; readonly packetHash: string }>;
  }
): Promise<Response> {
  try {
    const { artifact, packetHash } = await context.params;
    const file = await loadReceiptArtifactFromEnvironment(packetHash, artifact);
    return new Response(file.body as BodyInit, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Content-Type": file.contentType,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
