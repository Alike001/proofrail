import { defineChain } from "viem";

export const botMainnet = defineChain({
  blockExplorers: {
    default: { name: "BOTScan", url: "https://scan.botchain.ai" }
  },
  id: 677,
  name: "BOT Chain Mainnet",
  nativeCurrency: { decimals: 18, name: "BOT", symbol: "BOT" },
  rpcUrls: {
    default: { http: ["https://rpc.botchain.ai"] }
  }
});

export const evidenceRegistryAbi = [
  {
    inputs: [
      {
        components: [
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
        ],
        name: "envelope",
        type: "tuple"
      },
      { name: "signature", type: "bytes" }
    ],
    name: "publishReceipt",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;
