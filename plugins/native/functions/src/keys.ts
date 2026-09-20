export class FunctionsError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FunctionsError";
    this.code = code;
  }
}

export const FUNCTION_KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
export const OPTION_KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

export function suggestFunctionKey(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (FUNCTION_KEY_PATTERN.test(slug)) return slug;
  const fallback = slug.replace(/[^a-z0-9_]/g, "").slice(0, 61);
  return `fn_${fallback || "choice"}`;
}

export function assertFunctionKey(value: string): string {
  if (!FUNCTION_KEY_PATTERN.test(value)) {
    throw new FunctionsError("functions.invalid", "函数 key 须为小写字母开头、最长 64 位的字母数字下划线");
  }
  return value;
}

export function assertOptionKey(value: string): string {
  if (!OPTION_KEY_PATTERN.test(value)) {
    throw new FunctionsError("functions.invalid", "选项 key 须为小写字母开头、最长 32 位的字母数字下划线");
  }
  return value;
}
