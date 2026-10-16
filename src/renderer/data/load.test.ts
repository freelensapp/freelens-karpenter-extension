import { describe, expect, it, vi } from "vitest";
import { loadAndSubscribe } from "./load";

const store = (load: () => Promise<unknown> = async () => []) => ({
  loadAll: vi.fn(load),
  subscribe: vi.fn(() => vi.fn()),
});

describe("loadAndSubscribe", () => {
  it("loads the store for the namespaces with the signal, then subscribes", async () => {
    const s = store();
    const signal = new AbortController().signal;
    const dispose = await loadAndSubscribe(s, signal, ["default"]);

    expect(s.loadAll).toHaveBeenCalledWith(expect.objectContaining({ namespaces: ["default"], reqInit: { signal } }));
    expect(s.subscribe).toHaveBeenCalledTimes(1);
    expect(dispose).toBeTypeOf("function");
  });

  it("does not subscribe when the signal was aborted while loading", async () => {
    const controller = new AbortController();
    const s = store(async () => controller.abort());

    expect(await loadAndSubscribe(s, controller.signal)).toBeUndefined();
    expect(s.subscribe).not.toHaveBeenCalled();
  });

  it("does not subscribe when the load fails", async () => {
    const s = store(async () => {
      throw new Error("forbidden");
    });

    expect(await loadAndSubscribe(s, new AbortController().signal)).toBeUndefined();
    expect(s.subscribe).not.toHaveBeenCalled();
  });

  it("does nothing for a store the cluster does not serve", async () => {
    expect(await loadAndSubscribe(undefined, new AbortController().signal)).toBeUndefined();
  });
});
