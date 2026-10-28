import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { computerErrors, helperFailure, markHelper } from "./computer-errors.js";
import { eachListener } from "../host-log.js";

/**
 * The connection to the macOS computer helper (specs/computer-use D09): local-host opens a Unix socket only this user can
 * reach, launches the helper through LaunchServices so macOS attributes its permissions to the helper itself, and
 * speaks JSON lines with it. The helper exits when the socket closes; a helper that crashed is started again on the
 * next use, at most a few times a minute.
 */
export type HelperPermission = "accessibility" | "screen_recording" | "input_monitoring";

interface HelperPresence {
  readonly locked: boolean;
  readonly screensaver: boolean;
  readonly displays_asleep: boolean;
  readonly on_console: boolean;
  readonly idle_seconds: number;
}

export interface HelperStatus {
  readonly version: string;
  readonly pid: number;
  readonly bundle_id: string;
  readonly permissions: Readonly<Record<HelperPermission, boolean>>;
  readonly presence: HelperPresence;
  readonly watching: boolean;
  /** When the helper last posted an input event, in seconds since 1970 (0 when never). */
  readonly last_synthetic: number;
}

export type HelperEvent =
  | ({ readonly event: "status" } & HelperStatus)
  | { readonly event: "input"; readonly kind: "move" | "click" | "scroll" | "key"; readonly at: number; readonly point: readonly [number, number]; readonly front_pid: number }
  | { readonly event: "front"; readonly pid: number; readonly bundle_id: string }
  | { readonly event: "app_exit"; readonly pid: number; readonly bundle_id: string }
  | { readonly event: "watch_failed" }
  | { readonly event: "closed"; readonly unexpected: boolean };

/** Why the helper cannot be used right now, in a code the driver turns into Prologue's `driver-unavailable`. */
type HelperProblem = "computer.unsupported" | "computer.missing" | "computer.start_failed" | "computer.crashed" | "computer.restarting_too_often";

interface HelperConnectionOptions {
  /** The built `Molis Work Computer Helper.app`; null when this install has none. */
  readonly appPath: string | null;
  /** Starts the helper. Defaults to LaunchServices (`open -n -g`); tests start a stand-in that speaks the same lines. */
  readonly launch?: (appPath: string, args: readonly string[]) => void;
  readonly startTimeoutMs?: number;
  readonly requestTimeoutMs?: number;
  /** macOS major version check; the helper needs macOS 14. Defaults to this machine's. */
  readonly platform?: { readonly os: NodeJS.Platform; readonly darwinMajor: number };
}

const MAX_RESTARTS_PER_MINUTE = 3;

function darwinMajor(): number { return Number(os.release().split(".")[0]) || 0; }

function described(error: { readonly code: string; readonly message: string }): { readonly code: HelperProblem; readonly message: string } {
  return { code: error.code as HelperProblem, message: error.message };
}

export class HelperConnection {
  private server: net.Server | null = null;
  private socket: net.Socket | null = null;
  private socketPath = "";
  private token = "";
  private starting: Promise<HelperStatus> | null = null;
  private last: HelperStatus | null = null;
  private nextId = 1;
  private readonly waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private readonly listeners = new Set<(event: HelperEvent) => void>();
  private readonly restarts: number[] = [];
  private closed = false;
  private problemCode: HelperProblem | null = null;

  constructor(private readonly options: HelperConnectionOptions) {}

  /** Why the helper is not usable at all on this install, before anything is started; null when it may be started. */
  unsupported(): { readonly code: HelperProblem; readonly message: string } | null {
    const platform = this.options.platform ?? { os: process.platform, darwinMajor: darwinMajor() };
    if (platform.os !== "darwin") return described(computerErrors.unsupported("操作电脑只支持 macOS。"));
    // Darwin 23 is macOS 14, the first with the screenshot interface the helper uses (D11).
    if (platform.darwinMajor < 23) return described(computerErrors.unsupported("操作电脑需要 macOS 14 或更新的系统。"));
    if (!this.options.appPath || !fs.existsSync(this.options.appPath)) return described(computerErrors.missing("这次安装里没有电脑助手（Molis Work Computer Helper）。"));
    return null;
  }

  get ready(): boolean { return this.socket !== null && !this.socket.destroyed; }

  /** The last status the helper reported; null before it first started. */
  status(): HelperStatus | null { return this.last; }

  problem(): HelperProblem | null { return this.problemCode; }

