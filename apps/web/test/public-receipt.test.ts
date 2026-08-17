vi.mock("server-only", () => ({}));

import {
  computePairKey,
  createEvidencePacket,
  hashSourceSnapshot
} from "@proofrail/evidence-core";
import type { PublicReceiptBundleRecord } from "@proofrail/db";
import type { SourceSnapshot } from "@proofrail/source-service";

import {
  loadPublicReceipt,
  recheckLiveReceipt,
  replaySavedReceipt,
  selectReceiptArtifact
} from "../src/server/public-receipt";
import type {
  ReceiptDependencies,
  RecheckDependencies
} from "../src/server/public-receipt";

const NOW = 2_000_000_100;
const ISSUED_AT = 2_000_000_000;
const CIK = "0000320193";
const LEI = "HWUPKR0MPOU8FGXBT394";
const REGISTRY = "0x0000000000000000000000000000000000000677" as const;
const PUBLISHER = "0x0000000000000000000000000000000000000001";
const ATTESTOR = "0x0000000000000000000000000000000000000002";
const SEC_BODY = new TextEncoder().encode('{"source":"SEC","name":"Apple Inc."}');
const GLEIF_BODY = new TextEncoder().encode('{"source":"GLEIF","name":"Apple Inc."}');

describe("public receipt verification", () => {
  it("loads a current wallet-free receipt when saved and chain data agree", async () => {
    const result = await loadPublicReceipt(bundle().receipt.packetHash, dependencies());
    expect(result).toMatchObject({
      chainId: 677,
      chainVerification: "VERIFIED",
      cik: CIK,
      lei: LEI,
      replayDeterministic: true,
      state: "CURRENT"
    });
    expect(result.canonicalPacketDownload).toContain("/download/packet");
  });

  it("keeps cached history readable during RPC failure", async () => {
    const result = await loadPublicReceipt(
      bundle().receipt.packetHash,
      dependencies({ verifyChain: vi.fn().mockResolvedValue("UNAVAILABLE") })
    );
    expect(result.state).toBe("CURRENT");
    expect(result.chainVerification).toBe("UNAVAILABLE");
  });

  it("distinguishes expiry, supersession, and invalid evidence", async () => {
    const source = bundle();
    const expired = await loadPublicReceipt(
      source.receipt.packetHash,
      dependencies({ nowSeconds: () => ISSUED_AT + 86_400 })
    );
    expect(expired.state).toBe("EXPIRED");

    const supersededBundle = {
      ...source,
      currentPacketHash: hash(99)
    } satisfies PublicReceiptBundleRecord;
    const superseded = await loadPublicReceipt(
      source.receipt.packetHash,
      dependencies({ repository: repository(supersededBundle) })
    );
    expect(superseded.state).toBe("SUPERSEDED");

    const invalidBundle = {
      ...source,
      secSnapshot: { ...source.secSnapshot, body: new TextEncoder().encode("tampered") }
    } satisfies PublicReceiptBundleRecord;
    const invalid = await loadPublicReceipt(
      source.receipt.packetHash,
      dependencies({ repository: repository(invalidBundle) })
    );
    expect(invalid.state).toBe("INVALID");
  });

  it("treats an onchain mismatch or missing current pointer as invalid", async () => {
    const mismatch = await loadPublicReceipt(
      bundle().receipt.packetHash,
      dependencies({ verifyChain: vi.fn().mockResolvedValue("MISMATCH") })
    );
    expect(mismatch.state).toBe("INVALID");

    const source = bundle();
    const missingCurrent = await loadPublicReceipt(
      source.receipt.packetHash,
      dependencies({ repository: repository({ ...source, currentPacketHash: null }) })
    );
    expect(missingCurrent.state).toBe("INVALID");
  });

  it("replays the saved packet to the same deterministic hash", async () => {
    const source = bundle();
    const replay = await replaySavedReceipt(source.receipt.packetHash, dependencies());
    expect(replay).toMatchObject({
      deterministic: true,
      packetHash: source.receipt.packetHash,
      policyPassed: true
    });
  });

  it("compares fresh official evidence without rewriting history", async () => {
    const source = bundle();
    const unchanged = await recheckLiveReceipt(
      source.receipt.packetHash,
      recheckDependencies()
    );
    expect(unchanged.changed).toBe(false);
    expect(unchanged.policyPassed).toBe(true);

    const changedBody = new TextEncoder().encode('{"source":"GLEIF","name":"Apple Incorporated"}');
    const changed = await recheckLiveReceipt(
      source.receipt.packetHash,
      recheckDependencies({ gleif: gleifResult(changedBody, "Apple Incorporated") })
    );
    expect(changed.changed).toBe(true);
  });

  it("rejects malformed or unknown packet hashes before returning evidence", async () => {
    const findBundle = vi.fn();
    await expect(loadPublicReceipt("bad", dependencies({ repository: { findBundle } }))).rejects.toMatchObject({
      code: "INVALID_PACKET_HASH"
    });
    expect(findBundle).not.toHaveBeenCalled();

    await expect(
      loadPublicReceipt(hash(77), dependencies({ repository: repository(null) }))
    ).rejects.toMatchObject({ code: "RECEIPT_NOT_FOUND" });
  });

  it("serves the canonical packet and exact source bytes as named downloads", () => {
    const source = bundle();
    const packet = selectReceiptArtifact(source, source.receipt.packetHash as `0x${string}`, "packet");
    const sec = selectReceiptArtifact(source, source.receipt.packetHash as `0x${string}`, "sec");
    expect(new TextDecoder().decode(packet.body)).toBe(source.draft.canonicalPacket);
    expect(packet.filename).toContain("packet.json");
    expect(sec.body).toEqual(source.secSnapshot.body);
    expect(sec.contentType).toBe("application/json");
    expect(() => selectReceiptArtifact(
      source,
      source.receipt.packetHash as `0x${string}`,
      "private-key"
    )).toThrow("receipt artifact was not found");
  });
});

