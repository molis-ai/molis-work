import type { AssistantPendingReview } from "@molis-ai/molis-work-contracts/services/assistant";
import type { OwnedTextRef, UiSayTool } from "@molis-ai/molis-work-contracts/platform/ui";
import { assistantCodeHtml, assistantEscape, type AssistantTextPorts } from "./assistant-text-parts.js";

export type AssistantReviewWords = readonly (string | OwnedTextRef)[];
interface FormattedReviewField { readonly label: AssistantReviewWords; readonly value: string; readonly format: "sh" | "diff" | "json" | "exact"; readonly before?: AssistantReviewWords; readonly after?: AssistantReviewWords }
export type AssistantReviewField =
  | { readonly label: AssistantReviewWords; readonly value: AssistantReviewWords; readonly format?: undefined }
  | FormattedReviewField;
export interface AssistantReviewDisplay { readonly summary: AssistantReviewWords; readonly fields: readonly AssistantReviewField[] }

const REVIEW_KIND: ReadonlyArray<readonly [RegExp, string, string]> = [
  [/command|shell|exec|terminal/i, "workbench.assistant-review.run-command", "terminal"],
  [/file|patch|edit|write-file/i, "workbench.assistant-review.edit-file", "code"],
  [/mcp|external|http|web|network/i, "workbench.assistant-review.call-external-tool", "external"],
  [/./, "workbench.assistant-review.change-data", "edit"],
];

const escaped = (original: string) => assistantEscape(original).replaceAll("\r", "&#13;");
const fixedWord = (ref: OwnedTextRef, words: string) => '<span data-assistant-review-copy="' + escaped(JSON.stringify(ref)) + '" translate="no">' + escaped(words) + '</span>';

export function readAssistantReviewWords(words: AssistantReviewWords, read: UiSayTool["text"]): string {
  return words.map(word => typeof word === "string" ? word : read(word)).join("");
}

/** The review owns the exact source words and the display role of each field. The browser only retitles fixed spans. */
export function renderAssistantReviewHtml(review: AssistantPendingReview, ports: AssistantTextPorts, read: UiSayTool["text"], display?: AssistantReviewDisplay): string {
  const [, kind, kindIcon] = REVIEW_KIND.find(([pattern]) => pattern.test(String(review.kind || ""))) || REVIEW_KIND[REVIEW_KIND.length - 1]!;
  const copy = (words: AssistantReviewWords) => words.map(word => typeof word === "string" ? '<span translate="no">' + escaped(word) + '</span>' : fixedWord(word, read(word))).join("");
  const say = (key: string) => fixedWord({ owner: "workbench", key }, ports.say(key));
  const fields: readonly AssistantReviewField[] = display?.fields ?? review.fields.map(field => ({ label: [field.label], value: [field.value] }));
  let html = `<div class="assistant-card-head"><span class="assistant-card-kicker is-attention"><span class="assistant-state-ring" data-mw-state="approval" aria-hidden="true"></span>${say("workbench.assistant-review.confirm-before-running")}</span><span class="assistant-card-badge"><span data-assistant-review-glyph="${kindIcon}"></span>${say(kind)}</span></div><p class="assistant-card-title">${copy(display?.summary ?? [review.summary])}</p>`;
  const plain = fields.filter(field => !field.format);
  if (plain.length) html += `<dl class="assistant-fields">${plain.map(field => `<dt>${copy(field.label)}</dt><dd>${copy(field.value)}</dd>`).join("")}</dl>`;
  for (const field of fields) {
    if (!field.format || field.format === "exact") continue;
    html += `<div class="assistant-field-code"><p class="assistant-field-label">${copy(field.label)}</p>`;
    if (field.before?.length) html += `<p class="assistant-muted">${copy(field.before)}</p>`;
    if (field.value) html += assistantCodeHtml(field.value, field.format, ports, true);
    if (field.after?.length) html += `<p class="assistant-muted">${copy(field.after)}</p>`;
    html += "</div>";
  }
  const exact = fields.filter((field): field is FormattedReviewField => field.format === "exact");
  if (exact.length) html += `<details class="assistant-exact"><summary>${say("workbench.assistant-review.exact-arguments-capability")}</summary>${exact.map(field => `<p class="assistant-muted">${copy(field.label)}</p><pre><span translate="no">${escaped(field.value)}</span></pre>`).join("")}</details>`;
  return html + `<div class="assistant-card-actions"><button class="mw-btn mw-btn--primary mw-btn--sm" type="button" data-assistant-decision="approve">${say("workbench.assistant-review.allow-run")}</button><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-assistant-decision="reject">${say("workbench.agent-review.reject")}</button></div><p class="assistant-card-hint">${say("workbench.assistant-review.decision-hint")}</p>`;
}
