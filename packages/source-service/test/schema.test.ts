import {
  requireArray,
  requireObject,
  requireString
} from "../src/schema.js";

describe("source schema guards", () => {
  it.each([null, [], "object"])("rejects non-object value %j", (value) => {
    expect(() => requireObject(value, "SEC", "value")).toThrow(
      expect.objectContaining({ code: "SOURCE_SCHEMA_ERROR", source: "SEC" })
    );
  });

  it.each([null, "", "   "])("rejects non-string value %j", (value) => {
    expect(() => requireString(value, "GLEIF", "value")).toThrow(
      expect.objectContaining({ code: "SOURCE_SCHEMA_ERROR", source: "GLEIF" })
    );
  });

  it("rejects a non-array", () => {
    expect(() => requireArray({}, "SEC", "value")).toThrow(
      expect.objectContaining({ code: "SOURCE_SCHEMA_ERROR", source: "SEC" })
    );
  });
});
