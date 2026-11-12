/** Matches a non-null object that is not an array. Prototype and own keys are not restricted. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Parse stored JSON text, or answer `fallback` when the value is not a string or the text is not JSON. Owners read JSON
 * columns here: a broken or missing value must not take the reader down. The result is cast, not validated: pair it with
 * `isRecord` (or a declaration check) where the caller acts on fields. */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Raw UTF-16 code unit order, the same on every host whatever its language. Anything that ends up in a digest, a
 * signature or a stored comparison sorts with this; `localeCompare` is only for what a person reads. */
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Sort object keys recursively by raw UTF-16 code units; preserve values and array order. JavaScript still enumerates
 * integer-shaped keys first in numeric order, so they do not stay in that order; `canonicalJsonText` holds them to it.
 * Returns a new value; this does not validate or serialize non-JSON inputs. */
export function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnits(left, right))
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
