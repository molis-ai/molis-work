/** Goals board view (list | canvas | kanban) and Frame canvas. Cross-plugin tabs and split panes live in tab-workspace. */
export const FRAME_CONTAINER_FACTORY_SCRIPT = `(host) => {
  const { translate: readText, showToast, visibleGoals, getSurface, setWorkSurface, setDirectory,
    setWorkspaceMode, setMobileView, applySelection, locateGraphNode, getProjectId, route } = host;
  const LIST_TAB = "list";
  const CANVAS_TAB = "canvas";
  const KANBAN_TAB = "kanban";
  const boardTab = (tab) => tab === LIST_TAB || tab === CANVAS_TAB || tab === KANBAN_TAB;
  const tabsEl = document.querySelector(".immersive-titlebar [data-container-tabs]") || document.querySelector("[data-container-tabs]");
  const surfaceEl = document.querySelector("[data-goal-frame-surface]");
  const canvasEl = document.querySelector("[data-frame-canvas]");
  const worldEl = document.querySelector("[data-frame-world]");
  const zoomValue = document.querySelector("[data-frame-zoom-value]");
  const shell = document.querySelector("[data-goal-canvas-shell]");
  const noop = { releaseFrame: () => {}, isFrameTabActive: () => false, isKanbanTabActive: () => false, openFrame: () => {}, showGoalFrame: () => {}, locateGoal: () => {}, showList: () => {}, showCanvas: () => {}, showKanban: () => {}, restoreBoard: () => {}, restore: () => {}, sync: () => {} };
  if (!tabsEl || !shell || !surfaceEl || !canvasEl || !worldEl) return noop;
  const toRoute = typeof route === "function" ? route : (pathname) => pathname;
  const storageKey = () => "molis-work-frame-container:" + (getProjectId() || "board");
  const kindLabel = (kind) => ({ feed: "Feed", inbox: "Inbox", artifact: globalThis.t.text("workbench.frame-container.result") }[kind] || kind);
  let openIds = [];
  let curTab = LIST_TAB;
  let lastBoard = LIST_TAB;
  let frames = {};
  let blockSeq = 1;
  let ignoreClick = false;
  let ready = false;
  let assetServiceStarted = false;
  let receivingKey = "", receivingVersion = 0;
  const enabled = () => document.body.dataset.boardView === "current" && Boolean(shell);
  const isFrameTabActive = () => enabled() && getSurface() === "goals" && !boardTab(curTab);
  const isKanbanTabActive = () => enabled() && getSurface() === "goals" && curTab === KANBAN_TAB;
  const knownIds = () => new Set(visibleGoals().map((item) => item.goal.goal_id));
  const goalTitle = (goalId) => visibleGoals().find((item) => item.goal.goal_id === goalId)?.goal.title || goalId;
  const loadedFrames = new Set();
  const savedFrames = new Map();
  const frameKey = (goalId) => storageKey() + ":goal:" + goalId;
  const frameOf = (goalId) => {
    if (!loadedFrames.has(goalId)) {
      loadedFrames.add(goalId);
      try { const saved = localStorage.getItem(frameKey(goalId)); if (saved) frames[goalId] = JSON.parse(saved); } catch { /* Ignore corrupt or unavailable persisted frame state. */ }
      savedFrames.set(goalId, JSON.stringify(frames[goalId]));
    }
    if (!frames[goalId]) frames[goalId] = { camera: { x: 0, y: 0, z: 1 }, blocks: [], expanded: "" };
    const frame = frames[goalId];
    if (!frame.camera) frame.camera = { x: 0, y: 0, z: 1 };
    if (!Array.isArray(frame.blocks)) frame.blocks = [];
    if (typeof frame.expanded !== "string") frame.expanded = "";
    return frame;
  };
  const persistGoal = (goalId) => {
    if (!ready || !goalId || boardTab(goalId)) return;
    const serialized = JSON.stringify(frameOf(goalId));
    if (serialized !== savedFrames.get(goalId)) {
      try { localStorage.setItem(frameKey(goalId), serialized); savedFrames.set(goalId, serialized); } catch { /* Ignore localStorage write failure when saving frame state. */ }
    }
  };
  const persist = (goalId = curTab) => {
    if (!ready) return;
    persistGoal(goalId);
    if (window.parent !== window && new URLSearchParams(location.search).has("workbenchPane")) return;
    try { localStorage.setItem(storageKey(), JSON.stringify({ openFrames:openIds, activeTab:curTab, lastBoardView:lastBoard, frames })); } catch { /* Ignore localStorage write failure when saving frame tabs. */ }
  };
  const prune = () => {
    const known = knownIds();
    if (!known.size) {
      if (!document.querySelector(".tree-node[data-select-goal]")) {
        openIds = [];
        if (!boardTab(curTab)) curTab = lastBoard;
      }
      return;
    }
    openIds = openIds.filter((id) => known.has(id));
    Object.keys(frames).forEach((id) => { if (!known.has(id)) delete frames[id]; });
    if (!boardTab(curTab) && !openIds.includes(curTab)) curTab = lastBoard;
  };
  const ensureAssets = () => {
    if (assetServiceStarted) return;
    assetServiceStarted = true;
    queueMicrotask(() => { void host.frameAssets().catch(() => { /* The explicit picker can retry the shared bridge. */ }); });
  };
  const allFrameSurfaces = () => [...new Set([surfaceEl, ...document.querySelectorAll("[data-tab-panes] [data-goal-frame-surface]")])].filter(Boolean);
  const applySurface = () => {
    const multiPane = document.querySelectorAll("[data-tab-pane]").length > 1;
    const onGoal = getSurface() === "goals";
    const showFrame = onGoal && !boardTab(curTab);
    const receiving = showFrame ? curTab : "";
    if (receivingKey !== receiving) { receivingKey = receiving; receivingVersion++; }
    if (!multiPane) {
      shell.hidden = !onGoal || showFrame;
      surfaceEl.hidden = !showFrame;
    }
    const tabRoot = document.querySelector("[data-tab-workspace]");
    if (tabRoot) tabRoot.hidden = false;
    if (onGoal && !showFrame) shell.dataset.boardView = boardTab(curTab) ? curTab : LIST_TAB;
    if (showFrame) {
      drawFrame(surfaceEl, curTab);
      ensureAssets();
    }
  };
  const setCamera = (target = surfaceEl, goalId = target?.dataset.frameGoal || curTab) => {
    if (!target || !goalId || boardTab(goalId)) return;
    const camera = frameOf(goalId).camera;
    const world = target.querySelector("[data-frame-world]");
    const zoom = target.querySelector("[data-frame-zoom-value]");
    if (world) world.style.transform = "translate(" + camera.x + "px," + camera.y + "px) scale(" + camera.z + ")";
    if (zoom) zoom.textContent = Math.round(camera.z * 100) + "%";
  };
  const liveAssetRow = (block) => [...document.querySelectorAll("[data-frame-asset]")].find((row) => row.dataset.frameAsset === block.kind && row.dataset.frameAssetId === block.itemId);
  const showBlockError = (body, error) => {
    const status = document.createElement("p");
    status.className = "frame-block-status";
    molisWorkRequest.show(status,error,globalThis.t.text("workbench.frame-container.could-not-open-item"));
    const retry = document.createElement("button");
    retry.type = "button";
    retry.dataset.frameBlockRetry = "";
    retry.textContent = globalThis.t.text("common.control.retry");
    body.replaceChildren(status, retry);
  };
  const readValue = (block, row, key, attr) => block.reading?.[key] || row?.dataset[attr] || "";
  const loadInboxBody = (body, block) => {
    const row = liveAssetRow(block);
    const article = document.createElement("article");
    article.className = "frame-reading";
    article.dataset.frameReading = "inbox";
    const reason = readValue(block, row, "reason", "frameReadingReason");
    const relation = readValue(block, row, "relation", "frameReadingRelation");
    const next = readValue(block, row, "next", "frameReadingNext");
    const status = readValue(block, row, "status", "frameReadingStatus");
    const copy = document.createElement("p");
    const parts = [];
    if (reason) parts.push(reason);
    if (relation) parts.push(globalThis.t.text("workbench.frame-container.relates-relation", { relation }));
    if (next) parts.push(globalThis.t.text("workbench.frame-container.next-next", { next }));
    if (status) parts.push(status);
    if (parts.length) copy.textContent = parts.join("");
    else copy.textContent = block.caption || "";
    if (copy.textContent) article.append(copy);
    body.replaceChildren(article);
  };
  const loadFeedBody = async (body, block) => {
    const row = liveAssetRow(block);
    const itemId = block.itemRef || row?.dataset.feedItemId || (row?.dataset.inboxSubjectType === "feed" ? row.dataset.inboxSubjectId : "") || block.itemId;
    const html=await molisWorkRequest(toRoute("/api/stage/feed/objects/"+encodeURIComponent(itemId)+"?surface=frame-block"),{as:"text",fallback:globalThis.t.text("workbench.frame-container.could-not-load-item")});
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    const reading = template.content.querySelector("[data-frame-reading]") || template.content.querySelector(".frame-reading") || template.content.firstElementChild;
    if (!reading) throw new Error(globalThis.t.text("workbench.frame-container.could-not-load-item"));
    body.replaceChildren(reading);
  };
  const loadArtifactBody = async (body, block) => {
    const sep = String(block.itemId).lastIndexOf("#");
    const artifactId = sep === -1 ? block.itemId : block.itemId.slice(0, sep);
    const version = sep === -1 ? "1" : block.itemId.slice(sep + 1);
    const html=await molisWorkRequest(toRoute("/artifacts/"+encodeURIComponent(artifactId)+"/versions/"+encodeURIComponent(version)),{as:"text",accept:[404],headers:{"x-molis-work-fragment":"frame-block"},fallback:globalThis.t.text("workbench.frame-container.could-not-load-artifacts")});
    const template = document.createElement("template");
    template.innerHTML = html;
    const reading = template.content.querySelector("[data-frame-reading]") || template.content.querySelector("[data-artifact-detail]");
    if (!reading) throw new Error(globalThis.t.text("workbench.frame-container.could-not-load-artifacts"));
    if (reading.matches("[data-artifact-detail]")) {
      if (!reading.childElementCount) throw new Error(globalThis.t.text("workbench.frame-container.could-not-load-artifacts"));
      body.replaceChildren(...reading.childNodes);
    } else body.replaceChildren(reading);
  };
  const fillBody = async (article, block, force) => {
    const body = article?.querySelector("[data-frame-block-body]");
    if (!body || !block) return;
    const stamp = block.kind + ":" + block.itemId;
    if (!force && body.dataset.loaded === stamp) return;
    const token = String(Date.now()) + "-" + block.id;
    body.dataset.loadToken = token;
    delete body.dataset.loaded;
    const status = document.createElement("p");
    status.className = "frame-block-status";
    status.textContent = globalThis.t.text("workbench.frame-container.opening");
    body.replaceChildren(status);
    try {
      if (block.kind === "inbox") loadInboxBody(body, block);
      else if (block.kind === "feed") await loadFeedBody(body, block);
      else if (block.kind === "artifact") await loadArtifactBody(body, block);
      else {
        const fallback = document.createElement("p");
        fallback.textContent = block.caption || kindLabel(block.kind);
        body.replaceChildren(fallback);
      }
      if (!body.isConnected || body.dataset.loadToken !== token) return;
      body.dataset.loaded = stamp;
    } catch (error) {
      if (!body.isConnected || body.dataset.loadToken !== token) return;
      showBlockError(body,error);
    }
  };
  const renderTabs = () => {
    if (knownIds().size) prune();
    tabsEl.hidden = true;
    shell.querySelectorAll("[data-board-view-tab]").forEach((button) => {
      const current = boardTab(curTab) && button.dataset.boardViewTab === curTab;
      button.classList.toggle("is-current", current);
      button.setAttribute("aria-pressed", String(current));
      if (current) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    const fragment = document.createDocumentFragment();
    const list = document.createElement("button");
    list.type = "button";
    list.className = "container-tab is-pinned";
    list.dataset.containerTab = LIST_TAB;
    if (curTab === LIST_TAB) list.setAttribute("aria-current", "page");
    const listLabel = document.createElement("span");
    listLabel.textContent = globalThis.t.text("workbench.frame-container.list");
    list.append(listLabel);
    fragment.append(list);
    const canvas = document.createElement("button");
    canvas.type = "button";
    canvas.className = "container-tab is-pinned";
    canvas.dataset.containerTab = CANVAS_TAB;
    if (curTab === CANVAS_TAB) canvas.setAttribute("aria-current", "page");
    const canvasLabel = document.createElement("span");
    canvasLabel.textContent = globalThis.t.text("workbench.frame-container.goal-canvas");
    canvas.append(canvasLabel);
    fragment.append(canvas);
    const kanban = document.createElement("button");
    kanban.type = "button";
    kanban.className = "container-tab is-pinned";
    kanban.dataset.containerTab = KANBAN_TAB;
    if (curTab === KANBAN_TAB) kanban.setAttribute("aria-current", "page");
    const kanbanLabel = document.createElement("span");
    kanbanLabel.textContent = globalThis.t.text("workbench.frame-container.board");
    kanban.append(kanbanLabel);
    fragment.append(kanban);
    openIds.forEach((goalId) => {
      const tab = document.createElement("div");
      tab.className = "container-tab";
      tab.dataset.containerTab = goalId;
      tab.setAttribute("role", "tab");
      tab.title = goalTitle(goalId);
      if (curTab === goalId) tab.setAttribute("aria-current", "page");
      const label = document.createElement("span");
      label.textContent = tab.title;
      const close = document.createElement("button");
      close.type = "button";
      close.className = "container-tab-close";
      close.dataset.containerTabClose = goalId;
      close.setAttribute("aria-label", globalThis.t.text("workbench.frame-container.close-frame-title", { title: tab.title }));
      close.title = globalThis.t.text("common.control.close");
      close.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
      tab.append(label, close);
      fragment.append(tab);
    });
    tabsEl.replaceChildren(fragment);
  };
  window.addEventListener("storage", (event) => {
    if (!event.key?.startsWith(storageKey() + ":goal:") || !event.newValue) return;
    const goalId = event.key.slice((storageKey() + ":goal:").length);
    try {
      const previous = frames[goalId], incoming = JSON.parse(event.newValue);
      frames[goalId] = incoming; savedFrames.set(goalId, event.newValue); loadedFrames.add(goalId);
      const cameraOnly = previous?.expanded === incoming.expanded && JSON.stringify(previous?.blocks) === JSON.stringify(incoming.blocks);
      allFrameSurfaces().forEach((el) => {
        if (el.dataset.frameGoal === goalId && !el.hidden) {
          if (cameraOnly) setCamera(el, goalId);
          else drawFrame(el, goalId);
        }
      });
    } catch { /* Ignore malformed cross-tab frame storage update. */ }
  });
  const drawFrame = (target = surfaceEl, goalId = target?.dataset.frameGoal || curTab) => {
    if (!target || !goalId || boardTab(goalId)) return;
    const frame = frameOf(goalId);
    const item = visibleGoals().find((entry) => entry.goal.goal_id === goalId);
    target.dataset.frameGoal = goalId;
    const put = (selector, text) => { const el = target.querySelector(selector); if (el && el.textContent !== text) el.textContent = text; };
    put('[data-frame-goal-title]', goalTitle(goalId));
    const status = item?.display_status || item?.status || "";
    const statusEl = target.querySelector('[data-frame-goal-status]');
    const source = document.querySelector('[data-goal-id="' + CSS.escape(goalId) + '"] .goal-status');
    if (statusEl) {
      statusEl.className = source?.className || ("mw-object-status goal-status" + (status ? " mw-object-status--" + status + " goal-status--" + status : ""));
      if (source) statusEl.innerHTML = source.innerHTML;
      else statusEl.textContent = item?.status_label || status;
      statusEl.dataset.status = status;
      statusEl.dataset.craftFocal = "frame:" + goalId;
    }
    put('[data-frame-goal-outcome]', item?.goal.outcome || globalThis.t.text("workbench.frame-container.no-expected-result-written-yet-can-add-one"));
    const emptyEl = target.querySelector('[data-frame-empty]');
    if (emptyEl) emptyEl.hidden = frame.blocks.length > 0;
    setCamera(target, goalId);
    const world = target.querySelector("[data-frame-world]");
    if (!world) return;
    world.replaceChildren();
    frame.blocks.forEach((block) => {
      const article = document.createElement("article");
      article.className = "frame-block" + (frame.expanded === block.id ? " is-expanded" : "");
      article.dataset.frameBlock = block.id;
      article.tabIndex = 0;
      article.setAttribute("aria-label", block.title);
      article.dataset.frameBlockKind = block.kind;
      article.style.transform = "translate(" + block.x + "px," + block.y + "px)";
      const handle = document.createElement("header");
      handle.dataset.frameBlockHandle = "";
      const title = document.createElement("strong");
      title.textContent = block.title;
      const close = document.createElement("button");
      close.type = "button";
      close.className = "frame-block-close";
      close.dataset.frameBlockClose = "";
      close.setAttribute("aria-label", globalThis.t.text("workbench.frame-container.collapse-card"));
      close.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
      handle.append(title, close);
      const caption = document.createElement("p");
      caption.textContent = block.caption || "";
      const stamp = document.createElement("span");
      stamp.className = "frame-block-kind";
      stamp.textContent = kindLabel(block.kind);
      const body = document.createElement("div");
      body.dataset.frameBlockBody = "";
      article.append(caption, handle, stamp, body);
      world.append(article);
      if (frame.expanded === block.id) void fillBody(article, block);
    });
  };
  const drawGoalFrames = (goalId) => {
    allFrameSurfaces().forEach((el) => { if (el.dataset.frameGoal === goalId && !el.hidden) drawFrame(el, goalId); });
  };
  const sync = () => {
    renderTabs();
    applySurface();
  };
  const showBoard = (view) => {
    if (!enabled() || !boardTab(view)) return;
    const already = curTab === view && getSurface() === "goals";
    lastBoard = view;
    curTab = view;
    setWorkSurface("goals");
    host.activateGoalsMother?.();
    sync();
    if (!already) setWorkspaceMode("graph");
    persist();
  };
  const showList = () => showBoard(LIST_TAB);
  const showCanvas = () => showBoard(CANVAS_TAB);
  const showKanban = () => showBoard(KANBAN_TAB);
  const openFrame = (goalId) => host.openGoalTab?.(goalId);
  // Answers false for a Goal the board does not list, so the caller reads it instead (it may be gone: 07-1 S3).
  const showGoalFrame = (goalId, target = surfaceEl) => {
    if (!enabled() || !goalId) return;
    if (!knownIds().has(goalId)) return false;
    frameOf(goalId);
    if (!openIds.includes(goalId)) openIds.push(goalId);
    if (target && (target !== surfaceEl || document.querySelectorAll("[data-tab-pane]").length > 1)) {
      bindFrameSurface(target);
      target.dataset.frameGoal = goalId;
      drawFrame(target, goalId);
      ensureAssets();
      return true;
    }
    curTab = goalId;
    setWorkSurface("goals");
    setWorkspaceMode("graph");
    sync();
    persist();
    return true;
  };
  const closeFrame = (goalId) => {
    openIds = openIds.filter((id) => id !== goalId);
    if (curTab === goalId) curTab = lastBoard;
    host.activateGoalsMother?.();
    setWorkspaceMode("graph", false);
    sync();
    persist();
  };
  const restoreBoard = () => {
    if (!enabled()) return;
    const previous = curTab;
    if (!boardTab(curTab)) curTab = lastBoard;
    setWorkSurface("goals");
    sync();
    if (previous !== curTab) persist();
  };
  const releaseFrame = () => {
    if (!enabled()) return;
    if (boardTab(curTab)) {
      applySurface();
      return;
    }
    curTab = lastBoard;
    sync();
    persist();
  };
  const locateGoal = (goalId) => {
    if (!enabled() || !goalId) return;
    lastBoard = CANVAS_TAB;
    curTab = CANVAS_TAB;
    host.activateGoalsMother?.();
    setDirectory("goals", true, false);
    setWorkSurface("goals");
    setWorkspaceMode("graph");
    applySelection(goalId);
    locateGraphNode(goalId);
    if (matchMedia("(max-width: 760px)").matches) setMobileView("document");
    sync();
    persist();
  };
  const rejectCanvas = () => {
    const viewport = shell.querySelector("[data-graph-viewport]");
    viewport?.classList.add("is-reject");
    window.setTimeout(() => viewport?.classList.remove("is-reject"), 420);
    showToast(globalThis.t.text("workbench.frame-container.goal-canvas-only-holds-goals-open-frame-first"));
  };
  const rejectGoal = (targetCanvas = canvasEl) => {
    targetCanvas?.classList.add("is-reject");
    window.setTimeout(() => targetCanvas?.classList.remove("is-reject"), 420);
    showToast(globalThis.t.text("workbench.frame-container.goals-stay-main-canvas-frame-only-holds-work"));
  };
  const readAsset = (target) => {
    if (!target?.closest) return null;
    if (target.closest("[data-tree-toggle], [data-directory-back], [data-work-surface-open], [data-feed-filter-trigger], [data-feed-filter-panel], [data-container-tabs], [data-frame-block]")) return null;
    const row = target.closest("[data-frame-asset]");
    if (!row) return null;
    return {
      kind: row.dataset.frameAsset,
      id: row.dataset.frameAssetId || "",
      title: row.dataset.frameAssetTitle || row.querySelector("strong")?.textContent || "",
      caption: row.dataset.frameAssetCaption || "",
      itemRef: row.dataset.feedItemId || (row.dataset.inboxSubjectType === "feed" ? row.dataset.inboxSubjectId : "") || "",
      entryId: row.dataset.feedEntryId || row.dataset.inboxEntryId || "",
      reading: {
        reason: row.dataset.frameReadingReason || "",
        relation: row.dataset.frameReadingRelation || "",
        next: row.dataset.frameReadingNext || "",
        status: row.dataset.frameReadingStatus || "",
      },
    };
  };
  const readTransfer = (event) => {
    try {
      const raw = event.dataTransfer?.getData("application/x-molis-work-asset");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };
  const addBlock = (asset, clientX, clientY, targetSurface = surfaceEl, goalId = targetSurface?.dataset.frameGoal || curTab) => {
    const targetCanvas = targetSurface?.querySelector("[data-frame-canvas]") || canvasEl;
    if (!asset?.id || asset.kind === "goal") { rejectGoal(targetCanvas); return; }
    if (!goalId || boardTab(goalId)) return;
    const frame = frameOf(goalId);
    const rect = targetCanvas.getBoundingClientRect();
    const n = frame.blocks.length;
    const x = clientX == null ? 48 + (n % 3) * 260 : (clientX - rect.left - frame.camera.x) / frame.camera.z - 40;
    const y = clientY == null ? 48 + Math.floor(n / 3) * 140 : (clientY - rect.top - frame.camera.y) / frame.camera.z - 24;
    frame.blocks.push({
      id: "b-" + Date.now() + "-" + (blockSeq++),
      kind: asset.kind,
      itemId: asset.id,
      itemRef: asset.itemRef || "",
      entryId: asset.entryId || "",
      title: asset.title || asset.id,
      caption: asset.caption || kindLabel(asset.kind),
      reading: asset.reading || null,
      x: Math.max(16, x),
      y: Math.max(16, y),
    });
    drawGoalFrames(goalId);
    persist(goalId);
  };
  const picker = surfaceEl.querySelector("[data-frame-picker]");
  const pickQuery = picker.querySelector("[data-frame-picker-search]");
  const pickerKind = picker.querySelector("[data-frame-picker-kind]");
  const pickerList = picker.querySelector("[data-frame-picker-list]");
  let pickItems = [], pickerOpener = null, pickerSurface = surfaceEl, pickerGoal = "";
  const drawPicker = () => {
    const query = pickQuery.value.trim().toLocaleLowerCase();
    const matches = pickItems.filter((asset) => (pickerKind.value === "all" || asset.kind === pickerKind.value) && (asset.title + " " + asset.caption).toLocaleLowerCase().includes(query));
    pickerList.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "no-results";
      empty.textContent = pickItems.length ? globalThis.t.text("workbench.frame-container.no-matches-try-another-search-source") : globalThis.t.text("workbench.frame-container.project-has-no-content-add-yet");
      pickerList.append(empty);
    }
    const targetSurface = pickerSurface || surfaceEl;
    const targetGoal = pickerGoal || targetSurface.dataset.frameGoal || curTab;
    const targetCanvas = targetSurface.querySelector("[data-frame-canvas]") || canvasEl;
    const targetWorld = targetSurface.querySelector("[data-frame-world]") || worldEl;
    for (const asset of matches) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.framePickerAsset = asset.kind + ":" + asset.id;
      const title = document.createElement("strong"), caption = document.createElement("small"), state = document.createElement("span");
      title.textContent = asset.title;
      caption.textContent = [kindLabel(asset.kind), asset.caption].filter(Boolean).join(" · ");
      button.disabled = frameOf(targetGoal).blocks.some((block) => block.kind === asset.kind && block.itemId === asset.id);
      state.textContent = button.disabled ? globalThis.t.text("workbench.frame-container.added") : "+";
      state.setAttribute("aria-hidden", "true");
      button.append(title, caption, state);
      button.addEventListener("click", async event => {
        if (asset.source && !event.isTrusted) return;
        const rect = targetCanvas.getBoundingClientRect();
        const accept = captureAsset(rect.left + rect.width / 2 - 70, rect.top + Math.min(rect.height / 2, 120), targetSurface, targetGoal);
        if (!accept) return;
        button.disabled = true;
        try {
          const fresh = asset.source ? await (await host.frameAssets()).resolve(asset, pickerRead?.signal) : asset;
          if (!fresh || !accept(fresh)) { button.remove(); return; }
          picker.close();
        } catch { button.remove(); return; }
        requestAnimationFrame(() => targetWorld.lastElementChild?.focus({ preventScroll: true }));
      });
      pickerList.append(button);
    }
  };
  let pickerRead = null;
  const openPickerFor = async (targetSurface, button) => {
    const goalId = targetSurface.dataset.frameGoal || curTab;
    if (!goalId || boardTab(goalId) || !targetSurface.checkVisibility({ visibilityProperty: true })) return;
    pickerRead?.abort(); pickerRead = new AbortController();
    const signal = pickerRead.signal, version = receivingVersion;
    pickerOpener = button; pickerSurface = targetSurface; pickerGoal = goalId;
    const assets = new Map();
    document.querySelectorAll("[data-frame-asset]").forEach((row) => {
      const asset = readAsset(row);
      if (asset?.id && ["feed", "inbox", "artifact"].includes(asset.kind)) assets.set(asset.kind + ":" + asset.id, asset);
    });
    try { for (const asset of await (await host.frameAssets()).list(signal)) assets.set(asset.kind + ":" + asset.id, asset); }
    catch { if (!signal.aborted) showToast(globalThis.t.text("workbench.frame-container.drop-content-unreadable"), true); return; }
    if (signal.aborted || !targetSurface.checkVisibility({ visibilityProperty: true }) || (targetSurface.dataset.frameGoal || curTab) !== goalId || version !== receivingVersion) return;
    pickItems = [...assets.values()];
    pickQuery.value = ""; pickerKind.value = "all";
    drawPicker(); picker.showModal();
  };
  pickQuery.addEventListener("input", drawPicker);
  pickerKind.addEventListener("change", drawPicker);
  picker.querySelectorAll("[data-frame-picker-close]").forEach((button) => button.addEventListener("click", () => picker.close()));
  picker.addEventListener("close", () => { pickerRead?.abort(); pickerOpener?.focus({ preventScroll: true }); });
  const routeAsset = (asset, clientX, clientY, targetSurface = surfaceEl, goalId = targetSurface?.dataset.frameGoal || curTab) => {
    if (!asset?.kind) return false;
    if (asset.kind === "goal") { locateGoal(asset.id); return true; }
    if (!goalId || boardTab(goalId)) { rejectCanvas(); return true; }
    addBlock(asset, clientX, clientY, targetSurface, goalId);
    return true;
  };
  const captureAsset = (x, y, targetSurface = surfaceEl, targetGoal = targetSurface?.dataset.frameGoal || curTab) => {
    const current = () => Boolean(targetGoal) && !boardTab(targetGoal) && targetSurface.isConnected && targetSurface.checkVisibility({ visibilityProperty: true }) && host.visible?.() !== false;
    if (!current()) return null;
    const version = receivingVersion;
    return asset => {
      if (!current() || (targetSurface.dataset.frameGoal || curTab) !== targetGoal || version !== receivingVersion || !knownIds().has(targetGoal)) return false;
      return routeAsset(asset, x, y, targetSurface, targetGoal);
    };
  };
  const restore = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey()) || "null");
      if (stored && typeof stored === "object") {
        openIds = Array.isArray(stored.openFrames) ? stored.openFrames.map(String) : [];
        lastBoard = boardTab(stored.lastBoardView) ? stored.lastBoardView : LIST_TAB;
        curTab = boardTab(stored.activeTab) || openIds.includes(stored.activeTab) ? stored.activeTab : lastBoard;
        frames = stored.frames && typeof stored.frames === "object" ? stored.frames : {};
      }
    } catch { openIds = []; curTab = LIST_TAB; lastBoard = LIST_TAB; frames = {}; }
    const paneParams = new URLSearchParams(location.search);
    if (window.parent !== window && paneParams.has("workbenchPane") && paneParams.get("panePlugin") === "goals" && !paneParams.has("paneItem")) curTab = lastBoard;
    prune();
    ready = true;
    sync();
  };
  tabsEl.addEventListener("click", (event) => {
    const close = event.target.closest("[data-container-tab-close]");
    if (close) { event.preventDefault(); event.stopPropagation(); closeFrame(close.dataset.containerTabClose); return; }
    const tab = event.target.closest("[data-container-tab]");
    if (!tab) return;
    if (tab.dataset.containerTab === LIST_TAB) showList();
    else if (tab.dataset.containerTab === CANVAS_TAB) showCanvas();
    else if (tab.dataset.containerTab === KANBAN_TAB) showKanban();
    else openFrame(tab.dataset.containerTab);
  });
  shell.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-board-view-tab]");
    if (!tab) return;
    event.preventDefault();
    if (tab.dataset.boardViewTab === LIST_TAB) showList();
    else if (tab.dataset.boardViewTab === KANBAN_TAB) showKanban();
    else showCanvas();
  });
  document.addEventListener("click", (event) => {
    if (!isFrameTabActive()) return;
    const asset = readAsset(event.target);
    if (!asset?.kind || asset.kind === "goal") return;
    event.preventDefault();
    event.stopPropagation();
    routeAsset(asset);
  }, true);
  let dragAsset = null;
  document.addEventListener("dragstart", (event) => {
    const asset = readAsset(event.target);
    if (!asset?.kind) return;
    dragAsset = asset;
    if (!event.dataTransfer) return;
    event.dataTransfer.setData("application/x-molis-work-asset", JSON.stringify(asset));
    event.dataTransfer.effectAllowed = "copy";
  });
  document.addEventListener("dragend", () => { dragAsset = null; });
  shell.addEventListener("dragover", (event) => {
    if (!event.target.closest("[data-graph-viewport]")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  shell.addEventListener("drop", (event) => {
    if (!event.target.closest("[data-graph-viewport]")) return;
    event.preventDefault();
    const asset = readTransfer(event) || dragAsset || readAsset(event.target);
    if (!asset) return;
    if (asset.kind === "goal") locateGoal(asset.id);
    else rejectCanvas();
  });
  const boundSurfaces = new WeakSet();
  const bindFrameSurface = (target) => {
    if (!target || boundSurfaces.has(target)) return;
    boundSurfaces.add(target);
    const canvas = target.querySelector("[data-frame-canvas]");
    const world = target.querySelector("[data-frame-world]");
    if (!canvas || !world) return;
    const goalOf = () => target.dataset.frameGoal || curTab;
    target.querySelector("[data-frame-goal-work]")?.addEventListener("click", () => host.openGoalWork?.(target.closest("[data-tab-pane]")?.dataset.tabPane));
    target.querySelector("[data-frame-goal-locate]")?.addEventListener("click", () => locateGoal(goalOf()));
    target.querySelectorAll("[data-frame-add-content]").forEach((button) => button.addEventListener("click", () => void openPickerFor(target, button)));
    canvas.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key) || !event.target.matches("[data-frame-block]")) return;
      event.preventDefault(); event.target.click();
      world.querySelector('[data-frame-block="' + CSS.escape(event.target.dataset.frameBlock) + '"]')?.focus({ preventScroll: true });
    });
    canvas.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; canvas.classList.add("is-drop"); });
    canvas.addEventListener("dragleave", (event) => { if (!canvas.contains(event.relatedTarget)) canvas.classList.remove("is-drop"); });
    canvas.addEventListener("drop", (event) => {
      event.preventDefault(); canvas.classList.remove("is-drop");
      const asset = readTransfer(event) || dragAsset;
      if (!asset) return;
      const goalId = goalOf();
      if (asset.handle) {
        if (!event.isTrusted) return;
        const accept = captureAsset(event.clientX, event.clientY, target, goalId);
        if (accept) void host.frameAssets().then(service => service.drag(asset)).then(fresh => { if (fresh) accept(fresh); }).catch(() => { /* An old source cannot add a block. */ });
        return;
      }
      if (["feed", "inbox"].includes(asset.kind)) return;
      if (asset.kind === "goal") { rejectGoal(canvas); return; }
      routeAsset(asset, event.clientX, event.clientY, target, goalId);
    });
    let pan = null;
    canvas.addEventListener("pointerdown", (event) => {
      const goalId = goalOf();
      if (event.button !== 0 || !goalId || boardTab(goalId)) return;
      if (event.target.closest("[data-frame-add-content], [data-frame-block-close], [data-frame-block-retry], [data-frame-block-body]")) return;
      const block = event.target.closest("[data-frame-block]");
      const frame = frameOf(goalId);
      pan = { id: event.pointerId, x: event.clientX, y: event.clientY, block, goalId, origin: block ? { ...frame.blocks.find((item) => item.id === block.dataset.frameBlock) } : { ...frame.camera }, moved: false };
      event.preventDefault();
      try { (block || canvas).setPointerCapture(event.pointerId); } catch { /* Pointer capture may be unavailable for synthetic or released pointers. */ }
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!pan || pan.id !== event.pointerId) return;
      const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < 5) return;
      pan.moved = true;
      const frame = frameOf(pan.goalId);
      if (pan.block) {
        const block = frame.blocks.find((item) => item.id === pan.block.dataset.frameBlock);
        if (block) {
          block.x = pan.origin.x + dx / frame.camera.z; block.y = pan.origin.y + dy / frame.camera.z;
          pan.block.style.transform = "translate(" + block.x + "px," + block.y + "px)";
        }
      } else {
        frame.camera.x = pan.origin.x + dx; frame.camera.y = pan.origin.y + dy;
        setCamera(target, pan.goalId);
      }
      canvas.classList.add("is-panning");
    });
    const finishPan = (event) => {
      if (!pan || pan.id !== event.pointerId) return;
      const goalId = pan.goalId; ignoreClick = pan.moved;
      const captured = pan.block || canvas; pan = null;
      if (captured.hasPointerCapture?.(event.pointerId)) captured.releasePointerCapture(event.pointerId);
      canvas.classList.remove("is-panning");
      persist(goalId);
      setTimeout(() => { ignoreClick = false; }, 0);
    };
    canvas.addEventListener("pointerup", finishPan);
    canvas.addEventListener("pointercancel", finishPan);
    canvas.addEventListener("click", (event) => {
      if (ignoreClick) { event.preventDefault(); event.stopPropagation(); return; }
      const goalId = goalOf();
      const close = event.target.closest("[data-frame-block-close]");
      if (close) { event.preventDefault(); event.stopPropagation(); frameOf(goalId).expanded = ""; drawGoalFrames(goalId); persist(goalId); return; }
      const retry = event.target.closest("[data-frame-block-retry]");
      if (retry) {
        event.preventDefault();
        const article = retry.closest("[data-frame-block]");
        const block = frameOf(goalId).blocks.find((item) => item.id === article?.dataset.frameBlock);
        if (article && block) void fillBody(article, block, true);
        return;
      }
      if (event.target.closest("[data-frame-block-body] a, [data-frame-block-body] button, [data-feed-action], [data-inbox-action]")) return;
      const article = event.target.closest("[data-frame-block]");
      if (!article || !goalId || boardTab(goalId)) return;
      const frame = frameOf(goalId);
      if (frame.expanded === article.dataset.frameBlock) return;
      frame.expanded = article.dataset.frameBlock;
      drawGoalFrames(goalId); persist(goalId);
    });
    canvas.addEventListener("wheel", (event) => {
      const goalId = goalOf();
      if (!goalId || boardTab(goalId) || event.target.closest("[data-frame-block-body]")) return;
      event.preventDefault();
      const frame = frameOf(goalId);
      if (event.ctrlKey || event.metaKey) {
        const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
        const next = Math.min(1.6, Math.max(0.4, frame.camera.z * Math.exp(-event.deltaY * .008)));
        frame.camera.x = x - (x - frame.camera.x) * next / frame.camera.z;
        frame.camera.y = y - (y - frame.camera.y) * next / frame.camera.z;
        frame.camera.z = next;
      } else {
        frame.camera.x -= event.deltaX || (event.shiftKey ? event.deltaY : 0);
        frame.camera.y -= event.shiftKey ? 0 : event.deltaY;
      }
      setCamera(target, goalId); persist(goalId);
    }, { passive: false });
    target.addEventListener("click", (event) => {
      const zoom = event.target.closest("[data-frame-zoom]"), goalId = goalOf();
      if (!zoom || !goalId || boardTab(goalId)) return;
      const frame = frameOf(goalId);
      frame.camera.z = Math.min(1.6, Math.max(0.4, frame.camera.z * (zoom.dataset.frameZoom === "in" ? 1.15 : .85)));
      setCamera(target, goalId); persist(goalId);
    });
  };
  bindFrameSurface(surfaceEl);
  restore();
  return { isFrameTabActive, isKanbanTabActive, openFrame, showGoalFrame, bindFrameSurface, locateGoal, showList, showCanvas, showKanban, restoreBoard, closeFrame, releaseFrame, restore, sync };
}`;
