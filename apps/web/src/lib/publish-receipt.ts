import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  isAddress
} from "viem";
import type { Address, EIP1193Provider, Hex } from "viem";

import type { PublishEnvelopeView } from "./build-contract";
import { botMainnet, evidenceRegistryAbi } from "./bot-chain";

const BOT_CHAIN_HEX = "0x2a5";

export class WalletFlowError extends Error {
  readonly code: "WALLET_MISSING" | "WALLET_REJECTED" | "WRONG_NETWORK" | "TRANSACTION_FAILED";

  constructor(code: WalletFlowError["code"], message: string, options: { cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "WalletFlowError";
    this.code = code;
  }
}

export async function connectBotPublisher(provider: EIP1193Provider): Promise<Address> {
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const account = Array.isArray(accounts) ? accounts[0] : undefined;
    if (typeof account !== "string" || !isAddress(account, { strict: false })) {
      throw new WalletFlowError("WALLET_MISSING", "The wallet did not return a valid account.");
    }
    await ensureBotMainnet(provider);
    return getAddress(account);
  } catch (error) {
    throw normalizeWalletError(error, "Wallet connection was not completed.");
  }
}

export async function submitEvidenceReceipt(
  provider: EIP1193Provider,
  account: Address,
  publication: PublishEnvelopeView
): Promise<Hex> {
  if (publication.chainId !== botMainnet.id) {
    throw new WalletFlowError("WRONG_NETWORK", "The publication envelope is not bound to BOT mainnet.");
  }
  try {
    const wallet = createWalletClient({
      account,
      chain: botMainnet,
      transport: custom(provider)
    });
    return await wallet.writeContract({
      abi: evidenceRegistryAbi,
      address: publication.contractAddress,
      args: [
        {
          cik: BigInt(publication.envelope.cik),
          expiresAt: BigInt(publication.envelope.expiresAt),
          issuedAt: BigInt(publication.envelope.issuedAt),
          lei: publication.envelope.lei,
          nonce: publication.envelope.nonce,
          packetHash: publication.envelope.packetHash,
          pairKey: publication.envelope.pairKey,
          policyPassed: publication.envelope.policyPassed,
          policyVersion: publication.envelope.policyVersion,
          publisher: publication.envelope.publisher,
          schemaVersion: publication.envelope.schemaVersion
        },
        publication.signature
      ],
      functionName: "publishReceipt"
    });
  } catch (error) {
    throw normalizeWalletError(error, "The BOT Chain transaction was not submitted.");
  }
}

export async function waitForEvidenceReceipt(
  provider: EIP1193Provider,
  transactionHash: Hex
): Promise<void> {
  try {
    const client = createPublicClient({ chain: botMainnet, transport: custom(provider) });
    const receipt = await client.waitForTransactionReceipt({
      confirmations: 1,
      hash: transactionHash,
      timeout: 90_000
    });
    if (receipt.status !== "success") {
      throw new WalletFlowError(
        "TRANSACTION_FAILED",
        "The BOT Chain transaction reverted. The evidence packet remains unpublished."
      );
    }
  } catch (error) {
    throw normalizeWalletError(error, "The transaction could not be confirmed.");
  }
}

function ethereumErrorCode(error: unknown): number | undefined {
  const seen = new Set<object>();
  let current = error;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current !== "object" || current === null || seen.has(current)) {
      return undefined;
    }
    seen.add(current);
    if ("code" in current && typeof current.code === "number") {
      return current.code;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

async function ensureBotMainnet(provider: EIP1193Provider): Promise<void> {
  const current = await provider.request({ method: "eth_chainId" });
  if (current === BOT_CHAIN_HEX) {
    return;
  }
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BOT_CHAIN_HEX }]
    });
  } catch (error) {
    if (ethereumErrorCode(error) !== 4902) {
      throw error;
    }
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          blockExplorerUrls: [botMainnet.blockExplorers.default.url],
          chainId: BOT_CHAIN_HEX,
          chainName: botMainnet.name,
          nativeCurrency: botMainnet.nativeCurrency,
          rpcUrls: [...botMainnet.rpcUrls.default.http]
        }
      ]
    });
  }
  const switched = await provider.request({ method: "eth_chainId" });
  if (switched !== BOT_CHAIN_HEX) {
    throw new WalletFlowError("WRONG_NETWORK", "Switch the wallet to BOT Chain mainnet, chain ID 677.");
  }
}

function normalizeWalletError(error: unknown, fallback: string): WalletFlowError {
  if (error instanceof WalletFlowError) {
    return error;
  }
  if (ethereumErrorCode(error) === 4001) {
    return new WalletFlowError(
      "WALLET_REJECTED",
      "The wallet request was rejected. The evidence packet remains unpublished.",
      { cause: error }
    );
  }
  return new WalletFlowError("TRANSACTION_FAILED", fallback, { cause: error });
}
