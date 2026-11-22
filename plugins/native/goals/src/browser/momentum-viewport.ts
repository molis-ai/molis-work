import { elementOf } from "./dom.js";

export interface ViewportHost {
  readonly graphElement: () => HTMLElement | null;
  readonly getSelected: () => string;
  readonly isExpanded: () => boolean;
  readonly queueSave: () => void;
  readonly openGoal: (id: string) => unknown;
  readonly openFrame?: (id: string) => unknown;
  readonly selectNode: (id: string) => void;
}

interface Camera { x: number; y: number; z: number }
interface Point { x: number; y: number }

/** What the canvas keeps between visits: the camera, the places a person dragged Goals to, and whether it fits itself. */
export interface CanvasView {
  readonly camera?: Camera;
  readonly positions?: Record<string, Point>;
  readonly autoFit?: boolean;
  readonly selectedGoal?: string;
}

const finite = (value: unknown): value is number => Number.isFinite(value);
const isPoint = (value: unknown): value is Point => Boolean(value) && typeof value === "object"
  && finite((value as Partial<Point>).x) && finite((value as Partial<Point>).y);

/** The Goal graph's camera: drawing, panning, zooming and dragging its nodes. */
export function momentumViewport(host: ViewportHost) {
  const { graphElement, getSelected, isExpanded, queueSave } = host;
  let camera: Camera = { x: 0, y: 0, z: 1 };
  let overviewCamera: Camera | null = null;
  let autoFit = false;
  let positions: Record<string, Point> = {};
  let suppressClick = false;
  const viewport = () => graphElement()?.querySelector<HTMLElement>("[data-graph-viewport]") ?? null;
  const stage = () => graphElement()?.querySelector<HTMLElement>("[data-graph-stage]") ?? null;
  const nodes = () => [...(stage()?.querySelectorAll<HTMLElement>("[data-graph-node]") || [])];
  const idOf = (node: HTMLElement) => node.dataset.goalId || "";
  const point = (node: HTMLElement): Point => positions[idOf(node)] || { x: Number(node.dataset.nodeX), y: Number(node.dataset.nodeY) };
  const size = (node: HTMLElement) => isExpanded() && idOf(node) === getSelected()
    ? { w: Math.max(0, (viewport()?.clientWidth || 0) - 36), h: Math.max(0, (viewport()?.clientHeight || 0) - 36) }
    : { w: node.offsetWidth, h: node.offsetHeight };
  const drawGoalGraph = () => {
    const world = stage();
    if (!world) return;
    const all = nodes();
    const byId = new Map(all.map((node) => [idOf(node), node]));
    world.style.transform = "translate(" + camera.x + "px," + camera.y + "px) scale(" + camera.z + ")";
    world.dataset.graphScale = String(camera.z);
    world.dataset.cameraX = String(camera.x);
    world.dataset.cameraY = String(camera.y);
    graphElement()?.querySelectorAll("[data-graph-zoom-value]").forEach((label) => { label.textContent = Math.round(camera.z * 100) + "%"; });
    all.forEach((node) => {
      const p = point(node);
      node.style.transform = "translate(" + p.x + "px," + p.y + "px)";
      const selected = idOf(node) === getSelected();
      node.classList.toggle("is-selected", selected);
      node.classList.toggle("is-expanded-node", selected && isExpanded());
      node.toggleAttribute("aria-current", selected);
      if (selected) node.setAttribute("aria-current", "true");
    });
    const edges = [...world.querySelectorAll<SVGElement>("[data-graph-edge]")];
    const upstream = new Set([getSelected()]);
    const downstream = new Set([getSelected()]);
    const from = (edge: SVGElement) => edge.dataset.edgeFrom || "", to = (edge: SVGElement) => edge.dataset.edgeTo || "";
    let changed = true;
    while (changed) {
      changed = false;
      edges.forEach((edge) => {
        if (upstream.has(to(edge)) && !upstream.has(from(edge))) {
          upstream.add(from(edge));
          changed = true;
        }
        if (downstream.has(from(edge)) && !downstream.has(to(edge))) {
          downstream.add(to(edge));
          changed = true;
        }
      });
    }
    edges.forEach((edge) => {
      const start = byId.get(from(edge)), end = byId.get(to(edge));
      if (!start || !end) return;
      const a = point(start), b = point(end), aSize = size(start), bSize = size(end);
      const x1 = a.x + aSize.w, y1 = a.y + aSize.h / 2, x2 = b.x, y2 = b.y + bSize.h / 2;
      const bend = Math.max(48, Math.abs(x2 - x1) * .48);
      edge.querySelector("path")?.setAttribute("d", "M " + x1 + " " + y1 + " C " + (x1 + bend) + " " + y1 + ", " + (x2 - bend) + " " + y2 + ", " + x2 + " " + y2);
      edge.classList.toggle("is-selected-path", (upstream.has(from(edge)) && upstream.has(to(edge))) || (downstream.has(from(edge)) && downstream.has(to(edge))));
    });
  };
  const graphBounds = () => {
    const view = viewport(), all = nodes();
    if (!view?.clientWidth || !all.length) return null;
    const left = Math.min(...all.map((node) => point(node).x));
    const top = Math.min(...all.map((node) => point(node).y));
    const right = Math.max(...all.map((node) => point(node).x + node.offsetWidth));
    const bottom = Math.max(...all.map((node) => point(node).y + node.offsetHeight));
    const z = Math.min(1, Math.max(.08, Math.min((view.clientWidth - 80) / (right - left), (view.clientHeight - 160) / (bottom - top))));
    return { view, left, top, right, bottom, z };
  };
  const fitGoalGraph = (force = false) => {
    const bounds = graphBounds();
    if (!bounds || (!force && isExpanded())) return;
    const { view, left, top, right, bottom, z } = bounds;
    camera = { x: (view.clientWidth - (right - left) * z) / 2 - left * z, y: (view.clientHeight - (bottom - top) * z) / 2 - top * z + 12, z };
    autoFit = true;
    drawGoalGraph();
    queueSave();
  };
  const setGraphZoom = (z: number, clientX?: number, clientY?: number) => {
    if (isExpanded()) return;
    const view = viewport();
    if (!view) return;
    const rect = view.getBoundingClientRect();
    const x = clientX == null ? rect.width / 2 : clientX - rect.left;
    const y = clientY == null ? rect.height / 2 : clientY - rect.top;
    const next = Math.min(2, Math.max(.08, z));
    camera = { x: x - (x - camera.x) * next / camera.z, y: y - (y - camera.y) * next / camera.z, z: next };
    autoFit = false;
    drawGoalGraph();
    queueSave();
  };
  const centerGoal = () => {
    const node = nodes().find(entry => idOf(entry) === getSelected()), view = viewport();
    if (!node || !view?.clientWidth) return;
    const p = point(node);
    camera = { x: (view.clientWidth - node.offsetWidth) / 2 - p.x, y: (view.clientHeight - node.offsetHeight) / 2 - p.y + 16, z: 1 };
    autoFit = false;
    drawGoalGraph();
  };
  /* First sight of a map shows the whole map while it stays readable; a large one opens on the selected Goal. */
  const introduceGoalGraph = () => {
    const bounds = graphBounds();
    if (bounds && !isExpanded() && bounds.z >= .5) fitGoalGraph();
    else centerGoal();
  };
  const focusGoal = () => {
    const node = nodes().find((entry) => idOf(entry) === getSelected());
    if (!node || !viewport()?.clientWidth) return;
    if (!overviewCamera) overviewCamera = { ...camera };
    const p = point(node);
    camera = { x: 18 - p.x, y: 18 - p.y, z: 1 };
    drawGoalGraph();
  };
  const restoreOverview = () => {
    if (overviewCamera) camera = { ...overviewCamera };
    overviewCamera = null;
    drawGoalGraph();
  };
  const bindGoalGraphViewport = () => {
    const view = viewport();
    if (!view || view.dataset.bound) return;
    view.dataset.bound = "true";
    let drag: { id: number; x: number; y: number; node: HTMLElement | null; point: Point; moved: boolean } | null = null;
    view.addEventListener("pointerdown", (event) => {
      const target = elementOf(event);
      if (isExpanded() || event.button !== 0 || target?.closest("[data-graph-open], [data-graph-frame]")) return;
      const node = target?.closest<HTMLElement>("[data-graph-node]") ?? null;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, node, point: node ? { ...point(node) } : { ...camera }, moved: false };
      suppressClick = false;
      if (!node) event.preventDefault();
      if (!node) view.setPointerCapture(event.pointerId);
    });
    view.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId || isExpanded()) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      if (!view.hasPointerCapture(event.pointerId)) view.setPointerCapture(event.pointerId);
      if (drag.node) {
        positions[idOf(drag.node)] = { x: drag.point.x + dx / camera.z, y: drag.point.y + dy / camera.z };
        drag.node.classList.add("is-dragging");
      }
      else {
        camera.x = drag.point.x + dx;
        camera.y = drag.point.y + dy;
      }
      autoFit = false;
      view.classList.add("is-panning");
      drawGoalGraph();
    });
    const finish = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      suppressClick = drag.moved;
      drag.node?.classList.remove("is-dragging");
      drag = null;
      if (view.hasPointerCapture(event.pointerId)) view.releasePointerCapture(event.pointerId);
      view.classList.remove("is-panning");
      queueSave();
      setTimeout(() => { suppressClick = false; }, 0);
    };
    view.addEventListener("pointerup", finish);
    view.addEventListener("pointercancel", finish);
    view.addEventListener("click", (event) => { if (suppressClick) {
      event.preventDefault();
      event.stopPropagation();
    } }, true);
    view.addEventListener("dblclick", (event) => {
      const target = elementOf(event);
      const node = target?.closest<HTMLElement>("[data-graph-node]");
      if (!isExpanded() && node && !target?.closest("[data-graph-open], [data-graph-frame]") && !suppressClick) {
        event.preventDefault();
        (host.openFrame || host.openGoal)(idOf(node));
      }
    });
    view.addEventListener("wheel", (event) => {
      if (isExpanded()) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) setGraphZoom(camera.z * Math.exp(-event.deltaY * .008), event.clientX, event.clientY);
      else {
        camera.x -= event.deltaX || (event.shiftKey ? event.deltaY : 0);
        camera.y -= event.shiftKey ? 0 : event.deltaY;
        autoFit = false;
        drawGoalGraph();
        queueSave();
      }
    }, { passive: false });
    view.addEventListener("keydown", (event) => {
      if (isExpanded()) return;
      const target = elementOf(event);
      const node = target?.closest<HTMLElement>("[data-graph-node]");
      if (node && target === node && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        if (event.key === "Enter") host.openGoal(idOf(node)); else host.selectNode(idOf(node));
        return;
      }
      if (target !== view) return;
      const deltas: Partial<Record<string, readonly [number, number]>> = { ArrowLeft: [70, 0], ArrowRight: [-70, 0], ArrowUp: [0, 70], ArrowDown: [0, -70] };
      const delta = deltas[event.key];
      if (delta) {
        event.preventDefault();
        camera.x += delta[0];
        camera.y += delta[1];
        autoFit = false;
        drawGoalGraph();
        queueSave();
      }
      else if (["+", "=", "-"].includes(event.key)) {
        event.preventDefault();
        setGraphZoom(camera.z * (event.key === "-" ? .85 : 1.15));
      }
      else if (event.key === "Home") {
        event.preventDefault();
        fitGoalGraph();
      }
    });
  };
  return {
    drawGoalGraph, bindGoalGraphViewport, fitGoalGraph, introduceGoalGraph, setGraphZoom, centerGoal, focusGoal, restoreOverview,
    getZoom: () => camera.z,
    readView: (): CanvasView => ({ camera: overviewCamera || camera, positions, autoFit }),
    restoreView: (value: CanvasView | null | undefined) => {
      const saved = value?.camera;
      if (saved && [saved.x, saved.y, saved.z].every(Number.isFinite) && saved.z >= .08 && saved.z <= 2) {
        if (isExpanded()) overviewCamera = { ...saved }; else camera = { ...saved };
        autoFit = value.autoFit === true;
      }
      if (value?.positions && typeof value.positions === "object") positions = Object.fromEntries(Object.entries(value.positions).filter(([, p]) => isPoint(p)));
    },
    layout: () => {
      bindGoalGraphViewport();
      if (isExpanded()) focusGoal(); else if (autoFit) fitGoalGraph(); else drawGoalGraph();
    },
  };
}
