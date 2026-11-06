import { Renderer } from "@freelensapp/extensions";
import { computed } from "mobx";
import { useEffect } from "react";
import { parseCpuCores, parseMemGi } from "../utils/kube-helpers";

type Node = Renderer.K8sApi.Node;

/** How often the usage of the nodes is read again, as the host's Nodes page does. */
const refreshMs = 30_000;

let users = 0;
let timer: ReturnType<typeof setInterval> | undefined;

const load = () => Renderer.K8sApi.nodesStore.loadKubeMetrics();

/**
 * Loads the usage of the nodes from the metrics API, then every 30 seconds while a component uses it. Every card
 * shares one poll: each load replaces the host's metrics, and so renders every table that reads them.
 */
export function useNodeMetrics(): void {
  useEffect(() => {
    if (users++ === 0) {
      load();
      timer = setInterval(load, refreshMs);
    }
    return () => {
      if (--users === 0) clearInterval(timer);
    };
  }, []);
}

const usageByName = computed(
  () =>
    new Map(
      Renderer.K8sApi.nodesStore.kubeMetrics.map((metrics) => [
        metrics.getName(),
        { cpu: parseCpuCores(metrics.usage.cpu), memory: parseMemGi(metrics.usage.memory) * 1024 ** 3 },
      ]),
    ),
);

/** The CPU cores and memory bytes the node uses, or `undefined` when the metrics API has nothing for it. */
export function getNodeUsage(node: Node): { cpu: number; memory: number } | undefined {
  return usageByName.get().get(node.getName());
}
