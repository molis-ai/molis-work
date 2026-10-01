import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  BrowserClientMessage, BrowserDownload, BrowserPageCapture, BrowserPageState, BrowserProblemCode, BrowserViewport,
  BrowserAssistantActivity, BrowserControlMode,
} from "@molis-ai/molis-work-contracts/services/browser";
import { CdpConnection, type CdpParams } from "./cdp.js";
import { locateBrowser, type LocatedBrowser } from "./locate.js";

/**
 * The side panel's browser (specs/archive/side-panel D03/D04): one Chrome-family process per Home, started on first use with
 * its own profile under the Home, and one page per project. The person sees each page through its screencast and
 * drives it through CDP input; the assistant's driver (specs/archive/side-panel P5) acts on the same page, so what it does is
 * what the person watches.
 */
export interface BrowserHostOptions {
  readonly homeDirectory: string;
  readonly locate?: () => LocatedBrowser | null;
  /** Origins the pages may never load: the local Host itself serves its control token to whoever loads it. */
  readonly forbiddenOrigins?: () => readonly string[];
  readonly launchTimeoutMs?: number;
}

export interface BrowserListener {
  state(state: BrowserPageState): void;
  frame(jpeg: Buffer): void;
  copied?(text: string): void;
}

interface Running {
  readonly child: ChildProcess;
  readonly cdp: CdpConnection;
  readonly engine: string;
  readonly downloads: string;
}

const MAX_CAPTURE_CHARS = 20_000;
const DEFAULT_VIEWPORT: BrowserViewport = { width: 1024, height: 720, dpr: 1 };
const SEARCH_URL = "https://www.bing.com/search?q=";

export class BrowserError extends Error {
  constructor(readonly code: BrowserProblemCode, message: string) { super(message); this.name = "BrowserError"; }
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

export class BrowserHost {
  private running: Promise<Running> | null = null;
  private current: Running | null = null;
  private readonly pages = new Map<string, BrowserPage>();
  private readonly profile: string;
  private readonly downloadDir: string;
  private readonly uploadDir: string;
  private engine: string | null = null;
  private problem: { code: BrowserProblemCode; message: string } | null = null;
  private closed = false;

  constructor(private readonly options: BrowserHostOptions) {
    const root = path.join(options.homeDirectory, "browser");
    this.profile = path.join(root, "profile");
    this.downloadDir = path.join(root, "downloads");
    this.uploadDir = path.join(root, "uploads");
  }

  /** The page for a project, created on first use. Nothing starts until a page is attached or driven. */
  page(projectId: string): BrowserPage {
    let page = this.pages.get(projectId);
    if (!page) this.pages.set(projectId, page = new BrowserPage(projectId, this));
    return page;
  }

  existingPage(projectId: string): BrowserPage | undefined { return this.pages.get(projectId); }

  get engineName(): string | null { return this.engine; }
  get hostProblem(): { code: BrowserProblemCode; message: string } | null { return this.problem; }
  get uploadsRoot(): string { return this.uploadDir; }
  downloadPath(guid: string): string { return path.join(this.downloadDir, guid); }

  /** The running browser, started if needed. Failures become the page's problem, in the person's words. */
  async browser(): Promise<Running> {
    if (this.closed) throw new BrowserError("browser.start_failed", "浏览器服务已经关闭");
    if (this.current && !this.current.cdp.closed) return this.current;
    this.running ??= this.launch().then(running => {
      this.current = running; this.problem = null;
      return running;
    }, error => {
      this.running = null;
      this.problem = error instanceof BrowserError ? { code: error.code, message: error.message } : { code: "browser.start_failed", message: "浏览器没有启动起来，请重试" };
      for (const page of this.pages.values()) page.hostChanged();
      throw error;
    });
    return this.running;
  }

  async restart(): Promise<void> {
    await this.stopProcess();
    this.problem = null;
    for (const page of this.pages.values()) page.hostChanged();
    await Promise.all([...this.pages.values()].filter(page => page.listening).map(page => page.ensure().catch(() => undefined)));
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.stopProcess();
  }

  forbiddenOrigins(): readonly string[] { return this.options.forbiddenOrigins?.() ?? []; }

  private async stopProcess(): Promise<void> {
    const running = this.current ?? await this.running?.catch(() => null) ?? null;
    this.running = null; this.current = null;
    if (!running) return;
    // Asked to quit, the browser first writes its cookies and site data (so sign-ins last); a signal can cut that short.
    await Promise.race([running.cdp.send("Browser.close").catch(() => undefined), delay(1_000)]);
    running.cdp.close();
    await terminate(running.child, 5_000);
  }

