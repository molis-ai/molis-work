/**
 * The Goals page's background refresh and its receipts (specs/page-client-lifecycle): reading the board again when the
 * platform's cursor moves, keeping forms someone is editing, and the receipt a decision or factor write leaves.
 */
import { stripCopyIds, type PageHost } from "./page-host.js";
import type { GoalRefresh } from "./refresh.js";
import type { GoalCollection, GoalListItem, GoalsPageData } from "./types.js";

/** The page data element; the cursor of the last applied refresh is kept on it, where tests read it too. */
export type GoalDataElement = HTMLElement & { boardCursor?: number };

/** What the page client and its refresh share and both change. */
export interface PageState {
  state: GoalsPageData;
  selected: string;
  documentCursor: number | undefined;
  documentReplaceGeneration: number;
  boardVisibleSignal: AbortSignal | null;
  observedBoardCursor: number | undefined;
  deferredRefreshTimer: ReturnType<typeof setTimeout> | undefined;
}

/** The parts of the page client the refresh calls, read when it runs (they are built after it). */
export interface RefreshParts {
  prepareGoalRefresh(parsed: Document, navigation: Pick<GoalsPageData, "active_goal_id" | "goals" | "archived_goals" | "trashed_goals">, items: readonly GoalListItem[], refreshGoalId: string, collectionPath: string, collectionOnly: boolean, documentVisible: boolean): GoalRefresh;
  visibleGoals(source?: GoalsPageData): readonly GoalListItem[];
  applySelection(goalId: string, resetScroll: boolean): boolean;
  graphElement(): HTMLElement | null;
  loadGoalGraph(force?: boolean): Promise<unknown>;
  restoreTreeCollapsed(collapsed: unknown): void;
  syncGoalCollectionFolds(): void;
  setSelectedStatuses(statuses: unknown): void;
  filterTree(query: string): void;
  selectTreeGoal(goalId: string): void;
  updateAllRelationFormPreviews(): void;
  bindGoalEventDocument(): void;
  /** Binds the event controls of a split pane's copy of a Goal document again after its content was replaced (102-1). */
  bindCopiedEventDocument(pane: HTMLElement): void;
  openEventReader(name: string): void;
  setGoalFactor(factor: string, persist?: boolean, updateHash?: boolean): boolean;
}

export interface RefreshContext {
  readonly host: PageHost;
  readonly page: PageState;
  readonly goalData: GoalDataElement;
  readonly documentPane: HTMLElement;
  readonly treeScroll: HTMLElement | null;
  readonly dialog: HTMLDialogElement | null;
  readonly trashView: boolean;
  readonly archiveView: boolean;
  readonly documentCollection: GoalCollection;
  readonly goalPageBase: () => string;
  readonly goalMoveReceiptKey: string;
  readonly parts: () => RefreshParts;
}

export interface ReceiptContext { readonly goalTitle: string; readonly goalHref: string }
type RefreshRequest = { force: boolean; signal: AbortSignal | null; cursor: number | undefined };

const EDITING = 'input, textarea, select, [contenteditable="true"]';

