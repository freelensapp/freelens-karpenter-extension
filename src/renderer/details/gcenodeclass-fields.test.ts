import { describe, expect, it } from "vitest";
import {
  formatAdditionalNetworkInterface,
  formatDisk,
  formatImage,
  formatSubnetRange,
  hugepagesTexts,
} from "./gcenodeclass-fields";

const sourceImage = "projects/gke-node-images/global/images/gke-1336-gke1046000-cos-121-18867-90-38-c-pre";

describe("formatImage", () => {
  it("writes an image with the instances it is for", () => {
    expect(
      formatImage({
        sourceImage,
        requirements: [{ key: "kubernetes.io/arch", operator: "In", values: ["amd64"] }],
      }),
    ).toBe(`${sourceImage}: kubernetes.io/arch In [amd64]`);
    expect(formatImage({ sourceImage, requirements: [] })).toBe(sourceImage);
  });
});

describe("formatDisk", () => {
  it("writes the boot disk of the fixtures of the integration tests", () => {
    expect(formatDisk({ category: "pd-balanced", sizeGiB: 100, boot: true })).toBe("boot disk: 100 GiB, pd-balanced");
  });

  it("writes every field that is set, in the order of the struct", () => {
    expect(
      formatDisk({
        sizeGiB: 500,
        category: "hyperdisk-balanced",
        boot: false,
        secondaryBootImage: "global/images/cache",
        secondaryBootMode: "CONTAINER_IMAGE_CACHE",
        kmsKeyName: "projects/lab/locations/us-central1/keyRings/lab/cryptoKeys/disks",
        kmsKeyServiceAccount: "kms@lab.iam.gserviceaccount.com",
        provisionedIOPS: 3000,
        provisionedThroughput: 140,
      }),
    ).toBe(
      "disk: 500 GiB, hyperdisk-balanced, 3000 IOPS, 140 MiB/s, " +
        "KMS key projects/lab/locations/us-central1/keyRings/lab/cryptoKeys/disks, " +
        "KMS key service account kms@lab.iam.gserviceaccount.com, " +
        "secondary boot image global/images/cache (CONTAINER_IMAGE_CACHE)",
    );
  });

  it("writes a disk with nothing set but its kind", () => {
    expect(formatDisk({})).toBe("disk");
    expect(formatDisk({ boot: true, secondaryBootImage: "global/images/cache" })).toBe(
      "boot disk: secondary boot image global/images/cache",
    );
  });
});

describe("formatAdditionalNetworkInterface", () => {
  it("writes the subnetwork, then the network when it names one", () => {
    const subnetwork = "projects/lab/regions/us-central1/subnetworks/storage";
    expect(formatAdditionalNetworkInterface({ subnetwork })).toBe(subnetwork);
    expect(formatAdditionalNetworkInterface({ subnetwork, network: "storage" })).toBe(
      `${subnetwork} (network storage)`,
    );
  });
});

describe("hugepagesTexts", () => {
  it("writes each size of hugepages as a number of pages", () => {
    expect(hugepagesTexts({ hugepages: { hugepageSize2m: 512, hugepageSize1g: 2 } })).toEqual([
      "512 pages of 2 MiB",
      "2 pages of 1 GiB",
    ]);
    expect(hugepagesTexts({ hugepages: { hugepageSize1g: 4 } })).toEqual(["4 pages of 1 GiB"]);
  });

  it("writes nothing without hugepages", () => {
    expect(hugepagesTexts({ hugepages: {} })).toEqual([]);
    expect(hugepagesTexts({})).toEqual([]);
    expect(hugepagesTexts(undefined)).toEqual([]);
  });
});

describe("formatSubnetRange", () => {
  it("writes a pod range with its free IPs, also none", () => {
    expect(formatSubnetRange({ name: "pods-a", totalFreeIP: 3840 })).toBe("pods-a: 3840 free IPs");
    expect(formatSubnetRange({ name: "pods-b", totalFreeIP: 0 })).toBe("pods-b: 0 free IPs");
  });

  it("writes the name alone while the count is not known", () => {
    expect(formatSubnetRange({ name: "pods-c" })).toBe("pods-c");
  });
});
