import { renderToStaticMarkup } from "react-dom/server";

import { EvidenceInstrument } from "../src/components/evidence-instrument";
import { EvidenceRail } from "../src/components/evidence-rail";
import { SiteFooter } from "../src/components/site-footer";
import { SiteHeader } from "../src/components/site-header";
import type { LandingReceipt } from "../src/lib/landing-data";
import { shortHex } from "../src/lib/site";

describe("landing product surface", () => {
  it("renders a truthful pre-deployment instrument without a confirmed claim", () => {
    const html = renderToStaticMarkup(
      <EvidenceInstrument
        receipt={{
          kind: "unavailable",
          reason: "The first BOT mainnet receipt will appear after registry deployment."
        }}
      />
    );
    expect(html).toContain("REFERENCE INPUT · NOT PUBLISHED");
    expect(html).toContain("MAINNET RECEIPT UNAVAILABLE");
    expect(html).not.toContain("CONFIRMED ON BOT MAINNET");
  });

  it("links an available indexed receipt and its real transaction", () => {
    const receipt: LandingReceipt = {
      attestor: address(2),
      cik: "0000320193",
      entityName: "Apple Inc.",
      expiresAt: "2033-05-19T14:32:18.000Z",
      issuedAt: "2033-05-18T14:32:18.000Z",
      kind: "available",
      lei: "HWUPKR0MPOU8FGXBT394",
      packetHash: hash(1),
      policyPassed: true,
      publisher: address(1),
      registryAddress: address(677),
      transactionHash: hash(2)
    };
    const html = renderToStaticMarkup(<EvidenceInstrument receipt={receipt} />);
    expect(html).toContain("CONFIRMED ON BOT MAINNET");
    expect(html).toContain(`/receipt/${receipt.packetHash}`);
    expect(html).toContain(`tx/${receipt.transactionHash}`);
  });

  it("keeps the four-stage evidence path and core navigation visible", () => {
    const html = renderToStaticMarkup(
      <>
        <SiteHeader />
        <EvidenceRail />
        <SiteFooter />
      </>
    );
    expect(html).toContain("How it works");
    expect(html).toContain("Build evidence");
    expect(html).toContain("SEC + GLEIF");
    expect(html).toContain("DETERMINISTIC POLICY");
    expect(html).toContain("BOT MAINNET RECEIPT");
    expect(html).toContain("© 2026 ProofRail");
  });

  it("shortens long hashes without altering short values", () => {
    expect(shortHex("0x1234")).toBe("0x1234");
    expect(shortHex(hash(3), 4)).toBe("0x0000…0003");
  });
});

function hash(seed: number): `0x${string}` {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}

function address(seed: number): `0x${string}` {
  return `0x${seed.toString(16).padStart(40, "0")}`;
}
