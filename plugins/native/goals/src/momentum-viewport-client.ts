/** Infinite world coordinates; no scroll bounds and no writes to Goal relations. */
export const GOALS_MOMENTUM_VIEWPORT_FACTORY_SCRIPT = `(host) => {
    const { graphElement, getSelected, isExpanded, queueSave } = host;
    let camera = { x: 0, y: 0, z: 1 };
    let overviewCamera = null;
    let autoFit = false;
    let positions = {};
    let suppressClick = false;
    const viewport = () => graphElement()?.querySelector("[data-graph-viewport]");
    const stage = () => graphElement()?.querySelector("[data-graph-stage]");
    const nodes = () => [...(stage()?.querySelectorAll("[data-graph-node]") || [])];
    const point = (node) => positions[node.dataset.goalId] || { x: Number(node.dataset.nodeX), y: Number(node.dataset.nodeY) };
    const size = (node) => isExpanded() && node.dataset.goalId === getSelected()
      ? { w: Math.max(0, (viewport()?.clientWidth || 0) - 36), h: Math.max(0, (viewport()?.clientHeight || 0) - 36) }
      : { w: node.offsetWidth, h: node.offsetHeight };
    const drawGoalGraph = () => {
      const world = stage();
      if (!world) return;
      const all = nodes();
      const byId = new Map(all.map((node) => [node.dataset.goalId, node]));
      world.style.transform = "translate(" + camera.x + "px," + camera.y + "px) scale(" + camera.z + ")";
      world.dataset.graphScale = String(camera.z);
      world.dataset.cameraX = String(camera.x);
      world.dataset.cameraY = String(camera.y);
      graphElement()?.querySelectorAll("[data-graph-zoom-value]").forEach((label) => { label.textContent = Math.round(camera.z * 100) + "%"; });
      all.forEach((node) => {
        const p = point(node);
        node.style.transform = "translate(" + p.x + "px," + p.y + "px)";
        const selected = node.dataset.goalId === getSelected();
        node.classList.toggle("is-selected", selected);
        node.classList.toggle("is-expanded-node", selected && isExpanded());
        node.toggleAttribute("aria-current", selected);
        if (selected) node.setAttribute("aria-current", "true");
      });
      const edges = [...world.querySelectorAll("[data-graph-edge]")];
      const upstream = new Set([getSelected()]);
      const downstream = new Set([getSelected()]);
      let changed = true;
      while (changed) {
        changed = false;
        edges.forEach((edge) => {
          if (upstream.has(edge.dataset.edgeTo) && !upstream.has(edge.dataset.edgeFrom)) { upstream.add(edge.dataset.edgeFrom); changed = true; }
          if (downstream.has(edge.dataset.edgeFrom) && !downstream.has(edge.dataset.edgeTo)) { downstream.add(edge.dataset.edgeTo); changed = true; }
        });
      }
      edges.forEach((edge) => {
        const from = byId.get(edge.dataset.edgeFrom), to = byId.get(edge.dataset.edgeTo);
        if (!from || !to) return;
        const a = point(from), b = point(to), aSize = size(from), bSize = size(to);
        const x1 = a.x + aSize.w, y1 = a.y + aSize.h / 2, x2 = b.x, y2 = b.y + bSize.h / 2;
        const bend = Math.max(48, Math.abs(x2 - x1) * .48);
        edge.querySelector("path").setAttribute("d", "M " + x1 + " " + y1 + " C " + (x1 + bend) + " " + y1 + ", " + (x2 - bend) + " " + y2 + ", " + x2 + " " + y2);
        edge.classList.toggle("is-selected-path", (upstream.has(edge.dataset.edgeFrom) && upstream.has(edge.dataset.edgeTo)) || (downstream.has(edge.dataset.edgeFrom) && downstream.has(edge.dataset.edgeTo)));
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
    const setGraphZoom = (z, clientX, clientY) => {
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
      const node = nodes().find(entry => entry.dataset.goalId === getSelected()), view = viewport();
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
      const node = nodes().find((entry) => entry.dataset.goalId === getSelected());
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
      let drag = null;
      view.addEventListener("pointerdown", (event) => {
        if (isExpanded() || event.button !== 0 || event.target.closest("[data-graph-open], [data-graph-frame]")) return;
        const node = event.target.closest("[data-graph-node]");
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
        if (drag.node) { positions[drag.node.dataset.goalId] = { x: drag.point.x + dx / camera.z, y: drag.point.y + dy / camera.z }; drag.node.classList.add("is-dragging"); }
        else { camera.x = drag.point.x + dx; camera.y = drag.point.y + dy; }
        autoFit = false;
        view.classList.add("is-panning");
        drawGoalGraph();
      });
      const finish = (event) => {
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
      view.addEventListener("click", (event) => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); } }, true);
      view.addEventListener("dblclick", (event) => {
        const node = event.target.closest("[data-graph-node]");
        if (!isExpanded() && node && !event.target.closest("[data-graph-open], [data-graph-frame]") && !suppressClick) { event.preventDefault(); (host.openFrame || host.openGoal)(node.dataset.goalId); }
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
        const node = event.target.closest("[data-graph-node]");
        if (node && event.target === node && ["Enter", " "].includes(event.key)) {
          event.preventDefault();
          if (event.key === "Enter") host.openGoal(node.dataset.goalId); else host.selectNode(node.dataset.goalId);
          return;
        }
        if (event.target !== view) return;
        const deltas = { ArrowLeft: [70, 0], ArrowRight: [-70, 0], ArrowUp: [0, 70], ArrowDown: [0, -70] };
        if (deltas[event.key]) { event.preventDefault(); camera.x += deltas[event.key][0]; camera.y += deltas[event.key][1]; autoFit = false; drawGoalGraph(); queueSave(); }
        else if (["+", "=", "-"].includes(event.key)) { event.preventDefault(); setGraphZoom(camera.z * (event.key === "-" ? .85 : 1.15)); }
        else if (event.key === "Home") { event.preventDefault(); fitGoalGraph(); }
      });
    };
    return {
      drawGoalGraph, bindGoalGraphViewport, fitGoalGraph, introduceGoalGraph, setGraphZoom, centerGoal, focusGoal, restoreOverview,
      getZoom: () => camera.z,
      readView: () => ({ camera: overviewCamera || camera, positions, autoFit }),
      restoreView: (value) => {
        if (value?.camera && [value.camera.x, value.camera.y, value.camera.z].every(Number.isFinite) && value.camera.z >= .08 && value.camera.z <= 2) {
          if (isExpanded()) overviewCamera = { ...value.camera }; else camera = { ...value.camera };
          autoFit = value.autoFit === true;
        }
        if (value?.positions && typeof value.positions === "object") positions = Object.fromEntries(Object.entries(value.positions).filter(([, p]) => p && Number.isFinite(p.x) && Number.isFinite(p.y)));
      },
      layout: () => { bindGoalGraphViewport(); if (isExpanded()) focusGoal(); else if (autoFit) fitGoalGraph(); else drawGoalGraph(); },
    };
  }`;
