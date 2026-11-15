import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ProjectSelection } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ExternalSessionRow, ExternalSessionSuggestion } from "@molis-ai/molis-work-contracts/services/sessions";
import { formatActivityTime } from "./api.js";

const uiText = globalThis.t;

const UNFILED_REASONS = {
  no_relation: "workbench.sessions.unfiled-no-relation",
  tool_linked: "workbench.sessions.unfiled-tool-linked",
  ambiguous: "workbench.sessions.unfiled-ambiguous",
  relation_gone: "workbench.sessions.unfiled-relation-gone",
  project_gone: "workbench.sessions.unfiled-project-gone",
  left_unfiled: "workbench.sessions.unfiled-left-unfiled",
} as const;

export interface UnfiledRenderInput {
  readonly rows: readonly ExternalSessionRow[];
  readonly projects: readonly ProjectSelection[];
  readonly dirtyChoices: ReadonlyMap<string, string>;
  readonly liveSuggestions: ReadonlyMap<string, ExternalSessionSuggestion>;
  readonly selectedKey: string | null;
}

function suggestionFor(row: ExternalSessionRow, live: ReadonlyMap<string, ExternalSessionSuggestion>): ExternalSessionSuggestion | null {
  const fromLive = live.get(row.session_key);
  if (fromLive) return fromLive;
  return row.attribution.state === "unfiled" ? row.attribution.suggestion : null;
}

function chosenProjectId(
  row: ExternalSessionRow,
  projects: readonly ProjectSelection[],
  dirty: ReadonlyMap<string, string>,
  suggestion: ExternalSessionSuggestion | null,
): string {
  const manual = dirty.get(row.session_key);
  if (manual !== undefined) return manual;
  if (suggestion?.status === "ready" && suggestion.project) return suggestion.project.project_id;
  if (row.attribution.state === "unfiled" && row.attribution.candidates[0]) return row.attribution.candidates[0].project_id;
  return projects[0]?.project_id ?? "";
}

function renderUnfiledCard(row: ExternalSessionRow, input: UnfiledRenderInput): string {
  const suggestion = suggestionFor(row, input.liveSuggestions);
  const selectedProject = chosenProjectId(row, input.projects, input.dirtyChoices, suggestion);
  const suggestedId = suggestion?.status === "ready" ? suggestion.project?.project_id ?? "" : "";
  const title = row.title?.trim() || row.tool.display_name;
  const suggestLine = suggestion?.status === "ready" && suggestion.project
    ? `<p class="sessions-unfiled-suggest">${uiText("workbench.sessions.ai-suggested-project", { project: suggestion.project.display_name })} · ${escapeHtml(suggestion.reason)}</p>`
    : suggestion?.status === "failed"
      ? `<p class="sessions-unfiled-suggest">${uiText("workbench.sessions.ai-suggest-unavailable")}</p>`
      : `<p class="sessions-unfiled-suggest">${row.attribution.state === "unfiled" ? uiText(UNFILED_REASONS[row.attribution.reason]) : uiText("workbench.sessions.unfiled-no-relation")}</p>`;
  const options = input.projects.map((proj) =>
    `<option value="${escapeHtml(proj.project_id)}"${proj.project_id === selectedProject ? " selected" : ""}>${escapeHtml(proj.display_name)}</option>`).join("");
  const active = input.selectedKey === row.session_key ? " is-selected" : "";
  return `<article class="sessions-unfiled-card" data-unfiled-card="${escapeHtml(row.session_key)}" data-suggested-project="${escapeHtml(suggestedId)}">
    <button class="sessions-row${active}" type="button" data-session-key="${escapeHtml(row.session_key)}">
      <span class="sessions-row-head"><span class="sessions-row-title">${escapeHtml(title)}</span><time class="sessions-row-time">${escapeHtml(formatActivityTime(row.last_activity_at))}</time></span>
      <span class="sessions-row-meta"><span>${escapeHtml(row.tool.display_name)}</span>${row.directory ? `<span class="sessions-row-dir">${escapeHtml(row.directory)}</span>` : ""}</span>
    </button>
    ${suggestLine}
    <div class="sessions-unfiled-controls">
      <select class="mw-input" data-unfiled-select="${escapeHtml(row.session_key)}" aria-label="${uiText("workbench.sessions.target-project")}"${input.projects.length === 0 ? " disabled" : ""}>${options}</select>
      <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-unfiled-file="${escapeHtml(row.session_key)}"${!selectedProject ? " disabled" : ""}>${uiText("workbench.sessions.file-to-project")}</button>
      <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-unfiled-keep="${escapeHtml(row.session_key)}">${uiText("workbench.sessions.keep-unfiled")}</button>
    </div>
  </article>`;
}

export function renderUnfiledList(input: UnfiledRenderInput): string {
  const note = `<div class="sessions-unfiled-note">
    <span>${uiText("workbench.sessions.unfiled-payload-note")}</span>
    <span>${uiText("workbench.sessions.unfiled-permit-note")}</span>
  </div>`;
  if (input.rows.length === 0) {
    return `${note}<div class="sessions-empty-card"><strong>${uiText("workbench.sessions.unfiled-empty-title")}</strong><span>${uiText("workbench.sessions.unfiled-empty-body")}</span></div>`;
  }
  return `${note}${input.rows.map((row) => renderUnfiledCard(row, input)).join("")}`;
}

export function pickSuggestBatchKeys(rows: readonly ExternalSessionRow[], live: ReadonlyMap<string, ExternalSessionSuggestion>): string[] {
  const groups = new Set<string>();
  const keys: string[] = [];
  for (const row of rows) {
    if (row.attribution.state !== "unfiled") continue;
    if (row.attribution.suggestion || live.has(row.session_key)) continue;
    const groupKey = row.directory || `single:${row.session_key}`;
    if (!groups.has(groupKey) && groups.size >= 20) continue;
    groups.add(groupKey);
    keys.push(row.session_key);
    if (keys.length >= 100) break;
  }
  return keys;
}
