import { escapeHtml, icon, renderBadge } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderTranscript, type MwTranscriptEntry } from "@molis-ai/molis-work-design-system/session-sources";
import type { ProjectSelection } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ExternalSessionEntry, ExternalSessionHistoryOutput, ExternalSessionRow } from "@molis-ai/molis-work-contracts/services/sessions";
import { formatActivityTime } from "./api.js";

const uiText = globalThis.t;

export interface DetailViewState {
  readonly row: ExternalSessionRow;
  readonly entries: readonly ExternalSessionEntry[];
  readonly olderCursor: string | null;
  readonly loadingEarlier: boolean;
  readonly query: string;
  readonly history: ExternalSessionHistoryOutput | null;
  readonly error: string | null;
}

function toTranscriptEntry(entry: ExternalSessionEntry): MwTranscriptEntry {
  if (entry.role === "note") return { kind: "note", text: entry.text };
  if (entry.role === "tool_step") {
    const result = entry.step?.status === "failed"
      ? uiText.text("workbench.sessions.step-failed")
      : entry.step?.status === "ok"
        ? uiText.text("workbench.sessions.step-ok")
        : undefined;
    return { kind: "step", action: entry.step?.name || uiText.text("workbench.sessions.step-tool"), object: entry.text, result };
  }
  const suffix = entry.truncated ? `\n[${uiText.text("workbench.sessions.entry-truncated")}]` : "";
  return {
    kind: entry.role === "you" ? "you" : "tool",
    text: entry.text + suffix,
    time: formatActivityTime(entry.at),
  };
}

function renderReturnAction(row: ExternalSessionRow): { button: string; quietLine: string } {
  const target = row.return_target;
  if (target?.kind === "command") {
    return {
      button: `<button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-detail-copy-resume="${escapeHtml(target.label)}">${icon("copy")}<span>${uiText("workbench.sessions.copy-resume-command")}</span></button>`,
      quietLine: `<p class="sessions-resume-cmd"><code>${escapeHtml(target.label)}</code></p>`,
    };
  }
  if (target?.kind === "url") {
    return {
      button: `<a class="mw-btn mw-btn--secondary mw-btn--sm" href="${escapeHtml(target.label)}" target="_blank" rel="noopener noreferrer">${icon("external")}<span>${uiText("workbench.sessions.open-github-pr")}</span></a>`,
      quietLine: "",
    };
  }
  if (row.tool.surface === "cli") {
    return { button: "", quietLine: `<p class="sessions-resume-cmd">${uiText("workbench.sessions.interactive-resume-only")}</p>` };
  }
  return { button: "", quietLine: "" };
}

function renderAttributionBanner(row: ExternalSessionRow): string {
  const attr = row.attribution;
  if (attr.state === "reported") {
    return `<div class="sessions-attr-banner">
      <span>${uiText("workbench.sessions.reported-banner", { project: attr.project.display_name })}</span>
      <div class="sessions-detail-actions">
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-detail-confirm-project="${escapeHtml(attr.project.project_id)}">${uiText("workbench.sessions.confirm-attribution")}</button>
        <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-detail-change-attr>${uiText("workbench.sessions.change-attribution")}</button>
      </div>
    </div>`;
  }
  if (attr.state === "automatic" && attr.tool_reported_other) {
    return `<div class="sessions-attr-banner">
      <span>${uiText("workbench.sessions.tool-reported-other", { current: attr.project.display_name, other: attr.tool_reported_other.project.display_name })}</span>
      <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-detail-change-attr>${uiText("workbench.sessions.change-attribution")}</button>
    </div>`;
  }
  return "";
}

function attributionLabel(row: ExternalSessionRow): string {
  const attr = row.attribution;
  if (attr.state === "confirmed" || attr.state === "automatic" || attr.state === "reported") return attr.project.display_name;
  return uiText.text("workbench.sessions.view-unfiled");
}

