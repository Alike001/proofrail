import {
  EvidenceValidationError,
  canonicalize,
  hashCanonicalPacket,
  hashSourceSnapshot
} from "../src/index.js";

describe("canonical JSON", () => {
  it("sorts object keys recursively while retaining array order", () => {
    expect(
      canonicalize({ z: 2, a: { y: true, x: [3, null, "ok"] } })
    ).toBe('{"a":{"x":[3,null,"ok"],"y":true},"z":2}');
  });

  it("serializes negative zero as zero and escapes strings", () => {
    expect(canonicalize([-0, "line\nquote\""])).toBe('[0,"line\\nquote\\""]');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects non-finite number %s",
    (value) => {
      expect(() => canonicalize(value)).toThrow(EvidenceValidationError);
    }
  );
});

describe("hashing", () => {
  it("hashes exact source bytes with SHA-256", () => {
    const expected =
      "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(hashSourceSnapshot("abc")).toBe(expected);
    expect(hashSourceSnapshot(new TextEncoder().encode("abc"))).toBe(expected);
  });

  it("hashes canonical packets with Keccak-256", () => {
    const first = hashCanonicalPacket('{"a":1}');
    expect(first).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(hashCanonicalPacket('{"a":1}')).toBe(first);
    expect(hashCanonicalPacket('{"a":2}')).not.toBe(first);
  });
});
