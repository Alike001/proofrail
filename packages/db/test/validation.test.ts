import {
  DatabaseInvariantError,
  assertDraftConsistency,
  assertReceiptBatch,
  assertSignedEnvelopeConsistency
} from "../src/index.js";
import {
  ATTESTOR,
  GLEIF_BODY,
  makeBatch,
  makeDraftInput,
  makeEvent,
  makeTypedData,
  hash
} from "./fixtures.js";

describe("database boundary validation", () => {
  it("accepts a replayable packet with byte-matching snapshots", () => {
    expect(() => { assertDraftConsistency(makeDraftInput()); }).not.toThrow();
  });

  it("binds stored EIP-712 metadata to the immutable draft and publisher", () => {
    const input = makeDraftInput();
    const draft = {
      id: "00000000-0000-0000-0000-000000000001",
      secSnapshotId: "00000000-0000-0000-0000-000000000002",
      gleifSnapshotId: "00000000-0000-0000-0000-000000000003",
      chainId: input.packet.packet.chainId,
      registryAddress: input.packet.packet.registryAddress,
      cik: input.packet.packet.identifiers.cik,
      lei: input.packet.packet.identifiers.lei,
      pairKey: input.pairKey,
      normalizedSecName: "apple inc",
      normalizedGleifName: "apple inc",
      policyPassed: true,
      policyResult: input.packet.packet.policy,
      packet: input.packet.packet,
      canonicalPacket: input.packet.canonicalPacket,
      packetHash: input.packet.packetHash,
      nonce: input.packet.packet.nonce,
      issuedAt: new Date(input.packet.packet.issuedAt * 1_000),
      expiresAt: new Date(input.packet.packet.expiresAt * 1_000),
      createdAt: new Date()
    };
    const envelope = {
      packetHash: input.packet.packetHash,
      typedData: makeTypedData(input),
      signature: `0x${"1".repeat(130)}` as const,
      signerAddress: ATTESTOR,
      publisherAddress: "0x0000000000000000000000000000000000000001" as const
    };
    expect(() => {
      assertSignedEnvelopeConsistency(envelope, draft);
    }).not.toThrow();
    expect(() => {
      assertSignedEnvelopeConsistency(
        {
          ...envelope,
          typedData: {
            ...envelope.typedData,
            message: { ...envelope.typedData.message, publisher: ATTESTOR }
          }
        },
        draft
      );
    }).toThrow(DatabaseInvariantError);
  });

  it("rejects tampered snapshot bytes, metadata, pair keys, and packets", () => {
    const tamperedBody = makeDraftInput();
    expect(() =>
      { assertDraftConsistency({
        ...tamperedBody,
        gleifSnapshot: {
          ...tamperedBody.gleifSnapshot,
          body: new TextEncoder().encode(`${new TextDecoder().decode(GLEIF_BODY)} `)
        }
      }); }
    ).toThrow(DatabaseInvariantError);

    const wrongTime = makeDraftInput();
    expect(() =>
      { assertDraftConsistency({
        ...wrongTime,
        secSnapshot: {
          ...wrongTime.secSnapshot,
          retrievedAt: wrongTime.secSnapshot.retrievedAt + 1
        }
      }); }
    ).toThrow(DatabaseInvariantError);

    expect(() =>
      { assertDraftConsistency({ ...makeDraftInput(), pairKey: hash(99) }); }
    ).toThrow(DatabaseInvariantError);

    const changedPacket = makeDraftInput();
    expect(() =>
      { assertDraftConsistency({
        ...changedPacket,
        packet: {
          ...changedPacket.packet,
          canonicalPacket: `${changedPacket.packet.canonicalPacket} `
        }
      }); }
    ).toThrow(DatabaseInvariantError);
  });

  it("accepts a coherent confirmed event batch", () => {
    expect(() => { assertReceiptBatch(makeBatch()); }).not.toThrow();
  });

  it.each([
    makeBatch({ fromBlock: -1n }),
    makeBatch({ fromBlock: 101n, toBlock: 100n }),
    makeBatch({ chainId: 0 }),
    makeBatch({ contractAddress: "0xinvalid" })
  ])("rejects an invalid batch boundary", (batch) => {
    expect(() => { assertReceiptBatch(batch); }).toThrow(DatabaseInvariantError);
  });

  it("rejects events outside the batch and duplicate locations or packets", () => {
    expect(() =>
      { assertReceiptBatch(
        makeBatch({ events: [makeEvent({ blockNumber: 101n })] })
      ); }
    ).toThrow(DatabaseInvariantError);
    expect(() =>
      { assertReceiptBatch(makeBatch({ events: [makeEvent(), makeEvent()] })); }
    ).toThrow(DatabaseInvariantError);
    expect(() =>
      { assertReceiptBatch(
        makeBatch({
          events: [
            makeEvent(),
            makeEvent({ transactionHash: hash(40), logIndex: 1 })
          ]
        })
      ); }
    ).toThrow(DatabaseInvariantError);
  });

  it.each([
    makeEvent({ transactionHash: "0xinvalid" }),
    makeEvent({ publisherAddress: "0xinvalid" }),
    makeEvent({ attestorAddress: ATTESTOR.toUpperCase() as `0x${string}` }),
    makeEvent({ logIndex: -1 }),
    makeEvent({ blockNumber: -1n }),
    makeEvent({ schemaVersion: 0 }),
    makeEvent({ policyVersion: 0 }),
    makeEvent({ issuedAt: 0 }),
    makeEvent({ expiresAt: 1 }),
    makeEvent({ cik: "bad" }),
    makeEvent({ pairKey: hash(88) })
  ])("rejects invalid protected event data", (event) => {
    expect(() => { assertReceiptBatch(makeBatch({ events: [event] })); }).toThrow(
      DatabaseInvariantError
    );
  });
});
