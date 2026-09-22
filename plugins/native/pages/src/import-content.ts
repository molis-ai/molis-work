import type { PagesBody } from "@molis-ai/molis-work-contracts/modules/pages";
import { Parser } from "htmlparser2";
import { marked } from "marked";
import { safePagesLanguage } from "./code-language.js";
import { parsePagesBody } from "./document.js";
import { PagesError } from "./error.js";
import { safePagesHref } from "./link.js";
import { pagesSchema } from "./schema.js";

export type PagesImportFormat = "markdown" | "html" | "text" | "csv";
export interface ConvertedPagesImport {
  title: string;
  body: PagesBody;
  warnings: string[];
}

/** Bound parser work independently of the existing serialized document limit. */
export const MAX_IMPORT_CONTENT_BYTES = 1_000_000;
const MAX_NODES = 30_000;
const MAX_DEPTH = 80;
const SKIPPED = new Set(["script", "style", "head", "title", "meta", "link", "base", "template"]);
const BLOCKS = new Set(["p", "div", "article", "section", "main", "header", "footer", "aside", "address", "figure", "figcaption", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "hr", "table", "details", "summary", "dl", "dt", "dd"]);
const MEDIA = new Set(["img", "iframe", "embed", "object", "video", "audio", "svg", "canvas"]);
const MARK_ORDER = ["strong", "em", "underline", "strike", "code", "link"];
type ImportMark = { type: string; attrs?: Record<string, string> };
type ImportNode = { type: string; attrs?: Record<string, string | number | boolean>; text?: string; content?: ImportNode[]; marks?: ImportMark[] };
type HtmlNode = { tag: string; attrs: Record<string, string>; children: HtmlNode[]; text?: string };

export function convertImportContent(input: { name: string; format: PagesImportFormat; content: string }): ConvertedPagesImport {
  if (typeof input.content !== "string" || !input.content.trim()) throw invalid("文档正文为空，无法导入");
  if (new TextEncoder().encode(input.content).length > MAX_IMPORT_CONTENT_BYTES) throw invalid("单篇文档正文不能超过 1 MB");
  const warnings = new Set<string>();
  let title = fileTitle(input.name);
  let blocks: ImportNode[];
  if (input.format === "text") {
    blocks = input.content.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").split(/\n[\t ]*\n/gu)
      .filter((part) => part.trim()).map((part) => paragraph(lines(part)));
  } else if (input.format === "csv") {
    blocks = [csvTable(input.content, warnings)];
  } else if (input.format === "markdown" || input.format === "html") {
    const html = input.format === "markdown" ? marked.parse(input.content, { async: false, gfm: true }) : input.content;
    const root = parseHtml(html);
    const heading = find(root, (node) => node.tag === "h1" && htmlText(node).trim().length > 0);
    const htmlTitle = find(root, (node) => node.tag === "title" && htmlText(node).trim().length > 0);
    title = (heading ? htmlText(heading) : htmlTitle ? htmlText(htmlTitle) : title).replace(/\s+/gu, " ").trim();
    blocks = new HtmlConverter(warnings).blocks(root.children);
  } else {
    throw invalid("不支持这种文档格式");
  }
  if (!blocks.length || !blocks.some(hasContent)) throw invalid("文档没有可导入的正文");
  if (title.length > 80) warnings.add("页面标题超过 80 字，已缩短；正文中的原标题已保留。");
  const first = blocks[0];
  const firstText = first.content?.map((node) => node.text ?? (node.type === "hard_break" ? " " : "")).join("");
  const firstHasLink = first.content?.some((node) => node.marks?.some((mark) => mark.type === "link"));
  if (title.length <= 80 && first.type === "heading" && first.attrs?.level === 1 && firstText === title && !firstHasLink) {
    blocks = blocks.length > 1 ? blocks.slice(1) : [paragraph([])];
  }
  const body = parsePagesBody({ type: "doc", content: blocks });
  try {
    const document = pagesSchema.nodeFromJSON(body);
    document.check();
    return { title: title.slice(0, 80) || "导入的文档", body: parsePagesBody(document.toJSON()), warnings: [...warnings] };
  } catch (error) {
    if (error instanceof PagesError) throw error;
    throw invalid("文档结构无法转换为可编辑的 Pages 正文");
  }
}

