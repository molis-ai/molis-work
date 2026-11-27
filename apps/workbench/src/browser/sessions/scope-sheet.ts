import { escapeHtml, icon, renderBadge, renderSwitch } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderPermitNote, renderPermitRow, type MwPermitNote } from "@molis-ai/molis-work-design-system/session-sources";
import type { ExternalSessionDirectoryScope, ExternalSessionProjectAiRead, ExternalSessionScopeSource } from "@molis-ai/molis-work-contracts/services/sessions";
import { copyPlainText, currentProjectId, sessionsApi, type SessionScopeWithMeta, type SessionToolMeta } from "./api.js";
import { nextRovingTab } from "./poll.js";

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
        ? `<a class="mw-btn mw-btn--secondary mw-btn--sm" href="/settings/connectors?connector=${encodeURIComponent(src.connect_service_id)}" data-scope-go-connect>${uiText("workbench.sessions.go-connect-settings")}</a>`
        : `<span class="mw-badge">${uiText("workbench.sessions.no-connection")}</span>`
      : `<select class="mw-input" data-scope-conn="${id}" aria-label="${escapeHtml(meta.display_name)}">${conns.map((c) =>
        `<option value="${escapeHtml(c.connection_id)}"${c.connection_id === chosenConn ? " selected" : ""}>${escapeHtml(c.account_label ? `${c.display_name} (${c.account_label})` : c.display_name)}</option>`).join("")}</select>`
    : "";
  return `<div class="sessions-tool-row" data-scope-tool="${id}"><label class="sessions-tool-main"><input class="mw-check" type="checkbox" data-scope-allow="${id}"${checked ? " checked" : ""}${noConn ? " disabled" : ""}><span class="sessions-tool-copy"><strong>${escapeHtml(meta.display_name)}</strong><small>${escapeHtml(meta.vendor)} · ${uiText(isCloud ? "workbench.sessions.surface-cloud" : "workbench.sessions.surface-local")}</small></span></label><div class="sessions-tool-side">${side}</div></div>`;
}

function selectedToolSources(scope: SessionScopeWithMeta): Map<string, ExternalSessionScopeSource> {
  const selected = new Map<string, ExternalSessionScopeSource>();
  for (const source of scope.sources) {
    const previous = selected.get(source.entry_id);
    if (!previous?.allowed || source.allowed) selected.set(source.entry_id, source);
  }
  return selected;
}

function renderToolsPanel(scope: SessionScopeWithMeta, dirMode: "linked_projects" | "all"): string {
  const byId = selectedToolSources(scope);
  const connected = scope.tool_meta.filter((m) => m.group === "connected");
  const exportOnly = scope.tool_meta.filter((m) => m.group === "export_only");
  const unsupported = scope.tool_meta.filter((m) => m.group === "unsupported");
  const exportRows = exportOnly.map((m) => `<div class="sessions-tool-row"><div class="sessions-tool-copy"><strong>${escapeHtml(m.display_name)}</strong><small>${uiText("workbench.sessions.export-only-note")}</small>${m.export_command ? `<code>${escapeHtml(m.export_command)}</code>` : ""}</div>${m.export_command ? `<button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-scope-copy="${escapeHtml(m.export_command)}">${icon("copy")}<span>${uiText("workbench.sessions.copy-command")}</span></button>` : ""}</div>`).join("");
  const unsupRows = unsupported.map((m) => `<div class="sessions-tool-row"><div class="sessions-tool-copy"><strong>${escapeHtml(m.display_name)}</strong><small>${escapeHtml(m.vendor)}</small></div>${renderBadge({ label: uiText.text(m.unsupported_kind === "not_open" ? "workbench.sessions.gap-not-open" : "workbench.sessions.gap-pending") })}</div>`).join("");
  return `<section class="sessions-scope-group"><h3>${uiText("workbench.sessions.dir-scope-heading")}</h3><div class="mw-permits"><label class="sessions-tool-row"><span class="sessions-tool-main"><input type="radio" name="sessions-dir-mode" value="linked_projects"${dirMode === "linked_projects" ? " checked" : ""}><span class="sessions-tool-copy"><strong>${uiText("workbench.sessions.dir-linked-only")}</strong><small>${uiText("workbench.sessions.dir-linked-hint")}</small></span></span></label><label class="sessions-tool-row"><span class="sessions-tool-main"><input type="radio" name="sessions-dir-mode" value="all"${dirMode === "all" ? " checked" : ""}><span class="sessions-tool-copy"><strong>${uiText("workbench.sessions.dir-all")}</strong><small>${uiText("workbench.sessions.dir-all-hint")}</small></span></span></label></div><p class="sessions-scope-hint">${uiText("workbench.sessions.worktree-scope-note")}</p></section><section class="sessions-scope-group"><h3>${uiText("workbench.sessions.group-connected", { count: connected.length })}</h3><div class="mw-permits">${connected.map((m) => renderConnectedRow(m, byId.get(m.id as never))).join("")}</div></section><section class="sessions-scope-group"><h3>${uiText("workbench.sessions.group-export-only", { count: exportOnly.length })}</h3><div class="mw-permits">${exportRows}</div></section><section class="sessions-scope-group"><h3>${uiText("workbench.sessions.group-unsupported", { count: unsupported.length })}</h3><details><summary class="sessions-scope-hint">${uiText("workbench.sessions.show-unsupported")}</summary><div class="mw-permits">${unsupRows}</div></details></section>`;
}

