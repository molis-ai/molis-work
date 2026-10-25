import { escText, escapeAttr } from "./dom.js";
import type { Reading } from "./types.js";

const safeUrl = (value: string): string => {
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

const inline = (value: string): string => {
  const parts = String(value).split(/(`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g);
  return parts.map((part) => {
    if (part.startsWith("`") && part.endsWith("`")) return "<code>" + escText(part.slice(1, -1)) + "</code>";
    const link = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    if (link) {
      const url = safeUrl(link[2]);
      return url ? '<a href="' + escapeAttr(url) + '" target="_blank" rel="noopener noreferrer">' + escText(link[1]) + "</a>" : escText(link[1]);
    }
    return escText(part).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }).join("");
};

const cells = (line: string): string[] => line.trim().replace(/^\||\|$/g, "").split("|").map((value) => value.trim());
const FENCE = /^\s*`{3}/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}/;
const ITEM = /^\s*(?:([-+*])|\d+[.)])\s+(.+)$/;

/** A fenced block starts at `at`; returns its markup and the line after it. */
function fenced(lines: string[], at: number): [string, number] {
  const language = lines[at].replace(FENCE, "").trim();
  const code: string[] = [];
  let index = at + 1;
  while (index < lines.length && !FENCE.test(lines[index])) code.push(lines[index++]);
  return ['<pre class="shelf-code"><code' + (language ? ' data-language="' + escapeAttr(language) + '"' : "") + ">" + escText(code.join("\n")) + "</code></pre>", index + 1];
}

function table(lines: string[], at: number): [string, number] {
  const head = cells(lines[at]);
  const rows: string[][] = [];
  let index = at + 2;
  while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(cells(lines[index++]));
  const body = rows.map((row) => "<tr>" + head.map((_, n) => "<td>" + inline(row[n] || "") + "</td>").join("") + "</tr>").join("");
  return ['<div class="shelf-table-scroll"><table><thead><tr>' + head.map((cell) => "<th>" + inline(cell) + "</th>").join("") + "</tr></thead><tbody>" + body + "</tbody></table></div>", index];
}

function list(lines: string[], at: number, ordered: boolean): [string, number] {
  const rows: string[] = [];
  let index = at;
  while (index < lines.length) {
    const row = lines[index].match(ITEM);
    if (!row || Boolean(row[1]) === ordered) break;
    rows.push("<li>" + inline(row[2]) + "</li>");
    index++;
  }
  const tag = ordered ? "ol" : "ul";
  return ["<" + tag + ">" + rows.join("") + "</" + tag + ">", index];
}

function paragraph(lines: string[], at: number): [string, number] {
  const text = [lines[at]];
  let index = at + 1;
  while (index < lines.length && lines[index].trim() && !/^(#{1,6}\s|>\s?|\s*[-+*]\s|\s*\d+[.)]\s|\s*`{3})/.test(lines[index]) && !(index + 1 < lines.length && TABLE_RULE.test(lines[index + 1]))) text.push(lines[index++]);
  return ["<p>" + inline(text.join("\n")).replace(/\n/g, "<br>") + "</p>", index];
}

/** One block of markdown starting at `at`: its markup and the line after it. */
function block(lines: string[], at: number): [string, number] {
  const line = lines[at];
  if (FENCE.test(line)) return fenced(lines, at);
  const heading = line.match(/^(#{1,6})\s+(.+)$/);
  if (heading) return ["<h" + heading[1].length + ">" + inline(heading[2]) + "</h" + heading[1].length + ">", at + 1];
  if (at + 1 < lines.length && line.includes("|") && TABLE_RULE.test(lines[at + 1])) return table(lines, at);
  if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) return ["<hr>", at + 1];
  if (/^>\s?/.test(line)) {
    const quote: string[] = [];
    let index = at;
    while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
    return ["<blockquote>" + markdown(quote.join("\n")) + "</blockquote>", index];
  }
  const item = line.match(ITEM);
  if (item) return list(lines, at, !item[1]);
  return paragraph(lines, at);
}

function markdown(text: string): string {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let at = 0;
  while (at < lines.length) {
    if (!lines[at].trim()) { at++; continue; }
    const [html, next] = block(lines, at);
    blocks.push(html);
    at = next;
  }
  return blocks.join("");
}

function render(item: { name?: string; kind?: string }, text: string): string {
  const ext = String(item.name || "").split(".").pop()?.toLowerCase() ?? "";
  if (item.kind === "url") {
    const url = safeUrl(String(text).trim());
    return url ? '<p><a class="shelf-source-link" href="' + escapeAttr(url) + '" target="_blank" rel="noopener noreferrer">' + escText(text) + "</a></p>" : '<pre class="shelf-plain">' + escText(text) + "</pre>";
  }
  if (item.kind === "markdown" || item.kind === "website" || ["md", "markdown"].includes(ext)) return markdown(text);
  if (ext === "json") {
    const pretty = prettyJson(text);
    if (pretty !== null) return '<pre class="shelf-code"><code>' + escText(pretty) + "</code></pre>";
  }
  return '<pre class="' + (item.kind === "text" ? "shelf-plain" : "shelf-code") + '">' + escText(text) + "</pre>";
}

/** The text as indented JSON, or null when it is not JSON. */
function prettyJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

/** Safe, dependency-free reading views for the Shelf's file copies. */
export const reading: Reading = { render, markdown };
