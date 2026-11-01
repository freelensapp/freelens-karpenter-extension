import { describe, expect, it } from "vitest";
import {
  formatAMI,
  formatBlockDeviceMapping,
  formatCapacityReservation,
  formatNetworkInterface,
  formatSecurityGroup,
  formatSelectorTerm,
  formatSubnet,
  linesSummary,
} from "./ec2nodeclass-fields";

describe("formatSelectorTerm", () => {
  it("writes the fields of a term, which select together, and its tags", () => {
    expect(formatSelectorTerm({ tags: { "karpenter.sh/discovery": "lab" } })).toBe("tags: karpenter.sh/discovery=lab");
    expect(formatSelectorTerm({ id: "subnet-0a1b2c3d4e5f60001" })).toBe("id: subnet-0a1b2c3d4e5f60001");
    expect(formatSelectorTerm({ alias: "al2023@latest" })).toBe("alias: al2023@latest");
    expect(formatSelectorTerm({ name: "lab-*", owner: "self", tags: { team: "platform", env: "*" } })).toBe(
      "name: lab-*; owner: self; tags: team=platform, env=*",
    );
  });
});

describe("the resolved values", () => {
  it("writes a subnet with its zone and zone id", () => {
    expect(formatSubnet({ id: "subnet-0a1b2c3d4e5f60002", zone: "eu-west-1b", zoneID: "euw1-az2" })).toBe(
      "subnet-0a1b2c3d4e5f60002 (eu-west-1b, euw1-az2)",
    );
    expect(formatSubnet({ id: "subnet-1", zone: "eu-west-1a" })).toBe("subnet-1 (eu-west-1a)");
  });

  it("writes a security group with its name", () => {
    expect(formatSecurityGroup({ id: "sg-0a1b2c3d4e5f60001", name: "lab-node" })).toBe(
      "sg-0a1b2c3d4e5f60001 (lab-node)",
    );
    expect(formatSecurityGroup({ id: "sg-1" })).toBe("sg-1");
  });

  it("writes an AMI with its name, whether it is deprecated, and its requirements", () => {
    expect(
      formatAMI({
        id: "ami-0a1b2c3d4e5f60001",
        name: "amazon-eks-node-al2023-x86_64-standard-1.33-v20261001",
        requirements: [{ key: "kubernetes.io/arch", operator: "In", values: ["amd64"] }],
      }),
    ).toBe(
      "ami-0a1b2c3d4e5f60001 (amazon-eks-node-al2023-x86_64-standard-1.33-v20261001): kubernetes.io/arch In [amd64]",
    );
    expect(formatAMI({ id: "ami-1", deprecated: true, requirements: [] })).toBe("ami-1 (deprecated)");
  });

  it("writes a capacity block with its state and when it ends", () => {
    expect(
      formatCapacityReservation({
        id: "cr-0a1b2c3d4e5f60001",
        instanceType: "p5.48xlarge",
        availabilityZone: "eu-west-1a",
        reservationType: "capacity-block",
        state: "expiring",
        endTime: "2026-11-02T11:30:00Z",
        instanceMatchCriteria: "targeted",
        ownerID: "123456789012",
      }),
    ).toBe(
      "cr-0a1b2c3d4e5f60001 p5.48xlarge in eu-west-1a (capacity-block, expiring, ends 2026-11-02T11:30:00Z, targeted match, owner 123456789012)",
    );
  });

  it("writes an open reservation that can be interrupted", () => {
    expect(
      formatCapacityReservation({
        id: "cr-1",
        instanceType: "m5.large",
        availabilityZone: "eu-west-1b",
        instanceMatchCriteria: "open",
        ownerID: "123456789012",
        interruptible: true,
      }),
    ).toBe("cr-1 m5.large in eu-west-1b (open match, owner 123456789012, interruptible)");
  });
});

describe("formatBlockDeviceMapping", () => {
  it("writes the device and its EBS volume", () => {
    expect(
      formatBlockDeviceMapping({
        deviceName: "/dev/xvda",
        rootVolume: true,
        ebs: {
          volumeSize: "100Gi",
          volumeType: "gp3",
          iops: 3000,
          throughput: 125,
          encrypted: true,
          deleteOnTermination: true,
        },
      }),
    ).toBe("/dev/xvda: 100Gi, gp3, 3000 IOPS, 125 MiB/s, encrypted, deleted on termination, root volume");
  });

  it("writes the rest of a volume, and a mapping without a device name", () => {
    expect(
      formatBlockDeviceMapping({
        ebs: {
          snapshotID: "snap-1",
          kmsKeyID: "arn:aws:kms:eu-west-1:123456789012:key/1",
          volumeInitializationRate: 300,
          encrypted: false,
          deleteOnTermination: false,
        },
      }),
    ).toBe(
      "(no device name): initialized at 300 MiB/s, not encrypted, KMS key arn:aws:kms:eu-west-1:123456789012:key/1, snapshot snap-1, kept on termination",
    );
    expect(formatBlockDeviceMapping({ deviceName: "/dev/xvdb" })).toBe("/dev/xvdb");
  });
});

describe("formatNetworkInterface", () => {
  it("writes the card and the device index, and the type", () => {
    expect(formatNetworkInterface({ networkCardIndex: 0, deviceIndex: 1, interfaceType: "efa-only" })).toBe(
      "card 0, device 1: efa-only",
    );
  });
});

describe("linesSummary", () => {
  it("counts the lines of a text, without the newline at its end", () => {
    expect(linesSummary("#!/bin/bash\necho hello\n")).toBe("2 lines");
    expect(linesSummary("[settings]")).toBe("1 line");
  });
});
