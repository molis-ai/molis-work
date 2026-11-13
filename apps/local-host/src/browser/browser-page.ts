import { browserErrors } from "./errors.js";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { randomUUID } from "node:crypto";
import type { BrowserProblemCode, BrowserClientMessage, BrowserDownload, BrowserPageCapture, BrowserPageState, BrowserViewport, BrowserAssistantActivity, BrowserControlMode } from "@molis-ai/molis-work-contracts/services/browser";
import { CdpConnection, type CdpParams } from "./cdp.js";
import type { BrowserHost } from "./browser-host.js";
import { hostLog } from "../host-log.js";

export interface BrowserListener {
  state(state: BrowserPageState): void;
  frame(jpeg: Buffer): void;
  copied?(text: string): void;
}

const MAX_CAPTURE_CHARS = 20_000;
const DEFAULT_VIEWPORT: BrowserViewport = { width: 1024, height: 720, dpr: 1 };
const SEARCH_URL = "https://www.bing.com/search?q=";

function inputFailure(error: unknown, method: string): never {
  hostLog.warn("browser", "input_dispatch_failed", error, { method });
  throw browserErrors.load_failed("无法确认这次输入是否完成，请检查页面。");
}

/** What the person typed into the address bar → where to go. Only web addresses load; other schemes are refused. */
export function browserAddress(input: string): { url: string } | { blocked: string } {
  const text = input.trim();
  if (!text) return { url: "about:blank" };
  if (/^about:blank$/iu.test(text)) return { url: "about:blank" };
  if (/^https?:\/\//iu.test(text)) {
    try { return { url: new URL(text).href }; } catch { return { url: SEARCH_URL + encodeURIComponent(text) }; }
  }
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/iu.test(text) && !/^localhost:/iu.test(text)) return { blocked: text.split(":")[0]!.toLowerCase() };
  const hostLike = /^(localhost|\[[0-9a-f:]+\]|(\d{1,3}\.){3}\d{1,3}|([\p{L}\p{N}-]+\.)+[\p{L}]{2,})(:\d{1,5})?(\/\S*)?$/iu.test(text);
  if (hostLike) {
    const local = /^(localhost|127\.|\[::1\])/iu.test(text);
    try { return { url: new URL(`${local ? "http" : "https"}://${text}`).href }; } catch { /* fall through to search */ }
  }
  return { url: SEARCH_URL + encodeURIComponent(text) };
}

const originOf = (url: string): string => {
  try { const parsed = new URL(url); return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : ""; } catch { return ""; }
};

interface Layer { readonly targetId: string; readonly sessionId: string }

/** One project's page: a stack of the page and any sign-in or other windows it opened, the top one shown. */
export class BrowserPage {
  private stack: Layer[] = [];
  private starting: Promise<Layer> | null = null;
  private readonly listeners = new Map<BrowserListener, { visible: boolean }>();
  private viewport: BrowserViewport = DEFAULT_VIEWPORT;
  private url = "";
  private title = "";
  private loading = false;
  private canGoBack = false;
  private canGoForward = false;
  private status: BrowserPageState["status"] = "stopped";
  private problem: { code: BrowserProblemCode; message: string } | null = null;
  private dialog: BrowserPageState["dialog"] = null;
  private fileChooser: (BrowserPageState["file_chooser"] & { backendNodeId: number; sessionId: string }) | null = null;
  private readonly downloads = new Map<string, BrowserDownload>();
  private control: { mode: BrowserControlMode; work_id: string | null; activity: BrowserAssistantActivity | null } = { mode: "person", work_id: null, activity: null };
  private takeovers = 0;
  private screencasting: string | null = null;
  private emitQueued = false;
  private readonly unsubscribe: Array<() => void> = [];
  private connection: CdpConnection | null = null;
  /** The address to return to after the browser or the page had to be started again. */
  private resumeUrl = "";
  private navigation = 0;
  private knownSource = true;

  constructor(readonly projectId: string, private readonly host: BrowserHost) {}

