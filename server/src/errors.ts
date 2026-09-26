export class ImError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}

export function textInput(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
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
