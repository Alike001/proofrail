"use client";

import { useEffect, useRef, useState } from "react";

import type { ApiErrorView } from "../lib/build-contract";
import { POLICY_LABELS } from "../lib/policy-labels";
import type {
  PublicReceiptResponse,
  PublicReceiptView,
  RecheckResponse,
  ReplayResponse
} from "../lib/receipt-contract";
import { explorerUrl } from "../lib/site";

type ActionState = "idle" | "replaying" | "rechecking";

export function ReceiptDocument({ packetHash }: { readonly packetHash: string }) {
  const [receipt, setReceipt] = useState<PublicReceiptView | null>(null);
  const [error, setError] = useState<ApiErrorView | null>(null);
  const [action, setAction] = useState<ActionState>("idle");
  const [replay, setReplay] = useState<ReplayResponse["replay"] | null>(null);
  const [recheck, setRecheck] = useState<RecheckResponse["recheck"] | null>(null);
  const [recheckUnavailable, setRecheckUnavailable] = useState(false);
  const documentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/receipts/${packetHash}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as PublicReceiptResponse | { ok: false; error: ApiErrorView };
        if (!body.ok) {
          setError(body.error);
          return;
        }
        setReceipt(body.receipt);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError({ code: "NETWORK_ERROR", message: "The public receipt service could not be reached." });
      });
    return () => {
      controller.abort();
    };
  }, [packetHash]);

  useEffect(() => {
    if (receipt === null) return;
    documentRef.current?.focus({ preventScroll: true });
  }, [receipt]);

  async function runReplay() {
    setAction("replaying");
    setError(null);
    try {
      const response = await fetch(`/api/receipts/${packetHash}/replay`, { method: "POST" });
      const body = await response.json() as ReplayResponse | { ok: false; error: ApiErrorView };
      if (!body.ok) {
        setError(body.error);
        return;
      }
      setReplay(body.replay);
    } catch {
      setError({ code: "NETWORK_ERROR", message: "Saved evidence replay could not be reached." });
    } finally {
      setAction("idle");
    }
  }

  async function runRecheck() {
    setAction("rechecking");
    setError(null);
    setRecheckUnavailable(false);
    try {
      const response = await fetch(`/api/receipts/${packetHash}/recheck`, { method: "POST" });
      const body = await response.json() as RecheckResponse | { ok: false; error: ApiErrorView };
      if (!body.ok) {
        setRecheckUnavailable(true);
        setError(body.error);
        return;
      }
      setRecheck(body.recheck);
    } catch {
      setRecheckUnavailable(true);
      setError({ code: "NETWORK_ERROR", message: "Live source recheck is unavailable." });
    } finally {
      setAction("idle");
    }
  }

  if (error !== null && receipt === null) {
    return <ReceiptUnavailable error={error} packetHash={packetHash} />;
  }
  if (receipt === null) {
    return <ReceiptLoading />;
  }

  const state = recheck?.changed === true ? "SOURCE CHANGED" : receipt.state;
  const entityName = receipt.packet.sources.sec.legalName
    ?? receipt.packet.sources.gleif.legalName
    ?? "Unresolved legal entity";

  return (
    <article className="receipt-document" ref={documentRef} tabIndex={-1}>
      <div className={`receipt-state-band receipt-state-band--${state.toLowerCase().replace(" ", "-")}`}>
        <span>PUBLIC EVIDENCE RECEIPT</span>
        <strong>{state}</strong>
      </div>

      <header className="receipt-identity">
        <p className="eyebrow">BOT MAINNET · CHAIN 677</p>
        <h1>{entityName}</h1>
        <dl>
          <TechnicalRow label="CIK" value={receipt.cik} />
          <TechnicalRow label="LEI" value={receipt.lei} />
          <TechnicalRow label="ISSUED" value={formatDate(receipt.issuedAt)} />
          <TechnicalRow label="EXPIRES" value={formatDate(receipt.expiresAt)} />
        </dl>
      </header>

      <section className="receipt-section" aria-labelledby="source-records-title">
        <SectionHeading
          eyebrow="SAVED EVIDENCE"
          id="source-records-title"
          title="The exact records used at issue time"
        />
        <div className="receipt-source-sheet">
          <SavedSource source="SEC" receipt={receipt} />
          <SavedSource source="GLEIF" receipt={receipt} />
        </div>
      </section>

      <section className="receipt-section" aria-labelledby="policy-title">
        <SectionHeading eyebrow={`POLICY VERSION ${String(receipt.policyVersion)}`} id="policy-title" title="Deterministic rule replay" />
        <div className="receipt-policy-sheet">
          {receipt.policyChecks.map((check) => (
            <div key={check.code}>
              <span>{POLICY_LABELS[check.code] ?? check.code}</span>
              <strong data-status={check.status}>{check.status}</strong>
              <code>{check.observed}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="receipt-section receipt-proof" aria-labelledby="proof-title">
        <SectionHeading eyebrow="BOT CHAIN ACCEPTANCE" id="proof-title" title="Mainnet proof" />
        <div className="receipt-proof-grid">
          <TechnicalRow label="CHAIN VERIFICATION" value={receipt.chainVerification} />
          <TechnicalRow label="CONTRACT" value={receipt.contractAddress} />
          <TechnicalRow label="PUBLISHER" value={receipt.publisher} />
          <TechnicalRow label="ATTESTOR" value={receipt.attestor} />
          <TechnicalRow label="BLOCK" value={receipt.blockNumber} />
          <TechnicalRow label="BLOCK HASH" value={receipt.blockHash} />
          <TechnicalRow label="PACKET HASH" value={receipt.packetHash} />
          <TechnicalRow label="TRANSACTION" value={receipt.transactionHash} />
        </div>
        <div className="receipt-proof-links">
          <a href={explorerUrl(`tx/${receipt.transactionHash}`)} rel="noreferrer" target="_blank">Open transaction on BOTScan ↗</a>
          <a href={explorerUrl(`address/${receipt.contractAddress}`)} rel="noreferrer" target="_blank">Open registry on BOTScan ↗</a>
        </div>
      </section>

      <section className="receipt-section receipt-actions" aria-labelledby="verify-title">
        <SectionHeading eyebrow="INDEPENDENT CHECKS" id="verify-title" title="Replay history or compare the present" />
        <div className="receipt-action-grid">
          <div>
            <h3>Replay saved evidence</h3>
            <p>Re-run the fixed policy and canonical hash from the immutable packet and saved source bytes.</p>
            <button className="button button--primary" disabled={action !== "idle"} onClick={() => { void runReplay(); }} type="button">
              {action === "replaying" ? "Replaying saved packet" : "Re-run saved packet"}
            </button>
            {replay === null ? null : (
              <output className={replay.deterministic ? "action-output action-output--pass" : "action-output action-output--fail"}>
                {replay.deterministic ? "REPLAY MATCH · SAME PACKET HASH" : "INVALID · SAVED CONTENT DOES NOT MATCH"}
              </output>
            )}
          </div>
          <div>
            <h3>Check current sources</h3>
            <p>Retrieve new SEC and GLEIF records. This comparison never changes the historical receipt.</p>
            <button className="button button--secondary" disabled={action !== "idle"} onClick={() => { void runRecheck(); }} type="button">
              {action === "rechecking" ? "Checking official sources" : "Run live source recheck"}
            </button>
            {recheck === null ? null : (
              <output className={recheck.changed ? "action-output action-output--changed" : "action-output action-output--pass"}>
                {recheck.changed ? "SOURCE CHANGED · NEW RECEIPT REQUIRED" : "NO SOURCE CHANGE DETECTED"}
              </output>
            )}
            {recheckUnavailable ? <output className="action-output action-output--neutral">LIVE RECHECK UNAVAILABLE · HISTORICAL RECEIPT PRESERVED</output> : null}
          </div>
        </div>
        {error === null ? null : <InlineReceiptError error={error} />}
        {recheck === null ? null : <LiveComparison recheck={recheck} />}
      </section>

      <section className="receipt-section receipt-downloads" aria-labelledby="downloads-title">
        <SectionHeading eyebrow="PORTABLE EVIDENCE" id="downloads-title" title="Download the protected artifacts" />
        <div>
          <a download href={receipt.canonicalPacketDownload}>Canonical packet JSON</a>
          <a download href={receipt.secSnapshotDownload}>Exact SEC snapshot</a>
          <a download href={receipt.gleifSnapshotDownload}>Exact GLEIF snapshot</a>
        </div>
      </section>

      <aside className="receipt-trust-boundary">
        <span>TRUST BOUNDARY</span>
        <p>SEC and GLEIF provide the public records. ProofRail applies the fixed policy and acts as the application-managed attestor. BOT Chain preserves which packet the registry accepted.</p>
        <p>This receipt does not prove legal ownership, regulatory approval, issuer authority, investment quality, or decentralized oracle truth.</p>
      </aside>
    </article>
  );
}

function SavedSource({ source, receipt }: { readonly source: "SEC" | "GLEIF"; readonly receipt: PublicReceiptView }) {
  const record = source === "SEC" ? receipt.packet.sources.sec : receipt.packet.sources.gleif;
  return (
    <article>
      <div><h3>{source}</h3><a href={record.sourceUrl} rel="noreferrer" target="_blank">Official source ↗</a></div>
      <dl>
        <TechnicalRow label="LEGAL NAME" value={record.legalName ?? "Unresolved"} />
        {source === "SEC" && "latestFilingDate" in record ? <TechnicalRow label="LATEST FILING" value={record.latestFilingDate ?? "Missing"} /> : null}
        {source === "SEC" && "latestFilingForm" in record ? <TechnicalRow label="FILING FORM" value={record.latestFilingForm ?? "Missing"} /> : null}
        {source === "GLEIF" && "entityStatus" in record ? <TechnicalRow label="ENTITY STATUS" value={record.entityStatus ?? "Unresolved"} /> : null}
        <TechnicalRow label="RETRIEVED" value={formatUnixDate(record.retrievedAt)} />
        <TechnicalRow label="SNAPSHOT HASH" value={record.snapshotHash ?? "Unavailable"} />
      </dl>
    </article>
  );
}

function LiveComparison({ recheck }: { readonly recheck: RecheckResponse["recheck"] }) {
  return (
    <div className="live-comparison">
      <span>LIVE COMPARISON · {formatDate(recheck.checkedAt)}</span>
      <div>
        <TechnicalRow label="SEC LEGAL NAME" value={recheck.sec.legalName ?? "Unresolved"} />
        <TechnicalRow label="SEC SNAPSHOT" value={recheck.sec.snapshotHash} />
        <TechnicalRow label="GLEIF LEGAL NAME" value={recheck.gleif.legalName ?? "Unresolved"} />
        <TechnicalRow label="GLEIF SNAPSHOT" value={recheck.gleif.snapshotHash} />
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, id, title }: { readonly eyebrow: string; readonly id: string; readonly title: string }) {
  return <header className="receipt-section-heading"><span>{eyebrow}</span><h2 id={id}>{title}</h2></header>;
}

function TechnicalRow({ label, value }: { readonly label: string; readonly value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function InlineReceiptError({ error }: { readonly error: ApiErrorView }) {
  return <div className="receipt-inline-error" role="alert"><span>{error.source ?? "PROOFRAIL"} · {error.code}</span><p>{error.message}</p></div>;
}

function ReceiptLoading() {
  return <section className="receipt-loading" aria-live="polite"><span className="state-square" aria-hidden="true" /><h1>Loading indexed receipt</h1><p>Reading the saved evidence and BOT Chain acceptance record.</p></section>;
}

function ReceiptUnavailable({ error, packetHash }: { readonly error: ApiErrorView; readonly packetHash: string }) {
  return <section className="receipt-unavailable" role="alert"><span>RECEIPT UNAVAILABLE · {error.code}</span><h1>This public receipt could not be loaded.</h1><p>{error.message}</p><code>{packetHash}</code></section>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function formatUnixDate(value: number): string {
  return formatDate(new Date(value * 1_000).toISOString());
}
