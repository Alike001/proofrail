import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type {
  PublicReceiptResponse,
  PublicReceiptView,
  RecheckResponse,
  ReplayResponse
} from "../src/lib/receipt-contract";

const PACKET_HASH = hash(1);
const REGISTRY = "0x0000000000000000000000000000000000000677" as const;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("opens, replays, and live-rechecks a wallet-free BOT receipt", async ({ page }, testInfo) => {
  const browserProblems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      browserProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    browserProblems.push(`pageerror: ${error.message}`);
  });
  await mockReceipt(page, receipt());
  await page.route(`**/api/receipts/${PACKET_HASH}/replay`, async (route) => {
    const body: ReplayResponse = {
      ok: true,
      replay: {
        deterministic: true,
        packetHash: PACKET_HASH,
        policyChecks: receipt().policyChecks,
        policyPassed: true
      }
    };
    await route.fulfill({ contentType: "application/json", json: body });
  });
  await page.route(`**/api/receipts/${PACKET_HASH}/recheck`, async (route) => {
    const body: RecheckResponse = {
      ok: true,
      recheck: {
        changed: true,
        checkedAt: "2033-05-18T14:35:00.000Z",
        gleif: source("GLEIF", hash(31)),
        policyChecks: receipt().policyChecks,
        policyPassed: true,
        sec: source("SEC", hash(30))
      }
    };
    await route.fulfill({ contentType: "application/json", json: body });
  });

  await page.goto(`/receipt/${PACKET_HASH}`);
  await expect(page).toHaveTitle("Public evidence receipt · ProofRail");
  await expect(page.locator(".receipt-document")).toBeFocused();
  await expect(page.getByText("CURRENT", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Apple Inc." })).toBeVisible();
  await expect(page.getByText("VERIFIED", { exact: true })).toBeVisible();
  await expect(page.getByText(PACKET_HASH, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.ethereum === undefined)).toBe(true);
  await expect(page.getByRole("link", { name: "Canonical packet JSON" })).toHaveAttribute(
    "href",
    `/api/receipts/${PACKET_HASH}/download/packet`
  );

  const replayButton = page.getByRole("button", { name: "Re-run saved packet" });
  await replayButton.focus();
  await expect(replayButton).toBeFocused();
  expect(await replayButton.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await replayButton.click();
  await expect(page.getByText("REPLAY MATCH · SAME PACKET HASH")).toBeVisible();

  await page.getByRole("button", { name: "Run live source recheck" }).click();
  await expect(page.getByText("SOURCE CHANGED", { exact: true })).toBeVisible();
  await expect(page.getByText("SOURCE CHANGED · NEW RECEIPT REQUIRED")).toBeVisible();
  await expect(page.getByText(PACKET_HASH, { exact: true })).toBeVisible();

  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: `/tmp/proofrail-receipt-${testInfo.project.name}.png`
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  expect(browserProblems).toEqual([]);
});

test("preserves the historical receipt when live sources are unavailable", async ({ page }) => {
  await mockReceipt(page, receipt());
  await page.route(`**/api/receipts/${PACKET_HASH}/recheck`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: { code: "SOURCE_TIMEOUT", message: "SEC timed out.", source: "SEC" },
        ok: false
      },
      status: 503
    });
  });
  await page.goto(`/receipt/${PACKET_HASH}`);
  await page.getByRole("button", { name: "Run live source recheck" }).click();
  await expect(page.getByText("LIVE RECHECK UNAVAILABLE · HISTORICAL RECEIPT PRESERVED")).toBeVisible();
  await expect(page.getByText("CURRENT", { exact: true })).toBeVisible();
  await expect(page.getByText(PACKET_HASH, { exact: true })).toBeVisible();
});

test("renders expired, superseded, and invalid states explicitly", async ({ page }) => {
  await mockReceipt(page, { ...receipt(), state: "EXPIRED" });
  await page.goto(`/receipt/${PACKET_HASH}`);
  await expect(page.getByText("EXPIRED", { exact: true })).toBeVisible();

  await mockReceipt(page, { ...receipt(), state: "SUPERSEDED" });
  await page.reload();
  await expect(page.getByText("SUPERSEDED", { exact: true })).toBeVisible();

  await mockReceipt(page, { ...receipt(), state: "INVALID" });
  await page.reload();
  await expect(page.getByText("INVALID", { exact: true })).toBeVisible();
});

test("shows a stable unavailable document for an unknown packet", async ({ page }) => {
  await page.route(`**/api/receipts/${PACKET_HASH}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: { code: "RECEIPT_NOT_FOUND", message: "The indexed receipt was not found." },
        ok: false
      },
      status: 404
    });
  });
  await page.goto(`/receipt/${PACKET_HASH}`);
  await expect(page.getByRole("heading", { name: "This public receipt could not be loaded." })).toBeVisible();
  await expect(page.getByText("RECEIPT UNAVAILABLE · RECEIPT_NOT_FOUND")).toBeVisible();
});

async function mockReceipt(page: Page, value: PublicReceiptView) {
  const body: PublicReceiptResponse = { ok: true, receipt: value };
  await page.route(`**/api/receipts/${PACKET_HASH}`, async (route) => {
    await route.fulfill({ contentType: "application/json", json: body });
  });
}

function receipt(): PublicReceiptView {
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
    attestor: "0x0000000000000000000000000000000000000002",
    blockHash: hash(8),
    blockNumber: "12345678901234567890",
    canonicalPacketDownload: `/api/receipts/${PACKET_HASH}/download/packet`,
    chainId: 677,
    chainVerification: "VERIFIED",
    cik: "0000320193",
    contractAddress: REGISTRY,
    expiresAt: "2033-05-19T14:32:18.000Z",
    gleifSnapshotDownload: `/api/receipts/${PACKET_HASH}/download/gleif`,
    issuedAt: "2033-05-18T14:32:18.000Z",
    lei: "HWUPKR0MPOU8FGXBT394",
    packet: {
      chainId: 677,
      expiresAt: 2_000_086_400,
      identifiers: { cik: "0000320193", lei: "HWUPKR0MPOU8FGXBT394" },
      issuedAt: 2_000_000_000,
      nonce: hash(3),
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
    policyChecks: checks.map(([code, observed]) => ({ code, observed, status: "PASS" as const })),
    policyPassed: true,
    policyVersion: 1,
    publisher: "0x0000000000000000000000000000000000000001",
    replayDeterministic: true,
    secSnapshotDownload: `/api/receipts/${PACKET_HASH}/download/sec`,
    state: "CURRENT",
    transactionHash: hash(7)
  };
}

function source(sourceName: "SEC" | "GLEIF", snapshotHash: `0x${string}`) {
  return {
    legalName: "Apple Inc.",
    retrievedAt: "2033-05-18T14:35:00.000Z",
    snapshotHash,
    source: sourceName,
    sourceUrl: sourceName === "SEC"
      ? "https://data.sec.gov/submissions/CIK0000320193.json"
      : "https://api.gleif.org/api/v1/lei-records/HWUPKR0MPOU8FGXBT394"
  } as const;
}

function hash(seed: number): `0x${string}` {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}
