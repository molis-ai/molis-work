import { shortCallId } from "@molis-ai/molis-work-ui-host";
import type { SettingsRenderPrimitives } from "./settings-renderer.js";

/**
 * One finished call as the settings pages show it: the Host's call log row, less what no page shows. The log keeps no input and no result,
 * and a message only for a command that ran and failed, so there is nothing here to hide.
 */
export interface CallRowView {
  at: string;
  /** The operation the row is about; for a row of several identical failures, the newest. */
  call_id: string;
  /** In a lookup: the number that was asked for, when the row holds several operations. */
  matched_call_id?: string;
  capability_id: string;
  version: number;
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

type CallText = Pick<SettingsRenderPrimitives, "L" | "escapeHtml">;

const CALLER: Record<string, string> = { user: "你", agent: "内置 Agent", workflow: "工作流程", mcp: "MCP 客户端", plugin: "插件" };

/** Who asked. A call the Host made for itself carries its own name and the user audience; it is not the person's. */
function callerLabel(row: Pick<CallRowView, "actor_id" | "audience">, L: CallText["L"]): string {
  return row.audience === "user" && row.actor_id === "local-host" ? "Molis Work" : L(CALLER[row.audience] ?? row.audience);
}

/**
 * The 诊断编号 of an operation as a button that copies the whole number. `data-molis-call-id` is the hook of the shared request helper's copy
 * handler, which a page opened on its own carries; `data-copy-value` is the one the workbench already has, which is what works when the page is
 * mounted in the workbench's settings (the scripts of a mounted page do not run there).
 */
export function renderCallIdButton(id: string, { L, escapeHtml: e }: CallText): string {
  const short = e(shortCallId(id));
  return `<button type="button" class="mw-btn mw-btn--link mw-btn--sm" data-molis-call-id="${e(id)}" data-copy-value="${e(id)}" aria-label="${L("复制诊断编号 {id}", { id: short })}">${L("诊断编号 {id}", { id: short })}</button>`;
}

/** One call: what was called, for whom, how it ended and its 诊断编号; `where` adds the project it was made in and the way to its call history. */
export function renderCallRow(row: CallRowView, p: CallText, where?: { label: string; href?: string }): string {
  const { L, escapeHtml: e } = p;
  const at = row.last_at ?? row.at;
  return `<article data-call-row><header><strong>${e(row.title)}</strong><span${row.ok ? "" : ' class="is-unavailable"'}>${L(row.refused ? "未执行" : row.ok ? "成功" : "失败")}</span></header>`
    + `<p>${e(row.provider_title)} · ${callerLabel(row, L)}${row.audience === "mcp" || row.audience === "plugin" ? ` · ${e(row.actor_id)}` : ""} · <code>${e(row.capability_id)}@${row.version}</code></p>`
    + `<p>${renderCallIdButton(row.matched_call_id ?? row.call_id, p)}</p>`
    + (where ? `<p>${e(where.label)}${where.href ? ` · <a href="${e(where.href)}">${L("查看调用记录")}</a>` : ""}</p>` : "")
    + `<time datetime="${e(at)}">${e(at)}</time>${row.count && row.count > 1 ? `<p>${L("连续 {count} 次相同结果，最早 {at}", { count: row.count, at: e(row.at) })}</p>` : ""}`
    + `${row.ok || !(row.message ?? row.code) ? "" : `<p>${L(row.message ? "失败原因" : "错误码")}：${e(row.message ?? row.code ?? "")}</p>`}</article>`;
}
