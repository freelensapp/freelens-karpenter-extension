import { describe, expect, it } from "vitest";
import { EC2NodeClass } from "../../api/ec2nodeclass/ec2nodeclass-v1";
import { ec2NodeClassColumnValues, ec2NodeClassSortValues } from "./ec2nodeclass-columns";

import type { EC2NodeClassSpec, EC2NodeClassStatus } from "../../api/ec2nodeclass/ec2nodeclass-v1-types";

const nodeClass = (name: string, spec: Partial<EC2NodeClassSpec> = {}, status?: EC2NodeClassStatus) =>
  new EC2NodeClass({
    apiVersion: "karpenter.k8s.aws/v1",
    kind: "EC2NodeClass",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: { subnetSelectorTerms: [], securityGroupSelectorTerms: [], amiSelectorTerms: [], ...spec },
    status,
  });

const lastTransitionTime = "2026-10-01T08:00:00Z";

// default and gpu of the fixtures of the integration tests: gpu found no AMI.
const ready = nodeClass(
  "default",
  { role: "KarpenterNodeRole-lab" },
  { conditions: [{ type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime }] },
);
const notReady = nodeClass(
  "gpu",
  { role: "KarpenterNodeRole-lab" },
  {
    conditions: [{ type: "Ready", status: "False", reason: "AMIsNotFound", message: "no AMI", lastTransitionTime }],
  },
);

// An EC2NodeClass with an instance profile instead of a role, not reconciled yet.
const withInstanceProfile = nodeClass("profile", { instanceProfile: "KarpenterNodeInstanceProfile" });

describe("ec2NodeClassColumnValues", () => {
  it("has the value of the jsonPath of each column, as kubectl prints it", () => {
    expect(ec2NodeClassColumnValues(ready)).toEqual({ ready: "True", role: "KarpenterNodeRole-lab" });
    expect(ec2NodeClassColumnValues(notReady)).toEqual({ ready: "False", role: "KarpenterNodeRole-lab" });
  });

  it("has no value where an EC2NodeClass has none: an instance profile is not a role", () => {
    expect(ec2NodeClassColumnValues(withInstanceProfile)).toEqual({ ready: undefined, role: undefined });
  });
});

describe("ec2NodeClassSortValues", () => {
  it("sorts the status of Ready True, False, Unknown, then none", () => {
    expect([ready, notReady, withInstanceProfile].map(ec2NodeClassSortValues.ready)).toEqual([0, 1, 3]);
  });

  it("sorts the role by its name, an EC2NodeClass without one first", () => {
    expect([ready, withInstanceProfile].map(ec2NodeClassSortValues.role)).toEqual(["KarpenterNodeRole-lab", ""]);
  });
});
