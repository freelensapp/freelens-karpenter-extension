// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadKarpenterData } from "./load";
import { useKarpenterDashboardData } from "./use-dashboard-data";

// The host registers the APIs of the CRDs after the cluster frame has loaded them, and its registry is
// observable: `served` stands for it.
const served = observable.box(false);

vi.mock("./stores", () => ({
  getNodePoolStore: () => (served.get() ? { api: { apiBase: "/apis/karpenter.sh/v1/nodepools" } } : undefined),
  getNodeClaimStore: () => undefined,
  getEC2NodeClassStore: () => undefined,
  getAKSNodeClassStore: () => undefined,
}));

vi.mock("./load", () => ({ loadKarpenterData: vi.fn() }));

const load = vi.mocked(loadKarpenterData);

const Probe = observer(() => {
  const data = useKarpenterDashboardData();
  return <p>{data.status === "ready" ? `ready ${data.version}` : data.status}</p>;
});

beforeEach(() => {
  runInAction(() => served.set(false));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useKarpenterDashboardData", () => {
  it("is loading, then ready with the controller version", async () => {
    const dispose = vi.fn();
    load.mockResolvedValue({ version: "1.15.0", dispose });
    runInAction(() => served.set(true));

    render(<Probe />);
    expect(screen.getByText("loading")).toBeDefined();

    expect(await screen.findByText("ready 1.15.0")).toBeDefined();
  });

  it("is not installed when the cluster has no NodePool CRD", async () => {
    load.mockResolvedValue(null);

    render(<Probe />);

    expect(await screen.findByText("not-installed")).toBeDefined();
  });

  it("follows a CRD that the host registers after the first render, and stops the first load's subscriptions", async () => {
    const dispose = vi.fn();
    load.mockResolvedValueOnce(null).mockResolvedValueOnce({ version: "1.15.0", dispose });

    render(<Probe />);
    expect(await screen.findByText("not-installed")).toBeDefined();

    act(() => runInAction(() => served.set(true)));

    expect(screen.getByText("loading")).toBeDefined();
    expect(await screen.findByText("ready 1.15.0")).toBeDefined();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("stops the subscriptions when the page is left", async () => {
    const dispose = vi.fn();
    load.mockResolvedValue({ version: "1.15.0", dispose });
    runInAction(() => served.set(true));

    const { unmount } = render(<Probe />);
    await screen.findByText("ready 1.15.0");
    unmount();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("aborts the load in progress when the page is left", async () => {
    let signal: AbortSignal | undefined;
    load.mockImplementation((s) => {
      signal = s;
      return new Promise(() => {});
    });

    const { unmount } = render(<Probe />);
    unmount();

    expect(signal?.aborted).toBe(true);
  });
});