  get listening(): boolean { return this.listeners.size > 0; }
  owns(targetId: string): boolean { return this.stack.some(layer => layer.targetId === targetId); }
  private get top(): Layer | undefined { return this.stack.at(-1); }

  snapshot(): BrowserPageState {
    const hostProblem = this.host.hostProblem;
    return {
      project_id: this.projectId,
      status: hostProblem && !this.stack.length ? (hostProblem.code === "browser.not_found" ? "unavailable" : "stopped") : this.status,
      url: this.url === "about:blank" ? "" : this.url,
      origin: originOf(this.url),
      title: this.title,
      secure: this.url.startsWith("https://"),
      loading: this.loading,
      can_go_back: this.canGoBack,
      can_go_forward: this.canGoForward,
      viewport: { width: this.viewport.width, height: this.viewport.height },
      popup_depth: Math.max(0, this.stack.length - 1),
      dialog: this.dialog,
      file_chooser: this.fileChooser ? { id: this.fileChooser.id, multiple: this.fileChooser.multiple } : null,
      downloads: [...this.downloads.values()].slice(-5),
      control: { ...this.control },
      problem: (this.stack.length ? null : hostProblem) ?? this.problem,
      engine: this.host.engineName,
    };
  }

  /** Receive the page's state and, while visible, its frames. Starts the browser and the page if needed. */
  attach(listener: BrowserListener, viewport: BrowserViewport): () => void {
    this.listeners.set(listener, { visible: true });
    this.viewport = clampViewport(viewport);
    listener.state(this.snapshot());
    void this.ensure().then(() => this.refreshScreencast()).catch(() => this.emit());
    return () => { this.listeners.delete(listener); void this.refreshScreencast(); };
  }

  /**
   * Hear the page's state without starting anything: the panel listens from the moment the workbench loads, so it can
   * open itself when the Assistant starts looking at or using the page.
   */
  watch(listener: BrowserListener): () => void {
    if (!this.listeners.has(listener)) this.listeners.set(listener, { visible: false });
    listener.state(this.snapshot());
    return () => { this.listeners.delete(listener); void this.refreshScreencast(); };
  }

  setVisible(listener: BrowserListener, visible: boolean): void {
    const held = this.listeners.get(listener);
    if (!held || held.visible === visible) return;
    held.visible = visible;
    void this.refreshScreencast();
  }

  /** The page exists; a retained address on restart uses the same caller fence as the requested navigation. */
  async ensure(assertCurrent?: () => void): Promise<Layer> {
    const top = await this.ensureTarget(assertCurrent);
    if (this.resumeUrl) await this.navigateTo(this.resumeUrl, assertCurrent);
    return top;
  }

  private async ensureTarget(assertCurrent?: () => void): Promise<Layer> {
    requireSynchronous(assertCurrent?.());
    let top = this.top;
    if (!top || !this.connection || this.connection.closed) {
      this.starting ??= this.start().finally(() => { this.starting = null; });
      top = await this.starting;
    }
    requireSynchronous(assertCurrent?.());
    return top;
  }

  private async start(): Promise<Layer> {
    this.status = "starting"; this.problem = null; this.emit();
    const running = await this.host.browser();
    this.connection = running.cdp;
    this.stack = [];
    for (const off of this.unsubscribe.splice(0)) off();
    const { targetId } = await running.cdp.send("Target.createTarget", { url: "about:blank" }) as { targetId: string };
    const layer = await this.attachTarget(targetId);
    this.stack = [layer]; this.navigation++; this.knownSource = !this.resumeUrl;
    this.status = "ready";
    this.listenTo(running.cdp);
    this.emit();
    return layer;
  }

