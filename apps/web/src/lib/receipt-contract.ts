import type { EvidencePacketV1, PolicyCheck } from "@proofrail/evidence-core";

export type ReceiptState = "CURRENT" | "EXPIRED" | "SUPERSEDED" | "INVALID";
export type ChainVerification = "VERIFIED" | "UNAVAILABLE" | "MISMATCH";

export interface ReceiptSourceView {
  readonly source: "SEC" | "GLEIF";
  readonly sourceUrl: string;
  readonly retrievedAt: string;
  readonly snapshotHash: `0x${string}`;
  readonly legalName: string | null;
  readonly latestFilingDate?: string | null;
  readonly latestFilingForm?: string | null;
  readonly entityStatus?: string | null;
}

export interface PublicReceiptView {
  readonly attestor: `0x${string}`;
  readonly blockHash: `0x${string}`;
  readonly blockNumber: string;
  readonly canonicalPacketDownload: string;
  readonly chainId: 677;
  readonly chainVerification: ChainVerification;
  readonly cik: string;
  readonly contractAddress: `0x${string}`;
  readonly expiresAt: string;
  readonly gleifSnapshotDownload: string;
  readonly issuedAt: string;
  readonly lei: string;
  readonly packet: EvidencePacketV1;
  readonly packetHash: `0x${string}`;
  readonly policyChecks: readonly PolicyCheck[];
  readonly policyPassed: boolean;
  readonly policyVersion: number;
  readonly publisher: `0x${string}`;
  readonly replayDeterministic: boolean;
  readonly secSnapshotDownload: string;
  readonly state: ReceiptState;
  readonly transactionHash: `0x${string}`;
}

export interface PublicReceiptResponse {
  readonly ok: true;
  readonly receipt: PublicReceiptView;
}

export interface ReplayResponse {
  readonly ok: true;
  readonly replay: {
    readonly deterministic: boolean;
    readonly packetHash: `0x${string}`;
    readonly policyChecks: readonly PolicyCheck[];
    readonly policyPassed: boolean;
  };
}

export interface RecheckResponse {
  readonly ok: true;
  readonly recheck: {
    readonly changed: boolean;
    readonly checkedAt: string;
    readonly gleif: ReceiptSourceView;
    readonly policyChecks: readonly PolicyCheck[];
    readonly policyPassed: boolean;
    readonly sec: ReceiptSourceView;
  };
}
