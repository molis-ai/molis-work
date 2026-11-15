import { escapeHtml, icon, renderBadge, renderSwitch } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderPermitNote, renderPermitRow, type MwPermitNote } from "@molis-ai/molis-work-design-system/session-sources";
import type { ExternalSessionDirectoryScope, ExternalSessionProjectAiRead, ExternalSessionScopeSource } from "@molis-ai/molis-work-contracts/services/sessions";
import { copyPlainText, currentProjectId, sessionsApi, type SessionScopeWithMeta, type SessionToolMeta } from "./api.js";

const uiText = globalThis.t;

export type ScopeTabId = "tools" | "project_ai_read";

export interface ScopeSheetController {
  open(tab?: ScopeTabId, options?: { overlay?: boolean }): Promise<void>;
  onSaved(listener: (scope: SessionScopeWithMeta) => void): void;
}

function renderConnectedRow(meta: SessionToolMeta, src: ExternalSessionScopeSource | undefined): string {
  const id = escapeHtml(meta.id);
  const isCloud = meta.surface === "cloud";
  const conns = src?.connections ?? [];
  const noConn = isCloud && conns.length === 0;
  const checked = Boolean(src?.allowed) && !noConn;
  const chosenConn = src?.connection_id || conns[0]?.connection_id || "";
  const side = isCloud
    ? noConn
      ? src?.connect_service_id
        ? `<a class="mw-btn mw-btn--secondary mw-btn--sm" href="/settings/connectors">${uiText("workbench.sessions.go-connect-settings")}</a>`
        : `<span class="mw-badge">${uiText("workbench.sessions.no-connection")}</span>`
      : `<select class="mw-input" data-scope-conn="${id}" aria-label="${escapeHtml(meta.display_name)}">${conns.map((c) =>
        `<option value="${escapeHtml(c.connection_id)}"${c.connection_id === chosenConn ? " selected" : ""}>${escapeHtml(c.account_label ? `${c.display_name} (${c.account_label})` : c.display_name)}</option>`).join("")}</select>`
    : "";
  return `<div class="sessions-tool-row" data-scope-tool="${id}">
    <label class="sessions-tool-main">
      <input class="mw-check" type="checkbox" data-scope-allow="${id}"${checked ? " checked" : ""}${noConn ? " disabled" : ""}>
      <span class="sessions-tool-copy">
        <strong>${escapeHtml(meta.display_name)}</strong>
        <small>${escapeHtml(meta.vendor)} · ${uiText(isCloud ? "workbench.sessions.surface-cloud" : "workbench.sessions.surface-local")}</small>
      </span>
    </label>
    <div class="sessions-tool-side">${side}</div>
  </div>`;
}

