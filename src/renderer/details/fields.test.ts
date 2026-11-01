import { describe, expect, it } from "vitest";
import { fieldTexts, formatSelectorTerm, formatValue } from "./fields";

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

describe("formatSelectorTerm", () => {
  it("writes the fields of a term, which select together, and its tags", () => {
    expect(formatSelectorTerm({ tags: { "karpenter.sh/discovery": "lab" } })).toBe("tags: karpenter.sh/discovery=lab");
    expect(formatSelectorTerm({ id: "subnet-0a1b2c3d4e5f60001" })).toBe("id: subnet-0a1b2c3d4e5f60001");
    expect(formatSelectorTerm({ alias: "al2023@latest" })).toBe("alias: al2023@latest");
    expect(formatSelectorTerm({ name: "lab-*", owner: "self", tags: { team: "platform", env: "*" } })).toBe(
      "name: lab-*; owner: self; tags: team=platform, env=*",
    );
  });

  it("writes an image selector term of a GCENodeClass", () => {
    expect(formatSelectorTerm({ family: "ContainerOptimizedOS", channel: "stable" })).toBe(
      "family: ContainerOptimizedOS; channel: stable",
    );
  });
});
