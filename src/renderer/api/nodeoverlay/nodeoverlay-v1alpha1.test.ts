import { describe, expect, it } from "vitest";
import { NodePool } from "../nodepool/nodepool-v1";
import { NodeOverlay } from "./nodeoverlay-v1alpha1";

import type { NodeOverlaySpec } from "./nodeoverlay-v1alpha1-types";

const overlay = (name: string, spec: Partial<NodeOverlaySpec>) =>
  new NodeOverlay({
    apiVersion: "karpenter.sh/v1alpha1",
    kind: "NodeOverlay",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: { requirements: [], ...spec },
  });

const nodePool = (
  name: string,
  requirements: NonNullable<NodePool["spec"]>["template"]["spec"]["requirements"],
  labels?: Record<string, string>,
) =>
  new NodePool({
    apiVersion: "karpenter.sh/v1",
    kind: "NodePool",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: {
      template: {
        metadata: { labels },
        spec: { nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "default" }, requirements },
      },
    },
  });

// general: spot or on-demand, c or m; gpu: on-demand only, a template label, no arm64.
const general = nodePool("general", [
  { key: "karpenter.sh/capacity-type", operator: "In", values: ["spot", "on-demand"] },
  { key: "karpenter.k8s.aws/instance-category", operator: "In", values: ["c", "m"] },
  { key: "karpenter.k8s.aws/instance-generation", operator: "Gt", values: ["5"] },
]);
const gpu = nodePool(
  "gpu",
  [
    { key: "karpenter.sh/capacity-type", operator: "In", values: ["on-demand"] },
    { key: "kubernetes.io/arch", operator: "NotIn", values: ["arm64"] },
    { key: "example.com/no-ssd", operator: "DoesNotExist" },
  ],
  { team: "ml" },
);

type NodeSelectorOperatorOfOverlay = NodeOverlaySpec["requirements"][number]["operator"];

const req = (key: string, operator: NodeSelectorOperatorOfOverlay, values?: string[]) => ({
  key,
  operator,
  values,
});

