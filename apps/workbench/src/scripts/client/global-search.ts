/**
 * Workbench-owned search palette. Content comes from the system search (`search.query` through `/api/search/*`), so it
 * covers plugins and objects that were never opened; each plugin still owns how its object opens. Tools and quick actions
 * are local shortcuts filtered here.
 */
import { pluginSearchRows } from "../../plugin-workbench.js";

/** Drop repeated plugin records before the result cap, so a second copy cannot crowd out a different record.
 *  Stringified into the browser factory. Type annotations are erased before that string is sent. */
export function takeSearchHits(
  items: readonly { plugin?: string; kind?: string; id?: string; search?: string }[],
  query: string,
  limit: number,
) {
  const q = String(query || "").trim().toLowerCase();
  const seen = new Set();
  const matched = [];
  for (const item of items) {
    if (q && !String(item.search || "").includes(q)) continue;
    const id = item.id == null ? "" : String(item.id);
    const key = String(item.plugin || item.kind || "") + "\0" + id;
    if (id && seen.has(key)) continue;
    if (id) seen.add(key);
    matched.push(item);
  }
  return matched.slice(0, limit);
}

/** Surfaces whose tab opens one object by id (they handle `molis-work:select-item` or a dedicated selector). */
export const SEARCH_ITEM_TAB_SURFACES = ["goals", "sessions", "inbox", "feed", "pages", "lingguang", "workflows", "coding", "shelf", "artifacts"] as const;

