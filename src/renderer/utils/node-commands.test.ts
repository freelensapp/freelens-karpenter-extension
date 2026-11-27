import { describe, expect, it } from "vitest";
import { drainCommand } from "./node-commands";

describe("drainCommand", () => {
  it("drains every node with the host's flags", () => {
    expect(drainCommand(["a", "b"], "/bin/kubectl")).toBe(
      "/bin/kubectl drain a b --delete-emptydir-data --ignore-daemonsets --force",
    );
  });
});
