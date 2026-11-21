import { escapeHtml, renderBadge } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ExternalSessionRow, ExternalSessionSuggestion } from "@molis-ai/molis-work-contracts/services/sessions";
import { currentProjectId, formatActivityTime, sessionsApi, type SessionScopeWithMeta, type SessionToolMeta } from "./api.js";
import { createDiscoveryPoller, type DiscoveryPoller } from "./poll.js";
import { bindSourcesEvents, renderSourcesSection } from "./sources-bar.js";
import { pickSuggestBatchKeys, renderUnfiledList } from "./unfiled-view.js";
import { ensureAttributionDialog, renderDetailPane } from "./detail-view.js";
import { bindSessionsClientEvents, type SessionsSurfaceMutable } from "./client-events.js";
import type { ScopeSheetController } from "./scope-sheet.js";

const uiText = globalThis.t;

interface SurfaceCtx extends SessionsSurfaceMutable {
  readonly sourcesEl: HTMLElement;
  readonly bodyEl: HTMLElement;
  readonly detailEmptyEl: HTMLElement;
  readonly droidBar: HTMLElement;
  readonly unfiledBadge: HTMLElement;
  poller: DiscoveryPoller;
  sourcesExpanded: boolean;
  toolMeta: readonly SessionToolMeta[];
  selectedKey: string | null;
  listRead: { controller: AbortController; state: "loading" | "ready" | "failed"; errorMessage?: string } | null;
  pageCursors: Array<string | null>;
  nextCursor: string | null;
  showError(message: string): void;
  detailSeq: number;
  readonly liveSuggestions: Map<string, ExternalSessionSuggestion>;
}

function renderSessionRows(rows: readonly ExternalSessionRow[], selectedKey: string | null, showProjectBadge: boolean): string {
  const items = rows.map((row) => {
    const title = row.title?.trim() || row.tool.display_name;
    const active = row.session_key === selectedKey ? " is-selected" : "";
    const projBadge = showProjectBadge && (row.attribution.state === "confirmed" || row.attribution.state === "automatic" || row.attribution.state === "reported")
      ? renderBadge({ label: row.attribution.project.display_name })
      : row.attribution.state === "unfiled"
        ? renderBadge({ label: uiText.text("workbench.sessions.view-unfiled") })
        : "";
    return `<button class="sessions-row${active}" type="button" role="listitem" data-session-key="${escapeHtml(row.session_key)}"><span class="sessions-row-head"><span class="sessions-row-title">${escapeHtml(title)}</span><time class="sessions-row-time">${escapeHtml(formatActivityTime(row.last_activity_at))}</time></span><span class="sessions-row-meta"><span>${escapeHtml(row.tool.display_name)}</span>${projBadge}${row.directory ? `<span class="sessions-row-dir">${escapeHtml(row.directory)}</span>` : ""}</span></button>`;
  }).join("");
  return `<div class="sessions-row-list" role="list">${items}</div>`;
}

function paintSurfaceList(ctx: SurfaceCtx): void {
  ctx.root.querySelectorAll<HTMLButtonElement>("[data-sessions-view]").forEach((btn) => {
    const on = btn.dataset.sessionsView === ctx.view;
    btn.classList.toggle("is-current", on);
    btn.setAttribute("aria-selected", String(on));
    btn.tabIndex = on ? 0 : -1;
  });
  ctx.bodyEl.setAttribute("aria-labelledby", `sessions-tab-${ctx.view}`);
  ctx.droidBar.hidden = !ctx.toolMeta.find((m) => m.id === ctx.toolFilter)?.can_tool_search;
  renderSourcesSection(ctx.sourcesEl, ctx.sources, ctx.sourcesExpanded);
  if (ctx.listRead?.state === "failed" && ctx.rows.length === 0) {
    const message = ctx.listRead.errorMessage || uiText.text("workbench.sessions.read-failed");
    ctx.bodyEl.innerHTML = `<div class="mw-empty mw-empty--error" role="alert"><p>${escapeHtml(message)}</p><div><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-sessions-retry>${uiText("common.control.retry")}</button></div></div>`;
    return;
  }
  if (!ctx.sources.some((s) => s.state !== "not_allowed" && s.state !== "unsupported")) {
    ctx.bodyEl.innerHTML = `<div class="sessions-empty-card"><strong>${uiText("workbench.sessions.onboarding-title")}</strong><span>${uiText("workbench.sessions.onboarding-body")}</span><div><button class="mw-btn mw-btn--primary mw-btn--sm" type="button" data-sessions-open-scope="tools">${uiText("workbench.sessions.choose-read-scope")}</button></div></div>`;
    return;
  }
  const shown = ctx.droidRows ?? ctx.rows;
  if (ctx.view === "unfiled") {
    ctx.bodyEl.innerHTML = renderUnfiledList({ rows: shown, projects: ctx.projects, dirtyChoices: ctx.dirtyChoices, liveSuggestions: ctx.liveSuggestions, selectedKey: ctx.selectedKey });
  } else ctx.bodyEl.innerHTML = shown.length === 0
    ? `<div class="sessions-empty-card"><strong>${uiText("workbench.sessions.empty-list-title")}</strong><span>${uiText("workbench.sessions.empty-list-body")}</span></div>`
    : renderSessionRows(shown, ctx.selectedKey, ctx.view === "all");
  if (!ctx.droidRows && (ctx.pageCursors.length > 1 || ctx.nextCursor)) {
    const busy = ctx.listRead?.state === "loading";
    ctx.bodyEl.innerHTML += `<div class="sessions-head-actions"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-sessions-page="previous"${busy || ctx.pageCursors.length === 1 ? " disabled" : ""}>${uiText("workbench.sessions.previous-page")}</button><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-sessions-page="next"${busy || !ctx.nextCursor ? " disabled" : ""}>${uiText("workbench.sessions.next-page")}</button></div>`;
  }
}

