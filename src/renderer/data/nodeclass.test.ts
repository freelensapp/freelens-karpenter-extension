import { Renderer } from "@freelensapp/extensions";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AKSNodeClass as AKSNodeClassV1alpha2 } from "../api/aksnodeclass/aksnodeclass-v1alpha2";
import { EC2NodeClass } from "../api/ec2nodeclass/ec2nodeclass-v1";
import { GCENodeClass } from "../api/gcenodeclass/gcenodeclass-v1alpha1";
import {
  detectProvider,
  nodeClassPage,
  nodeClassSelfLink,
  openNodeClassDetail,
  servedNodeClassProviders,
} from "./nodeclass";

// A store the host would return for a served API: only what the helpers read.
const served = (apiBase: string, items: unknown[] = []) => ({ items, api: { apiBase } }) as never;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("detectProvider", () => {
  it("reads the provider from the kind or the group of the nodeClassRef", () => {
    expect(detectProvider({ kind: "EC2NodeClass", group: "karpenter.k8s.aws", name: "default" })).toBe("aws");
    expect(detectProvider({ kind: "AKSNodeClass", group: "karpenter.azure.com", name: "default" })).toBe("azure");
    expect(detectProvider({ group: "karpenter.azure.com" })).toBe("azure");
    expect(detectProvider({ group: "karpenter.k8s.aws" })).toBe("aws");
    expect(detectProvider({ kind: "GCENodeClass", group: "karpenter.k8s.gcp", name: "default" })).toBe("gcp");
    expect(detectProvider({ group: "karpenter.k8s.gcp" })).toBe("gcp");
  });

  it("is unknown for another provider when the cluster serves no node class", () => {
    expect(detectProvider({ kind: "KWOKNodeClass", group: "karpenter.kwok.sh", name: "default" })).toBe("unknown");
    expect(detectProvider()).toBe("unknown");
  });

  it("without a nodeClassRef, takes the node class with items, else the only one the cluster serves", () => {
    vi.spyOn(GCENodeClass, "getStore").mockReturnValue(served(GCENodeClass.apiBase));
    expect(detectProvider()).toBe("gcp");

    vi.spyOn(EC2NodeClass, "getStore").mockReturnValue(served(EC2NodeClass.apiBase, [{}]));
    expect(detectProvider()).toBe("aws");
  });
});

describe("servedNodeClassProviders", () => {
  it("lists the providers whose node class API the cluster serves", () => {
    expect(servedNodeClassProviders()).toEqual([]);

    vi.spyOn(GCENodeClass, "getStore").mockReturnValue(served(GCENodeClass.apiBase));
    expect(servedNodeClassProviders()).toEqual(["gcp"]);

    vi.spyOn(EC2NodeClass, "getStore").mockReturnValue(served(EC2NodeClass.apiBase));
    expect(servedNodeClassProviders()).toEqual(["aws", "gcp"]);
  });
});

describe("nodeClassSelfLink", () => {
  it("uses the newest API version when the cluster serves none", () => {
    expect(nodeClassSelfLink("default", "aws")).toBe("/apis/karpenter.k8s.aws/v1/ec2nodeclasses/default");
    expect(nodeClassSelfLink("default", "azure")).toBe("/apis/karpenter.azure.com/v1beta1/aksnodeclasses/default");
    expect(nodeClassSelfLink("default", "gcp")).toBe("/apis/karpenter.k8s.gcp/v1alpha1/gcenodeclasses/default");
    expect(nodeClassSelfLink("default", "unknown")).toBe("");
  });
});

describe("nodeClassPage", () => {
  it("is the page of the node class of each provider, and none for a node class the extension does not model", () => {
    expect(nodeClassPage("aws")).toBe("/extension/freelensapp--karpenter-extension/ec2nodeclasses");
    expect(nodeClassPage("azure")).toBe("/extension/freelensapp--karpenter-extension/aksnodeclasses");
    expect(nodeClassPage("gcp")).toBe("/extension/freelensapp--karpenter-extension/gcenodeclasses");
    expect(nodeClassPage("unknown")).toBeUndefined();
  });
});

describe("openNodeClassDetail", () => {
  it("opens an EC2NodeClass on the EC2 Node Classes page with its details", () => {
    openNodeClassDetail("default", "aws");
    expect(Renderer.Navigation.navigate).toHaveBeenLastCalledWith(
      "/extension/freelensapp--karpenter-extension/ec2nodeclasses?kube-details=%2Fapis%2Fkarpenter.k8s.aws%2Fv1%2Fec2nodeclasses%2Fdefault&kube-selected=%2Fapis%2Fkarpenter.k8s.aws%2Fv1%2Fec2nodeclasses%2Fdefault",
    );
  });

  it("opens an AKSNodeClass on the AKS Node Classes page with its details, in the version the cluster serves", () => {
    openNodeClassDetail("default", "azure");
    expect(Renderer.Navigation.navigate).toHaveBeenLastCalledWith(
      "/extension/freelensapp--karpenter-extension/aksnodeclasses?kube-details=%2Fapis%2Fkarpenter.azure.com%2Fv1beta1%2Faksnodeclasses%2Fdefault&kube-selected=%2Fapis%2Fkarpenter.azure.com%2Fv1beta1%2Faksnodeclasses%2Fdefault",
    );

    vi.spyOn(AKSNodeClassV1alpha2, "getStore").mockReturnValue(served(AKSNodeClassV1alpha2.apiBase));
    openNodeClassDetail("default", "azure");
    expect(Renderer.Navigation.navigate).toHaveBeenLastCalledWith(
      "/extension/freelensapp--karpenter-extension/aksnodeclasses?kube-details=%2Fapis%2Fkarpenter.azure.com%2Fv1alpha2%2Faksnodeclasses%2Fdefault&kube-selected=%2Fapis%2Fkarpenter.azure.com%2Fv1alpha2%2Faksnodeclasses%2Fdefault",
    );
  });

  it("opens a GCENodeClass on the GCE Node Classes page with its details", () => {
    openNodeClassDetail("default", "gcp");
    expect(Renderer.Navigation.navigate).toHaveBeenLastCalledWith(
      "/extension/freelensapp--karpenter-extension/gcenodeclasses?kube-details=%2Fapis%2Fkarpenter.k8s.gcp%2Fv1alpha1%2Fgcenodeclasses%2Fdefault&kube-selected=%2Fapis%2Fkarpenter.k8s.gcp%2Fv1alpha1%2Fgcenodeclasses%2Fdefault",
    );
  });

  it("opens nothing for a node class the extension does not model", () => {
    vi.mocked(Renderer.Navigation.navigate).mockClear();
    openNodeClassDetail("default", "unknown");
    expect(Renderer.Navigation.navigate).not.toHaveBeenCalled();
  });
});
