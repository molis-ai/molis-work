import type { PagesBody } from "./contract.js";
import { EMPTY_PAGES_BODY } from "./empty.js";
import { pagesErrors } from "./error.js";

export { EMPTY_PAGES_BODY };

/** The most a Pages document's body may be, as its JSON encoding in characters. */
export const MAX_BODY_CHARS = 1_500_000;

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
  return content === undefined ? { type: "doc" } : { type: "doc", content };
}