function applySurfaceScopeMeta(ctx: SurfaceCtx, sc: SessionScopeWithMeta): void {
    ctx.toolMeta = sc.tool_meta;
    ctx.projects = sc.project_ai_reads.map((r) => r.project);
    ctx.toolSelect.innerHTML = `<option value="">${uiText("workbench.sessions.all-tools")}</option>` + ctx.toolMeta.filter((m) => m.group === "connected")
      .map((m) => `<option value="${escapeHtml(m.id)}"${m.id === ctx.toolFilter ? " selected" : ""}>${escapeHtml(m.display_name)}</option>`).join("");
}

async function loadSurfaceScopeMeta(ctx: SurfaceCtx): Promise<void> {
  try {
    applySurfaceScopeMeta(ctx, await sessionsApi.scopeRead(false));
  } catch { /* list still loads */ }
}

async function loadSurfaceList(ctx: SurfaceCtx, withSuggest = true, page: "reset" | "refresh" | "next" | "previous" = "reset"): Promise<void> {
  if (page === "next" && !ctx.nextCursor || page === "previous" && ctx.pageCursors.length === 1) return;
  const pageCursors = page === "reset" ? [null] : page === "next" ? [...ctx.pageCursors, ctx.nextCursor]
    : page === "previous" ? ctx.pageCursors.slice(0, -1) : ctx.pageCursors;
  if (page === "reset") { ctx.pageCursors = [null]; ctx.nextCursor = null; }
  ctx.listRead?.controller.abort();
  const read: NonNullable<SurfaceCtx["listRead"]> = { controller: new AbortController(), state: "loading" };
  ctx.listRead = read;
  paintSurfaceList(ctx);
  try {
    const query = ctx.searchQuery.trim();
    const out = await sessionsApi.list({ view: ctx.view, cursor: pageCursors.at(-1),
      ...(query ? { query } : {}),
      ...(ctx.toolFilter ? { entry_ids: [ctx.toolFilter as never] } : {}) }, read.controller.signal);
    if (ctx.listRead !== read) return;
    ctx.pageCursors = pageCursors;
    ctx.nextCursor = out.next_cursor;
    ctx.rows = out.sessions;
    ctx.sources = out.sources;
    ctx.unfiledBadge.hidden = !out.unfiled_count;
    if (out.unfiled_count) ctx.unfiledBadge.textContent = String(out.unfiled_count);
    const fresh = ctx.selectedKey ? ctx.rows.find((r) => r.session_key === ctx.selectedKey) : undefined;
    if (fresh && ctx.detail) { ctx.detail = { ...ctx.detail, row: fresh }; renderDetailPane(ctx.detailEl, ctx.detailEmptyEl, ctx.detail); }
    read.state = "ready";
    if (ctx.sources.some((s) => s.state === "reading")) ctx.poller.kick(false); else ctx.poller.stop();
    if (withSuggest && ctx.view === "unfiled") {
      const keys = pickSuggestBatchKeys(ctx.rows, ctx.liveSuggestions);
      if (keys.length) void sessionsApi.attributionSuggest({ session_keys: keys }).then((res) => {
        if (ctx.listRead !== read) return;
        for (const item of res.suggestions) ctx.liveSuggestions.set(item.session_key, item.suggestion);
        if (ctx.view === "unfiled") paintSurfaceList(ctx);
      }).catch(() => {});
    }
  } catch (error) {
    if (ctx.listRead !== read || read.controller.signal.aborted) return;
    const message = (error as Error).message || uiText.text("workbench.sessions.read-failed");
    read.state = "failed";
    read.errorMessage = message;
    ctx.showError(message);
  } finally {
    if (ctx.listRead === read) paintSurfaceList(ctx);
  }
}

