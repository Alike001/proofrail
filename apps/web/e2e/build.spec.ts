import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type {
  BuildEvidenceResponse,
  EnvelopeResponse
} from "../src/lib/build-contract";

const ACCOUNT = "0x0000000000000000000000000000000000000001";
const REGISTRY = "0x0000000000000000000000000000000000000677";
const PACKET_HASH = hash(1);
const PAIR_KEY = hash(2);
const NONCE = hash(3);
const TX_HASH = hash(4);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("builds, reviews, and confirms a publisher-bound BOT receipt", async ({ page }, testInfo) => {
  const browserProblems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      browserProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    browserProblems.push(`pageerror: ${error.message}`);
  });
  await mockBuild(page, passingDraft());
  await mockEnvelope(page);
  await page.route(`**/api/receipts/${PACKET_HASH}`, async (route) => {
    await route.fulfill({ contentType: "application/json", json: { ok: true, receipt: {} } });
  });
  await installWallet(page, "confirm");

  await page.goto("/build");
  await expect(page).toHaveTitle("Build evidence · ProofRail");
  await page.getByRole("button", { name: "Build evidence" }).click();
  await expect(page.getByText("PASS · ELIGIBLE TO PUBLISH")).toBeVisible();
  await expect(page.locator(".evidence-result")).toBeFocused();
  await expect(page.getByRole("heading", { name: "SEC" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "GLEIF" })).toBeVisible();
  await expect(page.getByText("Legal names match")).toBeVisible();

  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: `/tmp/proofrail-build-${testInfo.project.name}.png`
  });

  await page.getByRole("button", { name: "Connect wallet to review" }).click();
  await expect(page.getByRole("heading", { name: "Publish this packet to BOT Chain?" })).toBeVisible();
  await expect(page.locator(".publication-review")).toBeFocused();
  await expect(page.getByText("BOT Chain Mainnet · chain 677")).toBeVisible();
  await expect(page.getByText("0 BOT · gas only")).toBeVisible();

  await page.getByRole("button", { name: "Publish on BOT Chain" }).click();
  await expect(page.getByText("CONFIRMED ON BOT MAINNET")).toBeVisible();
  await expect(page.locator(".confirmed-band")).toBeFocused();
  await expect(page.getByText("Receipt indexed and publicly readable.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open transaction on BOTScan ↗" })).toHaveAttribute(
    "href",
    `https://scan.botchain.ai/tx/${TX_HASH}`
  );

  const methods = await page.evaluate(() =>
    (window as typeof window & { __proofrailWalletMethods: string[] }).__proofrailWalletMethods
  );
  expect(methods).toContain("wallet_switchEthereumChain");
  expect(methods).toContain("eth_sendTransaction");
  expect(browserProblems).toEqual([]);
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("shows a field-linked bad-input error without contacting a wallet", async ({ page }) => {
  await page.route("**/api/evidence/build", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: {
          code: "INVALID_CIK",
          field: "cik",
          message: "CIK must contain exactly ten digits and cannot be all zeros."
        },
        ok: false
      },
      status: 400
    });
  });
  await page.goto("/build");
  await page.getByLabel("SEC CENTRAL INDEX KEY (CIK)").fill("320193");
  await page.getByRole("button", { name: "Build evidence" }).click();
  await expect(page.locator("#build-error")).toContainText("INVALID_CIK");
  await expect(page.getByLabel("SEC CENTRAL INDEX KEY (CIK)")).toHaveAttribute(
    "aria-describedby",
    "build-error"
  );
  await expect(page.getByText("PASS · ELIGIBLE TO PUBLISH")).toHaveCount(0);
});

test("names the failed official source and does not create a passing packet", async ({ page }) => {
  await page.route("**/api/evidence/build", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: { code: "SOURCE_TIMEOUT", message: "SEC timed out.", source: "SEC" },
        ok: false
      },
      status: 503
    });
  });
  await page.goto("/build");
  await page.getByRole("button", { name: "Build evidence" }).click();
  await expect(page.locator("#build-error")).toContainText("SEC · SOURCE_TIMEOUT");
  await expect(page.getByText("Nothing was published.", { exact: false })).toBeVisible();
});

test("keeps the reviewed envelope after a rejected publication", async ({ page }) => {
  await mockBuild(page, passingDraft());
  await mockEnvelope(page);
  await installWallet(page, "reject");
  await page.goto("/build");
  await page.getByRole("button", { name: "Build evidence" }).click();
  await page.getByRole("button", { name: "Connect wallet to review" }).click();
  await page.getByRole("button", { name: "Publish on BOT Chain" }).click();
  await expect(page.locator("#build-error")).toContainText("WALLET_REJECTED");
  await expect(page.getByRole("heading", { name: "Publish this packet to BOT Chain?" })).toBeVisible();
  await expect(page.getByText("CONFIRMED ON BOT MAINNET")).toHaveCount(0);
});

test("blocks publication when the wallet remains on the wrong network", async ({ page }) => {
  await mockBuild(page, passingDraft());
  await mockEnvelope(page);
  await installWallet(page, "stuck-network");
  await page.goto("/build");
  await page.getByRole("button", { name: "Build evidence" }).click();
  await page.getByRole("button", { name: "Connect wallet to review" }).click();
  await expect(page.locator("#build-error")).toContainText("WRONG_NETWORK");
  await expect(page.getByRole("heading", { name: "Publish this packet to BOT Chain?" })).toHaveCount(0);
  const methods = await page.evaluate(() =>
    (window as typeof window & { __proofrailWalletMethods: string[] }).__proofrailWalletMethods
  );
  expect(methods).not.toContain("eth_sendTransaction");
});

