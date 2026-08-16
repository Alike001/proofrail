import {
  computePairKey,
  createEvidencePacket,
  hashSourceSnapshot
} from "@proofrail/evidence-core";
import type { GleifSourceEvidence, SecSourceEvidence } from "@proofrail/evidence-core";
import type { evidenceDrafts } from "@proofrail/db";
import { hashTypedData, recoverTypedDataAddress } from "viem";

import {
  EnvelopeSigner,
  EnvelopeSigningError,
  assertDraftCanBeSigned,
  createTypedData
} from "../src/index.js";

const CIK = "0000320193";
const LEI = "HWUPKR0MPOU8FGXBT394";
const REGISTRY = "0x0000000000000000000000000000000000000677" as const;
const PUBLISHER = "0x0000000000000000000000000000000000000001" as const;
const ISSUED_AT = 2_000_000_000;
const PRIVATE_KEY = `0x${"0".repeat(59)}a11ce` as const;
type Draft = typeof evidenceDrafts.$inferSelect;

describe("publisher-bound envelope signer", () => {
  it("signs, self-verifies, and serializes an exact contract envelope", async () => {
    const draft = makeDraft();
    const result = await signer().signDraft(
      draft,
      PUBLISHER,
      ISSUED_AT
    );
    expect(result.persisted.packetHash).toBe(draft.packetHash);
    expect(result.persisted.publisherAddress).toBe(PUBLISHER);
    expect(result.persisted.typedData.message).toMatchObject({
      packetHash: draft.packetHash,
      pairKey: draft.pairKey,
      nonce: draft.nonce,
      publisher: PUBLISHER,
      cik: "320193",
      lei: "0x485755504b52304d504f55384647584254333934",
      issuedAt: String(ISSUED_AT),
      expiresAt: String(ISSUED_AT + 86_400),
      schemaVersion: 1,
      policyVersion: 1,
      policyPassed: true
    });
    expect(() => JSON.stringify(result.persisted.typedData)).not.toThrow();

    const typedData = createTypedData(draft.packet, draft.pairKey, PUBLISHER);
    expect(result.digest).toBe(hashTypedData(typedData));
    await expect(
      recoverTypedDataAddress({
        ...typedData,
        signature: result.persisted.signature
      })
    ).resolves.toBe(result.attestorAddress);
  });

  it("has a stable cross-language EIP-712 digest vector", () => {
    const draft = makeDraft();
    const digest = hashTypedData(createTypedData(draft.packet, draft.pairKey, PUBLISHER));
    expect(digest).toBe("0xd5b1612bbaf490e34b6e1bd6a00649b37c41904b11a80df609568f5722496141");
  });

  it.each(["0x00", `0x${"0".repeat(64)}`, `0x${"f".repeat(64)}`])(
    "rejects private key %s",
    (key) => {
      expect(() =>
        new EnvelopeSigner(key as `0x${string}`, {
          chainId: 677,
          registryAddress: REGISTRY
        })
      ).toThrow(
        EnvelopeSigningError
      );
    }
  );

  it.each(["bad", "0x0000000000000000000000000000000000000000z"])(
    "rejects publisher %s",
    async (publisher) => {
      await expect(
        signer().signDraft(makeDraft(), publisher, ISSUED_AT)
      ).rejects.toThrow("publisher");
    }
  );

  it("rejects invalid time, expired evidence, and stale evidence", () => {
    expect(() => {
      assertDraftCanBeSigned(makeDraft(), 0);
    }).toThrow("signing time");
    expect(() => {
      assertDraftCanBeSigned(makeDraft(), ISSUED_AT + 86_400);
    }).toThrow("expired");
    expect(() => {
      assertDraftCanBeSigned(makeDraft(), ISSUED_AT + 601);
    }).toThrow("too old");
    expect(() => {
      assertDraftCanBeSigned(makeDraft(), ISSUED_AT - 301);
    }).toThrow("clock skew");
  });

  it("rejects tampered, failing, or database-mismatched drafts", () => {
    const tampered = makeDraft();
    expect(() => {
      assertDraftCanBeSigned(
        { ...tampered, canonicalPacket: `${tampered.canonicalPacket} ` },
        ISSUED_AT
      );
    }).toThrow("unchanged deterministic passing");
    expect(() => {
      assertDraftCanBeSigned({ ...makeDraft(), policyPassed: false }, ISSUED_AT);
    }).toThrow("unchanged deterministic passing");
    expect(() => {
      assertDraftCanBeSigned({ ...makeDraft(), chainId: 968 }, ISSUED_AT);
    }).toThrow("database fields");
    expect(() => {
      assertDraftCanBeSigned({ ...makeDraft(), pairKey: hash(88) }, ISSUED_AT);
    }).toThrow("database fields");
    expect(() => {
      createTypedData(makeDraft().packet, "invalid", PUBLISHER);
    }).toThrow("hash field");
  });

  it("rejects signer configuration and draft domain mismatches", async () => {
    expect(() =>
      new EnvelopeSigner(PRIVATE_KEY, { chainId: 0, registryAddress: REGISTRY })
    ).toThrow("chain ID");
    expect(() =>
      new EnvelopeSigner(PRIVATE_KEY, { chainId: 677, registryAddress: "bad" })
    ).toThrow("registry");
    await expect(
      new EnvelopeSigner(PRIVATE_KEY, {
        chainId: 968,
        registryAddress: REGISTRY
      }).signDraft(makeDraft(), PUBLISHER, ISSUED_AT)
    ).rejects.toThrow("configured chain and registry");
  });
});

