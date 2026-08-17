import type { PublicReceiptResponse } from "./receipt-contract";

export interface IndexedReceiptWaitOptions {
  readonly attempts?: number;
  readonly fetcher?: typeof fetch;
  readonly intervalMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export async function waitForIndexedReceipt(
  packetHash: string,
  options: IndexedReceiptWaitOptions = {}
): Promise<boolean> {
  const attempts = options.attempts ?? 12;
  const intervalMs = options.intervalMs ?? 1_000;
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? delay;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetcher(`/api/receipts/${packetHash}`, {
        cache: "no-store"
      });
      if (response.ok) {
        const body = await response.json() as Partial<PublicReceiptResponse>;
        if (body.ok === true) {
          return true;
        }
      }
    } catch {
      // A temporary API or database failure should not turn a confirmed
      // transaction into a false failure. The next attempt can recover.
    }

    if (attempt < attempts - 1) {
      await sleep(intervalMs);
    }
  }

  return false;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
