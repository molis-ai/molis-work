import { GOALS_PLUGIN_ID } from "../identity.js";
import { dialogsClient } from "./dialogs.js";
import { documentClient } from "./document.js";
import { elementOf } from "./dom.js";
import { type EventRestore, eventDocumentClient } from "./event-document.js";
import { frameContainerClient } from "./frame-container.js";
import { lifecycleClient } from "./lifecycle.js";
import { momentumClient } from "./momentum.js";
import { navigationClient } from "./navigation.js";
import { stripCopyIds, type PageHost } from "./page-host.js";
import { pageHooks } from "./page-hooks.js";
import { type GoalDataElement, type PageState, pageRefresh } from "./page-refresh.js";
import { panelsClient } from "./panels.js";
import { proposalClient } from "./proposal.js";
import { refreshClient } from "./refresh.js";
import { relationClient } from "./relation.js";
import { treeClient } from "./tree.js";
import type { GoalsPageData } from "./types.js";
import { workFrameClient } from "./work-frame.js";

/**
 * The Goals page client (specs/page-client-lifecycle): the one factory this plugin registers as `workbench.pageClient`. The
 * shell's page script calls it with its own ports (`host`) and calls the hooks it returns; everything about Goals on the page
 * the shell draws — the page data, the selected Goal, list or graph, the archive and trash views, the board refresh, the
 * canvas, board and Goal frames, the keyboard and the address — lives here. It returns `null` on a page without Goals' data.
 */
