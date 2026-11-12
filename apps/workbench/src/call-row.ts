import { format, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { shortCallId } from "@molis-ai/molis-work-ui-host";
import type { SettingsRenderPrimitives } from "./settings-renderer.js";

/**
 * One finished call as the settings pages show it. The Host keeps a message only for a command that ran and failed.
 */
export interface CallRowView {
  at: string;
  /** The operation the row is about; for a row of several identical failures, the newest. */
  call_id: string;
  /** In a lookup: the number that was asked for, when the row holds several operations. */
  matched_call_id?: string;
  capability_id: string;
  version: number;
  /** `unknown` when the call ran against no definition this project can see; its title is then only the id it asked for. */
  operation: "command" | "query" | "unknown";
  title: string;
  provider_title: string;
  actor_id: string;
  audience: string;
  project_id: string | null;
  ok: boolean;
  code?: string;
  message?: string;
  /** Turned away before it ran, so nothing was done. */
  refused?: true;
  count?: number;
  last_at?: string;
}

type CallText = Pick<SettingsRenderPrimitives, "readText" | "escapeHtml">;

const CALLER: Record<string, string> = { user: "workbench.call-row.label", agent: "workbench.call-row.built-agent", workflow: "workbench.call-row.workflows", mcp: "workbench.call-row.mcp-client", plugin: "workbench.call-row.plugin" };

/** Who asked. A call the Host made for itself carries its own name and the user audience; it is not the person's. */
function callerLabel(row: Pick<CallRowView, "actor_id" | "audience">, _L: CallText["readText"]): string {
  return row.audience === "user" && row.actor_id === "local-host" ? "Molis Work" : (CALLER[row.audience] ? uiText.text(CALLER[row.audience]) : row.audience);
}

/**
 * The 诊断编号 of an operation as a button that copies the whole number. `data-molis-call-id` is the hook of the shared request helper's copy
 * handler. Every page has the helper: a page opened on its own embeds it, and the Workbench's program starts with it, which is what works when
 * the page is mounted in the Workbench's settings (the scripts of a mounted page do not run there). No second hook, so one click copies once.
 */
function renderCallIdButton(id: string, { escapeHtml: e }: CallText): string {
  const short = shortCallId(id);
  return `<button type="button" class="mw-btn mw-btn--link mw-btn--sm" data-molis-call-id="${e(id)}" aria-label="${uiText("workbench.call-row.copy-diagnostic-id-id", { id: short })}">${uiText("workbench.call-row.diagnostic-id-id", { id: short })}</button>`;
}

/** One call: what was called, for whom, how it ended and its 诊断编号; `where` adds the project it was made in and the way to its call history. */
export function renderCallRow(row: CallRowView, p: CallText, where?: { label: string; href?: string }): string {
  const { readText, escapeHtml: e } = p;
  const at = row.last_at ?? row.at;
  const localTime = (value: string) => Number.isNaN(Date.parse(value)) ? value : format.date(value, "datetime");
  const title = row.operation === "unknown" ? uiText.text("workbench.call-row.unknown-operation") : row.title;
  const source = row.provider_title ? e(row.provider_title) + " · " : "";
  const actor = row.audience === "mcp" || row.audience === "plugin" ? ` · ${e(row.actor_id)}` : "";
  return `<article data-call-row><header><strong>${e(title)}</strong><span${row.ok ? "" : ' class="is-unavailable"'}>${uiText(row.refused ? "workbench.call-row.not-run" : row.ok ? "workbench.call-row.succeeded" : "workbench.call-row.failed")}</span></header>`
    + `<p>${source}${e(callerLabel(row, readText))} · <time datetime="${e(at)}">${e(localTime(at))}</time></p>`
    + (row.count && row.count > 1 ? `<p>${uiText("workbench.call-row.same-result-count-count-row-first", { count: row.count, at: localTime(row.at) })}</p>` : "")
    + (!row.ok && !row.refused && row.message ? `<p>${uiText("workbench.call-row.reason-failure")}：${e(row.message)}</p>` : "")
    + `<p>${renderCallIdButton(row.matched_call_id ?? row.call_id, p)}</p>`
    + (where ? `<p>${e(where.label)}${where.href ? ` · <a href="${e(where.href)}">${uiText("workbench.call-row.view-call-history")}</a>` : ""}</p>` : "")
    + `<details class="capability-contract"><summary>${uiText("workbench.call-row.technical-details")}</summary><p><code>${e(row.capability_id)}@${row.version}</code>${actor}</p>`
    + (!row.ok && row.code ? `<p>${uiText("workbench.call-row.error-code")}：${e(row.code)}</p>` : "") + "</details></article>";
}
