import { useMemo } from "react";

interface Versioned {
  getId(): string;
  getResourceVersion(): string;
}

/** The key of a list of objects, which changes when an object is added, removed, reordered or updated. */
export function itemsKey(items: readonly Versioned[]): string {
  return items.map((item) => `${item.getId()}@${item.getResourceVersion()}`).join(",");
}

/**
 * A copy of a store's items that is a new array only when they change, for the dependencies of `useMemo`.
 *
 * The host's stores update their `items` in place, so the array is the same however its objects change, and a
 * memo keyed on it would not be computed again. An `observer` that calls this reads every item, so it also renders
 * again when they change.
 */
export function useItems<T extends Versioned>(items: readonly T[]): T[] {
  const key = itemsKey(items);
  return useMemo(() => [...items], [key]);
}