  private async launch(): Promise<Running> {
    const located = (this.options.locate ?? locateBrowser)();
    if (!located) throw new BrowserError("browser.not_found", "没有找到可用的浏览器。请安装 Google Chrome（或 Chromium、Microsoft Edge），然后重试。");
    this.engine = located.name;
    for (const dir of [this.profile, this.downloadDir, this.uploadDir]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    await this.stopLeftover();
    const child = spawn(located.path, [
      `--user-data-dir=${this.profile}`,
      "--remote-debugging-port=0",
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      // macOS would otherwise ask for the login keychain; this profile keeps its own, separate from the person's browser.
      "--use-mock-keychain",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=Translate,MediaRouter",
      "--window-size=1280,800",
      // Headless screencast frames follow the process's scale, not the emulated one: without this a Retina panel gets
      // 1x frames stretched to 2x. Each page still reports the viewer's own ratio (setDeviceMetricsOverride).
      "--force-device-scale-factor=2",
      "about:blank",
    ], { stdio: ["ignore", "ignore", "pipe"] });
    fs.writeFileSync(this.pidFile, String(child.pid ?? ""), { mode: 0o600 });
    const endpoint = await new Promise<string>((resolve, reject) => {
      let log = "";
      const timer = setTimeout(() => fail(new BrowserError("browser.start_failed", "浏览器启动超时，请重试")), this.options.launchTimeoutMs ?? 20_000);
      const fail = (error: Error) => { clearTimeout(timer); child.kill("SIGKILL"); reject(error); };
      child.stderr!.setEncoding("utf8");
      child.stderr!.on("data", (chunk: string) => {
        log = (log + chunk).slice(-8000);
        const match = /DevTools listening on (ws:\/\/\S+)/u.exec(log);
        if (match) { clearTimeout(timer); resolve(match[1]!); }
      });
      child.once("error", () => fail(new BrowserError("browser.start_failed", `${located.name} 没有启动起来`)));
      child.once("exit", () => fail(/profile|SingletonLock|in use/iu.test(log)
        ? new BrowserError("browser.profile_in_use", "浏览器资料正被另一个进程使用。请关闭另一个 Molis Work 窗口后重试。")
        : new BrowserError("browser.start_failed", `${located.name} 启动后立刻退出了`)));
    });
    const cdp = await CdpConnection.open(endpoint);
    const running: Running = { child, cdp, engine: located.name, downloads: this.downloadDir };
    child.stderr!.removeAllListeners("data");
    child.stderr!.resume();
    child.once("exit", () => {
      if (this.current !== running) return;
      this.current = null; this.running = null;
      this.problem = this.closed ? null : { code: "browser.crashed", message: "浏览器意外停止了。可以重新启动，页面会回到原来的地址。" };
      for (const page of this.pages.values()) page.hostChanged();
    });
    cdp.onClose(() => { if (this.current === running) child.kill("SIGTERM"); });
    await cdp.send("Target.setDiscoverTargets", { discover: true });
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: this.downloadDir, eventsEnabled: true });
    cdp.on("Target.targetInfoChanged", params => this.route(params, (page, info) => page.targetInfo(info)));
    cdp.on("Target.targetCreated", params => {
      const info = params.targetInfo as { targetId: string; type: string; openerId?: string };
      if (info.type !== "page" || !info.openerId) return;
      for (const page of this.pages.values()) if (page.owns(info.openerId)) void page.adoptPopup(info.targetId);
    });
    cdp.on("Target.targetDestroyed", params => { for (const page of this.pages.values()) page.targetGone(String(params.targetId), false); });
    cdp.on("Target.targetCrashed", params => { for (const page of this.pages.values()) page.targetGone(String(params.targetId), true); });
    cdp.on("Browser.downloadWillBegin", params => { for (const page of this.pages.values()) page.downloadBegan(params); });
    cdp.on("Browser.downloadProgress", params => { for (const page of this.pages.values()) page.downloadProgressed(params); });
    return running;
  }

  private get pidFile(): string { return path.join(path.dirname(this.profile), "browser.pid"); }

