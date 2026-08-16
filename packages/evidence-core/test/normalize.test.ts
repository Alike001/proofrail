import { normalizeLegalName } from "../src/index.js";

describe("legal-name normalization", () => {
  it.each([
    [" Apple, Inc. ", "apple inc"],
    ["APPLE\tINC", "apple inc"],
    ["AT&T HOLDINGS", "at and t holdings"],
    ["Société Générale", "societe generale"],
    ["東京 株式会社", "東京 株式会社"],
    ["...", ""]
  ])("normalizes %s", (input, expected) => {
    expect(normalizeLegalName(input)).toBe(expected);
  });
});
