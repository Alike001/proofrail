vi.mock("server-only", () => ({}));

import { hashSourceSnapshot } from "@proofrail/evidence-core";
import { SourceServiceError } from "@proofrail/source-service";

import {
  buildEvidenceDraft,
  issueEnvelope
} from "../src/server/evidence-workflow";
import type { BuildWorkflowDependencies } from "../src/server/evidence-workflow";

const NOW = 2_000_000_000;
const REGISTRY = "0x0000000000000000000000000000000000000677" as const;
const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const PACKET_HASH = hash(1);
const PAIR_KEY = hash(2);
const NONCE = hash(3);
const PUBLISHER = "0x0000000000000000000000000000000000000001" as const;
const ATTESTOR = "0x0000000000000000000000000000000000000002" as const;

describe("evidence workflow orchestration", () => {
  it("retrieves both official sources, creates the deterministic packet, and stores exact snapshots", async () => {
    const createDraft = vi.fn().mockResolvedValue({ id: DRAFT_ID });
    const sec = vi.fn().mockResolvedValue(secEvidence());
    const gleif = vi.fn().mockResolvedValue(gleifEvidence());

    const result = await buildEvidenceDraft(
      {
        cik: "0000320193",
        lei: "hwupkr0mpou8fgxbt394",
        packetHash: hash(99),
        policyPassed: false
      },
      {
        gleif: { retrieve: gleif },
        nonce: () => NONCE,
        nowSeconds: () => NOW,
        registryAddress: REGISTRY,
        repository: { createDraft },
        sec: { retrieve: sec }
      }
    );

    expect(sec).toHaveBeenCalledWith("0000320193");
    expect(gleif).toHaveBeenCalledWith("HWUPKR0MPOU8FGXBT394");
    expect(result).toMatchObject({ draftId: DRAFT_ID });
    expect(result.pairKey).toMatch(/^0x/u);
    expect(result.packet.policy.passed).toBe(true);
    expect(result.packetHash).not.toBe(hash(99));
    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        gleifSnapshot: gleifEvidence().snapshot,
        secSnapshot: secEvidence().snapshot
      })
    );
  });

  it("rejects malformed identifiers before either source is contacted", async () => {
    const sec = vi.fn();
    const gleif = vi.fn();
    await expect(
      buildEvidenceDraft(
        { cik: "320193", lei: "bad" },
        dependencies({ gleif, sec })
      )
    ).rejects.toMatchObject({ code: "INVALID_CIK" });
    expect(sec).not.toHaveBeenCalled();
    expect(gleif).not.toHaveBeenCalled();
  });

  it("propagates a precise source outage without storing a packet", async () => {
    const createDraft = vi.fn();
    await expect(
      buildEvidenceDraft(
        { cik: "0000320193", lei: "HWUPKR0MPOU8FGXBT394" },
        dependencies({
          createDraft,
          sec: vi.fn().mockRejectedValue(
            new SourceServiceError("SOURCE_TIMEOUT", "SEC", "SEC timed out.")
          )
        })
      )
    ).rejects.toMatchObject({ code: "SOURCE_TIMEOUT", source: "SEC" });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("stores a deterministic failing packet for inspection", async () => {
    const createDraft = vi.fn().mockResolvedValue({ id: DRAFT_ID });
    const result = await buildEvidenceDraft(
      { cik: "0000320193", lei: "HWUPKR0MPOU8FGXBT394" },
      dependencies({ createDraft, gleif: vi.fn().mockResolvedValue(gleifEvidence("Different LLC")) })
    );
    expect(result.packet.policy.passed).toBe(false);
    expect(result.packet.policy.failureReasons).toContain("LEGAL_NAME_MISMATCH");
    expect(createDraft).toHaveBeenCalledOnce();
  });

  it("issues calldata only from a stored draft and publisher-bound signature", async () => {
    const persisted = signedEnvelope();
    const signDraft = vi.fn().mockResolvedValue({
      attestorAddress: ATTESTOR,
      digest: hash(9),
      persisted
    });
    const saveSignedEnvelope = vi.fn().mockResolvedValue({
      ...persisted,
      createdAt: new Date()
    });
    const publication = await issueEnvelope(
      DRAFT_ID,
      { publisher: PUBLISHER },
      {
        nowSeconds: () => NOW,
        registryAddress: REGISTRY,
        repository: {
          findDraftById: vi.fn().mockResolvedValue({ packetHash: PACKET_HASH }),
          saveSignedEnvelope
        },
        signer: { signDraft }
      }
    );

    expect(signDraft).toHaveBeenCalledWith(
      { packetHash: PACKET_HASH },
      PUBLISHER,
      NOW
    );
    expect(publication).toMatchObject({
      chainId: 677,
      contractAddress: REGISTRY,
      envelope: { packetHash: PACKET_HASH, publisher: PUBLISHER },
      signature: persisted.signature
    });
  });

  it("rejects an unknown or malformed draft before signing", async () => {
    const signDraft = vi.fn();
    const base = {
      nowSeconds: () => NOW,
      registryAddress: REGISTRY,
      repository: {
        findDraftById: vi.fn().mockResolvedValue(null),
        saveSignedEnvelope: vi.fn()
      },
      signer: { signDraft }
    };
    await expect(issueEnvelope("bad", { publisher: PUBLISHER }, base)).rejects.toMatchObject({
      code: "INVALID_DRAFT_ID"
    });
    await expect(issueEnvelope(DRAFT_ID, { publisher: PUBLISHER }, base)).rejects.toMatchObject({
      code: "DRAFT_NOT_FOUND"
    });
    expect(signDraft).not.toHaveBeenCalled();
  });
});