function renderToolsPanel(scope: SessionScopeWithMeta, dirMode: "linked_projects" | "all"): string {
  const byId = new Map(scope.sources.map((item) => [item.entry_id, item]));
  const connected = scope.tool_meta.filter((m) => m.group === "connected");
  const exportOnly = scope.tool_meta.filter((m) => m.group === "export_only");
  const unsupported = scope.tool_meta.filter((m) => m.group === "unsupported");
  const exportRows = exportOnly.map((m) => `<div class="sessions-tool-row">
    <div class="sessions-tool-copy"><strong>${escapeHtml(m.display_name)}</strong><small>${uiText("workbench.sessions.export-only-note")}</small>${m.export_command ? `<code>${escapeHtml(m.export_command)}</code>` : ""}</div>
    ${m.export_command ? `<button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-scope-copy="${escapeHtml(m.export_command)}">${icon("copy")}<span>${uiText("workbench.sessions.copy-command")}</span></button>` : ""}
  </div>`).join("");
  const unsupRows = unsupported.map((m) => `<div class="sessions-tool-row">
    <div class="sessions-tool-copy"><strong>${escapeHtml(m.display_name)}</strong><small>${escapeHtml(m.vendor)}</small></div>
    ${renderBadge({ label: uiText.text(m.unsupported_kind === "not_open" ? "workbench.sessions.gap-not-open" : "workbench.sessions.gap-pending") })}
  </div>`).join("");
  return `<section class="sessions-scope-group">
      <h3>${uiText("workbench.sessions.dir-scope-heading")}</h3>
      <div class="mw-settings">
        <label class="sessions-tool-row"><span class="sessions-tool-main"><input type="radio" name="sessions-dir-mode" value="linked_projects"${dirMode === "linked_projects" ? " checked" : ""}><span class="sessions-tool-copy"><strong>${uiText("workbench.sessions.dir-linked-only")}</strong><small>${uiText("workbench.sessions.dir-linked-hint")}</small></span></span></label>
        <label class="sessions-tool-row"><span class="sessions-tool-main"><input type="radio" name="sessions-dir-mode" value="all"${dirMode === "all" ? " checked" : ""}><span class="sessions-tool-copy"><strong>${uiText("workbench.sessions.dir-all")}</strong><small>${uiText("workbench.sessions.dir-all-hint")}</small></span></span></label>
      </div>
      <p class="sessions-scope-hint">${uiText("workbench.sessions.worktree-scope-note")}</p>
    </section>
    <section class="sessions-scope-group">
      <h3>${uiText("workbench.sessions.group-connected", { count: connected.length })}</h3>
      <div class="mw-settings">${connected.map((m) => renderConnectedRow(m, byId.get(m.id as never))).join("")}</div>
    </section>
    <section class="sessions-scope-group">
      <h3>${uiText("workbench.sessions.group-export-only", { count: exportOnly.length })}</h3>
      <div class="mw-settings">${exportRows}</div>
    </section>
    <section class="sessions-scope-group">
      <h3>${uiText("workbench.sessions.group-unsupported", { count: unsupported.length })}</h3>
      <details><summary class="sessions-scope-hint">${uiText("workbench.sessions.show-unsupported")}</summary><div class="mw-settings">${unsupRows}</div></details>
    </section>`;
}

function renderAiPanel(rows: readonly ExternalSessionProjectAiRead[], filter: string, notes: ReadonlyMap<string, MwPermitNote>): string {
  const needle = filter.trim().toLowerCase();
  const visible = needle ? rows.filter((r) => r.project.display_name.toLowerCase().includes(needle)) : rows;
  const search = rows.length > 8
    ? `<label class="mw-input-group">${icon("search")}<input class="mw-input" type="search" data-permit-filter value="${escapeHtml(filter)}" placeholder="${uiText("workbench.sessions.filter-projects")}" aria-label="${uiText("workbench.sessions.filter-projects")}"></label>`
    : "";
  const list = visible.map((row) => {
    const pid = row.project.project_id;
    const descId = `permit-desc-${pid}`;
    const desc = row.counts
      ? uiText.text("workbench.sessions.permit-counts", { readable: row.counts.ai_readable, reported: row.counts.reported })
      : uiText.text("workbench.sessions.permit-default-desc");
    const badges = row.current ? renderBadge({ label: uiText.text("workbench.sessions.current-project-badge") }) : "";
    const control = renderSwitch({ checked: row.allowed, label: row.project.display_name, attrs: { "data-permit-switch": pid, "aria-describedby": descId } });
    return renderPermitRow({ project: { id: pid, name: row.project.display_name }, badges, description: desc, descriptionId: descId, control, current: row.current, note: notes.get(pid), attrs: { "data-permit-project": pid } });
  }).join("");
  return `<p class="sessions-scope-hint">${uiText("workbench.sessions.ai-panel-intro")}</p>${search}<div class="mw-settings">${list}</div>`;
}

interface ScopeInternalState {
  scope: SessionScopeWithMeta | null;
  activeTab: ScopeTabId;
  dirMode: "linked_projects" | "all";
  permitFilter: string;
  overlayMode: boolean;
  readonly notes: Map<string, MwPermitNote>;
  readonly listeners: Array<(next: SessionScopeWithMeta) => void>;
}

