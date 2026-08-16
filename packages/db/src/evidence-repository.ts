import {
  computePairKey,
  hashSourceSnapshot,
  replayEvidencePacket
} from "@proofrail/evidence-core";
import type { HashedEvidencePacket } from "@proofrail/evidence-core";
import type { SourceSnapshot } from "@proofrail/source-service";
import { eq } from "drizzle-orm";

import type { ProofRailDatabase } from "./client.js";
import { DatabaseInvariantError } from "./errors.js";
import {
  evidenceDrafts,
  signedEnvelopes,
  sourceSnapshots
} from "./schema.js";
import type { SignedEnvelopeDocument } from "./schema.js";

export interface PersistDraftInput {
  readonly packet: HashedEvidencePacket;
  readonly pairKey: HexString;
  readonly secSnapshot: SourceSnapshot;
  readonly gleifSnapshot: SourceSnapshot;
}

export interface PersistSignedEnvelopeInput {
  readonly packetHash: HexString;
  readonly typedData: SignedEnvelopeDocument;
  readonly signature: HexString;
  readonly signerAddress: HexString;
  readonly publisherAddress: HexString;
}

type HexString = `0x${string}`;

export class EvidenceRepository {
  readonly #db: ProofRailDatabase;

  constructor(db: ProofRailDatabase) {
    this.#db = db;
  }

  async createDraft(input: PersistDraftInput): Promise<{ readonly id: string }> {
    assertDraftConsistency(input);
    return this.#db.transaction(async (transaction) => {
      const [sec] = await transaction
        .insert(sourceSnapshots)
        .values(snapshotValues(input.secSnapshot))
        .returning({ id: sourceSnapshots.id });
      const [gleif] = await transaction
        .insert(sourceSnapshots)
        .values(snapshotValues(input.gleifSnapshot))
        .returning({ id: sourceSnapshots.id });
      if (sec === undefined || gleif === undefined) {
        throw new DatabaseInvariantError("PostgreSQL did not return inserted snapshot IDs.");
      }

      const { packet } = input.packet;
      const [draft] = await transaction
        .insert(evidenceDrafts)
        .values({
          secSnapshotId: sec.id,
          gleifSnapshotId: gleif.id,
          chainId: packet.chainId,
          registryAddress: packet.registryAddress,
          cik: packet.identifiers.cik,
          lei: packet.identifiers.lei,
          pairKey: input.pairKey,
          normalizedSecName: packet.sources.sec.normalizedLegalName,
          normalizedGleifName: packet.sources.gleif.normalizedLegalName,
          policyPassed: packet.policy.passed,
          policyResult: packet.policy,
          packet,
          canonicalPacket: input.packet.canonicalPacket,
          packetHash: input.packet.packetHash,
          nonce: packet.nonce,
          issuedAt: fromUnixSeconds(packet.issuedAt),
          expiresAt: fromUnixSeconds(packet.expiresAt)
        })
        .returning({ id: evidenceDrafts.id });
      if (draft === undefined) {
        throw new DatabaseInvariantError("PostgreSQL did not return the inserted draft ID.");
      }
      return draft;
    });
  }

  async findDraftByPacketHash(packetHash: HexString) {
    const [row] = await this.#db
      .select()
      .from(evidenceDrafts)
      .where(eq(evidenceDrafts.packetHash, packetHash))
      .limit(1);
    return row ?? null;
  }

  async saveSignedEnvelope(input: PersistSignedEnvelopeInput): Promise<void> {
    const draft = await this.findDraftByPacketHash(input.packetHash);
    if (draft === null) {
      throw new DatabaseInvariantError(
        "A signed envelope cannot be stored before its immutable draft."
      );
    }
    assertSignedEnvelopeConsistency(input, draft);
    await this.#db.insert(signedEnvelopes).values({
      packetHash: input.packetHash,
      typedData: input.typedData,
      signature: input.signature,
      signerAddress: input.signerAddress,
      publisherAddress: input.publisherAddress
    });
  }
}

export function assertSignedEnvelopeConsistency(
  input: PersistSignedEnvelopeInput,
  draft: typeof evidenceDrafts.$inferSelect
): void {
  const { domain, message } = input.typedData;
  if (
    input.typedData.primaryType !== "EvidenceEnvelope" ||
    domain.name !== "ProofRailEvidenceRegistry" ||
    domain.version !== "1" ||
    domain.chainId !== draft.chainId ||
    domain.verifyingContract !== draft.registryAddress ||
    message.packetHash !== draft.packetHash ||
    message.pairKey !== draft.pairKey ||
    message.nonce !== draft.nonce ||
    message.publisher !== input.publisherAddress
  ) {
    throw new DatabaseInvariantError(
      "The signed envelope document does not match its immutable draft and publisher."
    );
  }
}

export function assertDraftConsistency(input: PersistDraftInput): void {
  const { packet } = input.packet;
  const replay = replayEvidencePacket(packet);
  if (
    !replay.deterministic ||
    replay.providedCanonicalPacket !== input.packet.canonicalPacket ||
    replay.providedPacketHash !== input.packet.packetHash
  ) {
    throw new DatabaseInvariantError(
      "The evidence packet does not replay to its supplied canonical packet and hash."
    );
  }
  if (computePairKey(packet.identifiers.cik, packet.identifiers.lei) !== input.pairKey) {
    throw new DatabaseInvariantError("The supplied pair key does not match the packet identifiers.");
  }
  assertSnapshotMatches(
    input.secSnapshot,
    "SEC",
    packet.sources.sec.snapshotHash,
    packet.sources.sec.sourceUrl,
    packet.sources.sec.retrievedAt
  );
  assertSnapshotMatches(
    input.gleifSnapshot,
    "GLEIF",
    packet.sources.gleif.snapshotHash,
    packet.sources.gleif.sourceUrl,
    packet.sources.gleif.retrievedAt
  );
}

function assertSnapshotMatches(
  snapshot: SourceSnapshot,
  source: "SEC" | "GLEIF",
  packetHash: HexString | null,
  sourceUrl: string,
  retrievedAt: number
): void {
  if (
    snapshot.source !== source ||
    snapshot.body.byteLength === 0 ||
    snapshot.snapshotHash !== packetHash ||
    snapshot.sourceUrl !== sourceUrl ||
    snapshot.retrievedAt !== retrievedAt ||
    hashSourceSnapshot(snapshot.body) !== snapshot.snapshotHash
  ) {
    throw new DatabaseInvariantError(
      `${source} snapshot bytes or metadata do not match the protected packet.`
    );
  }
}

function snapshotValues(snapshot: SourceSnapshot) {
  return {
    source: snapshot.source,
    sourceUrl: snapshot.sourceUrl,
    retrievedAt: fromUnixSeconds(snapshot.retrievedAt),
    responseHeaders: snapshot.responseHeaders,
    body: snapshot.body,
    snapshotHash: snapshot.snapshotHash
  };
}

function fromUnixSeconds(value: number): Date {
  return new Date(value * 1_000);
}
