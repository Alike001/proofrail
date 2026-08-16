import type { EvidencePacketV1, SecSourceEvidence } from "../src/index.js";
import {
  RECEIPT_LIFETIME_SECONDS,
  computePairKey,
  createEvidencePacket,
  replayEvidencePacket
} from "../src/index.js";
import {
  CIK,
  ISSUED_AT,
  LEI,
  REGISTRY_ADDRESS,
  makeGleif,
  makeInput,
  makeSec
} from "./fixtures.js";

describe("evidence packet", () => {
  it("creates a stable, passing packet with a 24-hour expiry", () => {
    const first = createEvidencePacket(makeInput());
    const second = createEvidencePacket(makeInput());

    expect(first).toEqual(second);
    expect(first.packet.policy.passed).toBe(true);
    expect(first.packet.expiresAt - first.packet.issuedAt).toBe(
      RECEIPT_LIFETIME_SECONDS
    );
    expect(first.packet.registryAddress).toBe(REGISTRY_ADDRESS);
    expect(first.packetHash).toMatch(/^0x[0-9a-f]{64}$/u);
  });

  it("replays the same saved packet to the same hash", () => {
    const created = createEvidencePacket(makeInput());
    const replay = replayEvidencePacket(created.packet);

    expect(replay.deterministic).toBe(true);
    expect(replay.providedPacketHash).toBe(created.packetHash);
    expect(replay.replayed.packetHash).toBe(created.packetHash);
  });

  it("detects a modified protected policy field", () => {
    const created = createEvidencePacket(makeInput());
    const modified = {
      ...created.packet,
      policy: {
        ...created.packet.policy,
        passed: false
      }
    } as EvidencePacketV1;
    const replay = replayEvidencePacket(modified);

    expect(replay.deterministic).toBe(false);
    expect(replay.providedPacketHash).not.toBe(replay.replayed.packetHash);
  });

  it("changes the packet hash when protected evidence changes", () => {
    const first = createEvidencePacket(makeInput());
    const second = createEvidencePacket(
      makeInput({ sec: makeSec({ latestFilingForm: "8-K" }) })
    );
    expect(second.packetHash).not.toBe(first.packetHash);
  });

  it("drops undeclared runtime fields before protecting the packet", () => {
    const secWithExtraField = {
      ...makeSec(),
      browserSuppliedVerdict: "PASS"
    } as SecSourceEvidence;
    const created = createEvidencePacket(makeInput({ sec: secWithExtraField }));

    expect(created.canonicalPacket).not.toContain("browserSuppliedVerdict");
    expect("browserSuppliedVerdict" in created.packet.sources.sec).toBe(false);
  });

  it("derives a stable contract pair key from CIK and LEI", () => {
    const first = computePairKey(CIK, LEI);
    expect(computePairKey(CIK, LEI.toLowerCase())).toBe(first);
    expect(computePairKey("0000320194", LEI)).not.toBe(first);
  });

  it("creates an inspectable failing packet", () => {
    const created = createEvidencePacket(
      makeInput({
        sec: makeSec({ legalName: "Different Corporation" }),
        gleif: makeGleif()
      })
    );
    expect(created.packet.policy.passed).toBe(false);
    expect(created.packet.policy.failureReasons).toContain(
      "LEGAL_NAME_MISMATCH"
    );
  });

  it("normalizes lowercase LEI input into the packet", () => {
    const created = createEvidencePacket(
      makeInput({ gleif: makeGleif({ lei: LEI.toLowerCase() }) })
    );
    expect(created.packet.identifiers.lei).toBe(LEI);
    expect(created.packet.sources.gleif.lei).toBe(LEI);
  });

  it("rejects invalid chain binding and nonce", () => {
    expect(() => createEvidencePacket(makeInput({ chainId: 0 }))).toThrow();
    expect(() =>
      createEvidencePacket(makeInput({ registryAddress: "not-an-address" }))
    ).toThrow();
    expect(() => createEvidencePacket(makeInput({ nonce: "0x00" }))).toThrow();
  });

  it("uses the configured issue time exactly", () => {
    expect(createEvidencePacket(makeInput()).packet.issuedAt).toBe(ISSUED_AT);
  });
});
