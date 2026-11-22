import { elementOf } from "./dom.js";
import {
  blockArticle, containerTabs, type Frame, type FrameAsset, type FrameAssetService, type FrameBlock, fillBody, kindLabel, readAsset, readTransfer,
} from "./frame-blocks.js";
import type { GoalListItem, Route, SetWorkspaceMode, ShowToast } from "./types.js";

export interface FrameContainerHost {
  readonly showToast: ShowToast;
  readonly frameAssets: () => Promise<FrameAssetService>;
  readonly visible?: () => boolean;
  readonly visibleGoals: () => readonly (GoalListItem & { readonly display_status?: string; readonly goal: { readonly outcome?: string } })[];
  readonly getSurface: () => string;
  readonly setWorkSurface: (surface: string) => void;
  readonly setDirectory: (directory: string, persist?: boolean, focus?: boolean) => void;
  readonly setWorkspaceMode: SetWorkspaceMode;
  readonly setMobileView: (view: string) => void;
  readonly applySelection: (goalId: string) => void;
  readonly locateGraphNode: (goalId: string) => void;
  readonly getProjectId: () => string;
  readonly route: Route;
  readonly openGoalTab?: (goalId: string) => void;
  readonly openGoalWork?: (paneId?: string) => void;
  readonly activateGoalsMother?: () => void;
}

const LIST_TAB = "list";
const CANVAS_TAB = "canvas";
const KANBAN_TAB = "kanban";
const boardTab = (tab: unknown): tab is string => tab === LIST_TAB || tab === CANVAS_TAB || tab === KANBAN_TAB;
const clampZoom = (z: number) => Math.min(1.6, Math.max(0.4, z));
interface Pan { id: number; x: number; y: number; block: HTMLElement | null; goalId: string; origin: { x: number; y: number }; moved: boolean }
interface Stored { openFrames?: unknown; activeTab?: unknown; lastBoardView?: unknown; frames?: unknown }

interface SurfaceParts {
  readonly host: FrameContainerHost;
  readonly route: Route;
  readonly goalOfSurface: (target: HTMLElement) => string;
  readonly frameOf: (goalId: string) => Frame;
  readonly setCamera: (target: HTMLElement, goalId: string) => void;
  readonly persist: (goalId: string) => void;
  readonly drawGoalFrames: (goalId: string) => void;
  readonly locateGoal: (goalId: string) => void;
  readonly openPicker: (target: HTMLElement, button: HTMLElement) => Promise<void>;
  readonly captureAsset: (x: number, y: number, target: HTMLElement, goalId: string) => ((asset: FrameAsset) => boolean) | null;
  readonly rejectGoal: (canvas: HTMLElement) => void;
  readonly routeAsset: (asset: FrameAsset | null, x: number, y: number, target: HTMLElement, goalId: string) => boolean;
  readonly dragAsset: () => FrameAsset | null;
}

const noop = { releaseFrame: () => {}, isFrameTabActive: () => false, isKanbanTabActive: () => false, openFrame: (_goalId: string) => {}, showGoalFrame: (_goalId: string, _target?: HTMLElement): boolean | undefined => undefined, bindFrameSurface: (_target: HTMLElement) => {}, locateGoal: (_goalId: string) => {}, showList: () => {}, showCanvas: () => {}, showKanban: () => {}, restoreBoard: () => {}, closeFrame: (_goalId: string) => {}, restore: () => {}, sync: () => {} };

