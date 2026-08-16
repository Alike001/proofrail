import {
  SOURCE_FRESHNESS_SECONDS,
  computePairKey,
  replayEvidencePacket
} from "@proofrail/evidence-core";
import type { EvidencePacketV1 } from "@proofrail/evidence-core";
import type {
  PersistSignedEnvelopeInput,
  SignedEnvelopeDocument,
  evidenceDrafts
} from "@proofrail/db";
import {
  getAddress,
  hashTypedData,
  isAddress,
  recoverTypedDataAddress,
  stringToHex
} from "viem";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const EVIDENCE_ENVELOPE_TYPES = {
  EvidenceEnvelope: [
    { name: "packetHash", type: "bytes32" },
    { name: "pairKey", type: "bytes32" },
    { name: "nonce", type: "bytes32" },
    { name: "publisher", type: "address" },
    { name: "cik", type: "uint64" },
    { name: "lei", type: "bytes20" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
    { name: "schemaVersion", type: "uint16" },
    { name: "policyVersion", type: "uint16" },
    { name: "policyPassed", type: "bool" }
  ]
} as const;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

type Draft = typeof evidenceDrafts.$inferSelect;

export class EnvelopeSigningError extends Error {
  constructor(message: string, options: { readonly cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "EnvelopeSigningError";
  }
}

export interface SignedEnvelopeResult {
  readonly digest: Hex;
  readonly attestorAddress: Address;
  readonly persisted: PersistSignedEnvelopeInput;
}

export class EnvelopeSigner {
  readonly #account: ReturnType<typeof privateKeyToAccount>;
  readonly #chainId: number;
  readonly #registryAddress: Address;

  constructor(
    privateKey: Hex,
    binding: { readonly chainId: number; readonly registryAddress: string }
  ) {
    if (!/^0x[0-9a-fA-F]{64}$/u.test(privateKey) || /^0x0{64}$/u.test(privateKey)) {
      throw new EnvelopeSigningError("The attestor private key must be a non-zero 32-byte hex value.");
    }
    try {
      this.#account = privateKeyToAccount(privateKey);
    } catch (error) {
      throw new EnvelopeSigningError("The attestor private key is invalid.", { cause: error });
    }
    if (!Number.isSafeInteger(binding.chainId) || binding.chainId <= 0) {
      throw new EnvelopeSigningError("The signer chain ID must be a positive safe integer.");
    }
    this.#chainId = binding.chainId;
    this.#registryAddress = normalizeAddress(binding.registryAddress, "registry");
  }

  async signDraft(
    draft: Draft,
    publisherInput: string,
    nowSeconds: number
  ): Promise<SignedEnvelopeResult> {
    const publisher = normalizePublisher(publisherInput);
    assertDraftCanBeSigned(draft, nowSeconds);
    if (
      draft.chainId !== this.#chainId ||
      draft.registryAddress.toLowerCase() !== this.#registryAddress.toLowerCase()
    ) {
      throw new EnvelopeSigningError(
        "The immutable draft does not match the signer's configured chain and registry."
      );
    }
    const typedData = createTypedData(draft.packet, draft.pairKey, publisher);
    const signature = await this.#account.signTypedData(typedData);
    const recovered = await recoverTypedDataAddress({ ...typedData, signature });
    /* v8 ignore next 3: local signing and recovery use the same audited viem primitive. */
    if (recovered.toLowerCase() !== this.#account.address.toLowerCase()) {
      throw new EnvelopeSigningError("The produced signature did not recover the configured attestor.");
    }
    const document = serializeTypedData(typedData);
    return {
      digest: hashTypedData(typedData),
      attestorAddress: this.#account.address,
      persisted: {
        packetHash: draft.packetHash as Hex,
        typedData: document,
        signature,
        signerAddress: this.#account.address.toLowerCase() as Address,
        publisherAddress: publisher.toLowerCase() as Address
      }
    };
  }
}

export function assertDraftCanBeSigned(draft: Draft, nowSeconds: number): void {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) {
    throw new EnvelopeSigningError("The signing time must be a positive Unix timestamp.");
  }
  const replay = replayEvidencePacket(draft.packet);
  if (
    !replay.deterministic ||
    replay.providedCanonicalPacket !== draft.canonicalPacket ||
    replay.providedPacketHash !== draft.packetHash ||
    !draft.policyPassed ||
    !draft.packet.policy.passed
  ) {
    throw new EnvelopeSigningError("Only an unchanged deterministic passing draft can be signed.");
  }
  if (
    draft.packet.chainId !== draft.chainId ||
    draft.packet.registryAddress !== draft.registryAddress ||
    draft.packet.nonce !== draft.nonce ||
    computePairKey(draft.cik, draft.lei) !== draft.pairKey
  ) {
    throw new EnvelopeSigningError("The draft database fields do not match its protected packet.");
  }
  if (nowSeconds >= draft.packet.expiresAt) {
    throw new EnvelopeSigningError("The evidence envelope has expired.");
  }
  if (draft.packet.issuedAt > nowSeconds + MAX_CLOCK_SKEW_SECONDS) {
    throw new EnvelopeSigningError("The evidence issue time exceeds the contract clock skew.");
  }
  const oldestSource = Math.min(
    draft.packet.sources.sec.retrievedAt,
    draft.packet.sources.gleif.retrievedAt
  );
  if (nowSeconds - oldestSource > SOURCE_FRESHNESS_SECONDS) {
    throw new EnvelopeSigningError("The evidence sources are too old for a new signature.");
  }
}

export function createTypedData(
  packet: EvidencePacketV1,
  pairKey: string,
  publisher: Address
) {
  return {
    domain: {
      name: "ProofRailEvidenceRegistry",
      version: "1",
      chainId: packet.chainId,
      verifyingContract: packet.registryAddress
    },
    types: EVIDENCE_ENVELOPE_TYPES,
    primaryType: "EvidenceEnvelope" as const,
    message: {
      packetHash: hash32(packetHashOf(packet)),
      pairKey: hash32(pairKey),
      nonce: packet.nonce,
      publisher,
      cik: BigInt(packet.identifiers.cik),
      lei: stringToHex(packet.identifiers.lei, { size: 20 }),
      issuedAt: BigInt(packet.issuedAt),
      expiresAt: BigInt(packet.expiresAt),
      schemaVersion: packet.schemaVersion,
      policyVersion: packet.policyVersion,
      policyPassed: packet.policy.passed
    }
  } as const;
}

function serializeTypedData(
  typedData: ReturnType<typeof createTypedData>
): SignedEnvelopeDocument {
  return {
    domain: typedData.domain,
    primaryType: typedData.primaryType,
    types: typedData.types,
    message: {
      packetHash: typedData.message.packetHash,
      pairKey: typedData.message.pairKey,
      nonce: typedData.message.nonce,
      publisher: typedData.message.publisher.toLowerCase(),
      cik: typedData.message.cik.toString(),
      lei: typedData.message.lei,
      issuedAt: typedData.message.issuedAt.toString(),
      expiresAt: typedData.message.expiresAt.toString(),
      schemaVersion: typedData.message.schemaVersion,
      policyVersion: typedData.message.policyVersion,
      policyPassed: typedData.message.policyPassed
    }
  };
}

function packetHashOf(packet: EvidencePacketV1): string {
  return replayEvidencePacket(packet).providedPacketHash;
}

function hash32(value: string): Hex {
  if (!/^0x[0-9a-f]{64}$/u.test(value)) {
    throw new EnvelopeSigningError("An envelope hash field is not a lowercase 32-byte value.");
  }
  return value as Hex;
}

function normalizePublisher(value: string): Address {
  return normalizeAddress(value, "publisher");
}

function normalizeAddress(value: string, label: string): Address {
  if (!isAddress(value, { strict: false })) {
    throw new EnvelopeSigningError(`The ${label} must be a valid EVM address.`);
  }
  return getAddress(value);
}
