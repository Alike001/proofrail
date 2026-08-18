import { waitForIndexedReceipt } from "../src/lib/indexed-receipt";

const PACKET_HASH = `0x${"1".repeat(64)}`;

describe("receipt indexing wait", () => {
  it("stops when the public receipt becomes readable", async () => {
    let calls = 0;
    const fetcher = vi.fn(() => {
      calls += 1;
      return Promise.resolve(
        new Response(
          calls === 2 ? JSON.stringify({ ok: true, receipt: {} }) : JSON.stringify({ ok: false }),
          { status: calls === 2 ? 200 : 404 }
        )
      );
    });

    await expect(
      waitForIndexedReceipt(PACKET_HASH, {
        attempts: 3,
        fetcher,
        intervalMs: 0,
        sleep: () => Promise.resolve()
      })
    ).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns false after transient API failures and misses", async () => {
    const fetcher = vi.fn(() => {
      throw new Error("database unavailable");
    });

    await expect(
      waitForIndexedReceipt(PACKET_HASH, {
        attempts: 3,
        fetcher,
        intervalMs: 0,
        sleep: () => Promise.resolve()
      })
    ).resolves.toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
