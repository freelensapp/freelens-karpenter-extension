import { describe, expect, it } from "vitest";
import {
  formatAKSCapacityReservation,
  formatCapacityReservationGroup,
  formatIPTag,
  formatLocalDNSOverride,
  formatNodeImage,
  formatOSDiskSize,
  formatRecentlyUsedVersion,
} from "./aksnodeclass-fields";

const image =
  "/CommunityGalleries/AKSAzureLinux-f7c7cda5-1c9a-4bdc-a222-9614c968580b/images/V3gen2/versions/202610.01.0";

describe("formatNodeImage", () => {
  it("writes an image with the instances it is for", () => {
    expect(
      formatNodeImage({
        id: image,
        requirements: [{ key: "kubernetes.io/arch", operator: "In", values: ["amd64"] }],
      }),
    ).toBe(`${image}: kubernetes.io/arch In [amd64]`);
    expect(formatNodeImage({ id: image, requirements: [] })).toBe(image);
  });
});

describe("formatRecentlyUsedVersion", () => {
  it("writes the pair of versions, and when nodes last used it", () => {
    expect(
      formatRecentlyUsedVersion({
        kubernetesVersion: "1.33.1",
        nodeImageVersion: "202609.15.0",
        timeUsed: "2026-10-01T08:00:00Z",
      }),
    ).toBe("Kubernetes 1.33.1, image 202609.15.0, used 2026-10-01T08:00:00Z");
    expect(formatRecentlyUsedVersion({ kubernetesVersion: "1.33.1", nodeImageVersion: "202609.15.0" })).toBe(
      "Kubernetes 1.33.1, image 202609.15.0",
    );
  });
});

describe("the capacity reservation group", () => {
  const groupID = "/subscriptions/0/resourceGroups/lab/providers/Microsoft.Compute/capacityReservationGroups/crg";

  it("writes the group with its region and zones, or regional", () => {
    expect(formatCapacityReservationGroup({ id: groupID, location: "westeurope", zones: ["1", "2"] })).toBe(
      `${groupID} (westeurope, zones 1, 2)`,
    );
    expect(formatCapacityReservationGroup({ id: groupID, location: "westeurope" })).toBe(
      `${groupID} (westeurope, regional)`,
    );
  });

  it("writes a reservation with its VM size, zones, quantity and provisioning state", () => {
    expect(
      formatAKSCapacityReservation({
        id: `${groupID}/capacityReservations/d4`,
        name: "d4",
        vmSize: "Standard_D4s_v5",
        zones: ["1"],
        quantity: 0,
        provisioningState: "Succeeded",
      }),
    ).toBe("d4 Standard_D4s_v5 (zones 1, quantity 0, Succeeded)");
    expect(formatAKSCapacityReservation({ id: "x", name: "d8", vmSize: "Standard_D8s_v5" })).toBe(
      "d8 Standard_D8s_v5 (regional)",
    );
  });
});

describe("formatIPTag", () => {
  it("writes the type and the tag", () => {
    expect(formatIPTag({ ipTagType: "RoutingPreference", tag: "Internet" })).toBe("RoutingPreference=Internet");
  });
});

describe("formatLocalDNSOverride", () => {
  it("writes the zone, where it forwards, and how", () => {
    expect(
      formatLocalDNSOverride({
        zone: ".",
        queryLogging: "Error",
        protocol: "PreferUDP",
        forwardDestination: "VnetDNS",
        forwardPolicy: "Sequential",
        maxConcurrent: 1000,
        cacheDuration: "1h",
        serveStaleDuration: "1h",
        serveStale: "Verify",
      }),
    ).toBe(
      ".: forward to VnetDNS, Sequential, PreferUDP, max 1000 concurrent, cache 1h, serve stale Verify for 1h, log Error",
    );
  });
});

describe("formatOSDiskSize", () => {
  it("writes the size in GB, and nothing without one", () => {
    expect(formatOSDiskSize(128)).toBe("128 GB");
    expect(formatOSDiskSize(undefined)).toBeUndefined();
  });
});
