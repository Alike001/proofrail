import {
  EvidenceValidationError,
  normalizeCik,
  normalizeLei
} from "../src/index.js";

describe("identifier validation", () => {
  it("accepts a ten-digit CIK and trims surrounding space", () => {
    expect(normalizeCik(" 0000320193 ")).toBe("0000320193");
  });

  it.each(["320193", "000032019A", "0000000000"])(
    "rejects invalid CIK %s",
    (value) => {
      expect(() => normalizeCik(value)).toThrow(EvidenceValidationError);
    }
  );

  it("normalizes and validates an LEI checksum", () => {
    expect(normalizeLei(" 5493001kjtiigc8y1r12 ")).toBe(
      "5493001KJTIIGC8Y1R12"
    );
  });

  it.each([
    "5493001KJTIIGC8Y1R1",
    "5493AA1KJTIIGC8Y1R12",
    "5493001KJTIIGC8Y1R13"
  ])("rejects invalid LEI %s", (value) => {
    expect(() => normalizeLei(value)).toThrow(EvidenceValidationError);
  });
});
