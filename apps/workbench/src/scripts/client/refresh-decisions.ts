import { pluginPageClients } from "../../plugin-workbench.js";

const GOALS_PAGE = pluginPageClients("goals");
/** AP3 Workbench client segment: refresh-decisions. */
export const CLIENT_REFRESH_DECISIONS_SCRIPT = `      }
      setMobileView(restoredMobileView);
      if (hashTargetId && activeDesktopSurface === "goals") void revealDeepLinkFromId(hashTargetId);
    };

    saveUiState = () => {
      if (window.parent !== window && new URLSearchParams(location.search).has("workbenchPane")) return;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(readUiState()));
      } catch { /* Ignore sessionStorage write failure while saving UI state. */ }
    };

    const applySelection = (goalId, resetScroll) => {
      const item = visibleGoals().find((entry) => entry.goal.goal_id === goalId);
      if (!item) return false;
      selected = goalId;
      rememberMomentumGoal(goalId);
      const tui = document.querySelector("[data-tui-pane]");
      const goalsSurface = document.querySelector('[data-work-surface="goals"]');
      const terminalPluginId = tui?.dataset.tuiPluginId || pluginManifestIds.goals || "";
      const terminalSubjectKind = tui?.dataset.tuiSubjectKind || "goal";
      if (tui && terminalPluginId && terminalSubjectKind) {
        tui.setAttribute("data-tui-plugin-id", terminalPluginId);
        tui.setAttribute("data-tui-subject-kind", terminalSubjectKind);
        tui.setAttribute("data-tui-subject-id", goalId);
      }
      if (terminalPluginId && terminalSubjectKind) {
        document.dispatchEvent(new CustomEvent("molis-work:work-terminal-subject-changed", { detail: {
          pluginId: terminalPluginId,
          subjectKind: terminalSubjectKind,
          subjectId: goalId,
          title: item.goal.title,
          status: item.status,
          statusLabel: item.status_label,
          statusMeaning: item.status_meaning,
          statusIconMarkup: item.status_icon,
          readOnly: item.terminal_read_only || null,
        } }));
      }
      document.dispatchEvent(new CustomEvent("molis-work:record-selected", { detail: {
        plugin: goalsSurface?.dataset.workSurface || "goals",
        itemId: goalId,
        title: item.goal.title,
      } }));
      selectTreeGoal(goalId);
      if (navigatorView === "graph") updateGraphVisibility();
      const titleState = tabWorkspace?.state?.();
      const titlePane = titleState && (titleState.panes.find((pane) => pane.id === titleState.focusedPaneId) || titleState.panes[0]);
      const titleTab = titlePane?.tabs.find((tab) => tab.id === titlePane.activeTabId);
      const ownsTitle = !titleState || (!titleState.exclusive && (tabWorkspace.isEmbedded()
        ? activeDesktopSurface === "goals"
        : titleTab?.plugin === "goals" && titleTab.kind === "item" && titleTab.itemId === goalId));
      if (ownsTitle) document.title = item.goal.title + " · Molis Work";
      if (resetScroll && activeDesktopSurface === "goals") documentPane.scrollTop = 0;
      immersiveNavigation?.sync();
      return true;
    };

    let documentReplaceGeneration = 0, documentCursor;
    const createGoalDocumentLoader = ${GOALS_PAGE.goalsDocument};
    const { loadGoalDocument } = createGoalDocumentLoader({
      documentPane, documentCollection, route, translate: globalThis.t.text, isAbortError,
      showError: (message) => showToast(message, true),
      afterReplace: () => {
        documentReplaceGeneration += 1;
        documentCursor = goalData?.boardCursor;
        documentPane.dataset.boardCursor = documentCursor == null ? "" : String(documentCursor);
        updateAllRelationFormPreviews();
        bindGoalEventDocument(pendingEventRestore);
        pendingEventRestore = null;
        openEventReaderFromHash();
        setGoalFactor(goalFactorFromHash() || "relations", false);
      },
    });
    const cloneGoalLoaders = new WeakMap();
    const loadGoalDocumentInto = (targetPane, goalId) => {
      if (!targetPane || targetPane === documentPane) return loadGoalDocument(goalId);
      let entry = cloneGoalLoaders.get(targetPane);
      if (!entry) {
        const eventApi = goalData ? createGoalEventDocument({
          documentPane: targetPane, route, translate: globalThis.t.text, isAbortError,
          showError: (message) => showToast(message, true),
          showStatus: (message) => showToast(message, false),
          reloadDocument: (id, restore) => entry.load(id, restore),
          controlHeaders: () => (typeof molisWorkControlHeaders === "function" ? molisWorkControlHeaders() : { "content-type": "application/json" }),
        }) : null;
        let clonePendingRestore = null;
        const loader = createGoalDocumentLoader({
          documentPane: targetPane, documentCollection, route, translate: globalThis.t.text, isAbortError,
          showError: (message) => showToast(message, true),
          afterReplace: () => {
            targetPane.dataset.boardCursor = goalData?.boardCursor == null ? "" : String(goalData.boardCursor);
            eventApi?.bindGoalEventDocument(clonePendingRestore);
            clonePendingRestore = null;
          },
        });
        entry = {
          eventApi,
          load: (id, restore) => {
            clonePendingRestore = restore || null;
            return loader.loadGoalDocument(id);
          },
        };
        cloneGoalLoaders.set(targetPane, entry);
      }
      return entry.load(goalId);
    };
    reloadGoalEventDocument = async (goalId, restore) => {
      pendingEventRestore = restore || null;
      return loadGoalDocument(goalId);
    };

    const { selectGoal, handleGoalPopState, handleGoalHashChange } =
      (${GOALS_PAGE.goalsNavigation})({
        trashView, archiveView, documentPane,
        getSelected: () => selected, getActiveGoalId: () => state.active_goal_id,
        navigateToGoal: (goalId) => location.assign(globalThis.molisWorkNavigationUrl(route("/goals/" + encodeURIComponent(goalId)))),
        applySelection, loadGoalDocument,
        goalPageUrl, setWorkspaceMode, saveUiState, localPathname, visibleGoals,
        openEventReaderFromHash, goalFactorFromHash, setGoalFactor, revealDeepLinkFromId,
      });
    const { selectTreeGoal, syncGoalCollectionFolds, getCollapsedTreeGoals, restoreTreeCollapsed, setSelectedStatuses, getSelectedStatuses,
      setTreeFilterOpen, filterTree, bindTreeSearchEvents, bindTreeFilterTrigger,
      handleTreeStatusChange, handleTreeDisclosureClick,
      handleTreeKeyboard } = (${GOALS_PAGE.goalsTree})({
        treeFilter, treeFilterTrigger, treeScroll, globalSearch, translate: globalThis.t.text,
        updateGraphVisibility, queueSave, saveUiState,
      });
    const { prepareGoalRefresh } = (${GOALS_PAGE.goalsRefresh})({
      treeScroll, treeFilter, documentPane, dialog, readCreateDraft, refreshCreateChoices, translate: globalThis.t.text,
    });
    const searchInteractionActive = () => globalSearchPalette?.isBusy?.() || Date.now() < searchBusyUntil;

    const liveUiInteractionActive = (collectionOnly = false) => {
      const active = document.activeElement;
      if (collectionOnly) return Boolean(active?.closest?.('[data-tree-scroll], [data-tree-filter]')
        && active.matches('input, textarea, select, [contenteditable="true"]')
        || dialog?.contains(active) && active.matches('[name=parent_goal_id], [name=dependency_goal_ids]')
        || treeScroll?.querySelector('[data-record-menu][open], .goal-more[open], [aria-busy=true]:is([data-live-form],[data-event-form])'));
      // Open menus and saving forms stay intact even after focus is lost.
      if (active?.closest?.("[data-live-form], [data-event-form]") || document.querySelector("[data-record-menu][open],.goal-more[open],[aria-busy=true]:is([data-live-form],[data-event-form])")) return true;
      const dirtyVisibleForm = [...document.querySelectorAll('[data-live-form][data-live-dirty="true"], [data-event-form][data-live-dirty="true"]')]
        .some((form) => form.getClientRects().length > 0 || form.closest("[data-goal-node-workspace]")?.hidden);
      if (dirtyVisibleForm) return true;
      return active?.matches?.('input, textarea, select, [contenteditable="true"]') && Boolean(
        active.closest?.('[data-directory-panel]:not([data-directory-panel="root"]):not([data-directory-panel="goals"]), [data-work-surface]:not([data-work-surface="goals"])'),
      );
    };

    for (const type of ["input", "change"]) document.addEventListener(type, (event) => {
      event.target?.closest?.("[data-live-form], [data-event-form]")?.setAttribute("data-live-dirty", "true");
    });
    document.addEventListener("reset", (event) => {
      const form = event.target?.closest?.("[data-live-form], [data-event-form]");
      if (form) requestAnimationFrame(() => form.removeAttribute("data-live-dirty"));
    });

    const scheduleDeferredRefresh = () => {
      clearTimeout(deferredRefreshTimer);
      const wait = Math.max(80, searchBusyUntil - Date.now() + 40);
      deferredRefreshTimer = setTimeout(() => refreshBoard(), wait);
    };

    const noteSearchActivity = (delay = 900) => {
      searchBusyUntil = Math.max(searchBusyUntil, Date.now() + delay);
      scheduleDeferredRefresh();
    };

    // Focus is not visibility: a split pane stays visible while another pane owns the keyboard.
    const goalRegionVisible = nodes => {
      const shown = node => Boolean(node?.checkVisibility({ visibilityProperty: true }));
      if (!nodes.some(shown)) return false;
      for (let view = window; view.frameElement; view = view.parent) if (!shown(view.frameElement)) return false;
      return true;
    };
    const allGoalDocumentPanes = () => [documentPane, ...document.querySelectorAll("[data-tab-panes] [data-document-pane][data-pane-clone]")].filter(Boolean);
    const visibleGoalDocumentPanes = () => allGoalDocumentPanes().filter((pane) => goalRegionVisible([pane.querySelector('[data-work-surface="goals"]')]));
    const primaryDocumentVisible = () => goalRegionVisible([documentPane?.querySelector('[data-work-surface="goals"]')]);
    const goalDocumentVisible = () => visibleGoalDocumentPanes().length > 0;
    const goalStageVisible = () => goalRegionVisible([
      ...document.querySelectorAll("[data-goal-canvas-shell], [data-goal-frame-surface]"),
      ...allGoalDocumentPanes().map((pane) => pane.querySelector('[data-work-surface="goals"]')),
    ]);
    const refreshCloneGoalPanes = async (clones, cursor, primaryGoalId, primaryParsed, signal) => {
      if (!clones.length) return;
      const cache = new Map();
      if (primaryGoalId && primaryParsed) cache.set(primaryGoalId, primaryParsed);
      for (const pane of clones) {
        if (!goalRegionVisible([pane.querySelector('[data-work-surface="goals"]')])) continue;
        const paneGoalId = pane.querySelector("[data-goal-view]")?.dataset.goalView || pane.dataset.paneGoalId || "";
        if (!paneGoalId) continue;
        let docParsed = cache.get(paneGoalId);
        if (!docParsed) {
          const path = route("/api/board/refresh?view=" + documentCollection + "&goal_id=" + encodeURIComponent(paneGoalId));
          const response = await molisWorkRequest(path, { scope: boardLifetime, signal, as: "response" });
          boardLifetime.assertCurrent(signal);
          if (!response.ok) continue;
          docParsed = new DOMParser().parseFromString(await response.text(), "text/html");
          cache.set(paneGoalId, docParsed);
        }
        if (!goalRegionVisible([pane.querySelector('[data-work-surface="goals"]')])) continue;
        const nextSurface = docParsed.querySelector('[data-document-pane] [data-work-surface="goals"]');
        const currentSurface = pane.querySelector('[data-work-surface="goals"]');
        if (currentSurface && nextSurface) {
          currentSurface.replaceChildren(...nextSurface.cloneNode(true).childNodes);
          cloneGoalLoaders.get(pane)?.eventApi?.bindGoalEventDocument();
          pane.dataset.boardCursor = String(cursor);
        }
      }
    };
    const readBoard = async ({ force, signal, cursor: hint }) => {
      if (!goalData || document.hidden || !boardLifetime.visible || signal?.aborted) return;
      const visiblePanes = visibleGoalDocumentPanes();
      const primaryVisible = primaryDocumentVisible();
      const collectionOnly = !force && !primaryVisible;
      if (!force && searchInteractionActive()) {
        scheduleDeferredRefresh();
        return;
      }
      if (!force && liveUiInteractionActive(collectionOnly)) {
        return;
      }
      try {
        const cursor = hint ?? (await molisWorkRequest(route("/api/board/cursor"),{scope:boardLifetime,signal,fallback:"无法读取 Molis Work 游标"})).observed_event_cursor;
        boardLifetime.assertCurrent(signal);
        const staleClones = visiblePanes.filter((pane) => pane !== documentPane && (force || pane.dataset.boardCursor !== String(cursor)));
        const primaryStale = primaryVisible && (force || documentCursor !== cursor || documentPane.dataset.boardCursor !== String(cursor));
        // The platform journal and the Goals plugin journal have independent sequence numbers.
        // Acknowledge the platform cursor only after its refresh was actually applied.
        if (!force && cursor === goalData.boardCursor && !primaryStale && !staleClones.length) {
          return;
        }
        if (!force && cursor === goalData.boardCursor && !primaryStale && staleClones.length) {
          await refreshCloneGoalPanes(staleClones, cursor, "", null, signal);
          return;
        }
        if (!force && searchInteractionActive()) {
          scheduleDeferredRefresh();
          return;
        }
        if (!force && liveUiInteractionActive(collectionOnly)) return;
        const refreshGoalId = selected;
        const pageBase = goalPageBase();
        const collectionPath = trashView ? "/trash" : archiveView ? "/archive" : "/";
        const pagePath = refreshGoalId
          ? pageBase + encodeURIComponent(refreshGoalId)
          : route(collectionPath);
        const compactRefreshPath = route("/api/board/refresh?view=" + documentCollection +
          (collectionOnly ? "&projection=collection" : refreshGoalId ? "&goal_id=" + encodeURIComponent(refreshGoalId) : ""));
        const refreshGeneration = documentReplaceGeneration;
        let pageResponse;
        for (const path of collectionOnly ? [compactRefreshPath] : [compactRefreshPath, pagePath, route(collectionPath)]) {
          pageResponse=await molisWorkRequest(path,{scope:boardLifetime,signal,as:"response"});
          if (pageResponse.ok) break;
        }
        if (!pageResponse.ok) throw new Error("无法更新 Goal 页面");
        const parsed = new DOMParser().parseFromString(await pageResponse.text(), "text/html");
        boardLifetime.assertCurrent(signal);
        const applyCollectionOnly = collectionOnly || (!force && !primaryDocumentVisible());
        if (!force && liveUiInteractionActive(applyCollectionOnly)) return;
        if (parsed.body.dataset.boardView !== document.body.dataset.boardView) {
          if (applyCollectionOnly) { void refreshBoard(false, signal, cursor); return; }
          location.reload();
          return;
        }
        const nextStateNode = parsed.querySelector("#molis-work-data");
        if (!nextStateNode) throw new Error("页面状态不完整");
        const nextState = JSON.parse(nextStateNode.textContent);
        if (!collectionOnly && refreshGeneration !== documentReplaceGeneration) {
          scheduleDeferredRefresh();
          return;
        }
        const goalRefresh = prepareGoalRefresh(parsed, {
          active_goal_id: nextState.active_goal_id, goals: nextState.goals,
          archived_goals: nextState.archived_goals, trashed_goals: nextState.trashed_goals,
        }, visibleGoals(nextState), refreshGoalId, collectionPath, applyCollectionOnly, selected === refreshGoalId && (force || goalStageVisible()));
        if (!force && searchInteractionActive()) {
          scheduleDeferredRefresh();
          return;
        }
        if (!collectionOnly && selected !== refreshGoalId) {
          scheduleDeferredRefresh();
          return;
        }
        if (goalRefresh.move) {
          const { path: movedPath, message } = goalRefresh.move;
          try {
            sessionStorage.setItem(goalMoveReceiptKey, JSON.stringify({ goalId: refreshGoalId, message }));
          } catch { /* Ignore sessionStorage write failure for move receipt. */ }
          saveUiState();
          location.replace(globalThis.molisWorkNavigationUrl(route(movedPath)));
          return "reloading";
        }
        const ui = readUiState();
        const treePosition = treeScroll?.scrollTop;
        const cloneSnapshot = applyCollectionOnly ? null : parsed.cloneNode(true);
        goalRefresh.apply(() => {});
        state = nextState;
        projectHome?.sync();
        projectPositions?.invalidate();
        document.querySelector("#molis-work-data").textContent = JSON.stringify(state).replaceAll("<", "\\u003c");
        if (!applyCollectionOnly) {
          selected = goalRefresh.nextSelected;
          if (selected) applySelection(selected, false);
        }
        // Invalidate before restoring visible workspace state, so its graph consumer can reload.
        const refreshedGraph = graphElement();
        if (refreshedGraph?.dataset.loaded === "true") {
          if (workspace.dataset.workspaceMode === "graph") void loadGoalGraph(true);
          else refreshedGraph.dataset.loaded = "false";
        }
        if (applyCollectionOnly) {
          restoreTreeCollapsed(ui.collapsed);
          restoreDisclosures(treeScroll, ui.disclosures);
          syncGoalCollectionFolds();
          setSelectedStatuses(ui.statuses);
          filterTree("");
          selectTreeGoal(selected);
          if (treeScroll) treeScroll.scrollTop = treePosition;
        } else {
          applyUiState(ui);
          updateAllRelationFormPreviews();
          bindGoalEventDocument();
          documentCursor = cursor;
          documentPane.dataset.boardCursor = String(cursor);
          requestAnimationFrame(() => documentPane.classList.remove("is-syncing"));
        }
        const primaryStageList = document.querySelector("[data-goal-canvas-shell]:not([data-pane-clone]) [data-goal-stage-list]");
        if (primaryStageList) {
          document.querySelectorAll("[data-goal-canvas-shell][data-pane-clone] [data-goal-stage-list]").forEach((list) => {
            list.innerHTML = primaryStageList.innerHTML;
          });
        }
        await refreshCloneGoalPanes(staleClones, cursor, applyCollectionOnly ? "" : refreshGoalId, cloneSnapshot, signal);
        goalData.boardCursor = cursor;
      } catch (error) {
        // A background refresh stays quiet for the person, but not for whoever has to find out why it stopped.
        if (!signal?.aborted) console.warn("Goal refresh failed", error);
      }
    };
    // Retain the latest requested read while one projection is in flight; it is not an acknowledgement.
    let pendingRefresh, refreshJob, observedBoardCursor;
    const refreshBoard = (force = false, signal = boardVisibleSignal, cursor) => {
      const pendingCursor = pendingRefresh?.cursor;
      pendingRefresh = { force: force || pendingRefresh?.force || false, signal, cursor: cursor === undefined ? pendingCursor : Math.max(pendingCursor ?? cursor, cursor) };
      if (!refreshJob) refreshJob = (async () => {
        try {
          let result;
          while (pendingRefresh) {
            const next = pendingRefresh; pendingRefresh = undefined;
            result = await readBoard(next);
            if (result === "reloading") { pendingRefresh = undefined; break; }
          }
          return result;
        } finally { refreshJob = null; }
      })();
      return refreshJob;
    };

    const decisionReceiptContext = (decisionForm) => {
      const goalDocument = decisionForm.closest("[data-goal-event-document]");
      const goalTitle = goalDocument?.querySelector("h1")?.textContent?.trim() || "";
      const goalId = goalDocument?.dataset.goalView || "";
      return { goalTitle, goalHref: goalId ? route("/goals/" + encodeURIComponent(goalId)) : "" };
    };

    const showDecisionReceipt = (message, context) => {
      const receiptHost = document.querySelector("[data-goal-decision-panel]")
        || document.querySelector("[data-goal-event-document]");
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
      title.textContent = globalThis.t.text("workbench.refresh-decisions.decision-was-saved");
      const detail = document.createElement("span");
      detail.textContent = message + " " + (receiptHost.querySelector(".decision-record") ? globalThis.t.text("workbench.refresh-decisions.next-continue-remaining-decisions-below") : globalThis.t.text("workbench.refresh-decisions.next-return-goal-review-result"));
      copy.append(title, detail);
      receipt.append(copy);
      if (context?.goalHref) {
        const link = document.createElement("a");
        link.href = context.goalHref;
        link.textContent = context.goalTitle ? globalThis.t.text("workbench.refresh-decisions.return-title", { title: context.goalTitle }) : globalThis.t.text("workbench.refresh-decisions.return-goal");
        receipt.append(link);
      }
      const receiptAnchor = receiptHost.querySelector(".mw-detail-header, .goal-workspace-hero");
      if (receiptAnchor) receiptAnchor.after(receipt);
      else receiptHost.prepend(receipt);
      receipt.focus({ preventScroll: true });
    };

    const refreshBoardWithDecisionReceipt = async (message, context) => {
      try {
        sessionStorage.setItem("molis-work-decision-receipt", JSON.stringify({ message, context }));
      } catch { /* Ignore sessionStorage write failure for decision receipt. */ }
      const refreshResult = await refreshBoard(true);
      if (refreshResult === "reloading") return;
      try {
        sessionStorage.removeItem("molis-work-decision-receipt");
      } catch { /* Ignore sessionStorage cleanup failure. */ }
      showDecisionReceipt(message, context);
    };

    const showFactorReceipt = (factor, titleText, detailText) => {
      openEventReader("description");
      setGoalFactor(factor, false, true);
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

    const { handleGoalProposalSubmit, requireDecisionText, humanDecisionError } = (${GOALS_PAGE.goalsProposal})({
      translate: globalThis.t.text, route, decisionReceiptContext, refreshBoardWithDecisionReceipt,
    });

    if (goalData) {
      bindTreeSearchEvents();
      documentPane.addEventListener("scroll", queueSave, { passive: true });
    }
    document.addEventListener("toggle", (event) => {
      if (event.target.matches?.("[data-persist-open]")) queueSave();
    }, true);
    document.addEventListener("change", (event) => {
      const changed = event.target?.nodeType === 1 ? event.target : null;
      if (!changed) return;
      const changedFactorForm = changed.closest("[data-relation-form], [data-policy-form]");
      if (changedFactorForm) {
`;
