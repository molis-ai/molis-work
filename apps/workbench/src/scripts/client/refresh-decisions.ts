import { GOALS_PROPOSAL_CLIENT_FACTORY_SCRIPT } from "@adeptify/goalboard-plugin-goals";
import { GOALS_NAVIGATION_CLIENT_FACTORY_SCRIPT } from "@adeptify/goalboard-plugin-goals";
import { GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT } from "@adeptify/goalboard-plugin-goals";
import { GOALS_TREE_CLIENT_FACTORY_SCRIPT } from "@adeptify/goalboard-plugin-goals";
import { GOALS_REFRESH_CLIENT_FACTORY_SCRIPT } from "@adeptify/goalboard-plugin-goals";
/** AP3 Workbench client segment: refresh-decisions. */
export const CLIENT_REFRESH_DECISIONS_SCRIPT = `      }
      setMobileView(restoredMobileView);
      if (hashTargetId && (activeDesktopSurface === "goal" || decisionView)) void revealDeepLinkFromId(hashTargetId);
    };

    const saveUiState = () => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(readUiState()));
      } catch {}
    };

    const queueSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveUiState, 120);
    };

    const applySelection = (goalId, resetScroll) => {
      const item = visibleGoals().find((entry) => entry.goal.goal_id === goalId);
      if (!item) return false;
      selected = goalId;
      rememberMomentumGoal(goalId);
      document.querySelector("[data-tui-pane]")?.setAttribute("data-goal-id", goalId);
      document.dispatchEvent(new CustomEvent("goalboard:goal-changed", { detail: {
        goalId,
        goalTitle: item.goal.title,
        status: item.status,
        statusLabel: item.status_label,
        statusMeaning: item.status_meaning,
        statusIconMarkup: item.status_icon,
        parentReadOnly: Boolean(item.is_compound_parent),
        children: item.children || [],
      } }));
      selectTreeGoal(goalId);
      if (navigatorView === "graph") updateGraphVisibility();
      document.title = item.goal.title + " · GoalBoard";
      if (resetScroll && activeDesktopSurface === "goal") documentPane.scrollTop = 0;
      renderWorkTabs();
      return true;
    };

    let documentReplaceGeneration = 0;
    const { loadGoalDocument } = (${GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT})({
      documentPane, documentCollection, route, translate: L, isAbortError,
      showError: (message) => showToast(message, true),
      afterReplace: () => {
        documentReplaceGeneration += 1;
        updateAllRelationFormPreviews();
        bindGoalEventDocument(pendingEventRestore);
        pendingEventRestore = null;
        openEventReaderFromHash();
        setGoalFactor(goalFactorFromHash() || "basics", false);
      },
    });
    reloadGoalEventDocument = async (goalId, restore) => {
      pendingEventRestore = restore || null;
      return loadGoalDocument(goalId);
    };

    const { selectGoal, handleGoalSelectClick, handleGoalPopState, handleGoalHashChange } =
      (${GOALS_NAVIGATION_CLIENT_FACTORY_SCRIPT})({
        decisionView, trashView, archiveView, documentPane,
        getSelected: () => selected, getActiveGoalId: () => state.active_goal_id,
        navigateToGoal: (goalId) => location.assign(globalThis.goalboardNavigationUrl(route("/goals/" + encodeURIComponent(goalId)))),
        applySelection, loadGoalDocument, ensureWorkTab,
        goalPageUrl, setWorkspaceMode, saveUiState, localPathname, visibleGoals,
        openEventReaderFromHash, goalFactorFromHash, setGoalFactor, revealDeepLinkFromId,
      });
    const { selectTreeGoal, getCollapsedTreeGoals, restoreTreeCollapsed, setSelectedStatuses, getSelectedStatuses, isTreeSearchComposing,
      setTreeFilterOpen, filterTree, bindTreeSearchEvents, bindTreeFilterTrigger,
      handleTreeStatusChange, handleTreeSearchFocus, handleTreeDisclosureClick,
      handleTreeCollapseAllClick, handleTreeKeyboard } = (${GOALS_TREE_CLIENT_FACTORY_SCRIPT})({
        treeFilter, treeFilterTrigger, treeSearch, treeScroll, globalSearch, translate: L,
        updateGraphVisibility, queueSave, saveUiState,
        noteSearchActivity: (...args) => noteSearchActivity(...args),
      });
    const { prepareGoalRefresh } = (${GOALS_REFRESH_CLIENT_FACTORY_SCRIPT})({
      treeScroll, treeFilter, documentPane, dialog, readCreateDraft, refreshCreateChoices, translate: L,
    });
    const searchInteractionActive = () => isTreeSearchComposing() || Date.now() < searchBusyUntil;

    const liveUiInteractionActive = () => {
      const active = document.activeElement;
      if (active?.closest?.("[data-live-form], [data-event-form]")) return true;
      const dirtyVisibleForm = [...document.querySelectorAll('[data-live-form][data-live-dirty="true"], [data-event-form][data-live-dirty="true"]')]
        .some((form) => form.getClientRects().length > 0 || form.closest("[data-goal-node-workspace]")?.hidden);
      if (dirtyVisibleForm) return true;
      return active?.matches?.('input, textarea, select, [contenteditable="true"]') && Boolean(
        active.closest?.('[data-directory-panel="feed"], [data-directory-panel="sources"], [data-work-surface="feed"], [data-work-surface="sources"]'),
      );
    };

    document.addEventListener("input", (event) => {
      event.target?.closest?.("[data-live-form], [data-event-form]")?.setAttribute("data-live-dirty", "true");
    });
    document.addEventListener("change", (event) => {
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

    const refreshBoard = async (force = false) => {
      if (syncing || document.hidden) return;
      if (!force && searchInteractionActive()) {
        scheduleDeferredRefresh();
        return;
      }
      if (!force && liveUiInteractionActive()) {
        return;
      }
      syncing = true;
      try {
        const cursorResponse = await fetch(route("/api/board/cursor"), { cache: "no-store" });
        if (!cursorResponse.ok) throw new Error("无法读取 GoalBoard 游标");
        const cursorState = await cursorResponse.json();
        if (Number(cursorState.observed_event_cursor) === Number(state.snapshot.cursor)) {
          return;
        }
        if (!force && searchInteractionActive()) {
          scheduleDeferredRefresh();
          return;
        }
        if (!force && liveUiInteractionActive()) return;
        const refreshGoalId = selected;
        const pageBase = goalPageBase();
        const collectionPath = trashView ? "/trash" : archiveView ? "/archive" : "/";
        const pagePath = decisionView
          ? route("/decisions")
          : refreshGoalId
            ? pageBase + encodeURIComponent(refreshGoalId)
            : route(collectionPath);
        const compactRefreshPath = route("/api/board/refresh?view=" + documentCollection +
          (refreshGoalId ? "&goal_id=" + encodeURIComponent(refreshGoalId) : ""));
        const refreshGeneration = documentReplaceGeneration;
        let pageResponse = await fetch(decisionView ? pagePath : compactRefreshPath, { cache: "no-store" });
        if (!pageResponse.ok && !decisionView) {
          pageResponse = await fetch(pagePath, { cache: "no-store" });
        }
        if (!pageResponse.ok && !decisionView) {
          pageResponse = await fetch(route(collectionPath), { cache: "no-store" });
        }
        if (!pageResponse.ok) throw new Error("无法更新 Goal 页面");
        const parsed = new DOMParser().parseFromString(await pageResponse.text(), "text/html");
        if (parsed.body.dataset.boardView !== document.body.dataset.boardView) {
          location.reload();
          return;
        }
        const nextStateNode = parsed.querySelector("#goalboard-data");
        if (!nextStateNode) throw new Error("页面状态不完整");
        const nextState = JSON.parse(nextStateNode.textContent);
        if (!decisionView && refreshGeneration !== documentReplaceGeneration) {
          scheduleDeferredRefresh();
          return;
        }
        if (decisionView) {
          const nextFeedList = parsed.querySelector("[data-feed-list]");
          const nextFeedWorkbench = parsed.querySelector("[data-feed-workbench]");
          const nextFeedDetailEmpty = nextFeedWorkbench?.querySelector("[data-feed-detail-empty]");
          if (!feedList || !feedWorkbench || !feedEmpty || !feedDetailEmpty || !nextFeedList || !nextFeedWorkbench || !nextFeedDetailEmpty) {
            throw new Error("待决定页面数据不完整");
          }
          const scrollTop = window.scrollY;
          const nextRows = [...nextFeedList.querySelectorAll("[data-feed-entry-id]")];
          feedList.querySelectorAll("[data-feed-entry-id]").forEach((row) => row.remove());
          nextRows.forEach((row) => feedList.insertBefore(row, feedEmpty));
          feedWorkbench.querySelectorAll("[data-feed-detail]").forEach((detail) => detail.remove());
          [...nextFeedWorkbench.querySelectorAll("[data-feed-detail]")]
            .forEach((detail) => feedWorkbench.insertBefore(detail, feedDetailEmpty));
          feedDetailEmpty.innerHTML = nextFeedDetailEmpty.innerHTML;
          feedDetailEmpty.hidden = nextFeedDetailEmpty.hidden;
          feedWorkbench.dataset.loaded = nextFeedWorkbench.dataset.loaded || "true";
          feedWorkbench.dataset.loadedPreset = nextFeedWorkbench.dataset.loadedPreset || "inbox_message";
          state = nextState;
          projectHome?.sync();
          document.querySelector("#goalboard-data").textContent = JSON.stringify(nextState).replaceAll("<", "\\u003c");
          const deepLinkedEntry = decisionFeedEntryFromHash();
          if (deepLinkedEntry && !nextRows.some((row) => row.dataset.feedEntryId === deepLinkedEntry)) {
            history.replaceState(null, "", location.pathname + location.search);
          }
          selectedFeedItem = nextRows.find((row) => row.classList.contains("is-selected"))?.dataset.feedEntryId || "";
          filterFeedItems(false);
          window.scrollTo({ top: scrollTop, behavior: "instant" });
          return;
        }
        const goalRefresh = prepareGoalRefresh(parsed, {
          active_goal_id: nextState.active_goal_id, goals: nextState.goals,
          archived_goals: nextState.archived_goals, trashed_goals: nextState.trashed_goals,
        }, visibleGoals(nextState), refreshGoalId, collectionPath);
        if (!force && searchInteractionActive()) {
          scheduleDeferredRefresh();
          return;
        }
        if (selected !== refreshGoalId) {
          scheduleDeferredRefresh();
          return;
        }
        if (goalRefresh.move) {
          const { path: movedPath, message } = goalRefresh.move;
          try {
            sessionStorage.setItem(goalMoveReceiptKey, JSON.stringify({ goalId: refreshGoalId, message }));
          } catch {}
          saveUiState();
          location.replace(globalThis.goalboardNavigationUrl(route(movedPath)));
          return "reloading";
        }
        if (!force && liveUiInteractionActive()) return;
        const ui = readUiState();
        const replaceNavLink = (current, next) => {
          if (!current || !next) return;
          current.innerHTML = next.innerHTML;
          current.className = next.className;
          for (const name of ["href", "aria-label", "aria-current", "title"]) {
            const value = next.getAttribute(name);
            if (value == null) current.removeAttribute(name);
            else current.setAttribute(name, value);
          }
        };
        goalRefresh.apply(() => {
          for (const selector of ["[data-decisions-link]", "[data-archive-link]", "[data-trash-link]"]) {
            replaceNavLink(document.querySelector(selector), parsed.querySelector(selector));
          }
        });
        state = nextState;
        projectHome?.sync();
        document.querySelector("#goalboard-data").textContent = JSON.stringify(nextState).replaceAll("<", "\\u003c");
        selected = goalRefresh.nextSelected;
        if (selected) ensureWorkTab(selected);
        if (!decisionView && selected) applySelection(selected, false);
        applyUiState(ui);
        updateAllRelationFormPreviews();
        bindGoalEventDocument();
        const refreshedGraph = graphElement();
        if (refreshedGraph?.dataset.loaded === "true") {
          if (workspace.dataset.workspaceMode === "graph") void loadGoalGraph(true);
          else refreshedGraph.dataset.loaded = "false";
        }
        requestAnimationFrame(() => documentPane.classList.remove("is-syncing"));
      } catch {
      } finally {
        syncing = false;
      }
    };

    const decisionReceiptContext = (decisionForm) => {
      const ownerLink = decisionForm.closest(".decision-goal-group")?.querySelector("a.decision-owner-link");
      return {
        goalTitle: ownerLink?.querySelector("strong")?.textContent?.trim() || "",
        goalHref: ownerLink?.getAttribute("href") || "",
      };
    };

    const showDecisionReceipt = (message, context) => {
      const center = document.querySelector("[data-decision-center]");
      const activeFeedDetail = feedWorkbench?.querySelector('[data-feed-detail]:not([hidden])');
      const receiptHost = center || activeFeedDetail;
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
      title.textContent = L("已记录你的决定");
      const detail = document.createElement("span");
      detail.textContent = message + " " + (receiptHost.querySelector(".decision-record") ? L("下一步：继续处理下面的待决定事项。") : L("下一步：返回 Goal 查看结果。"));
      copy.append(title, detail);
      receipt.append(copy);
      if (context?.goalHref) {
        const link = document.createElement("a");
        link.href = context.goalHref;
        link.textContent = context.goalTitle ? L("返回「{title}」", { title: context.goalTitle }) : L("返回 Goal");
        receipt.append(link);
      }
      const receiptAnchor = receiptHost.querySelector(".decision-center-header, .feed-detail-header");
      if (receiptAnchor) receiptAnchor.after(receipt);
      else receiptHost.prepend(receipt);
      receipt.focus({ preventScroll: true });
    };

    const refreshBoardWithDecisionReceipt = async (message, context) => {
      try {
        sessionStorage.setItem("goalboard-decision-receipt", JSON.stringify({ message, context }));
      } catch {}
      const refreshResult = await refreshBoard(true);
      if (refreshResult === "reloading") return;
      try {
        sessionStorage.removeItem("goalboard-decision-receipt");
      } catch {}
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

    const { handleGoalProposalSubmit, requireDecisionText, humanDecisionError } = (${GOALS_PROPOSAL_CLIENT_FACTORY_SCRIPT})({
      translate: L, route, controlHeaders: goalboardControlHeaders, decisionReceiptContext, refreshBoardWithDecisionReceipt,
    });

    bindTreeSearchEvents();
    documentPane.addEventListener("scroll", queueSave, { passive: true });
    document.addEventListener("toggle", (event) => {
      if (event.target.matches?.("[data-persist-open]")) queueSave();
    }, true);
    document.addEventListener("change", (event) => {
      const changed = event.target instanceof Element ? event.target : null;
      if (!changed) return;
      const changedFactorForm = changed.closest("[data-relation-form], [data-risk-create-form], [data-risk-edit-form], [data-impact-create-form], [data-impact-edit-form], [data-policy-form]");
      if (changedFactorForm) {
`;
