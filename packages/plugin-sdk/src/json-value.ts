/** Matches a non-null object that is not an array. Prototype and own keys are not restricted. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Sort object keys recursively by raw UTF-16 code units; preserve values and array order.
 * Returns a new value; this does not validate or serialize non-JSON inputs. */
export function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, canonicalJsonValue(item)]),
    );
  }
  return value;
}

/** Stable JSON text with raw UTF-16 key order, including integer-shaped keys.
 * The default preserves JSON.stringify(canonicalJsonValue(value)) scalar and
 * toJSON behavior. Existing byte protocols can retain their own null or literal
 * treatment of unsupported scalars without invoking object toJSON methods. */
export function canonicalJsonText(value: unknown, unsupported: "null"): string;
export function canonicalJsonText(value: unknown, unsupported?: "omit" | "null" | "literal"): string | undefined;
export function canonicalJsonText(value: unknown, unsupported: "omit" | "null" | "literal" = "omit"): string | undefined {
  const serialize = (item: unknown): string | undefined => {
    if (Array.isArray(item)) {
      return `[${item.map(serialize).join(",")}]`;
    }
    if (item !== null && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const fields = Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${serialize(record[key])}`);
      return `{${fields.join(",")}}`;
    }
    return JSON.stringify(item) ?? (unsupported === "null" ? "null" : undefined);
  };
  if (unsupported !== "omit") return serialize(value);
  const json = JSON.stringify(canonicalJsonValue(value));
  return json === undefined ? undefined : serialize(JSON.parse(json));
}
