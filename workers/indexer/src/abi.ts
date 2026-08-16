import { parseAbiItem } from "viem";

export const EVIDENCE_RECEIPT_PUBLISHED_EVENT = parseAbiItem(
  "event EvidenceReceiptPublished(bytes32 indexed packetHash, bytes32 indexed pairKey, bytes32 indexed nonce, uint64 cik, bytes20 lei, uint64 issuedAt, uint64 expiresAt, uint16 schemaVersion, uint16 policyVersion, address publisher, address attestor)"
);
