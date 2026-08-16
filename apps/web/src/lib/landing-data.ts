import { BOT_CHAIN_ID } from "./site";

export type LandingReceipt =
  | {
      readonly kind: "available";
      readonly attestor: string;
      readonly cik: string;
      readonly entityName: string;
      readonly expiresAt: string;
      readonly issuedAt: string;
      readonly lei: string;
      readonly packetHash: string;
      readonly policyPassed: true;
      readonly publisher: string;
      readonly registryAddress: string;
      readonly transactionHash: string;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: string;
    };

export const REFERENCE_ENTITY = {
  chainId: BOT_CHAIN_ID,
  cik: "0000320193",
  entityName: "Apple Inc.",
  lei: "HWUPKR0MPOU8FGXBT394"
} as const;
