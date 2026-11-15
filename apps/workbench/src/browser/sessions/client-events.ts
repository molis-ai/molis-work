import type { ProjectSelection } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ExternalSessionRow, ExternalSessionSource } from "@molis-ai/molis-work-contracts/services/sessions";
import { copyPlainText, sessionsApi } from "./api.js";
import { populateAttributionDialog, type DetailViewState } from "./detail-view.js";

const uiText = globalThis.t;

export type SessionsViewMode = "project" | "all" | "unfiled";

export interface SessionsClientPorts {
  readonly root: HTMLElement;
  readonly detailEl: HTMLElement;
  readonly droidHint: HTMLElement;
  readonly toolSelect: HTMLSelectElement;
  readonly searchInput: HTMLInputElement;
  readonly attrDialog: HTMLDialogElement | null;
  getView(): SessionsViewMode;
  setView(next: SessionsViewMode): void;
  getToolFilter(): string;
  setToolFilter(next: string): void;
  getSearchQuery(): string;
  setSearchQuery(next: string): void;
  getRows(): readonly ExternalSessionRow[];
  setDroidRows(next: ExternalSessionRow[] | null): void;
  getSources(): readonly ExternalSessionSource[];
  getProjects(): readonly ProjectSelection[];
  getDetailState(): DetailViewState | null;
  setDirtyChoice(sessionKey: string, projectId: string): void;
  loadList(withSuggest?: boolean): Promise<void>;
  paintList(): void;
  openSession(sessionKey: string, query?: string): Promise<void>;
  clearDetail(): void;
  loadEarlier(): Promise<void>;
  applyAttribution(
    row: ExternalSessionRow,
    decision: { kind: "project"; project_id: string; suggestion_accepted?: boolean } | { kind: "leave_unfiled" } | { kind: "clear" },
  ): Promise<void>;
  kickPoller(): void;
  toast(msg: string, isError?: boolean): void;
}

function handleSurfaceClick(ports: SessionsClientPorts, target: HTMLElement): void {
  const viewBtn = target.closest<HTMLElement>("[data-sessions-view]");
  if (viewBtn?.dataset.sessionsView) {
    ports.setView(viewBtn.dataset.sessionsView as SessionsViewMode);
    ports.setDroidRows(null);
    void ports.loadList();
    return;
  }
  if (target.closest("[data-sessions-refresh]")) {
    void sessionsApi.discoveryRun({}).then(() => { ports.kickPoller(); return ports.loadList(); });
    return;
  }
  if (target.closest("[data-sessions-droid-run]")) {
    const src = ports.getSources().find((s) => s.entry_id === ports.getToolFilter() && s.location_key);
    const q = ports.getSearchQuery().trim();
    if (!src?.location_key || !q) return;
    void sessionsApi.toolSearch({ entry_id: src.entry_id, location_key: src.location_key, query: q }).then((res) => {
      ports.setDroidRows(res.sessions);
      ports.droidHint.textContent = res.skipped_count > 0
        ? uiText.text("workbench.sessions.droid-skipped", { count: res.skipped_count })
        : uiText.text("workbench.sessions.droid-matched", { count: res.sessions.length });
      ports.paintList();
    });
    return;
  }
  const fileBtn = target.closest<HTMLElement>("[data-unfiled-file]");
  if (fileBtn?.dataset.unfiledFile) {
    const key = fileBtn.dataset.unfiledFile;
    const row = ports.getRows().find((r) => r.session_key === key);
    const card = ports.root.querySelector<HTMLElement>(`[data-unfiled-card="${CSS.escape(key)}"]`);
    const chosen = ports.root.querySelector<HTMLSelectElement>(`[data-unfiled-select="${CSS.escape(key)}"]`)?.value;
    if (row && chosen) void ports.applyAttribution(row, { kind: "project", project_id: chosen, suggestion_accepted: card?.dataset.suggestedProject === chosen });
    return;
  }
  const keepBtn = target.closest<HTMLElement>("[data-unfiled-keep]");
  if (keepBtn?.dataset.unfiledKeep) {
    const row = ports.getRows().find((r) => r.session_key === keepBtn.dataset.unfiledKeep);
    if (row) void ports.applyAttribution(row, { kind: "leave_unfiled" });
    return;
  }
  const rowBtn = target.closest<HTMLElement>("[data-session-key]");
  if (rowBtn?.dataset.sessionKey) { void ports.openSession(rowBtn.dataset.sessionKey); return; }
  if (target.closest("[data-sessions-back]")) { ports.root.dataset.expanded = "false"; return; }
  handleDetailClick(ports, target);
}

