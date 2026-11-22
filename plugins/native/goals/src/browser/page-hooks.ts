/** The hooks the Goals page client returns to the shell (specs/page-client-lifecycle §3): each answers one question the shell asks. */
import { GOALS_PLUGIN_ID } from "../identity.js";
import type { dialogsClient } from "./dialogs.js";
import type { lifecycleClient } from "./lifecycle.js";
import type { eventDocumentClient } from "./event-document.js";
import type { frameContainerClient } from "./frame-container.js";
import type { momentumClient } from "./momentum.js";
import type { CanvasView } from "./momentum-viewport.js";
import type { navigationClient } from "./navigation.js";
import { stripCopyIds, type PageHost, type PaneRoot, type PaneShowing, type SavedUi, type WorkbenchTab } from "./page-host.js";
import type { GoalDataElement, PageState, pageRefresh } from "./page-refresh.js";
import type { panelsClient } from "./panels.js";
import type { relationClient } from "./relation.js";
import type { treeClient } from "./tree.js";
import type { GoalListItem, GoalsPageData } from "./types.js";
import type { workFrameClient } from "./work-frame.js";

export interface HookParts {
  readonly host: PageHost;
  readonly page: PageState;
  readonly goalData: GoalDataElement;
  readonly documentPane: HTMLElement;
  readonly treeScroll: HTMLElement | null;
  readonly collectionView: boolean;
  readonly documentCollection: string;
  readonly directGoalRequested: boolean;
  readonly storageKey: string;
  readonly goalMoveReceiptKey: string;
  readonly frameContainer: ReturnType<typeof frameContainerClient> | null;
  readonly workFrame: ReturnType<typeof workFrameClient> | null;
  readonly stageList: { timer: ReturnType<typeof setTimeout> | null };
  readonly visibleGoals: (source?: GoalsPageData) => readonly GoalListItem[];
  readonly applySelection: (goalId: string, resetScroll: boolean) => boolean;
  readonly restoreLastGoal: (openGoalsDirectory?: boolean) => void;
  readonly activateFocusSection: (trigger: Element | null | undefined) => boolean;
  readonly revealFocusTarget: (target: Element | null | undefined) => boolean;
  readonly loadGoalDocument: (goalId: string) => Promise<boolean | null>;
  readonly loadGoalDocumentInto: (targetPane: HTMLElement, goalId: string) => Promise<unknown>;
  readonly announceSelection: (goalId: string, item: GoalListItem | undefined, tui: HTMLElement | null) => void;
  readonly eventDocument: ReturnType<typeof eventDocumentClient>;
  readonly panels: ReturnType<typeof panelsClient>;
  readonly dialogs: ReturnType<typeof dialogsClient>;
  readonly lifecycle: ReturnType<typeof lifecycleClient>;
  readonly momentum: ReturnType<typeof momentumClient>;
  readonly tree: ReturnType<typeof treeClient>;
  readonly relation: ReturnType<typeof relationClient>;
  readonly navigation: ReturnType<typeof navigationClient>;
  readonly refresh: ReturnType<typeof pageRefresh>;
}

type UiPhase = "start" | "tree" | "filters" | "surface" | "end";
const narrow = () => matchMedia("(max-width: 760px)").matches;
const FOCUS_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];

