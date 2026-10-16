import { describe, expect, it, vi } from "vitest";
import {
  controllerLabelSelector,
  fetchControllerVersion,
  findVersionInDeployments,
  parseVersionFromCrd,
  parseVersionFromDeployment,
  parseVersionFromImage,
} from "./controller-version";

import type { Renderer } from "@freelensapp/extensions";

const deployment = (name: string, images: string[], initImages: string[] = []) =>
  ({
    metadata: { name },
    spec: {
      template: {
        spec: {
          containers: images.map((image) => ({ image })),
          initContainers: initImages.map((image) => ({ image })),
        },
      },
    },
  }) as unknown as Renderer.K8sApi.Deployment;

describe("parseVersionFromImage", () => {
  it.each([
    ["public.ecr.aws/karpenter/controller:1.15.0", "1.15.0"],
    ["ghcr.io/aws/karpenter/controller:v0.37.1", "0.37.1"],
    ["public.ecr.aws/karpenter/controller:1.15.0@sha256:0123abcd", "1.15.0"],
    ["mcr.microsoft.com/aks/karpenter/controller:v1.14.5-rc.1", "1.14.5-rc.1"],
    ["registry.local:5000/karpenter/controller:1.2", "1.2"],
  ])("finds the version in %s", (image, version) => {
    expect(parseVersionFromImage(image)).toBe(version);
  });

  it("finds none in a tag without one", () => {
    expect(parseVersionFromImage("karpenter/controller:latest")).toBeNull();
    expect(parseVersionFromImage("karpenter/controller")).toBeNull();
  });
});

describe("parseVersionFromDeployment", () => {
  it("takes the first image with a version, containers before init containers", () => {
    expect(
      parseVersionFromDeployment(deployment("karpenter", ["sidecar:latest", "controller:1.15.0"], ["init:0.1.0"])),
    ).toBe("1.15.0");
    expect(parseVersionFromDeployment(deployment("karpenter", ["sidecar:latest"], ["init:0.1.0"]))).toBe("0.1.0");
    expect(parseVersionFromDeployment(deployment("karpenter", []))).toBeNull();
  });
});

describe("findVersionInDeployments", () => {
  it("looks only at Deployments whose name contains karpenter", () => {
    const deployments = [deployment("coredns", ["coredns:1.11.1"]), deployment("karpenter", ["controller:1.15.0"])];
    expect(findVersionInDeployments(deployments)).toBe("1.15.0");
    expect(findVersionInDeployments([deployment("coredns", ["coredns:1.11.1"])])).toBeNull();
  });
});

describe("parseVersionFromCrd", () => {
  const crd = (annotations: Record<string, string>, labels: Record<string, string> = {}) =>
    ({ metadata: { annotations, labels } }) as unknown as Renderer.K8sApi.CustomResourceDefinition;

  it("reads the annotations, then the labels, without a leading v", () => {
    expect(parseVersionFromCrd(crd({ "karpenter.sh/version": "v1.15.0" }))).toBe("1.15.0");
    expect(parseVersionFromCrd(crd({ "app.kubernetes.io/version": "1.14.1" }))).toBe("1.14.1");
    expect(parseVersionFromCrd(crd({}, { "app.kubernetes.io/version": "1.13.0" }))).toBe("1.13.0");
    expect(parseVersionFromCrd(crd({}))).toBeNull();
  });
});

describe("fetchControllerVersion", () => {
  const helm = deployment("karpenter", ["public.ecr.aws/karpenter/controller:1.15.0"]);
  const renamed = deployment("autoscaler", ["example.com/karpenter-kwok:v1.14.2"]);

  it("finds the Deployment by its label in any namespace, whatever its name (C6)", async () => {
    const list = vi.fn(async (namespace?: string, labelSelector?: string) =>
      namespace === undefined && labelSelector === controllerLabelSelector ? [renamed] : [],
    );
    await expect(fetchControllerVersion(list)).resolves.toBe("1.14.2");
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("looks in karpenter and karpenter-system by name when the label finds none or cannot be listed", async () => {
    const byNamespace = { karpenter: [], "karpenter-system": [helm] } as Record<string, Renderer.K8sApi.Deployment[]>;
    const none = vi.fn(async (namespace?: string) => (namespace ? (byNamespace[namespace] ?? []) : []));
    await expect(fetchControllerVersion(none)).resolves.toBe("1.15.0");
    expect(none.mock.calls.map(([namespace]) => namespace)).toEqual([undefined, "karpenter", "karpenter-system"]);

    const forbidden = vi.fn(async (namespace?: string) => {
      if (!namespace || namespace === "karpenter") throw new Error("403");
      return byNamespace[namespace] ?? [];
    });
    await expect(fetchControllerVersion(forbidden)).resolves.toBe("1.15.0");
  });

  it("is null when no Deployment has a version", async () => {
    await expect(fetchControllerVersion(async () => null)).resolves.toBeNull();
  });
});