export function goalsPageClient(host: PageHost) {
  const goalData = document.querySelector<GoalDataElement>("#molis-work-data");
  const documentPane = document.querySelector<HTMLElement>("[data-document-pane]");
  if (!goalData || !documentPane) return null;
  const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
  const { workspace, route, showToast, isAbortError, requireFormFacts, lifetime, getSurface, setWorkSurface, setDirectory,
    setWorkspaceMode, setMobileView, tabs, immersive, queueSave, saveUiState, localPathname, uiStorageKey, navigationVersion } = host;
  const treeScroll = q("[data-tree-scroll]");
  const treeFilter = q("[data-tree-filter]");
  const treeFilterTrigger = q("[data-tree-filter-trigger]");
  const dialog = q<HTMLDialogElement>("[data-create-dialog]");
  const form = q<HTMLFormElement>("[data-create-form]");
  const archiveView = document.body.dataset.boardView === "archive";
  const trashView = document.body.dataset.boardView === "trash";
  const collectionView = archiveView || trashView;
  const documentCollection = trashView ? "trash" : archiveView ? "archive" : "current";
  const initialState = JSON.parse(goalData.textContent || "null") as GoalsPageData;
  const page: PageState = {
    state: initialState,
    selected: q("[data-goal-view]:not([hidden])")?.dataset.goalView || (collectionView ? "" : initialState.active_goal_id) || "",
    documentCursor: undefined, documentReplaceGeneration: 0, boardVisibleSignal: null, observedBoardCursor: undefined, deferredRefreshTimer: undefined,
  };
  const visibleGoals = (source: GoalsPageData = page.state) => trashView ? source.trashed_goals : archiveView ? source.archived_goals : source.goals;
  const projectId = page.state.project?.project_id || page.state.snapshot.board.project_id;
  const currentGoalUiStorageKey = uiStorageKey + ":current";
  const storageKey = uiStorageKey + ":" + documentCollection;
  const goalMoveReceiptKey = "molis-work-goal-move-receipt:" + projectId;
  const initialHistoryState = history.state && typeof history.state === "object" ? history.state : {};
  history.replaceState({ ...initialHistoryState, goalId: page.selected }, "", location.href);
  let frameContainer: ReturnType<typeof frameContainerClient> | null = null;
  let workFrame: ReturnType<typeof workFrameClient> | null = null;
  const directGoalRequested = /^\/(?:archive\/|trash\/)?goals\/[^/]+\/?$/.test(localPathname());
  const navigate = (url: string) => location.assign(globalThis.molisWorkNavigationUrl(url));

  const restoreLastGoal = (openGoalsDirectory = false) => {
    let goalId = "";
    try {
      const goalUi = JSON.parse(sessionStorage.getItem(currentGoalUiStorageKey) || sessionStorage.getItem(uiStorageKey) || "null") as { selected?: unknown } | null;
      goalId = String(goalUi?.selected || "");
      if (openGoalsDirectory) {
        const nextGoalUi = goalUi && typeof goalUi === "object" ? goalUi : {};
        sessionStorage.setItem(currentGoalUiStorageKey, JSON.stringify({ ...nextGoalUi, navigationVersion, directory: "goals", workSurface: "goals" }));
      }
    } catch { /* unreadable saved state opens no Goal */ }
    const available = new Set(visibleGoals().map((item) => item.goal.goal_id));
    if (!available.has(goalId)) goalId = page.state.active_goal_id || "";
    navigate(goalId ? route("/goals/" + encodeURIComponent(goalId)) : route("/"));
  };

  let pendingEventRestore: EventRestore | null = null;
  const eventDocument = eventDocumentClient({
    documentPane, route, isAbortError,
    showError: (message) => showToast(message, true),
    showStatus: (message) => showToast(message, false),
    reloadDocument: (goalId, restore) => {
      pendingEventRestore = restore || null;
      return loadGoalDocument(goalId);
    },
  });
  const { bindGoalEventDocument, openEventReader } = eventDocument;

  const activateFocusSection = (trigger: Element | null | undefined) => {
    const card = trigger?.closest<HTMLElement>("[data-focus-section-card]");
    const deck = card?.closest<HTMLElement>("[data-focus-section-deck]");
    if (!card || !deck) return false;
    const sectionKey = card.dataset.focusSectionCard;
    deck.dataset.activeSection = sectionKey;
    deck.querySelectorAll("[data-focus-section-card-row] > [data-focus-section-card]").forEach((candidate) => {
      const active = candidate === card;
      candidate.classList.toggle("is-active", active);
      candidate.querySelector(":scope > [data-focus-section-trigger]")?.setAttribute("aria-expanded", String(active));
    });
    deck.querySelectorAll<HTMLElement>(":scope > [data-focus-section-stage] > [data-focus-section-body]").forEach((body) => {
      const active = body.dataset.focusSectionBody === sectionKey;
      body.classList.toggle("is-active", active);
      body.setAttribute("aria-hidden", String(!active));
      body.toggleAttribute("inert", !active);
    });
    return true;
  };
  const revealFocusTarget = (target: Element | null | undefined) => {
    const card = target?.closest<HTMLElement>("[data-focus-section-card]");
    const body = target?.closest<HTMLElement>("[data-focus-section-body]");
    const deck = card?.closest("[data-focus-section-deck]") || body?.closest("[data-focus-section-deck]");
    const sectionKey = card?.dataset.focusSectionCard || body?.dataset.focusSectionBody;
    const trigger = sectionKey ? deck?.querySelector('[data-focus-section-trigger="' + CSS.escape(sectionKey) + '"]') : null;
    return trigger ? activateFocusSection(trigger) : false;
  };

  const panels = panelsClient({ documentPane, activateFocusSection, queueSave: () => queueSave(), openEventReader });
  const { openEventReaderFromHash, setGoalFactor, goalFactorFromHash } = panels;
  const relation = relationClient({
    form, route,
    refreshBoard: (force) => refresh.refreshBoard(force),
    requireFormFacts: (submitted, errorBox) => requireFormFacts(submitted, errorBox),
    requireDecisionText: (...args) => proposal.requireDecisionText(...args),
    showFactorReceipt: (...args) => refresh.showFactorReceipt(...args),
    humanDecisionError: (...args) => proposal.humanDecisionError(...args),
  });
  const goalPageBase = () => route(trashView ? "/trash/goals/" : archiveView ? "/archive/goals/" : "/goals/");
  const goalPageUrl = (goalId: string) => goalPageBase() + encodeURIComponent(goalId) + (document.body.dataset.nativeDesktop === "true" ? "?desktop=1" : "");
  const dialogs = dialogsClient({
    dialog, form, route,
    refreshBoard: (force) => refresh.refreshBoard(force), updateRelationPreviews: relation.updateRelationPreviews,
    clearCollectionUiState: () => sessionStorage.removeItem(storageKey),
    clearCurrentGoalUiState: () => sessionStorage.removeItem(currentGoalUiStorageKey),
    navigate,
  });
  const lifecycle = lifecycleClient({ route, showToast, navigate });
  const momentum = momentumClient({
    workspace, documentCollection, route,
    selectGoal: (goalId) => navigation.selectGoal(goalId),
    openFrame: (id) => frameContainer?.openFrame(id),
    applySelection: (id) => applySelection(id, false),
    isFrameTabActive: () => frameContainer?.isFrameTabActive() === true,
    isKanbanTabActive: () => frameContainer?.isKanbanTabActive() === true,
    getSelected: () => page.selected,
    queueSave: () => queueSave(), setWorkspaceMode: (...args) => setWorkspaceMode(...args),
  });
  const tree = treeClient({ treeFilter, treeFilterTrigger, treeScroll, updateGraphVisibility: momentum.updateGraphVisibility, queueSave, saveUiState });

  const announceSelection = (goalId: string, item: { goal: { title: string }; status?: string; status_label?: string; status_meaning?: string; status_icon?: string; terminal_read_only?: unknown } | undefined, tui: HTMLElement | null) => {
    const terminalPluginId = tui?.dataset.tuiPluginId || GOALS_PLUGIN_ID;
    const terminalSubjectKind = tui?.dataset.tuiSubjectKind || "goal";
    if (tui) {
      tui.setAttribute("data-tui-plugin-id", terminalPluginId);
      tui.setAttribute("data-tui-subject-kind", terminalSubjectKind);
      tui.setAttribute("data-tui-subject-id", goalId);
    }
    document.dispatchEvent(new CustomEvent("molis-work:work-terminal-subject-changed", { detail: {
      pluginId: terminalPluginId, subjectKind: terminalSubjectKind, subjectId: goalId,
      title: item?.goal.title || goalId, status: item?.status || "", statusLabel: item?.status_label || "", statusMeaning: item?.status_meaning || "",
      statusIconMarkup: item?.status_icon || "", readOnly: item?.terminal_read_only || null,
    } }));
    document.dispatchEvent(new CustomEvent("molis-work:record-selected", { detail: {
      plugin: q('[data-work-surface="goals"]')?.dataset.workSurface || "goals", itemId: goalId, title: item?.goal.title || goalId,
    } }));
  };
  const applySelection = (goalId: string, resetScroll: boolean) => {
    const item = visibleGoals().find((entry) => entry.goal.goal_id === goalId);
    if (!item) return false;
    page.selected = goalId;
    momentum.rememberMomentumGoal();
    announceSelection(goalId, item, q("[data-tui-pane]"));
    tree.selectTreeGoal(goalId);
    if (workspace.dataset.navigatorView === "graph") momentum.updateGraphVisibility();
    const titleState = tabs()?.state?.();
    const titlePane = titleState && (titleState.panes.find((pane) => pane.id === titleState.focusedPaneId) || titleState.panes[0]);
    const titleTab = titlePane?.tabs.find((tab) => tab.id === titlePane.activeTabId);
    const ownsTitle = !titleState || (!titleState.exclusive && (tabs()?.isEmbedded()
      ? getSurface() === "goals"
      : titleTab?.plugin === "goals" && titleTab.kind === "item" && titleTab.itemId === goalId));
    if (ownsTitle) document.title = item.goal.title + " · Molis Work";
    if (resetScroll && getSurface() === "goals") documentPane.scrollTop = 0;
    immersive()?.sync();
    return true;
  };

  const { loadGoalDocument } = documentClient({
    documentPane, documentCollection, route, isAbortError,
    showError: (message) => showToast(message, true),
    afterReplace: () => {
      page.documentReplaceGeneration += 1;
      page.documentCursor = goalData.boardCursor;
      documentPane.dataset.boardCursor = page.documentCursor == null ? "" : String(page.documentCursor);
      relation.updateAllRelationFormPreviews();
      bindGoalEventDocument(pendingEventRestore);
      pendingEventRestore = null;
      openEventReaderFromHash();
      setGoalFactor(goalFactorFromHash() || "relations", false);
    },
  });
  // A split pane's copy of a Goal document loads and binds its own events, apart from the page's document (102-1).
  const copiedDocuments = new WeakMap<HTMLElement, { events: ReturnType<typeof eventDocumentClient>; load: (goalId: string, restore?: EventRestore | null) => Promise<boolean | null> }>();
  const activeCopies = new Map<HTMLElement, { dispose: () => void; mounted: boolean }>();
  let copyObserver: MutationObserver | null = null;
  const pruneDisconnectedCopies = () => {
    for (const [pane, tracked] of activeCopies) {
      if (pane.isConnected) {
        tracked.mounted = true;
        continue;
      }
      if (tracked.mounted) {
        activeCopies.delete(pane);
        copiedDocuments.delete(pane);
        tracked.dispose();
      }
    }
    if (activeCopies.size === 0 && copyObserver) {
      copyObserver.disconnect();
      copyObserver = null;
    }
  };
  const watchCopyRemoval = () => {
    if (copyObserver) return;
    const container = document.querySelector("[data-tab-panes]") || document.body;
    if (!container) return;
    copyObserver = new MutationObserver(pruneDisconnectedCopies);
    copyObserver.observe(container, { childList: true, subtree: true });
  };
  const ensureCopiedDocument = (targetPane: HTMLElement) => {
    pruneDisconnectedCopies();
    let entry = copiedDocuments.get(targetPane);
    let createdNow = false;
    if (!entry || entry.events.isDisposed()) {
      createdNow = true;
      let pendingRestore: EventRestore | null = null;
      const events = eventDocumentClient({
        documentPane: targetPane, route, isAbortError,
        showError: (message) => showToast(message, true),
        showStatus: (message) => showToast(message, false),
        reloadDocument: (id, restore) => entry!.load(id, restore),
      });
      const loader = documentClient({
        documentPane: targetPane, documentCollection, route, isAbortError,
        showError: (message) => showToast(message, true),
        afterReplace: () => {
          stripCopyIds(targetPane);
          targetPane.dataset.boardCursor = goalData.boardCursor == null ? "" : String(goalData.boardCursor);
          events.bindGoalEventDocument(pendingRestore);
          pendingRestore = null;
        },
      });
      const created = {
        events,
        load: (id: string, restore?: EventRestore | null) => {
          pendingRestore = restore || null;
          return loader.loadGoalDocument(id);
        },
      };
      copiedDocuments.set(targetPane, created);
      activeCopies.set(targetPane, { dispose: events.dispose, mounted: targetPane.isConnected });
      watchCopyRemoval();
      entry = created;
    } else if (targetPane.isConnected) {
      const tracked = activeCopies.get(targetPane);
      if (tracked) tracked.mounted = true;
    }
    return { entry, createdNow };
  };
  const ensureCopiedEventDocument = (targetPane: HTMLElement): void => {
    if (targetPane === documentPane) return;
    const { entry, createdNow } = ensureCopiedDocument(targetPane);
    if (createdNow) entry.events.bindGoalEventDocument();
  };
  const bindCopiedEventDocument = (targetPane: HTMLElement): void => {
    if (targetPane === documentPane) {
      bindGoalEventDocument();
      return;
    }
    ensureCopiedDocument(targetPane).entry.events.bindGoalEventDocument();
  };
  const loadGoalDocumentInto = (targetPane: HTMLElement, goalId: string): Promise<boolean | null> => {
    if (targetPane === documentPane) return loadGoalDocument(goalId);
    return ensureCopiedDocument(targetPane).entry.load(goalId);
  };
  const navigation = navigationClient({
    trashView, archiveView, documentPane,
    getSelected: () => page.selected,
    navigateToGoal: (goalId) => navigate(route("/goals/" + encodeURIComponent(goalId))),
    applySelection, loadGoalDocument, goalPageUrl, setWorkspaceMode, saveUiState, localPathname, visibleGoals,
    openEventReaderFromHash, goalFactorFromHash, setGoalFactor, revealDeepLinkFromId: host.revealDeepLinkFromId,
    syncWorkFrame: () => workFrame?.syncGoalMode(),
  });
  const { prepareGoalRefresh } = refreshClient({ treeScroll, treeFilter, documentPane, dialog, readCreateDraft: dialogs.readCreateDraft, refreshCreateChoices: dialogs.refreshCreateChoices });
  const refresh = pageRefresh({
    host, page, goalData, documentPane, treeScroll, dialog, trashView, archiveView, documentCollection, goalPageBase, goalMoveReceiptKey,
    parts: () => ({
      prepareGoalRefresh, visibleGoals, applySelection, graphElement: momentum.graphElement, loadGoalGraph: momentum.loadGoalGraph,
      restoreTreeCollapsed: tree.restoreTreeCollapsed, syncGoalCollectionFolds: tree.syncGoalCollectionFolds,
      setSelectedStatuses: tree.setSelectedStatuses, filterTree: tree.filterTree, selectTreeGoal: tree.selectTreeGoal,
      updateAllRelationFormPreviews: relation.updateAllRelationFormPreviews, bindGoalEventDocument: () => bindGoalEventDocument(),
      bindCopiedEventDocument: (pane: HTMLElement) => bindCopiedEventDocument(pane),
      openEventReader, setGoalFactor,
    }),
  });
  const proposal = proposalClient({ route, decisionReceiptContext: refresh.decisionReceiptContext, refreshBoardWithDecisionReceipt: refresh.refreshBoardWithDecisionReceipt });

  tree.bindTreeSearchEvents();
  documentPane.addEventListener("scroll", queueSave, { passive: true });
  tree.bindTreeFilterTrigger();
  dialogs.bindGoalCreateEvents();
  addEventListener("hashchange", navigation.handleGoalHashChange);
  // A form a Goal draws reports its own errors: changing a field clears that field's mark.
  const clearFactorError = (changed: Element) => {
    const changedFactorForm = changed.closest("[data-relation-form], [data-policy-form]");
    if (!changedFactorForm) return;
    changed.removeAttribute("aria-invalid");
    const factorError = changedFactorForm.querySelector<HTMLElement>("[data-relation-error], [data-policy-error]");
    if (factorError) factorError.hidden = true;
  };
  document.addEventListener("change", (event) => {
    const changed = elementOf(event);
    if (!changed) return;
    clearFactorError(changed);
    if (tree.handleTreeStatusChange(changed)) return;
    relation.handleGoalRelationChange(changed);
  });
  document.addEventListener("input", (event) => {
    const changed = elementOf(event);
    if (changed) clearFactorError(changed);
  });
  const stageList = { timer: null as ReturnType<typeof setTimeout> | null };
  document.addEventListener("dblclick", (event) => {
    const goalLink = elementOf(event)?.closest<HTMLElement>("[data-select-goal]");
    if (!goalLink?.closest("[data-goal-stage-list]")) return;
    event.preventDefault();
    if (stageList.timer) {
      clearTimeout(stageList.timer);
      stageList.timer = null;
    }
    frameContainer?.openFrame(goalLink.dataset.selectGoal || "");
  });
  document.addEventListener("submit", async (event) => {
    const submittedForm = event.target;
    const trashSubmit = dialogs.handleGoalTrashSubmit(submittedForm, event);
    if (trashSubmit) {
      await trashSubmit;
      return;
    }
    const proposalSubmit = proposal.handleGoalProposalSubmit(submittedForm, event);
    if (proposalSubmit) {
      await proposalSubmit;
      return;
    }
    const relationSubmit = relation.handleGoalRelationSubmit(submittedForm, event);
    if (relationSubmit) await relationSubmit;
  });
  // The collapse button on a Goal's frame takes its tab back to the board.
  document.addEventListener("click", (event) => {
    const collapse = elementOf(event)?.closest("[data-goal-collapse]");
    if (collapse) tabs()?.setItemView("goals", undefined, collapse.closest<HTMLElement>("[data-tab-pane]")?.dataset.tabPane);
  });
  const languageAbort = new AbortController();
  window.addEventListener("pagehide", () => {
    languageAbort.abort();
    copyObserver?.disconnect();
    copyObserver = null;
    for (const tracked of activeCopies.values()) tracked.dispose();
    activeCopies.clear();
  }, { once: true });
  document.addEventListener("molis-work:language-changed", () => {
    const graph = momentum.graphElement();
    if (graph?.dataset.loaded === "true") {
      if (workspace.dataset.workspaceMode === "graph") void momentum.loadGoalGraph(true);
      else graph.dataset.loaded = "false";
    }
  }, { signal: languageAbort.signal });

  if (document.body.classList.contains("immersive-workbench")) workFrame = workFrameClient({
    documentPane, projectId, setWorkspaceMode, setMobileView,
    getSelected: () => page.selected, getState: () => page.state,
    syncShell: (presenceOnly) => { if (presenceOnly) immersive()?.syncPresence(); else immersive()?.sync(); },
  });
  frameContainer = frameContainerClient({
    showToast,
    frameAssets: host.frameAssets,
    visible: () => lifetime()?.visible === true,
    visibleGoals: () => visibleGoals(),
    getSurface, setWorkSurface, setDirectory,
    setWorkspaceMode: (...args) => setWorkspaceMode(...args),
    setMobileView: (view) => setMobileView(view),
    applySelection: (goalId) => applySelection(goalId, false),
    locateGraphNode: (id) => momentum.locateGraphNode(id),
    getProjectId: () => projectId,
    route,
    pluginTitle: (surface) => tabs()?.pluginTitle?.(surface),
    openGoalTab: (id) => tabs()?.openItem("goals", id, undefined, "frame"),
    openGoalWork: (paneId) => tabs()?.setItemView("goals", "work", paneId),
    activateGoalsMother: () => {
      const current = tabs()?.state?.();
      const pane = current?.panes?.find((item) => item.id === current.focusedPaneId);
      const tab = pane?.tabs?.find((item) => item.id === pane.activeTabId);
      if (!tab && pane?.viewPlugin === "goals") return;
      tabs()?.openPlugin("goals");
    },
  });
  return pageHooks({
    host, page, goalData, documentPane, treeScroll, collectionView, documentCollection, directGoalRequested, storageKey, goalMoveReceiptKey,
    frameContainer, workFrame, stageList, visibleGoals, applySelection, restoreLastGoal, activateFocusSection, revealFocusTarget, loadGoalDocument, loadGoalDocumentInto, ensureCopiedEventDocument,
    announceSelection, eventDocument, panels, dialogs, lifecycle, momentum, tree, relation, navigation, refresh,
  });
}

/** The page bundle's entry: the shell calls it with its host (package.json "build"). */
export const create = goalsPageClient;