  private async attachTarget(targetId: string): Promise<Layer> {
    const cdp = this.connection!;
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true }) as { sessionId: string };
    await Promise.all([
      cdp.send("Page.enable", {}, sessionId),
      cdp.send("Runtime.enable", {}, sessionId),
      cdp.send("Inspector.enable", {}, sessionId).catch(() => undefined),
      cdp.send("Page.setInterceptFileChooserDialog", { enabled: true }, sessionId).catch(() => undefined),
      cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }, sessionId).catch(() => undefined),
      this.applyViewport(sessionId),
      this.blockHostOrigins(sessionId),
    ]);
    return { targetId, sessionId };
  }

  /**
   * The local Host's own pages never load here: every request to them is paused before it leaves and failed as blocked
   * (Fetch interception; the Network block list does not stop a top-level navigation in current Chrome).
   */
  private async blockHostOrigins(sessionId: string): Promise<void> {
    const origins = this.host.forbiddenOrigins();
    if (!origins.length) return;
    await this.connection!.send("Fetch.enable", { patterns: origins.map(origin => ({ urlPattern: `${origin}/*`, requestStage: "Request" })) }, sessionId);
  }

  private listenTo(cdp: CdpConnection): void {
    const mine = (sessionId: string | undefined) => !!sessionId && this.stack.some(layer => layer.sessionId === sessionId);
    const isTop = (sessionId: string | undefined) => !!sessionId && this.top?.sessionId === sessionId;
    this.unsubscribe.push(
      cdp.on("Page.screencastFrame", (params, sessionId) => {
        if (!isTop(sessionId)) return;
        void cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }, sessionId).catch(() => undefined);
        const jpeg = Buffer.from(String(params.data), "base64");
        for (const [listener, held] of this.listeners) if (held.visible) listener.frame(jpeg);
      }),
      cdp.on("Page.frameStartedLoading", (params, sessionId) => { if (isTop(sessionId) && params.frameId === this.top?.targetId) { this.loading = true; this.emit(); } }),
      cdp.on("Page.frameStoppedLoading", (params, sessionId) => { if (isTop(sessionId) && params.frameId === this.top?.targetId) { this.loading = false; void this.readHistory(); } }),
      cdp.on("Page.frameNavigated", (params, sessionId) => {
        const frame = params.frame as { id: string; parentId?: string; url: string; urlFragment?: string; unreachableUrl?: string };
        if (!isTop(sessionId) || frame.parentId) return;
        this.navigation++;
        this.knownSource = true;
        // Chrome commits its own error page for an address that could not load: the address stays what was asked for.
        this.url = frame.unreachableUrl ?? frame.url + (frame.urlFragment ?? "");
        this.problem = frame.unreachableUrl ? { code: "browser.load_failed", message: this.host.forbiddenOrigins().includes(originOf(frame.unreachableUrl))
          ? "这个地址不能在侧栏浏览器里打开（它是本机的 Molis Work 服务）。" : "页面没有打开，请检查地址或网络后刷新重试。" } : null;
        this.dialog = null; this.fileChooser = null;
        void this.readHistory();
      }),
      cdp.on("Page.navigatedWithinDocument", (params, sessionId) => { if (isTop(sessionId) && params.frameId === this.top?.targetId) { this.url = String(params.url); void this.readHistory(); } }),
      cdp.on("Page.javascriptDialogOpening", (params, sessionId) => {
        if (!isTop(sessionId)) return;
        this.dialog = { id: randomUUID(), type: params.type as BrowserDialogType, message: String(params.message ?? "").slice(0, 2000), default_prompt: String(params.defaultPrompt ?? "") };
        this.emit();
      }),
      cdp.on("Page.javascriptDialogClosed", (_params, sessionId) => { if (isTop(sessionId)) { this.dialog = null; this.emit(); } }),
      cdp.on("Page.fileChooserOpened", (params, sessionId) => {
        if (!mine(sessionId) || typeof params.backendNodeId !== "number") return;
        this.fileChooser = { id: randomUUID(), multiple: params.mode === "selectMultiple", backendNodeId: params.backendNodeId, sessionId: sessionId! };
        this.emit();
      }),
      cdp.on("Fetch.requestPaused", (params, sessionId) => {
        if (!mine(sessionId)) return;
        void cdp.send("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" }, sessionId).catch(() => undefined);
      }),
      cdp.on("Inspector.targetCrashed", (_params, sessionId) => {
        const layer = this.stack.find(entry => entry.sessionId === sessionId);
        if (layer) this.targetGone(layer.targetId, true);
      }),
    );
  }

  /** The browser process came or went; the page shows the host's problem until it is started again. */
  hostChanged(): void {
    if (this.connection?.closed) {
      if (this.url && this.url !== "about:blank") this.resumeUrl = this.url;
      this.stack = []; this.connection = null; this.screencasting = null; this.loading = false;
      this.status = "stopped";
    }
    this.emit();
  }

  targetInfo(info: { targetId: string; url: string; title: string }): void {
    if (info.targetId !== this.top?.targetId) return;
    this.title = info.title && info.title !== info.url ? info.title : "";
    if (info.url) { if (this.url !== info.url) this.navigation++; this.url = info.url; this.knownSource = true; }
    this.emit();
  }

  targetGone(targetId: string, crashed: boolean): void {
    const at = this.stack.findIndex(layer => layer.targetId === targetId);
    if (at < 0) return;
    this.navigation++; this.knownSource = false;
    if (at === 0) {
      if (this.url && this.url !== "about:blank") this.resumeUrl = this.url;
      this.stack = []; this.screencasting = null; this.loading = false;
      this.status = crashed ? "crashed" : "stopped";
      this.problem = crashed ? { code: "browser.page_crashed", message: "这个页面崩溃了。重新加载会回到原来的地址。" } : null;
      this.emit();
      return;
    }
    // A sign-in or other window the page opened has closed: show the page below it again.
    this.stack.splice(at, 1); this.url = ""; this.title = "";
    this.dialog = null; this.fileChooser = null;
    void this.refreshTop();
  }

  async adoptPopup(targetId: string): Promise<void> {
    const connection = this.connection, parent = this.top, generation = this.navigation;
    if (this.owns(targetId) || !connection) return;
    const current = () => this.connection === connection && this.top === parent && this.navigation === generation;
    const layer = await this.attachTarget(targetId).catch(() => null);
    if (!layer) return;
    const detach = () => connection.send("Target.detachFromTarget", { sessionId: layer.sessionId }).catch(() => undefined);
    if (!current()) { await detach(); return; }
    await this.stopScreencast();
    if (!current()) { await detach(); return; }
    this.stack.push(layer); this.navigation++; this.knownSource = false;
    this.url = ""; this.title = ""; this.dialog = null; this.fileChooser = null; this.emit();
    await this.refreshTop();
  }

  private async refreshTop(): Promise<void> {
    const top = this.top, connection = this.connection, generation = this.navigation;
    if (!top || !connection) return;
    const current = () => this.connection === connection && this.top === top && this.navigation === generation;
    const info = await connection.send("Target.getTargetInfo", { targetId: top.targetId }).catch(() => null) as { targetInfo?: { url: string; title: string } } | null;
    if (!current() || !info?.targetInfo?.url) return;
    this.url = info.targetInfo.url; this.knownSource = true;
    this.title = info.targetInfo.title && info.targetInfo.title !== info.targetInfo.url ? info.targetInfo.title : "";
    await this.applyViewport(top.sessionId).catch(() => undefined);
    if (!current()) return;
    await this.readHistory();
    if (current()) await this.refreshScreencast();
  }

  private async readHistory(): Promise<void> {
    const top = this.top, connection = this.connection, generation = this.navigation;
    if (top && connection) {
      const history = await connection.send("Page.getNavigationHistory", {}, top.sessionId).catch(() => null) as { currentIndex: number; entries: Array<{ url: string; title: string }> } | null;
      if (this.top !== top || this.connection !== connection || this.navigation !== generation) return;
      if (history) {
        this.canGoBack = history.currentIndex > 0; this.canGoForward = history.currentIndex < history.entries.length - 1;
        // The title as the page settled: Chrome names a loading page after its host and does not always say when the real
        // title arrives, while the history entry has it.
        const entry = history.entries[history.currentIndex];
        if (entry) this.title = entry.title && entry.title !== entry.url && !entry.url.endsWith(`//${entry.title}/`) ? entry.title : this.title;
      }
    }
    this.emit();
  }

  private async refreshScreencast(): Promise<void> {
    const top = this.top;
    const wanted = !!top && [...this.listeners.values()].some(held => held.visible);
    if (!wanted) { await this.stopScreencast(); return; }
    const key = `${top!.sessionId}:${this.viewport.width}x${this.viewport.height}@${this.viewport.dpr}`;
    if (this.screencasting === key) return;
    await this.stopScreencast();
    this.screencasting = key;
    await this.connection!.send("Page.startScreencast", {
      format: "jpeg", quality: 78, everyNthFrame: 1,
      maxWidth: Math.round(this.viewport.width * this.viewport.dpr), maxHeight: Math.round(this.viewport.height * this.viewport.dpr),
    }, top!.sessionId).catch(() => { this.screencasting = null; });
  }

  private async stopScreencast(): Promise<void> {
    if (!this.screencasting || !this.connection) { this.screencasting = null; return; }
    const sessionId = this.screencasting.split(":")[0]!;
    this.screencasting = null;
    await this.connection.send("Page.stopScreencast", {}, sessionId).catch(() => undefined);
  }

  private async applyViewport(sessionId: string): Promise<void> {
    await this.connection!.send("Emulation.setDeviceMetricsOverride", {
      width: this.viewport.width, height: this.viewport.height, deviceScaleFactor: this.viewport.dpr, mobile: false,
    }, sessionId);
  }

  async resize(viewport: BrowserViewport): Promise<void> {
    this.viewport = clampViewport(viewport);
    const top = this.top;
    if (top && this.connection) { await this.applyViewport(top.sessionId).catch(() => undefined); await this.refreshScreencast(); }
    this.emit();
  }

  /** Go where the person or Assistant asked; an original caller fence is checked after startup and before changing the destination. */
  async navigate(input: string, assertCurrent?: () => void, onDispatch?: () => void, afterResponse?: () => void): Promise<{ errorText?: string } | void> {
    requireSynchronous(assertCurrent?.());
    const address = browserAddress(input);
    if ("blocked" in address) {
      this.problem = { code: "browser.blocked_scheme", message: `侧栏浏览器只打开网页地址，不打开「${address.blocked}:」这类地址。` };
      this.emit();
      return;
    }
    await this.ensureTarget(assertCurrent);
    return this.navigateTo(address.url, assertCurrent, onDispatch, afterResponse);
  }

  private async navigateTo(url: string, assertCurrent?: () => void, onDispatch?: () => void, afterResponse?: () => void): Promise<{ errorText?: string }> {
    requireSynchronous(assertCurrent?.());
    const top = this.top!, connection = this.connection!;
    let navigation = this.navigation, sent = false;
    const result = await connection.send("Page.navigate", { url }, top.sessionId, undefined, () => {
      requireSynchronous(assertCurrent?.());
      if (this.top !== top || this.connection !== connection) throw browserErrors.load_failed("原页面已不可用");
      requireSynchronous(onDispatch?.());
      navigation = ++this.navigation; sent = true;
      this.problem = null; this.resumeUrl = ""; this.loading = true; this.url = url; this.emit();
    }).catch(error => { if (!sent || assertCurrent) throw error; return { errorText: error instanceof Error ? error.message : String(error) }; }) as { errorText?: string };
    if (result.errorText && this.connection === connection && this.top === top && this.navigation === navigation) {
      try { requireSynchronous(afterResponse?.()); } catch { return result; /* Known CDP refusal stays known; stale callers cannot update the page. */ }
      this.loading = false;
      this.problem = { code: "browser.load_failed", message: loadFailure(result.errorText) };
      this.emit();
    }
    return result;
  }

  async history(delta: -1 | 1): Promise<void> {
    const top = await this.ensure();
    const history = await this.connection!.send("Page.getNavigationHistory", {}, top.sessionId) as { currentIndex: number; entries: Array<{ id: number }> };
    const entry = history.entries[history.currentIndex + delta];
    if (entry) { this.navigation++; await this.connection!.send("Page.navigateToHistoryEntry", { entryId: entry.id }, top.sessionId); }
  }

  async reload(): Promise<void> {
    if (!this.top) { await this.ensure(); return; }
    this.navigation++; this.problem = null;
    await this.connection!.send("Page.reload", {}, this.top.sessionId);
  }

  async stop(): Promise<void> { if (this.top) await this.connection!.send("Page.stopLoading", {}, this.top.sessionId).catch(() => undefined); }

  async closePopup(): Promise<void> {
    if (this.stack.length < 2) return;
    await this.connection!.send("Target.closeTarget", { targetId: this.top!.targetId }).catch(() => undefined);
  }

  /** The person's input. While the assistant drives the page, the socket first turns it into a takeover (spec D09). */
  async input(message: Extract<BrowserClientMessage, { type: "mouse" | "key" | "text" | "compose" }>): Promise<void> {
    const top = this.top;
    if (!top || !this.connection) return;
    const send = (method: string, params: CdpParams) => this.connection!.send(method, params, top.sessionId).catch((error: unknown) => inputFailure(error, method));
    if (message.type === "mouse") {
      const type = { down: "mousePressed", up: "mouseReleased", move: "mouseMoved", wheel: "mouseWheel" }[message.event];
      await send("Input.dispatchMouseEvent", {
        type, x: message.x, y: message.y, button: message.button, buttons: message.buttons, clickCount: message.click_count,
        modifiers: message.modifiers, ...(message.event === "wheel" ? { deltaX: message.delta_x ?? 0, deltaY: message.delta_y ?? 0 } : {}),
      });
      return;
    }
    if (message.type === "key") {
      const commands = editingCommands(message);
      const text = message.event === "down" && message.text && !(message.modifiers & (2 | 4)) ? message.text : undefined;
      await send("Input.dispatchKeyEvent", {
        type: message.event === "up" ? "keyUp" : text ? "keyDown" : "rawKeyDown",
        key: message.key, code: message.code, windowsVirtualKeyCode: message.key_code, nativeVirtualKeyCode: message.key_code,
        modifiers: message.modifiers, ...(text ? { text, unmodifiedText: text } : {}), ...(commands.length ? { commands } : {}),
      });
      return;
    }
    if (message.type === "text") { await send("Input.insertText", { text: message.text }); return; }
    await send("Input.imeSetComposition", { text: message.text, selectionStart: message.text.length, selectionEnd: message.text.length });
  }

  /** The page's selected text, for the person's own clipboard. */
  async selectedText(): Promise<string> {
    const value = await this.evaluate("String(getSelection?.() ?? '')");
    return typeof value === "string" ? value.slice(0, 200_000) : "";
  }

  async answerDialog(id: string, accept: boolean, promptText?: string): Promise<void> {
    if (!this.dialog || this.dialog.id !== id || !this.top) return;
    this.dialog = null; this.emit();
    await this.connection!.send("Page.handleJavaScriptDialog", { accept, ...(promptText !== undefined ? { promptText } : {}) }, this.top.sessionId).catch(() => undefined);
  }

  /** The caller fence runs before consuming the chooser or handing files to CDP; rejection leaves the chooser available. */
  async chooseFiles(id: string, files: readonly string[], assertCurrent?: () => void, onDispatch?: () => void): Promise<void> {
    const chooser = this.fileChooser, connection = this.connection;
    if (!chooser || chooser.id !== id || !connection) throw browserErrors.load_failed("页面已经不再等待选择文件");
    await connection.send("DOM.setFileInputFiles", { files: [...files], backendNodeId: chooser.backendNodeId }, chooser.sessionId, undefined, () => {
      requireSynchronous(assertCurrent?.());
      if (this.fileChooser !== chooser || this.connection !== connection || (assertCurrent && this.top?.sessionId !== chooser.sessionId)) throw browserErrors.load_failed("原页面已经不再等待选择文件");
      requireSynchronous(onDispatch?.());
      this.fileChooser = null; this.emit();
    });
  }

  cancelFileChooser(id: string): void { if (this.fileChooser?.id === id) { this.fileChooser = null; this.emit(); } }

  downloadBegan(params: CdpParams): void {
    if (!this.stack.some(layer => layer.targetId === params.frameId)) return;
    this.downloads.set(String(params.guid), { id: String(params.guid), filename: safeFilename(String(params.suggestedFilename ?? "download")), state: "in-progress", received_bytes: 0, total_bytes: 0 });
    this.emit();
  }

  downloadProgressed(params: CdpParams): void {
    const held = this.downloads.get(String(params.guid));
    if (!held) return;
    this.downloads.set(held.id, { ...held, state: params.state as BrowserDownload["state"], received_bytes: Number(params.receivedBytes ?? 0), total_bytes: Number(params.totalBytes ?? 0) });
    this.emit();
  }

  download(id: string): BrowserDownload | undefined { return this.downloads.get(id); }

  /** What 交给助理 takes: the selection if there is one, otherwise the page's main readable text. */
  async capture(assertCurrent?: () => void): Promise<BrowserPageCapture> {
    const value = await this.evaluate(`(() => {
      const selected = String(getSelection?.() ?? '').trim();
      const root = document.querySelector('main, article, [role=main]') || document.body;
      const text = selected || (root ? root.innerText : '');
      return JSON.stringify({ selection: !!selected, text, title: document.title });
    })()`, assertCurrent);
    requireSynchronous(assertCurrent?.());
    const parsed = typeof value === "string" ? JSON.parse(value) as { selection: boolean; text: string; title: string } : { selection: false, text: "", title: "" };
    const text = parsed.text.replace(/\n{3,}/gu, "\n\n").trim();
    return {
      url: this.url, origin: originOf(this.url), title: parsed.title || this.title, captured_at: new Date().toISOString(),
      selection: parsed.selection, text: text.slice(0, MAX_CAPTURE_CHARS), truncated: text.length > MAX_CAPTURE_CHARS,
    };
  }

  /** Evaluate an expression in the shown page; the value must be JSON-serializable. */
  async evaluate(expression: string, assertCurrent?: () => void): Promise<unknown> {
    const session = await this.session(assertCurrent);
    const current = () => { requireSynchronous(assertCurrent?.()); session.assertCurrent(); };
    const result = await session.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, current) as { result?: { value?: unknown }; exceptionDetails?: unknown };
    current();
    if (result.exceptionDetails) throw browserErrors.load_failed("页面脚本出错");
    return result.result?.value;
  }

  /** The raw CDP session of the shown page, for the assistant's driver in this package. */
  async session(assertCurrent?: () => void): Promise<{ send(method: string, params?: CdpParams, beforeSend?: () => void): Promise<Record<string, unknown>>; targetId: string; assertCurrent(): void }> {
    const top = await this.ensureTarget(assertCurrent);
    const connection = this.connection!;
    const generation = this.navigation;
    const current = () => { if (this.connection !== connection || this.top !== top || this.navigation !== generation || !this.knownSource) throw browserErrors.load_failed("原页面文档已不可用"); };
    requireSynchronous(assertCurrent?.()); current();
    return { targetId: top.targetId, assertCurrent: current, send: (method, params = {}, beforeSend) => connection.send(method, params, top.sessionId, undefined, beforeSend) };
  }

  setControl(control: { mode: BrowserControlMode; work_id: string | null; activity: BrowserAssistantActivity | null }): void {
    if (control.mode === "taken-over" && this.control.mode !== "taken-over") this.takeovers += 1;
    this.control = control; this.emit();
  }

  get controlMode(): BrowserControlMode { return this.control.mode; }
  get documentGeneration(): number { return this.navigation; }
  get sourceKnown(): boolean { return this.knownSource; }

  /** The page's device pixel ratio as the viewer's screen set it. */
  get pixelRatio(): number { return this.viewport.dpr; }

  /**
   * How many times the person has taken the page over. Part of what the Assistant saw: anything it looked at before
   * the person reached in describes a page that may have changed under its hands, so it is not acted on afterwards.
   */
  get takeoverCount(): number { return this.takeovers; }

  copyTo(listener: BrowserListener, text: string): void { listener.copied?.(text); }

  emit(): void {
    if (this.emitQueued) return;
    this.emitQueued = true;
    queueMicrotask(() => {
      this.emitQueued = false;
      const state = this.snapshot();
      for (const listener of this.listeners.keys()) listener.state(state);
    });
  }
}

