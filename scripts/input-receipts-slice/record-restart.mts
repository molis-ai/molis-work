/**
 * restart: the host dies (SIGKILL) while one input is in the model's context unread and another is queued. The next
 * Runtime on the same disk finds the unfinished run, closes it (`recoverRun`), and the SDK reports what became of the inputs.
 * Everything here is read back from the SDK; only the wall clock is moved to the recording's base so times are stable.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Flavor } from "./record-content.mts";
import { BASE_MS, rawRun, type Sdk } from "./record-lab.mts";
import { compress } from "./record-scenes.mts";
import type { Checkpoint, QueueView, Scene } from "./facts.ts";

type Dict = Record<string, unknown>;
type Ref = { kind: string; id: string; revision: number };
const here = dirname(fileURLToPath(import.meta.url));

/** Moves every `atMs` in a value by `delta`. Times are the only thing the recording rewrites. */
function shift<T>(value: T, delta: number): T {
  if (Array.isArray(value)) return value.map(one => shift(one, delta)) as T;
  if (value !== null && typeof value === "object") {
    const out: Dict = {};
    for (const [key, one] of Object.entries(value as Dict)) out[key] = key === "atMs" && typeof one === "number" ? one + delta : shift(one, delta);
    return out as T;
  }
  return value;
}

async function killedChild(sdkDir: string, temp: string, flavor: Flavor): Promise<{ session: Ref; run: Ref }> {
  const child: ChildProcess = spawn(process.execPath, [join(here, "record-child.mjs"), sdkDir, temp, JSON.stringify(flavor.restart)], { stdio: ["ignore", "pipe", "pipe"] });
  const ready = await new Promise<{ session: Ref; run: Ref }>((resolve, reject) => {
    let out = "";
    let err = "";
    const timer = setTimeout(() => reject(new Error(`recording child did not get ready: ${err.slice(-400)}`)), 20_000);
    child.stderr?.on("data", chunk => { err += String(chunk); });
    child.stdout?.on("data", chunk => {
      out += String(chunk);
      const end = out.indexOf("\n");
      if (end >= 0) { clearTimeout(timer); resolve(JSON.parse(out.slice(0, end)) as { session: Ref; run: Ref }); }
    });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`recording child exited early (${String(code)}): ${err.slice(-400)}`)); });
  });
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  }
  return ready;
}

export async function restartScene(sdk: Sdk, sdkDir: string, f: Flavor): Promise<Scene> {
  const temp = mkdtempSync(join(tmpdir(), "input-receipts-restart-"));
  mkdirSync(join(temp, "project"));
  try {
    const { session: sessionRef, run: runRef } = await killedChild(sdkDir, temp, f);
    const node: { createNodeHost(options: Dict): Dict } = await import(pathToFileURL(join(sdkDir, "dist", "node.js")).href);
    let modelCalls = 0;
    const runtime = await sdk.createRuntime({
      app: { appId: "molis.input-receipts.recording", appVersion: "1.0.0" }, preset: "local-agent", network: { model: true },
      host: { ...node.createNodeHost({ storageRoot: join(temp, "store") }), prepareModelNetwork: async () => { modelCalls += 1; throw new Error("no model while recovering"); } },
    });
    try {
      const sessions = runtime.sessions;
      const opened = await sessions.open(sessionRef);
      if (opened === undefined) throw new Error("the killed session could not be reopened");
      const prefix = await opened.readRunProgress(runRef);
      const before = (await sessions.inspectRecovery(sessionRef)).runs[0];
      if (before === undefined) throw new Error("no interrupted run to recover");
      await sessions.recoverRun(sessionRef, runRef, before.version);
      const reopened = await sessions.open(sessionRef);
      const closed = await reopened?.replay(runRef);
      const queue = await reopened?.inputQueue();
      if (closed === undefined || queue === undefined) throw new Error("the recovered session could not be read");
      if (modelCalls !== 0) throw new Error("recovery must not call the model");
      // Rebase the recording's clock: the first input is at 14:11:20.
      const firstAt = closed.find(event => event.type === "prompt" && typeof event["steerId"] === "string")?.["atMs"];
      const delta = BASE_MS + 680_000 - (typeof firstAt === "number" ? firstAt : BASE_MS);
      const run = compress(rawRun(sdk, "被强杀的一轮", shift(closed, delta)));
      const progress = prefix.length;
      const queueView = shift(JSON.parse(JSON.stringify(queue)) as QueueView, delta);
      const cps: Checkpoint[] = [
        { id: "killed", label: "宿主被强杀，重启前", run: 0, at: progress },
        { id: "recovered", label: "核对并收口之后", run: 0, at: run.events.length, queue: queueView },
      ];
      return { id: "restart", label: "宿主被强杀后重启", runs: [run], checkpoints: cps };
    } finally {
      await runtime.shutdown();
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
