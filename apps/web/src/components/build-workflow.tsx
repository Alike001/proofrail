"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RefObject, SyntheticEvent } from "react";
import type { Address, Hex } from "viem";

import type {
  ApiErrorView,
  BuildEvidenceResponse,
  EnvelopeResponse,
  EvidenceDraftView,
  PublishEnvelopeView
} from "../lib/build-contract";
import {
  WalletFlowError,
  connectBotPublisher,
  submitEvidenceReceipt,
  waitForEvidenceReceipt
} from "../lib/publish-receipt";
import { explorerUrl, shortHex } from "../lib/site";

type BuildState = "input" | "retrieving" | "compare" | "review" | "publishing" | "indexing";

const POLICY_LABELS: Readonly<Record<string, string>> = {
  GLEIF_ENTITY_ACTIVE: "GLEIF entity is active",
  GLEIF_IDENTIFIER_RESOLVED: "GLEIF identifier resolved",
  GLEIF_SNAPSHOT_FRESH: "GLEIF snapshot is fresh",
  LEGAL_NAME_MATCH: "Legal names match",
  SEC_IDENTIFIER_RESOLVED: "SEC identifier resolved",
  SEC_RECENT_FILING: "SEC filing is within 18 months",
  SEC_SNAPSHOT_FRESH: "SEC snapshot is fresh"
};