type BrowserDialogType = "alert" | "confirm" | "prompt" | "beforeunload";

function clampViewport(viewport: BrowserViewport): BrowserViewport {
  const width = Math.round(Math.min(Math.max(Number(viewport.width) || DEFAULT_VIEWPORT.width, 240), 3840));
  const height = Math.round(Math.min(Math.max(Number(viewport.height) || DEFAULT_VIEWPORT.height, 200), 2400));
  const dpr = Math.min(Math.max(Number(viewport.dpr) || 1, 1), 2);
  return { width, height, dpr };
}

/** macOS editing shortcuts a headless page does not map on its own. */
function editingCommands(message: Extract<BrowserClientMessage, { type: "key" }>): string[] {
  return message.event === "down" ? shortcutCommands(message.code, message.modifiers, 4) : [];
}

/**
 * The editing commands for a shortcut pressed with any modifier in `commandMask` (4 = Command, 2 = Control). On macOS
 * a page reached through CDP maps none of them by itself, so they travel as explicit commands.
 */
export function shortcutCommands(code: string, modifiers: number, commandMask: number): string[] {
  if (!(modifiers & commandMask)) return [];
  const shift = !!(modifiers & 8);
  switch (code) {
    case "KeyA": return ["selectAll"];
    case "KeyZ": return [shift ? "redo" : "undo"];
    case "KeyX": return ["cut"];
    case "KeyC": return ["copy"];
    case "ArrowLeft": return [shift ? "moveToBeginningOfLineAndModifySelection" : "moveToBeginningOfLine"];
    case "ArrowRight": return [shift ? "moveToEndOfLineAndModifySelection" : "moveToEndOfLine"];
    case "Backspace": return ["deleteToBeginningOfLine"];
    default: return [];
  }
}

