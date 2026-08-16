export interface RequestGate {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export class SerialIntervalGate implements RequestGate {
  readonly #minimumIntervalMs: number;
  readonly #nowMs: () => number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  #nextStartMs = 0;
  #tail: Promise<void> = Promise.resolve();

  constructor(
    minimumIntervalMs: number,
    dependencies: {
      readonly nowMs?: () => number;
      readonly sleep?: (milliseconds: number) => Promise<void>;
    } = {}
  ) {
    if (!Number.isInteger(minimumIntervalMs) || minimumIntervalMs < 1) {
      throw new RangeError("The request interval must be a positive integer.");
    }
    this.#minimumIntervalMs = minimumIntervalMs;
    this.#nowMs = dependencies.nowMs ?? Date.now;
    this.#sleep = dependencies.sleep ?? defaultSleep;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(async () => {
      const waitMs = Math.max(0, this.#nextStartMs - this.#nowMs());
      if (waitMs > 0) {
        await this.#sleep(waitMs);
      }
      this.#nextStartMs = this.#nowMs() + this.#minimumIntervalMs;
      return task();
    });
    this.#tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