function renderAiPermitRows(
  rows: readonly ExternalSessionProjectAiRead[],
  filter: string,
  notes: ReadonlyMap<string, MwPermitNote>,
  pendingPermits?: ReadonlySet<string>,
): string {
  const needle = filter.trim().toLowerCase();
  const visible = needle ? rows.filter((r) => r.project.display_name.toLowerCase().includes(needle)) : rows;
  return visible.map((row) => {
    const pid = row.project.project_id;
    const descId = `permit-desc-${pid}`;
    const blockedTotal = row.counts ? row.counts.blocked.reduce((sum, item) => sum + item.count, 0) : 0;
    const desc = row.counts
      ? uiText.text("workbench.sessions.permit-counts", { filed: row.counts.filed, readable: row.counts.ai_readable, reported: row.counts.reported, blocked: blockedTotal })
      : uiText.text("workbench.sessions.permit-default-desc");
    const blocked = row.counts && row.counts.blocked.length > 0
      ? `<p class="sessions-scope-hint">${escapeHtml(uiText.text("workbench.sessions.permit-blocked-tools", { tools: row.counts.blocked.map(item => `${item.display_name} ${item.count}`).join(uiText.text("common.list.separator")) }))}</p>`
      : "";
    const badges = row.current ? renderBadge({ label: uiText.text("workbench.sessions.current-project-badge") }) : "";
    const control = renderSwitch({ checked: row.allowed, disabled: Boolean(pendingPermits?.has(pid)), label: row.project.display_name, attrs: { "data-permit-switch": pid, "aria-describedby": descId } });
    return renderPermitRow({ project: { id: pid, name: row.project.display_name }, badges, description: desc, descriptionId: descId, control, current: row.current, note: notes.get(pid), attrs: { "data-permit-project": pid } }) + blocked;
  }).join("");
}

function renderAiPanel(
  rows: readonly ExternalSessionProjectAiRead[],
  filter: string,
  notes: ReadonlyMap<string, MwPermitNote>,
  pendingPermits?: ReadonlySet<string>,
): string {
  const search = rows.length > 8
    ? `<label class="mw-input-group">${icon("search")}<input class="mw-input" type="search" data-permit-filter value="${escapeHtml(filter)}" placeholder="${uiText("workbench.sessions.filter-projects")}" aria-label="${uiText("workbench.sessions.filter-projects")}"></label>`
    : "";
  return `<p class="sessions-scope-hint">${uiText("workbench.sessions.ai-panel-intro")}</p>${search}<div class="mw-permits">${renderAiPermitRows(rows, filter, notes, pendingPermits)}</div>`;
}

interface ScopeInternalState {
  scope: SessionScopeWithMeta | null;
  activeTab: ScopeTabId;
  dirMode: "linked_projects" | "all";
  dirDirty: boolean;
  permitFilter: string;
  overlayMode: boolean;
  readonly notes: Map<string, MwPermitNote>;
  readonly pendingPermits: Set<string>;
  readonly listeners: Array<(next: SessionScopeWithMeta) => void>;
}

