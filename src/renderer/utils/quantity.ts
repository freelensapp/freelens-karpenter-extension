// Quantities of bytes in the units the host's Node details show them, `15.5GiB`: `bytesToUnits(unitsToBytes(value))`
// of @freelensapp/utilities for `memory` and `ephemeral-storage`, with the quantity as written in its tooltip. The
// host's `unitsToBytes` reads only binary suffixes, and takes `1G` for 1 byte; here every suffix of a Kubernetes
// quantity counts.

import type { Quantity } from "../api/types";

const suffixes: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
  m: 1e-3,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
};

const quantityPattern = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(Ki|Mi|Gi|Ti|Pi|Ei|m|k|M|G|T|P|E)?$/;

/** A quantity as a number of its base unit, `1Ki` as 1024; `undefined` when it is not a quantity. */
export function quantityToNumber(quantity: Quantity): number | undefined {
  if (typeof quantity === "number") return quantity;
  const match = quantity.trim().match(quantityPattern);
  if (!match) return undefined;
  const [, number = "", suffix] = match;
  return Number(number) * (suffix ? (suffixes[suffix] ?? 1) : 1);
}

const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];

/** Bytes as `bytesToUnits` of the host writes them, with one decimal; `undefined` for none or less. */
export function bytesToUnits(bytes: number): string | undefined {
  if (!(bytes > 0) || !Number.isFinite(bytes)) return undefined;
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(1)}${units[index]}`;
}

/** The resources whose quantities are bytes, which the host's Node details show in units. */
const byteResources = ["memory", "ephemeral-storage"];

/**
 * A quantity of a resource as the host's Node details show it: bytes of `memory` and `ephemeral-storage` in units,
 * any other as it was written; `undefined` without one.
 */
export function resourceQuantity(name: string, quantity: Quantity | undefined): string | undefined {
  if (quantity === undefined) return undefined;
  const written = String(quantity);
  if (!byteResources.includes(name)) return written;
  const bytes = quantityToNumber(quantity);
  return (bytes !== undefined && bytesToUnits(bytes)) || written;
}
