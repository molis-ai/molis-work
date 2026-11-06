/** Matches a non-null object that is not an array. Prototype and own keys are not restricted. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Sort object keys recursively using localeCompare; preserve values and array order.
 * Returns a new value; this does not validate or serialize non-JSON inputs. */
export function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalJsonValue(item)]),
    );
  }
  return value;
}
