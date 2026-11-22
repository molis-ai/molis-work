import { elementOf, failureOf } from "./dom.js";
import { type CanvasView, momentumViewport } from "./momentum-viewport.js";
import type { GoalCollection, Route, SetWorkspaceMode } from "./types.js";

export interface MomentumHost {
  readonly workspace: HTMLElement;
  readonly documentCollection: GoalCollection;
  readonly route: Route;
  readonly getSelected: () => string;
  readonly queueSave: () => void;
  readonly setWorkspaceMode: SetWorkspaceMode;
  readonly selectGoal: (goalId: string) => Promise<unknown> | unknown;
  readonly applySelection?: (goalId: string) => unknown;
  readonly openFrame?: (goalId: string) => unknown;
  readonly isFrameTabActive?: () => boolean;
  readonly isKanbanTabActive?: () => boolean;
}

/** The Goal graph (momentum), its canvas and board views. */
export function momentumClient(host: MomentumHost) {
  const { workspace, documentCollection, route, getSelected, queueSave, setWorkspaceMode, selectGoal } = host;
  const shell = workspace.querySelector<HTMLElement>("[data-goal-canvas-shell]");
  const frame = workspace.querySelector<HTMLElement>("[data-goal-node-workspace]");
  const graphElement = () => workspace.querySelector<HTMLElement>("[data-goal-momentum]");
  const kanbanElement = () => workspace.querySelector<HTMLElement>("[data-goal-kanban]");
  let lastWidth = 0;
  const readWidth = () => (lastWidth = shell?.clientWidth || lastWidth);
  const openColumns = () => {
    const kanban = kanbanElement();
    if (!kanban || readWidth() <= 839) return;
    kanban.querySelectorAll<HTMLDetailsElement>("details[data-kanban-group]").forEach((group) => { group.open = true; });
  };
  if (shell && typeof ResizeObserver === "function") new ResizeObserver(openColumns).observe(shell);
  // Native toggle does not bubble; retain desktop columns even when another surface hides them.
  workspace.addEventListener("toggle", (event) => {
    if (elementOf(event)?.matches?.("[data-kanban-group]")) openColumns();
  }, true);
  workspace.addEventListener("wheel", (event) => {
    const target = elementOf(event);
    const board = target?.closest?.<HTMLElement>("[data-goal-kanban]");
    if (!board || board.hasAttribute("inert") || event.ctrlKey || event.metaKey) return;
    const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const cards = target?.closest("[data-kanban-cards]");
    // Keep vertical reading in its column, including at either end. Never switch axes at an edge.
    if (!horizontal && cards && cards.scrollHeight > cards.clientHeight + 1) return;
    if (board.scrollWidth <= board.clientWidth + 1) return;
    const amount = horizontal && event.deltaX ? event.deltaX : event.deltaY;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? board.clientWidth : 1;
    board.scrollLeft += amount * unit;
    event.preventDefault();
  }, { passive: false });
  let expanded = false;
  let goalGraphRequest: Promise<boolean> | null = null;
  let graphLoadedOnce = false;
  let pendingView: CanvasView | null = null;
  let graphSelected = "";
  let needsInitialCenter = true;
  const syncKanbanSelection = () => {
    const selected = expanded ? getSelected() : graphSelected;
    kanbanElement()?.querySelectorAll<HTMLElement>("[data-kanban-card]").forEach((card) => {
      card.classList.toggle("is-selected", card.dataset.goalId === selected);
    });
  };
  const applyBoardVisibility = () => {
    const boardView = shell?.dataset.boardView;
    const kanbanActive = boardView === "kanban";
    const listActive = boardView === "list";
    const graph = graphElement();
    const kanban = kanbanElement();
    if (graph) {
      graph.hidden = false;
      graph.toggleAttribute("inert", expanded || kanbanActive || listActive);
    }
    if (kanban) kanban.toggleAttribute("inert", expanded || !kanbanActive);
    if (kanbanActive) openColumns();
    if (boardView === "canvas" && graph?.dataset.loaded === "true") {
      const run = () => {
        if (shell?.dataset.boardView !== "canvas") return false;
        const port = graph.querySelector("[data-graph-viewport]");
        if (!port?.clientWidth) return false;
        if (needsInitialCenter) {
          needsInitialCenter = false;
          view.introduceGoalGraph();
        } else view.layout();
        return true;
      };
      if (!run()) requestAnimationFrame(run);
    }
  };
  const selectGraphNode = (id: string) => {
    graphSelected = id;
    view.drawGoalGraph();
    syncKanbanSelection();
    queueSave();
  };
  const openGoalFrame = (id: string | undefined) => {
    if (!id) return;
    selectGraphNode(id);
    host.applySelection?.(id);
    if (host.openFrame) host.openFrame(id);
    else void selectGoal(id);
  };
  let boardGestureTimer: ReturnType<typeof setTimeout> | null = null;
  const openBoardWorkspace = (id: string | undefined) => { if (id) void selectGoal(id); };
  const openBoardGoal = (id: string | undefined, detail: unknown) => {
    if (!id) return;
    if (boardGestureTimer) {
      clearTimeout(boardGestureTimer);
      boardGestureTimer = null;
    }
    if (Number(detail) > 1) {
      openGoalFrame(id);
      return;
    }
    boardGestureTimer = setTimeout(() => {
      boardGestureTimer = null;
      openBoardWorkspace(id);
    }, 220);
  };
  const view = momentumViewport({ graphElement, getSelected: () => expanded ? getSelected() : graphSelected, isExpanded: () => expanded, queueSave, openGoal: (id) => selectGoal(id), openFrame: (id) => openGoalFrame(id), selectNode: selectGraphNode });
  const syncGoalWorkspace = (mode: string, active: boolean) => {
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
    if (expanded && !nextExpanded) {
      expanded = false;
      view.restoreOverview();
    }
    else if (nextExpanded) {
      graphSelected = getSelected();
      expanded = true;
    }
    frame.hidden = !expanded;
    frame.dataset.expandedGoal = expanded ? getSelected() : "";
    shell.dataset.expanded = String(expanded);
    applyBoardVisibility();
    syncKanbanSelection();
    if (graph?.dataset.loaded !== "true") void loadGoalGraph();
    else view.layout();
  };
  const replaceKanban = (template: HTMLTemplateElement) => {
    const nextKanban = template.content.querySelector("[data-goal-kanban]");
    const kanban = kanbanElement();
    if (!nextKanban || !kanban) return;
    const nextBoard = nextKanban.querySelector(".goal-kanban-board");
    const board = kanban.querySelector(".goal-kanban-board");
    if (nextBoard && board) {
      const left = kanban.scrollLeft;
      const top = kanban.scrollTop;
      const width = readWidth();
      const stacked = width > 0 && width <= 839;
      const collapsed = stacked
        ? [...board.querySelectorAll<HTMLElement>("[data-kanban-column]")].filter((column) => column.querySelector("details")?.open === false).map((column) => column.dataset.kanbanColumn)
        : [];
      board.replaceChildren(...nextBoard.childNodes);
      kanban.scrollLeft = left;
      kanban.scrollTop = top;
      collapsed.forEach((status) => {
        const group = board.querySelector<HTMLDetailsElement>('[data-kanban-column="' + status + '"] details');
        if (group) group.open = false;
      });
    } else {
      const inert = kanban.hasAttribute("inert");
      kanban.replaceWith(nextKanban);
      const replaced = kanbanElement();
      if (replaced) replaced.toggleAttribute("inert", inert);
    }
  };
  const loadGoalGraph = async (force = false): Promise<boolean> => {
    const graph = graphElement();
    if (!graph || (!force && graph.dataset.loaded === "true")) return true;
    if (goalGraphRequest) return goalGraphRequest;
    graph.setAttribute("aria-busy", "true");
    const status = graph.querySelector<HTMLElement>("[data-goal-momentum-status]");
    const retry = graph.querySelector<HTMLElement>("[data-retry-goal-momentum]");
    if (status) {
      status.hidden = graphLoadedOnce;
      status.textContent = globalThis.t.text("goals.momentum-client.loading-goal-relationships");
    }
    if (retry) retry.hidden = true;
    goalGraphRequest = (async () => {
      try {
        const selected = getSelected();
        const html = await molisWorkRequest<string>(route("/api/board/momentum?view=" + documentCollection + (selected ? "&goal_id=" + encodeURIComponent(selected) : "")), { as: "text", fallback: globalThis.t.text("goals.momentum-client.could-not-load-goal-relationships-please-retry") });
        const template = document.createElement("template");
        template.innerHTML = html;
        const next = template.content.querySelector<HTMLElement>("[data-goal-momentum]");
        if (!next?.querySelector("[data-graph-stage]")) throw new Error(globalThis.t.text("goals.momentum-client.goal-relationship-response-was-incomplete-please-retry"));
        // Keep the root stable: the expanded workspace and TUI never join this replacement.
        graph.replaceChildren(...next.childNodes);
        graph.className = next.className;
        graph.dataset.loaded = "true";
        graph.dataset.defaultGoal = next.dataset.defaultGoal || "";
        replaceKanban(template);
        if (!graphSelected || !graph.querySelector('[data-goal-id="' + CSS.escape(graphSelected) + '"]')) graphSelected = graph.dataset.defaultGoal || "";
        view.bindGoalGraphViewport();
        if (pendingView) {
          view.restoreView(pendingView);
          pendingView = null;
          needsInitialCenter = false;
        } else if (!graphLoadedOnce) {
          view.introduceGoalGraph();
          if (graph.querySelector("[data-graph-viewport]")?.clientWidth) needsInitialCenter = false;
        }
        graphLoadedOnce = true;
        applyBoardVisibility();
        syncKanbanSelection();
        openColumns();
        view.layout();
        return true;
      } catch (error) {
        const message = graph.querySelector<HTMLElement>("[data-goal-momentum-status]");
        const failure = failureOf(error);
        if (message) {
          message.hidden = false;
          message.textContent = (failure.status ? "" : failure.message) || globalThis.t.text("goals.momentum-client.could-not-load-goal-relationships-please-retry");
        }
        graph.querySelector("[data-retry-goal-momentum]")?.removeAttribute("hidden");
        return false;
      } finally {
        graph.removeAttribute("aria-busy");
        goalGraphRequest = null;
      }
    })();
    return goalGraphRequest;
  };
  const collapse = () => {
    setWorkspaceMode("graph");
    // Let removal of inert and the expanded-node visibility reach a paint before focus.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const kanban = kanbanElement();
      const card = kanban?.querySelector<HTMLElement>('[data-goal-id="' + CSS.escape(getSelected()) + '"]');
      if (kanban && shell?.dataset.boardView === "kanban" && card) {
        card.focus({ preventScroll: true });
        return;
      }
      const node = graphElement()?.querySelector<HTMLElement>('[data-goal-id="' + CSS.escape(getSelected()) + '"]');
      node?.focus({ preventScroll: true });
    }));
  };
  frame?.querySelector("[data-goal-collapse]")?.addEventListener("click", collapse);
  shell?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = elementOf(event);
    const card = target?.closest<HTMLElement>("[data-kanban-card]");
    if (!card || target !== card) return;
    event.preventDefault();
    openBoardWorkspace(card.dataset.goalId);
  });
  if (shell) new ResizeObserver(() => { if (shell.dataset.goalActive === "true") view.layout(); }).observe(shell);
  return {
    graphElement, loadGoalGraph, syncGoalWorkspace,
    updateGraphVisibility: () => {
      view.drawGoalGraph();
      syncKanbanSelection();
    },
    readMomentumState: () => ({ canvasView: graphLoadedOnce ? { ...view.readView(), selectedGoal: graphSelected } : pendingView }),
    restoreMomentumState: (ui: { canvasView?: CanvasView | null } | null | undefined) => {
      if (!ui?.canvasView) return;
      pendingView = ui.canvasView;
      graphSelected = pendingView.selectedGoal || graphSelected;
      view.restoreView(pendingView);
      needsInitialCenter = false;
    },
    rememberMomentumGoal: () => { if (expanded) view.focusGoal(); },
    scheduleGoalGraphLayout: () => requestAnimationFrame(() => view.layout()),
    restoreGoalGraphViewport: () => view.layout(),
    locateGraphNode: (id: string) => {
      selectGraphNode(id);
      const kanban = kanbanElement();
      if (host.isKanbanTabActive?.() && kanban) {
        kanban.querySelector('[data-goal-id="' + CSS.escape(id) + '"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
        return;
      }
      view.centerGoal();
    },
    handleMomentumNavigationClick: (target: Element) => {
      if (!target.closest("[data-retry-goal-momentum]")) return false;
      void loadGoalGraph(true);
      return true;
    },
    handleMomentumSelectionClick: (target: Element, event?: MouseEvent) => {
      const card = target.closest<HTMLElement>("[data-kanban-card]");
      if (card) {
        openBoardGoal(card.dataset.goalId, event?.detail);
        return true;
      }
      const node = target.closest<HTMLElement>("[data-momentum-node]");
      if (!node) return false;
      if (target.closest("[data-graph-frame]")) openGoalFrame(node.dataset.goalId);
      else if (target.closest("[data-graph-open]")) openBoardWorkspace(node.dataset.goalId);
      else openBoardGoal(node.dataset.goalId, event?.detail);
      return true;
    },
    handleMomentumZoomClick: (target: Element) => {
      const button = target.closest<HTMLElement>("[data-graph-zoom]");
      if (!button) return false;
      if (button.dataset.graphZoom === "fit") view.fitGoalGraph();
      else view.setGraphZoom(view.getZoom() * (button.dataset.graphZoom === "in" ? 1.15 : .85));
      return true;
    },
  };
}
