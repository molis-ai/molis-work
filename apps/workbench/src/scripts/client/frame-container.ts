/** Goals board view (canvas | kanban) and Frame canvas. Cross-plugin tabs and split panes live in tab-workspace. */
export const FRAME_CONTAINER_FACTORY_SCRIPT = `(host) => {
  const { translate: L, showToast, visibleGoals, getSurface, setWorkSurface, setDirectory,
    setWorkspaceMode, setMobileView, applySelection, locateGraphNode, getProjectId, route, listTasks, rememberTask, openTaskForGoal } = host;
  const CANVAS_TAB = "canvas";
  const KANBAN_TAB = "kanban";
  const isBoardTab = (tab) => tab === CANVAS_TAB || tab === KANBAN_TAB;
  const tabsEl = document.querySelector(".immersive-titlebar [data-container-tabs]") || document.querySelector("[data-container-tabs]");
  const surfaceEl = document.querySelector("[data-task-frame-surface], [data-goal-frame-surface]");
  const canvasEl = document.querySelector("[data-frame-canvas]");
  const worldEl = document.querySelector("[data-frame-world]");
  const zoomValue = document.querySelector("[data-frame-zoom-value]");
  const shell = document.querySelector("[data-goal-canvas-shell]");
  const noop = { releaseFrame: () => {}, isFrameTabActive: () => false, isKanbanTabActive: () => false, openFrame: () => {}, locateGoal: () => {}, showCanvas: () => {}, showKanban: () => {}, restoreBoard: () => {}, restore: () => {}, sync: () => {} };
  if (!tabsEl || !shell || !surfaceEl || !canvasEl || !worldEl) return noop;
  const toRoute = typeof route === "function" ? route : (pathname) => pathname;
  const storageKey = () => "molis-work-frame-container:" + (getProjectId() || "board");
  const kindLabel = (kind) => ({ session: L("会话"), feed: "Feed", inbox: "Inbox", artifact: L("交付物") }[kind] || kind);
  let openFrames = [];
  let activeTab = CANVAS_TAB;
  let lastBoardView = CANVAS_TAB;
  let frames = {};
  let linkedGoals = {};
  let blockSeq = 1;
  let suppressClick = false;
  let ready = false;
  const containerEnabled = () => document.body.dataset.boardView === "current" && Boolean(shell);
  const isFrameTabActive = () => containerEnabled() && getSurface() === "task" && !isBoardTab(activeTab);
  const isKanbanTabActive = () => containerEnabled() && getSurface() === "goal" && activeTab === KANBAN_TAB;
  const knownGoalIds = () => new Set(visibleGoals().map((item) => item.goal.goal_id));
  const goalTitle = (goalId) => visibleGoals().find((item) => item.goal.goal_id === goalId)?.goal.title || goalId;
  const loadedFrames = new Set();
  const savedFrames = new Map();
  const persistTimers = {};
  const taskRecord = (taskId) => (listTasks?.() || []).find((item) => item.task_id === taskId) || null;
  const frameKey = (taskId) => storageKey() + ":task:" + taskId;
  const legacyGoalKey = (goalId) => storageKey() + ":goal:" + goalId;
  const isEmptyFrame = (frame) => !frame || !Array.isArray(frame.blocks) || frame.blocks.length === 0;
  const persistRemote = (taskId) => {
    if (!ready || isBoardTab(taskId)) return;
    clearTimeout(persistTimers[taskId]);
    persistTimers[taskId] = setTimeout(() => {
      const frame = ensureFrame(taskId);
      fetch(toRoute("/api/tasks/" + encodeURIComponent(taskId) + "/frame"), {
        method: "PUT",
        headers: { "content-type": "application/json", ...(window.molisWorkControlHeaders?.() || {}) },
        body: JSON.stringify({ frame }),
      }).then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.task) rememberTask?.(payload.task);
      }).catch(() => {});
    }, 400);
  };
  const ensureFrame = (taskId) => {
    if (!loadedFrames.has(taskId)) {
      loadedFrames.add(taskId);
      const record = taskRecord(taskId);
      if (record?.frame && isEmptyFrame(frames[taskId]) && !isEmptyFrame(record.frame)) {
        try { frames[taskId] = JSON.parse(JSON.stringify(record.frame)); } catch { frames[taskId] = record.frame; }
      }
      if (isEmptyFrame(frames[taskId])) {
        try {
          const saved = localStorage.getItem(frameKey(taskId));
          if (saved) frames[taskId] = JSON.parse(saved);
          else if (record?.goal_id) {
            const legacy = localStorage.getItem(legacyGoalKey(record.goal_id));
            if (legacy) {
              frames[taskId] = JSON.parse(legacy);
              persistRemote(taskId);
            }
          }
        } catch {}
      }
      savedFrames.set(taskId, JSON.stringify(frames[taskId]));
    }
    if (!frames[taskId]) frames[taskId] = { camera: { x: 0, y: 0, z: 1 }, blocks: [], expanded: "" };
    const frame = frames[taskId];
    if (!frame.camera) frame.camera = { x: 0, y: 0, z: 1 };
    if (!Array.isArray(frame.blocks)) frame.blocks = [];
    if (typeof frame.expanded !== "string") frame.expanded = "";
    return frame;
  };
  const persist = () => {
    if (!ready) return;
    if (!isBoardTab(activeTab)) {
      const serialized = JSON.stringify(ensureFrame(activeTab));
      if (serialized !== savedFrames.get(activeTab)) {
        try { localStorage.setItem(frameKey(activeTab), serialized); savedFrames.set(activeTab, serialized); } catch {}
        persistRemote(activeTab);
      }
    }
    if (window.parent !== window && new URLSearchParams(location.search).has("workbenchPane")) return;
    try { localStorage.setItem(storageKey(), JSON.stringify({ openFrames, activeTab, lastBoardView, frames, linkedGoals })); } catch {}
  };
  const prune = () => {
    const knownTasks = new Set((listTasks?.() || []).map((item) => item.task_id));
    if (!knownTasks.size) return;
    openFrames = openFrames.filter((id) => knownTasks.has(id));
    if (!isBoardTab(activeTab) && !knownTasks.has(activeTab)) activeTab = lastBoardView;
  };
  const applySurface = () => {
    const onGoal = getSurface() === "goal";
    const showFrame = getSurface() === "task" && !isBoardTab(activeTab);
    if (!shell.closest("[data-tab-pane-body]")) shell.hidden = !onGoal || showFrame;
    const tabRoot = document.querySelector("[data-tab-workspace]");
    if (tabRoot) tabRoot.hidden = false;
    surfaceEl.hidden = !showFrame;
    if (onGoal && !showFrame) shell.dataset.boardView = activeTab === KANBAN_TAB ? KANBAN_TAB : CANVAS_TAB;
    if (showFrame) renderFrame();
  };
  const applyCamera = () => {
    if (isBoardTab(activeTab)) return;
    const camera = ensureFrame(activeTab).camera;
    worldEl.style.transform = "translate(" + camera.x + "px," + camera.y + "px) scale(" + camera.z + ")";
    if (zoomValue) zoomValue.textContent = Math.round(camera.z * 100) + "%";
  };
  const liveAssetRow = (block) => [...document.querySelectorAll("[data-frame-asset]")].find((row) => row.dataset.frameAsset === block.kind && row.dataset.frameAssetId === block.itemId);
  const showBlockError = (body, message) => {
    const status = document.createElement("p");
    status.className = "frame-block-status";
    status.textContent = message;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.dataset.frameBlockRetry = "";
    retry.textContent = L("重试");
    body.replaceChildren(status, retry);
  };
  const readingValue = (block, row, key, attr) => block.reading?.[key] || row?.dataset[attr] || "";
  const loadInboxBody = (body, block) => {
    const row = liveAssetRow(block);
    const article = document.createElement("article");
    article.className = "frame-reading";
    article.dataset.frameReading = "inbox";
    const reason = readingValue(block, row, "reason", "frameReadingReason");
    const relation = readingValue(block, row, "relation", "frameReadingRelation");
    const next = readingValue(block, row, "next", "frameReadingNext");
    const status = readingValue(block, row, "status", "frameReadingStatus");
    const copy = document.createElement("p");
    const parts = [];
    if (reason) parts.push(reason);
    if (relation) parts.push(L("这件事关联 {relation}。", { relation }));
    if (next) parts.push(L("下一步：{next}", { next }));
    if (status) parts.push(status);
    if (parts.length) copy.textContent = parts.join("");
    else copy.textContent = block.caption || "";
    if (copy.textContent) article.append(copy);
    body.replaceChildren(article);
  };
  const loadFeedBody = async (body, block) => {
    const row = liveAssetRow(block);
    const itemId = block.itemRef || row?.dataset.feedItemId || (row?.dataset.inboxSubjectType === "feed" ? row.dataset.inboxSubjectId : "") || block.itemId;
    const response = await fetch(toRoute("/api/feed/items/" + encodeURIComponent(itemId) + "/detail?preset=feed&surface=frame-block"), { cache: "no-store" });
    if (!response.ok) throw new Error(L("无法读取这条 Item"));
    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();
    const reading = template.content.querySelector("[data-frame-reading]") || template.content.querySelector(".frame-reading") || template.content.firstElementChild;
    if (!reading) throw new Error(L("无法读取这条 Item"));
    body.replaceChildren(reading);
  };
  const loadArtifactBody = async (body, block) => {
    const sep = String(block.itemId).lastIndexOf("#");
    const artifactId = sep === -1 ? block.itemId : block.itemId.slice(0, sep);
    const version = sep === -1 ? "1" : block.itemId.slice(sep + 1);
    const response = await fetch(toRoute("/artifacts/" + encodeURIComponent(artifactId) + "/versions/" + encodeURIComponent(version)), {
      cache: "no-store",
      headers: { "x-molis-work-fragment": "frame-block" },
    });
    if (!response.ok && response.status !== 404) throw new Error(L("无法读取成果"));
    const template = document.createElement("template");
    template.innerHTML = await response.text();
    const reading = template.content.querySelector("[data-frame-reading]") || template.content.querySelector("[data-artifact-detail]");
    if (!reading) throw new Error(L("无法读取成果"));
    if (reading.matches("[data-artifact-detail]")) {
      if (!reading.childElementCount) throw new Error(L("无法读取成果"));
      body.replaceChildren(...reading.childNodes);
    } else body.replaceChildren(reading);
  };
  const loadSessionBody = async (body, block) => {
    const response = await fetch(toRoute("/api/sessions/" + encodeURIComponent(block.itemId) + "/content"), {
      cache: "no-store",
      headers: window.molisWorkControlHeaders?.() || {},
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || L("无法打开这个内容"));
    const article = document.createElement("article");
    article.className = "frame-reading";
    article.dataset.frameReading = "session";
    const events = Array.isArray(payload.events)
      ? payload.events.filter((event) => String(event.content || "").trim() || ["tool", "artifact", "terminal_output", "user_message", "runtime_message"].includes(event.kind))
      : [];
    if (!events.length) {
      const empty = document.createElement("p");
      empty.className = "frame-block-status";
      empty.textContent = payload.native_error?.message || L("还没有可显示的执行内容");
      article.append(empty);
      body.replaceChildren(article);
      return;
    }
    const list = document.createElement("ol");
    list.className = "frame-session-events";
    events.slice(0, 16).forEach((event) => {
      const item = document.createElement("li");
      const label = document.createElement("strong");
      label.textContent = event.label || event.kind || "";
      const text = document.createElement("span");
      text.textContent = String(event.content || "").slice(0, 400);
      item.append(label, text);
      list.append(item);
    });
    article.append(list);
    body.replaceChildren(article);
  };
  const fillBlockBody = async (article, block, force) => {
    const body = article?.querySelector("[data-frame-block-body]");
    if (!body || !block) return;
    const stamp = block.kind + ":" + block.itemId;
    if (!force && body.dataset.loaded === stamp) return;
    const token = String(Date.now()) + "-" + block.id;
    body.dataset.loadToken = token;
    delete body.dataset.loaded;
    const status = document.createElement("p");
    status.className = "frame-block-status";
    status.textContent = L("正在打开…");
    body.replaceChildren(status);
    try {
      if (block.kind === "inbox") loadInboxBody(body, block);
      else if (block.kind === "feed") await loadFeedBody(body, block);
      else if (block.kind === "artifact") await loadArtifactBody(body, block);
      else if (block.kind === "session") await loadSessionBody(body, block);
      else {
        const fallback = document.createElement("p");
        fallback.textContent = block.caption || kindLabel(block.kind);
        body.replaceChildren(fallback);
      }
      if (!body.isConnected || body.dataset.loadToken !== token) return;
      body.dataset.loaded = stamp;
    } catch (error) {
      if (!body.isConnected || body.dataset.loadToken !== token) return;
      showBlockError(body, error instanceof Error ? error.message : L("无法打开这个内容"));
    }
  };
  const renderTabs = () => {
    if (knownGoalIds().size) prune();
    tabsEl.hidden = true;
    const workspaceTabs = document.querySelector("[data-titlebar-tabs]");
    if (workspaceTabs) workspaceTabs.hidden = false;
    shell.querySelectorAll("[data-board-view-tab]").forEach((button) => {
      if (isBoardTab(activeTab) && button.dataset.boardViewTab === activeTab) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    const fragment = document.createDocumentFragment();
    const canvas = document.createElement("button");
    canvas.type = "button";
    canvas.className = "container-tab is-pinned";
    canvas.dataset.containerTab = CANVAS_TAB;
    if (activeTab === CANVAS_TAB) canvas.setAttribute("aria-current", "page");
    const canvasLabel = document.createElement("span");
    canvasLabel.textContent = L("Goal 画布");
    canvas.append(canvasLabel);
    fragment.append(canvas);
    const kanban = document.createElement("button");
    kanban.type = "button";
    kanban.className = "container-tab is-pinned";
    kanban.dataset.containerTab = KANBAN_TAB;
    if (activeTab === KANBAN_TAB) kanban.setAttribute("aria-current", "page");
    const kanbanLabel = document.createElement("span");
    kanbanLabel.textContent = L("看板");
    kanban.append(kanbanLabel);
    fragment.append(kanban);
    openFrames.forEach((goalId) => {
      const tab = document.createElement("div");
      tab.className = "container-tab";
      tab.dataset.containerTab = goalId;
      tab.setAttribute("role", "tab");
      tab.title = goalTitle(goalId);
      if (activeTab === goalId) tab.setAttribute("aria-current", "page");
      const label = document.createElement("span");
      label.textContent = goalTitle(goalId);
      const close = document.createElement("button");
      close.type = "button";
      close.className = "container-tab-close";
      close.dataset.containerTabClose = goalId;
      close.setAttribute("aria-label", L("关闭 Frame：{title}", { title: goalTitle(goalId) }));
      close.title = L("关闭");
      close.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
      tab.append(label, close);
      fragment.append(tab);
    });
    tabsEl.replaceChildren(fragment);
    tabsEl.querySelector("[aria-current]")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  };
  window.addEventListener("storage", (event) => {
    if (!event.key?.startsWith(storageKey() + ":task:") || !event.newValue) return;
    const taskId = event.key.slice((storageKey() + ":task:").length);
    try {
      frames[taskId] = JSON.parse(event.newValue); savedFrames.set(taskId, event.newValue); loadedFrames.add(taskId);
      if (activeTab === taskId && isFrameTabActive()) renderFrame();
    } catch {}
  });
  const renderFrame = () => {
    if (isBoardTab(activeTab)) return;
    const frame = ensureFrame(activeTab);
    const task = taskRecord(activeTab);
    const tabGoal = document.querySelector('.tab-item[aria-current][data-plugin=task]')?.dataset.goalId || "";
    const goalId = task?.goal_id || linkedGoals[activeTab] || tabGoal || "";
    const item = goalId ? visibleGoals().find((entry) => entry.goal.goal_id === goalId) : null;
    if (goalId) surfaceEl.dataset.frameGoal = goalId; else delete surfaceEl.dataset.frameGoal;
    surfaceEl.querySelector('[data-frame-goal-title]').textContent = task?.title || (goalId ? goalTitle(goalId) : activeTab);
    const status = item?.display_status || item?.status || "";
    const statusEl = surfaceEl.querySelector('[data-frame-goal-status]');
    statusEl.textContent = item ? (item.status_label || L(status)) : "";
    statusEl.dataset.status = status;
    statusEl.hidden = !item;
    const outcomeEl = surfaceEl.querySelector('[data-frame-goal-outcome]');
    outcomeEl.textContent = item?.goal.outcome || (goalId ? L("还没有写明预期结果，可在工作区补充。") : "");
    outcomeEl.hidden = !goalId;
    surfaceEl.querySelectorAll("[data-frame-goal-work], [data-frame-goal-locate]").forEach((button) => { button.hidden = !goalId; });
    surfaceEl.querySelector('[data-frame-empty]').hidden = frame.blocks.length > 0;
    applyCamera();
    worldEl.replaceChildren();
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
      close.setAttribute("aria-label", L("收起这块"));
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
      worldEl.append(article);
      if (frame.expanded === block.id) void fillBlockBody(article, block);
    });
  };
  surfaceEl.querySelector('[data-frame-goal-work]')?.addEventListener('click', () => host.openGoalWork?.());
  surfaceEl.querySelector('[data-frame-goal-locate]')?.addEventListener('click', () => {
    const goalId = taskRecord(activeTab)?.goal_id || linkedGoals[activeTab];
    if (goalId) locateGoal(goalId);
  });
  const sync = () => {
    renderTabs();
    applySurface();
  };
  const showBoard = (view) => {
    if (!containerEnabled() || !isBoardTab(view)) return;
    const already = activeTab === view && getSurface() === "goal";
    lastBoardView = view;
    activeTab = view;
    setWorkSurface("goal");
    host.activateGoalsMother?.();
    if (!already) setWorkspaceMode("graph");
    sync();
    persist();
  };
  const showCanvas = () => showBoard(CANVAS_TAB);
  const showKanban = () => showBoard(KANBAN_TAB);
  const openFrame = (goalId) => { void openTaskForGoal?.(goalId); };
  const showTaskFrame = (taskId, goalId) => {
    if (!containerEnabled() || !taskId) return;
    if (goalId) linkedGoals[taskId] = goalId;
    ensureFrame(taskId);
    activeTab = taskId;
    setWorkSurface("task");
    setWorkspaceMode("graph");
    sync();
    persist();
  };
  const closeFrame = (goalId) => {
    openFrames = openFrames.filter((id) => id !== goalId);
    if (activeTab === goalId) activeTab = lastBoardView;
    host.activateGoalsMother?.();
    setWorkspaceMode("graph", false);
    sync();
    persist();
  };
  const restoreBoard = () => {
    if (!containerEnabled()) return;
    const previous = activeTab;
    if (!isBoardTab(activeTab)) activeTab = lastBoardView;
    setWorkSurface("goal");
    setWorkspaceMode("graph", false, true);
    sync();
    if (previous !== activeTab) persist();
  };
  const releaseFrame = () => {
    if (!containerEnabled()) return;
    if (isBoardTab(activeTab)) {
      applySurface();
      return;
    }
    activeTab = lastBoardView;
    sync();
    persist();
  };
  const locateGoal = (goalId) => {
    if (!containerEnabled() || !goalId) return;
    if (!isBoardTab(activeTab)) activeTab = lastBoardView;
    host.activateGoalsMother?.();
    setDirectory("goals", true, false);
    setWorkSurface("goal");
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
    showToast(L("Goal 画布只放 Goal。先打开某个 Goal 的 Frame，再把内容拖进去。"));
  };
  const rejectGoal = () => {
    canvasEl.classList.add("is-reject");
    window.setTimeout(() => canvasEl.classList.remove("is-reject"), 420);
    showToast(L("Goal 留在主画布上。这里只放推进这个 Goal 用的工作内容。"));
  };
  const readAsset = (target) => {
    if (!target?.closest) return null;
    if (target.closest("[data-tree-toggle], [data-directory-back], [data-work-surface-open], [data-open-session-add], [data-feed-filter-trigger], [data-feed-filter-panel], [data-operation-search], [data-container-tabs], [data-frame-block]")) return null;
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
  const addBlock = (asset, clientX, clientY) => {
    if (!asset?.id || asset.kind === "goal") { rejectGoal(); return; }
    const frame = ensureFrame(activeTab);
    const rect = canvasEl.getBoundingClientRect();
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
    renderFrame();
    persist();
  };
  const picker = surfaceEl.querySelector("[data-frame-picker]");
  const pickerSearch = picker.querySelector("[data-frame-picker-search]");
  const pickerKind = picker.querySelector("[data-frame-picker-kind]");
  const pickerList = picker.querySelector("[data-frame-picker-list]");
  let pickerAssets = [], pickerOpener = null;
  const renderPicker = () => {
    const query = pickerSearch.value.trim().toLocaleLowerCase();
    const matches = pickerAssets.filter((asset) => (pickerKind.value === "all" || asset.kind === pickerKind.value) && (asset.title + " " + asset.caption).toLocaleLowerCase().includes(query));
    pickerList.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "no-results";
      empty.textContent = pickerAssets.length ? L("没有匹配的内容，试试其他关键词或来源。") : L("当前项目还没有可添加的内容。");
      pickerList.append(empty);
    }
    for (const asset of matches) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.framePickerAsset = asset.kind + ":" + asset.id;
      const title = document.createElement("strong"), caption = document.createElement("small"), state = document.createElement("span");
      title.textContent = asset.title;
      caption.textContent = [kindLabel(asset.kind), asset.caption].filter(Boolean).join(" · ");
      button.disabled = ensureFrame(activeTab).blocks.some((block) => block.kind === asset.kind && block.itemId === asset.id);
      state.textContent = button.disabled ? L("已添加") : "+";
      state.setAttribute("aria-hidden", "true");
      button.append(title, caption, state);
      button.addEventListener("click", () => {
        picker.close();
        const rect = canvasEl.getBoundingClientRect();
        addBlock(asset, rect.left + rect.width / 2 - 70, rect.top + Math.min(rect.height / 2, 120));
        requestAnimationFrame(() => worldEl.lastElementChild?.focus({ preventScroll: true }));
      });
      pickerList.append(button);
    }
  };
  surfaceEl.querySelectorAll("[data-frame-add-content]").forEach((button) => button.addEventListener("click", () => {
    if (!isFrameTabActive()) return;
    pickerOpener = button;
    const assets = new Map();
    document.querySelectorAll("[data-frame-asset]").forEach((row) => {
      const asset = readAsset(row);
      if (asset?.id && ["feed", "inbox", "session", "artifact"].includes(asset.kind)) assets.set(asset.kind + ":" + asset.id, asset);
    });
    pickerAssets = [...assets.values()];
    pickerSearch.value = ""; pickerKind.value = "all";
    renderPicker(); picker.showModal();
  }));
  pickerSearch.addEventListener("input", renderPicker);
  pickerKind.addEventListener("change", renderPicker);
  picker.querySelectorAll("[data-frame-picker-close]").forEach((button) => button.addEventListener("click", () => picker.close()));
  picker.addEventListener("close", () => pickerOpener?.focus({ preventScroll: true }));
  canvasEl.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key) || !event.target.matches("[data-frame-block]")) return;
    event.preventDefault(); event.target.click();
    worldEl.querySelector('[data-frame-block="' + CSS.escape(event.target.dataset.frameBlock) + '"]')?.focus({ preventScroll: true });
  });
  const routeAsset = (asset, clientX, clientY) => {
    if (!asset?.kind) return false;
    if (asset.kind === "goal") { locateGoal(asset.id); return true; }
    if (isBoardTab(activeTab)) { rejectCanvas(); return true; }
    addBlock(asset, clientX, clientY);
    return true;
  };
  const restore = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey()) || "null");
      if (stored && typeof stored === "object") {
        openFrames = Array.isArray(stored.openFrames) ? stored.openFrames.map(String) : [];
        lastBoardView = stored.lastBoardView === KANBAN_TAB ? KANBAN_TAB : CANVAS_TAB;
        activeTab = stored.activeTab ? String(stored.activeTab) : lastBoardView;
        frames = stored.frames && typeof stored.frames === "object" ? stored.frames : {};
        linkedGoals = stored.linkedGoals && typeof stored.linkedGoals === "object" ? stored.linkedGoals : {};
      }
    } catch { openFrames = []; activeTab = CANVAS_TAB; lastBoardView = CANVAS_TAB; frames = {}; linkedGoals = {}; }
    prune();
    ready = true;
    sync();
  };
  tabsEl.addEventListener("click", (event) => {
    const close = event.target.closest("[data-container-tab-close]");
    if (close) { event.preventDefault(); event.stopPropagation(); closeFrame(close.dataset.containerTabClose); return; }
    const tab = event.target.closest("[data-container-tab]");
    if (!tab) return;
    if (tab.dataset.containerTab === CANVAS_TAB) showCanvas();
    else if (tab.dataset.containerTab === KANBAN_TAB) showKanban();
    else openFrame(tab.dataset.containerTab);
  });
  shell.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-board-view-tab]");
    if (!tab) return;
    event.preventDefault();
    if (tab.dataset.boardViewTab === KANBAN_TAB) showKanban();
    else showCanvas();
  });
  document.addEventListener("click", (event) => {
    if (!containerEnabled() || getSurface() !== "task") return;
    const asset = readAsset(event.target);
    if (!asset?.kind) return;
    if (asset.kind === "goal") return;
    if (isBoardTab(activeTab) && asset.kind !== "goal") return;
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
  canvasEl.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    canvasEl.classList.add("is-drop");
  });
  canvasEl.addEventListener("dragleave", (event) => {
    if (!canvasEl.contains(event.relatedTarget)) canvasEl.classList.remove("is-drop");
  });
  canvasEl.addEventListener("drop", (event) => {
    event.preventDefault();
    canvasEl.classList.remove("is-drop");
    const asset = readTransfer(event) || dragAsset;
    if (!asset) return;
    if (asset.kind === "goal") { rejectGoal(); return; }
    routeAsset(asset, event.clientX, event.clientY);
  });
  let pan = null;
  canvasEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || isBoardTab(activeTab)) return;
    if (event.target.closest("[data-frame-add-content], [data-frame-block-close], [data-frame-block-retry], [data-frame-block-body] a, [data-frame-block-body] button")) return;
    if (event.target.closest("[data-frame-block-body]")) return;
    const block = event.target.closest("[data-frame-block]");
    const frame = ensureFrame(activeTab);
    pan = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      block,
      origin: block
        ? { ...frame.blocks.find((item) => item.id === block.dataset.frameBlock) }
        : { ...frame.camera },
      moved: false,
    };
    event.preventDefault();
    try { (block || canvasEl).setPointerCapture(event.pointerId); } catch {}
  });
  canvasEl.addEventListener("pointermove", (event) => {
    if (!pan || pan.id !== event.pointerId) return;
    const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
    if (!pan.moved && Math.hypot(dx, dy) < 5) return;
    pan.moved = true;
    const frame = ensureFrame(activeTab);
    if (pan.block) {
      const block = frame.blocks.find((item) => item.id === pan.block.dataset.frameBlock);
      if (block) {
        block.x = pan.origin.x + dx / frame.camera.z;
        block.y = pan.origin.y + dy / frame.camera.z;
        pan.block.style.transform = "translate(" + block.x + "px," + block.y + "px)";
      }
    } else {
      frame.camera.x = pan.origin.x + dx;
      frame.camera.y = pan.origin.y + dy;
      applyCamera();
    }
    canvasEl.classList.add("is-panning");
  });
  const finishPan = (event) => {
    if (!pan || pan.id !== event.pointerId) return;
    suppressClick = pan.moved;
    const captured = pan.block || canvasEl;
    pan = null;
    if (captured.hasPointerCapture?.(event.pointerId)) captured.releasePointerCapture(event.pointerId);
    canvasEl.classList.remove("is-panning");
    persist();
    setTimeout(() => { suppressClick = false; }, 0);
  };
  canvasEl.addEventListener("pointerup", finishPan);
  canvasEl.addEventListener("pointercancel", finishPan);
  canvasEl.addEventListener("click", (event) => {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); return; }
    const close = event.target.closest("[data-frame-block-close]");
    if (close) {
      event.preventDefault();
      event.stopPropagation();
      const frame = ensureFrame(activeTab);
      frame.expanded = "";
      renderFrame();
      persist();
      return;
    }
    const retry = event.target.closest("[data-frame-block-retry]");
    if (retry) {
      event.preventDefault();
      const article = retry.closest("[data-frame-block]");
      const block = ensureFrame(activeTab).blocks.find((item) => item.id === article?.dataset.frameBlock);
      if (article && block) void fillBlockBody(article, block, true);
      return;
    }
    if (event.target.closest("[data-frame-block-body] a, [data-frame-block-body] button, [data-feed-action], [data-inbox-action]")) return;
    const article = event.target.closest("[data-frame-block]");
    if (!article || isBoardTab(activeTab)) return;
    const frame = ensureFrame(activeTab);
    if (frame.expanded === article.dataset.frameBlock) return;
    frame.expanded = article.dataset.frameBlock;
    renderFrame();
    persist();
  });
  canvasEl.addEventListener("wheel", (event) => {
    if (isBoardTab(activeTab)) return;
    if (event.target.closest("[data-frame-block-body]")) return;
    event.preventDefault();
    const frame = ensureFrame(activeTab);
    if (event.ctrlKey || event.metaKey) {
      const rect = canvasEl.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const next = Math.min(1.6, Math.max(0.4, frame.camera.z * Math.exp(-event.deltaY * .008)));
      frame.camera.x = x - (x - frame.camera.x) * next / frame.camera.z;
      frame.camera.y = y - (y - frame.camera.y) * next / frame.camera.z;
      frame.camera.z = next;
    } else {
      frame.camera.x -= event.deltaX || (event.shiftKey ? event.deltaY : 0);
      frame.camera.y -= event.shiftKey ? 0 : event.deltaY;
    }
    applyCamera();
    persist();
  }, { passive: false });
  surfaceEl.addEventListener("click", (event) => {
    const zoom = event.target.closest("[data-frame-zoom]");
    if (!zoom || isBoardTab(activeTab)) return;
    const frame = ensureFrame(activeTab);
    frame.camera.z = Math.min(1.6, Math.max(0.4, frame.camera.z * (zoom.dataset.frameZoom === "in" ? 1.15 : .85)));
    applyCamera();
    persist();
  });
  restore();
  return { isFrameTabActive, isKanbanTabActive, openFrame, showTaskFrame, locateGoal, showCanvas, showKanban, restoreBoard, closeFrame, releaseFrame, restore, sync };
}`;
