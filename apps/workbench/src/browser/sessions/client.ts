import { escapeHtml, renderBadge } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ExternalSessionRow, ExternalSessionSuggestion } from "@molis-ai/molis-work-contracts/services/sessions";
import { currentProjectId, formatActivityTime, sessionsApi, type SessionToolMeta } from "./api.js";
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
  listSeq: number;
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
  if (!ctx.sources.some((s) => s.state !== "not_allowed" && s.state !== "unsupported")) {
    ctx.bodyEl.innerHTML = `<div class="sessions-empty-card"><strong>${uiText("workbench.sessions.onboarding-title")}</strong><span>${uiText("workbench.sessions.onboarding-body")}</span><div><button class="mw-btn mw-btn--primary mw-btn--sm" type="button" data-sessions-open-scope="tools">${uiText("workbench.sessions.choose-read-scope")}</button></div></div>`;
    return;
  }
  const base = ctx.droidRows ?? ctx.rows;
  const needle = ctx.searchQuery.trim().toLowerCase();
  const shown = !needle || ctx.droidRows
    ? base
    : base.filter((row) => (row.title ?? "").toLowerCase().includes(needle) || (row.directory ?? "").toLowerCase().includes(needle) || row.tool.display_name.toLowerCase().includes(needle));
  if (ctx.view === "unfiled") {
    ctx.bodyEl.innerHTML = renderUnfiledList({ rows: shown, projects: ctx.projects, dirtyChoices: ctx.dirtyChoices, liveSuggestions: ctx.liveSuggestions, selectedKey: ctx.selectedKey });
    return;
  }
  ctx.bodyEl.innerHTML = shown.length === 0
    ? `<div class="sessions-empty-card"><strong>${uiText("workbench.sessions.empty-list-title")}</strong><span>${uiText("workbench.sessions.empty-list-body")}</span></div>`
    : renderSessionRows(shown, ctx.selectedKey, ctx.view === "all");
}

async function loadSurfaceScopeMeta(ctx: SurfaceCtx): Promise<void> {
  try {
    const sc = await sessionsApi.scopeRead(false);
    ctx.toolMeta = sc.tool_meta;
    ctx.projects = sc.project_ai_reads.map((r) => r.project);
    ctx.toolSelect.innerHTML = `<option value="">${uiText("workbench.sessions.all-tools")}</option>` + ctx.toolMeta.filter((m) => m.group === "connected")
      .map((m) => `<option value="${escapeHtml(m.id)}"${m.id === ctx.toolFilter ? " selected" : ""}>${escapeHtml(m.display_name)}</option>`).join("");
  } catch { /* list still loads */ }
}

async function loadSurfaceList(ctx: SurfaceCtx, withSuggest = true): Promise<void> {
  const seq = ++ctx.listSeq;
  const out = await sessionsApi.list({ view: ctx.view, ...(ctx.toolFilter ? { entry_ids: [ctx.toolFilter as never] } : {}) });
  if (seq !== ctx.listSeq) return;
  ctx.rows = out.sessions;
  ctx.sources = out.sources;
  ctx.unfiledBadge.hidden = !out.unfiled_count;
  if (out.unfiled_count) ctx.unfiledBadge.textContent = String(out.unfiled_count);
  const fresh = ctx.selectedKey ? ctx.rows.find((r) => r.session_key === ctx.selectedKey) : undefined;
  if (fresh && ctx.detail) { ctx.detail = { ...ctx.detail, row: fresh }; renderDetailPane(ctx.detailEl, ctx.detailEmptyEl, ctx.detail); }
  paintSurfaceList(ctx);
  if (ctx.sources.some((s) => s.state === "reading")) ctx.poller.kick(false); else ctx.poller.stop();
  if (withSuggest && ctx.view === "unfiled") {
    const keys = pickSuggestBatchKeys(ctx.rows, ctx.liveSuggestions);
    if (keys.length) void sessionsApi.attributionSuggest({ session_keys: keys }).then((res) => {
      for (const item of res.suggestions) ctx.liveSuggestions.set(item.session_key, item.suggestion);
      if (ctx.view === "unfiled") paintSurfaceList(ctx);
    }).catch(() => {});
  }
}

async function openSurfaceSession(ctx: SurfaceCtx, sessionKey: string, query = ""): Promise<void> {
  const seq = ++ctx.detailSeq;
  ctx.selectedKey = sessionKey;
  ctx.root.dataset.expanded = "true";
  paintSurfaceList(ctx);
  let row = (ctx.droidRows ?? ctx.rows).find((r) => r.session_key === sessionKey);
  if (!row) row = (await sessionsApi.list({ view: "all" })).sessions.find((r) => r.session_key === sessionKey);
  if (!row || seq !== ctx.detailSeq) return;
  try {
    const hist = await sessionsApi.history({ session_key: sessionKey, ...(query ? { query } : {}) });
    if (seq !== ctx.detailSeq) return;
    ctx.detail = { row, entries: hist.entries, olderCursor: hist.older_cursor, loadingEarlier: false, query, history: hist, error: null };
  } catch (err) {
    if (seq !== ctx.detailSeq) return;
    ctx.detail = { row, entries: [], olderCursor: null, loadingEarlier: false, query, history: null, error: (err as Error)?.message || uiText.text("workbench.sessions.read-failed") };
  }
  renderDetailPane(ctx.detailEl, ctx.detailEmptyEl, ctx.detail);
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
    isActive: () => root.isConnected && !root.closest("[hidden], [data-surface-pool]") && ctx.sources.some((s) => s.state === "reading"),
    async onTick() { await loadSurfaceList(ctx, false); return ctx.sources.some((s) => s.state === "reading"); },
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
    selectedKey: null, detail: null, listSeq: 0, detailSeq: 0, dirtyChoices: new Map(), liveSuggestions: new Map(),
  };
  bindSourcesEvents(ctx.sourcesEl, {
    onToggle: () => { ctx.sourcesExpanded = !ctx.sourcesExpanded; renderSourcesSection(ctx.sourcesEl, ctx.sources, ctx.sourcesExpanded); },
    onRetry: (entryId) => { void sessionsApi.discoveryRun({ entry_id: entryId as never }).then(() => { ctx.poller.kick(true); return loadSurfaceList(ctx, false); }); },
    onToast: (msg) => showToast?.(msg, false),
  });
  bindSessionsClientEvents(ctx, {
    loadList: (w) => loadSurfaceList(ctx, w), paintList: () => paintSurfaceList(ctx),
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
  document.addEventListener("molis-work:language-changed", () => { paintSurfaceList(ctx); renderDetailPane(ctx.detailEl, ctx.detailEmptyEl, ctx.detail); });
  scopeSheet.onSaved(() => { void loadSurfaceScopeMeta(ctx).then(() => loadSurfaceList(ctx)); });
  void loadSurfaceScopeMeta(ctx).then(() => loadSurfaceList(ctx));
}