class HtmlConverter {
  constructor(private readonly warnings: Set<string>) {}

  blocks(nodes: HtmlNode[], marks: ImportMark[] = []): ImportNode[] {
    const result: ImportNode[] = [];
    let pending: ImportNode[] = [];
    const flush = () => {
      const inline = trimInline(pending);
      if (inline.length) result.push(paragraph(inline));
      pending = [];
    };
    for (const node of nodes) {
      if (SKIPPED.has(node.tag)) {
        if (node.tag === "script") this.warnings.add("脚本已忽略，导入时不会执行脚本或请求外部资源。");
        continue;
      }
      if (MEDIA.has(node.tag)) {
        pending.push(...this.media(node, marks));
        continue;
      }
      if (!BLOCKS.has(node.tag) && !containsBlock(node)) {
        pending.push(...this.inline(node, marks));
        continue;
      }
      flush();
      const inherited = this.elementMarks(node, marks);
      if (/^h[1-6]$/u.test(node.tag)) {
        const level = Number(node.tag[1]);
        if (level > 3) this.warnings.add("四至六级标题已转换为三级标题。");
        result.push({ type: "heading", attrs: { level: Math.min(level, 3) }, content: trimInline(this.inlines(node.children, inherited)) });
      } else if (node.tag === "ul" || node.tag === "ol") {
        result.push(...this.list(node));
      } else if (node.tag === "pre") {
        const code = node.children.find((child) => child.tag === "code");
        const classLanguage = (code?.attrs.class || node.attrs.class || "").match(/(?:^|\s)(?:language|lang)-([^\s]+)/u)?.[1];
        const originalLanguage = node.attrs["data-language"] || classLanguage || "";
        const language = safePagesLanguage(originalLanguage);
        if (originalLanguage && !language) this.warnings.add("部分代码语言不受编辑器支持，代码已保留为纯文本代码块。");
        const text = htmlText(node).replace(/\n$/u, "");
        result.push({ type: "code_block", attrs: { language }, ...(text ? { content: [{ type: "text", text }] } : {}) });
      } else if (node.tag === "blockquote") {
        const content = this.blocks(node.children, inherited);
        if (content.length) result.push({ type: "blockquote", content });
      } else if (node.tag === "hr") {
        result.push({ type: "horizontal_rule" });
      } else if (node.tag === "table") {
        result.push(...this.table(node));
      } else if (node.tag === "p" || node.tag === "summary" || node.tag === "dt" || node.tag === "dd") {
        const content = this.blocks(node.children, inherited);
        result.push(...(content.length ? content : [paragraph([])]));
      } else {
        if (node.tag === "details") this.warnings.add("折叠内容已展开导入。");
        const content = this.blocks(node.children, inherited);
        if (node.tag === "a") {
          const note = this.unresolvedLink(node.attrs.href?.trim() || "");
          if (note.length) {
            const last = content.at(-1);
            if (last?.type === "paragraph" || last?.type === "heading") last.content = [...(last.content || []), ...note];
            else content.push(paragraph(note));
          }
        }
        result.push(...content);
      }
    }
    flush();
    return result;
  }

  private inlines(nodes: HtmlNode[], marks: ImportMark[] = []): ImportNode[] {
    return nodes.flatMap((node) => this.inline(node, marks));
  }

  private inline(node: HtmlNode, marks: ImportMark[]): ImportNode[] {
    if (node.text !== undefined) {
      const text = node.text.replace(/\s+/gu, " ");
      return text ? [{ type: "text", text, ...(marks.length ? { marks } : {}) }] : [];
    }
    if (SKIPPED.has(node.tag) || isCheckbox(node)) {
      if (node.tag === "script") this.warnings.add("脚本已忽略，导入时不会执行脚本或请求外部资源。");
      return [];
    }
    if (node.tag === "br") return [{ type: "hard_break" }];
    if (MEDIA.has(node.tag)) return this.media(node, marks);
    const nextMarks = this.elementMarks(node, marks);
    const content = this.inlines(node.children, nextMarks);
    if (node.tag === "a") {
      const target = node.attrs.href?.trim();
      content.push(...this.unresolvedLink(target || ""));
      if (target && !content.length && this.safeLink(target)) {
        content.push({ type: "text", text: target, marks: nextMarks });
      }
    }
    return content;
  }

