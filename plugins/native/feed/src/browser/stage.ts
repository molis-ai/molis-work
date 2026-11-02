import type { FeedPage } from "./factory.js";

/** Feed's list/reader, within this one surface. No source directory or pane DOM is read here. */
export function feedStage(page: FeedPage) {
  const { host, q, all } = page, L = host.translate;
  let selected = "", quick = "all", detailRequest: AbortController | null = null;
  const query = new URLSearchParams(host.search), preferences = "feed:filters:" + (host.mount?.surface || "workbench") + ":" + (query.get("workbenchPane") || "main") + ":" + (query.get("paneItem") || "default");
  try {
    const saved = JSON.parse(sessionStorage.getItem(preferences) || "null") as { quick?: string; fields?: Record<string, string> } | null;
    if (saved) { quick = ["unread", "saved"].includes(saved.quick || "") ? saved.quick! : "all"; for (const [name, text] of Object.entries(saved.fields || {})) { const field = q<HTMLInputElement | HTMLSelectElement>("[data-feed-" + name + "]"); if (field && typeof text === "string") field.value = text; } }
  } catch { /* A missing preference never blocks the owner-rendered page. */ }
  const value = (name: string, fallback: string) => q<HTMLInputElement | HTMLSelectElement>("[data-feed-" + name + "]")?.value || fallback;
  const expanded = (open: boolean) => { host.root.dataset.expanded = String(open); const area = q("[data-feed-stage-workspace]"); if (area) area.hidden = !open; };
  const collapse = () => { selected = ""; detailRequest?.abort(); expanded(false); all("[data-feed-entry-detail], [data-feed-detail]").forEach(node => node.hidden = true); all("[data-feed-entry-id]").forEach(node => { node.classList.remove("is-selected", "is-open"); node.setAttribute("aria-selected", "false"); node.setAttribute("aria-expanded", "false"); }); host.root.setAttribute("data-assistant-context", JSON.stringify({ plugin_id: "io.molis.work.feed", surface_title: "Feed" })); };
  const placeholder = (text: string, retry = false) => {
    const empty = q("[data-feed-detail-empty]"); if (!empty) return;
    empty.hidden = false; const title = q("[data-feed-detail-empty-title]", empty); if (title) title.textContent = text;
    const button = q("[data-retry-feed-detail]", empty); if (button) button.hidden = !retry;
  };
  const select = async (id: string, read = false): Promise<void> => {
    const row = all("[data-feed-entry-id]").find(row => row.dataset.feedEntryId === id && !row.hidden && !row.closest<HTMLElement>("[data-feed-item-wrap]")?.hidden);
    if (!row) return;
    if (id !== selected) page.change(); selected = id;
    const check = page.guard(); detailRequest?.abort(); const controller = detailRequest = new AbortController();
    all("[data-feed-entry-id]").forEach(node => { const active = node === row; node.classList.toggle("is-selected", active); node.classList.toggle("is-open", active); node.setAttribute("aria-selected", String(active)); node.setAttribute("aria-expanded", String(active)); node.tabIndex = active ? 0 : -1; });
    all("[data-feed-entry-detail]").forEach(node => node.hidden = node.dataset.feedEntryDetail !== id); expanded(true);
    const itemId = row.dataset.feedItemId || id, persisted = row.dataset.feedEntryPersisted === "true";
    const publish = () => {
      const revision = Number(q('[data-feed-detail="' + CSS.escape(id) + '"] [data-feed-revision]')?.dataset.feedRevision);
      host.root.setAttribute("data-assistant-context", JSON.stringify({ plugin_id: "io.molis.work.feed", surface_title: "Feed", ...(persisted ? { object: { kind: "feed_item", id: itemId, title: row.dataset.feedEntryTitle || "", ...(revision > 0 ? { version: revision } : {}) } } : {}) }));
    }; publish();
    const slot = q('[data-feed-entry-detail="' + CSS.escape(id) + '"] [data-feed-item-slot]') || q('[data-feed-entry-detail="' + CSS.escape(id) + '"]');
    let detail = q('[data-feed-detail="' + CSS.escape(id) + '"]');
    if (!detail && persisted && slot) {
      placeholder(L("正在载入 Item…"));
      try {
        const html = await host.view.readDocument({ object: { id: itemId, surface: "persisted-detail" }, signal: AbortSignal.any([controller.signal, page.signal()]) }); check();
        if (selected !== id || detailRequest !== controller) return;
        detail = new DOMParser().parseFromString(html, "text/html").querySelector('[data-feed-detail="' + CSS.escape(id) + '"]');
        if (!detail) throw new Error(L("Item 详情响应不完整")); slot.replaceChildren(detail); publish();
      } catch (error) { if (selected === id && detailRequest === controller) { try { check(); placeholder(molisWorkRequest.text(error, L("无法读取这条 Item")), true); } catch { /* A departed reader keeps no late result. */ } } return; }
      finally { if (detailRequest === controller && host.scope.alive && host.scope.visible) detailRequest = null; }
    }
    check(); if (detail) detail.hidden = false; const empty = q("[data-feed-detail-empty]"); if (empty) empty.hidden = Boolean(detail);
    if (read && persisted && row.dataset.feedEntryRead !== "read" && row.dataset.feedReadPending !== "true") {
      row.dataset.feedReadPending = "true";
      try { await page.api("/items/" + encodeURIComponent(itemId) + "/read", "POST", {}); check(); row.dataset.feedEntryRead = "read"; all("[data-feed-read-state]", detail ?? host.root).forEach(label => { label.textContent = L("已读"); label.dataset.mwState = "read"; }); host.invalidateView(); }
      catch (error) { try { check(); page.error(error); } catch { /* No late UI write. */ } }
      finally { try { check(); delete row.dataset.feedReadPending; } catch { /* The old reader is inactive. */ } }
    }
  };
  const filter = () => {
    const rows = all("[data-feed-entry-id]"), query = value("search", "").trim().toLocaleLowerCase();
    const source = value("source-filter", "all"), provider = value("type-filter", "all"), time = value("time-filter", "all"), status = value("status-filter", "active"), sort = value("sort", "newest");
    const visible = rows.filter(row => {
      const data = row.dataset, age = Date.now() - Date.parse(data.feedEntryTime || "");
      const match = (page.selection === "all" || (data.feedEntryTask || data.feedEntrySourceId) === page.selection) && (source === "all" || data.feedEntrySource === source) && (provider === "all" || data.feedEntryProvider === provider)
        && (time === "all" || age >= 0 && age <= ({ day: 1, week: 7, month: 30 }[time] ?? 0) * 86400000)
        && (status === "all" || status === "active" ? status === "all" || data.feedEntryStatus !== "archived" : data.feedEntryStatus === status)
        && (!query || (data.feedEntrySearch || "").includes(query)) && (quick === "unread" ? data.feedEntryRead !== "read" : quick === "saved" ? data.feedEntryStatus === "saved" : true);
      (row.closest<HTMLElement>("[data-feed-item-wrap]") || row).hidden = !match; return match;
    });
    const body = q("[data-feed-rows]");
    rows.sort((a, b) => sort === "source" ? (a.dataset.feedEntrySource || "").localeCompare(b.dataset.feedEntrySource || "") : sort === "title" ? (a.dataset.feedEntryTitle || "").localeCompare(b.dataset.feedEntryTitle || "") : sort === "oldest" ? (a.dataset.feedEntryTime || "").localeCompare(b.dataset.feedEntryTime || "") : (b.dataset.feedEntryTime || "").localeCompare(a.dataset.feedEntryTime || "")).forEach(row => body?.append(row.closest("[data-feed-item-wrap]") || row));
    const count = q("[data-feed-result-count]"); if (count) count.textContent = L("{count} 条消息", { count: visible.length });
    const empty = q("[data-feed-empty]"); if (empty) empty.hidden = visible.length > 0;
    if (selected && !visible.some(row => row.dataset.feedEntryId === selected)) collapse();
    const first = visible.find(row => row.dataset.feedEntryId === selected) || visible[0]; rows.forEach(row => row.tabIndex = row === first ? 0 : -1);
    all("[data-feed-quick]").forEach(button => { button.classList.toggle("is-current", button.dataset.feedQuick === quick); button.setAttribute("aria-pressed", String(button.dataset.feedQuick === quick)); });
    const values: Record<string, string> = { source, type: provider, time, status, sort };
    all("[data-feed-filter-option]").forEach(option => { const active = values[option.dataset.feedFilterOption!] === option.dataset.feedFilterValue; option.setAttribute("aria-checked", String(active)); option.tabIndex = active ? 0 : -1; });
    const activeCount = Number(source !== "all") + Number(provider !== "all") + Number(time !== "all") + Number(status !== "active") + Number(sort !== "newest"), badge = q("[data-feed-filter-badge]"), reset = q<HTMLButtonElement>("[data-feed-filter-reset]");
    if (badge) { badge.textContent = String(activeCount); badge.hidden = activeCount === 0; } if (reset) reset.disabled = activeCount === 0;
    const clear = q("[data-feed-clear-filters]"); if (clear) clear.hidden = rows.length === 0 || !query && activeCount === 0 && quick === "all";
    q("[data-feed-filter-trigger]")?.classList.toggle("is-active", activeCount > 0);
    if (q("[data-feed-list]") && host.scope.alive && host.scope.visible) try { sessionStorage.setItem(preferences, JSON.stringify({ quick, fields: { search: value("search", ""), "source-filter": source, "type-filter": provider, "time-filter": time, "status-filter": status, sort } })); } catch { /* Keep the current controls even when storage is unavailable. */ }
  };
  page.listen("input", event => { if (event.target instanceof Element && event.target.matches("[data-feed-search]")) filter(); });
  page.listen("change", event => { if (event.target instanceof Element && event.target.matches("[data-feed-source-filter],[data-feed-type-filter],[data-feed-time-filter],[data-feed-status-filter],[data-feed-sort]")) filter(); });
  page.listen("scroll", event => { if (event.target instanceof HTMLElement && event.target.matches(".feed-stage-item-detail")) event.target.toggleAttribute("data-scrolled", event.target.scrollTop > 4); });
  const click = async (target: Element, event: MouseEvent): Promise<void> => {
    if (target.closest("[data-feed-collapse]")) { collapse(); return; }
    if (target.closest("[data-retry-feed-detail]")) { if (selected) await select(selected, true); return; }
    const quickButton = target.closest<HTMLElement>("[data-feed-quick]"); if (quickButton) { quick = quickButton.dataset.feedQuick || "all"; filter(); return; }
    const option = target.closest<HTMLElement>("[data-feed-filter-option]");
    if (option) { const control = q<HTMLSelectElement>("[data-feed-" + (option.dataset.feedFilterOption === "sort" ? "sort" : option.dataset.feedFilterOption + "-filter") + "]"); if (control) control.value = option.dataset.feedFilterValue || ""; filter(); return; }
    if (target.closest("[data-feed-filter-trigger]")) { const panel = q("[data-feed-filter-panel]"); if (panel) { panel.hidden = !panel.hidden; target.closest("button")?.setAttribute("aria-expanded", String(!panel.hidden)); } return; }
    if (target.closest("[data-feed-filter-reset],[data-feed-clear-filters]")) { quick = "all"; for (const kind of ["source", "type", "time", "status", "sort", "search"]) { const control = q<HTMLInputElement | HTMLSelectElement>("[data-feed-" + (["source", "type", "time", "status"].includes(kind) ? kind + "-filter" : kind) + "]"); if (control) control.value = kind === "sort" ? "newest" : kind === "status" ? "active" : kind === "search" ? "" : "all"; } filter(); return; }
    const action = target.closest<HTMLButtonElement>("[data-feed-action]");
    if (action) {
      event.preventDefault(); if (action.disabled) return; const check = page.guard(); action.disabled = true; const release = page.pending(() => { if (action.isConnected) action.disabled = false; });
      try { const result = await page.api<{ goal_id?: string }>("/items/" + encodeURIComponent(action.dataset.feedItemId!) + "/" + action.dataset.feedAction, "POST", { expected_revision: Number(action.dataset.feedRevision) || undefined, ...(action.dataset.feedRestoreTarget ? { restore_target: action.dataset.feedRestoreTarget } : {}) }); check(); host.invalidateView(); if (result.goal_id) host.openItem("goals", result.goal_id); else await page.refresh(); }
      catch (error) { try { check(); page.error(error, q("[data-feed-action-status]", action.closest("[data-feed-detail]") || host.root)); } catch { /* Old selection. */ } }
      finally { try { check(); release(); } catch { /* Old selection. */ } } return;
    }
    const row = target.closest<HTMLElement>("[data-feed-entry-id]"); if (!row) return;
    const id = row.dataset.feedEntryId!;
    if (host.mount?.target_slot_id === "workbench.directory") host.openItem("feed", id, row.querySelector("strong")?.textContent || undefined);
    else await select(id, true);
  };
  page.listen("keydown", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (event.key === "Escape") { const panel = q("[data-feed-filter-panel]"); if (panel && !panel.hidden) { panel.hidden = true; q("[data-feed-filter-trigger]")?.focus(); event.preventDefault(); } return; }
    const row = target?.closest<HTMLElement>("[data-feed-entry-id]");
    if (!row || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const rows = all("[data-feed-entry-id]").filter(node => !node.hidden && !node.closest<HTMLElement>("[data-feed-item-wrap]")?.hidden), index = rows.indexOf(row);
    const next = event.key === "Home" ? rows[0] : event.key === "End" ? rows.at(-1) : rows[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next) { event.preventDefault(); next.focus(); void select(next.dataset.feedEntryId!, true).catch(error => page.error(error)); }
  });
  host.scope.own(() => detailRequest?.abort());
  return { select, collapse, filter, click, scroll: () => q(".feed-stage-tree")?.scrollTop ?? 0, restoreScroll: (top: number) => { const list = q(".feed-stage-tree"); if (list) list.scrollTop = top; if (selected) void select(selected, true).catch(error => page.error(error)); } };
}
