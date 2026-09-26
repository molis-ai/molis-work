export class ImError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}

export function textInput(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\u0000")) {
    throw new ImError("im.invalid_input", `${label}不能为空，且不能超过 ${max} 字`);
  }
  return value.trim();
}

export function clientId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
    throw new ImError("im.invalid_client_id", "请使用有效的消息提交标识");
  }
  return value;
}

export function integerQuery(query: URLSearchParams, name: string, fallback: number | null, max = Number.MAX_SAFE_INTEGER): number | null {
  const values = query.getAll(name);
  if (!values.length) return fallback;
  const raw = values[0]!;
  if (values.length !== 1 || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max) {
    throw new ImError("im.invalid_cursor", "分页参数无效");
  }
  return Number(raw);
}
