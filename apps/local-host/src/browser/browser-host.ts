import { browserErrors, isBrowserError } from "./errors.js";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { BrowserProblemCode } from "@molis-ai/molis-work-contracts/services/browser";
import { BrowserPage } from "./browser-page.js";
export { BrowserPage, browserAddress, safeFilename, shortcutCommands } from "./browser-page.js";
export type { BrowserListener } from "./browser-page.js";
import { CdpConnection, type CdpParams } from "./cdp.js";
import { locateBrowser, type LocatedBrowser } from "./locate.js";
import { trackHostChildEndpoint } from "../host-endpoints.js";

/**
 * The side panel's browser (specs/archive/side-panel D03/D04): one Chrome-family process per Home, started on first use with
 * its own profile under the Home, and one page per project. The person sees each page through its screencast and
 * drives it through CDP input; the assistant's driver (specs/archive/side-panel P5) acts on the same page, so what it does is
 * what the person watches.
 */
interface BrowserHostOptions {
  readonly homeDirectory: string;
  readonly locate?: () => LocatedBrowser | null;
  /** Origins the pages may never load: the local Host itself serves its control token to whoever loads it. */
  readonly forbiddenOrigins?: () => readonly string[];
  readonly launchTimeoutMs?: number;
}

interface Running {
  readonly child: ChildProcess;
  readonly cdp: CdpConnection;
  readonly engine: string;
  readonly downloads: string;
}

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
    if (this.closed) throw browserErrors.start_failed("浏览器服务已经关闭");
    if (this.current && !this.current.cdp.closed) return this.current;
    this.running ??= this.launch().then(running => {
      this.current = running; this.problem = null;
      return running;
    }, error => {
      this.running = null;
      this.problem = isBrowserError(error) ? { code: error.code, message: error.message } : { code: "browser.start_failed", message: "浏览器没有启动起来，请重试" };
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
    if (!located) throw browserErrors.not_found("没有找到可用的浏览器。请安装 Google Chrome（或 Chromium、Microsoft Edge），然后重试。");
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
      const timer = setTimeout(() => fail(browserErrors.start_failed("浏览器启动超时，请重试")), this.options.launchTimeoutMs ?? 20_000);
      const fail = (error: Error) => { clearTimeout(timer); child.kill("SIGKILL"); reject(error); };
      child.stderr!.setEncoding("utf8");
      child.stderr!.on("data", (chunk: string) => {
        log = (log + chunk).slice(-8000);
        const match = /DevTools listening on (ws:\/\/\S+)/u.exec(log);
        if (match) { clearTimeout(timer); resolve(match[1]!); }
      });
      child.once("error", () => fail(browserErrors.start_failed(`${located.name} 没有启动起来`)));
      child.once("exit", () => fail(/profile|SingletonLock|in use/iu.test(log)
        ? browserErrors.profile_in_use("浏览器资料正被另一个进程使用。请关闭另一个 Molis Work 窗口后重试。")
        : browserErrors.start_failed(`${located.name} 启动后立刻退出了`)));
    });
    trackHostChildEndpoint(endpoint, child);
    const cdp = await CdpConnection.open(endpoint);
    const running: Running = { child, cdp, engine: located.name, downloads: this.downloadDir };
    child.stderr!.removeAllListeners("data");
    child.stderr!.resume();
    child.once("exit", () => {
      if (this.current !== running) return;
      this.current = null; this.running = null;
      // The process can be reported gone before its DevTools socket is: close that first, so every page sees a stopped browser.
      running.cdp.close();
      this.problem = this.closed ? null : { code: "browser.crashed", message: "浏览器意外停止了。可以重新启动，页面会回到原来的地址。" };
      for (const page of this.pages.values()) page.hostChanged();
    });
    cdp.onClose(() => { if (this.current === running) child.kill("SIGTERM"); });
    await cdp.send("Target.setDiscoverTargets", { discover: true });
    // A popup is held at start until its page has adopted it (`Target.attachedToTarget` below). Only when the browser cannot
    // auto-attach does `Target.targetCreated` adopt it instead; doing both races, and the held popup is then never resumed.
    const autoAttached = await cdp.send("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
      filter: [{ type: "page", exclude: false }],
    }).then(() => true, () => false);
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: this.downloadDir, eventsEnabled: true });
    cdp.on("Target.targetInfoChanged", params => this.route(params, (page, info) => page.targetInfo(info)));
    cdp.on("Target.attachedToTarget", params => {
      const info = params.targetInfo as { targetId?: string; type?: string; openerId?: string } | undefined;
      const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
      const waitingForDebugger = params.waitingForDebugger === true;
      if (!info?.targetId || info.type !== "page" || !sessionId) return;
      if (!info.openerId) {
        if (waitingForDebugger) void cdp.send("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(() => undefined);
        return;
      }
      const owner = [...this.pages.values()].find(page => page.owns(info.openerId!));
      if (owner) {
        void owner.adoptPopup(info.targetId, { sessionId, waitingForDebugger });
      } else {
        void cdp.send("Target.closeTarget", { targetId: info.targetId }).catch(() => undefined);
        if (waitingForDebugger) void cdp.send("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(() => undefined);
      }
    });
    cdp.on("Target.targetCreated", params => {
      const info = params.targetInfo as { targetId: string; type: string; openerId?: string };
      if (autoAttached || info.type !== "page" || !info.openerId) return;
      for (const page of this.pages.values()) {
        if (page.owns(info.openerId) && !page.owns(info.targetId) && !page.adopting(info.targetId)) {
          void page.adoptPopup(info.targetId);
        }
      }
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

/** A browser host started on first use, forbidding the loopback origin of the server that owns it. Its getter also
 * exposes the started instance (or null) so a shutdown can close it without starting one. */
export function lazyBrowserHost(homeDirectory: string, server: () => { address(): unknown }): (() => BrowserHost) & { current(): BrowserHost | null } {
  let instance: BrowserHost | null = null;
  const getter = () => instance ??= new BrowserHost({ homeDirectory, forbiddenOrigins: () => {
    const address = server().address();
    const port = address && typeof address === "object" ? (address as { port?: number }).port ?? 0 : 0;
    return port ? [`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`] : [];
  } });
  return Object.assign(getter, { current: () => instance });
}