  private unresolvedLink(target: string): ImportNode[] {
    if (!target || this.safeLink(target)) return [];
    if (isRelative(target)) {
      this.warnings.add("文档含相对链接或本地附件路径，原路径已保留；请导入后重新关联。");
      return [{ type: "text", text: `（${displayPath(target)}）` }];
    }
    this.warnings.add("不安全或不支持的链接已移除，链接文字已保留。");
    return [];
  }

  private elementMarks(node: HtmlNode, inherited: ImportMark[]): ImportMark[] {
    let marks = [...inherited];
    const markTags: Record<string, string> = { strong: "strong", b: "strong", em: "em", i: "em", u: "underline", s: "strike", del: "strike", strike: "strike", code: "code" };
    const additions: ImportMark[] = markTags[node.tag] ? [{ type: markTags[node.tag] }] : [];
    const style = node.attrs.style || "";
    if (/(?:^|;)\s*font-weight\s*:\s*(?:bold|[6-9]00)\b/iu.test(style)) additions.push({ type: "strong" });
    if (/(?:^|;)\s*font-style\s*:\s*italic\b/iu.test(style)) additions.push({ type: "em" });
    if (/(?:^|;)\s*text-decoration(?:-line)?\s*:[^;]*\bunderline\b/iu.test(style)) additions.push({ type: "underline" });
    if (/(?:^|;)\s*text-decoration(?:-line)?\s*:[^;]*\bline-through\b/iu.test(style)) additions.push({ type: "strike" });
    if (node.tag === "a") {
      const href = this.safeLink(node.attrs.href || "");
      if (href) additions.push({ type: "link", attrs: { href } });
    }
    for (const mark of additions) marks = [...marks.filter((other) => other.type !== mark.type), mark];
    return marks.sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
  }

  private safeLink(target: string): string {
    // Export-relative targets must never become application routes or guessed domains.
    if (!/^(?:https?:|mailto:)/iu.test(target.trim()) || /[\u0000-\u001f\u007f]/u.test(target)) return "";
    return safePagesHref(target);
  }

  private media(node: HtmlNode, marks: ImportMark[]): ImportNode[] {
    const label = node.tag === "img" ? `图片：${node.attrs.alt || node.attrs.title || "未命名图片"}` : `内嵌内容：${node.attrs.title || node.tag}`;
    const target = node.attrs.src || node.attrs.data || node.children.find((child) => child.tag === "source")?.attrs.src || "";
    const href = this.safeLink(target);
    this.warnings.add("图片、音视频与内嵌内容暂不支持直接显示，已转为原始链接或可见占位；附件文件未保存。");
    if (href) return [{ type: "text", text: `[${label}]`, marks: [...marks.filter((mark) => mark.type !== "link"), { type: "link", attrs: { href } }] }];
    if (target && isRelative(target)) {
      this.warnings.add("文档含相对链接或本地附件路径，原路径已保留；请导入后重新关联。");
      return [{ type: "text", text: `[${label}（${displayPath(target)}，未导入）]` }];
    }
    return [{ type: "text", text: `[${label}，未导入]` }];
  }

