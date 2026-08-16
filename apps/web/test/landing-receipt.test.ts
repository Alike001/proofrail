const database = vi.hoisted(() => ({
  close: vi.fn(),
  createConnection: vi.fn(),
  findDraftByPacketHash: vi.fn(),
  findLatestReceipt: vi.fn()
}));

vi.mock("server-only", () => ({}));

vi.mock("@proofrail/db/runtime", () => ({
  createDatabaseConnection: database.createConnection,
  EvidenceRepository: class {
    findDraftByPacketHash = database.findDraftByPacketHash;
  },
  IndexerRepository: class {
    findLatestReceipt = database.findLatestReceipt;
  }
}));

import { loadLandingReceipt } from "../src/lib/landing-receipt";

describe("landing receipt loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://proofrail:test@localhost/proofrail");
    vi.stubEnv("EVIDENCE_REGISTRY_ADDRESS", address(677));
    database.close.mockResolvedValue(undefined);
    database.createConnection.mockReturnValue({ close: database.close, db: {} });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stays truthful before the registry and database are configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    delete process.env.DATABASE_URL;

    await expect(loadLandingReceipt()).resolves.toEqual({
      kind: "unavailable",
      reason: "The first BOT mainnet receipt will appear after registry deployment."
    });
    expect(database.createConnection).not.toHaveBeenCalled();
  });

  it("reports an empty configured registry without inventing a receipt", async () => {
    database.findLatestReceipt.mockResolvedValue(null);

    await expect(loadLandingReceipt()).resolves.toEqual({
      kind: "unavailable",
      reason: "The registry is configured and waiting for its first indexed receipt."
    });
    expect(database.close).toHaveBeenCalledOnce();
  });

  it("fails closed when the configured registry address is malformed", async () => {
    vi.stubEnv("EVIDENCE_REGISTRY_ADDRESS", "not-an-address");

    await expect(loadLandingReceipt()).resolves.toEqual({
      kind: "unavailable",
      reason: "The cached receipt index is temporarily unavailable."
    });
    expect(database.findLatestReceipt).not.toHaveBeenCalled();
    expect(database.close).toHaveBeenCalledOnce();
  });

  it("joins the latest indexed receipt to its immutable evidence packet", async () => {
    const packetHash = hash(1);
    database.findLatestReceipt.mockResolvedValue({
      attestorAddress: address(2),
      cik: "0000320193",
      expiresAt: new Date("2033-05-19T14:32:18.000Z"),
      issuedAt: new Date("2033-05-18T14:32:18.000Z"),
      lei: "HWUPKR0MPOU8FGXBT394",
      packetHash,
      publisherAddress: address(1),
      transactionHash: hash(2)
    });
    database.findDraftByPacketHash.mockResolvedValue({
      packet: { sources: { sec: { legalName: "Apple Inc." } } }
    });

    await expect(loadLandingReceipt()).resolves.toMatchObject({
      entityName: "Apple Inc.",
      kind: "available",
      packetHash,
      policyPassed: true,
      registryAddress: address(677)
    });
    expect(database.findDraftByPacketHash).toHaveBeenCalledWith(packetHash);
    expect(database.findLatestReceipt).toHaveBeenCalledWith(677, address(677));
    expect(database.close).toHaveBeenCalledOnce();
  });

  it("falls back to a neutral label when the immutable packet is absent", async () => {
    database.findLatestReceipt.mockResolvedValue(receipt(hash(4)));
    database.findDraftByPacketHash.mockResolvedValue(null);

    await expect(loadLandingReceipt()).resolves.toMatchObject({
      entityName: "Public company receipt",
      kind: "available"
    });
  });

  it("rejects corrupt indexed hashes and contains database failures", async () => {
    database.findLatestReceipt.mockResolvedValue(receipt("0xbroken"));

    await expect(loadLandingReceipt()).resolves.toEqual({
      kind: "unavailable",
      reason: "The cached receipt index is temporarily unavailable."
    });
    expect(database.close).toHaveBeenCalledOnce();
  });
});

function receipt(packetHash: string) {
  return {
    attestorAddress: address(2),
    cik: "0000320193",
    expiresAt: new Date("2033-05-19T14:32:18.000Z"),
    issuedAt: new Date("2033-05-18T14:32:18.000Z"),
    lei: "HWUPKR0MPOU8FGXBT394",
    packetHash,
    publisherAddress: address(1),
    transactionHash: hash(2)
  };
}

function hash(seed: number): `0x${string}` {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}

function address(seed: number): `0x${string}` {
  return `0x${seed.toString(16).padStart(40, "0")}`;
}
