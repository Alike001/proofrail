import Link from "next/link";

import { EvidenceInstrument } from "../components/evidence-instrument";
import { EvidenceRail } from "../components/evidence-rail";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { loadLandingReceipt } from "../lib/landing-receipt";
import { explorerUrl, shortHex } from "../lib/site";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const receipt = await loadLandingReceipt();
  const available = receipt.kind === "available";
  return (
    <main>
      <div className="landing-dark">
        <SiteHeader />
        <section className="hero">
          <div className="hero__copy">
            <h1>Public company evidence you can replay.</h1>
            <p>
              ProofRail turns SEC and GLEIF records into expiring evidence receipts
              verified on BOT Chain.
            </p>
            <div className="hero__actions">
              <Link className="button button--primary" href="/build" prefetch={false}>
                Build evidence
              </Link>
              {available ? (
                <Link className="button button--outline-dark" href={`/receipt/${receipt.packetHash}`}>
                  View a live receipt
                </Link>
              ) : (
                <span className="button button--outline-dark button--disabled" aria-disabled="true">
                  View a live receipt
                </span>
              )}
            </div>
          </div>
          <EvidenceInstrument receipt={receipt} />
        </section>
      </div>

      <EvidenceRail />

      <section className="proof-limits" aria-labelledby="proof-limits-title">
        <h2 className="sr-only" id="proof-limits-title">
          ProofRail scope
        </h2>
        <ProofColumn
          title="What it proves"
          items={[
            "A named company met a fixed policy at a recorded point in time.",
            "The decision used exact SEC and GLEIF source snapshots.",
            "The result was signed and accepted by the BOT Chain registry.",
            "The saved packet can be replayed to verify the same hash."
          ]}
        />
        <ProofColumn
          title="What it does not prove"
          items={[
            "Company ownership or authority to represent the company.",
            "Regulatory approval, endorsement, or legal compliance.",
            "Investment quality, financial position, or future status.",
            "Facts outside the referenced records and fixed policy."
          ]}
        />
      </section>

      <section className="mainnet-proof" id="mainnet-proof" aria-labelledby="mainnet-title">
        <div>
          <h2 id="mainnet-title">PROOF ON BOT MAINNET</h2>
          <dl>
            <ProofRow label="CHAIN ID" value="677" />
            <ProofRow
              label="REGISTRY ADDRESS"
              value={available ? shortHex(receipt.registryAddress, 12) : "Pending deployment"}
            />
            <ProofRow
              label="LATEST RECEIPT"
              value={available ? shortHex(receipt.packetHash, 12) : receipt.reason}
            />
          </dl>
          {available ? (
            <a
              href={explorerUrl(`tx/${receipt.transactionHash}`)}
              rel="noreferrer"
              target="_blank"
            >
              View transaction on BOTScan <span aria-hidden="true">↗</span>
            </a>
          ) : null}
        </div>
        <div className="mainnet-proof__action">
          <Link className="button button--primary" href="/build" prefetch={false}>
            Build evidence
          </Link>
          <p>Create a current company evidence receipt and publish it on BOT Chain.</p>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

function ProofColumn({ items, title }: { readonly items: readonly string[]; readonly title: string }) {
  return (
    <article>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function ProofRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
