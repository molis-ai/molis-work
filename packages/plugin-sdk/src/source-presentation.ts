import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SourcePresentation, SourcePresentationInput } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";

const invalid = (): never => { throw pluginErrors.declaration_invalid("来源展示只接受有限普通数据，返回范围选项、协议状态和网页地址"); };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[<>\p{Cc}]/u.test(value);

/** Validate once at the platform boundary, without interpreting the integration's cursor. */
export function checkedSourcePresentationInput(value: unknown): SourcePresentationInput {
  if (!record(value) || Object.keys(value).some(key => key !== "cursor")) return invalid();
  const plain = (item: unknown, depth: number): boolean => depth < 24 && (item === null || typeof item === "string" || typeof item === "boolean"
    || typeof item === "number" && Number.isFinite(item) || Array.isArray(item) && item.every(child => plain(child, depth + 1))
    || record(item) && Object.values(item).every(child => plain(child, depth + 1)));
  if (value.cursor === undefined) return {};
  if (!plain(value.cursor, 0) || JSON.stringify(value.cursor).length > 16_384) return invalid();
  return { cursor: structuredClone(value.cursor) };
}

/** Closed output shared by in-process and signed sandbox integrations. */
export function checkedSourcePresentation(value: unknown): SourcePresentation {
  if (!record(value) || Object.keys(value).some(key => !["scope_options", "conditional_request", "home_url"].includes(key))) return invalid();
  const { scope_options: options, conditional_request: conditional, home_url: home } = value;
  if (options !== undefined && (!Array.isArray(options) || options.length > 32 || options.some(option => !record(option)
    || Object.keys(option).some(key => key !== "value" && key !== "label") || !text(option.value, 200) || !text(option.label, 200))
    || new Set(options.map(option => option.value)).size !== options.length)) return invalid();
  if (conditional !== undefined && (typeof conditional !== "string" || !["etag", "last-modified", "unvalidated", "not-fetched"].includes(conditional))) return invalid();
  if (home !== undefined && home !== null) {
    if (!text(home, 2_048)) return invalid();
    let url: URL;
    try { url = new URL(home); } catch { return invalid(); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return invalid();
  }
  return structuredClone(value) as SourcePresentation;
}
