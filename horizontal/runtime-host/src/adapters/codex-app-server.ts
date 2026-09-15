import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { RuntimeSessionTransport } from "@molis-ai/molis-work-contracts/services/runtime-host";

const DEFAULT_MAX_RESPONSE_LINE_BYTES = 16 * 1024 * 1024;

export interface CodexAppServerTransportOptions {
  command?: string;
  args?: string[];
  requestTimeoutMs?: number;
  maxResponseLineBytes?: number;
  spawnProcess?: typeof spawn;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class CodexAppServerTransportError extends Error {
  constructor(readonly code: "runtime.response_too_large", message: string) {
    super(message);
    this.name = "CodexAppServerTransportError";
  }
}

export class CodexAppServerTransport implements RuntimeSessionTransport {
  private child: ChildProcessWithoutNullStreams | null = null;
  private startPromise: Promise<void> | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly listeners = new Set<(event: { method: string; params: unknown }) => void>();
  private stdoutChunks: Buffer[] = [];
  private stdoutBytes = 0;
  private closed = false;

  constructor(private readonly options: CodexAppServerTransportOptions = {}) {}

  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.closed) throw new Error("Codex Session transport 已关闭");
    await this.ensureStarted();
    if (this.closed) throw new Error("Codex Session transport 已关闭");
    return this.requestRaw(method, params);
  }

  subscribe(listener: (event: { method: string; params: unknown }) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    const child = this.child;
    this.child = null;
    this.startPromise = null;
    this.resetResponseBuffer();
    this.failAll(new Error("Codex Session transport 已关闭"));
    this.listeners.clear();
    if (child && !child.killed) child.kill("SIGTERM");
  }

  private ensureStarted(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    if (this.child) return Promise.resolve();
    const pending = this.start();
    this.startPromise = pending;
    const clear = () => { if (this.startPromise === pending) this.startPromise = null; };
    void pending.then(clear, clear);
    return pending;
  }

  private async start(): Promise<void> {
    const spawnProcess = this.options.spawnProcess ?? spawn;
    const command = this.options.command?.trim() || process.env.MOLIS_WORK_CODEX_PATH?.trim() || "codex";
    const args = this.options.args ?? ["app-server", "--stdio"];
    const child = spawnProcess(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
      shell: false,
    });
    this.child = child;
    this.resetResponseBuffer();
    child.stdout.on("data", (chunk: Buffer | string) => this.handleChunk(child, chunk));
    child.once("error", () => this.handleExit(child, "Codex app-server 无法启动"));
    child.once("exit", () => this.handleExit(child, "Codex app-server 已退出"));
    child.stderr.on("data", () => undefined);

    try {
      await this.requestRaw("initialize", {
        clientInfo: { name: "molis-work-session-browser", title: "Molis Work", version: "0.2.0" },
        capabilities: {
          experimentalApi: false,
          requestAttestation: false,
          optOutNotificationMethods: [],
        },
      });
      this.write({ method: "initialized" });
    } catch (error) {
      this.failProtocolLine(child, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private requestRaw(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const timeoutMs = Math.max(1_000, this.options.requestTimeoutMs ?? 15_000);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} 请求超时`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`Codex ${method} 请求发送失败`));
      }
    });
  }

  private write(message: Record<string, unknown>): void {
    if (!this.child?.stdin.writable) throw new Error("Codex app-server 不可写");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleChunk(child: ChildProcessWithoutNullStreams, chunk: Buffer | string): void {
    if (child !== this.child) return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let offset = 0;
    while (offset < bytes.length) {
      const newline = bytes.indexOf(0x0a, offset);
      const end = newline === -1 ? bytes.length : newline;
      const segment = bytes.subarray(offset, end);
      if (segment.length > 0 && !this.appendResponseSegment(child, segment)) return;
      if (newline === -1) return;
      const line = this.consumeResponseLine();
      if (line.length > 0) this.handleLine(line);
      if (child !== this.child) return;
      offset = newline + 1;
    }
  }

  private appendResponseSegment(child: ChildProcessWithoutNullStreams, segment: Buffer): boolean {
    const maxBytes = Math.max(1_024, this.options.maxResponseLineBytes ?? DEFAULT_MAX_RESPONSE_LINE_BYTES);
    if (this.stdoutBytes + segment.length > maxBytes) {
      this.failProtocolLine(child, new CodexAppServerTransportError(
        "runtime.response_too_large",
        "Codex Session 内容超过安全读取上限；Molis Work 已停止本次读取。",
      ));
      return false;
    }
    this.stdoutChunks.push(segment);
    this.stdoutBytes += segment.length;
    return true;
  }

  private consumeResponseLine(): string {
    const bytes = this.stdoutChunks.length === 1
      ? this.stdoutChunks[0]!
      : Buffer.concat(this.stdoutChunks, this.stdoutBytes);
    this.resetResponseBuffer();
    const end = bytes.at(-1) === 0x0d ? bytes.length - 1 : bytes.length;
    return bytes.toString("utf8", 0, end);
  }

  private resetResponseBuffer(): void {
    this.stdoutChunks = [];
    this.stdoutBytes = 0;
  }

  private failProtocolLine(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (child !== this.child) return;
    this.child = null;
    this.startPromise = null;
    this.resetResponseBuffer();
    this.failAll(error);
    if (!child.killed) child.kill("SIGTERM");
  }

  private handleLine(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(publicCodexErrorMessage(message.error)));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method !== "string") return;
    const event = { method: message.method, params: message.params };
    for (const listener of this.listeners) listener(event);
  }

  private handleExit(child: ChildProcessWithoutNullStreams, message: string): void {
    if (child !== this.child) return;
    this.child = null;
    this.startPromise = null;
    this.resetResponseBuffer();
    this.failAll(new Error(message));
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function publicCodexErrorMessage(value: unknown): string {
  const error = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const message = typeof error.message === "string" ? error.message : "";
  if (/active writer/i.test(message)) return "Codex Session 已经在另一个 Runtime 实例中运行。";
  if (/thread.+not found|not found.+thread/i.test(message)) return "Codex 找不到这条 Session。";
  return "Codex app-server 请求失败";
}
