import { FunctionsError } from "@molis-ai/molis-work-contracts/modules/functions";

export { FunctionsError };

export const FUNCTION_KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
export const OPTION_KEY_PATTERN = /^[a-z][a-z0-9_.]{0,63}$/;
export const PINNED_JEV_MODEL = /^jev-\d+\.\d+\.\d+$/;

export function suggestFunctionKey(name: string, primitive: string = "choice"): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (FUNCTION_KEY_PATTERN.test(slug)) return slug;
  const fallback = slug.replace(/[^a-z0-9_]/g, "").slice(0, 61);
  const kind = primitive === "noul" || primitive === "score" ? primitive : "choice";
  return `fn_${fallback || kind}`;
}

export function assertFunctionKey(value: string): string {
  if (!FUNCTION_KEY_PATTERN.test(value)) {
    throw new FunctionsError("functions.invalid", "函数 key 须为小写字母开头、最长 64 位的字母数字下划线");
  }
  return value;
}

export function assertOptionKey(value: string): string {
  if (!OPTION_KEY_PATTERN.test(value)) {
    throw new FunctionsError("functions.invalid", "选项 key 须为小写字母开头、最长 64 位的字母数字下划线或点号");
  }
  return value;
}

export function isPinnedJevModel(value: string): boolean {
  return PINNED_JEV_MODEL.test(value);
}