/** The refresh of the Goals page. */
export function pageRefresh(context: RefreshContext) {
  const { host, page, goalData, documentPane, treeScroll, dialog, trashView, archiveView, documentCollection, goalPageBase, goalMoveReceiptKey, parts } = context;
  const { route, showToast, lifetime, searchBusy, searchQuietAt, saveUiState, readUiState, applyUiState, restoreDisclosures, pageChanged, workspace } = host;

  const liveUiInteractionActive = (collectionOnly = false) => {
    const active = document.activeElement;
    if (collectionOnly) return Boolean(active?.closest("[data-tree-scroll], [data-tree-filter]") && active.matches(EDITING)
      || (active && dialog?.contains(active) && active.matches("[name=parent_goal_id], [name=dependency_goal_ids]"))
      || treeScroll?.querySelector("[data-record-menu][open], .goal-more[open], [aria-busy=true]:is([data-live-form],[data-event-form])"));
    // Open menus and saving forms stay intact even after focus is lost.
    if (active?.closest("[data-live-form], [data-event-form]") || document.querySelector("[data-record-menu][open],.goal-more[open],[aria-busy=true]:is([data-live-form],[data-event-form])")) return true;
    const dirtyVisibleForm = [...document.querySelectorAll<HTMLElement>('[data-live-form][data-live-dirty="true"], [data-event-form][data-live-dirty="true"]')]
      .some((form) => form.getClientRects().length > 0 || form.closest<HTMLElement>("[data-goal-node-workspace]")?.hidden);
    if (dirtyVisibleForm) return true;
    return Boolean(active?.matches(EDITING) && active.closest('[data-directory-panel]:not([data-directory-panel="root"]):not([data-directory-panel="goals"]), [data-work-surface]:not([data-work-surface="goals"])'));
  };

  const liveForm = (event: Event) => (event.target instanceof Element ? event.target.closest("[data-live-form], [data-event-form]") : null);
  for (const type of ["input", "change"]) document.addEventListener(type, (event) => { liveForm(event)?.setAttribute("data-live-dirty", "true"); });
  document.addEventListener("reset", (event) => {
    const form = liveForm(event);
    if (form) requestAnimationFrame(() => form.removeAttribute("data-live-dirty"));
  });

  const scheduleDeferredRefresh = () => {
    clearTimeout(page.deferredRefreshTimer);
    const wait = Math.max(80, searchQuietAt() - Date.now() + 40);
    page.deferredRefreshTimer = setTimeout(() => { void refreshBoard(); }, wait);
  };

  // Focus is not visibility: a split pane stays visible while another pane owns the keyboard.
  const goalRegionVisible = (nodes: readonly (Element | null | undefined)[]) => {
    const shown = (node: Element | null | undefined) => Boolean(node?.checkVisibility({ visibilityProperty: true }));
    if (!nodes.some(shown)) return false;
    for (let view: Window = window; view.frameElement; view = view.parent) if (!shown(view.frameElement)) return false;
    return true;
  };
  // A split pane may show its own copy of a Goal document (102-1); each copy keeps the cursor it was last drawn at.
  const goalSurfaceOf = (pane: Element) => pane.querySelector('[data-work-surface="goals"]');
  const allGoalDocumentPanes = () => [documentPane, ...document.querySelectorAll<HTMLElement>("[data-tab-panes] [data-document-pane][data-pane-clone]")];
  const visibleGoalDocumentPanes = () => allGoalDocumentPanes().filter((pane) => goalRegionVisible([goalSurfaceOf(pane)]));
  const primaryDocumentVisible = () => goalRegionVisible([goalSurfaceOf(documentPane)]);
  const goalStageVisible = () => goalRegionVisible([
    ...document.querySelectorAll("[data-goal-canvas-shell], [data-goal-frame-surface]"),
    ...allGoalDocumentPanes().map(goalSurfaceOf),
  ]);
  const refreshCopiedGoalPanes = async (copies: readonly HTMLElement[], cursor: number, primaryGoalId: string, primaryParsed: Document | null, signal: AbortSignal | null) => {
    if (!copies.length) return;
    const read = new Map<string, Document>();
    if (primaryGoalId && primaryParsed) read.set(primaryGoalId, primaryParsed);
    for (const pane of copies) {
      if (!goalRegionVisible([goalSurfaceOf(pane)])) continue;
      const paneGoalId = pane.querySelector<HTMLElement>("[data-goal-view]")?.dataset.goalView || pane.dataset.paneGoalId || "";
      if (!paneGoalId) continue;
      let parsed = read.get(paneGoalId);
      if (!parsed) {
        const response = await molisWorkRequest<Response>(route("/api/board/refresh?view=" + documentCollection + "&goal_id=" + encodeURIComponent(paneGoalId)), { scope: lifetime(), signal: signal ?? undefined, as: "response" });
        lifetime().assertCurrent(signal ?? undefined);
        if (!response.ok) continue;
        parsed = new DOMParser().parseFromString(await response.text(), "text/html");
        read.set(paneGoalId, parsed);
      }
      if (!goalRegionVisible([goalSurfaceOf(pane)])) continue;
      const next = parsed.querySelector('[data-document-pane] [data-work-surface="goals"]');
      const current = goalSurfaceOf(pane);
      if (current && next) {
        current.replaceChildren(...next.cloneNode(true).childNodes);
        stripCopyIds(current);
        parts().bindCopiedEventDocument(pane);
        pane.dataset.boardCursor = String(cursor);
      }
    }
  };

  const readPage = async (refreshGoalId: string, collectionOnly: boolean, signal: AbortSignal | null) => {
    const collectionPath = trashView ? "/trash" : archiveView ? "/archive" : "/";
    const pagePath = refreshGoalId ? goalPageBase() + encodeURIComponent(refreshGoalId) : route(collectionPath);
    const compactRefreshPath = route("/api/board/refresh?view=" + documentCollection +
      (collectionOnly ? "&projection=collection" : refreshGoalId ? "&goal_id=" + encodeURIComponent(refreshGoalId) : ""));
    let pageResponse: Response | undefined;
    for (const path of collectionOnly ? [compactRefreshPath] : [compactRefreshPath, pagePath, route(collectionPath)]) {
      pageResponse = await molisWorkRequest<Response>(path, { scope: lifetime(), signal: signal ?? undefined, as: "response" });
      if (pageResponse.ok) break;
    }
    if (!pageResponse?.ok) throw new Error(globalThis.t.text("goals.page-refresh.update-failed"));
    return { parsed: new DOMParser().parseFromString(await pageResponse.text(), "text/html"), collectionPath };
  };
  /** Puts a refreshed page in place: the Goals lists always, the open Goal's document unless only the lists were read. */
  const applyRefresh = (goalRefresh: GoalRefresh, nextState: GoalsPageData, applyCollectionOnly: boolean, cursor: number) => {
    const p = parts();
    const ui = readUiState();
    const treePosition = treeScroll?.scrollTop ?? 0;
    goalRefresh.apply(() => {});
    page.state = nextState;
    pageChanged();
    goalData.textContent = JSON.stringify(page.state).replaceAll("<", "\\u003c");
    if (!applyCollectionOnly) {
      page.selected = goalRefresh.nextSelected;
      if (page.selected) p.applySelection(page.selected, false);
    }
    // Invalidate before restoring visible workspace state, so its graph consumer can reload.
    const refreshedGraph = p.graphElement();
    if (refreshedGraph?.dataset.loaded === "true") {
      if (workspace.dataset.workspaceMode === "graph") void p.loadGoalGraph(true);
      else refreshedGraph.dataset.loaded = "false";
    }
    if (applyCollectionOnly) {
      p.restoreTreeCollapsed(ui.collapsed);
      restoreDisclosures(treeScroll, ui.disclosures);
      p.syncGoalCollectionFolds();
      p.setSelectedStatuses(ui.statuses);
      p.filterTree("");
      p.selectTreeGoal(page.selected);
      if (treeScroll) treeScroll.scrollTop = treePosition;
    } else {
      applyUiState(ui);
      p.updateAllRelationFormPreviews();
      p.bindGoalEventDocument();
      page.documentCursor = cursor;
      documentPane.dataset.boardCursor = String(cursor);
      requestAnimationFrame(() => documentPane.classList.remove("is-syncing"));
    }
    // Split panes showing the Goals list keep the same rows as the page's own list.
    const primaryStageList = document.querySelector("[data-goal-canvas-shell]:not([data-pane-clone]) [data-goal-stage-list]");
    if (primaryStageList) {
      document.querySelectorAll("[data-goal-canvas-shell][data-pane-clone] [data-goal-stage-list]").forEach((list) => {
        list.innerHTML = primaryStageList.innerHTML;
        stripCopyIds(list);
      });
    }
  };
  const readBoard = async ({ force, signal, cursor: hint }: RefreshRequest): Promise<"reloading" | undefined> => {
    if (document.hidden || !lifetime().visible || signal?.aborted) return;
    const visiblePanes = visibleGoalDocumentPanes();
    const primaryVisible = primaryDocumentVisible();
    const collectionOnly = !force && !primaryVisible;
    if (!force && searchBusy()) {
      scheduleDeferredRefresh();
      return;
    }
    if (!force && liveUiInteractionActive(collectionOnly)) return;
    try {
      const cursor = hint ?? (await molisWorkRequest<{ observed_event_cursor: number }>(route("/api/board/cursor"), { scope: lifetime(), signal: signal ?? undefined, fallback: globalThis.t.text("goals.page-refresh.cursor-failed") })).observed_event_cursor;
      lifetime().assertCurrent(signal ?? undefined);
      // The platform journal and the Goals plugin journal have independent sequence numbers.
      // Acknowledge the platform cursor only after its refresh was actually applied.
      const staleCopies = visiblePanes.filter((pane) => pane !== documentPane && (force || pane.dataset.boardCursor !== String(cursor)));
      const primaryStale = primaryVisible && (force || page.documentCursor !== cursor || documentPane.dataset.boardCursor !== String(cursor));
      if (!force && cursor === goalData.boardCursor && !primaryStale && !staleCopies.length) return;
      if (!force && cursor === goalData.boardCursor && !primaryStale) {
        await refreshCopiedGoalPanes(staleCopies, cursor, "", null, signal);
        return;
      }
      if (!force && searchBusy()) {
        scheduleDeferredRefresh();
        return;
      }
      if (!force && liveUiInteractionActive(collectionOnly)) return;
      const refreshGoalId = page.selected;
      const refreshGeneration = page.documentReplaceGeneration;
      const { parsed, collectionPath } = await readPage(refreshGoalId, collectionOnly, signal);
      lifetime().assertCurrent(signal ?? undefined);
      const applyCollectionOnly = collectionOnly || (!force && !primaryDocumentVisible());
      if (!force && liveUiInteractionActive(applyCollectionOnly)) return;
      if (parsed.body.dataset.boardView !== document.body.dataset.boardView) {
        if (applyCollectionOnly) {
          void refreshBoard(false, signal, cursor);
          return;
        }
        location.reload();
        return;
      }
      const nextStateNode = parsed.querySelector("#molis-work-data");
      if (!nextStateNode) throw new Error(globalThis.t.text("goals.page-refresh.state-incomplete"));
      const nextState = JSON.parse(nextStateNode.textContent || "null") as GoalsPageData;
      if (!collectionOnly && refreshGeneration !== page.documentReplaceGeneration) {
        scheduleDeferredRefresh();
        return;
      }
      const goalRefresh = parts().prepareGoalRefresh(parsed, {
        active_goal_id: nextState.active_goal_id, goals: nextState.goals,
        archived_goals: nextState.archived_goals, trashed_goals: nextState.trashed_goals,
      }, parts().visibleGoals(nextState), refreshGoalId, collectionPath, applyCollectionOnly, page.selected === refreshGoalId && (force || goalStageVisible()));
      if (!force && searchBusy()) {
        scheduleDeferredRefresh();
        return;
      }
      if (!collectionOnly && page.selected !== refreshGoalId) {
        scheduleDeferredRefresh();
        return;
      }
      if (goalRefresh.move) {
        const { path: movedPath, message } = goalRefresh.move;
        try {
          sessionStorage.setItem(goalMoveReceiptKey, JSON.stringify({ goalId: refreshGoalId, message }));
        } catch { /* without storage the move notice is not shown after reload */ }
        saveUiState();
        location.replace(globalThis.molisWorkNavigationUrl(route(movedPath)));
        return "reloading";
      }
      const snapshot = applyCollectionOnly ? null : parsed.cloneNode(true) as Document;
      applyRefresh(goalRefresh, nextState, applyCollectionOnly, cursor);
      await refreshCopiedGoalPanes(staleCopies, cursor, applyCollectionOnly ? "" : refreshGoalId, snapshot, signal);
      goalData.boardCursor = cursor;
    } catch (error) {
      // A background refresh stays quiet for the person, but not for whoever has to find out why it stopped: the page's
      // lifetime reports it on its next poll (takeFailure).
      if (!signal?.aborted) lastFailure = error;
    }
    return undefined;
  };
  // Retain the latest requested read while one projection is in flight; it is not an acknowledgement.
  let pendingRefresh: RefreshRequest | undefined;
  let lastFailure: unknown = null;
  let refreshJob: Promise<"reloading" | undefined> | null = null;
  const refreshBoard = (force = false, signal: AbortSignal | null = page.boardVisibleSignal, cursor?: number): Promise<"reloading" | undefined> => {
    const pendingCursor = pendingRefresh?.cursor;
    pendingRefresh = { force: force || pendingRefresh?.force || false, signal, cursor: cursor === undefined ? pendingCursor : Math.max(pendingCursor ?? cursor, cursor) };
    if (!refreshJob) refreshJob = (async () => {
      try {
        let result: "reloading" | undefined;
        while (pendingRefresh) {
          const next = pendingRefresh;
          pendingRefresh = undefined;
          result = await readBoard(next);
          if (result === "reloading") {
            pendingRefresh = undefined;
            break;
          }
        }
        return result;
      } finally { refreshJob = null; }
    })();
    return refreshJob;
  };

  const decisionReceiptContext = (decisionForm: Element): ReceiptContext => {
    const goalDocument = decisionForm.closest<HTMLElement>("[data-goal-event-document]");
    const goalTitle = goalDocument?.querySelector("h1")?.textContent?.trim() || "";
    const goalId = goalDocument?.dataset.goalView || "";
    return { goalTitle, goalHref: goalId ? route("/goals/" + encodeURIComponent(goalId)) : "" };
  };

  const showDecisionReceipt = (message: string, context?: ReceiptContext | null) => {
    const receiptHost = document.querySelector("[data-goal-decision-panel]") || document.querySelector("[data-goal-event-document]");
    if (!receiptHost) {
      showToast(message);
      return;
    }
    receiptHost.querySelector("[data-decision-receipt]")?.remove();
    const receipt = document.createElement("aside");
    receipt.className = "decision-receipt";
    receipt.dataset.decisionReceipt = "true";
    receipt.setAttribute("role", "status");
    receipt.setAttribute("tabindex", "-1");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = globalThis.t.text("goals.page-client-refresh.decision-was-saved");
    const detail = document.createElement("span");
    detail.textContent = message + " " + (receiptHost.querySelector(".decision-record") ? globalThis.t.text("goals.page-client-refresh.next-continue-remaining-decisions-below") : globalThis.t.text("goals.page-client-refresh.next-return-goal-review-result"));
    copy.append(title, detail);
    receipt.append(copy);
    if (context?.goalHref) {
      const link = document.createElement("a");
      link.href = context.goalHref;
      link.textContent = context.goalTitle ? globalThis.t.text("goals.page-client-refresh.return-title", { title: context.goalTitle }) : globalThis.t.text("goals.page-client-refresh.return-goal");
      receipt.append(link);
    }
    const receiptAnchor = receiptHost.querySelector(".mw-detail-header, .goal-workspace-hero");
    if (receiptAnchor) receiptAnchor.after(receipt);
    else receiptHost.prepend(receipt);
    receipt.focus({ preventScroll: true });
  };

  const refreshBoardWithDecisionReceipt = async (message: string, context: unknown) => {
    try {
      sessionStorage.setItem("molis-work-decision-receipt", JSON.stringify({ message, context }));
    } catch { /* without storage the notice is shown without the reload */ }
    const refreshResult = await refreshBoard(true);
    if (refreshResult === "reloading") return;
    try {
      sessionStorage.removeItem("molis-work-decision-receipt");
    } catch { /* a notice left behind is shown once more at most */ }
    showDecisionReceipt(message, context as ReceiptContext | null);
  };

  const showFactorReceipt = (factor: string, titleText: string, detailText: string) => {
    parts().openEventReader("description");
    parts().setGoalFactor(factor, false, true);
    documentPane.querySelector("[data-factor-write-receipt]")?.remove();
    const panel = documentPane.querySelector('[data-goal-factor-panel="' + factor + '"]');
    if (!panel) {
      showToast(titleText);
      return;
    }
    const receipt = document.createElement("aside");
    receipt.className = "factor-write-receipt";
    receipt.dataset.factorWriteReceipt = "true";
    receipt.setAttribute("role", "status");
    receipt.setAttribute("tabindex", "-1");
    const title = document.createElement("strong");
    title.textContent = titleText;
    const detail = document.createElement("span");
    detail.textContent = detailText;
    receipt.append(title, detail);
    const panelContent = panel.querySelector(":scope > .focus-section-card-content") || panel;
    panelContent.querySelector(":scope > header")?.after(receipt);
    receipt.focus({ preventScroll: true });
  };

  /** The last background refresh that failed, once: the poll throws it so the page lifetime reports it. */
  const takeFailure = () => {
    const failure = lastFailure;
    lastFailure = null;
    return failure;
  };

  return { scheduleDeferredRefresh, goalStageVisible, refreshBoard, takeFailure, decisionReceiptContext, showDecisionReceipt, refreshBoardWithDecisionReceipt, showFactorReceipt };
}