  on(listener: (event: HelperEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Starts the helper when it is not running and waits for it to say hello. */
  async ensure(): Promise<HelperStatus> {
    if (this.closed) throw markHelper(computerErrors.closed("电脑助手已关闭"));
    if (this.ready && this.last) return this.last;
    if (this.starting) return this.starting;
    const unsupported = this.unsupported();
    if (unsupported) { this.problemCode = unsupported.code; throw markHelper(unsupported.code === "computer.missing" ? computerErrors.missing(unsupported.message) : computerErrors.unsupported(unsupported.message)); }
    const now = Date.now();
    while (this.restarts.length && now - this.restarts[0]! > 60_000) this.restarts.shift();
    if (this.restarts.length >= MAX_RESTARTS_PER_MINUTE) {
      const error = computerErrors.restarting_too_often("电脑助手一分钟内反复退出，先停下；稍后再试。");
      this.problemCode = "computer.restarting_too_often";
      throw markHelper(error);
    }
    this.restarts.push(now);
    this.starting = this.start().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async start(): Promise<HelperStatus> {
    await this.listen();
    const timeoutMs = this.options.startTimeoutMs ?? 15_000;
    const hello = new Promise<HelperStatus>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.problemCode = "computer.start_failed";
        reject(markHelper(computerErrors.start_failed("电脑助手没有按时启动。")));
      }, timeoutMs);
      this.onHello = status => { clearTimeout(timer); resolve(status); };
    });
    const args = ["--socket", this.socketPath, "--token", this.token];
    const launch = this.options.launch ?? ((appPath: string, launchArgs: readonly string[]) => {
      // LaunchServices, not a child process: the helper must be its own responsible process (D09).
      const child = spawn("/usr/bin/open", ["-n", "-g", appPath, "--args", ...launchArgs], { stdio: "ignore" });
      child.on("error", () => undefined);
      child.unref();
    });
    launch(this.options.appPath!, args);
    const status = await hello;
    this.problemCode = null;
    return status;
  }

  private onHello: ((status: HelperStatus) => void) | null = null;

  private async listen(): Promise<void> {
    if (this.server) return;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "molis-computer-"));
    fs.chmodSync(directory, 0o700);
    this.socketPath = path.join(directory, "helper.sock");
    this.token = randomBytes(24).toString("hex");
    this.server = net.createServer(socket => this.accept(socket));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.socketPath, () => { this.server!.off("error", reject); resolve(); });
    });
  }

  private accept(socket: net.Socket): void {
    // One helper at a time, and only the one that knows the token gets past its first line.
    if (this.socket && !this.socket.destroyed) { socket.destroy(); return; }
    socket.setEncoding("utf8");
    let buffer = "";
    let trusted = false;
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message: Record<string, unknown>;
        try { message = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
        if (!trusted) {
          const token = typeof message.token === "string" ? Buffer.from(message.token) : Buffer.alloc(0);
          const expected = Buffer.from(this.token);
          if (message.event !== "hello" || token.length !== expected.length || !timingSafeEqual(token, expected)) { socket.destroy(); return; }
          trusted = true;
          this.socket = socket;
          this.last = message.status as HelperStatus;
          this.onHello?.(this.last);
          this.onHello = null;
          continue;
        }
        this.receive(message);
      }
    });
    socket.on("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      for (const [id, entry] of this.waiting) { clearTimeout(entry.timer); entry.reject(markHelper(computerErrors.crashed("电脑助手中途退出了，这一步结果不确定。"))); this.waiting.delete(id); }
      if (!this.closed) this.problemCode = "computer.crashed";
      this.emit({ event: "closed", unexpected: !this.closed });
    });
    socket.on("error", () => undefined);
  }

  private receive(message: Record<string, unknown>): void {
    if (typeof message.event === "string") {
      // The helper is this Home's own process; its event lines match the union it declares. Read through `unknown`.
      const event: unknown = message;
      if (message.event === "status") this.last = event as HelperStatus;
      this.emit(event as HelperEvent);
      return;
    }
    const id = typeof message.id === "number" ? message.id : -1;
    const entry = this.waiting.get(id);
    if (!entry) return;
    this.waiting.delete(id);
    clearTimeout(entry.timer);
    if (message.ok === true) entry.resolve(message.result);
    else {
      const error = (message.error ?? {}) as { code?: string; message?: string };
      const text = error.message ?? "电脑助手没能完成这一步";
      entry.reject(error.code ? helperFailure(error.code, text) : markHelper(computerErrors.failed(text)));
    }
  }

  private emit(event: HelperEvent): void {
    eachListener("computer", "helper_events", this.listeners, listener => listener(event));
  }

  /** One request; starts the helper first when needed. */
  async call<T>(op: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
    await this.ensure();
    const socket = this.socket;
    if (!socket) throw markHelper(computerErrors.crashed("电脑助手不在运行"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(markHelper(computerErrors.timeout("电脑助手没有按时回答，这一步结果不确定。")));
      }, timeoutMs ?? this.options.requestTimeoutMs ?? 20_000);
      this.waiting.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      socket.write(`${JSON.stringify({ id, op, params })}\n`);
    });
  }

  /** Stops the helper (it exits when its socket closes) and removes the socket. */
  async close(): Promise<void> {
    this.closed = true;
    this.socket?.end();
    this.socket = null;
    await new Promise<void>(resolve => this.server ? this.server.close(() => resolve()) : resolve());
    this.server = null;
    if (this.socketPath) fs.rmSync(path.dirname(this.socketPath), { recursive: true, force: true });
  }
}
