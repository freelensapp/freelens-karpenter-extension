import { describe, expect, it } from "vitest";
import { fieldTexts, formatValue } from "./fields";

describe("formatValue", () => {
  it("writes a list joined by commas, a map as key=value pairs, anything else as it is", () => {
    expect(formatValue(58)).toBe("58");
    expect(formatValue(true)).toBe("true");
    expect(formatValue(["a", "b"])).toBe("a, b");
    expect(formatValue({ cpu: "100m", memory: "1Gi" })).toBe("cpu=100m, memory=1Gi");
  });

  it("leaves out the fields of a struct that are not set", () => {
    expect(formatValue({ vtpm: true, secureBoot: undefined })).toBe("vtpm=true");
  });
});

describe("fieldTexts", () => {
  it("is the fields that are set, in their order", () => {
    expect(
      fieldTexts({
        httpEndpoint: "enabled",
        httpProtocolIPv6: undefined,
        httpPutResponseHopLimit: 1,
        httpTokens: "required",
      }),
    ).toEqual(["httpEndpoint: enabled", "httpPutResponseHopLimit: 1", "httpTokens: required"]);
  });

  it("writes the maps of the kubelet settings as key=value pairs", () => {
    expect(fieldTexts({ maxPods: 58, evictionHard: { "memory.available": "5%" } })).toEqual([
      "maxPods: 58",
      "evictionHard: memory.available=5%",
    ]);
  });

  it("is nothing without the struct", () => {
    expect(fieldTexts(undefined)).toEqual([]);
  });
});