describe("NodeOverlay (karpenter.sh/v1alpha1)", () => {
  it("has the metadata of its CRD", () => {
    expect(NodeOverlay.kind).toBe("NodeOverlay");
    expect(NodeOverlay.namespaced).toBe(false);
    expect(NodeOverlay.apiBase).toBe("/apis/karpenter.sh/v1alpha1/nodeoverlays");
    expect(NodeOverlay.crd.apiVersions).toEqual(["karpenter.sh/v1alpha1"]);
  });

  it("describes its weight and its changes", () => {
    const o = overlay("o", {
      price: "0.25",
      priceAdjustment: "-10%",
      capacity: { "example.com/fpga": "2" },
      weight: 7,
    });
    expect(NodeOverlay.getWeight(o)).toBe(7);
    expect(NodeOverlay.getWeight(overlay("none", {}))).toBe(0);
    expect(NodeOverlay.describe(o)).toEqual(["price 0.25", "price -10%", "+2 example.com/fpga"]);
    // A quantity written without quotes comes back as a number.
    expect(NodeOverlay.describe(overlay("n", { capacity: { "example.com/fpga": 2 } }))).toEqual([
      "+2 example.com/fpga",
    ]);
  });

  it.each([
    ["no requirement", [], true, true],
    ["the NodePool by name", [req("karpenter.sh/nodepool", "In", ["gpu"])], false, true],
    ["any NodePool but gpu", [req("karpenter.sh/nodepool", "NotIn", ["gpu"])], true, false],
    ["the template label of gpu", [req("team", "In", ["ml"])], true, true],
    ["another value of that label", [req("team", "In", ["web"])], true, false],
    ["the absence of a template label", [req("team", "DoesNotExist")], true, false],
    ["spot capacity", [req("karpenter.sh/capacity-type", "In", ["spot"])], true, false],
    ["capacity other than on-demand", [req("karpenter.sh/capacity-type", "NotIn", ["on-demand"])], true, false],
    ["an instance category the NodePool allows", [req("karpenter.k8s.aws/instance-category", "In", ["m"])], true, true],
    ["an instance category general rules out", [req("karpenter.k8s.aws/instance-category", "In", ["g"])], false, true],
    ["a label the NodePools do not fix", [req("node.kubernetes.io/instance-type", "In", ["m5.large"])], true, true],
    ["arm64, which gpu excludes", [req("kubernetes.io/arch", "In", ["arm64"])], true, false],
    ["amd64, which gpu does not exclude", [req("kubernetes.io/arch", "In", ["amd64"])], true, true],
    ["a label gpu rules out", [req("example.com/no-ssd", "Exists")], true, false],
    ["the absence of that label", [req("example.com/no-ssd", "DoesNotExist")], true, true],
    [
      "generation 7 or more, on generation above 5",
      [req("karpenter.k8s.aws/instance-generation", "Gte", ["7"])],
      true,
      true,
    ],
  ])("for %s: applies to general %s, to gpu %s", (_, requirements, toGeneral, toGpu) => {
    const o = overlay("o", { requirements });
    expect(NodeOverlay.appliesTo(o, general)).toBe(toGeneral);
    expect(NodeOverlay.appliesTo(o, gpu)).toBe(toGpu);
  });

  it("tests a numeric requirement against the values a NodePool fixes", () => {
    const g6 = nodePool("g6", [{ key: "karpenter.k8s.aws/instance-generation", operator: "In", values: ["6"] }]);
    const gen = (operator: "Gt" | "Lt" | "Gte" | "Lte", value: string) =>
      NodeOverlay.appliesTo(
        overlay("o", { requirements: [req("karpenter.k8s.aws/instance-generation", operator, [value])] }),
        g6,
      );
    expect([gen("Gt", "5"), gen("Gt", "6"), gen("Lt", "7"), gen("Lt", "6"), gen("Gte", "6"), gen("Lte", "5")]).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it("tests a requirement against the integers the numeric requirements of a NodePool allow", () => {
    // From 4 to 16 CPUs, with Gte and Lte of karpenter.sh/v1; generation above 5.
    const bounded = nodePool("bounded", [
      { key: "karpenter.k8s.aws/instance-cpu", operator: "Gte", values: ["4"] },
      { key: "karpenter.k8s.aws/instance-cpu", operator: "Lte", values: ["16"] },
      { key: "karpenter.k8s.aws/instance-generation", operator: "Gt", values: ["5"] },
    ]);
    const cpu = (operator: NodeOverlaySpec["requirements"][number]["operator"], values?: string[]) =>
      NodeOverlay.appliesTo(
        overlay("o", { requirements: [req("karpenter.k8s.aws/instance-cpu", operator, values)] }),
        bounded,
      );

    expect(cpu("In", ["2", "8"])).toBe(true);
    expect(cpu("In", ["2", "32"])).toBe(false);
    expect(cpu("In", ["4"])).toBe(true);
    expect(cpu("In", ["16"])).toBe(true);
    expect(cpu("NotIn", ["8"])).toBe(true);
    expect(cpu("Exists")).toBe(true);
    expect(cpu("DoesNotExist")).toBe(false);
    expect(cpu("Gt", ["15"])).toBe(true);
    expect(cpu("Gt", ["16"])).toBe(false);
    expect(cpu("Gte", ["16"])).toBe(true);
    expect(cpu("Lt", ["4"])).toBe(false);
    expect(cpu("Lt", ["5"])).toBe(true);
    expect(cpu("Lte", ["4"])).toBe(true);
    expect(cpu("Lte", ["3"])).toBe(false);
    expect(cpu("Gt", ["many"])).toBe(false);

    const generation = (operator: NodeSelectorOperatorOfOverlay, value: string) =>
      NodeOverlay.appliesTo(
        overlay("o", { requirements: [req("karpenter.k8s.aws/instance-generation", operator, [value])] }),
        bounded,
      );
    expect(generation("Lte", "5")).toBe(false);
    expect(generation("Lte", "6")).toBe(true);
    expect(generation("In", "5")).toBe(false);
    expect(generation("In", "7")).toBe(true);
  });

  it("applies to no NodePool whose numeric requirements allow no integer", () => {
    const none = nodePool("none", [
      { key: "karpenter.k8s.aws/instance-cpu", operator: "Gt", values: ["8"] },
      { key: "karpenter.k8s.aws/instance-cpu", operator: "Lt", values: ["9"] },
    ]);
    expect(
      NodeOverlay.appliesTo(overlay("o", { requirements: [req("karpenter.k8s.aws/instance-cpu", "Exists")] }), none),
    ).toBe(false);
  });

  it("lists the NodeOverlays of a NodePool by weight, then by name", () => {
    const overlays = [
      overlay("b", { weight: 10 }),
      overlay("a", { weight: 10 }),
      overlay("light", {}),
      overlay("heavy", { weight: 100 }),
      overlay("other", { requirements: [req("karpenter.sh/nodepool", "In", ["gpu"])], weight: 1000 }),
    ];
    expect(NodeOverlay.forNodePool(overlays, general).map((o) => o.getName())).toEqual(["heavy", "a", "b", "light"]);
  });
});