export const GLOBAL_SEARCH_FACTORY_SCRIPT = `(host) => {
  const { translate: L, setMobileView, noteSearchActivity, openTabItem, openPlugin, openPluginRecord, expandDirectory, askAssistant, route, headers, projectId } = host;
  const dialog = document.querySelector("[data-global-search-dialog]");
  const form = document.querySelector("[data-global-search-form]");
  const input = document.querySelector("[data-global-search]");
  const results = document.querySelector("[data-global-search-results]");
  const scopeBar = document.querySelector("[data-global-search-scopes]");
  const statusLine = document.querySelector("[data-global-search-status]");
  if (!dialog || !form || !input || !results) return null;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  const inTerminal = (target) => Boolean(target?.closest?.("[data-tui-pane], .xterm"));
  const ITEM_TABS = ${JSON.stringify([...SEARCH_ITEM_TAB_SURFACES])};
  const RECORD_ROWS = ${JSON.stringify([...pluginSearchRows().map(([plugin]) => plugin), "feed", "characters"])};
  const takeSearchHits = ${takeSearchHits.toString()};
  // The palette lives on project (board) pages; a legacy single-board page has a project context without a catalog id.
  const hasProject = Boolean(projectId) || document.body.hasAttribute("data-board-view");
  const scopes = hasProject ? ["all", "project", "personal"] : ["personal"];
  let scope = (() => { try { const saved = sessionStorage.getItem("molis-work:search-scope"); return scopes.includes(saved) ? saved : scopes[0]; } catch { return scopes[0]; } })();
  let hits = [];
  let selected = 0;
  // Whether the person moved the selection themselves (arrows or pointer) since the words last changed.
  let explicit = false;
  let composing = false;
  let lastTrigger = null;
  let remote = { query: "", scope, status: "idle", hits: [], sources: [], next: null, error: "" };
  let requestSeq = 0;
  let debounce = null;
  let retry = null;
  let retries = 0;
  let notice = "";
  const isOpen = () => dialog.open;
  const isBusy = () => composing || isOpen();
  const localGroups = (query) => {
    const q = query.trim().toLowerCase();
    const groups = [];
    const items = [...document.querySelectorAll('[data-plugin-strip] [data-plugin-id], [data-assistant-island] [data-plugin-id], [data-dock] [data-plugin-id]')]
      .filter((el) => !['home', 'market', 'settings'].includes(el.dataset.pluginId))
      .map((el) => ({ kind: 'plugin', id: el.dataset.pluginId, title: el.querySelector('span')?.textContent?.trim() || el.title, plugin: L('插件'), search: (el.textContent + ' ' + el.dataset.pluginId).toLowerCase() }));
    const limit = q ? 12 : 8;
    const tools = takeSearchHits(items, q, limit);
    if (tools.length) groups.push({ label: L('插件'), items: tools });
    const actions = [
      { kind: "action", id: "create", title: L("新建目标"), plugin: L("快捷操作"), search: "新建目标 create goal", selector: "[data-open-create]" },
      { kind: "action", id: "home", title: L("项目首页"), plugin: L("快捷操作"), search: "项目首页 home", selector: '[data-plugin-id="home"]' },
      { kind: "action", id: "settings", title: L("设置"), plugin: L("快捷操作"), search: "设置 settings", selector: '[data-plugin-id="settings"]' },
      { kind: "action", id: "market", title: L("插件市场"), plugin: L("快捷操作"), search: "插件市场 market", selector: '[data-plugin-id="market"]' },
    ].filter((item) => document.querySelector(item.selector) && (!q || item.search.includes(q)));
    if (actions.length) {
      if (q) groups.push({ label: L("快捷操作"), items: actions });
      else groups.unshift({ label: L("快捷操作"), items: actions });
    }
    return groups;
  };
  const remoteGroups = () => {
    const byPlugin = new Map();
    for (const hit of remote.hits) {
      const label = hit.plugin_title || hit.plugin_id;
      if (!byPlugin.has(label)) byPlugin.set(label, []);
      byPlugin.get(label).push({ kind: "hit", id: hit.subject.id, title: hit.title, plugin: label, hit });
    }
    return [...byPlugin.entries()].map(([label, items]) => ({ label, items }));
  };
  const statusText = () => {
    if (notice) return notice;
    if (remote.status === "error") return remote.error || L("搜索暂时不可用，请稍后重试");
    if (!input.value.trim()) return hasProject ? L("搜索本项目与个人的全部内容，或按名称切换工具") : L("搜索个人内容，或按名称切换工具");
    if (remote.status === "loading" && !remote.hits.length) return L("正在搜索…");
    const indexing = remote.sources.filter((source) => source.state === "indexing").map((source) => source.title);
    if (indexing.length) return L("正在建立搜索索引：") + indexing.join("、");
    const failing = remote.sources.filter((source) => ["failed", "stale", "unavailable"].includes(source.state));
    if (failing.length) return L("部分内容暂时搜不到：") + failing.map((source) => source.title + (source.reason ? "（" + source.reason + "）" : "")).join("、");
    return "";
  };
  const paintSelection = () => {
    results.querySelectorAll("[data-global-search-hit]").forEach((button, index) => {
      button.setAttribute("aria-selected", String(index === selected));
    });
    const active = results.querySelector('[aria-selected="true"]');
    if (active) input.setAttribute("aria-activedescendant", active.id);
    else input.removeAttribute("aria-activedescendant");
    active?.scrollIntoView({ block: "nearest" });
  };
  const snippetHtml = (hit) => {
    const text = String(hit.snippet || "");
    if (!text) return "";
    let html = "", at = 0;
    for (const [start, end] of (hit.highlights || []).filter(([start, end]) => start >= 0 && end > start && end <= text.length).sort((a, b) => a[0] - b[0])) {
      if (start < at) continue;
      html += escapeHtml(text.slice(at, start)) + "<mark>" + escapeHtml(text.slice(start, end)) + "</mark>";
      at = end;
    }
    return '<span class="global-search-hit-snippet">' + html + escapeHtml(text.slice(at)) + "</span>";
  };
  const paintScopes = () => {
    if (!scopeBar) return;
    scopeBar.hidden = scopes.length < 2;
    scopeBar.querySelectorAll("[data-global-search-scope-option]").forEach((button) => {
      button.hidden = !scopes.includes(button.dataset.globalSearchScopeOption);
      button.setAttribute("aria-pressed", String(button.dataset.globalSearchScopeOption === scope));
    });
  };
  const render = () => {
    const query = input.value;
    const groups = localGroups(query);
    const content = query.trim() ? remoteGroups() : [];
    // Content first when the words find something; tools stay reachable after it.
    const ordered = query.trim() ? [...content, ...groups] : groups;
    const noContent = query.trim() && !content.length && remote.status === "done" && remote.query === query.trim();
    // Asking the Assistant is a separate, explicit button: it is not a result, and Enter on no results starts nothing.
    const ask = noContent && typeof askAssistant === "function"
      ? '<button class="mw-btn mw-btn--ghost global-search-ask" type="button" data-global-search-ask>' + escapeHtml(L("问助理：") + "“" + query.trim() + "”") + "</button>" : "";
    hits = ordered.flatMap((group) => group.items);
    if (hits.length && (selected < 0 || selected >= hits.length)) selected = explicit ? hits.length - 1 : 0;
    if (statusLine) { const text = statusText(); statusLine.textContent = text; statusLine.hidden = !text; }
    paintScopes();
    if (!ordered.length) {
      const waiting = query.trim() && remote.status !== "done" && remote.status !== "error";
      results.innerHTML = waiting ? "" : '<p class="global-search-empty">' + escapeHtml(L("没有匹配的内容")) + "</p>" + ask;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    let index = 0;
    results.innerHTML = ordered.map((group) => {
      const rows = group.items.map((item) => {
        const shortcut = index < 9 ? "<kbd>⌘" + (index + 1) + "</kbd>" : "";
        const body = item.kind === "hit"
          ? '<span class="global-search-hit-main"><span class="global-search-hit-title">' + escapeHtml(item.title) + "</span>" + snippetHtml(item.hit) + "</span>"
          : '<span class="global-search-hit-title">' + escapeHtml(item.title) + "</span>";
        const kind = item.kind === "hit" ? item.hit.subject.kind : item.kind;
        const html = '<button class="global-search-hit' + (item.kind === "hit" ? " is-content" : "") + '" type="button" role="option" tabindex="-1" id="global-search-hit-' + index + '" data-global-search-hit="' + index + '" data-global-search-id="' + escapeHtml(item.id) + '" data-global-search-kind="' + escapeHtml(kind) + '" aria-selected="' + String(index === selected) + '">' + body + '<span class="global-search-hit-plugin">' + escapeHtml(item.plugin) + "</span>" + shortcut + "</button>";
        index += 1;
        return html;
      }).join("");
      return '<section class="global-search-group"><h3>' + escapeHtml(group.label) + "</h3>" + rows + "</section>";
    }).join("") + (remote.next && query.trim() ? '<button class="mw-btn mw-btn--ghost global-search-more" type="button" data-global-search-more>' + escapeHtml(L("显示更多结果")) + "</button>" : "")
      // Tools matched but content did not: say so about content only, not as if nothing matched.
      + (ask ? '<p class="global-search-empty">' + escapeHtml(L("内容里没有找到")) + "</p>" + ask : "");
    paintSelection();
  };
  const request = async (path, body) => {
    const response = await fetch(route(path), { method: "POST", cache: "no-store", headers: { "content-type": "application/json", ...(headers?.() || {}) }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error || L("搜索暂时不可用，请稍后重试")), { code: result.code });
    return result;
  };
  const search = async (append = false) => {
    const query = input.value.trim();
    clearTimeout(retry);
    if (!query) { remote = { query: "", scope, status: "idle", hits: [], sources: [], next: null, error: "" }; render(); return; }
    const seq = ++requestSeq;
    if (!append) remote = { ...remote, query, scope, status: "loading", error: "", ...(remote.query === query && remote.scope === scope ? {} : { hits: [], next: null }) };
    render();
    try {
      const result = await request("/api/search/query", { query, scope, limit: 20, ...(append && remote.next ? { cursor: remote.next } : {}) });
      if (seq !== requestSeq || !dialog.open) return;
      const merged = append ? [...remote.hits, ...result.hits.filter((hit) => !remote.hits.some((known) => known.hit_id === hit.hit_id))] : result.hits;
      remote = { query, scope, status: "done", hits: merged, sources: result.sources || [], next: result.next_cursor, error: "" };
      render();
      // The first index is still being built: ask again shortly, while the person is still looking.
      if (result.sources?.some((source) => source.state === "indexing") && retries < 12) {
        retries += 1;
        retry = setTimeout(() => { if (dialog.open && input.value.trim() === query) void search(); }, 900);
      }
    } catch (error) {
      if (seq !== requestSeq) return;
      remote = { ...remote, status: "error", error: error instanceof Error ? error.message : String(error) };
      render();
    }
  };
  const schedule = () => { clearTimeout(debounce); retries = 0; notice = ""; debounce = setTimeout(() => void search(), 140); };
  const close = () => {
    if (dialog.open) dialog.close();
  };
  // After the owner opened the object, bring the matched words into view in whichever pane shows it.
  const locate = (surface, text) => {
    const needle = String(text || "").trim().toLowerCase();
    if (!needle) return;
    const started = Date.now();
    const documents = () => [document, ...[...document.querySelectorAll("iframe[data-pane-tab]")].map((frame) => { try { return frame.contentDocument; } catch { return null; } }).filter(Boolean)];
    const attempt = () => {
      for (const doc of documents()) {
        const root = doc.querySelector('[data-work-surface="' + surface + '"]:not([hidden])') || (doc !== document ? doc.body : null);
        if (!root) continue;
        const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const at = String(node.nodeValue || "").toLowerCase().indexOf(needle);
          const parent = node.parentElement;
          if (at < 0 || !parent || !parent.getClientRects().length || parent.closest("[data-global-search-dialog], script, style, [hidden]")) continue;
          const range = doc.createRange();
          range.setStart(node, at); range.setEnd(node, at + needle.length);
          parent.scrollIntoView({ block: "center", behavior: "instant" });
          const view = doc.defaultView;
          if (view?.CSS?.highlights && view.Highlight) {
            if (!doc.querySelector("style[data-search-hit-style]")) {
              const style = doc.createElement("style"); style.dataset.searchHitStyle = "";
              style.textContent = "::highlight(molis-search-hit){background:color-mix(in srgb, #f5c542 55%, transparent);color:inherit}";
              doc.head.append(style);
            }
            view.CSS.highlights.set("molis-search-hit", new view.Highlight(range));
            doc.documentElement.dataset.searchHit = needle;
            setTimeout(() => { view.CSS.highlights.delete("molis-search-hit"); delete doc.documentElement.dataset.searchHit; }, 6000);
          } else {
            const selection = view?.getSelection?.(); selection?.removeAllRanges(); selection?.addRange(range);
          }
          return true;
        }
      }
      return false;
    };
    const tick = () => { if (attempt() || Date.now() - started > 5000) return; setTimeout(tick, 150); };
    setTimeout(tick, 120);
  };
  const openTarget = (target, kind, title) => {
    const surface = target.surface, id = target.id;
    expandDirectory?.(surface);
    if (surface === "goals") {
      openTabItem?.("goals", id, title, "commit");
      requestAnimationFrame(() => document.querySelector('[data-tree-item][data-goal-id="' + CSS.escape(id) + '"]')?.scrollIntoView({ block: "nearest" }));
    } else if (surface === "artifacts") openTabItem?.("artifacts", id.startsWith("/projects/") ? id : route(id), title);
    else if (ITEM_TABS.includes(surface) && !(surface === "feed" && kind === "source")) openTabItem?.(surface, id, title);
    else if (RECORD_ROWS.includes(surface)) openPluginRecord?.(surface, id);
    else openPlugin?.(surface);
    if (matchMedia("(max-width: 600px)").matches) setMobileView("document");
  };
  const activate = async (item) => {
    if (!item) return;
    if (item.kind === "plugin") {
      close();
      requestAnimationFrame(() => { openPlugin?.(item.id); if (matchMedia('(max-width: 600px)').matches) setMobileView('document'); });
      return;
    }
    if (item.kind === "action") { close(); requestAnimationFrame(() => document.querySelector(item.selector)?.click()); return; }
    const hit = item.hit;
    notice = "";
    try {
      // The owner confirms the object still exists and this person may read it before anything opens.
      const opened = await request("/api/search/open", { hit_id: hit.hit_id });
      if (opened.state !== "ok") {
        notice = opened.state === "missing" ? L("这条内容已被删除或归档，已从结果中移除") : (L("暂时打不开：") + opened.reason);
        if (opened.state === "missing") remote = { ...remote, hits: remote.hits.filter((known) => known.hit_id !== hit.hit_id) };
        render();
        return;
      }
      close();
      const target = opened.open || hit.open;
      if (!target) return;
      requestAnimationFrame(() => {
        openTarget(target, hit.subject.kind, opened.title || hit.title);
        locate(target.surface, hit.locator?.field !== "title" ? hit.locator?.text : "");
      });
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error);
      render();
    }
  };
  const open = (trigger) => {
    lastTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement;
    input.value = "";
    selected = 0; explicit = false;
    notice = "";
    remote = { query: "", scope, status: "idle", hits: [], sources: [], next: null, error: "" };
    render();
    if (!dialog.open) dialog.showModal();
    input.setAttribute("aria-expanded", "true");
    input.focus();
    input.select();
    noteSearchActivity(500);
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (selected >= 0) void activate(hits[selected]);
  });
  input.addEventListener("input", () => {
    if (composing) return;
    selected = 0; explicit = false;
    noteSearchActivity();
    render();
    schedule();
  });
  input.addEventListener("compositionstart", () => { composing = true; noteSearchActivity(); });
  input.addEventListener("compositionend", () => {
    composing = false;
    selected = 0; explicit = false;
    noteSearchActivity(500);
    render();
    schedule();
  });
  scopeBar?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-global-search-scope-option]");
    if (!button || !scopes.includes(button.dataset.globalSearchScopeOption)) return;
    scope = button.dataset.globalSearchScopeOption;
    try { sessionStorage.setItem("molis-work:search-scope", scope); } catch {}
    selected = 0;
    schedule();
    render();
    input.focus();
  });
  results.addEventListener("mousemove", (event) => {
    const hit = event.target.closest("[data-global-search-hit]");
    if (!hit) return;
    selected = Number(hit.dataset.globalSearchHit); explicit = true;
    paintSelection();
  });
  results.addEventListener("click", (event) => {
    if (event.target.closest("[data-global-search-more]")) { event.preventDefault(); void search(true); return; }
    if (event.target.closest("[data-global-search-ask]")) { event.preventDefault(); const words = input.value.trim(); close(); askAssistant?.(words); return; }
    const hit = event.target.closest("[data-global-search-hit]");
    if (!hit) return;
    event.preventDefault();
    void activate(hits[Number(hit.dataset.globalSearchHit)]);
  });
  dialog.addEventListener("close", () => {
    // The close event is dispatched later; reopened in between (Esc then ⌘K), it belongs to the previous session.
    if (dialog.open) return;
    clearTimeout(retry); clearTimeout(debounce); requestSeq += 1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    if (lastTrigger instanceof HTMLElement) lastTrigger.focus();
  });
  dialog.querySelector("[data-global-search-close]")?.addEventListener("click", close);
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-global-search-open]");
    if (!trigger) return;
    event.preventDefault();
    open(trigger);
  });
  const handleKeyboard = (event) => {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "k" && !event.shiftKey && !event.altKey && !inTerminal(event.target)) {
      event.preventDefault();
      if (isOpen()) close();
      else open(document.activeElement);
      return true;
    }
    if (meta && event.key.toLowerCase() === "f" && !event.shiftKey && !event.altKey && !inTerminal(event.target)) {
      event.preventDefault();
      if (!isOpen()) open(document.activeElement);
      else input.focus();
      return true;
    }
    if (!isOpen()) return false;
    if (meta && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      void activate(hits[Number(event.key) - 1]);
      return true;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!hits.length) return true;
      selected = selected < 0 ? 0 : (selected + 1) % hits.length; explicit = true;
      paintSelection();
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!hits.length) return true;
      selected = selected <= 0 ? hits.length - 1 : selected - 1; explicit = true;
      paintSelection();
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return true;
    }
    return false;
  };
  return { open, close, handleKeyboard, isBusy, isOpen };
}`;
