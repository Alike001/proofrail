import type { Metadata } from "next";

import { ReceiptDocument } from "../../../components/receipt-document";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";

export const metadata: Metadata = {
  description: "Replay a public ProofRail evidence receipt accepted on BOT Chain.",
  title: "Public evidence receipt"
};

export default async function ReceiptPage({
  params
}: {
  readonly params: Promise<{ readonly packetHash: string }>;
}) {
  const { packetHash } = await params;
  return (
    <>
      <div className="receipt-shell">
        <SiteHeader />
        <main className="receipt-page">
          <ReceiptDocument packetHash={packetHash} />
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
