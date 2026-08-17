import type { EIP1193Provider } from "viem";

import type { PublishEnvelopeView } from "../src/lib/build-contract";
import {
  connectBotPublisher,
  submitEvidenceReceipt,
  waitForEvidenceReceipt
} from "../src/lib/publish-receipt";
import type { WalletFlowError } from "../src/lib/publish-receipt";

const ACCOUNT = "0x0000000000000000000000000000000000000001";
const REGISTRY = "0x0000000000000000000000000000000000000677";
const TRANSACTION_HASH = hash(4);

describe("BOT wallet boundary", () => {
  it("connects a valid publisher already on BOT mainnet", async () => {
    const request = vi.fn(({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return Promise.resolve([ACCOUNT]);
      if (method === "eth_chainId") return Promise.resolve("0x2a5");
      throw new Error(`Unexpected ${method}`);
    });
    await expect(connectBotPublisher(provider(request))).resolves.toBe(ACCOUNT);
    expect(request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "wallet_switchEthereumChain" })
    );
  });

  it("switches a wallet from another network and verifies the result", async () => {
    let chainId = "0x1";
    const request = vi.fn(({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return Promise.resolve([ACCOUNT]);
      if (method === "eth_chainId") return Promise.resolve(chainId);
      if (method === "wallet_switchEthereumChain") {
        chainId = "0x2a5";
        return Promise.resolve(null);
      }
      throw new Error(`Unexpected ${method}`);
    });
    await expect(connectBotPublisher(provider(request))).resolves.toBe(ACCOUNT);
    expect(request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x2a5" }]
    });
  });

  it("adds BOT mainnet when the wallet does not know the chain", async () => {
    let chainId = "0x1";
    const request = vi.fn(({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return Promise.resolve([ACCOUNT]);
      if (method === "eth_chainId") return Promise.resolve(chainId);
      if (method === "wallet_switchEthereumChain") {
        return Promise.reject(Object.assign(new Error("unknown chain"), { code: 4902 }));
      }
      if (method === "wallet_addEthereumChain") {
        chainId = "0x2a5";
        return Promise.resolve(null);
      }
      throw new Error(`Unexpected ${method}`);
    });
    await expect(connectBotPublisher(provider(request))).resolves.toBe(ACCOUNT);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ method: "wallet_addEthereumChain" })
    );
  });

  it("rejects a wallet that remains on the wrong chain", async () => {
    const request = vi.fn(({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return Promise.resolve([ACCOUNT]);
      if (method === "eth_chainId") return Promise.resolve("0x1");
      if (method === "wallet_switchEthereumChain") return Promise.resolve(null);
      throw new Error(`Unexpected ${method}`);
    });
    await expect(connectBotPublisher(provider(request))).rejects.toMatchObject({
      code: "WRONG_NETWORK"
    });
  });

  it("preserves an explicit wallet rejection and never reports publication", async () => {
    const rejected = Object.assign(new Error("rejected"), { code: 4001 });
    const wallet = provider(vi.fn().mockRejectedValue(rejected));
    await expect(connectBotPublisher(wallet)).rejects.toEqual(
      expect.objectContaining<Partial<WalletFlowError>>({
        code: "WALLET_REJECTED",
        message: "The wallet request was rejected. The evidence packet remains unpublished."
      })
    );
  });

  it("rejects an empty or malformed account response", async () => {
    const wallet = provider(vi.fn().mockResolvedValue([]));
    await expect(connectBotPublisher(wallet)).rejects.toMatchObject({
      code: "WALLET_MISSING"
    });
  });

  it("submits only a BOT-bound registry call", async () => {
    const request = vi.fn(({ method }: { method: string }) => {
      if (method === "eth_sendTransaction") return Promise.resolve(TRANSACTION_HASH);
      if (method === "eth_chainId") return Promise.resolve("0x2a5");
      throw new Error(`Unexpected ${method}`);
    });
    await expect(
      submitEvidenceReceipt(provider(request), ACCOUNT, publication())
    ).resolves.toBe(TRANSACTION_HASH);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ method: "eth_sendTransaction" }),
      undefined
    );
  });

  it("rejects a publication envelope bound to another chain before wallet submission", async () => {
    const request = vi.fn();
    await expect(
      submitEvidenceReceipt(provider(request), ACCOUNT, { ...publication(), chainId: 1 })
    ).rejects.toMatchObject({ code: "WRONG_NETWORK" });
    expect(request).not.toHaveBeenCalled();
  });

  it("distinguishes a confirmed receipt from a reverted transaction", async () => {
    await expect(
      waitForEvidenceReceipt(receiptProvider("0x1"), TRANSACTION_HASH)
    ).resolves.toBeUndefined();
    await expect(
      waitForEvidenceReceipt(receiptProvider("0x0"), TRANSACTION_HASH)
    ).rejects.toMatchObject({
      code: "TRANSACTION_FAILED",
      message: "The BOT Chain transaction reverted. The evidence packet remains unpublished."
    });
  });
});

function provider(request: ReturnType<typeof vi.fn>): EIP1193Provider {
  return {
    on() { return undefined; },
    removeListener() { return undefined; },
    request
  } as unknown as EIP1193Provider;
}

function receiptProvider(status: "0x0" | "0x1"): EIP1193Provider {
  return provider(vi.fn(({ method }: { method: string }) => {
    if (method === "eth_getTransactionReceipt") {
      return Promise.resolve({
        blockHash: hash(20),
        blockNumber: "0x64",
        contractAddress: null,
        cumulativeGasUsed: "0x5208",
        effectiveGasPrice: "0x1",
        from: ACCOUNT,
        gasUsed: "0x5208",
        logs: [],
        logsBloom: `0x${"0".repeat(512)}`,
        status,
        to: REGISTRY,
        transactionHash: TRANSACTION_HASH,
        transactionIndex: "0x0",
        type: "0x2"
      });
    }
    if (method === "eth_blockNumber") return Promise.resolve("0x64");
    throw new Error(`Unexpected ${method}`);
  }));
}

function publication(): PublishEnvelopeView {
  return {
    attestorAddress: "0x0000000000000000000000000000000000000002",
    chainId: 677,
    contractAddress: REGISTRY,
    digest: hash(8),
    envelope: {
      cik: "320193",
      expiresAt: "2000086400",
      issuedAt: "2000000000",
      lei: "0x485755504b52304d504f55384647584254333934",
      nonce: hash(3),
      packetHash: hash(1),
      pairKey: hash(2),
      policyPassed: true,
      policyVersion: 1,
      publisher: ACCOUNT,
      schemaVersion: 1
    },
    signature: `0x${"1".repeat(130)}`
  };
}

function hash(seed: number): `0x${string}` {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}
