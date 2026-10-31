import { useEffect } from "react";
import { loadAndSubscribe } from "./load";

import type { Renderer } from "@freelensapp/extensions";

type Store = Pick<Renderer.K8sApi.KubeObjectStore<Renderer.K8sApi.KubeObject>, "loadAll" | "subscribe" | "isLoaded"> & {
  api: { apiBase: string };
};

/**
 * Loads the stores a view reads, unless they are loaded already, and subscribes to them while the view is shown.
 * Details open over any page, also one that has not loaded the stores of the objects they relate to.
 *
 * The effect creates its abort controller and its subscriptions itself, so that its cleanup releases only its own:
 * `React.StrictMode` of Freelens dev runs it, cleans it up and runs it again. It runs again when the cluster starts or
 * stops serving one of the stores.
 */
export function useSubscribedStores(stores: (Store | undefined)[]): void {
  const key = stores.map((store) => store?.api.apiBase ?? "").join(",");

  // Keyed on the API bases: the stores are the host's, the same for the same key.
  useEffect(() => {
    const controller = new AbortController();
    const disposers: (() => void)[] = [];

    for (const store of stores) {
      if (!store) continue;
      const subscribed = store.isLoaded
        ? Promise.resolve(store.subscribe())
        : loadAndSubscribe(store, controller.signal);
      void subscribed.then((dispose) => {
        if (!dispose) return;
        if (controller.signal.aborted) dispose();
        else disposers.push(dispose);
      });
    }

    return () => {
      controller.abort();
      disposers.splice(0).forEach((dispose) => dispose());
    };
  }, [key]);
}