async function runPermitToggle(dlg: HTMLDialogElement, st: ScopeInternalState, pid: string, nextAllowed: boolean): Promise<void> {
  const row = st.scope?.project_ai_reads.find((r) => r.project.project_id === pid);
  if (!st.scope || !row) return;
  const setNote = (note: MwPermitNote) => {
    st.notes.set(pid, note);
    const noteEl = dlg.querySelector<HTMLElement>(`[data-permit-project="${CSS.escape(pid)}"] .mw-permit__note`);
    if (noteEl) { noteEl.dataset.kind = note.kind; noteEl.innerHTML = renderPermitNote(note); }
  };
  setNote({ kind: "saving", label: uiText.text("workbench.sessions.permit-saving") });
  try {
    const updated = await sessionsApi.projectAiReadSet(pid, { allowed: nextAllowed, expected_revision: row.revision });
    const idx = st.scope.project_ai_reads.findIndex((r) => r.project.project_id === pid);
    if (idx >= 0) (st.scope.project_ai_reads as ExternalSessionProjectAiRead[])[idx] = { ...row, ...updated, counts: row.counts };
    setNote(updated.allowed
      ? { kind: "on", status: uiText.text("workbench.sessions.permit-on"), text: uiText.text("workbench.sessions.permit-on-note") }
      : { kind: "off", status: uiText.text("workbench.sessions.permit-off"), text: uiText.text("workbench.sessions.permit-off-note") });
    const retBtn = dlg.querySelector<HTMLButtonElement>("[data-sessions-scope-return]");
    if (retBtn && st.overlayMode && pid === currentProjectId() && updated.allowed) retBtn.hidden = false;
  } catch {
    dlg.querySelector<HTMLButtonElement>(`[data-permit-switch="${CSS.escape(pid)}"]`)?.setAttribute("aria-checked", String(row.allowed));
    setNote({ kind: "failed", text: uiText.text("workbench.sessions.permit-failed"), retry: uiText.text("common.control.retry"), retryAttrs: { "data-permit-retry": pid, "data-permit-want": String(nextAllowed) } });
  }
}

async function runSaveToolsScope(dlg: HTMLDialogElement, st: ScopeInternalState, repaint: () => void): Promise<void> {
  if (!st.scope) return;
  const notice = dlg.querySelector<HTMLElement>("[data-sessions-scope-notice]");
  const directories: ExternalSessionDirectoryScope = { mode: st.dirMode };
  const prevAllowed = new Set(st.scope.sources.filter((s) => s.allowed).map((s) => s.entry_id));
  const payload = st.scope.sources.filter((s) => s.adapter === "available").map((src) => {
    const check = dlg.querySelector<HTMLInputElement>(`[data-scope-allow="${CSS.escape(src.entry_id)}"]`);
    const conn = dlg.querySelector<HTMLSelectElement>(`[data-scope-conn="${CSS.escape(src.entry_id)}"]`)?.value || src.connection_id || undefined;
    return { entry_id: src.entry_id, ...(conn ? { connection_id: conn } : {}), allowed: Boolean(check?.checked), directories };
  });
  try {
    const saved = await sessionsApi.scopeSet({ sources: payload, expected_revision: st.scope.scope_revision });
    st.scope = saved;
    if (payload.some((p) => p.allowed && !prevAllowed.has(p.entry_id))) void sessionsApi.discoveryRun({});
    if (notice) notice.textContent = uiText.text("workbench.sessions.scope-saved");
    for (const fn of st.listeners) fn(saved);
    dlg.close();
  } catch (err) {
    if ((err as { code?: string })?.code === "sessions.scope_conflict") {
      st.scope = await sessionsApi.scopeRead(true);
      repaint();
      if (notice) notice.textContent = uiText.text("workbench.sessions.scope-conflict-reloaded");
    } else if (notice) {
      notice.textContent = (err as Error)?.message || uiText.text("workbench.sessions.scope-save-failed");
    }
  }
}

