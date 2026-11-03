import { button, esc } from "./dom.js";
import type { Link, Reference, Translate } from "./types.js";

const TOKENS = /`([^`]+)`|!?\[\[([^\]\n]+)\]\]|!?\[([^\]\n]*)\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)|\[S(\d+)\]/g;
const plain = (line: string): string => esc(line).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

/** Wiki links, Markdown links and `[S1]` citations in one line; what the material's links resolved to decides what each becomes. */
function inline(line: string, L: Translate, outgoing: readonly Link[], references: readonly Reference[]): string {
  let text = "", end = 0;
  for (const match of line.matchAll(TOKENS)) {
    const at = match.index ?? 0;
    text += plain(line.slice(end, at));
    end = at + match[0].length;
    if (match[1] !== undefined) { text += `<code>${esc(match[1])}</code>`; continue; }
    if (match[5]) {
      const ref = references.find((candidate) => candidate.label === "S" + match[5]);
      text += ref ? `<button type="button" class="cognia-inline-link" data-cognia-action="reference" data-id="${esc(ref.material_id)}" data-revision="${ref.revision}">${esc(match[0])}</button>` : esc(match[0]);
      continue;
    }
    const parts = match[2]?.split("|");
    const target = parts ? parts[0] : match[4];
    const label = parts ? parts[1] || parts[0] : match[3] || target;
    const link = outgoing.find((candidate) => candidate.target === target);
    if (link?.status === "resolved") text += `<button type="button" class="cognia-inline-link" data-cognia-action="link" data-id="${esc(link.material_id)}">${esc(label)}</button>`;
    else if (link?.status === "external" && /^(https?:|mailto:)/i.test(link.target)) text += `<a href="${esc(link.target)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    else text += `<span title="${esc(L(link?.status === "ambiguous" ? "cognia.link.ambiguous" : "cognia.link.missing"))}">${esc(match[0])}</span>`;
  }
  return text + plain(line.slice(end));
}

/** The small Markdown the reader shows: headings, bullets, quotes, fenced code, bold, inline code and links. Everything is escaped first. */
export function renderMarkdown(body: string, L: Translate, outgoing: readonly Link[] = [], references: readonly Reference[] = []): string {
  const draw = (line: string) => inline(line, L, outgoing, references);
  let code = false, output = "", paragraph: string[] = [], list = false;
  const flush = () => {
    if (paragraph.length) { output += "<p>" + paragraph.map(draw).join("\n") + "</p>"; paragraph = []; }
    if (list) { output += "</ul>"; list = false; }
  };
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(?:`{3,}|~{3,})/.test(line)) { flush(); output += code ? "</code></pre>" : "<pre><code>"; code = !code; continue; }
    if (code) { output += esc(line) + "\n"; continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line), bullet = /^\s*(?:[-*+] |\d+\. )(.*)$/.exec(line);
    if (heading) { flush(); output += `<h${heading[1].length}>${draw(heading[2])}</h${heading[1].length}>`; }
    else if (bullet) { if (paragraph.length) flush(); if (!list) { output += "<ul>"; list = true; } output += `<li>${draw(bullet[1])}</li>`; }
    else if (/^>\s?/.test(line)) { flush(); output += `<blockquote>${draw(line.replace(/^>\s?/, ""))}</blockquote>`; }
    else if (!line.trim()) flush();
    else { if (list) flush(); paragraph.push(line); }
  }
  flush();
  if (code) output += "</code></pre>";
  return output;
}

/** The sources a draft or an opened material cites, each one a button that opens that fixed version. */
export function renderReferences(references: readonly Reference[], L: Translate): string {
  if (!references.length) return "";
  const rows = references.map((r) => button(`[${r.label}] ${r.title} · v${r.revision}`, "reference", `data-id="${esc(r.material_id)}" data-revision="${r.revision}"`));
  return `<section class="cognia-relations"><h3>${esc(L("cognia.reading.references"))}</h3>${rows.join("")}</section>`;
}
