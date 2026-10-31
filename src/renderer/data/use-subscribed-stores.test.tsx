// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSubscribedStores } from "./use-subscribed-stores";

const store = (apiBase: string, isLoaded: boolean) => {
  const dispose = vi.fn();
  return {
    api: { apiBase },
    isLoaded,
    loadAll: vi.fn(async () => undefined),
    subscribe: vi.fn(() => dispose),
    dispose,
  };
};

type TestStore = ReturnType<typeof store>;

function Probe({ stores }: { stores: (TestStore | undefined)[] }) {
  useSubscribedStores(stores as Parameters<typeof useSubscribedStores>[0]);
  return null;
}

afterEach(cleanup);

describe("useSubscribedStores", () => {
  it("loads a store that is not loaded, subscribes to every one, and stops when the view goes", async () => {
    const loaded = store("/apis/a", true);
    const notLoaded = store("/apis/b", false);

    const { unmount } = render(<Probe stores={[loaded, undefined, notLoaded]} />);

    await waitFor(() => expect(notLoaded.subscribe).toHaveBeenCalledTimes(1));
    expect(loaded.loadAll).not.toHaveBeenCalled();
    expect(loaded.subscribe).toHaveBeenCalledTimes(1);
    expect(notLoaded.loadAll).toHaveBeenCalledTimes(1);

    unmount();

    expect(loaded.dispose).toHaveBeenCalledTimes(1);
    expect(notLoaded.dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps one subscription under React.StrictMode, which runs the effect twice", async () => {
    const loaded = store("/apis/a", true);

    const { unmount } = render(
      <StrictMode>
        <Probe stores={[loaded]} />
      </StrictMode>,
    );

    await waitFor(() => expect(loaded.subscribe).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(loaded.dispose).toHaveBeenCalledTimes(1));

    unmount();

    expect(loaded.dispose).toHaveBeenCalledTimes(2);
  });
});