function dependencies(
  overrides: Partial<ReceiptDependencies> = {}
): ReceiptDependencies {
  const source = bundle();
  return {
    chainId: 677,
    contractAddress: REGISTRY,
    nowSeconds: () => NOW,
    repository: repository(source),
    verifyChain: vi.fn().mockResolvedValue("VERIFIED"),
    ...overrides
  };
}

function recheckDependencies(
  overrides: {
    readonly gleif?: ReturnType<typeof gleifResult>;
    readonly sec?: ReturnType<typeof secResult>;
  } = {}
): RecheckDependencies {
  return {
    chainId: 677,
    contractAddress: REGISTRY,
    gleif: { retrieve: vi.fn().mockResolvedValue(overrides.gleif ?? gleifResult()) },
    nowSeconds: () => NOW,
    repository: repository(bundle()),
    sec: { retrieve: vi.fn().mockResolvedValue(overrides.sec ?? secResult()) }
  };
}

function repository(value: PublicReceiptBundleRecord | null) {
  return {
    findBundle: vi.fn().mockResolvedValue(value)
  } as ReceiptDependencies["repository"];
}

function bundle(): PublicReceiptBundleRecord {
  const secSnapshot = snapshot("SEC", SEC_BODY);
  const gleifSnapshot = snapshot("GLEIF", GLEIF_BODY);
  const created = createEvidencePacket({
    chainId: 677,
    gleif: gleifResult().evidence,
    issuedAt: ISSUED_AT,
    nonce: hash(3),
    registryAddress: REGISTRY,
    sec: secResult().evidence
  });
  const pairKey = computePairKey(CIK, LEI);
  return {
    chainEvent: { contractAddress: REGISTRY },
    currentPacketHash: created.packetHash,
    draft: {
      canonicalPacket: created.canonicalPacket,
      cik: CIK,
      expiresAt: new Date(created.packet.expiresAt * 1_000),
      issuedAt: new Date(ISSUED_AT * 1_000),
      lei: LEI,
      packet: created.packet,
      packetHash: created.packetHash,
      pairKey
    },
    gleifSnapshot: {
      body: gleifSnapshot.body,
      responseHeaders: gleifSnapshot.responseHeaders,
      snapshotHash: gleifSnapshot.snapshotHash,
      source: "GLEIF"
    },
    receipt: {
      attestorAddress: ATTESTOR,
      blockHash: hash(6),
      blockNumber: 100n,
      cik: CIK,
      expiresAt: new Date(created.packet.expiresAt * 1_000),
      issuedAt: new Date(ISSUED_AT * 1_000),
      lei: LEI,
      packetHash: created.packetHash,
      pairKey,
      policyVersion: 1,
      publisherAddress: PUBLISHER,
      schemaVersion: 1,
      transactionHash: hash(5)
    },
    secSnapshot: {
      body: secSnapshot.body,
      responseHeaders: secSnapshot.responseHeaders,
      snapshotHash: secSnapshot.snapshotHash,
      source: "SEC"
    }
  };
}

function secResult(body = SEC_BODY, legalName = "Apple Inc.") {
  const captured = snapshot("SEC", body);
  return {
    evidence: {
      cik: CIK,
      latestFilingDate: "2033-04-01",
      latestFilingForm: "10-Q",
      legalName,
      resolved: true,
      retrievedAt: ISSUED_AT - 30,
      snapshotHash: captured.snapshotHash,
      source: "SEC" as const,
      sourceUrl: captured.sourceUrl
    },
    snapshot: captured
  };
}

function gleifResult(body = GLEIF_BODY, legalName = "Apple Inc.") {
  const captured = snapshot("GLEIF", body);
  return {
    evidence: {
      entityStatus: "ACTIVE",
      lei: LEI,
      legalName,
      resolved: true,
      retrievedAt: ISSUED_AT - 20,
      snapshotHash: captured.snapshotHash,
      source: "GLEIF" as const,
      sourceUrl: captured.sourceUrl
    },
    snapshot: captured
  };
}

function snapshot(source: "SEC" | "GLEIF", body: Uint8Array): SourceSnapshot {
  return {
    body,
    responseHeaders: {
      cacheControl: null,
      contentType: "application/json",
      date: null,
      etag: null,
      lastModified: null
    },
    retrievedAt: source === "SEC" ? ISSUED_AT - 30 : ISSUED_AT - 20,
    snapshotHash: hashSourceSnapshot(body),
    source,
    sourceUrl: source === "SEC"
      ? `https://data.sec.gov/submissions/CIK${CIK}.json`
      : `https://api.gleif.org/api/v1/lei-records/${LEI}`
  };
}

function hash(seed: number): `0x${string}` {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}
