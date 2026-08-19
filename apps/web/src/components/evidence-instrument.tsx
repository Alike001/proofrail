import Link from "next/link";

import { REFERENCE_ENTITY, type LandingReceipt } from "../lib/landing-data";
import { explorerUrl, shortHex } from "../lib/site";

export function EvidenceInstrument({ receipt }: { readonly receipt: LandingReceipt }) {
  const available = receipt.kind === "available";
  const entity = available ? receipt : REFERENCE_ENTITY;
  return (
    <section className="instrument" aria-label="ProofRail evidence instrument">
      <div className="instrument__topline">
        <span>PROOFRAIL EVIDENCE INSTRUMENT</span>
        <span className={available ? "signal signal--verified" : "signal"}>
          {available ? "CONFIRMED ON BOT MAINNET" : "REFERENCE INPUT · NOT PUBLISHED"}
          <span className="signal__square" aria-hidden="true" />
        </span>
      </div>
      <div className="instrument__identity">
        <div>
          <h2>{entity.entityName}</h2>
          <TechnicalValue label="CIK" value={entity.cik} />
          <TechnicalValue label="LEI" value={entity.lei} />
        </div>
        <div className="instrument__timing">
          <TechnicalValue
            label="ISSUED (UTC)"
            value={available ? formatDate(receipt.issuedAt) : "Awaiting publication"}
          />
          <TechnicalValue
            label="EXPIRES (UTC)"
            value={available ? formatDate(receipt.expiresAt) : "24 hours after issue"}
          />
        </div>
      </div>
      <div className="instrument__sources">
        <span className="instrument__section-label">SOURCES</span>
        <SourceLine
          name="SEC"
          detail="Company submissions"
          href={`https://data.sec.gov/submissions/CIK${entity.cik}.json`}
        />
        <SourceLine
          name="GLEIF"
          detail="LEI record"
          href={`https://api.gleif.org/api/v1/lei-records/${entity.lei}`}
        />
      </div>
      <div className="instrument__policy">
        <span className="instrument__section-label">DETERMINISTIC POLICY RESULT</span>
        <strong>{available ? "policy.public_company.active = true" : "Not run in this view"}</strong>
        <span>
          {available
            ? "The saved packet passed policy version 1."
            : "Build evidence to retrieve, compare, and sign current records."}
        </span>
      </div>
      <div className="instrument__proof-grid">
        <div>
          <span className="instrument__section-label">SIGNED PACKET</span>
          <TechnicalValue
            label="packet_hash"
            value={available ? shortHex(receipt.packetHash, 10) : "Pending"}
          />
          <TechnicalValue label="algorithm" value="keccak256 + EIP-712" />
        </div>
        <div>
          <span className="instrument__section-label">BOT CHAIN RECEIPT</span>
          <TechnicalValue label="chain_id" value="677" />
          <TechnicalValue
            label="transaction"
            value={available ? shortHex(receipt.transactionHash, 8) : "Pending"}
          />
        </div>
      </div>
      <div className={available ? "instrument__status instrument__status--verified" : "instrument__status"}>
        <span>STATUS</span>
        {available ? (
          <Link href={`/receipt/${receipt.packetHash}`}>CURRENT RECEIPT</Link>
        ) : (
          <span>MAINNET RECEIPT UNAVAILABLE</span>
        )}
      </div>
      {available ? (
        <>
          <a
            className="instrument__explorer"
            href={explorerUrl(`tx/${receipt.transactionHash}`)}
            rel="noreferrer"
            target="_blank"
          >
            Open transaction on BOTScan
          </a>
          <a
            className="instrument__explorer"
            href={explorerUrl(`address/${receipt.registryAddress}`)}
            rel="noreferrer"
            target="_blank"
          >
            Open registry on BOTScan
          </a>
        </>
      ) : null}
    </section>
  );
}

function TechnicalValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="technical-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SourceLine({
  detail,
  href,
  name
}: {
  readonly detail: string;
  readonly href: string;
  readonly name: string;
}) {
  return (
    <div className="source-line">
      <strong>{name}</strong>
      <span>{detail}</span>
      <a href={href} rel="noreferrer" target="_blank">
        Official source <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value));
}
