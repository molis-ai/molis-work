import { ImError } from "../errors.js";
export { clientId, ImError, textInput } from "../errors.js";

export function integerQuery(query: URLSearchParams, name: string, fallback: number | null, max = Number.MAX_SAFE_INTEGER): number | null {
  const values = query.getAll(name);
  if (!values.length) return fallback;
  const raw = values[0]!;
  if (values.length !== 1 || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max) {
    throw new ImError("im.invalid_cursor", "分页参数无效");
  }
  return Number(raw);
}
