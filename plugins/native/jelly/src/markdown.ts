import { randomUUID } from "node:crypto";
import type { JellyBlock, JellyBlockKind, JellyNote } from "@molis-ai/molis-work-contracts/modules/jelly";

function parseInline(source: string, inherited: ("bold" | "italic" | "code")[] = [], link?: string): NonNullable<JellyBlock["inline_spans"]> {
  const spans: NonNullable<JellyBlock["inline_spans"]> = [];
  const add = (text: string, marks = inherited, url = link) => { if (!text) return; const previous = spans.at(-1); if (previous && JSON.stringify(previous.marks) === JSON.stringify(marks) && previous.link_url === url) previous.text += text; else spans.push({ text, marks: [...new Set(marks)], ...(url ? { link_url: url } : {}) }); };
  for (let i = 0; i < source.length;) {
    if (source[i] === "\\" && i + 1 < source.length && /[\\`*_[\]()]/.test(source[i + 1]!)) { add(source[i + 1]!); i += 2; continue; }
    if (source[i] === "[") {
      const match = /^\[([^\]]+)\]\(([^\s)]+)\)/.exec(source.slice(i));
      if (match) { for (const span of parseInline(match[1]!, inherited, match[2])) add(span.text, span.marks, span.link_url); i += match[0].length; continue; }
    }
    const marker = source.startsWith("***", i) ? "***" : source.startsWith("**", i) ? "**" : source[i] === "*" ? "*" : source[i] === "`" ? "`" : null;
    if (marker) {
      const end = source.indexOf(marker, i + marker.length);
      if (end > i + marker.length) {
        const inner = source.slice(i + marker.length, end), marks = [...inherited, ...(marker === "***" ? ["bold", "italic"] as const : marker === "**" ? ["bold"] as const : marker === "*" ? ["italic"] as const : ["code"] as const)];
        if (marker === "`") add(inner, marks); else for (const span of parseInline(inner, marks, link)) add(span.text, span.marks, span.link_url);
        i = end + marker.length; continue;
      }
    }
    add(source[i]!); i++;
  }
  return spans;
}

/** Stable IDs survive exact-line moves and in-place edits. Explicit blocks are preferred for ambiguous duplicate text. */
export function jellyMarkdownToBlocks(markdown: string, previous: readonly JellyBlock[] = [], now = new Date().toISOString()): JellyBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const parsed: JellyBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let kind: JellyBlockKind = "paragraph", text = line, indent = 0, completed_at: string | null = null, language: string | undefined;
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      kind = "code"; language = fence[2]!.trim(); const content: string[] = [];
      while (++i < lines.length && !new RegExp(`^\\s*${fence[1]![0]}{${fence[1]!.length},}\\s*$`).test(lines[i]!)) content.push(lines[i]!);
      text = content.join("\n");
    } else {
      const m = /^(\s*)(?:(#{1,3})\s+|([-+*])\s+\[([ xX])\]\s*|([-+*])\s+|\d+[.)]\s+|(>)\s?)(.*)$/.exec(line);
      if (m) { indent = Math.min(8, Math.floor(m[1]!.replace(/\t/g, "  ").length / 2)); text = m[7]!; kind = m[2] ? `heading${m[2].length}` as JellyBlockKind : m[3] ? "task" : m[5] ? "bullet" : m[6] ? "quote" : "numbered"; if (m[4]?.toLowerCase() === "x") completed_at = now; }
      else if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) { kind = "divider"; text = ""; }
    }
    const spans = kind !== "code" && kind !== "divider" ? parseInline(text) : undefined;
    parsed.push({ id: randomUUID(), kind, text: spans ? spans.map(s => s.text).join("") : text, indent, completed_at, completion_description: "", ...(language ? { language } : {}), ...(spans ? { inline_spans: spans } : {}) });
  }
  const used = new Set<string>();
  // Claim unchanged lines first so inserting one line cannot steal the IDs of later task links.
  const matching = parsed.map(block => previous.find(p => !used.has(p.id) && p.kind === block.kind && p.text === block.text && (used.add(p.id), true)));
  parsed.forEach((block, i) => {
    const original = matching[i] ?? (previous[i] && !used.has(previous[i]!.id) && previous[i]!.kind === block.kind ? previous[i] : undefined);
    if (original) { used.add(original.id); block.id = original.id; block.completion_description = original.completion_description; if (block.completed_at && original.completed_at) block.completed_at = original.completed_at;  }
  });
  return parsed;
}

