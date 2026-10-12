/**
 * The recording lab: a real Prologue Runtime on its in-memory test Host, with a scripted model.
 *
 * Nothing here computes a receipt. The lab only drives the SDK through its public entry (start a run, steer, withdraw,
 * stop, queue) and keeps what the SDK reports: the run's event ledger, `projectInputReceipts` at every ledger prefix,
 * and `session.inputQueue()` where a scene asks for it. The preview later reads these files; it never derives state.
 */
import { pathToFileURL } from "node:url";
import { join } from "node:path";

type Dict = Record<string, unknown>;
export type LedgerEvent = Dict & { readonly type: string };

/** The part of the SDK the lab calls. The package is loaded from a built checkout, so its types are not importable. */
export interface SdkRun { readonly ref: { readonly id: string }; subscribe(listener: (event: LedgerEvent) => void): () => void; cancel(): Promise<void> }
export interface SdkControl {
  steer(input: { text: string; source?: string; about?: string; interrupt?: boolean }): Promise<{ steerId: string; replayed: boolean }>;
  withdrawSteer(id: string): Promise<void>;
  stop(reason: "stopped" | "cancelled"): void;
}
export interface SdkSession {
  readonly ref: { readonly id: string };
  readRunProgress(run: SdkRun["ref"]): Promise<readonly LedgerEvent[]>;
  queueInput(input: { text: string; source?: string; key?: string }): Promise<{ inputId: string }>;
  withdrawQueuedInput(id: string): Promise<void>;
  inputQueue(): Promise<Dict>;
  replay(run: SdkRun["ref"]): Promise<readonly LedgerEvent[]>;
}
export interface Sdk {
  createRuntime(options: Dict): Promise<{
    credentials: { write(input: Dict): Promise<{ ref: Dict }> };
    sessions: {
      create(): Promise<SdkSession>;
      open(ref: Dict): Promise<SdkSession | undefined>;
      inspectRecovery(ref: Dict): Promise<{ runs: { version: number }[] }>;
      recoverRun(ref: Dict, run: Dict, version: number): Promise<unknown>;
    };
    effects: { pendings: { answer(ref: unknown, answer: Dict, clock: unknown): Promise<unknown> } };
    readClock(): Promise<unknown>;
    startAgentRun(input: Dict): Promise<{ run: SdkRun; control: SdkControl }>;
    shutdown(): Promise<unknown>;
  }>;
  projectInputReceipts(events: readonly LedgerEvent[]): readonly Dict[];
}
interface MemoryHost { clock: { advance(ms: number): void; read(): { wallTimeMs: number } } }

export async function loadSdk(dir: string): Promise<{ sdk: Sdk; createMemoryHost: (options: Dict) => Dict & MemoryHost }> {
  const href = (file: string): string => pathToFileURL(join(dir, "dist", file)).href;
  const sdk: Sdk = await import(href("index.js"));
  const testing: { createMemoryHost: (options: Dict) => Dict & MemoryHost } = await import(href("testing/api/index.js"));
  return { sdk, createMemoryHost: testing.createMemoryHost };
}

// ---- the scripted model ------------------------------------------------------------------------------------------------
export type Reply = readonly string[] | { readonly partial: readonly string[]; readonly until: Promise<void> };
export interface ModelCall { readonly n: number; readonly body: string; readonly ids: readonly string[] }

export const says = (text: string): readonly string[] => [
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n`,
  "data: [DONE]\n",
];
export const partial = (text: string): readonly string[] => [`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n`];
export function calls(...uses: readonly { id: string; name: string; args: unknown }[]): readonly string[] {
  return [
    ...uses.map((use, index) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index, id: use.id, function: { name: use.name, arguments: JSON.stringify(use.args) } }] } }] })}\n`),
    "data: [DONE]\n",
  ];
}
/** Input ids the model can see in a request: the runtime's note after each input names it. */
export const idsIn = (body: string): string[] => [...body.matchAll(/has the id ([A-Za-z0-9._~-]+?)\. Use it/g)].map(one => one[1] ?? "");

export interface Lab {
  readonly sdk: Sdk;
  readonly runtime: Awaited<ReturnType<Sdk["createRuntime"]>>;
  readonly host: Dict & MemoryHost;
  readonly credential: Dict;
  /** Moves the virtual wall clock to `base + seconds`. Times in the recordings come from here, so they are stable. */
  at(seconds: number): void;
  script(next: (call: ModelCall) => Reply): void;
  newSession(): Promise<SdkSession>;
  close(): Promise<void>;
}

/** 2026-10-12 14:00:00 UTC. The preview prints times in UTC, so "14:02" is 120 seconds into the recording. */
export const BASE_MS = Date.UTC(2026, 9, 12, 14, 0, 0);