/** The canvas, the board and the Goal frames. */
export function frameContainerClient(host: FrameContainerHost) {
  const { showToast, visibleGoals, getSurface, setWorkSurface, setDirectory, setWorkspaceMode, setMobileView, applySelection, locateGraphNode, getProjectId, route } = host;
  const tabsEl = document.querySelector<HTMLElement>(".immersive-titlebar [data-container-tabs]") || document.querySelector<HTMLElement>("[data-container-tabs]");
  const surfaceEl = document.querySelector<HTMLElement>("[data-goal-frame-surface]");
  const canvasEl = document.querySelector<HTMLElement>("[data-frame-canvas]");
  const worldEl = document.querySelector<HTMLElement>("[data-frame-world]");
  const shell = document.querySelector<HTMLElement>("[data-goal-canvas-shell]");
  const picker = surfaceEl?.querySelector<HTMLDialogElement>("[data-frame-picker]");
  const pickQuery = picker?.querySelector<HTMLInputElement>("[data-frame-picker-search]");
  const pickerKind = picker?.querySelector<HTMLSelectElement>("[data-frame-picker-kind]");
  const pickerList = picker?.querySelector<HTMLElement>("[data-frame-picker-list]");
  if (!tabsEl || !shell || !surfaceEl || !canvasEl || !worldEl || !picker || !pickQuery || !pickerKind || !pickerList) return noop;
  const storageKey = () => "molis-work-frame-container:" + (getProjectId() || "board");
  let openIds: string[] = [];
  let curTab = LIST_TAB;
  let lastBoard = LIST_TAB;
  let frames: Record<string, Frame> = {};
  let blockSeq = 1;
  let ready = false;
  let assetServiceStarted = false;
  let receivingKey = "", receivingVersion = 0;
  let dragAsset: FrameAsset | null = null;
  const boundSurfaces = new WeakSet<HTMLElement>();
  const enabled = () => document.body.dataset.boardView === "current";
  const isFrameTabActive = () => enabled() && getSurface() === "goals" && !boardTab(curTab);
  const isKanbanTabActive = () => enabled() && getSurface() === "goals" && curTab === KANBAN_TAB;
  const knownIds = () => new Set(visibleGoals().map((item) => item.goal.goal_id));
  const goalTitle = (goalId: string) => visibleGoals().find((item) => item.goal.goal_id === goalId)?.goal.title || goalId;
  const loadedFrames = new Set<string>();
  const savedFrames = new Map<string, string>();
  const frameKey = (goalId: string) => storageKey() + ":goal:" + goalId;
  const frameOf = (goalId: string): Frame => {
    if (!loadedFrames.has(goalId)) {
      loadedFrames.add(goalId);
      try {
        const saved = localStorage.getItem(frameKey(goalId));
        if (saved) frames[goalId] = JSON.parse(saved) as Frame;
      } catch { /* An unreadable saved frame starts empty. */ }
      savedFrames.set(goalId, JSON.stringify(frames[goalId]));
    }
    const frame = frames[goalId] ??= { camera: { x: 0, y: 0, z: 1 }, blocks: [], expanded: "" };
    if (!frame.camera) frame.camera = { x: 0, y: 0, z: 1 };
    if (!Array.isArray(frame.blocks)) frame.blocks = [];
    if (typeof frame.expanded !== "string") frame.expanded = "";
    return frame;
  };
  const persistGoal = (goalId: string) => {
    if (!ready || !goalId || boardTab(goalId)) return;
    const serialized = JSON.stringify(frameOf(goalId));
    if (serialized !== savedFrames.get(goalId)) {
      try {
        localStorage.setItem(frameKey(goalId), serialized);
        savedFrames.set(goalId, serialized);
      } catch { /* A frame that cannot be saved stays as it is on this page. */ }
    }
  };
  const persist = (goalId: string = curTab) => {
    if (!ready) return;
    persistGoal(goalId);
    if (window.parent !== window && new URLSearchParams(location.search).has("workbenchPane")) return;
    try { localStorage.setItem(storageKey(), JSON.stringify({ openFrames: openIds, activeTab: curTab, lastBoardView: lastBoard, frames })); } catch { /* The open frames are kept for this page only. */ }
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
  const goalOfSurface = (target: HTMLElement) => target.dataset.frameGoal || curTab;
  const setCamera = (target: HTMLElement = surfaceEl, goalId: string = goalOfSurface(target)) => {
    if (!goalId || boardTab(goalId)) return;
    const camera = frameOf(goalId).camera;
    const world = target.querySelector<HTMLElement>("[data-frame-world]");
    const zoom = target.querySelector<HTMLElement>("[data-frame-zoom-value]");
    if (world) world.style.transform = "translate(" + camera.x + "px," + camera.y + "px) scale(" + camera.z + ")";
    if (zoom) zoom.textContent = Math.round(camera.z * 100) + "%";
  };
  const drawFrame = (target: HTMLElement = surfaceEl, goalId: string = goalOfSurface(target)) => {
    if (!goalId || boardTab(goalId)) return;
    const frame = frameOf(goalId);
    const item = visibleGoals().find((entry) => entry.goal.goal_id === goalId);
    target.dataset.frameGoal = goalId;
    const put = (selector: string, text: string) => {
      const el = target.querySelector(selector);
      if (el && el.textContent !== text) el.textContent = text;
    };
    put("[data-frame-goal-title]", goalTitle(goalId));
    const status = item?.display_status || item?.status || "";
    const statusEl = target.querySelector<HTMLElement>("[data-frame-goal-status]");
    const source = document.querySelector('[data-goal-id="' + CSS.escape(goalId) + '"] .goal-status');
    if (statusEl) {
      statusEl.className = source?.className || ("goal-status" + (status ? " goal-status--" + status : ""));
      if (source) statusEl.innerHTML = source.innerHTML;
      else statusEl.textContent = item?.status_label || status;
      statusEl.dataset.status = status;
    }
    put("[data-frame-goal-outcome]", item?.goal.outcome || globalThis.t.text("goals.frame-container-client.no-expected-result-written-yet-can-add-one"));
    const empty = target.querySelector<HTMLElement>("[data-frame-empty]");
    if (empty) empty.hidden = frame.blocks.length > 0;
    setCamera(target, goalId);
    const world = target.querySelector<HTMLElement>("[data-frame-world]");
    if (!world) return;
    world.replaceChildren();
    frame.blocks.forEach((block) => {
      const article = blockArticle(block, frame.expanded === block.id);
      world.append(article);
      if (frame.expanded === block.id) void fillBody(article, block, route);
    });
  };
  /** The frame surface on the page and its copies in the other split panes. */
  const allFrameSurfaces = () => [...new Set([surfaceEl, ...document.querySelectorAll<HTMLElement>("[data-tab-panes] [data-goal-frame-surface]")])];
  const drawGoalFrames = (goalId: string) => {
    allFrameSurfaces().forEach((el) => { if (el.dataset.frameGoal === goalId && !el.hidden) drawFrame(el, goalId); });
  };
  const ensureAssets = () => {
    if (assetServiceStarted) return;
    assetServiceStarted = true;
    queueMicrotask(() => { void host.frameAssets().catch(() => { /* The explicit picker can retry the shared bridge. */ }); });
  };
  const multiPane = () => document.querySelectorAll("[data-tab-pane]").length > 1;
  const applySurface = () => {
    const onGoal = getSurface() === "goals";
    const showFrame = onGoal && !boardTab(curTab);
    const receiving = showFrame ? curTab : "";
    if (receivingKey !== receiving) {
      receivingKey = receiving;
      receivingVersion++;
    }
    // With several panes, each pane shows its own copy; the workspace decides which root is visible.
    if (!multiPane()) {
      shell.hidden = !onGoal || showFrame;
      surfaceEl.hidden = !showFrame;
    }
    const tabRoot = document.querySelector<HTMLElement>("[data-tab-workspace]");
    if (tabRoot) tabRoot.hidden = false;
    if (onGoal && !showFrame) shell.dataset.boardView = boardTab(curTab) ? curTab : LIST_TAB;
    if (showFrame) {
      drawFrame(surfaceEl, curTab);
      ensureAssets();
    }
  };
  const renderTabs = () => {
    if (knownIds().size) prune();
    tabsEl.hidden = true;
    shell.querySelectorAll<HTMLElement>("[data-board-view-tab]").forEach((button) => {
      const current = boardTab(curTab) && button.dataset.boardViewTab === curTab;
      button.classList.toggle("is-current", current);
      button.setAttribute("aria-pressed", String(current));
      if (current) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    tabsEl.replaceChildren(containerTabs(curTab, openIds, goalTitle));
  };
  window.addEventListener("storage", (event) => {
    if (!event.key?.startsWith(storageKey() + ":goal:") || !event.newValue) return;
    const goalId = event.key.slice((storageKey() + ":goal:").length);
    try {
      const previous = frames[goalId], incoming = JSON.parse(event.newValue) as Frame;
      frames[goalId] = incoming;
      savedFrames.set(goalId, event.newValue);
      loadedFrames.add(goalId);
      const cameraOnly = previous?.expanded === incoming.expanded && JSON.stringify(previous?.blocks) === JSON.stringify(incoming.blocks);
      allFrameSurfaces().forEach((el) => {
        if (el.dataset.frameGoal !== goalId || el.hidden) return;
        if (cameraOnly) setCamera(el, goalId);
        else drawFrame(el, goalId);
      });
    } catch { /* Another page's unreadable frame leaves this one as it is. */ }
  });
  const sync = () => {
    renderTabs();
    applySurface();
  };
  const showBoard = (view: string) => {
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
  const openFrame = (goalId: string) => host.openGoalTab?.(goalId);
  // Answers false for a Goal the board does not list, so the caller reads it instead (it may be gone: 07-1 S3).
  const showGoalFrame = (goalId: string, target: HTMLElement = surfaceEl): boolean | undefined => {
    if (!enabled() || !goalId) return undefined;
    if (!knownIds().has(goalId)) return false;
    frameOf(goalId);
    if (!openIds.includes(goalId)) openIds.push(goalId);
    // A pane copy (or the page's own surface beside other panes) draws its Goal without moving the page's tab.
    if (target !== surfaceEl || multiPane()) {
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
  const closeFrame = (goalId: string) => {
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
  const locateGoal = (goalId: string) => {
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
  const reject = (node: Element | null | undefined, message: string) => {
    node?.classList.add("is-reject");
    window.setTimeout(() => node?.classList.remove("is-reject"), 420);
    showToast(message);
  };
  const rejectCanvas = () => reject(shell.querySelector("[data-graph-viewport]"), globalThis.t.text("goals.frame-container-client.goal-canvas-only-holds-goals-open-frame-first"));
  const rejectGoal = (targetCanvas: HTMLElement = canvasEl) => reject(targetCanvas, globalThis.t.text("goals.frame-container-client.goals-stay-main-canvas-frame-only-holds-work"));
  const addBlock = (asset: FrameAsset, clientX: number | undefined, clientY: number | undefined, targetSurface: HTMLElement, goalId: string) => {
    const targetCanvas = targetSurface.querySelector<HTMLElement>("[data-frame-canvas]") || canvasEl;
    if (!asset?.id || asset.kind === "goal") {
      rejectGoal(targetCanvas);
      return;
    }
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
  const routeAsset = (asset: FrameAsset | null, clientX?: number, clientY?: number, targetSurface: HTMLElement = surfaceEl, goalId: string = goalOfSurface(targetSurface)) => {
    if (!asset?.kind) return false;
    if (asset.kind === "goal") {
      locateGoal(asset.id);
      return true;
    }
    if (!goalId || boardTab(goalId)) {
      rejectCanvas();
      return true;
    }
    addBlock(asset, clientX, clientY, targetSurface, goalId);
    return true;
  };
  /** Holds the frame an asset was chosen for: the answer is refused once the person has moved on to another one. */
  const captureAsset = (x: number, y: number, targetSurface: HTMLElement = surfaceEl, targetGoal: string = goalOfSurface(targetSurface)) => {
    const current = () => Boolean(targetGoal) && !boardTab(targetGoal) && targetSurface.isConnected && targetSurface.checkVisibility({ visibilityProperty: true }) && host.visible?.() !== false;
    if (!current()) return null;
    const version = receivingVersion;
    return (asset: FrameAsset) => {
      if (!current() || goalOfSurface(targetSurface) !== targetGoal || version !== receivingVersion || !knownIds().has(targetGoal)) return false;
      return routeAsset(asset, x, y, targetSurface, targetGoal);
    };
  };

  let pickItems: FrameAsset[] = [], pickerOpener: HTMLElement | null = null, pickerSurface: HTMLElement = surfaceEl, pickerGoal = "";
  let pickerRead: AbortController | null = null;
  const pickAsset = async (button: HTMLButtonElement, asset: FrameAsset, event: MouseEvent) => {
    if (asset.source && !event.isTrusted) return;
    const targetCanvas = pickerSurface.querySelector<HTMLElement>("[data-frame-canvas]") || canvasEl;
    const targetWorld = pickerSurface.querySelector<HTMLElement>("[data-frame-world]") || worldEl;
    const rect = targetCanvas.getBoundingClientRect();
    const accept = captureAsset(rect.left + rect.width / 2 - 70, rect.top + Math.min(rect.height / 2, 120), pickerSurface, pickerGoal);
    if (!accept) return;
    button.disabled = true;
    try {
      const fresh = asset.source ? await (await host.frameAssets()).resolve(asset, pickerRead?.signal) : asset;
      if (!fresh || !accept(fresh)) {
        button.remove();
        return;
      }
      picker.close();
    } catch {
      button.remove();
      return;
    }
    requestAnimationFrame(() => (targetWorld.lastElementChild as HTMLElement | null)?.focus({ preventScroll: true }));
  };
  const drawPicker = () => {
    const query = pickQuery.value.trim().toLocaleLowerCase();
    const matches = pickItems.filter((asset) => (pickerKind.value === "all" || asset.kind === pickerKind.value) && (asset.title + " " + asset.caption).toLocaleLowerCase().includes(query));
    pickerList.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "no-results";
      empty.textContent = pickItems.length ? globalThis.t.text("goals.frame-container-client.no-matches-try-another-search-source") : globalThis.t.text("goals.frame-container-client.project-has-no-content-add-yet");
      pickerList.append(empty);
    }
    for (const asset of matches) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.framePickerAsset = asset.kind + ":" + asset.id;
      const title = document.createElement("strong"), caption = document.createElement("small"), state = document.createElement("span");
      title.textContent = asset.title;
      caption.textContent = [kindLabel(asset.kind), asset.caption].filter(Boolean).join(" · ");
      button.disabled = frameOf(pickerGoal || curTab).blocks.some((block) => block.kind === asset.kind && block.itemId === asset.id);
      state.textContent = button.disabled ? globalThis.t.text("goals.frame-container-client.added") : "+";
      state.setAttribute("aria-hidden", "true");
      button.append(title, caption, state);
      button.addEventListener("click", (event) => { void pickAsset(button, asset, event); });
      pickerList.append(button);
    }
  };
  const openPicker = async (targetSurface: HTMLElement, button: HTMLElement) => {
    const goalId = goalOfSurface(targetSurface);
    if (!goalId || boardTab(goalId) || !targetSurface.checkVisibility({ visibilityProperty: true })) return;
    pickerRead?.abort();
    pickerRead = new AbortController();
    const signal = pickerRead.signal, version = receivingVersion;
    pickerOpener = button;
    pickerSurface = targetSurface;
    pickerGoal = goalId;
    const assets = new Map<string, FrameAsset>();
    document.querySelectorAll("[data-frame-asset]").forEach((row) => {
      const asset = readAsset(row);
      if (asset?.id && ["feed", "inbox", "artifact"].includes(asset.kind)) assets.set(asset.kind + ":" + asset.id, asset);
    });
    try { for (const asset of await (await host.frameAssets()).list(signal)) assets.set(asset.kind + ":" + asset.id, asset); }
    catch {
      if (!signal.aborted) showToast(globalThis.t.text("goals.frame-container-client.drop-content-unreadable"), true);
      return;
    }
    if (signal.aborted || !targetSurface.checkVisibility({ visibilityProperty: true }) || goalOfSurface(targetSurface) !== goalId || version !== receivingVersion) return;
    pickItems = [...assets.values()];
    pickQuery.value = "";
    pickerKind.value = "all";
    drawPicker();
    picker.showModal();
  };
  pickQuery.addEventListener("input", drawPicker);
  pickerKind.addEventListener("change", drawPicker);
  picker.querySelectorAll("[data-frame-picker-close]").forEach((button) => button.addEventListener("click", () => picker.close()));
  picker.addEventListener("close", () => {
    pickerRead?.abort();
    pickerOpener?.focus({ preventScroll: true });
  });

  const restore = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey()) || "null") as Stored | null;
      if (stored && typeof stored === "object") {
        openIds = Array.isArray(stored.openFrames) ? stored.openFrames.map(String) : [];
        lastBoard = boardTab(stored.lastBoardView) ? stored.lastBoardView : LIST_TAB;
        curTab = boardTab(stored.activeTab) || (typeof stored.activeTab === "string" && openIds.includes(stored.activeTab)) ? String(stored.activeTab) : lastBoard;
        frames = stored.frames && typeof stored.frames === "object" ? stored.frames as Record<string, Frame> : {};
      }
    } catch {
      openIds = [];
      curTab = LIST_TAB;
      lastBoard = LIST_TAB;
      frames = {};
    }
    // A split pane's Goals page has no item in its URL. The project-level Frame selection
    // may be a Goal open in another pane; its saved board view is the page's view.
    const paneParams = new URLSearchParams(location.search);
    if (window.parent !== window && paneParams.has("workbenchPane") && paneParams.get("panePlugin") === "goals" && !paneParams.has("paneItem")) curTab = lastBoard;
    prune();
    ready = true;
    sync();
  };
  const showTab = (tab: string | undefined) => {
    if (tab === LIST_TAB) showList();
    else if (tab === CANVAS_TAB) showCanvas();
    else if (tab === KANBAN_TAB) showKanban();
    else if (tab) openFrame(tab);
  };
  tabsEl.addEventListener("click", (event) => {
    const target = elementOf(event);
    const close = target?.closest<HTMLElement>("[data-container-tab-close]");
    if (close) {
      event.preventDefault();
      event.stopPropagation();
      closeFrame(close.dataset.containerTabClose || "");
      return;
    }
    const tab = target?.closest<HTMLElement>("[data-container-tab]");
    if (tab) showTab(tab.dataset.containerTab);
  });
  shell.addEventListener("click", (event) => {
    const tab = elementOf(event)?.closest<HTMLElement>("[data-board-view-tab]");
    if (!tab) return;
    event.preventDefault();
    showTab(tab.dataset.boardViewTab === LIST_TAB || tab.dataset.boardViewTab === KANBAN_TAB ? tab.dataset.boardViewTab : CANVAS_TAB);
  });
  document.addEventListener("click", (event) => {
    if (!isFrameTabActive()) return;
    const asset = readAsset(elementOf(event));
    if (!asset?.kind || asset.kind === "goal") return;
    event.preventDefault();
    event.stopPropagation();
    routeAsset(asset);
  }, true);
  const bindFrameSurface = (target: HTMLElement) => {
    if (boundSurfaces.has(target)) return;
    boundSurfaces.add(target);
    bindSurfaceGestures(target, { host, route, goalOfSurface, frameOf, setCamera, persist, drawGoalFrames, locateGoal, openPicker, captureAsset, rejectGoal, routeAsset, dragAsset: () => dragAsset });
  };
  bindPageGestures();
  bindFrameSurface(surfaceEl);
  restore();
  return { isFrameTabActive, isKanbanTabActive, openFrame, showGoalFrame, bindFrameSurface, locateGoal, showList, showCanvas, showKanban, restoreBoard, closeFrame, releaseFrame, restore, sync };

  /** Dragging assets in from the page and dropping on the board. */
  function bindPageGestures() {
    document.addEventListener("dragstart", (event) => {
      const asset = readAsset(elementOf(event));
      if (!asset?.kind) return;
      dragAsset = asset;
      if (!event.dataTransfer) return;
      event.dataTransfer.setData("application/x-molis-work-asset", JSON.stringify(asset));
      event.dataTransfer.effectAllowed = "copy";
    });
    document.addEventListener("dragend", () => { dragAsset = null; });
    shell?.addEventListener("dragover", (event) => {
      if (!elementOf(event)?.closest("[data-graph-viewport]")) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });
    shell?.addEventListener("drop", (event) => {
      const target = elementOf(event);
      if (!target?.closest("[data-graph-viewport]")) return;
      event.preventDefault();
      const asset = readTransfer(event) || dragAsset || readAsset(target);
      if (!asset) return;
      if (asset.kind === "goal") locateGoal(asset.id);
      else rejectCanvas();
    });
  }
}

/** Moving blocks and the camera, opening and closing blocks, on one frame surface (the page's or a pane copy). */
function bindSurfaceGestures(target: HTMLElement, parts: SurfaceParts) {
  const { host, route, goalOfSurface, frameOf, setCamera, persist, drawGoalFrames, locateGoal, openPicker, captureAsset, rejectGoal, routeAsset, dragAsset } = parts;
  let ignoreClick = false;
  const canvas = target.querySelector<HTMLElement>("[data-frame-canvas]");
  const world = target.querySelector<HTMLElement>("[data-frame-world]");
  if (!canvas || !world) return;
  const goalOf = () => goalOfSurface(target);
  target.querySelector("[data-frame-goal-work]")?.addEventListener("click", () => host.openGoalWork?.(target.closest<HTMLElement>("[data-tab-pane]")?.dataset.tabPane));
  target.querySelector("[data-frame-goal-locate]")?.addEventListener("click", () => locateGoal(goalOf()));
  target.querySelectorAll<HTMLElement>("[data-frame-add-content]").forEach((button) => button.addEventListener("click", () => { void openPicker(target, button); }));
  canvas.addEventListener("keydown", (event) => {
    const el = elementOf(event);
    if (!["Enter", " "].includes(event.key) || !(el instanceof HTMLElement) || !el.matches("[data-frame-block]")) return;
    event.preventDefault();
    el.click();
    world.querySelector<HTMLElement>('[data-frame-block="' + CSS.escape(el.dataset.frameBlock || "") + '"]')?.focus({ preventScroll: true });
  });
  canvas.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    canvas.classList.add("is-drop");
  });
  canvas.addEventListener("dragleave", (event) => {
    if (!(event.relatedTarget instanceof Node) || !canvas.contains(event.relatedTarget)) canvas.classList.remove("is-drop");
  });
  canvas.addEventListener("drop", (event) => {
    event.preventDefault();
    canvas.classList.remove("is-drop");
    const asset = readTransfer(event) || dragAsset();
    if (!asset) return;
    const goalId = goalOf();
    if (asset.handle) {
      if (!event.isTrusted) return;
      const accept = captureAsset(event.clientX, event.clientY, target, goalId);
      if (accept) void host.frameAssets().then(service => service.drag(asset)).then(fresh => { if (fresh) accept(fresh); }).catch(() => { /* An old source cannot add a block. */ });
      return;
    }
    if (["feed", "inbox"].includes(asset.kind)) return;
    if (asset.kind === "goal") {
      rejectGoal(canvas);
      return;
    }
    routeAsset(asset, event.clientX, event.clientY, target, goalId);
  });
  let pan: Pan | null = null;
  canvas.addEventListener("pointerdown", (event) => {
    const el = elementOf(event);
    const goalId = goalOf();
    if (event.button !== 0 || !goalId || boardTab(goalId) || !el) return;
    if (el.closest("[data-frame-add-content], [data-frame-block-close], [data-frame-block-retry], [data-frame-block-body]")) return;
    const block = el.closest<HTMLElement>("[data-frame-block]");
    const frame = frameOf(goalId);
    const moving = block ? frame.blocks.find((item) => item.id === block.dataset.frameBlock) : undefined;
    pan = { id: event.pointerId, x: event.clientX, y: event.clientY, block, goalId, origin: moving ? { x: moving.x, y: moving.y } : { x: frame.camera.x, y: frame.camera.y }, moved: false };
    event.preventDefault();
    try { (block || canvas).setPointerCapture(event.pointerId); } catch { /* A pointer that cannot be captured still moves while it stays over the canvas. */ }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pan || pan.id !== event.pointerId) return;
    const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
    if (!pan.moved && Math.hypot(dx, dy) < 5) return;
    pan.moved = true;
    const frame = frameOf(pan.goalId);
    if (pan.block) {
      const moving = pan.block;
      const block: FrameBlock | undefined = frame.blocks.find((item) => item.id === moving.dataset.frameBlock);
      if (block) {
        block.x = pan.origin.x + dx / frame.camera.z;
        block.y = pan.origin.y + dy / frame.camera.z;
        moving.style.transform = "translate(" + block.x + "px," + block.y + "px)";
      }
    } else {
      frame.camera.x = pan.origin.x + dx;
      frame.camera.y = pan.origin.y + dy;
      setCamera(target, pan.goalId);
    }
    canvas.classList.add("is-panning");
  });
  const finishPan = (event: PointerEvent) => {
    if (!pan || pan.id !== event.pointerId) return;
    const goalId = pan.goalId;
    ignoreClick = pan.moved;
    const captured = pan.block || canvas;
    pan = null;
    if (captured.hasPointerCapture?.(event.pointerId)) captured.releasePointerCapture(event.pointerId);
    canvas.classList.remove("is-panning");
    persist(goalId);
    setTimeout(() => { ignoreClick = false; }, 0);
  };
  canvas.addEventListener("pointerup", finishPan);
  canvas.addEventListener("pointercancel", finishPan);
  canvas.addEventListener("click", (event) => {
    if (ignoreClick) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const el = elementOf(event);
    if (!el) return;
    const goalId = goalOf();
    if (el.closest("[data-frame-block-close]")) {
      event.preventDefault();
      event.stopPropagation();
      frameOf(goalId).expanded = "";
      drawGoalFrames(goalId);
      persist(goalId);
      return;
    }
    const retry = el.closest("[data-frame-block-retry]");
    if (retry) {
      event.preventDefault();
      const article = retry.closest<HTMLElement>("[data-frame-block]");
      const block = frameOf(goalId).blocks.find((item) => item.id === article?.dataset.frameBlock);
      if (article && block) void fillBody(article, block, route, true);
      return;
    }
    if (el.closest("[data-frame-block-body] a, [data-frame-block-body] button, [data-feed-action], [data-inbox-action]")) return;
    const article = el.closest<HTMLElement>("[data-frame-block]");
    if (!article || !goalId || boardTab(goalId)) return;
    const frame = frameOf(goalId);
    if (frame.expanded === article.dataset.frameBlock) return;
    frame.expanded = article.dataset.frameBlock || "";
    drawGoalFrames(goalId);
    persist(goalId);
  });
  canvas.addEventListener("wheel", (event) => {
    const goalId = goalOf();
    if (!goalId || boardTab(goalId) || elementOf(event)?.closest("[data-frame-block-body]")) return;
    event.preventDefault();
    const frame = frameOf(goalId);
    if (event.ctrlKey || event.metaKey) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const next = clampZoom(frame.camera.z * Math.exp(-event.deltaY * .008));
      frame.camera.x = x - (x - frame.camera.x) * next / frame.camera.z;
      frame.camera.y = y - (y - frame.camera.y) * next / frame.camera.z;
      frame.camera.z = next;
    } else {
      frame.camera.x -= event.deltaX || (event.shiftKey ? event.deltaY : 0);
      frame.camera.y -= event.shiftKey ? 0 : event.deltaY;
    }
    setCamera(target, goalId);
    persist(goalId);
  }, { passive: false });
  target.addEventListener("click", (event) => {
    const zoom = elementOf(event)?.closest<HTMLElement>("[data-frame-zoom]");
    const goalId = goalOf();
    if (!zoom || !goalId || boardTab(goalId)) return;
    const frame = frameOf(goalId);
    frame.camera.z = clampZoom(frame.camera.z * (zoom.dataset.frameZoom === "in" ? 1.15 : .85));
    setCamera(target, goalId);
    persist(goalId);
  });
}
