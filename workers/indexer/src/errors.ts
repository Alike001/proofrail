export class IndexerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndexerConfigurationError";
  }
}

export class IndexerDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndexerDataError";
  }
}