async function runPermitToggle(dlg: HTMLDialogElement, st: ScopeInternalState, pid: string, nextAllowed: boolean): Promise<void> {
  const scope = st.scope;
  const row = scope?.project_ai_reads.find((r) => r.project.project_id === pid);
  if (!scope || !row) return;
  const switchEl = () => dlg.querySelector<HTMLInputElement>(`[data-permit-switch="${CSS.escape(pid)}"]`);
  if (st.pendingPermits.has(pid)) {
    const sw = switchEl();
    if (sw) sw.checked = row.allowed;
    return;
  }
  st.pendingPermits.add(pid);
  const initialSw = switchEl();
  if (initialSw) {
    initialSw.checked = nextAllowed;
    initialSw.disabled = true;
  }
  const setNote = (note: MwPermitNote) => {
    st.notes.set(pid, note);
    const noteEl = dlg.querySelector<HTMLElement>(`[data-permit-project="${CSS.escape(pid)}"] .mw-permit__note`);
    if (noteEl) { noteEl.dataset.kind = note.kind; noteEl.innerHTML = renderPermitNote(note); }
  };
  setNote({ kind: "saving", label: uiText.text("workbench.sessions.permit-saving") });
  try {
    const updated = await sessionsApi.projectAiReadSet(pid, { allowed: nextAllowed, expected_revision: row.revision });
    if (st.scope === scope) {
      const idx = scope.project_ai_reads.findIndex((r) => r.project.project_id === pid);
      if (idx >= 0) (scope.project_ai_reads as ExternalSessionProjectAiRead[])[idx] = { ...row, ...updated, counts: row.counts };
    }
    const currentSw = switchEl();
    if (currentSw) currentSw.checked = updated.allowed;
    setNote(updated.allowed
      ? { kind: "on", status: uiText.text("workbench.sessions.permit-on"), text: uiText.text("workbench.sessions.permit-on-note") }
      : { kind: "off", status: uiText.text("workbench.sessions.permit-off"), text: uiText.text("workbench.sessions.permit-off-note") });
    const retBtn = dlg.querySelector<HTMLButtonElement>("[data-sessions-scope-return]");
    if (retBtn && st.overlayMode && pid === currentProjectId() && updated.allowed) retBtn.hidden = false;
  } catch {
    const currentSw = switchEl();
    if (currentSw) currentSw.checked = row.allowed;
    setNote({ kind: "failed", text: uiText.text("workbench.sessions.permit-failed"), retry: uiText.text("common.control.retry"), retryAttrs: { "data-permit-retry": pid, "data-permit-want": String(nextAllowed) } });
  } finally {
    st.pendingPermits.delete(pid);
    const currentSw = switchEl();
    if (currentSw) currentSw.disabled = false;
  }
}

