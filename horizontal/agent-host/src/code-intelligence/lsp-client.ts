/**
 * A language server over stdio: JSON-RPC with `Content-Length` framing, one handshake, one shutdown.
 *
 * It is deliberately small: the Host only asks for definitions and references, so the client carries the framing and the
 * lifecycle, and nothing that would make it a second editor. A server that dies, writes a broken frame or misses its
 * deadline rejects the request in flight and is marked dead; a later call starts a fresh one.
 */

import { spawn, type ChildProcess } from "node:child_process";

/** Where a language server comes from, as the person's configuration names it. */
export interface LanguageServerSpec {
  /** Extensions this server answers for, e.g. `.ts`, `.tsx`. Lowercase, with the dot. */
  readonly extensions: readonly string[];
  readonly command: string;
  readonly args?: readonly string[];
  /** LSP `languageId`, e.g. `typescript`. Defaults to the extension without the dot. */
  readonly languageId?: string;
  /** When the executable is not installed: the npm package at an exact version and the bin it ships (Q5). */
  readonly install?: { readonly package: string; readonly version: string; readonly bin: string };
  readonly initializationOptions?: unknown;
}

export interface LspClient {
  /** A request; rejects when the server is gone, answers an error, or exceeds the timeout. */
  request<T = unknown>(method: string, params: unknown, timeoutMs?: number): Promise<T>;
  /** A notification; never waits for an answer. */
  notify(method: string, params: unknown): void;
  /** Hand the server the document text the caller holds. */
  openDocument(input: { readonly path: string; readonly text: string; readonly languageId: string }): void;
  /** Tell the server the document changed; the version must go up. */
  changeDocument(input: { readonly path: string; readonly text: string; readonly version: number }): void;
  /** Tell the server the document is no longer open (a bounded cache evicts the least recently used). */
  closeDocument(input: { readonly path: string }): void;
  /** Shutdown, then exit; a server that will not go is killed. */
  close(): Promise<void>;
  /** Whether the process is still there. */
  readonly alive: boolean;
}

const MAX_HEADER = 8 * 1024;
/** A frame body is somebody else's process's word: bound it so a broken or hostile server cannot make the Host buffer without limit. */
const MAX_BODY = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;

/** Start one server for one root. `cwd` is where the server resolves its project files. */
export function startLanguageServer(spec: LanguageServerSpec, options: { readonly cwd: string; readonly timeoutMs?: number }): LspClient {
  /*
   * A language server is somebody else's process, configured by the person but not trusted with this Home's own secrets:
   * the platform's `MOLIS_WORK_*` environment never crosses (the same rule the terminal's S-103 applies to its child).
   */
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("MOLIS_WORK_")));
  const child = spawn(spec.command, [...(spec.args ?? [])], { cwd: options.cwd, stdio: ["pipe", "pipe", "pipe"], env });
  return connect(child, { ...spec, timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS });
}

function connect(child: ChildProcess, spec: LanguageServerSpec & { readonly timeoutMs: number }): LspClient {
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  let alive = child.exitCode === null;
  let stderr = "";
  const failAll = (error: Error) => {
    for (const [id, held] of pending) { clearTimeout(held.timer); held.reject(error); pending.delete(id); }
  };
  const send = (message: unknown) => {
    if (!alive) throw new Error("the language server is not running");
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...(message as object) }), "utf8");
    child.stdin!.write(`Content-Length: ${body.length}\r\n\r\n`);
    child.stdin!.write(body);
  };
  child.stdout!.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        if (buffer.length > MAX_HEADER) { failAll(new Error("the language server sent an over-long frame header")); buffer = Buffer.alloc(0); }
        return;
      }
      const header = buffer.subarray(0, headerEnd).toString("ascii");
      const length = /(^|\r\n)Content-Length: (\d+)(\r\n|$)/i.exec(header)?.at(2);
      if (length === undefined) { failAll(new Error("the language server sent a frame without Content-Length")); buffer = buffer.subarray(headerEnd + 4); continue; }
      const size = Number(length);
      const start = headerEnd + 4;
      if (!Number.isSafeInteger(size) || size < 0 || size > MAX_BODY) {
        failAll(new Error(`the language server sent a frame body of ${length} bytes; the maximum is ${MAX_BODY}`));
        buffer = Buffer.alloc(0);
        continue;
      }
      if (buffer.length < start + size) return;
      const body = buffer.subarray(start, start + size).toString("utf8");
      buffer = buffer.subarray(start + size);
      let message: { id?: number; result?: unknown; error?: { message?: string }; method?: string };
      try { message = JSON.parse(body) as typeof message; } catch { continue; }
      if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
        const held = pending.get(message.id);
        if (held === undefined) continue;
        pending.delete(message.id);
        clearTimeout(held.timer);
        if (message.error !== undefined) held.reject(new Error(message.error.message ?? "the language server answered an error"));
        else held.resolve(message.result);
      }
    }
  });
  child.stderr!.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-4_000); });
  child.on("exit", () => { alive = false; failAll(new Error(`the language server exited${stderr ? `: ${stderr.trim().split("\n").at(-1)}` : ""}`)); });
  child.on("error", (error) => { alive = false; failAll(new Error(`the language server could not start: ${error.message}`)); });
  const request = <T>(method: string, params: unknown, timeoutMs = spec.timeoutMs): Promise<T> => new Promise<T>((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`the language server did not answer ${method} within ${timeoutMs} ms`));
    }, timeoutMs);
    pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
    try { send({ id, method, params }); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error as Error); }
  });
  return {
    request,
    notify: (method, params) => { if (alive) send({ method, params }); },
    openDocument: ({ path, text, languageId }) => {
      if (!alive) throw new Error("the language server is not running");
      send({ method: "textDocument/didOpen", params: { textDocument: { uri: fileUri(path), languageId, version: 1, text } } });
    },
    changeDocument: ({ path, text, version }) => {
      if (!alive) throw new Error("the language server is not running");
      send({ method: "textDocument/didChange", params: { textDocument: { uri: fileUri(path), version }, contentChanges: [{ text }] } });
    },
    closeDocument: ({ path }) => {
      if (!alive) return;
      send({ method: "textDocument/didClose", params: { textDocument: { uri: fileUri(path) } } });
    },
    get alive() { return alive; },
    async close() {
      if (!alive) return;
      await Promise.race([
        request("shutdown", null, 2_000).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
      try { send({ method: "exit", params: null }); } catch { /* already gone */ }
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      const killed = setTimeout(() => { alive = false; child.kill("SIGKILL"); }, 1_000);
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1_500))]);
      clearTimeout(killed);
      alive = false;
    },
  };
}

/** The `file:` URI an LSP server expects for a path on this machine. */
export function fileUri(path: string): string {
  return "file://" + path.split("/").map((piece) => encodeURIComponent(piece)).join("/");
}