  /** A browser left from an earlier Host that did not shut down holds the profile; stop it if it is really ours. */
  private async stopLeftover(): Promise<void> {
    if (process.platform === "win32") return;
    let pid = 0;
    try { pid = Number(fs.readFileSync(this.pidFile, "utf8")); } catch { return; }
    if (!Number.isInteger(pid) || pid <= 1) return;
    try {
      const command = execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
      if (!command.includes(`--user-data-dir=${this.profile}`)) return;
    } catch { return; /* not running */ }
    // It still holds the person's recent sign-ins in memory: ask it to quit through its own DevTools endpoint, so it
    // writes them, and start the next one only once it is gone (two browsers on one profile lose data).
    try {
      const [port, target] = fs.readFileSync(path.join(this.profile, "DevToolsActivePort"), "utf8").split("\n");
      const cdp = await CdpConnection.open(`ws://127.0.0.1:${Number(port)}${String(target ?? "").trim()}`);
      await Promise.race([cdp.send("Browser.close").catch(() => undefined), delay(1_000)]);
      cdp.close();
    } catch { /* fall back to signals */ }
    if (await exited(pid, 5_000)) return;
    try { process.kill(pid, "SIGTERM"); } catch { return; }
    if (await exited(pid, 3_000)) return;
    try { process.kill(pid, "SIGKILL"); } catch { /* gone */ }
    await exited(pid, 1_000);
  }

  private route(params: CdpParams, apply: (page: BrowserPage, info: { targetId: string; url: string; title: string }) => void): void {
    const info = params.targetInfo as { targetId: string; url: string; title: string; type: string } | undefined;
    if (!info || info.type !== "page") return;
    for (const page of this.pages.values()) if (page.owns(info.targetId)) apply(page, info);
  }
}

/** Waits `graceMs` for a browser already asked to quit, then signals it: SIGTERM, and SIGKILL after 3 s. */
async function terminate(child: ChildProcess, graceMs = 0): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const gone = new Promise<void>(resolve => child.once("exit", () => resolve()));
  if (graceMs > 0 && await Promise.race([gone.then(() => true), delay(graceMs).then(() => false)])) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 3_000);
  await gone;
  clearTimeout(timer);
}

const delay = (ms: number) => new Promise<void>(resolve => { const timer = setTimeout(resolve, ms); timer.unref?.(); });

