import { sql } from "drizzle-orm";

import {
  EvidenceRepository,
  IndexerRepository,
  chainEvents,
  createDatabaseConnection,
  currentReceipts,
  evidenceDrafts,
  indexerCursors,
  migrateDatabase,
  receipts,
  signedEnvelopes,
  sourceSnapshots
} from "../src/index.js";
import type { ProofRailDatabaseConnection } from "../src/index.js";
import {
  ATTESTOR,
  CHAIN_ID,
  PUBLISHER,
  REGISTRY,
  makeBatch,
  makeDraftInput,
  makeEvent,
  makeTypedData,
  hash
} from "./fixtures.js";

const databaseUrl = process.env.PROOFRAIL_TEST_DATABASE_URL;
const describeDatabase = databaseUrl === undefined ? describe.skip : describe;

describeDatabase("PostgreSQL persistence", () => {
  let connection: ProofRailDatabaseConnection;

  beforeAll(async () => {
    connection = createDatabaseConnection(databaseUrl ?? "");
    await migrateDatabase(connection.db);
  });

  afterAll(async () => {
    await connection.close();
  });

  beforeEach(async () => {
    await connection.pool.query(
      "TRUNCATE current_receipts, receipts, chain_events, signed_envelopes, evidence_drafts, source_snapshots, indexer_cursors RESTART IDENTITY CASCADE"
    );
  });

  it("stores an exact immutable evidence draft and signed envelope", async () => {
    const repository = new EvidenceRepository(connection.db);
    const input = makeDraftInput();
    const created = await repository.createDraft(input);
    const found = await repository.findDraftByPacketHash(input.packet.packetHash);
    expect(found).toMatchObject({
      id: created.id,
      packetHash: input.packet.packetHash,
      canonicalPacket: input.packet.canonicalPacket,
      policyPassed: true
    });

    const snapshots = await connection.db.select().from(sourceSnapshots);
    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((snapshot) => new TextDecoder().decode(snapshot.body))).toEqual(
      expect.arrayContaining([
        new TextDecoder().decode(input.secSnapshot.body),
        new TextDecoder().decode(input.gleifSnapshot.body)
      ])
    );

    const envelopeInput = {
      packetHash: input.packet.packetHash,
      typedData: makeTypedData(input),
      signature: `0x${"1".repeat(130)}`,
      signerAddress: ATTESTOR,
      publisherAddress: PUBLISHER
    } as const;
    await repository.saveSignedEnvelope(envelopeInput);
    await repository.saveSignedEnvelope(envelopeInput);
    expect(await connection.db.select().from(signedEnvelopes)).toHaveLength(1);
    await expect(
      repository.saveSignedEnvelope({
        ...envelopeInput,
        signature: `0x${"2".repeat(130)}`
      })
    ).rejects.toThrow("A different immutable envelope already exists");
    await expect(repository.findDraftById(created.id)).resolves.toMatchObject({
      packetHash: input.packet.packetHash
    });
    await expect(
      repository.findSignedEnvelopeByPacketHash(input.packet.packetHash)
    ).resolves.toMatchObject({ publisherAddress: PUBLISHER });

    await expect(
      connection.pool.query("UPDATE evidence_drafts SET policy_passed = false")
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      connection.pool.query("DELETE FROM source_snapshots")
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      connection.pool.query("UPDATE signed_envelopes SET signer_address = $1", [
        PUBLISHER
      ])
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("rolls back both new snapshots when a draft uniqueness check fails", async () => {
    const repository = new EvidenceRepository(connection.db);
    const input = makeDraftInput();
    await repository.createDraft(input);
    await expect(repository.createDraft(input)).rejects.toMatchObject({
      cause: { code: "23505" }
    });

    expect(await connection.db.select().from(sourceSnapshots)).toHaveLength(2);
    expect(await connection.db.select().from(evidenceDrafts)).toHaveLength(1);
  });

  it("enforces signature structure in PostgreSQL", async () => {
    const repository = new EvidenceRepository(connection.db);
    const input = makeDraftInput();
    await expect(
      repository.saveSignedEnvelope({
        packetHash: hash(99),
        typedData: makeTypedData(input),
        signature: `0x${"1".repeat(130)}`,
        signerAddress: ATTESTOR,
        publisherAddress: PUBLISHER
      })
    ).rejects.toThrow("before its immutable draft");
    await repository.createDraft(input);
    await expect(
      repository.saveSignedEnvelope({
        packetHash: input.packet.packetHash,
        typedData: makeTypedData(input),
        signature: "0x01",
        signerAddress: ATTESTOR,
        publisherAddress: PUBLISHER
      })
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("atomically indexes a batch and treats the same confirmed batch as idempotent", async () => {
    const repository = new IndexerRepository(connection.db);
    const batch = makeBatch();
    await expect(repository.ingestBatch(batch)).resolves.toEqual({
      insertedEvents: 1,
      duplicateEvents: 0,
      alreadyProcessed: false
    });
    await expect(repository.ingestBatch(batch)).resolves.toEqual({
      insertedEvents: 0,
      duplicateEvents: 1,
      alreadyProcessed: true
    });
    expect(await connection.db.select().from(chainEvents)).toHaveLength(1);
    expect(await connection.db.select().from(receipts)).toHaveLength(1);
    expect(await connection.db.select().from(currentReceipts)).toMatchObject([
      { packetHash: makeEvent().packetHash, blockNumber: 100n }
    ]);
    expect(await connection.db.select().from(indexerCursors)).toMatchObject([
      { lastProcessedBlock: 100n, lastVerifiedBlockHash: batch.toBlockHash }
    ]);
    await expect(repository.findReceipt(makeEvent().packetHash)).resolves.toMatchObject({
      packetHash: makeEvent().packetHash
    });
    await expect(repository.findReceipt(hash(99))).resolves.toBeNull();
    await expect(
      repository.findLatestReceipt(CHAIN_ID, REGISTRY)
    ).resolves.toMatchObject({
      packetHash: makeEvent().packetHash
    });
    await expect(
      repository.findLatestReceipt(
        CHAIN_ID,
        "0x0000000000000000000000000000000000000998"
      )
    ).resolves.toBeNull();
  });

  it("atomically clears one registry's derived state for reorganization recovery", async () => {
    const repository = new IndexerRepository(connection.db);
    await expect(repository.getCursor(677, makeBatch().contractAddress)).resolves.toBeNull();
    await repository.ingestBatch(makeBatch());
    await expect(repository.getCursor(677, makeBatch().contractAddress)).resolves.toEqual({
      lastProcessedBlock: 100n,
      lastVerifiedBlockHash: makeBatch().toBlockHash
    });
    await expect(
      repository.resetContractIndex(677, makeBatch().contractAddress)
    ).resolves.toEqual({ deletedCursor: true, deletedEvents: 1 });
    expect(await connection.db.select().from(chainEvents)).toHaveLength(0);
    expect(await connection.db.select().from(receipts)).toHaveLength(0);
    expect(await connection.db.select().from(currentReceipts)).toHaveLength(0);
    expect(await connection.db.select().from(indexerCursors)).toHaveLength(0);
    await expect(
      repository.resetContractIndex(677, makeBatch().contractAddress)
    ).resolves.toEqual({ deletedCursor: false, deletedEvents: 0 });
  });

  it("updates the pair pointer only for the newer chain position", async () => {
    const repository = new IndexerRepository(connection.db);
    await repository.ingestBatch(makeBatch());
    const nextEvent = makeEvent({
      transactionHash: hash(20),
      blockNumber: 101n,
      blockHash: hash(21),
      packetHash: hash(22),
      nonce: hash(23)
    });
    await repository.ingestBatch(
      makeBatch({
        fromBlock: 101n,
        toBlock: 101n,
        toBlockHash: hash(21),
        events: [nextEvent]
      })
    );
    expect(await connection.db.select().from(currentReceipts)).toMatchObject([
      { packetHash: nextEvent.packetHash, blockNumber: 101n }
    ]);
  });

  it("rejects cursor gaps and rolls back a conflicting duplicate event", async () => {
    const repository = new IndexerRepository(connection.db);
    await repository.ingestBatch(makeBatch());
    await expect(
      repository.ingestBatch(
        makeBatch({ fromBlock: 102n, toBlock: 102n, toBlockHash: hash(30), events: [] })
      )
    ).rejects.toThrow("does not start at the block after");

    const conflicting = makeEvent({
      blockNumber: 101n,
      blockHash: hash(31),
      packetHash: hash(32)
    });
    await expect(
      repository.ingestBatch(
        makeBatch({
          fromBlock: 101n,
          toBlock: 101n,
          toBlockHash: hash(31),
          events: [conflicting]
        })
      )
    ).rejects.toThrow("different protected event data");
    expect(await connection.db.select().from(chainEvents)).toHaveLength(1);
    expect(await connection.db.select().from(indexerCursors)).toMatchObject([
      { lastProcessedBlock: 100n }
    ]);
  });

  it("rejects a stale or hash-conflicting cursor replay", async () => {
    const repository = new IndexerRepository(connection.db);
    await repository.ingestBatch(makeBatch());
    await expect(
      repository.ingestBatch(
        makeBatch({ toBlockHash: hash(77), events: [] })
      )
    ).rejects.toThrow("older than the committed cursor");
    await connection.db.execute(sql`select 1`);
  });

  it("rejects different decoded data at an already processed event location", async () => {
    const repository = new IndexerRepository(connection.db);
    const batch = makeBatch();
    await repository.ingestBatch(batch);
    await expect(
      repository.ingestBatch({
        ...batch,
        events: [
          makeEvent({
            publisherAddress: "0x0000000000000000000000000000000000000003"
          })
        ]
      })
    ).rejects.toThrow("different decoded receipt data");
  });
});
