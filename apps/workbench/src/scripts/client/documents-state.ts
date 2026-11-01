import { pluginPageClients } from "../../plugin-workbench.js";

const GOALS_PAGE = pluginPageClients("goals");
/** AP3 Workbench client segment: documents-state. */
export const CLIENT_DOCUMENTS_STATE_SCRIPT = `    const isAbortError = (error) => error instanceof DOMException && error.name === "AbortError";

    let reloadGoalEventDocument = async (_goalId, _restore) => false;
    let pendingEventRestore = null;
    const goalEventDocumentApi = (${GOALS_PAGE.goalsEventDocument})({
      documentPane, route, translate: LFor("io.molis.work.goals"), isAbortError,
      showError: (message) => showToast(message, true),
      showStatus: (message) => showToast(message, false),
      reloadDocument: (goalId, restore) => reloadGoalEventDocument(goalId, restore),
      controlHeaders: () => (typeof molisWorkControlHeaders === "function" ? molisWorkControlHeaders() : { "content-type": "application/json" }),
    });
    const bindGoalEventDocument = (...args) => goalEventDocumentApi.bindGoalEventDocument(...args);
    const openEventReader = (name) => goalEventDocumentApi.openEventReader(name);

    const activateFocusSection = (trigger) => {
      const card = trigger?.closest?.("[data-focus-section-card]");
      const deck = card?.closest?.("[data-focus-section-deck]");
      if (!card || !deck) return false;
      const sectionKey = card.dataset.focusSectionCard;
      deck.dataset.activeSection = sectionKey;
      deck.querySelectorAll("[data-focus-section-card-row] > [data-focus-section-card]").forEach((candidate) => {
        const active = candidate === card;
        candidate.classList.toggle("is-active", active);
        const candidateTrigger = candidate.querySelector(":scope > [data-focus-section-trigger]");
        candidateTrigger?.setAttribute("aria-expanded", String(active));
      });
      deck.querySelectorAll(":scope > [data-focus-section-stage] > [data-focus-section-body]").forEach((body) => {
        const active = body.dataset.focusSectionBody === sectionKey;
        body.classList.toggle("is-active", active);
        body?.setAttribute("aria-hidden", String(!active));
        body?.toggleAttribute("inert", !active);
      });
      return true;
    };

    const revealFocusTarget = (target) => {
      const card = target?.closest?.("[data-focus-section-card]");
      const body = target?.closest?.("[data-focus-section-body]");
      const deck = card?.closest?.("[data-focus-section-deck]") || body?.closest?.("[data-focus-section-deck]");
      const sectionKey = card?.dataset?.focusSectionCard || body?.dataset?.focusSectionBody;
      const trigger = sectionKey ? deck?.querySelector?.('[data-focus-section-trigger="' + CSS.escape(sectionKey) + '"]') : null;
      return trigger ? activateFocusSection(trigger) : false;
    };

    const revealDeepLinkTarget = (target) => {
      let disclosure = target?.matches?.("details") ? target : target?.closest?.("details");
      while (disclosure) {
        disclosure.open = true;
        disclosure = disclosure.parentElement?.closest?.("details");
      }
      revealFocusTarget(target);
      return target;
    };

    const revealDeepLinkFromId = async (targetId, behavior = "auto") => {
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return null;
      revealDeepLinkTarget(target);
      requestAnimationFrame(() => target.scrollIntoView({ behavior, block: "start" }));
      return target;
    };

    const { openEventReaderFromHash, eventReaderFromTargetId,
      setGoalFactor, goalFactorFromTargetId, goalFactorFromHash,
      handleGoalFactorClick, handleGoalFactorKeyboard,
    } = (${GOALS_PAGE.goalsPanels})({
      documentPane, activateFocusSection,
      queueSave: () => queueSave(),
      openEventReader,
    });

    const setTuiWidth = (value, persist = true) => {
      if (!tuiResizer || !workspace.classList.contains("is-desktop-tui")) return;
      const width = Math.round(Math.min(720, Math.max(280, Number(value) || 480)));
      workspace.style.setProperty("--tui-width", width + "px");
      tuiResizer.setAttribute("aria-valuenow", String(width));
      if (persist) queueSave();
    };

    const setTreeWidth = (value, persist = true) => {
      const immersive = document.body.classList.contains("immersive-workbench");
      if (immersive ? matchMedia("(max-width: 600px)").matches : matchMedia("(max-width: 760px)").matches && !workspace.classList.contains("is-desktop-tui")) return;
      if (!treeResizer) return;
      const minimum = immersive ? 200 : 260;
      const maximum = immersive ? Math.min(520, innerWidth - 360) : Math.min(520, Math.max(320, innerWidth * 0.48));
      const width = Math.round(Math.min(maximum, Math.max(minimum, Number(value) || 240)));
      workspace.style.setProperty("--tree-width", width + "px");
      treeResizer.setAttribute("aria-valuemin", String(minimum));
      treeResizer.setAttribute("aria-valuemax", String(maximum));
      treeResizer.setAttribute("aria-valuenow", String(width));
      scheduleGoalGraphLayout();
      if (persist) queueSave();
    };

    const setDirectoryCollapsed = (collapsed, persist = true) => {
      const immersiveDesktop = document.body.classList.contains("immersive-workbench") && !matchMedia("(max-width: 600px)").matches;
      const nextCollapsed = immersiveDesktop ? false : Boolean(collapsed);
      if (nextCollapsed && !workspace.classList.contains("is-directory-collapsed")) {
        const currentWidth = Math.round(treePane?.getBoundingClientRect().width || 0);
        if (currentWidth > 44) workspace.style.setProperty("--tree-width", currentWidth + "px");
      }
      workspace.classList.toggle("is-directory-collapsed", nextCollapsed);
      document.querySelectorAll("[data-directory-toggle]").forEach((button) => {
        button.setAttribute("aria-expanded", String(!nextCollapsed));
        button.setAttribute("aria-label", nextCollapsed ? L("展开目录") : L("收起目录"));
        button.setAttribute("title", nextCollapsed ? L("展开目录") : L("收起目录"));
      });
      treeResizer?.setAttribute("aria-hidden", String(nextCollapsed));
      immersiveNavigation?.sync();
      scheduleGoalGraphLayout();
      if (persist) queueSave();
    };

    const readUiState = () => {
      rememberFeedPresetState();
      return ({
      selected,
      collapsed: getCollapsedTreeGoals(),
      disclosures: [...document.querySelectorAll("[data-persist-open][open]")].map((item) => item.dataset.persistOpen),
      treeTop: treeScroll?.scrollTop || 0,
      documentTop: activeDesktopSurface === "goals" ? documentPane.scrollTop : Number(desktopSurfaceScroll.goals || 0),
      workSurface: activeDesktopSurface,
      surfaceScroll: { ...desktopSurfaceScroll, [activeDesktopSurface]: (activeDesktopSurface === "goals" ? documentPane : desktopWorkSurfaces.find(item => item.dataset.workSurface === activeDesktopSurface))?.scrollTop || 0 },
      treeWidth: parseFloat(workspace.style.getPropertyValue("--tree-width")) || (treePane.getBoundingClientRect().width > 44 ? treePane.getBoundingClientRect().width : 240),
      tuiWidth: workspace.classList.contains("is-tui-collapsed")
        ? parseFloat(workspace.style.getPropertyValue("--tui-width")) || undefined
        : tuiPane?.getBoundingClientRect().width,
      statuses: getSelectedStatuses(),
      mobileView: workspace.dataset.mobileView || "tree",
      navigatorView,
      workspaceMode: activeDesktopSurface === "goals" ? workspace.dataset.workspaceMode || "graph" : goalWorkspaceMode,
      ...readMomentumState(),
      navigationVersion: desktopNavigationStateVersion,
      directory: treePane?.dataset.desktopDirectory || "root",
      directoryCollapsed: workspace.classList.contains("is-directory-collapsed"),
      feedPreset: activeFeedPreset,
      feedSelected: selectedFeedItem,
      feedQuery: feedSearch?.value || "",
      feedSource: feedSourceFilter?.value || "all",
      feedType: feedTypeFilter?.value || "all",
      feedTime: feedTimeFilter?.value || "all",
      feedStatus: feedStatusFilter?.value || "active",
      feedSort: feedSort?.value || "newest",
      feedPresets: feedPresetState,
      sourceSelected: selectedSource,
      sourceFilter: activeSourceFilter,
      sourceDetailTab: sourceWorkbench?.querySelector('[data-source-detail="' + CSS.escape(selectedSource) + '"] [data-source-detail-tab][aria-selected="true"]')?.dataset.sourceDetailTab || "overview",
      goalFactor: documentPane.querySelector('[data-goal-factor-tab][aria-selected="true"]')?.dataset.goalFactorTab || "relations",
      });
    };

    const applyUiState = (ui) => {
      desktopSurfaceScroll = ui?.surfaceScroll && typeof ui.surfaceScroll === "object" ? { ...ui.surfaceScroll } : {};
      if (ui?.documentTop != null && desktopSurfaceScroll.goals == null) desktopSurfaceScroll.goals = Number(ui.documentTop || 0);
      goalWorkspaceMode = ui?.workspaceMode || "graph";
      const requestedDesktopSurface = ui?.workSurface === "sources" ? "feed" : (ui?.workSurface || "goals");
      let nextDesktopSurface = desktopWorkSurfaces.some((candidate) => candidate.dataset.workSurface === requestedDesktopSurface)
        ? requestedDesktopSurface
        : "goals";
      if (ui?.treeWidth) setTreeWidth(ui.treeWidth, false);
      if (ui?.tuiWidth) setTuiWidth(ui.tuiWidth, false);
      setDirectoryCollapsed(ui?.directoryCollapsed === true, false);
      if (desktopDirectoryPanels.length) {
        const restoredDirectoryRaw = ui?.navigationVersion === desktopNavigationStateVersion
          ? ui?.directory || "root"
          : "root";
        const restoredDirectory = directoryPanelFor(restoredDirectoryRaw);
        setDesktopDirectory(restoredDirectory, false, false);
      }
      restoreTreeCollapsed(ui?.collapsed);
      const disclosures = new Set(ui?.disclosures || []);
      document.querySelectorAll("[data-persist-open]").forEach((item) => {
        item.open = disclosures.has(item.dataset.persistOpen);
      });
      syncGoalCollectionFolds();
      setSelectedStatuses(ui?.statuses || []);
      restoreMomentumState({
        canvasView: ui?.canvasView,
      });
      filterTree("");
      if (feedDirectory || feedWorkbench) {
        activeFeedPreset = "feed";
        const persistedPresets = ui?.feedPresets && typeof ui.feedPresets === "object"
          ? ui.feedPresets
          : {};
        feedPresetState = {
          feed: { ...defaultFeedPresetState(), ...(persistedPresets.feed || {}) },
        };
        if (!ui?.feedPresets) {
          feedPresetState[activeFeedPreset] = {
            selected: String(ui?.feedSelected || selectedFeedItem || ""),
            query: String(ui?.feedQuery || ""),
            source: ui?.feedSource || "all",
            type: ui?.feedType || "all",
            time: ui?.feedTime || "all",
            status: ui?.feedStatus || "active",
            sort: ui?.feedSort || "newest",
          };
        }
        setFeedPreset(activeFeedPreset, true, "restore");
      }
      if (sourceDirectory) {
        const availableSourceFilters = new Set(["all", "account", "public", "attention"]);
        activeSourceFilter = availableSourceFilters.has(ui?.sourceFilter) ? ui.sourceFilter : "all";
        selectedSource = String(ui?.sourceSelected || selectedSource || "");
        sourceDirectory.querySelectorAll("[data-source-filter]").forEach((button) => {
          const active = button.dataset.sourceFilter === activeSourceFilter;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });
        filterSources(true);
        if (selectedSource) selectSource(selectedSource, false);
      }
      setWorkspaceMode(ui?.workspaceMode || "graph", false, true);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface(nextDesktopSurface, false, false, "restore");
      if (nextDesktopSurface === "feed" && selectedFeedItem) {
        selectFeedItem(selectedFeedItem, false, true, false);
      }
      restoreGoalGraphViewport();
      bindGoalEventDocument();
      openEventReaderFromHash();
      setGoalFactor(goalFactorFromHash() || (ui?.selected === selected ? ui?.goalFactor : "relations"), false);
      const hashTargetId = decodeURIComponent(location.hash.slice(1));
      const hashTarget = hashTargetId ? document.getElementById(hashTargetId) : null;
      if (treeScroll) treeScroll.scrollTop = Number(ui?.treeTop || 0);
      documentPane.scrollTop = hashTarget?.closest?.("[data-event-panel], [data-goal-factor-panel]") && activeDesktopSurface === "goals"
        ? 0
        : activeDesktopSurface === "goals" && ui?.selected === selected
          ? Number(ui?.documentTop || 0)
          : Number(desktopSurfaceScroll[activeDesktopSurface] || 0);
      const restoredMobileView = ui?.mobileView === "tui" || ui?.mobileView === "document" || ui?.mobileView === "tree"
        ? ui.mobileView
        : "tree";
      if (matchMedia("(max-width: 760px)").matches) {
        if (restoredMobileView === "tui") setWorkspaceMode("runtime", false, true);
        else if (restoredMobileView === "document" && workspace.dataset.workspaceMode !== "graph") setWorkspaceMode("focus", false, true);
`;
