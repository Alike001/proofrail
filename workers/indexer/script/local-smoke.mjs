import { readFile } from "node:fs/promises";

import {
  IndexerRepository,
  createDatabaseConnection,
  migrateDatabase
} from "@proofrail/db";
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

import {
  EvidenceReceiptIndexer,
  createViemChainReader
} from "../dist/index.js";

const databaseUrl = process.env.PROOFRAIL_TEST_DATABASE_URL;

if (databaseUrl === undefined || databaseUrl === "") {
  throw new Error("PROOFRAIL_TEST_DATABASE_URL is required for the local indexer smoke test.");
}

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
      "../../../contracts/out/ProofRailEvidenceRegistry.sol/ProofRailEvidenceRegistry.json",
      import.meta.url
    ),
    "utf8"
  )
);
const publicClient = createPublicClient({ cacheTime: 0, chain, transport: http(rpcUrl) });
const accounts = await publicClient.request({ method: "eth_accounts" });

if (accounts.length < 3) {
  throw new Error("Local smoke test requires three unlocked Anvil accounts.");
}

const [owner, attestor, publisher] = accounts;
const ownerWallet = createWalletClient({ account: owner, chain, transport: http(rpcUrl) });
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
const lei = stringToHex("HWUPKR0MPOU8FGXBT394", { size: 20 });
const issuedAt = latestBlock.timestamp;
const envelope = {
  packetHash: keccak256(
    toBytes(`proofrail-indexer-local-smoke-packet:${registryAddress.toLowerCase()}`)
  ),
  pairKey: keccak256(encodePacked(["uint64", "bytes20"], [cik, lei])),
  nonce: keccak256(
    toBytes(`proofrail-indexer-local-smoke-nonce:${registryAddress.toLowerCase()}`)
  ),
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
  message: envelope,
  primaryType: "EvidenceEnvelope",
  types
});
const publicationHash = await publisherWallet.writeContract({
  account: publisher,
  address: registryAddress,
  abi: artifact.abi,
  args: [envelope, signature],
  functionName: "publishReceipt"
});
await publicClient.waitForTransactionReceipt({ hash: publicationHash });

const connection = createDatabaseConnection(databaseUrl);
try {
  await migrateDatabase(connection.db);
  const repository = new IndexerRepository(connection.db);
  await repository.resetContractIndex(chain.id, registryAddress.toLowerCase());
  const indexer = new EvidenceReceiptIndexer(
    createViemChainReader(publicClient),
    repository,
    {
      batchSize: 100,
      chainId: chain.id,
      confirmationDepth: 0,
      contractAddress: registryAddress,
      deploymentBlock: deploymentReceipt.blockNumber
    }
  );
  const indexed = await indexer.runOnce();
  const receipt = await repository.findReceipt(envelope.packetHash);
  if (
    indexed.status !== "indexed" ||
    indexed.insertedEvents !== 1 ||
    receipt?.transactionHash !== publicationHash ||
    receipt.packetHash !== envelope.packetHash ||
    receipt.pairKey !== envelope.pairKey
  ) {
    throw new Error("The local contract event did not reconcile with the indexed receipt.");
  }
  console.log(
    JSON.stringify(
      {
        chainId: chain.id,
        indexedBlock: receipt.blockNumber.toString(),
        packetHash: receipt.packetHash,
        publicationTransaction: publicationHash,
        registryAddress,
        status: indexed.status
      },
      null,
      2
    )
  );
} finally {
  await connection.close();
}