async function runSaveToolsScope(dlg: HTMLDialogElement, st: ScopeInternalState, repaint: () => void): Promise<void> {
  if (!st.scope) return;
  const notice = dlg.querySelector<HTMLElement>("[data-sessions-scope-notice]");
  const payload = [...selectedToolSources(st.scope).values()].filter((s) => s.adapter === "available").map((src) => {
    const check = dlg.querySelector<HTMLInputElement>(`[data-scope-allow="${CSS.escape(src.entry_id)}"]`);
    const rawConn = dlg.querySelector<HTMLSelectElement>(`[data-scope-conn="${CSS.escape(src.entry_id)}"]`)?.value || src.connection_id || "";
    const conn = src.connections.some((c) => c.connection_id === rawConn) ? rawConn : undefined;
    const directories: ExternalSessionDirectoryScope = st.dirDirty ? { mode: st.dirMode } : src.directories;
    return { entry_id: src.entry_id, ...(conn ? { connection_id: conn } : {}), allowed: Boolean(check?.checked), directories };
  });
  try {
    const saved = await sessionsApi.scopeSet({ sources: payload, expected_revision: st.scope.scope_revision });
    st.scope = saved;
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
    if (target.closest("[data-sessions-scope-close], [data-sessions-scope-return], [data-scope-go-connect]")) { dlg.close(); return; }
    const tabBtn = target.closest<HTMLElement>("[data-sessions-scope-tab]");
    if (tabBtn?.dataset.sessionsScopeTab) { st.activeTab = tabBtn.dataset.sessionsScopeTab as ScopeTabId; syncTabs(); return; }
    if (target.closest("[data-sessions-scope-save]")) { void runSaveToolsScope(dlg, st, paint); return; }
    const copyBtn = target.closest<HTMLElement>("[data-scope-copy]");
    if (copyBtn?.dataset.scopeCopy) { void copyPlainText(copyBtn.dataset.scopeCopy); return; }
    const retry = target.closest<HTMLElement>("[data-permit-retry]");
    if (retry?.dataset.permitRetry) void runPermitToggle(dlg, st, retry.dataset.permitRetry, retry.dataset.permitWant === "true");
  });
  dlg.addEventListener("keydown", (event) => {
    const tabBtn = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-sessions-scope-tab]");
    const next = tabBtn && nextRovingTab([...dlg.querySelectorAll<HTMLButtonElement>("[data-sessions-scope-tab]")], tabBtn, event.key);
    if (next?.dataset.sessionsScopeTab) { event.preventDefault(); st.activeTab = next.dataset.sessionsScopeTab as ScopeTabId; syncTabs(); next.focus(); }
  });
  dlg.addEventListener("change", (e) => {
    const inp = e.target as HTMLInputElement | null;
    if (!inp) return;
    if (inp.name === "sessions-dir-mode") { st.dirMode = inp.value === "all" ? "all" : "linked_projects"; st.dirDirty = true; return; }
    if (inp.dataset.permitSwitch) void runPermitToggle(dlg, st, inp.dataset.permitSwitch, inp.checked);
  });
  dlg.addEventListener("input", (e) => {
    const inp = e.target as HTMLInputElement | null;
    if (inp?.hasAttribute("data-permit-filter") && st.scope) {
      st.permitFilter = inp.value;
      const listEl = dlg.querySelector<HTMLElement>('[data-sessions-scope-panel="project_ai_read"] .mw-permits');
      if (listEl) listEl.innerHTML = renderAiPermitRows(st.scope.project_ai_reads, st.permitFilter, st.notes, st.pendingPermits);
    }
  });
}

export function createSessionsScopeSheet(): ScopeSheetController {
  const st: ScopeInternalState = { scope: null, activeTab: "tools", dirMode: "linked_projects", dirDirty: false, permitFilter: "", overlayMode: false, notes: new Map(), pendingPermits: new Set(), listeners: [] };
  let wired = false;
  const dialog = () => document.querySelector<HTMLDialogElement>("[data-sessions-scope-sheet]");

  const syncTabs = () => {
    const dlg = dialog();
    if (!dlg) return;
    dlg.querySelectorAll<HTMLButtonElement>("[data-sessions-scope-tab]").forEach((btn) => {
      const on = btn.dataset.sessionsScopeTab === st.activeTab;
      btn.classList.toggle("is-current", on);
      btn.setAttribute("aria-selected", String(on));
      btn.tabIndex = on ? 0 : -1;
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
    if (aiEl) aiEl.innerHTML = renderAiPanel(st.scope.project_ai_reads, st.permitFilter, st.notes, st.pendingPermits);
    syncTabs();
  };

  return {
    async open(tab = "tools", options = {}) {
      const dlg = dialog();
      if (!dlg) return;
      if (!wired) { wired = true; bindScopeDialogEvents(dlg, st, syncTabs, paint); }
      st.activeTab = tab;
      st.overlayMode = Boolean(options.overlay);
      st.dirDirty = false;
      dlg.querySelector<HTMLButtonElement>("[data-sessions-scope-return]")?.setAttribute("hidden", "");
      const notice = dlg.querySelector<HTMLElement>("[data-sessions-scope-notice]");
      if (notice) notice.textContent = "";
      st.scope = await sessionsApi.scopeRead(true);
      const refDir = (st.scope.sources.find((s) => s.allowed) ?? st.scope.sources[0])?.directories.mode;
      st.dirMode = refDir === "all" ? "all" : "linked_projects";
      paint();
      if (!dlg.open) dlg.showModal();
      if (tab === "project_ai_read") requestAnimationFrame(() => dlg.querySelector<HTMLElement>(".mw-permit.is-current [data-permit-switch]")?.focus());
    },
    onSaved(listener) { st.listeners.push(listener); },
  };
}
