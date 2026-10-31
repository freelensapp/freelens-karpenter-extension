import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extensionRouteId, pageId, pageUrl } from "./routes";

describe("routes", () => {
  it("names the extension as the host does in the URLs of its pages", () => {
    const { name } = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
      name: string;
    };
    // `sanitizeExtensionName` of Freelens's `lens-extension.ts`.
    expect(extensionRouteId).toBe(name.replace("@", "").replace("/", "--"));
  });

  it("keeps the URL of the dashboard", () => {
    expect(pageUrl(pageId.overview)).toBe("/extension/freelensapp--karpenter-extension/dashboard");
  });

  it("gives every page its own id", () => {
    const ids = Object.values(pageId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
