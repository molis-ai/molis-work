import { escapeHtml as esc } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Links only to the web or mail; anything else stays text. */
const safeLink = (href: string): string | null => (/^(https?:\/\/|mailto:)/iu.test(href) ? href : null);
function inline(text: string): string {
  return esc(text)
    .replace(/`([^`]+)`/gu, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/gu, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/gu, (whole, label: string, href: string) => {
      const target = safeLink(href.replace(/&amp;/gu, "&"));
      return target ? `<a href="${esc(target)}" target="_blank" rel="noopener noreferrer">${label}</a>` : whole;
    });
}
/**
 * A note's Markdown as reading text: headings, lists, task boxes, quotes, code blocks, rules and paragraphs. Everything is escaped first; the
 * only markup is what this writes, so a note can hold any text without it running.
 */
export function renderMarkdown(source: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let code: string[] | null = null;
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      out.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
      paragraph = [];
    }
  };
  const close = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  for (const line of source.replace(/\r\n?/gu, "\n").split("\n")) {
    if (code) {
      if (/^```/u.test(line)) {
        out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
        code = null;
      } else code.push(line);
      continue;
    }
    if (/^```/u.test(line)) {
      flush();
      close();
      code = [];
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/u.exec(line),
      bullet = /^\s*[-*+]\s+(.*)$/u.exec(line),
      numbered = /^\s*\d+[.)]\s+(.*)$/u.exec(line);
    if (heading) {
      flush();
      close();
      out.push(`<h${heading[1]!.length + 2}>${inline(heading[2]!)}</h${heading[1]!.length + 2}>`);
      continue;
    }
    if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) {
        close();
        out.push(`<${kind}>`);
        list = kind;
      }
      const text = (bullet ?? numbered)![1]!,
        task = /^\[([ xX])\]\s+(.*)$/u.exec(text);
      out.push(
        task
          ? `<li class="jelly-md-task"><input type="checkbox" disabled${task[1] === " " ? "" : " checked"}> ${inline(task[2]!)}</li>`
          : `<li>${inline(text)}</li>`,
      );
      continue;
    }
    close();
    if (/^\s*>\s?/u.test(line)) {
      flush();
      out.push(`<blockquote>${inline(line.replace(/^\s*>\s?/u, ""))}</blockquote>`);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/u.test(line)) {
      flush();
      out.push("<hr>");
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    paragraph.push(line);
  }
  if (code) out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
  flush();
  close();
  return out.join("");
}
/** A note's name as lists show it: its title, else its first line without the Markdown marks. */
export const noteName = (note: { title: string; body?: string; excerpt?: string }): string =>
  note.title.trim() ||
  (note.body ?? note.excerpt ?? "")
    .trim()
    .split("\n", 1)[0]!
    .replace(/^#+\s*|[*`>_]/gu, "")
    .slice(0, 80);
