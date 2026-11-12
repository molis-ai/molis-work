import type { ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderRichText } from "@molis-ai/molis-work-plugin-sdk/rich-text";
import { codingChangeHtml } from "./change-html.js";
import { HISTORY_DIGEST_MARKER } from "./continuation.js";
import { renderCodingReport } from "./ui.js";
import { codingText } from "./words.js";

/**
 * After the SDK compacts context, earlier replies reach the model labelled "[retained assistant …]" or "[historical … run:…]",
 * and it sometimes opens its answer with one or several of them. They are the SDK's bookkeeping, not something said to the
 * person; only labels at the very start are dropped.
 */
const COMPACTION_LABELS = /^(?:[^\S\n]*\[(?:retained|historical) [^\]\n]*\][^\S\n]*\n?)+/;

/**
 * The words already drawn, by their text. A page asks for every round each time it refreshes and only a streaming turn has new
 * words, so the rest are not parsed again (B27SRC-07: Micromark costs about 5× Marked, ~64 ms for 400,000 characters). Oldest
 * dropped first past RENDERED_CHARACTERS of text and HTML together.
 */
const rendered = new Map<string, string>(), RENDERED_CHARACTERS = 4_000_000;
let renderedCharacters = 0;
function richHtml(text: string): string {
  const kept = rendered.get(text);
  if (kept !== undefined) { rendered.delete(text); rendered.set(text, kept); return kept; }
  const html = renderRichText(text);
  rendered.set(text, html); renderedCharacters += text.length + html.length;
  for (const [key, value] of rendered) { if (renderedCharacters <= RENDERED_CHARACTERS) break; rendered.delete(key); renderedCharacters -= key.length + value.length; }
  return html;
}

type PageBody = {
  runs?: Array<{ turns?: Array<{ text: string; kind: string }>; awaiting_input?: unknown }>;
  subagents?: Array<{ children: Array<{ result: string | null }> }>;
  report?: { title: string; body_markdown: string; run_id: string };
};

/**
 * What Coding's page receives over a route, with the model's words drawn as sanitized rich text by the SDK (PG-062): a round's
 * turns, a subagent's result and a report; and a round's change read as a comparison with the SDK's `/diff-view`
 * (`change-html.ts`). Only a route's answer gets it, after a round's fingerprint is taken, so a model, a workflow or MCP reading
 * the same action gets the words and the change alone. The body is the call's own, filled in as it is.
 */
export function codingPageHtml<T>(body: T, request: { route_id: string; query: Readonly<Record<string, string>> }, locale: ActionLocale | undefined): T {
  codingChangeHtml(body, request, locale);
  const page = body as PageBody | undefined;
  if (Array.isArray(page?.runs)) for (const run of page.runs) {
    // Recovery reports also list runs, but carry receipt facts rather than turns.
    if (!Array.isArray(run.turns) || !Array.isArray(run.awaiting_input)) continue;
    // A digest round's opening is drawn by the page from its text; rendering it as well would double what travels.
    for (const turn of run.turns) if (!(turn.kind === "user" && turn.text.startsWith(HISTORY_DIGEST_MARKER))) Object.assign(turn, {
      html: richHtml(turn.kind === "assistant" ? turn.text.replace(COMPACTION_LABELS, "") : turn.text) });
  }
  if (Array.isArray(page?.subagents)) for (const group of page.subagents) for (const child of group.children) {
    if (child.result) Object.assign(child, { result_html: richHtml(child.result) });
  }
  if (page?.report) {
    const report = page.report;
    Object.assign(page, { html: renderCodingReport({ title: report.title, run_id: report.run_id, body_html: richHtml(report.body_markdown),
      primitives: { escape: value => escapeHtml(String(value)), icon: name => icon(name as Parameters<typeof icon>[0]), text: codingText(locale), formatDate: value => value } }) });
  }
  return body;
}