/** The hooks object of the Goals page client. */
export function pageHooks(parts: HookParts) {
  const { host, page, goalData, documentPane, treeScroll, collectionView, documentCollection, directGoalRequested, storageKey, goalMoveReceiptKey,
    frameContainer, workFrame, stageList, visibleGoals, applySelection, restoreLastGoal, activateFocusSection, revealFocusTarget, loadGoalDocument,
    loadGoalDocumentInto, announceSelection, eventDocument, panels, dialogs, lifecycle, momentum, tree, relation, navigation, refresh } = parts;
  const { workspace, directoryPane: treePane, terminalPane: tuiPane, showToast, lifetime, getSurface, setWorkSurface, setDirectory, setWorkspaceMode,
    setMobileView, applyMobilePanePresence, tabs, queueSave, saveUiState, localPathname, openEntryItem, surfaceScroll } = host;
  const { bindGoalEventDocument, openEventReader } = eventDocument;
  const { openEventReaderFromHash, eventReaderFromTargetId, setGoalFactor, goalFactorFromTargetId, goalFactorFromHash } = panels;
  const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
  let goalWorkspaceMode = "graph";
  let loadingGoalId: string | null = null, restoredHashTarget = "";
  const canvasShell = () => workspace.querySelector("[data-goal-canvas-shell]");

  // Goals are drawn by the workbench itself: name the open Goal on its frame and document, as every plugin names its
  // object, so the Assistant and the context actions know it — and a passage selected in it belongs to that Goal.
  const titleForGoal = (goalId: string, fallback?: string) => visibleGoals().find((item) => item.goal.goal_id === goalId)?.goal.title || fallback || goalId;
  const declareGoal = (goalId: string | null | undefined, fallback?: string, targetNode?: Element | null) => {
    const title = goalId ? titleForGoal(goalId, fallback) : "";
    const surface = q('[data-work-surface="goals"]'), tui = q("[data-tui-pane]");
    const pluginId = tui?.dataset.tuiPluginId || GOALS_PLUGIN_ID;
    const subjectKind = tui?.dataset.tuiSubjectKind || "goal";
    const surfaceTitle = surface?.dataset.workSurfaceLabel || "";
    // A pane names its own Goal (102-1); otherwise the page's frame and document name the open one.
    const nodes = targetNode ? [targetNode] : document.querySelectorAll("[data-goal-frame-surface]:not([data-pane-clone]), [data-document-pane]:not([data-pane-clone])");
    nodes.forEach((node) => {
      if (goalId) node.setAttribute("data-assistant-context", JSON.stringify({ plugin_id: pluginId, surface_title: surfaceTitle,
        object: { kind: subjectKind, id: goalId, ...(title ? { title } : {}) },
        belongs_to: { plugin_id: pluginId, kind: subjectKind, id: goalId, title: title || "" } }));
      else node.removeAttribute("data-assistant-context");
    });
  };
  const labelCollapse = (key: string) => {
    const collapse = q("[data-goal-collapse]");
    collapse?.setAttribute("aria-label", globalThis.t.text(key));
    return collapse;
  };
  const announceSubject = (goalId: string) => {
    const tui = q("[data-tui-pane]");
    const pluginId = tui?.dataset.tuiPluginId || GOALS_PLUGIN_ID;
    const subjectKind = tui?.dataset.tuiSubjectKind || "goal";
    document.dispatchEvent(new CustomEvent("molis-work:work-terminal-subject-ready", { detail: { pluginId, subjectKind, subjectId: goalId } }));
  };
  const applyUiState = (ui: SavedUi | null | undefined, phase: UiPhase, scroll: Record<string, number | undefined>) => {
    if (phase === "start") {
      if (ui?.documentTop != null && scroll.goals == null) scroll.goals = Number(ui.documentTop || 0);
      goalWorkspaceMode = typeof ui?.workspaceMode === "string" && ui.workspaceMode ? ui.workspaceMode : "graph";
    } else if (phase === "tree") tree.restoreTreeCollapsed(ui?.collapsed);
    else if (phase === "filters") {
      tree.syncGoalCollectionFolds();
      tree.setSelectedStatuses(ui?.statuses || []);
      momentum.restoreMomentumState({ canvasView: ui?.canvasView as CanvasView | null | undefined });
      tree.filterTree("");
    } else if (phase === "surface") {
      momentum.restoreGoalGraphViewport();
      bindGoalEventDocument();
      openEventReaderFromHash();
      setGoalFactor(goalFactorFromHash() || (ui?.selected === page.selected && typeof ui?.goalFactor === "string" ? ui.goalFactor : "relations"), false);
      restoredHashTarget = decodeURIComponent(location.hash.slice(1));
      const hashTarget = restoredHashTarget ? document.getElementById(restoredHashTarget) : null;
      if (treeScroll) treeScroll.scrollTop = Number(ui?.treeTop || 0);
      documentPane.scrollTop = hashTarget?.closest("[data-event-panel], [data-goal-factor-panel]") && getSurface() === "goals"
        ? 0
        : getSurface() === "goals" && ui?.selected === page.selected
          ? Number(ui?.documentTop || 0)
          : Number(scroll[getSurface()] || 0);
    } else if (phase === "end") {
      if (restoredHashTarget && getSurface() === "goals") void host.revealDeepLinkFromId(restoredHashTarget);
      restoredHashTarget = "";
    }
  };
  const click = (target: Element, event: MouseEvent) => {
    if (tree.handleTreeDisclosureClick(target)) return true;
    if (momentum.handleMomentumNavigationClick(target)) return true;
    if (momentum.handleMomentumSelectionClick(target, event)) return true;
    if (momentum.handleMomentumZoomClick(target)) return true;
    const goalLink = target.closest<HTMLElement>("[data-select-goal]");
    if (goalLink) {
      const goalId = goalLink.dataset.selectGoal || "";
      // A Goal picked inside one pane of a split makes that pane the focused one (102-1).
      const clickedPaneId = goalLink.closest<HTMLElement>("[data-tab-pane]")?.dataset.tabPane;
      if (clickedPaneId) tabs()?.focusPane?.(clickedPaneId);
      if (goalLink.closest("[data-goal-stage-list]")) {
        if (stageList.timer) {
          clearTimeout(stageList.timer);
          stageList.timer = null;
        }
        if (Number(event.detail) > 1) frameContainer?.openFrame(goalId);
        else stageList.timer = setTimeout(() => {
          stageList.timer = null;
          void navigation.selectGoal(goalId);
        }, 220);
        return true;
      }
      openEntryItem("goals", goalId, goalLink.textContent?.trim(), event);
      return true;
    }
    if (dialogs.handleGoalDialogClick(target)) return true;
    const focusSectionTrigger = target.closest<HTMLElement>("[data-focus-section-trigger]");
    if (focusSectionTrigger) {
      const factor = focusSectionTrigger.dataset.goalFactorTab;
      if (factor) setGoalFactor(factor, true, true);
      else activateFocusSection(focusSectionTrigger);
      return true;
    }
    return panels.handleGoalFactorClick(target);
  };
  const keydown = (event: KeyboardEvent) => {
    const currentFocusSection = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-focus-section-trigger]:not([data-goal-factor-tab])") : null;
    if (currentFocusSection && FOCUS_KEYS.includes(event.key)) {
      const triggers = [...(currentFocusSection.closest("[data-focus-section-deck]")?.querySelectorAll<HTMLElement>("[data-focus-section-card-row] > [data-focus-section-card] > [data-focus-section-trigger]") ?? [])];
      const currentIndex = triggers.indexOf(currentFocusSection);
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? triggers.length - 1 : (currentIndex + direction + triggers.length) % triggers.length;
      event.preventDefault();
      const nextTrigger = triggers[nextIndex];
      activateFocusSection(nextTrigger);
      nextTrigger?.focus();
      return true;
    }
    if (panels.handleGoalFactorKeyboard(event)) return true;
    if (tree.handleTreeKeyboard(event)) return true;
    dialogs.handleGoalDialogEscape(event);
    return false;
  };
  const frameTab = (tab: WorkbenchTab | null | undefined) => document.body.dataset.boardView === "current" && tab?.kind === "item" && tab.view !== "work";
  /** A pane copy of the canvas shell showing one Goal's work: its title, status and its own document. */
  const prepareWorkCopy = (shellNode: HTMLElement, goalId: string) => {
    shellNode.dataset.expanded = "true";
    shellNode.querySelectorAll<HTMLElement>(":scope > [data-goal-stage-list], :scope > [data-goal-momentum], :scope > [data-goal-kanban], :scope > [data-goal-stage-chrome]").forEach((child) => { child.hidden = true; });
    const work = shellNode.querySelector<HTMLElement>("[data-goal-node-workspace]");
    const docPane = shellNode.querySelector<HTMLElement>("[data-document-pane]");
    if (work) {
      work.hidden = false;
      if (!work.dataset.detailsOpen) work.dataset.detailsOpen = "true";
      const titleEl = work.querySelector("[data-workspace-goal-title]");
      if (titleEl) titleEl.textContent = titleForGoal(goalId);
      const statusEl = work.querySelector("[data-workspace-goal-status]");
      const source = document.querySelector('[data-goal-id="' + CSS.escape(goalId) + '"] .goal-status');
      if (statusEl && source) {
        statusEl.className = source.className;
        statusEl.innerHTML = source.innerHTML;
      }
      work.querySelector("[data-goal-details-toggle]")?.setAttribute("aria-expanded", String(work.dataset.detailsOpen === "true"));
    }
    if (docPane) {
      docPane.hidden = work ? work.dataset.detailsOpen !== "true" : false;
      docPane.dataset.paneGoalId = goalId;
      docPane.setAttribute("data-pane-clone", "true");
      const shown = docPane.querySelector<HTMLElement>("[data-goal-view]")?.dataset.goalView;
      if (shown !== goalId && docPane.dataset.loadingGoalId !== goalId) {
        docPane.dataset.loadingGoalId = goalId;
        void loadGoalDocumentInto(docPane, goalId).finally(() => {
          if (docPane.dataset.loadingGoalId === goalId) delete docPane.dataset.loadingGoalId;
        });
      }
    }
  };
  /** A pane copy of the canvas shell showing the Goal list. */
  const prepareCanvasCopy = (shellNode: HTMLElement) => {
    shellNode.dataset.expanded = "false";
    shellNode.dataset.boardView = "list";
    const work = shellNode.querySelector<HTMLElement>("[data-goal-node-workspace]");
    if (work) work.hidden = true;
    const primaryList = q("[data-goal-canvas-shell]:not([data-pane-clone]) [data-goal-stage-list]");
    const copyList = shellNode.querySelector<HTMLElement>("[data-goal-stage-list]");
    if (primaryList && copyList) {
      copyList.hidden = false;
      copyList.innerHTML = primaryList.innerHTML;
      stripCopyIds(copyList);
    }
    shellNode.querySelectorAll<HTMLElement>(":scope > [data-goal-momentum], :scope > [data-goal-kanban], :scope > [data-goal-stage-chrome]").forEach((child) => { child.hidden = true; });
  };
  const showTab = (tab: WorkbenchTab, keepFrame: boolean, pane?: PaneShowing) => {
    const node = pane?.node, isClone = Boolean(pane?.isClone), isSplit = Boolean(pane?.isSplit), isFocused = pane ? pane.isFocused : true;
    if (tab.kind === "item" && tab.itemId) {
      const itemId = tab.itemId;
      if (frameTab(tab)) {
        declareGoal(itemId, tab.title, node);
        if (isFocused) applySelection(itemId, false);
        if (frameContainer?.showGoalFrame(itemId, node && (isClone || isSplit) ? node : undefined) !== false) return true;
      }
      if (node && isClone) {
        prepareWorkCopy(node, itemId);
        declareGoal(itemId, tab.title, node.querySelector("[data-document-pane]"));
        return true;
      }
      frameContainer?.releaseFrame();
      declareGoal(itemId, tab.title, node?.querySelector("[data-document-pane]"));
      applySelection(itemId, false);
      const work = (node || workspace).querySelector<HTMLElement>("[data-goal-node-workspace]");
      if (work) work.hidden = false;
      const documentGoalId = documentPane.querySelector<HTMLElement>("[data-goal-view]")?.dataset.goalView;
      if ((documentGoalId !== itemId || loadingGoalId) && loadingGoalId !== itemId) {
        loadingGoalId = itemId;
        void loadGoalDocument(itemId).then((loaded) => {
          if (loaded) {
            workFrame?.syncGoalMode();
            announceSubject(itemId);
          }
        }).finally(() => { if (loadingGoalId === itemId) loadingGoalId = null; });
      }
      setWorkspaceMode("focus", false, true);
      if (node) node.hidden = false;
      labelCollapse("goals.chrome.back-goal-canvas")?.setAttribute("title", globalThis.t.text("goals.chrome.back-goal-canvas"));
      return true;
    }
    if (node && isClone) {
      prepareCanvasCopy(node);
      return true;
    }
    if (isFocused) declareGoal(null);
    frameContainer?.releaseFrame();
    const work = (node || workspace).querySelector<HTMLElement>("[data-goal-node-workspace]");
    if (work && node) work.hidden = true;
    labelCollapse("goals.page-client.collapse-goal-return-canvas");
    if (keepFrame || isSplit) {
      if (node) node.dataset.expanded = "false";
      if (isFocused) {
        setWorkSurface("goals", false, false, "restore");
        setWorkspaceMode("graph", false, true);
      }
      if (node) node.hidden = false;
      return true;
    }
    frameContainer?.restoreBoard();
    return true;
  };
  const paneRoot = (tab: WorkbenchTab | null): PaneRoot => frameTab(tab)
    ? { template: "frame", primary: q("[data-goal-frame-surface]:not([data-pane-clone])"), matches: "[data-goal-frame-surface]" }
    : {
      template: "shell",
      primary: q("[data-goal-canvas-shell]:not([data-pane-clone])") || q("[data-document-pane]:not([data-pane-clone])"),
      matches: "[data-goal-canvas-shell]",
      ...(tab?.kind === "item" ? { mark: { goalWorkClone: "true" } } : {}),
    };
  const paneTemplates = () => {
    const templates: Record<string, Element> = {};
    const frame = q("[data-goal-frame-surface]:not([data-pane-clone])");
    if (frame) {
      const copy = frame.cloneNode(true) as HTMLElement;
      copy.querySelector("[data-frame-picker]")?.remove();
      templates.frame = copy;
    }
    const shell = q("[data-goal-canvas-shell]:not([data-pane-clone])");
    if (shell) templates.shell = shell.cloneNode(true) as HTMLElement;
    return templates;
  };
  const showReceipts = () => {
    try {
      const goalMoveReceipt = JSON.parse(sessionStorage.getItem(goalMoveReceiptKey) || "null") as { message?: string } | null;
      sessionStorage.removeItem(goalMoveReceiptKey);
      if (goalMoveReceipt?.message) showToast(goalMoveReceipt.message);
    } catch {
      sessionStorage.removeItem(goalMoveReceiptKey);
    }
    try {
      const storedDecisionReceipt = JSON.parse(sessionStorage.getItem("molis-work-decision-receipt") || "null") as { message?: string; context?: unknown } | null;
      sessionStorage.removeItem("molis-work-decision-receipt");
      if (storedDecisionReceipt?.message) refresh.showDecisionReceipt(storedDecisionReceipt.message, storedDecisionReceipt.context as Parameters<typeof refresh.showDecisionReceipt>[1]);
    } catch {
      sessionStorage.removeItem("molis-work-decision-receipt");
    }
    if (page.selected && tuiPane) {
      try {
        announceSelection(page.selected, visibleGoals().find((entry) => entry.goal.goal_id === page.selected), tuiPane);
      } catch { /* a listener that fails does not stop the selection */ }
    }
  };
  const run = () => {
    relation.updateRelationPreviews();
    relation.updateAllRelationFormPreviews();
    // Off the Goal stage, fold attention hints into the next board poll (W4-10).
    // Goals' snapshot cursor belongs to another journal; neither projection has acknowledged a platform cursor yet.
    const scope = lifetime();
    scope.poll(async signal => {
      page.boardVisibleSignal = signal;
      if (refresh.goalStageVisible()) await refresh.refreshBoard(false, signal);
      else if (page.observedBoardCursor !== undefined && page.observedBoardCursor !== goalData.boardCursor) await refresh.refreshBoard(false, signal, page.observedBoardCursor);
      const failure = refresh.takeFailure();
      if (failure) throw failure;
    }, 4000);
    scope.listen(document, "molis-work:attention", event => {
      const cursor = (event.detail as { board_cursor?: unknown } | null)?.board_cursor;
      if (typeof cursor !== "number") return;
      page.observedBoardCursor = Math.max(page.observedBoardCursor ?? cursor, cursor);
      if (refresh.goalStageVisible()) void refresh.refreshBoard(false, page.boardVisibleSignal, page.observedBoardCursor);
    });
    const refreshVisibleGoal = () => { if (refresh.goalStageVisible()) void refresh.refreshBoard(); };
    scope.listen(document, "molis-work:place-changed", () => requestAnimationFrame(refreshVisibleGoal));
    scope.listen(window, "resize", refreshVisibleGoal);
    // Splitting, unsplitting or narrowing the workspace changes which Goal panes show (102-1).
    const tabWorkspaceRoot = q("[data-tab-workspace]");
    if (tabWorkspaceRoot) {
      const observer = new MutationObserver(() => requestAnimationFrame(refreshVisibleGoal));
      observer.observe(tabWorkspaceRoot, { attributes: true, attributeFilter: ["data-solo", "data-split-narrow", "data-exclusive"] });
      scope.own(() => observer.disconnect());
    }
    scope.own(() => clearTimeout(page.deferredRefreshTimer));
  };

  return {
    surface: "goals",
    uiScope: () => documentCollection,
    uiScopes: ["current", "archive", "trash"],
    retiredUi: (ui: object) => Object.hasOwn(ui, "goalView"),
    readUiState: () => ({
      selected: page.selected, collapsed: tree.getCollapsedTreeGoals(), treeTop: treeScroll?.scrollTop || 0,
      documentTop: getSurface() === "goals" ? documentPane.scrollTop : Number(surfaceScroll("goals") || 0),
      statuses: tree.getSelectedStatuses(), ...momentum.readMomentumState(),
      workspaceMode: getSurface() === "goals" ? workspace.dataset.workspaceMode || "graph" : goalWorkspaceMode,
      goalFactor: documentPane.querySelector<HTMLElement>('[data-goal-factor-tab][aria-selected="true"]')?.dataset.goalFactorTab || "relations",
    }),
    applyUiState,
    scrollPane: () => documentPane,
    surfaceSet: () => frameContainer?.sync(),
    open: () => restoreLastGoal(true),
    hidden: () => { goalWorkspaceMode = workspace.dataset.workspaceMode || "graph"; },
    workspaceMode: () => goalWorkspaceMode,
    shown: () => {
      if (getSurface() === "goals" && !collectionView && !visibleGoals().length && !q("dialog[open]")) dialogs.openCreate();
    },
    graph: () => momentum.graphElement(),
    mode: (nextMode: string, { persist, preserveMobile, syncNavigator }: { persist?: boolean; preserveMobile?: boolean; syncNavigator: () => void }) => {
      if (canvasShell() && getSurface() === "goals") {
        documentPane.hidden = false;
        if (tuiPane) tuiPane.hidden = false;
        momentum.syncGoalWorkspace(nextMode, true);
        momentum.graphElement()?.removeAttribute("hidden");
        workFrame?.syncGoalMode();
        syncNavigator();
        if (narrow()) {
          if (!preserveMobile) setMobileView("document");
        } else applyMobilePanePresence();
        if (persist) queueSave();
        return true;
      }
      momentum.syncGoalWorkspace(nextMode, false);
      documentPane.hidden = nextMode !== "focus";
      return false;
    },
    modeShown: (nextMode: string) => {
      const graph = momentum.graphElement();
      if (graph && !canvasShell()) graph.hidden = nextMode !== "graph";
      if (nextMode === "graph" && !canvasShell()) {
        if (graph?.dataset.loaded === "true") momentum.updateGraphVisibility();
        else void momentum.loadGoalGraph();
      }
    },
    presence: ({ narrow: isNarrow, view }: { narrow: boolean; view: string }) => {
      const canvas = workspace.querySelector<HTMLElement>('[data-goal-canvas-shell][data-goal-active="true"]');
      if (!canvas) return false;
      const graph = workspace.querySelector("[data-goal-momentum]");
      treePane.toggleAttribute("inert", isNarrow && view !== "tree");
      canvas.toggleAttribute("inert", isNarrow && view === "tree");
      documentPane.removeAttribute("inert");
      tuiPane?.toggleAttribute("inert", Boolean(documentPane.querySelector(".goal-event-document.is-editing-goal")));
      graph?.toggleAttribute("inert", canvas.dataset.expanded === "true");
      return true;
    },
    panes: () => ({ document: documentPane, graph: workspace.querySelector("[data-goal-momentum]") }),
    immersivePresence: () => workFrame?.presence(),
    layout: () => momentum.scheduleGoalGraphLayout(),
    selected: () => page.selected,
    reveal: (target: Element) => revealFocusTarget(target),
    searchActivity: () => refresh.scheduleDeferredRefresh(),
    click,
    anchor: (targetId: string) => {
      const reader = eventReaderFromTargetId(targetId), factor = goalFactorFromTargetId(targetId);
      if (!reader && !factor) return null;
      return () => {
        if (reader) openEventReader(reader);
        if (factor) setGoalFactor(factor, true);
      };
    },
    clickAfter: (target: Element) => relation.handleGoalRelationDisclosureClick(target) || lifecycle.handleGoalLifecycleClick(target) || false,
    keydown,
    popstate: (event: PopStateEvent) => {
      if (localPathname() === "/" && !collectionView) return false;
      navigation.handleGoalPopState(event);
      return true;
    },
    createCommand: () => ({ title: globalThis.t.text("goals.page-client.new-goal"), keywords: "新建目标 create goal", selector: "[data-open-create]" }),
    searchRoot: "[data-goal-frame-surface]",
    openSearchHit: (id: string, title: string) => {
      tabs()?.openItem("goals", id, title, undefined, "commit");
      requestAnimationFrame(() => q('[data-tree-item][data-goal-id="' + CSS.escape(id) + '"]')?.scrollIntoView({ block: "nearest" }));
      return true;
    },
    tabRoot: (tab: WorkbenchTab) => frameTab(tab) ? q("[data-goal-frame-surface]:not([data-pane-clone])") : undefined,
    topLevel: () => q("[data-goal-canvas-shell]:not([data-pane-clone])") || q("[data-document-pane]:not([data-pane-clone])"),
    paneRoot,
    paneTemplates,
    showPaneView: (node: HTMLElement) => prepareCanvasCopy(node),
    itemTitle: (itemId: string, fallback?: string) => titleForGoal(itemId, fallback),
    itemView: (view: string | undefined) => view === "frame" ? undefined : view,
    // Goals tabs name their Goal when shown (showTab); any other focused tab clears the page's naming.
    declare: (tab: WorkbenchTab | null | undefined) => { if (tab?.plugin !== "goals") declareGoal(null); },
    focusItem: (itemId: string) => applySelection(itemId, false),
    withItem: (itemId: string, act: () => void) => {
      const loading = loadingGoalId;
      loadingGoalId = itemId;
      act();
      if (loadingGoalId === itemId) loadingGoalId = loading;
    },
    showDefault: () => {
      labelCollapse("goals.page-client.collapse-goal-return-canvas");
      frameContainer?.restoreBoard();
      return true;
    },
    showTab,
    addressed: () => directGoalRequested,
    ownsAddress: () => directGoalRequested || collectionView,
    addressItem: () => directGoalRequested && page.selected ? { plugin: "goals", itemId: page.selected } : null,
    fresh: () => {
      bindGoalEventDocument();
      openEventReaderFromHash();
      const initialFactor = goalFactorFromHash();
      if (initialFactor) setGoalFactor(initialFactor, false);
    },
    arrive: ({ tabsReady, restoredNavigation }: { tabsReady: boolean; restoredNavigation: boolean }) => {
      if (!tabsReady && !directGoalRequested && !restoredNavigation && !collectionView) goalWorkspaceMode = "graph";
      if (!tabsReady && directGoalRequested && page.selected && !restoredNavigation) {
        goalWorkspaceMode = "focus";
        setDirectory("goals", false, false);
        setWorkSurface("goals", false, false);
        setWorkspaceMode("focus", false);
        if (narrow()) setMobileView("document");
        saveUiState();
      }
      if (directGoalRequested && page.selected && !restoredNavigation && tabsReady) {
        setDirectory("goals", false, false);
        applySelection(page.selected, false);
        setWorkspaceMode("focus", false);
        if (narrow()) setMobileView("document");
        saveUiState();
      }
    },
    receipts: showReceipts,
    settle: () => frameContainer?.restore(),
    afterTabs: (restoredUi: unknown) => {
      if (!restoredUi) return;
      try {
        const restored = JSON.parse(sessionStorage.getItem(storageKey) || "null") as { statuses?: unknown } | null;
        if (Array.isArray(restored?.statuses) && restored.statuses.length) {
          tree.setSelectedStatuses(restored.statuses);
          tree.filterTree("");
        }
      } catch { /* unreadable saved filters keep the defaults */ }
    },
    run,
  };
}
