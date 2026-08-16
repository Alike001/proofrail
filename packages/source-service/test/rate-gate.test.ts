import { afterEach, vi } from "vitest";

import { SerialIntervalGate } from "../src/index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("serial interval gate", () => {
  it("spaces starts and preserves call order", async () => {
    let now = 1_000;
    const waits: number[] = [];
    const starts: number[] = [];
    const gate = new SerialIntervalGate(125, {
      nowMs: () => now,
      sleep: (milliseconds) => {
        waits.push(milliseconds);
        now += milliseconds;
        return Promise.resolve();
      }
    });

    const first = gate.run(() => {
      starts.push(now);
      return Promise.resolve("first");
    });
    const second = gate.run(() => {
      starts.push(now);
      return Promise.resolve("second");
    });

    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(starts).toEqual([1_000, 1_125]);
    expect(waits).toEqual([125]);
  });

  it("continues after a failed request", async () => {
    const gate = new SerialIntervalGate(1, {
      nowMs: () => 10,
      sleep: () => Promise.resolve()
    });
    const first = gate.run(() => Promise.reject(new Error("failed")));
    const second = gate.run(() => Promise.resolve("recovered"));

    await expect(first).rejects.toThrow("failed");
    await expect(second).resolves.toBe("recovered");
  });

  it("rejects an invalid interval", () => {
    expect(() => new SerialIntervalGate(0)).toThrow(RangeError);
    expect(() => new SerialIntervalGate(1.5)).toThrow(RangeError);
  });

  it("uses a real timer when no sleep dependency is supplied", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const gate = new SerialIntervalGate(25);

    await gate.run(() => Promise.resolve("first"));
    const second = gate.run(() => Promise.resolve("second"));
    await vi.advanceTimersByTimeAsync(25);

    await expect(second).resolves.toBe("second");
  });
});