function handleDetailClick(ports: SessionsClientPorts, target: HTMLElement): void {
  const copyResume = target.closest<HTMLElement>("[data-detail-copy-resume]");
  if (copyResume?.dataset.detailCopyResume) {
    void copyPlainText(copyResume.dataset.detailCopyResume).then((ok) => {
      if (ok) ports.toast(uiText.text("workbench.sessions.copied-command"));
    });
    return;
  }
  const detail = ports.getDetailState();
  if (target.closest("[data-detail-change-attr]") && detail && ports.attrDialog) {
    populateAttributionDialog(ports.attrDialog, detail.row, ports.getProjects());
    ports.attrDialog.showModal();
    return;
  }
  const confirmBtn = target.closest<HTMLElement>("[data-detail-confirm-project]");
  if (confirmBtn?.dataset.detailConfirmProject && detail) {
    void ports.applyAttribution(detail.row, { kind: "project", project_id: confirmBtn.dataset.detailConfirmProject });
    return;
  }
  if (target.closest("[data-detail-load-earlier]")) { void ports.loadEarlier(); return; }
  if (target.closest("[data-detail-retry]") && detail) { void ports.openSession(detail.row.session_key, detail.query); return; }
  if (target.closest("[data-detail-search-run]") && detail) {
    const qVal = ports.detailEl.querySelector<HTMLInputElement>("[data-detail-query]")?.value ?? "";
    void ports.openSession(detail.row.session_key, qVal);
  }
}

export function bindSessionsClientEvents(ports: SessionsClientPorts): void {
  ports.root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target) handleSurfaceClick(ports, target);
  });

  ports.root.addEventListener("change", (event) => {
    const el = event.target as HTMLElement | null;
    if (el === ports.toolSelect) {
      ports.setToolFilter(ports.toolSelect.value);
      ports.setDroidRows(null);
      ports.droidHint.textContent = uiText.text("workbench.sessions.droid-search-hint");
      void ports.loadList();
      return;
    }
    const unfiledSel = el?.closest<HTMLSelectElement>("[data-unfiled-select]");
    if (unfiledSel?.dataset.unfiledSelect) ports.setDirtyChoice(unfiledSel.dataset.unfiledSelect, unfiledSel.value);
  });

  ports.searchInput.addEventListener("input", () => {
    ports.setSearchQuery(ports.searchInput.value);
    if (!ports.searchInput.value.trim()) ports.setDroidRows(null);
    ports.paintList();
  });

  ports.attrDialog?.querySelector("[data-sessions-attr-cancel]")?.addEventListener("click", () => ports.attrDialog?.close());
  ports.attrDialog?.querySelector("[data-sessions-attr-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const detail = ports.getDetailState();
    if (!detail || !ports.attrDialog) return;
    const val = ports.attrDialog.querySelector<HTMLSelectElement>("[data-sessions-attr-select]")?.value || "";
    const decision = val === "__unfiled__" ? { kind: "leave_unfiled" as const } : val === "__clear__" ? { kind: "clear" as const } : { kind: "project" as const, project_id: val };
    void ports.applyAttribution(detail.row, decision).then(() => ports.attrDialog?.close()).catch((err: Error) => {
      const errEl = ports.attrDialog?.querySelector<HTMLElement>("[data-sessions-attr-error]");
      if (errEl) { errEl.hidden = false; errEl.textContent = err.message; }
    });
  });

  ports.root.addEventListener("molis-work:select-item", (event) => {
    const detail = (event as CustomEvent<{ itemId?: string | null; panel?: string; invalidate?: boolean }>).detail;
    if (detail?.panel === "unfiled" || detail?.panel === "all" || detail?.panel === "project") {
      ports.setView(detail.panel);
      void ports.loadList();
    } else if (detail?.invalidate) {
      void ports.loadList();
    }
    if (detail?.itemId) void ports.openSession(detail.itemId);
    else if (detail?.itemId === null) ports.clearDetail();
  });
}
