// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { loadKarpenterData } from "./load";
import type { useKarpenterDashboardData } from "./use-dashboard-data";

// The host registers the APIs of the CRDs after the cluster frame has loaded them, and its registry is
// observable: `served` stands for it.
const served = observable.box(false);
const customMachineTypesServed = observable.box(false);

vi.mock("./stores", () => ({
  getNodePoolStore: () => (served.get() ? { api: { apiBase: "/apis/karpenter.sh/v1/nodepools" } } : undefined),
  getNodeClaimStore: () => undefined,
  getNodeOverlayStore: () => undefined,
  getEC2NodeClassStore: () => undefined,
  getAKSNodeClassStore: () => undefined,
  getGCENodeClassStore: () => undefined,
  getGCECustomMachineTypeStore: () =>
    customMachineTypesServed.get()
      ? { api: { apiBase: "/apis/karpenter.k8s.gcp/v1alpha1/gcecustommachinetypes" } }
      : undefined,
}));

vi.mock("./load", () => ({ loadKarpenterData: vi.fn() }));

// The hook keeps what the last load found for the life of the module, so every test imports it anew.
let load: ReturnType<typeof vi.mocked<typeof loadKarpenterData>>;
let useData: typeof useKarpenterDashboardData;

const Probe = observer(() => {
  const data = useData();
  return <p>{data.status === "ready" ? `ready ${data.version}` : data.status}</p>;
});

beforeEach(async () => {
  vi.resetModules();
  load = vi.mocked((await import("./load")).loadKarpenterData);
  useData = (await import("./use-dashboard-data")).useKarpenterDashboardData;
  runInAction(() => {
    served.set(false);
    customMachineTypesServed.set(false);
  });
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

  it("is ready as soon as the stores are loaded, and gets the version later", async () => {
    let resolve!: (data: { version: string; dispose: () => void }) => void;
    load.mockImplementation((_signal, onStoresLoaded) => {
      onStoresLoaded?.();
      return new Promise((r) => (resolve = r));
    });
    runInAction(() => served.set(true));

    render(<Probe />);
    expect(await screen.findByText("ready")).toBeDefined();

    act(() => resolve({ version: "1.15.0", dispose: vi.fn() }));
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

  it("loads again when the GCECustomMachineType CRD of GCP v0.7.0 appears, and stops the first load's subscriptions", async () => {
    const first = vi.fn();
    load
      .mockResolvedValueOnce({ version: "0.6.1", dispose: first })
      .mockResolvedValueOnce({ version: "0.7.0", dispose: vi.fn() });
    runInAction(() => served.set(true));

    render(<Probe />);
    expect(await screen.findByText("ready 0.6.1")).toBeDefined();

    act(() => runInAction(() => customMachineTypesServed.set(true)));

    expect(await screen.findByText("ready 0.7.0")).toBeDefined();
    expect(load).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("shown again, starts from what the last load found, and loads again in the background", async () => {
    load
      .mockResolvedValueOnce({ version: "1.14.0", dispose: vi.fn() })
      .mockResolvedValueOnce({ version: "1.15.0", dispose: vi.fn() });
    runInAction(() => served.set(true));

    const { unmount } = render(<Probe />);
    await screen.findByText("ready 1.14.0");
    unmount();

    render(<Probe />);
    expect(screen.getByText("ready 1.14.0")).toBeDefined();
    expect(await screen.findByText("ready 1.15.0")).toBeDefined();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("is loading when shown again with a set of stores that the last load did not have", async () => {
    load.mockResolvedValue({ version: "1.15.0", dispose: vi.fn() });
    runInAction(() => served.set(true));

    const { unmount } = render(<Probe />);
    await screen.findByText("ready 1.15.0");
    unmount();

    runInAction(() => customMachineTypesServed.set(true));
    render(<Probe />);
    expect(screen.getByText("loading")).toBeDefined();
    expect(await screen.findByText("ready 1.15.0")).toBeDefined();
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
