import { readFile } from "node:fs/promises";

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodePacked,
  http,
  keccak256,
  stringToHex,
  toBytes
} from "viem";

const rpcUrl = process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545";
const chain = defineChain({
  id: 31_337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } }
});
const artifact = JSON.parse(
  await readFile(
    new URL(
      "../out/ProofRailEvidenceRegistry.sol/ProofRailEvidenceRegistry.json",
      import.meta.url
    ),
    "utf8"
  )
);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const accounts = await publicClient.request({ method: "eth_accounts" });

if (accounts.length < 3) {
  throw new Error("Local smoke test requires three unlocked Anvil accounts.");
}

const [owner, attestor, publisher] = accounts;
const ownerWallet = createWalletClient({
  account: owner,
  chain,
  transport: http(rpcUrl)
});
const attestorWallet = createWalletClient({
  account: attestor,
  chain,
  transport: http(rpcUrl)
});
const publisherWallet = createWalletClient({
  account: publisher,
  chain,
  transport: http(rpcUrl)
});
const deploymentHash = await ownerWallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  args: [owner, attestor]
});
const deploymentReceipt = await publicClient.waitForTransactionReceipt({
  hash: deploymentHash
});
const registryAddress = deploymentReceipt.contractAddress;

if (registryAddress === null) {
  throw new Error("Registry deployment did not return a contract address.");
}

const latestBlock = await publicClient.getBlock();
const cik = 320_193n;
const lei = stringToHex("5493001KJTIIGC8Y1R12", { size: 20 });
const issuedAt = latestBlock.timestamp;
const envelope = {
  packetHash: keccak256(toBytes("proofrail-local-smoke-packet")),
  pairKey: keccak256(encodePacked(["uint64", "bytes20"], [cik, lei])),
  nonce: keccak256(toBytes("proofrail-local-smoke-nonce")),
  publisher,
  cik,
  lei,
  issuedAt,
  expiresAt: issuedAt + 86_400n,
  schemaVersion: 1,
  policyVersion: 1,
  policyPassed: true
};
const types = {
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
};
const signature = await attestorWallet.signTypedData({
  account: attestor,
  domain: {
    name: "ProofRailEvidenceRegistry",
    version: "1",
    chainId: chain.id,
    verifyingContract: registryAddress
  },
  types,
  primaryType: "EvidenceEnvelope",
  message: envelope
});
const publicationHash = await publisherWallet.writeContract({
  account: publisher,
  address: registryAddress,
  abi: artifact.abi,
  functionName: "publishReceipt",
  args: [envelope, signature]
});
const publicationReceipt = await publicClient.waitForTransactionReceipt({
  hash: publicationHash
});
const exists = await publicClient.readContract({
  address: registryAddress,
  abi: artifact.abi,
  functionName: "receiptExists",
  args: [envelope.packetHash]
});
const latestPacket = await publicClient.readContract({
  address: registryAddress,
  abi: artifact.abi,
  functionName: "latestPacketByPair",
  args: [envelope.pairKey]
});

if (
  publicationReceipt.status !== "success" ||
  exists !== true ||
  latestPacket !== envelope.packetHash
) {
  throw new Error("Local receipt publication did not reconcile with registry state.");
}

console.log(
  JSON.stringify(
    {
      chainId: chain.id,
      registryAddress,
      deploymentTransaction: deploymentHash,
      publicationTransaction: publicationHash,
      packetHash: envelope.packetHash,
      publisher,
      attestor,
      receiptExists: exists
    },
    null,
    2
  )
);