export function renderDetailPane(container: HTMLElement, emptyEl: HTMLElement, state: DetailViewState | null): void {
  if (!state) {
    container.hidden = true;
    container.removeAttribute("data-assistant-context");
    container.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  container.hidden = false;
  const { row } = state;
  const title = row.title?.trim() || row.tool.display_name;
  container.setAttribute("data-assistant-context", JSON.stringify({
    surface: "sessions",
    object: { kind: "external_session", id: row.session_key, title },
  }));
  const ret = renderReturnAction(row);
  const stoppedBanner = state.history?.read_state === "partial" && state.history.stopped
    ? `<div class="mw-alert" data-tone="warning"><span>${uiText("workbench.sessions.partial-read")}</span>${
      state.history.stopped.retryable ? `<button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-detail-retry>${uiText("common.control.retry")}</button>` : ""
    }</div>`
    : "";
  const body = state.error
    ? `<div class="mw-alert" data-tone="danger"><span>${escapeHtml(state.error)}</span><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-detail-retry>${uiText("common.control.retry")}</button></div>`
    : renderTranscript({
      label: title,
      you: { name: uiText.text("workbench.sessions.who-you"), mark: uiText.text("workbench.sessions.who-you-mark"), label: uiText.text("workbench.sessions.who-you") },
      tool: { name: row.tool.display_name, mark: row.tool.display_name.slice(0, 1).toUpperCase(), label: row.tool.display_name },
      entries: state.entries.map(toTranscriptEntry),
      highlight: state.query || undefined,
      earlier: state.olderCursor
        ? { label: uiText.text("workbench.sessions.load-earlier"), loading: state.loadingEarlier, attrs: { "data-detail-load-earlier": true } }
        : undefined,
    });
  container.innerHTML = `<header class="sessions-detail-head">
      <div class="sessions-detail-top">
        <div class="sessions-detail-actions">
          <button class="mw-btn mw-btn--ghost mw-btn--sm sessions-mobile-back" type="button" data-sessions-back>${icon("chevron-left")}<span>${uiText("workbench.sessions.back-to-list")}</span></button>
          <h2 class="sessions-detail-title">${escapeHtml(title)}</h2>
        </div>
        <div class="sessions-detail-actions">
          ${ret.button}
          <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-detail-change-attr>${uiText("workbench.sessions.change-attribution")}</button>
        </div>
      </div>
      <div class="sessions-detail-meta">
        ${renderBadge({ label: row.tool.display_name })}
        ${renderBadge({ label: attributionLabel(row) })}
        ${row.directory ? `<code>${escapeHtml(row.directory)}</code>` : ""}
        <time>${escapeHtml(formatActivityTime(row.last_activity_at))}</time>
      </div>
      <div class="sessions-readonly-bar">
        <span>${icon("eye-off")} ${uiText("workbench.sessions.readonly-notice")}</span>
        ${ret.quietLine}
      </div>
      ${renderAttributionBanner(row)}
      <div class="sessions-detail-search">
        <label class="mw-input-group" style="flex:1 1 auto">${icon("search")}<input class="mw-input" type="search" data-detail-query value="${escapeHtml(state.query)}" placeholder="${uiText("workbench.sessions.search-in-session")}" aria-label="${uiText("workbench.sessions.search-in-session")}" autocomplete="off"></label>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-detail-search-run>${uiText("workbench.sessions.search-btn")}</button>
      </div>
    </header>
    <div class="sessions-detail-scroll">${stoppedBanner}${body}</div>`;
}

export function populateAttributionDialog(
  dialog: HTMLDialogElement,
  row: ExternalSessionRow,
  projects: readonly ProjectSelection[],
): void {
  const info = dialog.querySelector<HTMLElement>("[data-sessions-attr-session]");
  const select = dialog.querySelector<HTMLSelectElement>("[data-sessions-attr-select]");
  const err = dialog.querySelector<HTMLElement>("[data-sessions-attr-error]");
  if (info) info.textContent = row.title?.trim() || row.tool.display_name;
  if (err) { err.hidden = true; err.textContent = ""; }
  if (!select) return;
  const currentId = row.attribution.state === "unfiled" ? "__unfiled__" : row.attribution.project.project_id;
  select.innerHTML = [
    ...projects.map((proj) => `<option value="${escapeHtml(proj.project_id)}"${proj.project_id === currentId ? " selected" : ""}>${escapeHtml(proj.display_name)}</option>`),
    `<option value="__unfiled__"${currentId === "__unfiled__" ? " selected" : ""}>${uiText("workbench.sessions.leave-unfiled-option")}</option>`,
    `<option value="__clear__">${uiText("workbench.sessions.reset-auto-option")}</option>`,
  ].join("");
}
