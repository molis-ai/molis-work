import type { AssistantNotice, AssistantSavedText } from "@molis-ai/molis-work-contracts/services/assistant";
import type { UiSayTool } from "@molis-ai/molis-work-contracts/platform/ui";
import { assistantCodeHtml, assistantInlineHtml, assistantListHtml, ASSISTANT_LIST_ITEM, type AssistantTextPorts } from "./assistant-text-parts.js";

/** Assistant-only Markdown projection, with the same block rules as its original browser renderer. */
export function renderAssistantTextHtml(text: string, ports: AssistantTextPorts): string {
  return `<div class="assistant-rich">${blocks(text, ports)}</div>`;
}

function blocks(text: string, ports: AssistantTextPorts): string {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, at) => {
    const loose = /^(\s*)([-•])([^\s\-•].*)$/.exec(line);
    if (loose && [lines[at - 1], lines[at + 1]].some(near => near !== undefined && new RegExp("^\\s*\\" + loose[2] + "\\s+\\S").test(near))) lines[at] = loose[1] + loose[2]! + " " + loose[3];
  });
  const isFence = (line: string) => /^\s*(```|~~~)/.test(line);
  const isRule = (line: string) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(line);
  const isTableAt = (at: number) => lines[at]!.includes("|") && at + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[at + 1]!);
  const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
  const startsBlock = (at: number) => isFence(lines[at]!) || ASSISTANT_LIST_ITEM.test(lines[at]!) || /^#{1,6}\s/.test(lines[at]!) || /^\s*>/.test(lines[at]!) || isRule(lines[at]!) || isTableAt(at);
  let index = 0, html = "";
  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.trim()) { index += 1; continue; }
    if (isFence(line)) {
      const mark = line.trim().slice(0, 3), hint = line.trim().slice(3).trim(), code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]!.trim().startsWith(mark)) { code.push(lines[index]!); index += 1; }
      index += 1; html += assistantCodeHtml(code.join("\n"), hint, ports); continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const tag = heading[1]!.length <= 1 ? "h3" : heading[1]!.length === 2 ? "h4" : "h5";
      html += `<${tag} class="assistant-rich-heading">${assistantInlineHtml(heading[2]!.replace(/\s+#+\s*$/, ""), ports)}</${tag}>`; index += 1; continue;
    }
    if (isRule(line)) { html += "<hr>"; index += 1; continue; }
    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index]!)) { quoted.push(lines[index]!.replace(/^\s*>\s?/, "")); index += 1; }
      html += `<blockquote>${blocks(quoted.join("\n"), ports)}</blockquote>`; continue;
    }
    if (isTableAt(index)) {
      const head = cells(line), aligns = cells(lines[index + 1]!).map(cell => cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "");
      index += 2;
      const cell = (tag: string, value: string, at: number) => `<${tag}${aligns[at] ? ` style="text-align: ${aligns[at]};"` : ""}>${assistantInlineHtml(value, ports)}</${tag}>`;
      html += `<div class="assistant-table"><table><thead><tr>${head.map((value, at) => cell("th", value, at)).join("")}</tr></thead><tbody>`;
      while (index < lines.length && lines[index]!.includes("|") && lines[index]!.trim()) { html += `<tr>${cells(lines[index]!).map((value, at) => cell("td", value, at)).join("")}</tr>`; index += 1; }
      html += "</tbody></table></div>"; continue;
    }
    if (ASSISTANT_LIST_ITEM.test(line)) { const list = assistantListHtml(lines, index, ports); html += list.html; index = list.end; continue; }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index]!.trim() && (!paragraph.length || !startsBlock(index))) {
      paragraph.push(assistantInlineHtml(lines[index]!, ports)); index += 1;
    }
    html += `<p>${paragraph.join("<br>")}</p>`;
  }
  return html;
}

/** Plain text, drawn by the SDK only for the Host-owned label. The owner's original can be arbitrarily long. */
export function renderAssistantSavedText(text: AssistantSavedText, read: UiSayTool["text"]): string {
  return "original" in text ? text.label ? read(text.label) + "\n" + text.original : text.original : read(text);
}

/** The stored owner and facts are the same in any language. Self-contained with the saved text reader for the browser. */
export function renderAssistantNoticeText(notice: AssistantNotice, read: UiSayTool["text"], saved: typeof renderAssistantSavedText): string {
  const { text, directory_origin: origin, additional_count: count } = notice;
  if (notice.kind === "directory-read") {
    if (!origin || !["person", "agent", "workflow", "mcp", "background"].includes(origin) || "original" in text)
      return read({ owner: "workbench", key: "workbench.assistant-directory.invalid" });
    return read({ ...text, key: `${text.key}-${origin}` });
  }
  if (notice.kind === "material" && count && count > 0 && "key" in text)
    return read({ ...text, key: text.key + "-more", args: [...(text.args ?? []), { name: "count", kind: "number", number: count }] });
  if ("key" in text && text.owner === "workbench" && text.key === "workbench.assistant-notice.followup-missed")
    return read({ ...text, args: text.args?.map(arg => arg.name === "at" && arg.kind === "date" ? { ...arg, style: "datetime-with-seconds" } : arg) });
  return saved(text, read);
}