async function openSurfaceSession(ctx: SurfaceCtx, sessionKey: string, query = "", revalidate = false): Promise<void> {
  const seq = ++ctx.detailSeq;
  ctx.selectedKey = sessionKey;
  ctx.root.dataset.expanded = "true";
  ctx.detail = null;
  renderDetailPane(ctx.detailEl, ctx.detailEmptyEl, null, true);
  paintSurfaceList(ctx);
  try {
    const hist = await sessionsApi.history({ session_key: sessionKey, ...(query ? { query } : {}) });
    if (seq !== ctx.detailSeq) return;
    ctx.detail = { row: hist.session, entries: hist.entries, olderCursor: hist.older_cursor, loadingEarlier: false, query, history: hist, error: null };
  } catch (err) {
    if (seq !== ctx.detailSeq) return;
    ctx.selectedKey = null;
    ctx.root.dataset.expanded = "false";
    if (!revalidate) ctx.showError((err as Error)?.message || uiText.text("workbench.sessions.read-failed"));
    paintSurfaceList(ctx);
  }
  renderDetailPane(ctx.detailEl, ctx.detailEmptyEl, ctx.detail);
}

async function searchSurfaceTool(ctx: SurfaceCtx): Promise<void> {
  const source = ctx.sources.find(row => row.entry_id === ctx.toolFilter && row.location_key);
  const query = ctx.searchQuery.trim();
  if (!source?.location_key || !query) return;
  ctx.listRead?.controller.abort();
  const read: NonNullable<SurfaceCtx["listRead"]> = { controller: new AbortController(), state: "loading" };
  ctx.listRead = read;
  try {
    const result = await sessionsApi.toolSearch({ entry_id: source.entry_id, location_key: source.location_key, query }, read.controller.signal);
    if (ctx.listRead !== read) return;
    ctx.droidRows = result.sessions;
    ctx.droidHint.textContent = result.skipped_count > 0
      ? uiText.text("workbench.sessions.droid-skipped", { count: result.skipped_count })
      : uiText.text("workbench.sessions.droid-matched", { count: result.sessions.length });
    read.state = "ready";
  } catch (error) {
    if (ctx.listRead !== read || read.controller.signal.aborted) return;
    const message = (error as Error).message || uiText.text("workbench.sessions.read-failed");
    read.state = "failed";
    read.errorMessage = message;
    ctx.showError(message);
  } finally {
    if (ctx.listRead === read) {
      paintSurfaceList(ctx);
      ctx.poller.kick(false);
    }
  }
}

async function loadEarlierEntries(ctx: SurfaceCtx): Promise<void> {
  const olderCursor = ctx.detail?.olderCursor;
  if (!ctx.detail || !olderCursor || ctx.detail.loadingEarlier) return;
  const seq = ctx.detailSeq;
  const key = ctx.detail.row.session_key;
  ctx.detail = { ...ctx.detail, loadingEarlier: true };
  renderDetailPane(ctx.detailEl, ctx.detailEmptyEl, ctx.detail);
  try {
    const hist = await sessionsApi.history({ session_key: key, from: { before: olderCursor } });
    if (seq !== ctx.detailSeq || ctx.detail?.row.session_key !== key) return;
    ctx.detail = { ...ctx.detail, entries: [...hist.entries, ...ctx.detail.entries], olderCursor: hist.older_cursor, loadingEarlier: false };
  } catch {
    if (seq !== ctx.detailSeq || !ctx.detail) return;
    ctx.detail = { ...ctx.detail, loadingEarlier: false };
  }
  renderDetailPane(ctx.detailEl, ctx.detailEmptyEl, ctx.detail);
}

