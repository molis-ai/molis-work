import type { PagesBody } from "./contract.js";
import { EMPTY_PAGES_BODY } from "./empty.js";
import { pagesErrors } from "./error.js";

export { EMPTY_PAGES_BODY };

/** The most a Pages document's body may be, as its JSON encoding in characters. */
export const MAX_BODY_CHARS = 1_500_000;

function validateHeadingLevels(nodes: readonly unknown[]): void {
  const stack: unknown[] = [...nodes];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || Array.isArray(current)) continue;
    const node = current as { type?: unknown; attrs?: unknown; content?: unknown };
    if (node.type === "heading" && node.attrs !== undefined && node.attrs !== null) {
      if (typeof node.attrs !== "object" || Array.isArray(node.attrs)) {
        throw pagesErrors.invalid("标题级别须为 1 到 3 的整数");
      }
      const level = (node.attrs as { level?: unknown }).level;
      if (level !== undefined && (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 3)) {
        throw pagesErrors.invalid("标题级别须为 1 到 3 的整数");
      }
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) stack.push(child);
    }
  }
}

export function parsePagesBody(value: unknown): PagesBody {
  if (value === undefined || value === null) return { ...EMPTY_PAGES_BODY, content: [...(EMPTY_PAGES_BODY.content ?? [])] };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw pagesErrors.invalid("正文须是文档对象");
  }
  const raw = value as { type?: unknown; content?: unknown };
  if (raw.type !== "doc") throw pagesErrors.invalid("正文须是文档对象");
  const encoded = JSON.stringify(value);
  if (encoded.length > MAX_BODY_CHARS) throw pagesErrors.invalid("正文过长");
  const content = raw.content === undefined
    ? undefined
    : Array.isArray(raw.content)
      ? raw.content
      : (() => { throw pagesErrors.invalid("正文内容须是列表"); })();
  if (content) validateHeadingLevels(content);
  return content === undefined ? { type: "doc" } : { type: "doc", content };
}
