import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";

export interface LaunchHeadlessChromeOptions {
  /** The Chrome executable, usually from `locateTestChrome()`. */
  readonly executable: string;
  /** Where Chrome keeps its profile; a fresh directory per launch keeps runs apart. */
  readonly profileDirectory: string;
  /** Flags added after the standard set, before the start URL. */
  readonly extraArgs?: readonly string[];
  /** How long to wait for Chrome to print its debugger address (default 30 s: a cold Chrome on a loaded CI runner can take over 8 s). */
  readonly startTimeoutMs?: number;
}

export interface LaunchedChrome {
  /** `ws://…` address of the browser-level DevTools endpoint. */
  readonly debuggerUrl: string;
  /** Ends Chrome and releases its stderr pipe. Safe to call after Chrome has already exited. */
  close(): Promise<void>;
}

/** The flags every test browser gets: Chinese locale, no network chatter, no throttling of background pages, and a mouse. */
const STANDARD_ARGS = [
  "--headless=new", "--lang=zh-CN", "--accept-lang=zh-CN", "--disable-gpu", "--disable-background-networking",
  "--disable-component-update", "--disable-extensions", "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--no-first-run",
  "--no-default-browser-check", "--remote-debugging-port=0",
  // A desktop with a mouse (hover, fine pointer), as headless Chrome on macOS reports by itself: on Linux it finds no pointing
  // device and reports `hover: none`, which the pages rightly treat as a touch screen. Touch emulation still overrides it.
  "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4",
] as const;
const DEBUGGER_LINE = /DevTools listening on (ws:\/\/\S+)/;
/** What of Chrome's stderr is kept: enough to hold the debugger line and the tail an error message quotes. */
const STDERR_WINDOW = 8_192;
const ERROR_TAIL = 700;
const KILL_AFTER_MS = 1_000;
const TERM_AFTER_MS = KILL_AFTER_MS / 2;
const EXIT_GRACE_MS = 100;
/** How long closing waits, after the main process, for the helpers holding its stderr: they still write into the profile while
 * they wind down, so removing the profile right away can fail with ENOTEMPTY (seen on Linux). Bounded, since a helper can hold
 * the pipe for seconds. */
const HELPERS_GRACE_MS = 500;

/** Request normal shutdown without treating a protocol reply or a disconnected socket as a process exit. */
function requestBrowserClose(debuggerUrl: string, rejected: () => void): () => void {
  let socket: WebSocket | undefined, sent = false, failed = false;
  const dispose = () => socket?.close();
  const fail = () => { if (!failed) { failed = true; dispose(); rejected(); } };
  try {
    socket = new WebSocket(debuggerUrl);
    socket.addEventListener("open", () => {
      try { socket!.send(JSON.stringify({ id: 1, method: "Browser.close" })); sent = true; }
      catch { fail(); }
    }, { once: true });
    socket.addEventListener("error", fail, { once: true });
    socket.addEventListener("close", () => { if (!sent) fail(); }, { once: true });
    socket.addEventListener("message", event => {
      try { const reply = JSON.parse(String(event.data)); if (reply.id === 1 && reply.error) fail(); }
      catch { fail(); }
    });
  } catch { fail(); }
  return dispose;
}

/** Waits for normal browser exit within the existing signal budget, then briefly for its helpers' stderr. */
async function shutdown(child: ChildProcess, debuggerUrl?: string): Promise<void> {
  const stderr = child.stderr;
  const released = stderr && !stderr.destroyed ? once(stderr, "close").then(() => undefined, () => undefined) : undefined;
  // A child that never started (no pid) emits no `exit`.
  if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    let terminated = false;
    const terminate = () => {
      if (!terminated && child.exitCode === null && child.signalCode === null) { terminated = true; child.kill("SIGTERM"); }
    };
    let normal: ReturnType<typeof setTimeout> | undefined;
    let dispose: (() => void) | undefined;
    const force = setTimeout(() => child.kill("SIGKILL"), KILL_AFTER_MS);
    try {
      if (debuggerUrl) { normal = setTimeout(terminate, TERM_AFTER_MS); dispose = requestBrowserClose(debuggerUrl, terminate); }
      else terminate();
      await exited;
    } finally { clearTimeout(normal); clearTimeout(force); dispose?.(); }
  }
  if (released) {
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([released, new Promise<void>((resolve) => { timer = setTimeout(resolve, HELPERS_GRACE_MS); })]);
    clearTimeout(timer);
  }
  // Release the pipe when Chrome had already exited, too.
  stderr?.destroy();
}

/** Starts headless Chrome with remote debugging on a free port and resolves once it announces the address. */
export async function launchHeadlessChrome(options: LaunchHeadlessChromeOptions): Promise<LaunchedChrome> {
  const startTimeoutMs = options.startTimeoutMs ?? 30_000;
  const child = spawn(options.executable,
    [...STANDARD_ARGS, `--user-data-dir=${options.profileDirectory}`, ...(options.extraArgs ?? []), "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] });
  let debuggerUrl: string;
  try {
    debuggerUrl = await new Promise<string>((resolve, reject) => {
      let stderr = "";
      const timer = setTimeout(() => reject(new Error("Chrome debugger did not start")), startTimeoutMs);
      const fail = (error: Error) => { clearTimeout(timer); reject(error); };
      child.once("error", fail);
      // Chrome's last words can still be in the pipe when the exit is reported.
      child.once("exit", () => setTimeout(() => fail(new Error(`Chrome exited before debugger start: ${stderr.slice(-ERROR_TAIL)}`)), EXIT_GRACE_MS));
      // The listener stays attached after the address is found: an unread pipe fills up and blocks Chrome.
      child.stderr!.on("data", (chunk) => {
        stderr = (stderr + String(chunk)).slice(-STDERR_WINDOW);
        const url = stderr.match(DEBUGGER_LINE)?.[1];
        if (url) { clearTimeout(timer); resolve(url); }
      });
    });
  } catch (error) {
    await shutdown(child);
    throw error;
  }
  let closing: Promise<void> | undefined;
  return { debuggerUrl, close: () => closing ??= shutdown(child, debuggerUrl) };
}