  private list(node: HtmlNode): ImportNode[] {
    const results: ImportNode[] = [];
    const items = node.children.filter((child) => child.tag === "li");
    let position = Math.max(1, Number.parseInt(node.attrs.start || "1", 10) || 1);
    for (const item of items) {
      const checkbox = find(item, isCheckbox, new Set(["ul", "ol"]));
      const isTask = !!checkbox || item.attrs["data-pages-task"] !== undefined;
      const type = isTask ? "task_list" : node.tag === "ol" ? "ordered_list" : "bullet_list";
      const content = this.blocks(item.children);
      if (content[0]?.type !== "paragraph") content.unshift(paragraph([]));
      const checked = checkbox
        ? checkbox.attrs.checked !== undefined || /(?:^|\s)checkbox-on(?:\s|$)/u.test(checkbox.attrs.class || "")
        : item.attrs["data-checked"] === "true";
      const listItem: ImportNode = { type: isTask ? "task_item" : "list_item", ...(isTask ? { attrs: { checked } } : {}), content };
      const last = results.at(-1);
      if (last?.type === type) last.content!.push(listItem);
      else results.push({ type, ...(type === "ordered_list" ? { attrs: { order: position } } : {}), content: [listItem] });
      position++;
    }
    return results;
  }

  private table(node: HtmlNode): ImportNode[] {
    const results: ImportNode[] = [];
    const caption = node.children.find((child) => child.tag === "caption");
    if (caption) results.push(...this.blocks(caption.children));
    const rows: HtmlNode[] = [];
    const collectRows = (parent: HtmlNode) => {
      for (const child of parent.children) {
        if (child.tag === "tr") rows.push(child);
        else if (child.tag !== "table") collectRows(child);
      }
    };
    collectRows(node);
    const content: ImportNode[] = rows.map((row) => {
      const cells = row.children.filter((child) => child.tag === "td" || child.tag === "th");
      return { type: "table_row", content: cells.map((cell) => {
        if (Number(cell.attrs.colspan || "1") > 1 || Number(cell.attrs.rowspan || "1") > 1) {
          this.warnings.add("表格的合并单元格已拆为普通单元格，内容已保留，原布局需手动调整。");
        }
        const blocks = this.blocks(cell.children);
        if (blocks.some((block) => block.type !== "paragraph")) this.warnings.add("表格单元格中的列表、标题或嵌套表格已转为段落，文字和链接已保留。");
        return { type: cell.tag === "th" ? "table_header" : "table_cell", content: blocks.length ? blocks.flatMap(flattenParagraphs) : [paragraph([])] };
      }) };
    }).filter((row) => row.content!.length > 0);
    if (content.length) {
      const width = Math.max(...content.map((row) => row.content!.length));
      if (width * content.length > 10_000) throw invalid("表格单元格过多，请拆分后导入");
      for (const row of content) while (row.content!.length < width) row.content!.push({ type: "table_cell", content: [paragraph([])] });
      results.push({ type: "table", content });
    }
    return results;
  }
}

function parseHtml(html: string): HtmlNode {
  const root: HtmlNode = { tag: "", attrs: {}, children: [] };
  const stack = [root];
  let count = 0;
  const append = (node: HtmlNode) => {
    if (++count > MAX_NODES) throw invalid("文档结构过大，请拆成多个文档后导入");
    stack.at(-1)!.children.push(node);
  };
  const parser = new Parser({
    onopentag(tag, attrs) {
      const node = { tag, attrs, children: [] };
      append(node);
      stack.push(node);
      if (stack.length > MAX_DEPTH) throw invalid("文档嵌套过深，请简化后导入");
    },
    ontext(text) { append({ tag: "", attrs: {}, children: [], text }); },
    onclosetag() { if (stack.length > 1) stack.pop(); },
  }, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
  parser.end(html);
  return root;
}

function csvTable(content: string, warnings: Set<string>): ImportNode {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let closed = false;
  let cells = 0;
  const pushCell = () => {
    if (++cells > 10_000) throw invalid("CSV 单元格过多，请拆分后导入");
    row.push(value);
    value = "";
    closed = false;
  };
  const input = content.replace(/^\uFEFF/u, "");
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === ",") pushCell();
    else if (char === "\n" || char === "\r") {
      pushCell();
      rows.push(row);
      row = [];
      if (char === "\r" && input[index + 1] === "\n") index++;
    } else if (char === '"' && value.length === 0 && !closed) quoted = true;
    else if (closed && !/[\t ]/u.test(char)) throw invalid("CSV 引号后的内容无效");
    else if (!closed) value += char;
  }
  if (quoted) throw invalid("CSV 含未闭合的引号");
  if (value || row.length || closed) { pushCell(); rows.push(row); }
  if (!rows.some((entry) => entry.some((cell) => cell.trim()))) throw invalid("CSV 没有可导入的内容");
  const width = Math.max(...rows.map((entry) => entry.length));
  if (width * rows.length > 10_000) throw invalid("CSV 单元格过多，请拆分后导入");
  if (rows.some((entry) => entry.length !== width)) warnings.add("CSV 各行列数不一致，缺少的单元格已补空。");
  return { type: "table", content: rows.map((entry, index) => ({ type: "table_row", content: Array.from({ length: width }, (_, column) => ({
    type: index === 0 ? "table_header" : "table_cell", content: [paragraph(lines(entry[column] || ""))],
  })) })) };
}

