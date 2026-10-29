import { defineErrorCodes, type ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MaterialExtraction, MaterialLimits } from "@molis-ai/molis-work-contracts/services/materials";

/**
 * The text extractor's error codes, every one `material.<reason>`. The kind is the sort of failure; the Host's edges turn it into the status
 * (plugin SDK `actionHttpStatus`), so the extractor keeps no status of its own. A refusal of the person's file or link is `invalid`
 * (before: 400, or 415 and 422, which have no kind), what the file or page holds too much of is `too_large`, a helper that failed or timed
 * out is `upstream`, the speech model that has to be downloaded first is `conflict`, and a native helper that is not built is `unavailable`.
 * The native helpers (Swift) name their refusals in the same words, so what they report is looked up here by reason (`materialFailure`).
 */
export const materialErrors = defineErrorCodes("material", {
  audio_extraction_failed: "invalid",
  cancelled: "cancelled",
  empty: "invalid",
  empty_pdf: "invalid",
  encoding: "invalid",
  extraction_failed: "upstream",
  file_too_large: "too_large",
  http: "invalid",
  image_too_large: "too_large",
  insufficient_content: "invalid",
  invalid_arguments: "invalid",
  invalid_data: "invalid",
  invalid_download_choice: "invalid",
  invalid_document: "invalid",
  invalid_file: "invalid",
  invalid_image: "invalid",
  invalid_limits: "invalid",
  invalid_media: "invalid",
  invalid_pdf: "invalid",
  invalid_result: "upstream",
  locked_pdf: "invalid",
  model_download_failed: "invalid",
  model_required: "conflict",
  native_unavailable: "unavailable",
  output_too_large: "too_large",
  redirect: "invalid",
  timeout: "upstream",
  too_large: "too_large",
  transcription_failed: "invalid",
  unsafe_storage: "internal",
  unsupported: "invalid",
  unsupported_language: "invalid",
  url: "invalid",
});

/** Whether a failure is the extractor's own (read by its code, not its class: another copy of the contracts makes another class). */
export function isMaterialFailure(error: unknown): error is ActionError {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && code.startsWith("material.");
}

/** The refusal a native helper reported under its own word; a word the extractor does not know is a failed extraction. */
export function materialFailure(reason: string, message: string, details?: Readonly<Record<string, unknown>>): ActionError {
  const raise = Object.hasOwn(materialErrors, reason) ? materialErrors[reason as keyof typeof materialErrors] : materialErrors.extraction_failed;
  return raise(message, details);
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

export function decodeMaterialText(bytes: Uint8Array, options: { allowUtf16Bom?: boolean } = {}): string {
  let source: string;
  const encoding = options.allowUtf16Bom && bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
    : options.allowUtf16Bom && bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
  try { source = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw materialErrors.encoding("文本编码无效，请另存为 UTF-8 后导入"); }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(source)) throw materialErrors.encoding("文件包含二进制内容，不能按文字提取");
  return source;
}

export function extractMaterialText(bytes: Uint8Array, extension: string, markdown: boolean, limits: MaterialLimits): MaterialExtraction {
  const source = decodeMaterialText(bytes);
  const html = extension === ".html" || extension === ".htm";
  const parsed = html ? extractMaterialHtml(source, markdown) : { text: source.trim(),
    title: [".md", ".markdown"].includes(extension) ? /^# ([^\r\n]+)/mu.exec(source)?.[1] : undefined };
  const text = boundedMaterialText(parsed.text, limits), truncated = text !== parsed.text;
  const issues = truncated ? ["正文达到提取容量上限"] : [];
  if (html) issues.push("仅提取 HTML 可见文字；未读取图片、样式、脚本或外部资源");
  if (!text) issues.push("未提取到可读文字");
  const extractor = html ? markdown ? "html-markdown" : "html-text" : "utf8-text";
  // Whole characters, not UTF-16 units: unit 500 can fall inside a two-unit character. The first slice bounds what is spread.
  return { text, ...(parsed.title ? { title: [...parsed.title.slice(0, 1000)].slice(0, 500).join("") } : {}), extractor,
    pages: [{ number: 1, text, method: extractor, confidence: null }],
    coverage: { status: !text ? "insufficient" : truncated || html ? "partial" : "sufficient", truncated, processed_pages: 1, total_pages: 1, issues } };
}