export function mountSessionsSurface(
  root: HTMLElement,
  scopeSheet: ScopeSheetController,
  showToast?: (msg: string, isError?: boolean) => void,
): void {
  const q = <T extends HTMLElement = HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
  let ctx: SurfaceCtx;
  const poller = createDiscoveryPoller({
    isActive: () => root.isConnected && !root.closest("[hidden], [data-surface-pool]") && ctx.listRead?.state !== "loading" && ctx.sources.some((s) => s.state === "reading"),
    async onTick() { await loadSurfaceList(ctx, false, "refresh"); return ctx.sources.some((s) => s.state === "reading"); },
  });
  ctx = {
    root, sourcesEl: q("[data-sessions-sources]"), bodyEl: q("[data-sessions-body]"),
    detailEl: q("[data-sessions-detail]"), detailEmptyEl: q("[data-sessions-detail-empty]"),
    toolSelect: q("[data-sessions-tool-filter]"), searchInput: q("[data-sessions-search]"),
    droidBar: q("[data-sessions-droid-bar]"), droidHint: q("[data-sessions-droid-hint]"),
    unfiledBadge: q("[data-sessions-unfiled-count]"),
    attrDialog: ensureAttributionDialog(),
    poller,
    view: currentProjectId() ? "project" : "all", toolFilter: "", searchQuery: "", sourcesExpanded: false,
    rows: [], droidRows: null, sources: [], toolMeta: [], projects: [],
    selectedKey: null, detail: null, listRead: null, pageCursors: [null], nextCursor: null, detailSeq: 0, dirtyChoices: new Map(), liveSuggestions: new Map(),
    showError: message => showToast?.(message, true),
  };
  bindSourcesEvents(ctx.sourcesEl, {
    onToggle: () => { ctx.sourcesExpanded = !ctx.sourcesExpanded; renderSourcesSection(ctx.sourcesEl, ctx.sources, ctx.sourcesExpanded); },
    onRetry: (entryId) => { void sessionsApi.discoveryRun({ entry_id: entryId as never }).then(() => { ctx.poller.kick(true); return loadSurfaceList(ctx, false); }); },
    onToast: (msg) => showToast?.(msg, false),
  });
  bindSessionsClientEvents(ctx, {
    loadList: (w) => loadSurfaceList(ctx, w),
    retryList: () => loadSurfaceScopeMeta(ctx).then(() => loadSurfaceList(ctx)),
    paintList: () => paintSurfaceList(ctx),
    loadPage: page => loadSurfaceList(ctx, true, page),
    searchTool: () => searchSurfaceTool(ctx),
    openSession: (id, s) => openSurfaceSession(ctx, id, s), loadEarlier: () => loadEarlierEntries(ctx),
    clearDetail: () => { ++ctx.detailSeq; ctx.selectedKey = null; ctx.detail = null; root.dataset.expanded = "false"; renderDetailPane(ctx.detailEl, ctx.detailEmptyEl, null); paintSurfaceList(ctx); },
    applyAttribution: async (row, decision) => {
      const updated = await sessionsApi.attributionSet({ session_key: row.session_key, decision, expected_revision: row.attribution_revision });
      ctx.dirtyChoices.delete(row.session_key);
      if (ctx.detail?.row.session_key === row.session_key) { ctx.detail = { ...ctx.detail, row: updated }; renderDetailPane(ctx.detailEl, ctx.detailEmptyEl, ctx.detail); }
      await loadSurfaceList(ctx);
    },
    kickPoller: () => ctx.poller.kick(true), toast: (msg, err) => showToast?.(msg, err),
  });
  document.addEventListener("molis-work:language-changed", () => { paintSurfaceList(ctx); renderDetailPane(ctx.detailEl, ctx.detailEmptyEl, ctx.detail, ctx.selectedKey !== null && ctx.detail === null); });
  scopeSheet.onSaved(scope => {
    const selected = ctx.selectedKey, query = ctx.detail?.query ?? "", seq = ++ctx.detailSeq;
    ctx.listRead?.controller.abort();
    ctx.listRead = null;
    ctx.rows = []; ctx.droidRows = null; ctx.selectedKey = null; ctx.detail = null;
    ctx.pageCursors = [null]; ctx.nextCursor = null;
    ctx.liveSuggestions.clear(); ctx.dirtyChoices.clear();
    renderDetailPane(ctx.detailEl, ctx.detailEmptyEl, null);
    applySurfaceScopeMeta(ctx, scope);
    void loadSurfaceList(ctx).then(() => {
      if (selected && seq === ctx.detailSeq) return openSurfaceSession(ctx, selected, query, true);
    });
  });
  paintSurfaceList(ctx);
  void loadSurfaceScopeMeta(ctx).then(() => loadSurfaceList(ctx));
}