function loadFailure(errorText: string): string {
  if (/NAME_NOT_RESOLVED/u.test(errorText)) return "找不到这个网站，请检查地址是否写对。";
  if (/INTERNET_DISCONNECTED|NETWORK_CHANGED/u.test(errorText)) return "网络连接断开了，恢复后刷新即可。";
  if (/CONNECTION_REFUSED/u.test(errorText)) return "这个网站拒绝了连接，可能暂时不可用。";
  if (/TIMED_OUT/u.test(errorText)) return "网站响应太慢，打开超时了。可以稍后刷新。";
  if (/CERT|SSL/u.test(errorText)) return "这个网站的安全证书有问题，已停止打开。";
  if (/BLOCKED_BY_CLIENT/u.test(errorText)) return "这个地址不能在侧栏浏览器里打开。";
  if (/ABORTED/u.test(errorText)) return "打开被中断了。";
  return `页面没有打开（${errorText}）。可以刷新重试。`;
}

/** A download's file name: what the file system forbids is replaced, and a name over 200 UTF-16 units is cut in whole characters,
 * keeping its extension (a cut between the halves of a character would leave a lone half, which a header cannot carry). */
export function safeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_");
  const extension = /\.([A-Za-z0-9]{1,10})$/u.exec(cleaned)?.[0] ?? "";
  const room = 200 - extension.length;
  const base = cleaned.slice(0, cleaned.length - extension.length);
  const kept = cutHead(base, room);
  return kept + extension || "download";
}
