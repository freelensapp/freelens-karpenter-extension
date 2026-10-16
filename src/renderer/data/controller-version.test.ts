import { describe, expect, it } from "vitest";
import {
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
