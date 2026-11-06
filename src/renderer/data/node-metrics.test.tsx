// @vitest-environment jsdom

import { Renderer } from "@freelensapp/extensions";
import { cleanup, render } from "@testing-library/react";
import { observable } from "mobx";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getNodeUsage, useNodeMetrics } from "./node-metrics";

const nodesStore = {
  kubeMetrics: observable.array([{ getName: () => "a", usage: { cpu: "500000000n", memory: "1048576Ki" } }]),
  loadKubeMetrics: vi.fn(async () => undefined),
};
Object.assign(Renderer.K8sApi, { nodesStore });

const User = () => {
  useNodeMetrics();
  return null;
};

afterEach(cleanup);

describe("node metrics", () => {
  it("polls once for every component that uses them", () => {
    render(
      <>
        <User />
        <User />
        <User />
      </>,
    );

    expect(nodesStore.loadKubeMetrics).toHaveBeenCalledTimes(1);
  });

  it("gives the usage of a node in cores and bytes, and nothing for a node without metrics", () => {
    expect(getNodeUsage({ getName: () => "a" } as Renderer.K8sApi.Node)).toEqual({ cpu: 0.5, memory: 1024 ** 3 });
    expect(getNodeUsage({ getName: () => "b" } as Renderer.K8sApi.Node)).toBeUndefined();
  });
});
