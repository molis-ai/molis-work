import type { MaterialExtraction, MaterialLimits } from "@molis-ai/molis-work-contracts/services/materials";

export class MaterialExtractionError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400,
    public readonly details?: { approximate_bytes?: number; variant?: string }) { super(message); this.name = "MaterialExtractionError"; }
}

/** Truncate on a code point boundary under both independent output budgets. */
export function boundedMaterialText(text: string, limits: Pick<MaterialLimits, "maxCharacters" | "maxTextBytes">): string {
  let end = Math.min(text.length, limits.maxCharacters);
  if (end < text.length && end > 0 && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) end--;
  let result = text.slice(0, end);
  if (Buffer.byteLength(result) > limits.maxTextBytes) {
    const bytes = Buffer.from(result), decoder = new TextDecoder("utf-8", { fatal: true });
    let count = Math.min(bytes.length, limits.maxTextBytes);
    while (count > 0 && (bytes[count]! & 0xC0) === 0x80) count--;
    result = decoder.decode(bytes.subarray(0, count));
  }
  return result;
}

function entities(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#(?:x[\da-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (whole, token: string) => {
    if (!token.startsWith("#")) return named[token.toLowerCase()] ?? whole;
    const code = token[1]?.toLowerCase() === "x" ? parseInt(token.slice(2), 16) : parseInt(token.slice(1), 10);
    return code > 0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF) ? String.fromCodePoint(code) : whole;
  });
}
const stripTags = (value: string) => value.replace(/<[^>]*>/g, " ");
/** Local content only. Unclosed active blocks consume the remainder, never their script text. */
export function extractMaterialHtml(source: string, markdown: boolean): { text: string; title?: string } {
  const clean = source.replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|object|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, " ");
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(clean);
  const title = titleMatch ? entities(stripTags(titleMatch[1]!)).replace(/\s+/g, " ").trim() : undefined;
  let text = clean;
  if (markdown) {
    text = text.replace(/<(head|nav|footer)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "\n");
    text = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(text)?.[1]
      ?? /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(text)?.[1] ?? text;
    text = text.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, body: string) => `\n\n\`\`\`\n${stripTags(body)}\n\`\`\`\n\n`)
      .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, body: string) => `\n${"#".repeat(Number(level))} ${stripTags(body)}\n`)
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<\/?p\b[^>]*>/gi, "\n\n");
  }
  text = text.replace(/<(br|hr)\b[^>]*>/gi, "\n").replace(/<\/(p|div|section|article|li|h[1-6]|tr|pre|blockquote)\s*>/gi, "\n");
  return { text: entities(stripTags(text)).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim(), ...(title ? { title } : {}) };
}

export function extractMaterialText(bytes: Uint8Array, extension: string, markdown: boolean, limits: MaterialLimits): MaterialExtraction {
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new MaterialExtractionError("encoding", "文字文件需使用 UTF-8 编码"); }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(source)) throw new MaterialExtractionError("encoding", "文件包含二进制内容，不能按文字提取");
  const html = extension === ".html" || extension === ".htm";
  const parsed = html ? extractMaterialHtml(source, markdown) : { text: source.trim(),
    title: [".md", ".markdown"].includes(extension) ? /^# ([^\r\n]+)/mu.exec(source)?.[1] : undefined };
  const text = boundedMaterialText(parsed.text, limits), truncated = text !== parsed.text;
  const issues = truncated ? ["正文达到提取容量上限"] : [];
  if (html) issues.push("仅提取 HTML 可见文字；未读取图片、样式、脚本或外部资源");
  if (!text) issues.push("未提取到可读文字");
  const extractor = html ? markdown ? "html-markdown" : "html-text" : "utf8-text";
  return { text, ...(parsed.title ? { title: parsed.title.slice(0, 500) } : {}), extractor,
    pages: [{ number: 1, text, method: extractor, confidence: null }],
    coverage: { status: !text ? "insufficient" : truncated || html ? "partial" : "sufficient", truncated, processed_pages: 1, total_pages: 1, issues } };
}