function makeDraft(): Draft {
  const secBody = new TextEncoder().encode("sec");
  const gleifBody = new TextEncoder().encode("gleif");
  const sec: SecSourceEvidence = {
    source: "SEC",
    resolved: true,
    cik: CIK,
    legalName: "Apple Inc.",
    latestFilingDate: "2033-04-01",
    latestFilingForm: "10-Q",
    retrievedAt: ISSUED_AT - 30,
    snapshotHash: hashSourceSnapshot(secBody),
    sourceUrl: `https://data.sec.gov/submissions/CIK${CIK}.json`
  };
  const gleif: GleifSourceEvidence = {
    source: "GLEIF",
    resolved: true,
    lei: LEI,
    legalName: "Apple Inc.",
    entityStatus: "ACTIVE",
    retrievedAt: ISSUED_AT - 20,
    snapshotHash: hashSourceSnapshot(gleifBody),
    sourceUrl: `https://api.gleif.org/api/v1/lei-records/${LEI}`
  };
  const built = createEvidencePacket({
    chainId: 677,
    registryAddress: REGISTRY,
    nonce: hash(90),
    issuedAt: ISSUED_AT,
    sec,
    gleif
  });
  return {
    id: "00000000-0000-0000-0000-000000000001",
    secSnapshotId: "00000000-0000-0000-0000-000000000002",
    gleifSnapshotId: "00000000-0000-0000-0000-000000000003",
    chainId: 677,
    registryAddress: REGISTRY,
    cik: CIK,
    lei: LEI,
    pairKey: computePairKey(CIK, LEI),
    normalizedSecName: "apple inc",
    normalizedGleifName: "apple inc",
    policyPassed: true,
    policyResult: built.packet.policy,
    packet: built.packet,
    canonicalPacket: built.canonicalPacket,
    packetHash: built.packetHash,
    nonce: built.packet.nonce,
    issuedAt: new Date(ISSUED_AT * 1_000),
    expiresAt: new Date((ISSUED_AT + 86_400) * 1_000),
    createdAt: new Date()
  };
}

function hash(seed: number): `0x${string}` {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}

function signer(): EnvelopeSigner {
  return new EnvelopeSigner(PRIVATE_KEY, {
    chainId: 677,
    registryAddress: REGISTRY
  });
}
