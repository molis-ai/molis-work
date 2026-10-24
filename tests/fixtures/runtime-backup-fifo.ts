import assert from "node:assert/strict";
import { spawn } from "node:child_process";

/** The one budget, started when the child says it is ready: the call, its exact refusal and the child's natural close. */
export const READY_BUDGET_MS = 2500;

export type FifoChildMode = "owner" | "block";

export interface FifoChildResult {
  readonly ready: boolean;
  readonly entered: boolean;
  readonly refused: string | null;
  readonly succeeded: boolean;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly startupElapsedMs: number | null;
  readonly ownerElapsedMs: number | null;
  readonly stderrTail: string;
}

// The child loads the public Host package before it says ready, so loading never counts against the budget. "owner" reads through
// the public owner and reports only the error code; "block" reads the FIFO the way a careless owner would, and never returns.
const CHILD = [
  "import { readRuntimeConfigBackup } from '@molis-ai/molis-work-app-local-host';",
  "import { readFileSync } from 'node:fs';",
  "const [mode, home, plan, fifo] = process.argv.slice(1);",
  "process.once('message', () => process.send({ type: 'entered' }, async () => {",
  "  if (mode === 'block') { readFileSync(fifo); return; }",
  "  let message;",
  "  try { await readRuntimeConfigBackup(home, 'codex', plan); message = { type: 'succeeded' }; }",
  "  catch (error) { message = { type: 'refused', code: typeof error?.code === 'string' ? error.code : 'no-code' }; }",
  "  process.send(message, () => process.disconnect());",
  "}));",
  "process.send({ type: 'ready' });",
].join("\n");

/**
 * Runs one owner read of a FIFO in a fresh process. The budget starts at the first `ready` and is cleared only by the child's
 * close; on expiry or abort only this child is killed, and the result is returned after it has closed.
 */
export function runFifoChild(mode: FifoChildMode, input: { home: string; plan: string; fifo: string },
  options: { onEntered?: () => void; signal?: AbortSignal } = {}): Promise<FifoChildResult> {
  return new Promise(resolve => {
    const started = performance.now();
    const child = spawn(process.execPath, ["--input-type=module", "-e", CHILD, mode, input.home, input.plan, input.fifo],
      { stdio: ["ignore", "ignore", "pipe", "ipc"], env: process.env });
    let ready = false, entered = false, refused: string | null = null, succeeded = false, timedOut = false, cancelled = false;
    let readyAt: number | null = null, enteredAt: number | null = null, answeredAt: number | null = null, stderr = "";
    let timer: NodeJS.Timeout | undefined;
    const stop = (why: "timeout" | "abort") => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      if (why === "timeout") timedOut = true; else cancelled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
    };
    const abort = () => stop("abort");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-2000); });
    child.on("message", (message: { type: string; code?: string }) => {
      if (message.type === "ready" && !ready) {
        ready = true; readyAt = performance.now();
        timer = setTimeout(() => stop("timeout"), READY_BUDGET_MS);
        child.send({ type: "run" });
      } else if (message.type === "entered") {
        entered = true; enteredAt = performance.now(); options.onEntered?.();
      } else if (message.type === "refused") {
        refused = message.code ?? null; answeredAt = performance.now();
      } else if (message.type === "succeeded") {
        succeeded = true; answeredAt = performance.now();
      }
    });
    options.signal?.addEventListener("abort", abort, { once: true });
    child.once("close", (status, signal) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      child.removeAllListeners("message");
      resolve({ ready, entered, refused, succeeded, timedOut, cancelled, status, signal,
        startupElapsedMs: readyAt === null ? null : Math.round(readyAt - started),
        ownerElapsedMs: enteredAt === null || answeredAt === null ? null : Math.round(answeredAt - enteredAt), stderrTail: stderr });
    });
  });
}

/** What a prompt refusal looks like: entered, refused with exactly this code, and closed by itself inside the budget. */
export function assertRefusedPromptly(result: FifoChildResult, code: string): void {
  const seen = JSON.stringify({ ...result, stderrTail: result.stderrTail.slice(-400) });
  assert.equal(result.ready, true, seen);
  assert.equal(result.entered, true, seen);
  assert.equal(result.succeeded, false, `a special file must not be read as an original: ${seen}`);
  assert.equal(result.timedOut, false, `a special file must be rejected instead of waiting for a writer: ${seen}`);
  assert.equal(result.cancelled, false, seen);
  assert.equal(result.refused, code, seen);
  assert.equal(result.signal, null, seen);
  assert.equal(result.status, 0, seen);
}
