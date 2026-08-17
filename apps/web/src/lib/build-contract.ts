import type { EvidencePacketV1 } from "@proofrail/evidence-core";

export interface EvidenceDraftView {
  readonly canonicalPacket: string;
  readonly draftId: string;
  readonly packet: EvidencePacketV1;
  readonly packetHash: `0x${string}`;
  readonly pairKey: `0x${string}`;
}

export interface PublishEnvelopeView {
  readonly attestorAddress: `0x${string}`;
  readonly chainId: number;
  readonly contractAddress: `0x${string}`;
  readonly digest: `0x${string}`;
  readonly envelope: {
    readonly packetHash: `0x${string}`;
    readonly pairKey: `0x${string}`;
    readonly nonce: `0x${string}`;
    readonly publisher: `0x${string}`;
    readonly cik: string;
    readonly lei: `0x${string}`;
    readonly issuedAt: string;
    readonly expiresAt: string;
    readonly schemaVersion: number;
    readonly policyVersion: number;
    readonly policyPassed: boolean;
  };
  readonly signature: `0x${string}`;
}

export interface ApiErrorView {
  readonly code: string;
  readonly field?: "cik" | "lei" | "publisher";
  readonly message: string;
  readonly source?: "SEC" | "GLEIF";
}

export type BuildEvidenceResponse =
  | { readonly ok: true; readonly draft: EvidenceDraftView }
  | { readonly ok: false; readonly error: ApiErrorView };

export type EnvelopeResponse =
  | { readonly ok: true; readonly publication: PublishEnvelopeView }
  | { readonly ok: false; readonly error: ApiErrorView };
