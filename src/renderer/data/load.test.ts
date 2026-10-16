import { describe, expect, it, vi } from "vitest";
import { loadAndSubscribe } from "./load";

type LoadAllParams = { onLoadFailure?: (error: unknown) => void };

// As the host's store: a failure is reported through onLoadFailure, and loadAll resolves.
const store = (outcomes: ("ok" | "fail" | "throw")[] = ["ok"]) => {
  let call = 0;
  return {
    loadAll: vi.fn(async ({ onLoadFailure }: LoadAllParams) => {
      const outcome = outcomes[Math.min(call++, outcomes.length - 1)];
      if (outcome === "fail") onLoadFailure?.(new Error("429"));
      if (outcome === "throw") throw new Error("network");
      return [];
    }),
    subscribe: vi.fn(() => vi.fn()),
  };
};

const fast = { delayMs: 1 };

describe("loadAndSubscribe", () => {
  it("loads the store for the namespaces with the signal, then subscribes", async () => {
    const s = store();
    const signal = new AbortController().signal;
    const dispose = await loadAndSubscribe(s, signal, ["default"]);

    expect(s.loadAll).toHaveBeenCalledWith(expect.objectContaining({ namespaces: ["default"], reqInit: { signal } }));
    expect(s.subscribe).toHaveBeenCalledTimes(1);
    expect(dispose).toBeTypeOf("function");
  });

  it("tries a failed load again, then subscribes", async () => {
    const s = store(["fail", "throw", "ok"]);

    expect(await loadAndSubscribe(s, new AbortController().signal, undefined, fast)).toBeTypeOf("function");
    expect(s.loadAll).toHaveBeenCalledTimes(3);
    expect(s.subscribe).toHaveBeenCalledTimes(1);
  });

  it("subscribes anyway after the last try", async () => {
    const s = store(["fail"]);

    await loadAndSubscribe(s, new AbortController().signal, undefined, { attempts: 3, delayMs: 1 });
    expect(s.loadAll).toHaveBeenCalledTimes(3);
    expect(s.subscribe).toHaveBeenCalledTimes(1);
  });

  it("stops trying when the signal is aborted during the wait", async () => {
    const controller = new AbortController();
    const s = store(["fail"]);
    const loading = loadAndSubscribe(s, controller.signal, undefined, { delayMs: 60_000 });
    await vi.waitFor(() => expect(s.loadAll).toHaveBeenCalledTimes(1));
    controller.abort();

    expect(await loading).toBeUndefined();
    expect(s.subscribe).not.toHaveBeenCalled();
  });

  it("does not subscribe when the signal was aborted while loading", async () => {
    const controller = new AbortController();
    const s = store();
    s.loadAll.mockImplementationOnce(async () => {
      controller.abort();
      return [];
    });

    expect(await loadAndSubscribe(s, controller.signal)).toBeUndefined();
    expect(s.subscribe).not.toHaveBeenCalled();
  });

  it("does nothing for a store the cluster does not serve", async () => {
    expect(await loadAndSubscribe(undefined, new AbortController().signal)).toBeUndefined();
  });
});