function bindScopeDialogEvents(dlg: HTMLDialogElement, st: ScopeInternalState, syncTabs: () => void, paint: () => void): void {
  dlg.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("[data-sessions-scope-close], [data-sessions-scope-return]")) { dlg.close(); return; }
    const tabBtn = target.closest<HTMLElement>("[data-sessions-scope-tab]");
    if (tabBtn?.dataset.sessionsScopeTab) { st.activeTab = tabBtn.dataset.sessionsScopeTab as ScopeTabId; syncTabs(); return; }
    if (target.closest("[data-sessions-scope-save]")) { void runSaveToolsScope(dlg, st, paint); return; }
    const copyBtn = target.closest<HTMLElement>("[data-scope-copy]");
    if (copyBtn?.dataset.scopeCopy) { void copyPlainText(copyBtn.dataset.scopeCopy); return; }
    const sw = target.closest<HTMLButtonElement>("[data-permit-switch]");
    if (sw?.dataset.permitSwitch) {
      const next = sw.getAttribute("aria-checked") !== "true";
      sw.setAttribute("aria-checked", String(next));
      void runPermitToggle(dlg, st, sw.dataset.permitSwitch, next);
      return;
    }
    const retry = target.closest<HTMLElement>("[data-permit-retry]");
    if (retry?.dataset.permitRetry) void runPermitToggle(dlg, st, retry.dataset.permitRetry, retry.dataset.permitWant === "true");
  });
  dlg.addEventListener("change", (e) => { const inp = e.target as HTMLInputElement | null; if (inp?.name === "sessions-dir-mode") st.dirMode = inp.value === "all" ? "all" : "linked_projects"; });
  dlg.addEventListener("input", (e) => {
    const inp = e.target as HTMLInputElement | null;
    if (inp?.hasAttribute("data-permit-filter") && st.scope) {
      st.permitFilter = inp.value;
      const aiEl = dlg.querySelector<HTMLElement>('[data-sessions-scope-panel="project_ai_read"]');
      if (aiEl) aiEl.innerHTML = renderAiPanel(st.scope.project_ai_reads, st.permitFilter, st.notes);
    }
  });
}

export function createSessionsScopeSheet(): ScopeSheetController {
  const st: ScopeInternalState = { scope: null, activeTab: "tools", dirMode: "linked_projects", permitFilter: "", overlayMode: false, notes: new Map(), listeners: [] };
  let wired = false;
  const dialog = () => document.querySelector<HTMLDialogElement>("[data-sessions-scope-sheet]");

  const syncTabs = () => {
    const dlg = dialog();
    if (!dlg) return;
    dlg.querySelectorAll<HTMLButtonElement>("[data-sessions-scope-tab]").forEach((btn) => {
      const on = btn.dataset.sessionsScopeTab === st.activeTab;
      btn.classList.toggle("is-current", on);
      btn.setAttribute("aria-selected", String(on));
    });
    dlg.querySelectorAll<HTMLElement>("[data-sessions-scope-panel]").forEach((p) => { p.hidden = p.dataset.sessionsScopePanel !== st.activeTab; });
    const saveBtn = dlg.querySelector<HTMLButtonElement>("[data-sessions-scope-save]");
    if (saveBtn) saveBtn.hidden = st.activeTab !== "tools";
  };

  const paint = () => {
    const dlg = dialog();
    if (!dlg || !st.scope) return;
    const toolsEl = dlg.querySelector<HTMLElement>('[data-sessions-scope-panel="tools"]');
    const aiEl = dlg.querySelector<HTMLElement>('[data-sessions-scope-panel="project_ai_read"]');
    if (toolsEl) toolsEl.innerHTML = renderToolsPanel(st.scope, st.dirMode);
    if (aiEl) aiEl.innerHTML = renderAiPanel(st.scope.project_ai_reads, st.permitFilter, st.notes);
    syncTabs();
  };

  return {
    async open(tab = "tools", options = {}) {
      const dlg = dialog();
      if (!dlg) return;
      if (!wired) { wired = true; bindScopeDialogEvents(dlg, st, syncTabs, paint); }
      st.activeTab = tab;
      st.overlayMode = Boolean(options.overlay);
      dlg.querySelector<HTMLButtonElement>("[data-sessions-scope-return]")?.setAttribute("hidden", "");
      const notice = dlg.querySelector<HTMLElement>("[data-sessions-scope-notice]");
      if (notice) notice.textContent = "";
      st.scope = await sessionsApi.scopeRead(true);
      st.dirMode = st.scope.sources.find((s) => s.allowed)?.directories.mode ?? "linked_projects";
      paint();
      if (!dlg.open) dlg.showModal();
      if (tab === "project_ai_read") requestAnimationFrame(() => dlg.querySelector<HTMLElement>(".mw-permit.is-current [data-permit-switch]")?.focus());
    },
    onSaved(listener) { st.listeners.push(listener); },
  };
}
