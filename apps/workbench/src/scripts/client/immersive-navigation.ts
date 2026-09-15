/** Coordinates application chrome; content and Runtime behavior stay with their Plugin owners. */
export const IMMERSIVE_NAVIGATION_FACTORY_SCRIPT = `(host) => {
  const { workspace, treePane, documentPane, getSelected, getState, getSurface, translate: L,
    setDirectoryCollapsed, setWorkspaceMode, setMobileView, saveUiState } = host;
  if (!document.body.classList.contains("immersive-workbench")) return null;
  const strip = document.querySelector("[data-plugin-strip]");
  const heading = document.querySelector("[data-plugin-heading]");
  const stage = document.querySelector("[data-plugin-stage]");
  const header = document.querySelector(".immersive-titlebar");
  const scrim = document.querySelector("[data-directory-dismiss]");
  const directoryFilterMenus = () => [...treePane.querySelectorAll(".project-record-filter-menu, .source-filter-menu")];
  const frame = document.querySelector("[data-goal-node-workspace]");
  const workMain = document.querySelector("[data-goal-work-main]");
  const modesScope = getState().project?.project_id || getState().snapshot.board.board_id;
  const modesKey = "molis-work-goal-work-modes:" + modesScope;
  let modes = {};
  try { modes = JSON.parse(localStorage.getItem(modesKey) || localStorage.getItem("goalboard-goal-work-modes:" + modesScope) || "{}"); } catch {}
  const narrow = () => matchMedia("(max-width: 600px)").matches;
  const persistModes = () => { try { localStorage.setItem(modesKey, JSON.stringify(modes)); } catch {} };
  const currentPlugin = () => {
    const surface = getSurface();
    if (surface === "goal") return "goals";
    if (surface === "feed" || surface === "sources") return "feed";
    if (surface === "home") return "home";
    if (surface === "market") return "market";
    if (surface === "project-settings") return "";
    if (surface === "sessions" || surface === "inbox" || surface === "artifacts") return surface;
    return "";
  };
  const syncPresence = () => {
    const drawerOpen = narrow() && workspace.dataset.mobileView === "tree";
    workspace.classList.toggle("is-directory-drawer-open", drawerOpen);
    scrim.hidden = !drawerOpen;
    treePane.toggleAttribute("inert", narrow() && !drawerOpen);
    stage.toggleAttribute("inert", drawerOpen);
    header.toggleAttribute("inert", drawerOpen);
    const editing = Boolean(documentPane.querySelector(".is-editing-goal"));
    const overlayDetails = Boolean(frame && frame.clientWidth < 840 && frame.dataset.detailsOpen === "true");
    workMain?.toggleAttribute("inert", editing || overlayDetails);
  };
  const setDetails = (open, persist = false) => {
    if (!frame) return;
    frame.dataset.detailsOpen = String(open);
    documentPane.hidden = !open;
    const button = frame.querySelector("[data-goal-details-toggle]");
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? L("收起 Goal 信息与时间线") : L("展开 Goal 信息与时间线"));
    if (persist && getSelected()) {
      modes[getSelected()] = { ...modes[getSelected()], details: open };
      persistModes();
    }
    syncPresence();
  };
  const syncGoalMode = () => {
    if (!frame) return;
    const goalId = getSelected();
    const item = getState().goals.find(item => item.goal.goal_id === goalId);
    frame.querySelector("[data-workspace-goal-title]").textContent = item?.goal.title || "";
    const status = frame.querySelector("[data-workspace-goal-status]");
    status.textContent = documentPane.querySelector(".goal-info-popover > summary .goal-status")?.textContent?.trim() || "";
    const saved = modes[goalId] || {};
    const workMode = "terminal";
    frame.dataset.workMode = workMode;
    frame.querySelectorAll("[data-goal-work-mode]").forEach(button => {
      const active = button.dataset.goalWorkMode === workMode;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    const terminal = frame.querySelector("[data-tui-pane]");
    if (terminal) { terminal.hidden = workMode !== "terminal"; terminal.setAttribute("role", "tabpanel"); terminal.setAttribute("aria-labelledby", "goal-terminal-tab"); }
    setDetails(saved.details ?? frame.clientWidth >= 840);
    document.dispatchEvent(new CustomEvent("molis-work:work-mode-changed", { detail: { goalId, mode: workMode } }));
  };
  const sync = () => {
    const plugin = currentPlugin();
    if (heading) heading.hidden = false;
    strip?.querySelectorAll("[data-plugin-id]").forEach(button => {
      const active = button.dataset.pluginId === plugin;
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    const surface = getSurface();
    const labels = { home: L("项目首页"), goal: "Goals", sessions: "Sessions", inbox: "Inbox", feed: "Feed", sources: "Feed", artifacts: "Artifacts", market: L("插件市场"), "project-settings": L("项目设置") };
    const pluginTitle = document.querySelector("[data-immersive-plugin-title]");
    if (pluginTitle) {
      pluginTitle.hidden = true;
      pluginTitle.textContent = labels[surface] || surface;
    }
    const goalTools = document.querySelector("[data-immersive-goal-tools]");
    if (goalTools) goalTools.hidden = true;
    const feedViews = document.querySelector("[data-feed-views]");
    if (feedViews) feedViews.hidden = true;
    const listTitle = document.querySelector("[data-directory-list-title]");
    if (listTitle) {
      const directory = treePane.dataset.desktopDirectory || "root";
      const heading = document.querySelector('[data-directory-panel="' + CSS.escape(directory) + '"] .desktop-directory-heading strong');
      const labels = { root: L("项目首页"), goals: "Goals", sessions: "Sessions", inbox: "Inbox", feed: "Feed", sources: L("来源"), artifacts: "Artifacts", settings: L("项目设置") };
      const nextTitle = heading?.textContent?.trim() || labels[directory] || L("项目首页");
      if (listTitle.textContent !== nextTitle) {
        listTitle.textContent = nextTitle;
        listTitle.classList.remove("is-title-enter");
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
          void listTitle.offsetWidth;
          listTitle.classList.add("is-title-enter");
          listTitle.addEventListener("animationend", () => listTitle.classList.remove("is-title-enter"), { once: true });
        }
      }
    }
    document.querySelector("[data-directory-show]").setAttribute("aria-expanded", String(!narrow() && !workspace.classList.contains("is-directory-collapsed")));
    syncPresence();
  };
  const showDirectory = () => {
    setDirectoryCollapsed(false);
    if (narrow()) setMobileView("tree");
    sync();
    saveUiState?.();
    requestAnimationFrame(() => treePane.querySelector("[data-directory-toggle]")?.focus());
  };
  const hideDirectory = () => {
    if (narrow()) setMobileView("document");
    else setDirectoryCollapsed(true);
    sync();
    header.querySelector("[data-directory-show]")?.focus();
  };
  document.querySelector("[data-directory-show]")?.addEventListener("click", showDirectory);
  scrim?.addEventListener("click", hideDirectory);
  document.addEventListener("click", (event) => {
    directoryFilterMenus().forEach((menu) => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
  });
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-goal-work-mode]");
    if (button) {
      if (button.disabled) return;
      setWorkspaceMode("runtime");
      return;
    }
    if (event.target.closest("[data-goal-details-toggle]")) setDetails(frame.dataset.detailsOpen !== "true", true);
    if (event.target.closest("[data-operation-select], [data-artifact-select]")) {
      if (narrow()) setMobileView("document");
      sync();
    }
    if (event.target.closest("[data-immersive-theme]")) {
      const theme = document.documentElement.dataset.resolvedTheme === "dark" ? "light" : "dark";
      localStorage.setItem("molis-work:theme", theme);
      // The existing theme owner reacts to storage changes across surfaces.
      window.dispatchEvent(new StorageEvent("storage", { key: "molis-work:theme", newValue: theme }));
    }
  });
  document.addEventListener("keydown", event => {
    const tab = event.target.closest?.("[data-goal-work-mode]");
    if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = frame.querySelector('[data-goal-work-mode="terminal"]');
      next.click(); next.focus();
    }
    if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
      const openMenu = directoryFilterMenus().find((menu) => menu.open);
      if (openMenu) { event.preventDefault(); openMenu.open = false; openMenu.querySelector("summary")?.focus(); return; }
      if (workspace.classList.contains("is-directory-drawer-open")) { event.preventDefault(); hideDirectory(); }
    }
    if (event.key === "Tab" && workspace.classList.contains("is-directory-drawer-open")) {
      const controls = [...treePane.querySelectorAll('button:not([disabled]), a[href], input, summary, [tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest("[hidden], [inert]"));
      const next = event.shiftKey ? controls.at(-1) : controls[0];
      if ((event.shiftKey && document.activeElement === controls[0]) || (!event.shiftKey && document.activeElement === controls.at(-1))) { event.preventDefault(); next?.focus(); }
    }
  });
  if (frame) new ResizeObserver(() => {
    const saved = modes[getSelected()] || {};
    if (saved.details == null) setDetails(frame.clientWidth >= 840);
    else syncPresence();
  }).observe(frame);
  document.addEventListener("molis-work:goal-document-loaded", () => syncGoalMode(workspace.dataset.workspaceMode));
  document.addEventListener("molis-work:goal-panel-presence", syncPresence);
  window.addEventListener("resize", sync);
  return { sync, syncPresence, syncGoalMode, hideDirectory, showDirectory };
}`;