export function BuildWorkflow() {
  const [cik, setCik] = useState("0000320193");
  const [lei, setLei] = useState("HWUPKR0MPOU8FGXBT394");
  const [state, setState] = useState<BuildState>("input");
  const [draft, setDraft] = useState<EvidenceDraftView | null>(null);
  const [publication, setPublication] = useState<PublishEnvelopeView | null>(null);
  const [publisher, setPublisher] = useState<Address | null>(null);
  const [transactionHash, setTransactionHash] = useState<Hex | null>(null);
  const [error, setError] = useState<ApiErrorView | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const confirmationRef = useRef<HTMLElement>(null);

  const stage = stageForState(state);
  const passed = draft?.packet.policy.passed === true;

  useEffect(() => {
    const target = state === "compare"
      ? resultRef.current
      : state === "review"
        ? reviewRef.current
        : state === "indexing"
          ? confirmationRef.current
          : null;
    if (target === null) {
      return;
    }
    target.focus({ preventScroll: true });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }, [state]);

  async function build(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDraft(null);
    setPublication(null);
    setPublisher(null);
    setTransactionHash(null);
    setState("retrieving");
    try {
      const response = await fetch("/api/evidence/build", {
        body: JSON.stringify({ cik, lei }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const body = (await response.json()) as BuildEvidenceResponse;
      if (!body.ok) {
        setError(body.error);
        setState("input");
        return;
      }
      setDraft(body.draft);
      setState("compare");
    } catch {
      setError({
        code: "NETWORK_ERROR",
        message: "The evidence service could not be reached. No packet was created."
      });
      setState("input");
    }
  }

  async function preparePublication() {
    if (!draft?.packet.policy.passed) {
      return;
    }
    setError(null);
    try {
      if (window.ethereum === undefined) {
        throw new WalletFlowError("WALLET_MISSING", "Install or open an EVM wallet to publish.");
      }
      const connectedPublisher = await connectBotPublisher(window.ethereum);
      const response = await fetch(`/api/evidence/${draft.draftId}/envelope`, {
        body: JSON.stringify({ publisher: connectedPublisher }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const body = (await response.json()) as EnvelopeResponse;
      if (!body.ok) {
        setError(body.error);
        return;
      }
      setPublisher(connectedPublisher);
      setPublication(body.publication);
      setState("review");
    } catch (caught) {
      setError(walletError(caught));
    }
  }

  async function publish() {
    if (window.ethereum === undefined || publisher === null || publication === null) {
      return;
    }
    setError(null);
    setState("publishing");
    try {
      const hash = await submitEvidenceReceipt(window.ethereum, publisher, publication);
      setTransactionHash(hash);
      await waitForEvidenceReceipt(window.ethereum, hash);
      setState("indexing");
    } catch (caught) {
      setError(walletError(caught));
      setState("review");
    }
  }

  return (
    <div className="build-workflow">
      <StageRail active={stage} />
      {error === null ? null : <ErrorSummary error={error} />}

      <section className="build-intro" aria-labelledby="build-title">
        <p className="eyebrow">BOT CHAIN · PUBLIC COMPANY EVIDENCE</p>
        <h1 id="build-title">Build one replayable evidence receipt.</h1>
        <p>
          Enter the official identifiers. ProofRail retrieves SEC and GLEIF records,
          applies one fixed policy, and prepares a 24-hour packet for BOT mainnet.
        </p>
      </section>

      <form
        className="identifier-form"
        onSubmit={(event) => {
          void build(event);
        }}
        noValidate
      >
        <label>
          <span>SEC CENTRAL INDEX KEY (CIK)</span>
          <input
            aria-describedby={error?.field === "cik" ? "build-error" : "cik-help"}
            autoComplete="off"
            inputMode="numeric"
            maxLength={10}
            name="cik"
            onChange={(event) => {
              setCik(event.target.value);
            }}
            readOnly={state === "retrieving"}
            value={cik}
          />
          <small id="cik-help">Exactly 10 digits, including leading zeros.</small>
        </label>
        <label>
          <span>LEGAL ENTITY IDENTIFIER (LEI)</span>
          <input
            aria-describedby={error?.field === "lei" ? "build-error" : "lei-help"}
            autoComplete="off"
            maxLength={20}
            name="lei"
            onChange={(event) => {
              setLei(event.target.value.toUpperCase());
            }}
            readOnly={state === "retrieving"}
            value={lei}
          />
          <small id="lei-help">20 characters with a valid ISO 17442 checksum.</small>
        </label>
        <button className="button button--primary" disabled={state === "retrieving"} type="submit">
          {state === "retrieving" ? "Retrieving official records" : "Build evidence"}
        </button>
      </form>

      {state === "retrieving" ? <RetrievalState /> : null}
      {draft === null ? <TrustBoundary /> : <EvidenceResult draft={draft} resultRef={resultRef} />}

      {draft !== null && state === "compare" ? (
        <section className="build-action-panel">
          <div>
            <span className="technical-label">NEXT ACTION</span>
            <h2>{passed ? "Review before wallet connection" : "This packet cannot be published"}</h2>
            <p>
              {passed
                ? "Connect only after checking the source comparison and exact policy result above."
                : "Correct the identifiers or source condition, then build a new packet."}
            </p>
          </div>
          {passed ? (
            <button
              className="button button--primary"
              onClick={() => {
                void preparePublication();
              }}
              type="button"
            >
              Connect wallet to review
            </button>
          ) : null}
        </section>
      ) : null}

      {state === "review" && draft !== null && publication !== null && publisher !== null ? (
        <PublicationReview
          draft={draft}
          publication={publication}
          publisher={publisher}
          publish={publish}
          sectionRef={reviewRef}
        />
      ) : null}

      {state === "publishing" ? (
        <section className="transaction-state" aria-live="polite">
          <span className="state-square" aria-hidden="true" />
          <div>
            <h2>{transactionHash === null ? "Confirm in your wallet" : "Transaction submitted"}</h2>
            <p>
              {transactionHash === null
                ? "No token payment is requested. Only the evidence receipt is written."
                : `Waiting for BOT Chain confirmation: ${shortHex(transactionHash, 10)}`}
            </p>
          </div>
        </section>
      ) : null}

      {state === "indexing" && draft !== null && transactionHash !== null ? (
        <section
          className="confirmed-band"
          aria-live="polite"
          ref={confirmationRef}
          tabIndex={-1}
        >
          <span>CONFIRMED ON BOT MAINNET</span>
          <div>
            <strong>Transaction confirmed. Receipt indexing is in progress.</strong>
            <a href={explorerUrl(`tx/${transactionHash}`)} rel="noreferrer" target="_blank">
              Open transaction on BOTScan ↗
            </a>
            <Link href={`/receipt/${draft.packetHash}`} prefetch={false}>
              Check public receipt
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StageRail({ active }: { readonly active: "INPUT" | "COMPARE" | "REVIEW" | "PUBLISH" }) {
  return (
    <nav className="stage-rail" aria-label="Evidence build stages">
      {(["INPUT", "COMPARE", "REVIEW", "PUBLISH"] as const).map((item) => (
        <span aria-current={item === active ? "step" : undefined} key={item}>
          {item}
        </span>
      ))}
    </nav>
  );
}

function RetrievalState() {
  return (
    <section className="retrieval-state" aria-live="polite">
      <span>SEC</span>
      <i aria-hidden="true" />
      <span>GLEIF</span>
      <strong>Retrieving exact source snapshots</strong>
    </section>
  );
}

function EvidenceResult({
  draft,
  resultRef
}: {
  readonly draft: EvidenceDraftView;
  readonly resultRef: RefObject<HTMLElement | null>;
}) {
  const { packet } = draft;
  return (
    <section
      className="evidence-result"
      aria-labelledby="result-title"
      ref={resultRef}
      tabIndex={-1}
    >
      <div className={packet.policy.passed ? "result-band result-band--pass" : "result-band result-band--fail"}>
        <span id="result-title">DETERMINISTIC POLICY</span>
        <strong>{packet.policy.passed ? "PASS · ELIGIBLE TO PUBLISH" : "FAIL · PUBLICATION BLOCKED"}</strong>
      </div>
      <div className="source-comparison">
        <SourceColumn
          facts={[
            ["Legal name", packet.sources.sec.legalName ?? "Unresolved"],
            ["Latest filing", packet.sources.sec.latestFilingDate ?? "Missing"],
            ["Filing form", packet.sources.sec.latestFilingForm ?? "Missing"],
            ["Retrieved", formatTimestamp(packet.sources.sec.retrievedAt)],
            ["Snapshot hash", packet.sources.sec.snapshotHash ?? "Unavailable"]
          ]}
          href={packet.sources.sec.sourceUrl}
          source="SEC"
        />
        <SourceColumn
          facts={[
            ["Legal name", packet.sources.gleif.legalName ?? "Unresolved"],
            ["Entity status", packet.sources.gleif.entityStatus ?? "Unresolved"],
            ["Retrieved", formatTimestamp(packet.sources.gleif.retrievedAt)],
            ["Snapshot hash", packet.sources.gleif.snapshotHash ?? "Unavailable"]
          ]}
          href={packet.sources.gleif.sourceUrl}
          source="GLEIF"
        />
      </div>
      <div className="policy-sheet">
        <h2>Fixed policy, version {packet.policyVersion}</h2>
        {packet.policy.checks.map((check) => (
          <div key={check.code}>
            <span>{POLICY_LABELS[check.code] ?? check.code}</span>
            <strong data-status={check.status}>{check.status}</strong>
            <code>{check.observed}</code>
          </div>
        ))}
      </div>
      <details className="packet-disclosure">
        <summary>Inspect protected packet details</summary>
        <dl>
          <TechnicalRow label="PACKET HASH" value={draft.packetHash} />
          <TechnicalRow label="PAIR KEY" value={draft.pairKey} />
          <TechnicalRow label="NONCE" value={packet.nonce} />
          <TechnicalRow label="ISSUED" value={formatTimestamp(packet.issuedAt)} />
          <TechnicalRow label="EXPIRES" value={formatTimestamp(packet.expiresAt)} />
          <TechnicalRow label="REGISTRY" value={packet.registryAddress} />
        </dl>
      </details>
    </section>
  );
}

function SourceColumn({
  facts,
  href,
  source
}: {
  readonly facts: readonly (readonly [string, string])[];
  readonly href: string;
  readonly source: "SEC" | "GLEIF";
}) {
  return (
    <article>
      <div>
        <h2>{source}</h2>
        <a href={href} rel="noreferrer" target="_blank">Official source ↗</a>
      </div>
      <dl>
        {facts.map(([label, value]) => <TechnicalRow key={label} label={label} value={value} />)}
      </dl>
    </article>
  );
}

function PublicationReview({
  draft,
  publication,
  publish,
  publisher,
  sectionRef
}: {
  readonly draft: EvidenceDraftView;
  readonly publication: PublishEnvelopeView;
  readonly publish: () => Promise<void>;
  readonly publisher: Address;
  readonly sectionRef: RefObject<HTMLElement | null>;
}) {
  return (
    <section
      className="publication-review"
      aria-labelledby="publication-title"
      ref={sectionRef}
      tabIndex={-1}
    >
      <div>
        <span className="technical-label">FINAL WALLET REVIEW</span>
        <h2 id="publication-title">Publish this packet to BOT Chain?</h2>
        <p>Expected effect: store one immutable receipt and update this CIK plus LEI pair’s current pointer.</p>
      </div>
      <dl>
        <TechnicalRow label="NETWORK" value="BOT Chain Mainnet · chain 677" />
        <TechnicalRow label="CONTRACT" value={publication.contractAddress} />
        <TechnicalRow label="PUBLISHER" value={publisher} />
        <TechnicalRow label="CIK + LEI" value={`${draft.packet.identifiers.cik} · ${draft.packet.identifiers.lei}`} />
        <TechnicalRow label="PACKET HASH" value={draft.packetHash} />
        <TechnicalRow label="EXPIRES" value={formatTimestamp(draft.packet.expiresAt)} />
        <TechnicalRow label="TOKEN PAYMENT" value="0 BOT · gas only" />
      </dl>
      <p className="attestor-note">ProofRail is the application-managed attestor. SEC and GLEIF supply the source records.</p>
      <button
        className="button button--primary"
        onClick={() => {
          void publish();
        }}
        type="button"
      >
        Publish on BOT Chain
      </button>
    </section>
  );
}

function TechnicalRow({ label, value }: { readonly label: string; readonly value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function TrustBoundary() {
  return (
    <section className="trust-boundary">
      <h2>What happens behind this button</h2>
      <p>The server retrieves current official records and stores their exact bytes. The browser cannot submit its own source facts, policy result, packet hash, or signature.</p>
      <p>A wallet is requested only after a passing packet is visible and ready for review.</p>
    </section>
  );
}

function ErrorSummary({ error }: { readonly error: ApiErrorView }) {
  return (
    <section className="error-summary" id="build-error" role="alert">
      <span>{error.source ?? "PROOFRAIL"} · {error.code}</span>
      <strong>{error.message}</strong>
      <p>Nothing was published. You can correct the input or retry this step safely.</p>
    </section>
  );
}

function stageForState(state: BuildState): "INPUT" | "COMPARE" | "REVIEW" | "PUBLISH" {
  if (state === "input" || state === "retrieving") return "INPUT";
  if (state === "compare") return "COMPARE";
  if (state === "review") return "REVIEW";
  return "PUBLISH";
}

function walletError(error: unknown): ApiErrorView {
  if (error instanceof WalletFlowError) {
    return error.code === "WALLET_MISSING"
      ? { code: error.code, field: "publisher", message: error.message }
      : { code: error.code, message: error.message };
  }
  return { code: "WALLET_ERROR", message: "The wallet flow could not be completed." };
}

function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC"
  }).format(new Date(value * 1_000));
}
