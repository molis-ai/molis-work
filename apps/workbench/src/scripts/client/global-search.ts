/** Workbench-owned jump palette. Plugin owners keep their own open/select behavior. */
export const GLOBAL_SEARCH_FACTORY_SCRIPT = `(host) => {
  const { translate: L, setDirectory, setWorkSurface, selectGoal, setMobileView, noteSearchActivity, openTabItem, expandDirectory } = host;
  const dialog = document.querySelector("[data-global-search-dialog]");
  const form = document.querySelector("[data-global-search-form]");
  const input = document.querySelector("[data-global-search]");
  const results = document.querySelector("[data-global-search-results]");
  if (!dialog || !form || !input || !results) return null;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  const inTerminal = (target) => Boolean(target?.closest?.("[data-tui-pane], .xterm"));
  let hits = [];
  let selected = 0;
  let composing = false;
  let lastTrigger = null;
  const isOpen = () => dialog.open;
  const isBusy = () => composing || isOpen();
  const pluginEnabled = (id) => Boolean(document.querySelector('[data-plugin-strip] [data-plugin-id="' + id + '"], [data-assistant-island] [data-plugin-id="' + id + '"]'));
  const collect = (query) => {
    const q = query.trim().toLowerCase();
    const limit = q ? 12 : 8;
    const take = (items) => (q ? items.filter((item) => item.search.includes(q)) : items).slice(0, limit);
    const groups = [];
    if (pluginEnabled("goals")) {
      const items = take([...document.querySelectorAll("[data-tree-item]")].map((item) => ({
        kind: "goal",
        id: item.dataset.goalId,
        title: item.querySelector(".tree-title-line strong")?.textContent?.trim() || item.dataset.goalId,
        plugin: "Goals",
        search: String(item.dataset.goalSearch || "").toLowerCase(),
        directory: "goals",
        surface: "goal",
      })));
      if (items.length) groups.push({ label: "Goals", items });
    }
    if (pluginEnabled("sessions")) {
      const items = take([...document.querySelectorAll('[data-operation-row="session"]')].map((row) => ({
        kind: "session",
        id: row.dataset.recordId,
        title: row.querySelector("strong")?.textContent?.trim() || row.dataset.recordId,
        plugin: "Sessions",
        search: String(row.dataset.recordSearch || "").toLowerCase(),
        directory: "sessions",
        surface: "sessions",
        element: row,
      })));
      if (items.length) groups.push({ label: "Sessions", items });
    }
    if (pluginEnabled("inbox")) {
      const items = take([...document.querySelectorAll("[data-inbox-row]")].map((row) => ({
        kind: "inbox",
        id: row.dataset.inboxEntryId,
        title: row.querySelector("strong")?.textContent?.trim() || row.dataset.inboxEntryId,
        plugin: "Inbox",
        search: String((row.querySelector("strong")?.textContent || "") + " " + (row.dataset.inboxReason || "")).toLowerCase(),
        directory: "inbox",
        surface: "inbox",
        element: row,
      })));
      if (items.length) groups.push({ label: "Inbox", items });
    }
    if (pluginEnabled("feed")) {
      const feedItems = take([...document.querySelectorAll("[data-feed-entry-id]")].map((row) => ({
        kind: "feed",
        id: row.dataset.feedEntryId,
        title: row.dataset.feedEntryTitle || row.querySelector("strong")?.textContent?.trim() || row.dataset.feedEntryId,
        plugin: "Feed",
        search: String(row.dataset.feedEntrySearch || "").toLowerCase(),
        directory: "feed",
        surface: "feed",
        element: row,
      })));
      if (feedItems.length) groups.push({ label: "Feed", items: feedItems });
      const sources = take([...document.querySelectorAll("[data-feed-task]:not([data-feed-task='all'])")].map((row) => {
        const toggle = row.querySelector("[data-feed-task-toggle]");
        return {
          kind: "source",
          id: row.dataset.feedTask,
          title: row.querySelector("strong")?.textContent?.trim() || row.dataset.feedTask,
          plugin: "Feed",
          search: String(toggle?.dataset.sourceSearchValue || row.querySelector("strong")?.textContent || "").toLowerCase(),
          directory: "feed",
          surface: "feed",
          element: toggle || row,
        };
      }));
      if (sources.length) groups.push({ label: L("来源"), items: sources });
    }
    if (pluginEnabled("artifacts")) {
      const items = take([...document.querySelectorAll('[data-artifact-directory] a[data-frame-asset="artifact"]')].map((row) => ({
        kind: "artifact",
        id: row.dataset.frameAssetId,
        title: row.querySelector("strong")?.textContent?.trim() || row.dataset.frameAssetTitle || "",
        plugin: "Artifacts",
        search: String((row.querySelector("strong")?.textContent || "") + " " + (row.querySelector("span")?.textContent || "")).toLowerCase(),
        directory: "artifacts",
        surface: "artifacts",
        element: row,
      })));
      if (items.length) groups.push({ label: "Artifacts", items });
    }
    const actions = [
      { kind: "action", id: "create", title: L("新建目标"), plugin: L("快捷操作"), search: "新建目标 create goal", selector: "[data-open-create]" },
      { kind: "action", id: "home", title: L("项目首页"), plugin: L("快捷操作"), search: "项目首页 home", selector: '[data-plugin-id="home"]' },
      { kind: "action", id: "settings", title: L("设置"), plugin: L("快捷操作"), search: "设置 settings", selector: '[data-plugin-id="settings"]' },
      { kind: "action", id: "market", title: L("插件市场"), plugin: L("快捷操作"), search: "插件市场 market", selector: '[data-plugin-id="market"]' },
    ].filter((item) => document.querySelector(item.selector) && (!q || item.search.includes(q)));
    if (actions.length) groups.push({ label: L("快捷操作"), items: actions });
    return groups;
  };
  const paintSelection = () => {
    results.querySelectorAll("[data-global-search-hit]").forEach((button, index) => {
      button.setAttribute("aria-selected", String(index === selected));
    });
    results.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  };
  const render = () => {
    const groups = collect(input.value);
    hits = groups.flatMap((group) => group.items);
    if (selected >= hits.length) selected = Math.max(0, hits.length - 1);
    if (!groups.length) {
      results.innerHTML = '<p class="global-search-empty">' + escapeHtml(L("没有匹配的内容")) + "</p>";
      return;
    }
    let index = 0;
    results.innerHTML = groups.map((group) => {
      const rows = group.items.map((item) => {
        const shortcut = index < 9 ? "<kbd>⌘" + (index + 1) + "</kbd>" : "";
        const html = '<button class="global-search-hit" type="button" role="option" data-global-search-hit="' + index + '" data-global-search-id="' + escapeHtml(item.id) + '" aria-selected="' + String(index === selected) + '"><span class="global-search-hit-title">' + escapeHtml(item.title) + '</span><span class="global-search-hit-plugin">' + escapeHtml(item.plugin) + "</span>" + shortcut + "</button>";
        index += 1;
        return html;
      }).join("");
      return '<section class="global-search-group"><h3>' + escapeHtml(group.label) + "</h3>" + rows + "</section>";
    }).join("");
  };
  const close = () => {
    if (dialog.open) dialog.close();
  };
  const activate = (hit) => {
    if (!hit) return;
    close();
    const openItem = () => {
      if (hit.kind === "action") {
        document.querySelector(hit.selector)?.click();
        return;
      }
      if (hit.kind === "goal") {
        expandDirectory?.("goals");
        openTabItem?.("goals", hit.id, hit.title, "commit");
        requestAnimationFrame(() => {
          document.querySelector('[data-tree-item][data-goal-id="' + CSS.escape(hit.id) + '"]')?.scrollIntoView({ block: "nearest" });
        });
      } else {
        const plugin = { session: "sessions", inbox: "inbox", feed: "feed", artifact: "artifacts", source: "feed" }[hit.kind];
        if (plugin) {
          expandDirectory?.(plugin);
          openTabItem?.(plugin, hit.id, hit.title);
        }
        if (hit.directory) setDirectory(hit.directory);
        if (hit.surface && !plugin) setWorkSurface(hit.surface);
        hit.element?.click();
        requestAnimationFrame(() => hit.element?.scrollIntoView?.({ block: "nearest" }));
      }
      if (matchMedia("(max-width: 600px)").matches) setMobileView("document");
    };
    requestAnimationFrame(openItem);
  };
  const open = (trigger) => {
    lastTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement;
    input.value = "";
    selected = 0;
    render();
    if (!dialog.open) dialog.showModal();
    input.focus();
    input.select();
    noteSearchActivity(500);
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    activate(hits[selected]);
  });
  input.addEventListener("input", () => {
    if (composing) return;
    selected = 0;
    noteSearchActivity();
    render();
  });
  input.addEventListener("compositionstart", () => { composing = true; noteSearchActivity(); });
  input.addEventListener("compositionend", () => {
    composing = false;
    selected = 0;
    noteSearchActivity(500);
    render();
  });
  results.addEventListener("mousemove", (event) => {
    const hit = event.target.closest("[data-global-search-hit]");
    if (!hit) return;
    selected = Number(hit.dataset.globalSearchHit);
    paintSelection();
  });
  results.addEventListener("click", (event) => {
    const hit = event.target.closest("[data-global-search-hit]");
    if (!hit) return;
    event.preventDefault();
    activate(hits[Number(hit.dataset.globalSearchHit)]);
  });
  dialog.addEventListener("close", () => {
    if (lastTrigger instanceof HTMLElement) lastTrigger.focus();
  });
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
      activate(hits[Number(event.key) - 1]);
      return true;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!hits.length) return true;
      selected = (selected + 1) % hits.length;
      paintSelection();
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!hits.length) return true;
      selected = (selected - 1 + hits.length) % hits.length;
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
