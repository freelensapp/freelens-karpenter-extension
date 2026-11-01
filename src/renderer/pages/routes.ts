// The cluster pages of the extension, by the ids of their registrations, and their URLs.

/**
 * The extension in the URLs of its pages: its package name with `@` dropped and `/` turned into `--`, as the host's
 * `sanitizedExtensionId` makes it.
 */
export const extensionRouteId = "freelensapp--karpenter-extension";

/** The page ids of `clusterPages`, which are also the ids of their sidebar entries. */
export const pageId = {
  /** The dashboard with its tabs, "Overview" in the sidebar. */
  overview: "dashboard",
  nodePools: "nodepools",
} as const;

export type PageId = (typeof pageId)[keyof typeof pageId];

/** The URL of a page of the extension in the cluster frame. */
export function pageUrl(id: PageId): string {
  return `/extension/${extensionRouteId}/${id}`;
}