/** Whether a process that is not our child has gone within `ms`. */
async function exited(pid: number, ms: number): Promise<boolean> {
  for (const until = Date.now() + ms; ;) {
    try { process.kill(pid, 0); } catch { return true; }
    if (Date.now() > until) return false;
    await delay(100);
  }
}

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

  /** The page exists and is shown; the browser is started first if it is not running. */
  async ensure(): Promise<Layer> {
    const top = this.top;
    if (top && this.connection && !this.connection.closed) return top;
    this.starting ??= this.start().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async start(): Promise<Layer> {
    this.status = "starting"; this.problem = null; this.emit();
    const running = await this.host.browser();
    this.connection = running.cdp;
    this.stack = [];
    for (const off of this.unsubscribe.splice(0)) off();
    const { targetId } = await running.cdp.send("Target.createTarget", { url: "about:blank" }) as { targetId: string };
    const layer = await this.attachTarget(targetId);
    this.stack = [layer];
    this.status = "ready";
    this.listenTo(running.cdp);
    if (this.resumeUrl) await this.navigateTo(this.resumeUrl);
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
        // Chrome commits its own error page for an address that could not load: the address stays what was asked for.
        this.url = frame.unreachableUrl ?? frame.url + (frame.urlFragment ?? "");
        this.problem = frame.unreachableUrl ? { code: "page.load_failed", message: this.host.forbiddenOrigins().includes(originOf(frame.unreachableUrl))
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
    if (info.url) this.url = info.url;
    this.emit();
  }

  targetGone(targetId: string, crashed: boolean): void {
    const at = this.stack.findIndex(layer => layer.targetId === targetId);
    if (at < 0) return;
    if (at === 0) {
      if (this.url && this.url !== "about:blank") this.resumeUrl = this.url;
      this.stack = []; this.screencasting = null; this.loading = false;
      this.status = crashed ? "crashed" : "stopped";
      this.problem = crashed ? { code: "page.crashed", message: "这个页面崩溃了。重新加载会回到原来的地址。" } : null;
      this.emit();
      return;
    }
    // A sign-in or other window the page opened has closed: show the page below it again.
    this.stack.splice(at, 1);
    this.dialog = null; this.fileChooser = null;
    void this.refreshTop();
  }

  async adoptPopup(targetId: string): Promise<void> {
    if (this.owns(targetId) || !this.connection) return;
    const layer = await this.attachTarget(targetId).catch(() => null);
    if (!layer) return;
    await this.stopScreencast();
    this.stack.push(layer);
    await this.refreshTop();
  }

  private async refreshTop(): Promise<void> {
    const top = this.top;
    if (!top || !this.connection) return;
    const info = await this.connection.send("Target.getTargetInfo", { targetId: top.targetId }).catch(() => null) as { targetInfo?: { url: string; title: string } } | null;
    this.url = info?.targetInfo?.url ?? this.url;
    this.title = info?.targetInfo?.title && info.targetInfo.title !== info.targetInfo.url ? info.targetInfo.title : "";
    await this.applyViewport(top.sessionId).catch(() => undefined);
    await this.readHistory();
    await this.refreshScreencast();
  }

  private async readHistory(): Promise<void> {
    const top = this.top;
    if (top && this.connection) {
      const history = await this.connection.send("Page.getNavigationHistory", {}, top.sessionId).catch(() => null) as { currentIndex: number; entries: Array<{ url: string; title: string }> } | null;
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

  /** Go where the person (or the assistant's `navigate`) asked; other schemes than web addresses are refused. */
  async navigate(input: string): Promise<void> {
    const address = browserAddress(input);
    if ("blocked" in address) {
      this.problem = { code: "page.blocked_scheme", message: `侧栏浏览器只打开网页地址，不打开「${address.blocked}:」这类地址。` };
      this.emit();
      return;
    }
    await this.ensure();
    await this.navigateTo(address.url);
  }

  private async navigateTo(url: string): Promise<void> {
    const top = this.top!;
    this.problem = null; this.resumeUrl = ""; this.loading = true; this.url = url; this.emit();
    const result = await this.connection!.send("Page.navigate", { url }, top.sessionId).catch(error => ({ errorText: error instanceof Error ? error.message : String(error) })) as { errorText?: string };
    if (result.errorText) {
      this.loading = false;
      this.problem = { code: "page.load_failed", message: loadFailure(result.errorText) };
      this.emit();
    }
  }

  async history(delta: -1 | 1): Promise<void> {
    const top = await this.ensure();
    const history = await this.connection!.send("Page.getNavigationHistory", {}, top.sessionId) as { currentIndex: number; entries: Array<{ id: number }> };
    const entry = history.entries[history.currentIndex + delta];
    if (entry) await this.connection!.send("Page.navigateToHistoryEntry", { entryId: entry.id }, top.sessionId);
  }

  async reload(): Promise<void> {
    if (!this.top) { await this.ensure(); return; }
    this.problem = null;
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
    const send = (method: string, params: CdpParams) => this.connection!.send(method, params, top.sessionId).catch(() => undefined);
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

  /** Give the page the files the person chose for its file chooser. Paths are under the Host's upload directory. */
  async chooseFiles(id: string, files: readonly string[]): Promise<void> {
    const chooser = this.fileChooser;
    if (!chooser || chooser.id !== id || !this.connection) throw new BrowserError("page.load_failed", "页面已经不再等待选择文件");
    this.fileChooser = null; this.emit();
    await this.connection.send("DOM.setFileInputFiles", { files: [...files], backendNodeId: chooser.backendNodeId }, chooser.sessionId);
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
  async capture(): Promise<BrowserPageCapture> {
    await this.ensure();
    const value = await this.evaluate(`(() => {
      const selected = String(getSelection?.() ?? '').trim();
      const root = document.querySelector('main, article, [role=main]') || document.body;
      const text = selected || (root ? root.innerText : '');
      return JSON.stringify({ selection: !!selected, text, title: document.title });
    })()`);
    const parsed = typeof value === "string" ? JSON.parse(value) as { selection: boolean; text: string; title: string } : { selection: false, text: "", title: "" };
    const text = parsed.text.replace(/\n{3,}/gu, "\n\n").trim();
    return {
      url: this.url, origin: originOf(this.url), title: parsed.title || this.title, captured_at: new Date().toISOString(),
      selection: parsed.selection, text: text.slice(0, MAX_CAPTURE_CHARS), truncated: text.length > MAX_CAPTURE_CHARS,
    };
  }

  /** Evaluate an expression in the shown page; the value must be JSON-serializable. */
  async evaluate(expression: string): Promise<unknown> {
    const top = await this.ensure();
    const result = await this.connection!.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, top.sessionId) as { result?: { value?: unknown }; exceptionDetails?: unknown };
    if (result.exceptionDetails) throw new BrowserError("page.load_failed", "页面脚本出错");
    return result.result?.value;
  }

  /** The raw CDP session of the shown page, for the assistant's driver in this package. */
  async session(): Promise<{ send(method: string, params?: CdpParams): Promise<Record<string, unknown>>; targetId: string }> {
    const top = await this.ensure();
    const connection = this.connection!;
    return { targetId: top.targetId, send: (method, params = {}) => connection.send(method, params, top.sessionId) };
  }

  setControl(control: { mode: BrowserControlMode; work_id: string | null; activity: BrowserAssistantActivity | null }): void {
    if (control.mode === "taken-over" && this.control.mode !== "taken-over") this.takeovers += 1;
    this.control = control; this.emit();
  }

  get controlMode(): BrowserControlMode { return this.control.mode; }

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

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_").slice(0, 200) || "download";
}