function dependencies(overrides: {
  createDraft?: BuildWorkflowDependencies["repository"]["createDraft"];
  gleif?: BuildWorkflowDependencies["gleif"]["retrieve"];
  sec?: BuildWorkflowDependencies["sec"]["retrieve"];
} = {}): BuildWorkflowDependencies {
  return {
    gleif: {
      retrieve: overrides.gleif
        ?? vi.fn<BuildWorkflowDependencies["gleif"]["retrieve"]>().mockResolvedValue(gleifEvidence())
    },
    nonce: () => NONCE,
    nowSeconds: () => NOW,
    registryAddress: REGISTRY,
    repository: {
      createDraft: overrides.createDraft
        ?? vi.fn<BuildWorkflowDependencies["repository"]["createDraft"]>()
          .mockResolvedValue({ id: DRAFT_ID })
    },
    sec: {
      retrieve: overrides.sec
        ?? vi.fn<BuildWorkflowDependencies["sec"]["retrieve"]>().mockResolvedValue(secEvidence())
    }
  };
}

function secEvidence() {
  const body = new TextEncoder().encode('{"source":"SEC"}');
  const snapshotHash = hashSourceSnapshot(body);
  return {
    evidence: {
      cik: "0000320193",
      latestFilingDate: "2033-04-01",
      latestFilingForm: "10-Q",
      legalName: "Apple Inc.",
      resolved: true,
      retrievedAt: NOW - 10,
      snapshotHash,
      source: "SEC" as const,
      sourceUrl: "https://data.sec.gov/submissions/CIK0000320193.json"
    },
    snapshot: snapshot("SEC", body, snapshotHash)
  };
}

function gleifEvidence(legalName = "Apple Inc.") {
  const body = new TextEncoder().encode('{"source":"GLEIF"}');
  const snapshotHash = hashSourceSnapshot(body);
  return {
    evidence: {
      entityStatus: "ACTIVE",
      lei: "HWUPKR0MPOU8FGXBT394",
      legalName,
      resolved: true,
      retrievedAt: NOW - 9,
      snapshotHash,
      source: "GLEIF" as const,
      sourceUrl: "https://api.gleif.org/api/v1/lei-records/HWUPKR0MPOU8FGXBT394"
    },
    snapshot: snapshot("GLEIF", body, snapshotHash)
  };
}

function snapshot(source: "SEC" | "GLEIF", body: Uint8Array, snapshotHash: `0x${string}`) {
  return {
    body,
    responseHeaders: {
      cacheControl: null,
      contentType: "application/json",
      date: null,
      etag: null,
      lastModified: null
    },
    retrievedAt: source === "SEC" ? NOW - 10 : NOW - 9,
    snapshotHash,
    source,
    sourceUrl:
      source === "SEC"
        ? "https://data.sec.gov/submissions/CIK0000320193.json"
        : "https://api.gleif.org/api/v1/lei-records/HWUPKR0MPOU8FGXBT394"
  };
}

function signedEnvelope() {
  return {
    packetHash: PACKET_HASH,
    publisherAddress: PUBLISHER,
    signature: `0x${"1".repeat(130)}`,
    signerAddress: ATTESTOR,
    typedData: {
      domain: {},
      message: {
        cik: "320193",
        expiresAt: String(NOW + 86_400),
        issuedAt: String(NOW),
        lei: "0x485755504b52304d504f55384647584254333934",
        nonce: NONCE,
        packetHash: PACKET_HASH,
        pairKey: PAIR_KEY,
        policyPassed: true,
        policyVersion: 1,
        publisher: PUBLISHER,
        schemaVersion: 1
      },
      primaryType: "EvidenceEnvelope",
      types: {}
    }
  };
}

function hash(seed: number): `0x${string}` {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}
