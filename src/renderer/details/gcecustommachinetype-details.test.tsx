// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GCECustomMachineType } from "../api/gcecustommachinetype/gcecustommachinetype-v1alpha1";
import { GCECustomMachineTypeDetails } from "./gcecustommachinetype-details";

const lastTransitionTime = "2026-10-01T08:00:00Z";

// n2-custom-8-24576 of the fixtures of the integration tests.
const resolved = new GCECustomMachineType({
  apiVersion: "karpenter.k8s.gcp/v1alpha1",
  kind: "GCECustomMachineType",
  metadata: { name: "n2-custom-8-24576", uid: "1", resourceVersion: "1", selfLink: "" },
  spec: { machineType: "n2-custom-8-24576", prices: { onDemand: "0.3891", spot: "0.0934" } },
  status: {
    guestCpus: 8,
    memoryMb: 24576,
    zones: ["us-central1-a", "us-central1-b", "us-central1-c"],
    conditions: [{ type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime }],
  },
});

// A shape that no zone of the cluster has, as the provider reports it.
const notFound = new GCECustomMachineType({
  apiVersion: "karpenter.k8s.gcp/v1alpha1",
  kind: "GCECustomMachineType",
  metadata: { name: "e2-custom-4-8192", uid: "2", resourceVersion: "1", selfLink: "" },
  spec: { machineType: "e2-custom-4-8192", prices: { onDemand: "0.12", spot: "0.04" } },
  status: {
    conditions: [
      {
        type: "Ready",
        status: "False",
        reason: "MachineTypeNotFound",
        message: "not available in any cluster zone",
        lastTransitionTime,
      },
    ],
  },
});

afterEach(() => {
  cleanup();
});

describe("GCECustomMachineTypeDetails", () => {
  it("shows the machine type and its hourly prices", () => {
    render(<GCECustomMachineTypeDetails object={resolved} />);

    for (const text of ["n2-custom-8-24576", "0.3891 USD per hour", "0.0934 USD per hour", "On-Demand", "Spot"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.queryByText("Not Ready")).toBeNull();
  });

  it("shows the vCPUs, the memory in units and the zones the provider resolved", () => {
    render(<GCECustomMachineTypeDetails object={resolved} />);

    for (const text of ["Resolved", "8", "24.0GiB", "us-central1-a", "us-central1-b", "us-central1-c"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("shows why it is not ready, and hides what the provider has not resolved", () => {
    render(<GCECustomMachineTypeDetails object={notFound} />);

    expect(screen.getByText("False, MachineTypeNotFound: not available in any cluster zone")).toBeTruthy();
    expect(screen.getByText("0.12 USD per hour")).toBeTruthy();
    for (const name of ["Resolved", "CPUs", "Memory", "Zones"]) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });
});