function blockMarkdown(block: JellyBlock): string {
  if (!block.inline_spans || block.text !== block.inline_spans.map(s => s.text).join("")) return block.text;
  return block.inline_spans.map(s => { let text = s.text; if (s.marks.includes("code")) text = `\`${text}\``; if (s.marks.includes("italic")) text = `*${text}*`; if (s.marks.includes("bold")) text = `**${text}**`; if (s.link_url) text = `[${text}](${s.link_url})`; return text; }).join("");
}
export function jellyBlocksToMarkdown(blocks: readonly JellyBlock[]): string {
  return blocks.map(block => {
    const text = blockMarkdown(block), prefix = "  ".repeat(block.indent);
    switch (block.kind) {
      case "heading1": return `# ${text}`; case "heading2": return `## ${text}`; case "heading3": return `### ${text}`;
      case "bullet": return `${prefix}- ${text}`; case "numbered": return `${prefix}1. ${text}`;
      case "task": return `${prefix}- [${block.completed_at ? "x" : " "}] ${text}`;
      case "quote": return `> ${text}`;
      case "code": { const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map(m => m[0].length)); const fence = "`".repeat(longest + 1); return `${fence}${block.language ?? ""}\n${text}\n${fence}`; }
      case "divider": return "---"; default: return text;
    }
  }).join("\n");
}
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
function inline(text: string): string {
  // Escape first; only deliberately generated markup is allowed. URLs exclude executable schemes.
  const tokens: string[] = [];
  let value = escape(text).replace(/`([^`]+)`/g, (_, body: string) => `\u0000${tokens.push(`<code>${body}</code>`) - 1}\u0000`);
  value = value.replace(/\*\*\*([^*]+)\*\*\*/g, (_, body: string) => `\u0000${tokens.push(`<strong><em>${body}</em></strong>`) - 1}\u0000`);
  value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>').replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  return value.replace(/\u0000(\d+)\u0000/g, (_, n: string) => tokens[Number(n)]!);
}
export function jellyBlocksToHtml(blocks: readonly JellyBlock[]): string {
  return blocks.map(b => { const body = inline(blockMarkdown(b)), style = b.indent ? ` style="margin-left:${b.indent * 1.5}em"` : "";
    switch (b.kind) {
      case "heading1": return `<h1>${body}</h1>`; case "heading2": return `<h2>${body}</h2>`; case "heading3": return `<h3>${body}</h3>`;
      case "bullet": return `<ul${style}><li>${body}</li></ul>`; case "numbered": return `<ol${style}><li>${body}</li></ol>`;
      case "task": return `<p${style}><input type="checkbox" disabled${b.completed_at ? " checked" : ""}> ${body}</p>`;
      case "quote": return `<blockquote>${body}</blockquote>`; case "code": return `<pre><code${b.language ? ` class="language-${escape(b.language)}"` : ""}>${escape(b.text)}</code></pre>`;
      case "divider": return "<hr>"; default: return `<p>${body || "<br>"}</p>`;
    }
  }).join("\n");
}
export function jellyNoteToMarkdown(note: JellyNote): string { return `# ${note.title}\n\n${jellyBlocksToMarkdown(note.blocks)}\n`; }
export function jellyNoteToHtml(note: JellyNote): string { return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escape(note.title)}</title></head><body><h1>${escape(note.title)}</h1>${jellyBlocksToHtml(note.blocks)}</body></html>`; }
export function jellyHtmlToBlocks(html: string, previous: readonly JellyBlock[] = []): JellyBlock[] {
  // Import is a text codec, never a browser insertion of untrusted HTML.
  const decode = (s: string) => s.replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  let value = html.replace(/<(head|script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const listStack: string[] = [];
  value = value.replace(/<\/?(?:ul|ol|li)\b[^>]*>/gi, tag => {
    const name = /^<\/?(ul|ol|li)/i.exec(tag)![1]!.toLowerCase(), closing = tag.startsWith("</");
    if (name !== "li") { if (closing) listStack.pop(); else listStack.push(name); return "\n"; }
    return closing ? "\n" : `\n${"  ".repeat(Math.max(0, listStack.length - 1))}${listStack.at(-1) === "ol" ? "1." : "-"} `;
  });
  value = value.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, body: string) => `\n\x01${encodeURIComponent(JSON.stringify({text: decode(body.replace(/<[^>]+>/g, "")), language: /class=["'][^"']*language-([\w+-]+)/i.exec(body)?.[1] ?? ""}))}\x02\n`)
    .replace(/<h([1-3])\b[^>]*>/gi, (_, n: string) => `\n${"#".repeat(Number(n))} `).replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<blockquote\b[^>]*>/gi, "\n> ").replace(/<input\b(?=[^>]*type=["']?checkbox)[^>]*>/gi, tag => `- [${/\bchecked\b/i.test(tag) ? "x" : " "}] `)
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**").replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*").replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<hr\b[^>]*>/gi, "\n---\n").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(?:h[1-6]|p|div|li|ul|ol|blockquote)>/gi, "\n").replace(/<[^>]+>/g, "");
  value = decode(value).replace(/\x01([^\x02]*)\x02/g, (_, encoded: string) => { const { text: body, language } = JSON.parse(decodeURIComponent(encoded)) as { text: string; language: string }; const fence = "`".repeat(Math.max(3, ...[...body.matchAll(/`+/g)].map(m => m[0].length + 1))); return `${fence}${language}\n${body}\n${fence}`; });
  return jellyMarkdownToBlocks(value.trim(), previous);
}
