export class DatabaseInvariantError extends Error {
  constructor(message: string, options: { readonly cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "DatabaseInvariantError";
  }
}
