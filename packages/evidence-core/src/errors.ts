export type EvidenceErrorCode =
  | "INVALID_CANONICAL_VALUE"
  | "INVALID_CHAIN_ID"
  | "INVALID_CIK"
  | "INVALID_LEI"
  | "INVALID_NONCE"
  | "INVALID_REGISTRY_ADDRESS"
  | "INVALID_SOURCE_EVIDENCE"
  | "INVALID_TIMESTAMP"
  | "UNSUPPORTED_PACKET_VERSION";

export class EvidenceValidationError extends Error {
  readonly code: EvidenceErrorCode;

  constructor(code: EvidenceErrorCode, message: string) {
    super(message);
    this.name = "EvidenceValidationError";
    this.code = code;
  }
}
