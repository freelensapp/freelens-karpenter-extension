// Minimal stub of `@freelensapp/extensions` for unit tests.
//
// The published package is a shim that reads `Common`, `Main` and `Renderer`
// off `globalThis.FreelensExtensionApi`, which the Freelens host sets before it
// loads an extension. A Vitest process has no host, so importing the real
// package throws. `vitest.config.ts` aliases the import to this file instead.
// The package ships no mocks of its own to use in its place.
//
// Only the surface the tests exercise is stubbed here, and only at runtime: the
// tests are type-checked against the real declaration of the package. Extend it
// as your tests need more of the host API.
import { createElement, Fragment, type ReactNode } from "react";
import { vi } from "vitest";

class LensExtensionKubeObject {
  apiVersion?: string;
  kind?: string;
  metadata?: { name?: string; namespace?: string };
  spec?: unknown;
  status?: unknown;

  constructor(data: Record<string, unknown> = {}) {
    Object.assign(this, data);
  }

  // As the host's, from the metadata.
  getName() {
    return this.metadata?.name ?? "";
  }

  getNs() {
    return this.metadata?.namespace;
  }

  // The host returns the store it registered for one of the class's
  // `crd.apiVersions`, and throws when there is none. Without a host there is
  // never one; a test that needs a store spies on `getStore` of its class.
  static getStore(): never {
    throw new Error(`Store for ${this.name} is not registered. Extension won't work correctly.`);
  }
}

// The drawer components as plain elements: a title, and an item with its name unless it is hidden.
function DrawerTitle({ children }: { children?: ReactNode }) {
  return createElement("h3", null, children);
}

function DrawerItem({ name, hidden, children }: { name: ReactNode; hidden?: boolean; children?: ReactNode }) {
  return hidden
    ? null
    : createElement(Fragment, null, createElement("span", null, name), createElement("span", null, children));
}

// An icon as an empty element.
function Icon() {
  return createElement("i");
}

export const Renderer = {
  Component: {
    DrawerItem,
    DrawerTitle,
    Icon,
  },
  K8sApi: {
    LensExtensionKubeObject,
    KubeApi: class KubeApi {},
    KubeObjectStore: class KubeObjectStore {},
  },
  Navigation: {
    navigate: vi.fn(),
    showDetails: vi.fn(),
  },
};

export const Common = {
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
};