async function mockBuild(page: Page, response: BuildEvidenceResponse) {
  await page.route("**/api/evidence/build", async (route) => {
    await route.fulfill({ contentType: "application/json", json: response, status: 201 });
  });
}

async function mockEnvelope(page: Page) {
  const response: EnvelopeResponse = {
    ok: true,
    publication: {
      attestorAddress: "0x0000000000000000000000000000000000000002",
      chainId: 677,
      contractAddress: REGISTRY,
      digest: hash(8),
      envelope: {
        cik: "320193",
        expiresAt: "2000086400",
        issuedAt: "2000000000",
        lei: "0x485755504b52304d504f55384647584254333934",
        nonce: NONCE,
        packetHash: PACKET_HASH,
        pairKey: PAIR_KEY,
        policyPassed: true,
        policyVersion: 1,
        publisher: ACCOUNT,
        schemaVersion: 1
      },
      signature: `0x${"1".repeat(130)}`
    }
  };
  await page.route("**/api/evidence/*/envelope", async (route) => {
    await route.fulfill({ contentType: "application/json", json: response });
  });
}

async function installWallet(page: Page, mode: "confirm" | "reject" | "stuck-network") {
  await page.addInitScript(
    ({ account, blockHash, mode, registry, transactionHash }: {
      account: string;
      blockHash: string;
      mode: "confirm" | "reject" | "stuck-network";
      registry: string;
      transactionHash: string;
    }) => {
      let chainId = "0x1";
      const methods: string[] = [];
      (window as typeof window & { __proofrailWalletMethods: string[] }).__proofrailWalletMethods = methods;
      const mockProvider = {
        on() { return undefined; },
        removeListener() { return undefined; },
        request({ method, params }: { method: string; params?: readonly unknown[] }): Promise<unknown> {
          methods.push(method);
          if (method === "eth_requestAccounts") return Promise.resolve([account]);
          if (method === "eth_chainId") return Promise.resolve(chainId);
          if (method === "wallet_switchEthereumChain") {
            if (mode !== "stuck-network") chainId = "0x2a5";
            return Promise.resolve(null);
          }
          if (method === "eth_sendTransaction") {
            if (mode === "reject") throw Object.assign(new Error("Rejected"), { code: 4001 });
            return Promise.resolve(transactionHash);
          }
          if (method === "eth_getTransactionReceipt") {
            return Promise.resolve({
              blockHash,
              blockNumber: "0x64",
              contractAddress: null,
              cumulativeGasUsed: "0x5208",
              effectiveGasPrice: "0x1",
              from: account,
              gasUsed: "0x5208",
              logs: [],
              logsBloom: `0x${"0".repeat(512)}`,
              status: "0x1",
              to: registry,
              transactionHash,
              transactionIndex: "0x0",
              type: "0x2"
            });
          }
          if (method === "eth_blockNumber") return Promise.resolve("0x64");
          throw new Error(`Unexpected wallet method: ${method} ${JSON.stringify(params)}`);
        }
      };
      window.ethereum = mockProvider as unknown as NonNullable<typeof window.ethereum>;
    },
    { account: ACCOUNT, blockHash: hash(20), mode, registry: REGISTRY, transactionHash: TX_HASH }
  );
}

function passingDraft(): BuildEvidenceResponse {
  const checks = [
    ["SEC_IDENTIFIER_RESOLVED", "0000320193"],
    ["GLEIF_IDENTIFIER_RESOLVED", "HWUPKR0MPOU8FGXBT394"],
    ["LEGAL_NAME_MATCH", "apple inc|apple inc"],
    ["GLEIF_ENTITY_ACTIVE", "ACTIVE"],
    ["SEC_RECENT_FILING", "2033-04-01"],
    ["SEC_SNAPSHOT_FRESH", "10 seconds"],
    ["GLEIF_SNAPSHOT_FRESH", "9 seconds"]
  ] as const;
  return {
    draft: {
      canonicalPacket: "{}",
      draftId: "11111111-1111-4111-8111-111111111111",
      packet: {
        chainId: 677,
        expiresAt: 2_000_086_400,
        identifiers: { cik: "0000320193", lei: "HWUPKR0MPOU8FGXBT394" },
        issuedAt: 2_000_000_000,
        nonce: NONCE,
        policy: {
          checks: checks.map(([code, observed]) => ({ code, observed, status: "PASS" as const })),
          failureReasons: [],
          passed: true,
          recentFilingCutoff: "2031-11-18"
        },
        policyVersion: 1,
        registryAddress: REGISTRY,
        schemaVersion: 1,
        sources: {
          gleif: {
            entityStatus: "ACTIVE",
            lei: "HWUPKR0MPOU8FGXBT394",
            legalName: "Apple Inc.",
            normalizedLegalName: "apple inc",
            resolved: true,
            retrievedAt: 1_999_999_991,
            snapshotHash: hash(6),
            source: "GLEIF",
            sourceUrl: "https://api.gleif.org/api/v1/lei-records/HWUPKR0MPOU8FGXBT394"
          },
          sec: {
            cik: "0000320193",
            latestFilingDate: "2033-04-01",
            latestFilingForm: "10-Q",
            legalName: "Apple Inc.",
            normalizedLegalName: "apple inc",
            resolved: true,
            retrievedAt: 1_999_999_990,
            snapshotHash: hash(5),
            source: "SEC",
            sourceUrl: "https://data.sec.gov/submissions/CIK0000320193.json"
          }
        }
      },
      packetHash: PACKET_HASH,
      pairKey: PAIR_KEY
    },
    ok: true
  };
}

function hash(seed: number): `0x${string}` {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}
