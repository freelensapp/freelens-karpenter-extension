// What the details of any kind show of a struct of settings, as text: the fields that are set, `field: value`, such
// as the metadata options of an EC2NodeClass or the kubelet settings of a node class, and the selector terms of a
// node class.

/**
 * A value of a field as text: a list joined by commas, a map or a struct as `key=value` pairs of the fields that are
 * set, anything else as it is.
 */
export function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (value !== null && typeof value === "object") {
    return Object.entries(value)
      .filter(([, inner]) => inner !== undefined && inner !== null)
      .map(([key, inner]) => `${key}=${formatValue(inner)}`)
      .join(", ");
  }
  return String(value);
}

/**
 * The fields of a struct or a map that are set, one text each, `field: value`, in the order of the object: the
 * metadata options, the connection tracking, the CPU options, the kubelet settings.
 */
export function fieldTexts(fields: object | undefined): string[] {
  return Object.entries(fields ?? {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}: ${formatValue(value)}`);
}

/**
 * A selector term of a node class, its fields that are set in the order of the term, `field: value`, separated by
 * semicolons: all of them select together. The tags of an EC2NodeClass's term are `key=value` pairs, `*` for any
 * value.
 */
export function formatSelectorTerm(term: object): string {
  return fieldTexts(term).join("; ");
}
