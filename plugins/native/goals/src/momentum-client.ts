import { GOALS_MOMENTUM_VIEWPORT_FACTORY_SCRIPT } from "./momentum-viewport-client.js";

/** Goals owns graph data/geometry. Workbench retains selected document and terminal ownership. */
export const GOALS_MOMENTUM_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { workspace, documentCollection, route, getSelected, translate: L, queueSave, setWorkspaceMode, selectGoal } = host;
    const shell = workspace.querySelector("[data-goal-canvas-shell]");
    const frame = workspace.querySelector("[data-goal-node-workspace]");
    const workbench = workspace.querySelector("[data-goal-node-workbench]");
    const divider = workspace.querySelector("[data-goal-workspace-divider]");
    const graphElement = () => workspace.querySelector("[data-goal-momentum]");
    const kanbanElement = () => workspace.querySelector("[data-goal-kanban]");
    const reopenKanbanGroups = () => {
      const kanban = kanbanElement();
      if (!kanban || kanban.clientWidth <= 839) return;
      kanban.querySelectorAll("details[data-kanban-group]").forEach((group) => { group.open = true; });
    };
    if (shell && typeof ResizeObserver === "function") new ResizeObserver(reopenKanbanGroups).observe(shell);
    workspace.addEventListener("toggle", (event) => {
      const group = event.target;
      if (!group?.matches?.("details[data-kanban-group]")) return;
      const kanban = kanbanElement();
      if (kanban && kanban.clientWidth > 839) group.open = true;
    });
    workspace.addEventListener("wheel", (event) => {
      const board = event.target.closest?.("[data-goal-kanban]");
      if (!board || board.hasAttribute("inert") || event.ctrlKey || event.metaKey) return;
      const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const cards = event.target.closest("[data-kanban-cards]");
      // Keep vertical reading in its column, including at either end. Never switch axes at an edge.
      if (!horizontal && cards && cards.scrollHeight > cards.clientHeight + 1) return;
      if (board.scrollWidth <= board.clientWidth + 1) return;
      const amount = horizontal && event.deltaX ? event.deltaX : event.deltaY;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? board.clientWidth : 1;
      board.scrollLeft += amount * unit;
      event.preventDefault();
    }, { passive: false });
    let expanded = false;
    let goalGraphRequest = null;
    let graphLoadedOnce = false;
    let pendingView = null;
    let graphSelected = "";
    const syncKanbanSelection = () => {
      const selected = expanded ? getSelected() : graphSelected;
      kanbanElement()?.querySelectorAll("[data-kanban-card]").forEach((card) => {
        card.classList.toggle("is-selected", card.dataset.goalId === selected);
      });
    };
    const applyBoardVisibility = () => {
      const kanbanActive = host.isKanbanTabActive?.() === true;
      if (shell && host.isFrameTabActive?.() !== true) shell.dataset.boardView = kanbanActive ? "kanban" : "canvas";
      const graph = graphElement();
      const kanban = kanbanElement();
      if (graph) {
        graph.hidden = false;
        graph.toggleAttribute("inert", expanded || kanbanActive);
      }
      if (kanban) kanban.toggleAttribute("inert", expanded || !kanbanActive);
    };
    const selectGraphNode = (id) => { graphSelected = id; view.drawGoalGraph(); syncKanbanSelection(); queueSave(); };
    const splitScope = host.projectId || route("/");
    const splitKey = "molis-work-goal-workspace-split:" + splitScope;
    let shares = {};
    try { shares = JSON.parse(localStorage.getItem(splitKey) || localStorage.getItem("goalboard-goal-workspace-split:" + splitScope) || "{}"); } catch {}
    const setShare = (value, persist = false) => {
      if (!workbench || !divider) return;
      const width = workbench.clientWidth;
      const min = width >= 600 ? Math.max(.35, 280 / width) : .35;
      const max = width >= 600 ? Math.min(.8, 1 - 190 / width) : .8;
      const share = Math.max(min, Math.min(max, Number(value) || .7));
      workbench.style.setProperty("--goal-work-share", String(share));
      divider.setAttribute("aria-valuenow", String(Math.round(share * 100)));
      divider.setAttribute("aria-valuemin", String(Math.ceil(min * 100)));
      divider.setAttribute("aria-valuemax", String(Math.floor(max * 100)));
      divider.setAttribute("aria-valuetext", L("工作区 {left}%，时间线 {right}%", { left: Math.round(share * 100), right: 100 - Math.round(share * 100) }));
      if (persist) {
        shares[getSelected()] = share;
        try { localStorage.setItem(splitKey, JSON.stringify(shares)); } catch {}
      }
    };
    const view = (${GOALS_MOMENTUM_VIEWPORT_FACTORY_SCRIPT})({ graphElement, getSelected: () => expanded ? getSelected() : graphSelected, isExpanded: () => expanded, queueSave, openGoal: (id) => selectGoal(id), selectNode: selectGraphNode });
    const syncGoalWorkspace = (mode, active) => {
      if (!shell || !frame) return;
      const graph = graphElement();
      const showBoard = active && !host.isFrameTabActive?.();
      shell.dataset.goalActive = String(active);
      shell.hidden = !showBoard;
      if (!showBoard) {
        frame.hidden = true;
        if (active && graph?.dataset.loaded !== "true") void loadGoalGraph();
        else if (active) view.layout();
        return;
      }
      const nextExpanded = mode !== "graph" && Boolean(getSelected());
      if (expanded && !nextExpanded) { expanded = false; view.restoreOverview(); }
      else if (nextExpanded) { graphSelected = getSelected(); expanded = true; }
      frame.hidden = !expanded;
      frame.dataset.expandedGoal = expanded ? getSelected() : "";
      shell.dataset.expanded = String(expanded);
      applyBoardVisibility();
      syncKanbanSelection();
      setShare(shares[getSelected()] ?? .7);
      if (graph?.dataset.loaded !== "true") void loadGoalGraph();
      else view.layout();
    };
    const loadGoalGraph = async (force = false) => {
      const graph = graphElement();
      if (!graph || (!force && graph.dataset.loaded === "true")) return true;
      if (goalGraphRequest) return goalGraphRequest;
      graph.setAttribute("aria-busy", "true");
      const status = graph.querySelector("[data-goal-momentum-status]");
      const retry = graph.querySelector("[data-retry-goal-momentum]");
      if (status) { status.hidden = graphLoadedOnce; status.textContent = L("正在读取目标关系…"); }
      if (retry) retry.hidden = true;
      goalGraphRequest = (async () => {
        try {
          const response = await fetch(route("/api/board/momentum?view=" + documentCollection + "&goal_id=" + encodeURIComponent(getSelected() || "")), { cache: "no-store" });
          if (!response.ok) throw new Error(L("无法读取目标关系，请重试。"));
          const template = document.createElement("template");
          template.innerHTML = await response.text();
          const next = template.content.querySelector("[data-goal-momentum]");
          if (!next?.querySelector("[data-graph-stage]")) throw new Error(L("目标关系响应不完整，请重试。"));
          // Keep the root stable: the expanded workspace and TUI never join this replacement.
          graph.replaceChildren(...next.childNodes);
          graph.className = next.className;
          graph.dataset.loaded = "true";
          graph.dataset.defaultGoal = next.dataset.defaultGoal || "";
          const nextKanban = template.content.querySelector("[data-goal-kanban]");
          const kanban = kanbanElement();
          if (nextKanban && kanban) {
            const nextBoard = nextKanban.querySelector(".goal-kanban-board");
            const board = kanban.querySelector(".goal-kanban-board");
            if (nextBoard && board) {
              const left = kanban.scrollLeft;
              const top = kanban.scrollTop;
              const stacked = kanban.clientWidth <= 839;
              const collapsed = stacked
                ? [...board.querySelectorAll("[data-kanban-column]")].filter((column) => column.querySelector("details")?.open === false).map((column) => column.dataset.kanbanColumn)
                : [];
              board.replaceChildren(...nextBoard.childNodes);
              kanban.scrollLeft = left;
              kanban.scrollTop = top;
              collapsed.forEach((status) => {
                const group = board.querySelector('[data-kanban-column="' + status + '"] details');
                if (group) group.open = false;
              });
            } else {
              const inert = kanban.hasAttribute("inert");
              kanban.replaceWith(nextKanban);
              const replaced = kanbanElement();
              if (replaced) replaced.toggleAttribute("inert", inert);
            }
          }
          if (!graphSelected || !graph.querySelector('[data-goal-id="' + CSS.escape(graphSelected) + '"]')) graphSelected = graph.dataset.defaultGoal;
          view.bindGoalGraphViewport();
          if (!graphLoadedOnce && !pendingView) view.centerGoal();
          if (pendingView) { view.restoreView(pendingView); pendingView = null; }
          graphLoadedOnce = true;
          applyBoardVisibility();
          syncKanbanSelection();
          reopenKanbanGroups();
          view.layout();
          return true;
        } catch (error) {
          const message = graph.querySelector("[data-goal-momentum-status]");
          if (message) { message.hidden = false; message.textContent = error.message || L("无法读取目标关系，请重试。"); }
          graph.querySelector("[data-retry-goal-momentum]")?.removeAttribute("hidden");
          return false;
        } finally { graph.removeAttribute("aria-busy"); goalGraphRequest = null; }
      })();
      return goalGraphRequest;
    };
    const collapse = () => {
      setWorkspaceMode("graph");
      // Let removal of inert and the expanded-node visibility reach a paint before focus.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const kanban = kanbanElement();
        const card = kanban?.querySelector('[data-goal-id="' + CSS.escape(getSelected()) + '"]');
        if (kanban && shell.dataset.boardView === "kanban" && card) {
          card.focus({ preventScroll: true });
          return;
        }
        const node = graphElement()?.querySelector('[data-goal-id="' + CSS.escape(getSelected()) + '"]');
        node?.focus({ preventScroll: true });
      }));
    };
    frame?.querySelector("[data-goal-collapse]")?.addEventListener("click", collapse);
    divider?.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !expanded) return;
      divider.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    divider?.addEventListener("pointermove", (event) => {
      if (!divider.hasPointerCapture(event.pointerId)) return;
      const rect = workbench.getBoundingClientRect();
      setShare((event.clientX - rect.left) / rect.width, true);
    });
    const finishSplit = (event) => { if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId); };
    divider?.addEventListener("pointerup", finishSplit);
    divider?.addEventListener("pointercancel", finishSplit);
    divider?.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
      event.preventDefault();
      const current = Number(workbench.style.getPropertyValue("--goal-work-share")) || .7;
      setShare(event.key === "Home" ? .7 : current + (event.key === "ArrowRight" ? .02 : -.02), true);
    });
    shell?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest("[data-kanban-card]");
      if (!card || event.target !== card) return;
      event.preventDefault();
      void selectGoal(card.dataset.goalId);
    });
    if (shell) new ResizeObserver(() => { setShare(shares[getSelected()] ?? .7); if (shell.dataset.goalActive === "true") view.layout(); }).observe(shell);
    return {
      graphElement, loadGoalGraph, syncGoalWorkspace,
      updateGraphVisibility: () => { view.drawGoalGraph(); syncKanbanSelection(); },
      readMomentumState: () => ({ canvasView: graphLoadedOnce ? { ...view.readView(), selectedGoal: graphSelected } : pendingView }),
      restoreMomentumState: (ui) => { if (ui?.canvasView) { pendingView = ui.canvasView; graphSelected = pendingView.selectedGoal || graphSelected; view.restoreView(pendingView); } },
      rememberMomentumGoal: () => { if (expanded) { view.focusGoal(); setShare(shares[getSelected()] ?? .7); } },
      scheduleGoalGraphLayout: () => requestAnimationFrame(() => view.layout()),
      restoreGoalGraphViewport: () => view.layout(),
      locateGraphNode: (id) => {
        selectGraphNode(id);
        const kanban = kanbanElement();
        if (host.isKanbanTabActive?.() && kanban) {
          kanban.querySelector('[data-goal-id="' + CSS.escape(id) + '"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
          return;
        }
        view.centerGoal();
      },
      handleMomentumNavigationClick: (target) => { if (!target.closest("[data-retry-goal-momentum]")) return false; void loadGoalGraph(true); return true; },
      handleMomentumSelectionClick: (target) => {
        const card = target.closest("[data-kanban-card]");
        if (card) { void selectGoal(card.dataset.goalId); return true; }
        const node = target.closest("[data-momentum-node]");
        if (!node) return false;
        if (target.closest("[data-graph-frame]")) { host.openFrame?.(node.dataset.goalId); return true; }
        if (target.closest("[data-graph-open]")) void selectGoal(node.dataset.goalId);
        else selectGraphNode(node.dataset.goalId);
        return true;
      },
      handleMomentumZoomClick: (target) => {
        const button = target.closest("[data-graph-zoom]");
        if (!button) return false;
        if (button.dataset.graphZoom === "fit") view.fitGoalGraph();
        else view.setGraphZoom(view.getZoom() * (button.dataset.graphZoom === "in" ? 1.15 : .85));
        return true;
      },
    };
  }`;
