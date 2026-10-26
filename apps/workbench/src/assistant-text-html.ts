import type { AssistantNotice, AssistantPendingReview } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantCodeHtml, assistantEscape, assistantInlineHtml, assistantListHtml, ASSISTANT_LIST_ITEM, type AssistantTextPorts } from "./assistant-text-parts.js";

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

const REVIEW_KIND: Array<[RegExp, string, string]> = [[/command|shell|exec|terminal/i, "运行命令", "terminal"], [/file|patch|edit|write-file/i, "修改文件", "code"],
  [/mcp|external|http|web|network/i, "调用外部工具", "external"], [/./, "修改数据", "edit"]];
const CODE_FIELD: Record<string, string> = { "改动": "diff", "命令": "sh", "参数": "json" };
const codeField = (label: string): string => Object.hasOwn(CODE_FIELD, label) ? CODE_FIELD[label]! : "";

export function renderAssistantReviewHtml(review: AssistantPendingReview, ports: AssistantTextPorts): string {
  const [, kind, kindIcon] = REVIEW_KIND.find(([pattern]) => pattern.test(String(review.kind || ""))) || REVIEW_KIND[REVIEW_KIND.length - 1]!;
  const say = (value: string) => assistantEscape(ports.say(value));
  let html = `<div class="assistant-card-head"><span class="assistant-card-kicker is-attention"><span class="assistant-state-ring" data-mw-state="approval" aria-hidden="true"></span>${say("执行前需要你确认")}</span><span class="assistant-card-badge"><span data-assistant-review-glyph="${kindIcon}"></span>${say(kind)}</span></div><p class="assistant-card-title">${assistantEscape(review.summary)}</p>`;
  const plain = review.fields.filter(field => field.label !== "完整参数" && field.label !== "能力");
  const fields = plain.filter(field => !codeField(field.label));
  if (fields.length) html += `<dl class="assistant-fields">${fields.map(field => `<dt>${say(field.label)}</dt><dd>${assistantEscape(field.value)}</dd>`).join("")}</dl>`;
  for (const field of plain) {
    const language = codeField(field.label);
    if (language) html += `<div class="assistant-field-code"><p class="assistant-field-label">${say(field.label)}</p>${assistantCodeHtml(field.value.replace(/\n$/, ""), language, ports)}</div>`;
  }
  const exact = review.fields.filter(field => field.label === "完整参数" || field.label === "能力");
  if (exact.length) html += `<details class="assistant-exact"><summary>${say("准确参数与能力")}</summary>${exact.map(field => `<p class="assistant-muted">${say(field.label)}</p><pre>${assistantEscape(field.value)}</pre>`).join("")}</details>`;
  return html + `<div class="assistant-card-actions"><button class="mw-btn mw-btn--primary mw-btn--sm" type="button" data-assistant-decision="approve">${say("允许执行")}</button><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-assistant-decision="reject">${say("拒绝")}</button></div><p class="assistant-card-hint">${say("允许只执行这一次；拒绝就不执行，助理会知道你拒绝了。")}</p>`;
}

/** Saved notice templates use the current UI language; names are filled once as literal text. Self-contained for the client. */
export function renderAssistantNoticeText(notice: AssistantNotice, say: (key: string, vars?: Record<string, string>) => string): string {
  if (notice.kind !== "directory-read") return notice.text;
  const params = notice.text_params;
  return params ? say(notice.text, { ...params, origin: say(params.origin) }) : say("目录读取通知的数据不完整。");
}