export async function openLab(sdkDir: string): Promise<Lab> {
  const { sdk, createMemoryHost } = await loadSdk(sdkDir);
  const inner = createMemoryHost({ network: { model: true }, startWallTimeMs: BASE_MS });
  const bodyOf = new Map<string, string>();
  const waiters = new Map<string, () => void>();
  let script: (call: ModelCall) => Reply = () => says("");
  let handles = 0;
  let calls_ = 0;
  const host = {
    ...inner,
    async prepareModelNetwork(input: { body: Uint8Array }) {
      const id = `lab-${String((handles += 1))}`;
      bodyOf.set(id, new TextDecoder().decode(input.body));
      return { id };
    },
    async executeModelNetwork(exec: { handle: { id: string }; onFrame(frame: string): void }) {
      const body = bodyOf.get(exec.handle.id) ?? "";
      const reply = script({ n: calls_++, body, ids: idsIn(body) });
      if ("partial" in reply) {
        for (const frame of reply.partial) exec.onFrame(frame);
        const cancelled = new Promise<"cancelled">(resolve => { waiters.set(exec.handle.id, () => resolve("cancelled")); });
        const outcome = await Promise.race([reply.until.then(() => "completed" as const), cancelled]);
        if (outcome === "completed") exec.onFrame("data: [DONE]\n");
        return outcome;
      }
      for (const frame of reply) exec.onFrame(frame);
      return "completed" as const;
    },
    async cancelModelNetwork(handle: { id: string }) {
      waiters.get(handle.id)?.();
      waiters.delete(handle.id);
    },
  };
  const runtime = await sdk.createRuntime({ app: { appId: "molis.input-receipts.recording", appVersion: "1.0.0" }, host,
    preset: "local-agent", network: { model: true },
    // The scripted model may ask a question; letting the tool through is not approving any write (the lab has no workspace).
    rules: [{ source: "user", effect: "allow", match: { what: "tool" } }],
    config: { agent: { breaker: { maxConsecutiveErrors: 99, maxRepeatedCalls: 99, maxRepeatedText: 99 } } } });
  const credential = await runtime.credentials.write({ label: "lab", secret: { plaintext: new TextEncoder().encode("recording-only") } });
  return {
    sdk, runtime, host: inner as Dict & MemoryHost, credential: credential.ref,
    at(seconds: number): void {
      const target = BASE_MS + seconds * 1000;
      const now = inner.clock.read().wallTimeMs;
      if (target > now) inner.clock.advance(target - now);
    },
    script(next): void { script = next; calls_ = 0; },
    newSession: () => runtime.sessions.create(),
    close: async () => { await runtime.shutdown(); },
  };
}

// ---- one recorded run ------------------------------------------------------------------------------------------------
export interface RawRun {
  readonly label: string;
  readonly events: readonly LedgerEvent[];
  /** `projectInputReceipts(events.slice(0, i + 1))` for every prefix: the SDK's own answer at each point of the ledger. */
  readonly projections: readonly (readonly Dict[])[];
}

export interface RunHandle {
  readonly run: SdkRun;
  readonly control: SdkControl;
  readonly events: LedgerEvent[];
  /** Resolves with the terminal event. */
  readonly ended: Promise<LedgerEvent>;
  waitFor(label: string, check: (events: readonly LedgerEvent[]) => boolean, ms?: number): Promise<void>;
}

export async function startRun(lab: Lab, session: SdkSession, key: string, text: string, extra: Dict = {}, tools: readonly string[] = ["acknowledge-inputs"]): Promise<RunHandle> {
  const started = await lab.runtime.startAgentRun({
    session, workspace: "app",
    start: { protocol: "openai-compatible", endpoint: "https://lab.invalid/v1/chat/completions", model: "scripted", credentialRef: lab.credential, messages: [{ role: "user", text }] },
    agent: { idempotencyKey: key, toolNames: tools },
    ...extra,
  });
  const events: LedgerEvent[] = [];
  const ended = new Promise<LedgerEvent>(resolve => {
    started.run.subscribe(event => {
      events.push(event);
      if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") resolve(event);
    });
  });
  const waitFor = async (label: string, check: (all: readonly LedgerEvent[]) => boolean, ms = 6000): Promise<void> => {
    const until = Date.now() + ms;
    while (!check(events)) {
      if (Date.now() > until) throw new Error(`recording timed out waiting for ${label}`);
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  };
  return { run: started.run, control: started.control, events, ended, waitFor };
}

export function recordRun(lab: Lab, label: string, handle: RunHandle): RawRun {
  return rawRun(lab.sdk, label, handle.events);
}

export function gate(): { promise: Promise<void>; open(): void } {
  let open: () => void = () => undefined;
  const promise = new Promise<void>(resolve => { open = resolve; });
  return { promise, open };
}

/** The SDK's projection at every prefix of an event list. Also used for ledgers read back from disk. */
export function rawRun(sdk: Sdk, label: string, source: readonly LedgerEvent[]): RawRun {
  const events = source.map(event => JSON.parse(JSON.stringify(event)) as LedgerEvent);
  const projections = events.map((_, index) => sdk.projectInputReceipts(events.slice(0, index + 1)).map(one => JSON.parse(JSON.stringify(one)) as Dict));
  return { label, events, projections };
}