function fileTitle(name: string): string {
  let filename = String(name || "").split(/[\\/]/u).at(-1) || "导入的文档";
  try { filename = decodeURIComponent(filename); } catch { /* Preserve malformed percent escapes literally. */ }
  return filename.replace(/\.(?:md|markdown|html?|txt|csv|docx)$/iu, "")
    .replace(/[ _-]+(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/iu, "").trim();
}
function invalid(message: string): PagesError { return new PagesError("pages.invalid", message); }
/** Decode labels only; URL validation and link marks always use the original target. */
function displayPath(target: string): string {
  try { return decodeURIComponent(target); } catch { return target; }
}
function paragraph(content: ImportNode[]): ImportNode { return { type: "paragraph", ...(content.length ? { content } : {}) }; }
function lines(text: string): ImportNode[] {
  return text.split(/\r\n?|\n/u).flatMap((line, index) => [...(index ? [{ type: "hard_break" }] : []), ...(line ? [{ type: "text", text: line }] : [])]);
}
function trimInline(nodes: ImportNode[]): ImportNode[] {
  const result = [...nodes];
  while (result[0]?.type === "text") {
    const first = { ...result[0], text: result[0].text!.trimStart() };
    if (first.text) { result[0] = first; break; }
    result.shift();
  }
  while (result.at(-1)?.type === "text") {
    const last = { ...result.at(-1)!, text: result.at(-1)!.text!.trimEnd() };
    if (last.text) { result[result.length - 1] = last; break; }
    result.pop();
  }
  return result;
}
function isRelative(target: string): boolean { return !!target && !/^[a-z][\w+.-]*:/iu.test(target) && !/[\u0000-\u001f\u007f]/u.test(target); }
function isCheckbox(node: HtmlNode): boolean { return (node.tag === "input" && node.attrs.type?.toLowerCase() === "checkbox") || /(?:^|\s)checkbox-(?:on|off)(?:\s|$)/u.test(node.attrs.class || ""); }
function containsBlock(node: HtmlNode): boolean { return node.children.some((child) => BLOCKS.has(child.tag) || containsBlock(child)); }
function htmlText(node: HtmlNode): string { return node.text ?? node.children.filter((child) => child.tag !== "script" && child.tag !== "style").map((child) => child.tag === "br" ? "\n" : htmlText(child)).join(""); }
function find(node: HtmlNode, predicate: (node: HtmlNode) => boolean, skip = new Set<string>()): HtmlNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    if (skip.has(child.tag)) continue;
    const found = find(child, predicate, skip);
    if (found) return found;
  }
  return undefined;
}
function flattenParagraphs(node: ImportNode): ImportNode[] {
  if (["paragraph", "heading", "code_block"].includes(node.type)) return [paragraph(node.content || [])];
  if (node.type === "horizontal_rule") return [paragraph([{ type: "text", text: "——" }])];
  return node.content?.flatMap(flattenParagraphs) || [];
}
function hasContent(node: ImportNode): boolean { return !!node.text?.trim() || node.type === "horizontal_rule" || !!node.content?.some(hasContent); }
