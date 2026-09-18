import { GOALS_PANELS_CLIENT_FACTORY_SCRIPT, GOALS_EVENT_DOCUMENT_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-goals";
/** AP3 Workbench client segment: documents-state. */
export const CLIENT_DOCUMENTS_STATE_SCRIPT = `    const isAbortError = (error) => error instanceof DOMException && error.name === "AbortError";

    let reloadGoalEventDocument = async (_goalId, _restore) => false;
    let pendingEventRestore = null;
    const goalEventDocumentApi = (${GOALS_EVENT_DOCUMENT_CLIENT_FACTORY_SCRIPT})({
      documentPane, route, translate: L, isAbortError,
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

    const decisionActionSelector = "[data-goal-tree-decision-form]";

    const activateDecisionFeedItem = (itemId) => {
      const goalId = String(itemId || "").startsWith("decision:") ? String(itemId).slice("decision:".length) : "";
      if (goalId) {
        location.assign(route("/goals/" + encodeURIComponent(goalId)));
        return null;
      }
      return null;
    };

    const revealDeepLinkTarget = (target) => {
      const decisionDetail = target?.matches?.("[data-feed-detail^='decision:']")
        ? target
        : target?.closest?.("[data-feed-detail^='decision:']");
      let scrollTarget = target;
      if (decisionView && decisionDetail && feedList && feedWorkbench) {
        const itemId = decisionDetail.dataset.feedDetail;
        activateDecisionFeedItem(itemId);
        scrollTarget = decisionDetail.querySelector(decisionActionSelector) || target;
      }
      let disclosure = target?.matches?.("details") ? target : target?.closest?.("details");
      while (disclosure) {
        disclosure.open = true;
        disclosure = disclosure.parentElement?.closest?.("details");
      }
      revealFocusTarget(target);
      return scrollTarget;
    };

    const deepLinkTargetFromId = (targetId) => {
      const directTarget = targetId ? document.getElementById(targetId) : null;
      if (directTarget || !decisionView || !targetId?.startsWith("decision-goal-")) return directTarget;
      const goalId = targetId.slice("decision-goal-".length);
      const itemId = "decision:" + goalId;
      return [...(feedWorkbench?.querySelectorAll("[data-feed-detail]") || [])]
        .find((candidate) => candidate.dataset.feedDetail === itemId) || null;
    };

    const revealDeepLinkFromId = async (targetId, behavior = "auto") => {
      const legacyDecisionGoalId = targetId?.startsWith("decision-goal-")
        ? targetId.slice("decision-goal-".length)
        : "";
      if (legacyDecisionGoalId) {
        location.assign(route("/goals/" + encodeURIComponent(legacyDecisionGoalId)));
        return null;
      }
      let target = deepLinkTargetFromId(targetId);
      if (!target) return null;
      const scrollTarget = revealDeepLinkTarget(target);
      requestAnimationFrame(() => {
        scrollTarget.scrollIntoView({ behavior, block: "start" });
        if (scrollTarget.matches?.(decisionActionSelector)) {
          scrollTarget.setAttribute("tabindex", "-1");
          if (!scrollTarget.hasAttribute("aria-label")) {
            scrollTarget.setAttribute(
              "aria-label",
              scrollTarget.querySelector('button[type="submit"]')?.textContent?.trim() || L("待处理决定"),
            );
          }
          scrollTarget.focus({ preventScroll: true });
        }
      });
      return target;
    };

    const { openEventReaderFromHash, eventReaderFromTargetId,
      setGoalFactor, goalFactorFromTargetId, goalFactorFromHash,
      handleGoalFactorClick, handleGoalFactorKeyboard,
    } = (${GOALS_PANELS_CLIENT_FACTORY_SCRIPT})({
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
      const nextCollapsed = Boolean(collapsed);
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
      documentTop: activeDesktopSurface === "goal" ? documentPane.scrollTop : Number(desktopSurfaceScroll.goal || 0),
      workSurface: activeDesktopSurface,
      surfaceScroll: { ...desktopSurfaceScroll, [activeDesktopSurface]: (activeDesktopSurface === "goal" ? documentPane : desktopWorkSurfaces.find(item => item.dataset.workSurface === activeDesktopSurface))?.scrollTop || 0 },
      treeWidth: parseFloat(workspace.style.getPropertyValue("--tree-width")) || (treePane.getBoundingClientRect().width > 44 ? treePane.getBoundingClientRect().width : 240),
      tuiWidth: workspace.classList.contains("is-tui-collapsed")
        ? parseFloat(workspace.style.getPropertyValue("--tui-width")) || undefined
        : tuiPane?.getBoundingClientRect().width,
      query: treeSearch?.value || "",
      statuses: getSelectedStatuses(),
      mobileView: workspace.dataset.mobileView || "tree",
      navigatorView,
      workspaceMode: activeDesktopSurface === "goal" ? workspace.dataset.workspaceMode || "focus" : goalWorkspaceMode,
      ...readMomentumState(),
      navigationVersion: desktopNavigationStateVersion,
      directory: treePane?.dataset.desktopDirectory || "root",
      directoryCollapsed: workspace.classList.contains("is-directory-collapsed"),
      directoryCollapsedSections: [...document.querySelectorAll("[data-plugin-section][data-plugin-expanded='false']")].map((section) => section.dataset.pluginSection).filter(Boolean),
      feedPreset: activeFeedPreset,
      feedSelected: selectedFeedItem,
      feedTask: selectedFeedTask || "all",
      feedQuery: feedSearch?.value || "",
      feedSource: feedSourceFilter?.value || "all",
      feedType: feedTypeFilter?.value || "all",
      feedTime: feedTimeFilter?.value || "all",
      feedStatus: feedStatusFilter?.value || "active",
      feedSort: feedSort?.value || "newest",
      feedPresets: feedPresetState,
      sourceSelected: selectedSource,
      sourceQuery: sourceSearch?.value || "",
      sourceFilter: activeSourceFilter,
      sourceDetailTab: sourceWorkbench?.querySelector('[data-source-detail="' + CSS.escape(selectedSource) + '"] [data-source-detail-tab][aria-selected="true"]')?.dataset.sourceDetailTab || "overview",
      goalFactor: documentPane.querySelector('[data-goal-factor-tab][aria-selected="true"]')?.dataset.goalFactorTab || "relations",
      });
    };

    const applyUiState = (ui) => {
      desktopSurfaceScroll = ui?.surfaceScroll && typeof ui.surfaceScroll === "object" ? { ...ui.surfaceScroll } : {};
      if (ui?.documentTop != null && desktopSurfaceScroll.goal == null) desktopSurfaceScroll.goal = Number(ui.documentTop || 0);
      goalWorkspaceMode = ui?.workspaceMode || "focus";
      const requestedDesktopSurface = ui?.workSurface === "sources" ? "feed" : (ui?.workSurface || (decisionView ? "inbox" : "goal"));
      let nextDesktopSurface = desktopWorkSurfaces.some((candidate) => candidate.dataset.workSurface === requestedDesktopSurface)
        ? requestedDesktopSurface
        : decisionView ? "inbox" : "goal";
      if (ui?.treeWidth) setTreeWidth(ui.treeWidth, false);
      if (ui?.tuiWidth) setTuiWidth(ui.tuiWidth, false);
      setDirectoryCollapsed(ui?.directoryCollapsed === true, false);
      if (desktopDirectoryPanels.length) {
        const restoredDirectoryRaw = ui?.navigationVersion === desktopNavigationStateVersion
          ? ui?.directory || "root"
          : "root";
        const restoredDirectory = directoryPanelFor(restoredDirectoryRaw);
        setDesktopDirectory(restoredDirectory, false, false);
        const collapsedSections = new Set(Array.isArray(ui?.directoryCollapsedSections) ? ui.directoryCollapsedSections : []);
        document.querySelectorAll("[data-plugin-expand]").forEach((toggle) => {
          const id = toggle.dataset.pluginExpand;
          if (id) setPluginSectionExpanded(id, !collapsedSections.has(id), false);
        });
      }
      restoreTreeCollapsed(ui?.collapsed);
      const disclosures = new Set(ui?.disclosures || []);
      document.querySelectorAll("[data-persist-open]").forEach((item) => {
        item.open = disclosures.has(item.dataset.persistOpen);
      });
      syncGoalCollectionFolds();
      if (treeSearch) treeSearch.value = "";
      setSelectedStatuses(ui?.statuses || []);
      restoreMomentumState({
        canvasView: ui?.canvasView,
      });
      filterTree("");
      if (feedDirectory) {
        const deepLinkedDecisionEntry = decisionFeedEntryFromHash();
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
            task: String(ui?.feedTask || ui?.sourceSelected || "all"),
            query: String(ui?.feedQuery || ""),
            source: ui?.feedSource || "all",
            type: ui?.feedType || "all",
            time: ui?.feedTime || "all",
            status: ui?.feedStatus || "active",
            sort: ui?.feedSort || "newest",
          };
        }
        if (ui?.directory === "sources" || ui?.workSurface === "sources") {
          feedPresetState.feed = {
            ...feedPresetState.feed,
            task: String(ui?.sourceSelected || feedPresetState.feed.task || "all"),
          };
        }
        if (deepLinkedDecisionEntry) {
          feedPresetState.feed = {
            ...feedPresetState.feed,
            selected: deepLinkedDecisionEntry,
            query: "",
            source: "all",
            type: "all",
            time: "all",
            status: "active",
          };
        }
        setFeedPreset(activeFeedPreset, true);
      }
      if (sourceDirectory) {
        const availableSourceFilters = new Set(["all", "account", "public", "attention"]);
        activeSourceFilter = availableSourceFilters.has(ui?.sourceFilter) ? ui.sourceFilter : "all";
        selectedSource = String(ui?.sourceSelected || selectedSource || "");
        if (sourceSearch) sourceSearch.value = String(ui?.sourceQuery || "");
        sourceDirectory.querySelectorAll("[data-source-filter]").forEach((button) => {
          const active = button.dataset.sourceFilter === activeSourceFilter;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });
        filterSources(true);
        if (selectedSource) selectSource(selectedSource, false);
      }
      setWorkspaceMode(ui?.workspaceMode || (ui?.navigatorView === "graph" ? "graph" : "focus"), false, true);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface(nextDesktopSurface, false, false);
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
      documentPane.scrollTop = hashTarget?.closest?.("[data-event-panel], [data-goal-factor-panel]") && activeDesktopSurface === "goal"
        ? 0
        : activeDesktopSurface === "goal" && ui?.selected === selected
          ? Number(ui?.documentTop || 0)
          : Number(desktopSurfaceScroll[activeDesktopSurface] || 0);
      const restoredMobileView = ui?.mobileView === "tui" || ui?.mobileView === "document" || ui?.mobileView === "tree"
        ? ui.mobileView
        : "tree";
      if (matchMedia("(max-width: 760px)").matches) {
        if (restoredMobileView === "tui") setWorkspaceMode("runtime", false, true);
        else if (restoredMobileView === "document" && workspace.dataset.workspaceMode !== "graph") setWorkspaceMode("focus", false, true);
`;
