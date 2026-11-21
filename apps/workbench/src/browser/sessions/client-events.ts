import type { ProjectSelection } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ExternalSessionRow, ExternalSessionSource } from "@molis-ai/molis-work-contracts/services/sessions";
import { copyPlainText, sessionsApi } from "./api.js";
import { populateAttributionDialog, type DetailViewState } from "./detail-view.js";
import { nextRovingTab } from "./poll.js";

const uiText = globalThis.t;

export type SessionsViewMode = "project" | "all" | "unfiled";

export interface SessionsSurfaceMutable {
  readonly root: HTMLElement;
  readonly detailEl: HTMLElement;
  readonly droidHint: HTMLElement;
  readonly toolSelect: HTMLSelectElement;
  readonly searchInput: HTMLInputElement;
  readonly attrDialog: HTMLDialogElement;
  view: SessionsViewMode;
  toolFilter: string;
  searchQuery: string;
  rows: ExternalSessionRow[];
  droidRows: ExternalSessionRow[] | null;
  sources: ExternalSessionSource[];
  projects: ProjectSelection[];
  detail: DetailViewState | null;
  readonly dirtyChoices: Map<string, string>;
}

export interface SessionsClientActions {
  loadList(withSuggest?: boolean): Promise<void>;
  retryList(): Promise<void>;
  loadPage(page: "next" | "previous"): Promise<void>;
  searchTool(): Promise<void>;
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

function handleSurfaceClick(ctx: SessionsSurfaceMutable, act: SessionsClientActions, target: HTMLElement): void {
  const page = target.closest<HTMLElement>("[data-sessions-page]")?.dataset.sessionsPage;
  if (page === "next" || page === "previous") { void act.loadPage(page); return; }
  const viewBtn = target.closest<HTMLElement>("[data-sessions-view]");
  if (viewBtn?.dataset.sessionsView) {
    ctx.view = viewBtn.dataset.sessionsView as SessionsViewMode;
    ctx.droidRows = null;
    void act.loadList();
    return;
  }
  if (target.closest("[data-sessions-retry]")) {
    void act.retryList();
    return;
  }
  if (target.closest("[data-sessions-refresh]")) {
    void sessionsApi.discoveryRun({}).then(() => { act.kickPoller(); return act.loadList(); });
    return;
  }
  if (target.closest("[data-sessions-droid-run]")) { void act.searchTool(); return; }
  const fileBtn = target.closest<HTMLElement>("[data-unfiled-file]");
  if (fileBtn?.dataset.unfiledFile) {
    const key = fileBtn.dataset.unfiledFile;
    const row = ctx.rows.find((r) => r.session_key === key);
    const card = ctx.root.querySelector<HTMLElement>(`[data-unfiled-card="${CSS.escape(key)}"]`);
    const chosen = ctx.root.querySelector<HTMLSelectElement>(`[data-unfiled-select="${CSS.escape(key)}"]`)?.value;
    if (row && chosen) void act.applyAttribution(row, { kind: "project", project_id: chosen, suggestion_accepted: card?.dataset.suggestedProject === chosen });
    return;
  }
  const keepBtn = target.closest<HTMLElement>("[data-unfiled-keep]");
  if (keepBtn?.dataset.unfiledKeep) {
    const row = ctx.rows.find((r) => r.session_key === keepBtn.dataset.unfiledKeep);
    if (row) void act.applyAttribution(row, { kind: "leave_unfiled" });
    return;
  }
  const rowBtn = target.closest<HTMLElement>("[data-session-key]");
  if (rowBtn?.dataset.sessionKey) { void act.openSession(rowBtn.dataset.sessionKey); return; }
  if (target.closest("[data-sessions-back]")) { act.clearDetail(); return; }
  handleDetailClick(ctx, act, target);
}

function handleDetailClick(ctx: SessionsSurfaceMutable, act: SessionsClientActions, target: HTMLElement): void {
  const copyResume = target.closest<HTMLElement>("[data-detail-copy-resume]");
  if (copyResume?.dataset.detailCopyResume) {
    void copyPlainText(copyResume.dataset.detailCopyResume).then((ok) => {
      if (ok) act.toast(uiText.text("workbench.sessions.copied-command"));
    });
    return;
  }
  const detail = ctx.detail;
  if (target.closest("[data-detail-change-attr]") && detail) {
    populateAttributionDialog(ctx.attrDialog, detail.row, ctx.projects);
    ctx.attrDialog.showModal();
    return;
  }
  const confirmBtn = target.closest<HTMLElement>("[data-detail-confirm-project]");
  if (confirmBtn?.dataset.detailConfirmProject && detail) {
    void act.applyAttribution(detail.row, { kind: "project", project_id: confirmBtn.dataset.detailConfirmProject });
    return;
  }
  if (target.closest("[data-detail-load-earlier]")) { void act.loadEarlier(); return; }
  if (target.closest("[data-detail-retry]") && detail) { void act.openSession(detail.row.session_key, detail.query); return; }
  if (target.closest("[data-detail-search-run]") && detail) {
    void act.openSession(detail.row.session_key, ctx.detailEl.querySelector<HTMLInputElement>("[data-detail-query]")?.value ?? "");
  }
}

export function bindSessionsClientEvents(ctx: SessionsSurfaceMutable, act: SessionsClientActions): void {
  ctx.root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target) handleSurfaceClick(ctx, act, target);
  });

  ctx.root.addEventListener("change", (event) => {
    const el = event.target as HTMLElement | null;
    if (el === ctx.toolSelect) {
      ctx.toolFilter = ctx.toolSelect.value;
      ctx.droidRows = null;
      ctx.droidHint.textContent = uiText.text("workbench.sessions.droid-search-hint");
      void act.loadList();
      return;
    }
    const unfiledSel = el?.closest<HTMLSelectElement>("[data-unfiled-select]");
    if (unfiledSel?.dataset.unfiledSelect) ctx.dirtyChoices.set(unfiledSel.dataset.unfiledSelect, unfiledSel.value);
  });

  ctx.root.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (event.key === "Enter" && target.hasAttribute("data-detail-query")) {
      event.preventDefault();
      if (ctx.detail) void act.openSession(ctx.detail.row.session_key, (target as HTMLInputElement).value);
      return;
    }
    if (event.key === "Enter" && target === ctx.searchInput && !ctx.root.querySelector<HTMLElement>("[data-sessions-droid-bar]")?.hidden) {
      event.preventDefault();
      void act.searchTool();
      return;
    }
    const tabBtn = target.closest<HTMLButtonElement>("[data-sessions-view]");
    const next = tabBtn && nextRovingTab([...ctx.root.querySelectorAll<HTMLButtonElement>("[data-sessions-view]")], tabBtn, event.key);
    if (next?.dataset.sessionsView) {
      event.preventDefault();
      ctx.view = next.dataset.sessionsView as SessionsViewMode;
      ctx.droidRows = null;
      void act.loadList();
      next.focus();
    }
  });

  ctx.searchInput.addEventListener("input", () => {
    ctx.searchQuery = ctx.searchInput.value;
    ctx.droidRows = null;
    void act.loadList();
  });

  ctx.attrDialog.querySelector("[data-sessions-attr-cancel]")?.addEventListener("click", () => ctx.attrDialog.close());
  ctx.attrDialog.querySelector("[data-sessions-attr-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!ctx.detail) return;
    const val = ctx.attrDialog.querySelector<HTMLSelectElement>("[data-sessions-attr-select]")?.value || "";
    const decision = val === "__unfiled__" ? { kind: "leave_unfiled" as const } : val === "__clear__" ? { kind: "clear" as const } : { kind: "project" as const, project_id: val };
    void act.applyAttribution(ctx.detail.row, decision).then(() => ctx.attrDialog.close()).catch((err: Error) => {
      const errEl = ctx.attrDialog.querySelector<HTMLElement>("[data-sessions-attr-error]");
      if (errEl) { errEl.hidden = false; errEl.textContent = err.message; }
    });
  });

  ctx.root.addEventListener("molis-work:select-item", (event) => {
    const d = (event as CustomEvent<{ itemId?: string | null; panel?: string; invalidate?: boolean }>).detail;
    if (d?.panel === "unfiled" || d?.panel === "all" || d?.panel === "project") {
      ctx.view = d.panel;
      void act.loadList();
    } else if (d?.invalidate) {
      void act.loadList();
    }
    if (d?.itemId) void act.openSession(d.itemId);
    else if (d?.itemId === null) act.clearDetail();
  });
}
