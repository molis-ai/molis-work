import { BUSINESS_HOST_TOOLS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { GATEWAY_TOOLS, gatewayProblem, gatewayReview, prologueActionGateway } from "./prologue-action-gateway.js";
import { createPrologueSurfaces, surfaceRules, SURFACE_GUIDANCE, type PrologueSurfacePorts, type PrologueSurfaces } from "./prologue-surfaces.js";
import { ANNOUNCE_HELD, BUTTON_CLAIM_HELD, MEMORY_CLAIM_HELD, MEMORY_OFF_HELD, WRITTEN_CALL_HELD, announcesWithoutActing, claimsButton, claimsMemoryChange, internalIdsHeld, mentionsInternalIds, writesToolCallAsText } from "./announce-guard.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { createPluginBuilderAgent, type PluginBuilderAgentOptions } from "./plugin-builder.js";
import { createPrologueInference } from "./prologue-inference.js";
import type { PrologueInferenceClient } from "../inference.js";
import { prologueActionTools, agentActionToolName } from "./prologue-action-tools.js";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { BUILT_IN_ADAPTERS, DEFAULT_CONTEXT_WINDOW_TOKENS, SYSTEM_TOOL_NAMES, createAdapterRegistry, createRuntime, prepareSkillIntent, fillSkillBody, redactText, screenInbound, type Skill, type ExactRef, type Runtime, type ModelEvent } from "@prologue/sdk";
import { createNodeHost } from "@prologue/sdk/node";
/** Start refusals the runtime raises before it creates a run: validation and context packing. */
// Codes the runtime raises before it creates a run: nothing ran, so the attempt is a settled refusal.
const REFUSED_BEFORE_RUN = new Set(["AGENT_START_INVALID", "CONTEXT_BUDGET_EXCEEDED", "CONTEXT_SOURCE_MISSING", "CONTEXT_INBOUND_HELD", "EFFECT_RECONCILE_REQUIRED"]);
import path from "node:path";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { acquirePrologueStorageOwner } from "./prologue-storage-owner.js";

import {
  PrologueAgentAdapter,
  PrologueAdapterError,
  type PrologueAdapterPorts,
  type PrologueRuntimePort,
  type PrologueStartInput,
  type PrologueRestoredSession,
  type PrologueRunTiming,
} from "./prologue.js";
import type { PrologueEvent, PrologueUsageReceipt } from "./prologue-stream.js";
import { createPrologueSubagents, verifySubagentStart, exactCharacterKey, type PrologueSubagentRoot } from "./prologue-subagents.js";
import { createPrologueMcpLibrary, mcpConnectionId, type HostMcpConnection } from "./prologue-mcp.js";
import { createPrologueCheckpoints, type PrologueRewindIntent } from "./prologue-checkpoints.js";
import { createPrologueGitReviews, type PrologueGitReviewPort } from "./prologue-git.js";
import { createPrologueCompactor } from "./prologue-compaction.js";
import { createPrologueSkillLibrary } from "./prologue-methods.js";
import { createPrologueTaskBoards, codingExecutionRules } from "./prologue-taskboard.js";
import { createProjectWork, projectWorkDigest, workPaths } from "./prologue-project-work.js";
import { createSessionMessages, MAX_BROADCAST } from "./prologue-messages.js";
import { createPrologueWaits } from "./prologue-waits.js";
import { resolveModelHostname } from "./node-model-dns.js";
import { agentTextMaterialContent } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentReviewReceipt, AgentRunRef, AgentRuntimeDiagnostics } from "@molis-ai/molis-work-contracts/services/agent-host";
import { PrologueApprovalBridge, type ProloguePendingPort } from "./prologue-approvals.js";
import type { AgentReviewQueue } from "../reviews.js";

/**
 * The SDK-specific Node composition, with colocated SDK helpers.
 *
 * It adapts the SDK's shapes to the narrow port the adapter needs, so the
 * adapter's behavior stays testable without a model, a network or a disk.
 *
 * The packed SDK is exercised with MiniMax by prologue-node-live.test.ts.
 * This verifies the execution boundary; product entry and recovery need their
 * own end-to-end verification.
 */

/**
 * What Prologue's own adapter table says: which protocol keys exist, and which
 * of them lets us set a cache breakpoint.
 *
 * Read from the SDK rather than copied into a list of our own, so a rename over
 * there reaches our tests instead of quietly diverging. SDK imports stay within the Node composition and its colocated helpers;
 * the runtime port and plugin remain independent of SDK implementation types.
 */
export function prologueProtocolFacts(): ReadonlyArray<{
  readonly protocol: string;
  readonly prompt_cache: boolean;
}> {
  return BUILT_IN_ADAPTERS.map((adapter) => ({
    protocol: adapter.protocol,
    prompt_cache: adapter.supportsPromptCache === true,
  }));
}

/** Whether Prologue would accept this protocol name. Throwing is its own answer. */
export function prologueAcceptsProtocol(protocol: string): boolean {
  const select = createAdapterRegistry(BUILT_IN_ADAPTERS);
  try {
    select(protocol);
    return true;
  } catch {
    return false;
  }
}

export interface PrologueNodeAdapterOptions extends PrologueAdapterPorts {
  /** Parsers the App supplies for documents people bring (PDF…); the runtime ships none. */
  documentParsers?: readonly import("@molis-ai/molis-work-contracts/services/agent-host").AgentDocumentParser[];
  /** Host-owned surface; absence keeps all writes unavailable. */
  reviewQueue?: AgentReviewQueue;
  /**
   * The side panel's browser pages (specs/side-panel): attached to a business round in their project, looked at and
   * driven only through Prologue's interface control. Absent: no round gets the surface tools.
   */
  surfaces?: PrologueSurfacePorts;
  /** App identity Prologue records against this Runtime's work. */
  app: { readonly appId: string; readonly appVersion: string };
  /** Where the Node host keeps its own storage. A Host fact, never surfaced to Plugins. */
  storageRoot?: string;
  /**
   * Turns a Molis Work credential reference into the actual key.
   *
   * The two systems keep separate credential stores, so a reference minted by
   * Molis Work means nothing to Prologue. The key crosses here, once per
   * reference, and is handed straight to Prologue's own store in exchange for a
   * reference it can resolve. Without this, a Run reaches the provider with a
   * reference that resolves to nothing.
   */
  resolveCredential?: (credentialRef: string) => string | null | Promise<string | null>;
  resolveMcpConnection?: (connectionId: string, endpoint: string) => HostMcpConnection | Promise<HostMcpConnection>;
  subscribeMcpConnections?: (listener: (connectionId: string) => void) => () => void;
}

// This resource combines base/role/Character/project instructions, selected
// methods and recovery context. The SDK default is for one instruction file;
// it must not silently cut a valid 20,000-character published Character.
const MAX_COMPOSED_INSTRUCTION_CHARS = 64_000;
/** Turns a subagent may take when its dispatch does not say; the user set it to 20. */
/** Output limit per model call while thinking is on (the user's choice); only a ceiling, usage is what the model spends. */
export const THINKING_OUTPUT_TOKENS = 32_768;
export const SUBAGENT_DEFAULT_TURNS = 20;
/** Turns a round started without a budget may take: the SDK's own default, unchanged. */
const ROUND_DEFAULT_TURNS = 8;
/** One model call's wait for its answer to start, and between its parts, when the round has no time budget. */
export const MODEL_CALL_TIMEOUT_MS = 180_000;
/** Images a model call can carry, as recognised from their bytes. */
const IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * Build the Prologue Runtime on the Node host.
 *
 * Without a Host review owner it stays read-only. Attaching that owner enables
 * workspace writes with untrusted approval; each writing role must also pass
 * the capability matrix and its frozen tool allowlist.
 */
export async function createPrologueNodeAdapter(
  options: PrologueNodeAdapterOptions,
): Promise<PrologueAgentAdapter & { inference: PrologueInferenceClient; createBuilderAgent(options: PluginBuilderAgentOptions): ReturnType<typeof createPluginBuilderAgent>; gitReviews?: PrologueGitReviewPort;
  surfaces?: { decide(decision: Parameters<PrologueSurfaces["decide"]>[0]): void }; assertDirectoriesIdle(paths: readonly string[]): Promise<void> }> {
  const release = options.storageRoot ? acquirePrologueStorageOwner(options.storageRoot) : () => {};
  try {
    const adapter = await initializePrologueNodeAdapter(options);
    const close = adapter.close.bind(adapter);
    let closing: Promise<void> | undefined;
    adapter.close = () => closing ??= (async () => {
      await close();
      release();
    })();
    return adapter;
  } catch (error) { release(); throw error; }
}

async function initializePrologueNodeAdapter(options: PrologueNodeAdapterOptions) {
  // Async context holds only a trusted denial guard, never serializes it in a Run.
  const dispatchGuards = new AsyncLocalStorage<() => void | Promise<void>>();
  const host = createNodeHost({
    ...(options.storageRoot === undefined ? {} : { storageRoot: options.storageRoot }),
    resolveHost: resolveModelHostname,
    beforeNetworkDispatch: async () => { await dispatchGuards.getStore()?.(); },
    // A model call that got no response at all (the connection dropped) is sent again under the retry policy, rather
    // than ending the round: the person's decision (2026-09-27), knowing a dropped request may be billed twice.
    retryUnansweredModelCalls: true,
  });
  // Timed work the runtime keeps across restarts. Its runner is attached here, once; the Host registers what each kind
  // does later, so a task that falls due while the Host is still starting waits for its runner instead of failing.
  // The Host's private directory images are taken in from (authorized once, on first use).
  let intakeRoot: Promise<{ path: string; ref: ExactRef<"authorized-root"> }> | undefined;
  const scheduleRunners = new Map<string, (task: import("@molis-ai/molis-work-contracts/services/agent-host").AgentScheduledTask) => Promise<void>>();
  const scheduledView = (task: import("@prologue/sdk").QueuedTask): import("@molis-ai/molis-work-contracts/services/agent-host").AgentScheduledTask => ({
    task_id: task.ref.id, key: task.key, session_id: task.sessionRef.id, kind: task.work.kind, payload: { ...task.work.payload },
    due_at: new Date(task.dueAtMs).toISOString(), state: task.state, attempts: task.attempts, runs: task.runs, ...(task.lastFailure ? { last_failure: task.lastFailure } : {}) });
  const runScheduled = async (task: import("@prologue/sdk").QueuedTask): Promise<void> => {
    for (let waited = 0; !scheduleRunners.has(task.work.kind) && waited < 120_000; waited += 500) await new Promise(resolve => setTimeout(resolve, 500));
    const run = scheduleRunners.get(task.work.kind);
    if (!run) throw new Error(`没有处理「${task.work.kind}」的执行者`);
    await run(scheduledView(task));
  };
  // Bound after the runtime exists; the redactor it is given below reaches it only when a screenshot is taken.
  let surfaceHost: PrologueSurfaces | undefined;
  const runtime = await createRuntime({
    app: options.app,
    host,
    // Screenshots leave only after the driver covered password, card and one-time-code fields (spec D10).
    ...(options.surfaces ? { surfaces: { screenshots: "redact" as const,
      redactScreenshot: (bytes: Uint8Array) => surfaceHost ? surfaceHost.redact(bytes) : Promise.reject(new Error("界面控制尚未就绪")) } } : {}),
    preset: "local-agent",
    onQueuedWork: runScheduled,
    ...(options.documentParsers?.length ? { slots: { "document-parser": { implementation: "molis-host-document-parsers", version: "1.0.0", impl: options.documentParsers } } } : {}),
    // The runtime's turn default is what a subagent gets when its dispatch names none; the user set it to 20.
    // A request between sessions may wait for the other side's whole round, or a restart: a week, not half an hour.
    // Background commands belong to the session and keep running after its round (the person's decision), at most four
    // at a time; a parked session waits up to a week, like a request.
    config: { delivery: { defaultTtlMs: 7 * 24 * 60 * 60 * 1000, maxPeopleBodyChars: 24_000 }, background: { outliveRun: true, maxPerSession: 4 }, waits: { defaultTtlMs: 7 * 24 * 60 * 60 * 1000 }, agent: { maxTurns: SUBAGENT_DEFAULT_TURNS }, tool: { deferToolSchemasBeyond: 20, maxTimeoutMs: 300_000, observation: { maxLines: 1000, maxBytes: 64 * 1024 } }, context: { maxInstructionChars: MAX_COMPOSED_INSTRUCTION_CHARS }, resource: { publish: { maxBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 }, intake: { maxItemBytes: 32 * 1024 * 1024, maxBatchBytes: 128 * 1024 * 1024 } }, model: { images: { maxResponseBytes: 40 * 1024 * 1024, maxImageBytes: 20 * 1024 * 1024, maxImages: 4 } } },
    network: { model: true, mcp: true, loopback: true },
    posture: options.reviewQueue
      ? { sandbox: "workspace-write", approval: "untrusted" }
      : { sandbox: "read-only", approval: "on-request" },
    ...(options.reviewQueue ? { permissionMode: { mode: "auto-allow" as const, allow: [{ what: "tool" as const, name: "board-report" }, { what: "tool" as const, name: "session-send" }] }, rules: [...codingExecutionRules,
      // A change through the business gateway always stops for the person's review of its exact input; its reads do not.
      { source: "runtime" as const, effect: "ask" as const, match: { what: "tool" as const, name: GATEWAY_TOOLS.change } },
      // A reversible change the person lets run without asking: the gateway itself refuses any other change on this tool.
      { source: "runtime" as const, effect: "allow" as const, match: { what: "tool" as const, name: GATEWAY_TOOLS.direct } },
      // The side panel's browser: looking is allowed, every action asks, the person's standing site decisions apply.
      ...(options.surfaces ? surfaceRules() : [])] } : {}),
    require: ["secrets", "network", "clock", "workspace.read", "storage"],
  });

  const readResourceText = async (ref: ExactRef<"resource">): Promise<string> => {
    const handle = runtime.resources.inspect(ref);
    if (!handle || handle.byteLength > 1024 * 1024) throw new Error("要输入的文字不可读取");
    const bytes = new Uint8Array(handle.byteLength);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const chunk = await runtime.resources.readChunk(ref, offset, Math.min(64 * 1024, bytes.byteLength - offset));
      if (!chunk.bytes.byteLength) break;
      bytes.set(chunk.bytes, offset); offset += chunk.bytes.byteLength;
    }
    return new TextDecoder().decode(bytes.subarray(0, offset));
  };
  surfaceHost = options.surfaces ? createPrologueSurfaces(() => runtime, options.surfaces, readResourceText) : undefined;
  // Sites the person allowed earlier, as approvals the person can take back at once (not as rules fixed at start).
  if (surfaceHost && options.reviewQueue) for (const entry of options.surfaces!.siteDecisions()) if (entry.decision === "allow") surfaceHost.decide(entry);
  const mcpLibrary = createPrologueMcpLibrary(runtime, {
    withDispatchGuard: (guard, operation) => {
      const inherited = dispatchGuards.getStore();
      return dispatchGuards.run(async () => { await inherited?.(); await guard(); }, operation);
    },
    resolveConnection: options.resolveMcpConnection,
    subscribeConnections: options.subscribeMcpConnections,
    credentialRefFor: (ref) => credentials.prologueRefFor(ref),
  });
  const registeredMethods = new Map<string, Skill>();
  const sessions = new Map<string, ExactRef<"session">>();
  const actionToolSessions = new Set<string>();
  /** The gateway a business session's latest round runs with, for describing a held change to the person. */
  const gatewayRuns = new Map<string, NonNullable<PrologueStartInput["action_gateway"]>>();
  /** Per session, the capabilities the round now running has seen offered (so one gone later reads as taken away). */
  const gatewayKnown = new Map<string, Set<string>>();
  const gatewayHooks = new Set<string>();
  // Rounds that may change things: an ending that only announces the next step is held once per run.
  /** Per session, what the round now running really kept and forgot (only for sessions given memory tools). */
  const memoryRounds = new Map<string, { keep: number; forget: number; off: boolean; spoken: string }>();
  /** The exact Prologue references of the memories the Host chose for a run (set with the memory capability below). */
  let memoryRefs: (pinned: readonly import("@molis-ai/molis-work-contracts/services/agent-host").AgentPinnedMemory[]) => Promise<import("@prologue/sdk").ExactRef<"memory">[]> = async () => [];
  // Suggestions this round really made, for the same check: a reply may not say a button is ready when none was.
  const offerRounds = new Map<string, { offered: number }>();
  const stopGuards = new Map<string, { writing: boolean; held: Set<string> }>();
  const actionControllers = new Map<string, AbortController>();
  const runRoots = new Map<string, ExactRef<"authorized-root">>();
  const activeRuns = new Map<string, { live(): boolean; steer(text: string): Promise<void> }>();
  /** Which session each run belongs to, for "is another round using this page right now" (the side panel browser). */
  const runSessions = new Map<string, string>();
  const reviewEffects = new Map<string, ExactRef<"effect">>();
  const deadlines = new Map<string, number>();
  type CommandEvent = Extract<ModelEvent, { type: "command-receipt" }>;
  const commandEvents = new Map<string, CommandEvent[]>();
  const subagentBridgeErrors = new Map<string, Record<string, string>>();
  const readResource = async (ref: ExactRef<"resource">) => {
    const handle = runtime.resources.inspect(ref);
    if (!handle || handle.byteLength > 8 * 1024 * 1024) throw new Error("完整执行资源不可读取，不能使用截断内容");
    const bytes = new Uint8Array(handle.byteLength);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const chunk = await runtime.resources.readChunk(ref, offset, Math.min(64 * 1024, bytes.byteLength - offset));
      if (chunk.offset !== offset || !chunk.bytes.byteLength || offset + chunk.bytes.byteLength > bytes.byteLength) throw new Error("执行资源不完整");
      bytes.set(chunk.bytes, offset); offset += chunk.bytes.byteLength;
      if (chunk.done && offset !== bytes.byteLength) throw new Error("执行资源提前结束");
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  };
  const gitDecisionKind = `molis-git-review-${createHash("sha256").update(options.app.appId).digest("hex").slice(0, 24)}`;
  const updateGitDecision = async (id: string, patch: { failure_reason?: string; reconciliation?: NonNullable<AgentReviewReceipt["reconciliation"]> }) => {
    const record = await host.storage.get({ kind: gitDecisionKind, id });
    if (!record || record.tombstoned) throw new Error("原 Git 审查记录不可读取");
    const original = await host.storage.readSecure({ kind: gitDecisionKind, id });
    let bytes: Uint8Array | undefined;
    try {
      const decision = JSON.parse(new TextDecoder().decode(original));
      bytes = new TextEncoder().encode(JSON.stringify({ ...decision, ...patch }));
      await host.storage.commit({ kind: gitDecisionKind, id, expectedVersion: record.version, metadata: { schema: 1 }, secureBody: bytes });
    } finally { original.fill(0); bytes?.fill(0); }
  };
  const gitReviews = options.reviewQueue ? createPrologueGitReviews({ runtime, queue: options.reviewQueue,
    publish: value => stageTextResource(runtime, JSON.stringify(value), "git-index-review"), read: readResource,
    async saveDecision(id, value) {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      try { await host.storage.commit({ kind: gitDecisionKind, id, expectedVersion: 0, metadata: { schema: 1 }, secureBody: bytes }); }
      finally { bytes.fill(0); }
    },
    async saveFailure(id, reason) {
      await updateGitDecision(id, { failure_reason: reason });
    },
    saveReconciliation: (id, reconciliation) => updateGitDecision(id, { reconciliation }),
    async readDecision(id) {
      const record = await host.storage.get({ kind: gitDecisionKind, id });
      if (!record || record.tombstoned) return undefined;
      const bytes = await host.storage.readSecure({ kind: gitDecisionKind, id });
      try { return JSON.parse(new TextDecoder().decode(bytes)); } finally { bytes.fill(0); }
    },
  }) : undefined;
  const sameRef = (a: { kind?: unknown; id?: unknown; revision?: unknown } | undefined, b: { kind: string; id: string; revision: number }) =>
    a?.kind === b.kind && a.id === b.id && a.revision === b.revision;
  const pendingPort: ProloguePendingPort = {
      async read(ref) {
        const pending = await runtime.effects.pendings.read(ref);
        if (!pending) return undefined;
        const clock = await host.readClock();
        let expiresAtWallMs = deadlines.get(ref.id);
        if (expiresAtWallMs === undefined) {
          expiresAtWallMs = clock.wallTimeMs + Math.max(0, pending.expiresAtMs - clock.monotonicMs);
          deadlines.set(ref.id, expiresAtWallMs);
        }
        return { ...pending, expiresAtWallMs };
      },
      async canAnswer(ref) {
        // EffectChain.whenSettled and ordinary Pending waits have different
        // wait registries in this SDK. hasLiveWaiter only covers the latter.
        // Require the actual live SDK Run plus its exact still-waiting effect;
        // restored references never enter activeRuns and cannot be approved.
        const pending = runtime.effects.pendings.get(ref);
        const effect = pending?.effectRef && runtime.effects.get(pending.effectRef);
        return pending?.state === "open" && effect?.state === "awaiting-approval"
          && effect.pending?.ref.id === ref.id && effect.pending.ref.revision === ref.revision
          && Boolean(pending.origin?.run && activeRuns.get(pending.origin.run)?.live());
      },
      async answer(ref, answer) { return runtime.effects.pendings.answer(ref, answer, await host.readClock()); },
      async document(pending) {
        const effect = pending.effectRef && runtime.effects.get(pending.effectRef);
        const ref = effect?.proposal.reviewRef;
        if (!effect || effect.proposal.origin?.session !== pending.origin?.session
          || effect.proposal.origin?.run !== pending.origin?.run) throw new Error("原始审查或执行归属不可用，不能批准");
        const subject = effect.proposal.subject;
        if (subject.what === "tool" && ["dispatch-subagent", "steer-subagent"].includes(subject.name)) {
          const index = await readIndex(pending.origin!.session!);
          const attempt = index?.attempts.find(item => item.run_id === pending.origin!.run);
          if (!attempt?.frozen.host_tools.includes(subject.name) || typeof subject.input !== "string") throw new Error("子任务操作不属于本轮固定工具");
          const args = JSON.parse(subject.input);
          if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("子任务操作参数无效");
          reviewEffects.set(`prologue:${pending.ref.id}`, effect.ref);
          // Readable first — who is sent, to do what, with which tools and where — with the exact arguments kept for audit.
          const roleKey = typeof args.character === "string" ? args.character.split("@")[0] : "";
          const role = attempt.subagent_roles?.find(([key]) => key === roleKey)?.[1];
          const root = typeof args.workspace === "string" ? attempt.subagent_roots?.find(entry => entry.id === args.workspace) : undefined;
          const readable = [
            ...(role ? [{ label: "子任务角色", value: role.name }] : []),
            ...(typeof args.instruction === "string" ? [{ label: subject.name === "dispatch-subagent" ? "分工" : "补充要求", value: args.instruction }] : typeof args.text === "string" ? [{ label: "补充要求", value: args.text }] : []),
            ...(Array.isArray(args.tools) ? [{ label: "可用工具", value: args.tools.join("、") }] : []),
            ...(root ? [{ label: "工作目录", value: root.path }] : []),
          ];
          return { kind: "tool-operation", tool: subject.name, summary: subject.name === "dispatch-subagent" ? (attempt.subagent_roots?.length ? "分派独立目录子任务；修改仍需审查，结果仍需核对" : "分派只读子任务；结果仍需核对") : "向原子任务补充要求",
            fields: [...readable, { label: "本次完整参数", value: JSON.stringify(args, null, 2) }] };
        }
        // An action on the side panel's browser: the card says on which site, what, and — for a file — which one.
        if (subject.what === "surface") {
          reviewEffects.set(`prologue:${pending.ref.id}`, effect.ref);
          const verbs: Record<string, string> = { pointer: "点击页面", key: "按键", text: "输入文字", navigate: "打开网址", wait: "等待页面", upload: "向网站上传本机文件", download: "把文件存到本机" };
          const label = effect.proposal.summary.replace(/^On this \w+: /u, "").replace(/\.$/u, "");
          const typed = subject.action === "text" && effect.proposal.reviewRef ? await readResourceText(effect.proposal.reviewRef).catch(() => undefined) : undefined;
          const detail = surfaceHost ? await surfaceHost.describe(pending.origin?.session ?? "", subject.action, label, typed) : label;
          const where = subject.scope === "about:blank" ? "空白页" : subject.scope;
          return { kind: "tool-operation", tool: "surface-act", summary: `在 ${where} ${verbs[subject.action] ?? subject.action}`,
            fields: [{ label: "网站", value: where }, { label: "动作", value: verbs[subject.action] ?? subject.action }, { label: "详情", value: detail },
              ...(subject.action === "upload" ? [{ label: "注意", value: "上传会把这个文件发送给该网站，确认前请核对文件" }] : [])] };
        }
        // Stopping a background command has no review resource of its own: the card names the command it stops.
        if (subject.what === "tool" && subject.name === "command-stop") {
          if (typeof subject.input !== "string") throw new Error("停止命令的参数不可读，不能批准");
          const args = JSON.parse(subject.input);
          const handle = args && typeof args === "object" && typeof args.handle === "string" ? args.handle : "";
          const task = handle ? runtime.background.get(handle) : undefined;
          reviewEffects.set(`prologue:${pending.ref.id}`, effect.ref);
          return { kind: "tool-operation", tool: subject.name, summary: task ? "停止一条后台命令" : "停止一条命令",
            fields: [{ label: "命令", value: task?.summary ?? handle }, ...(task ? [{ label: "现在", value: task.state === "running" ? "还在运行" : task.state }] : []),
              { label: "本次完整参数", value: JSON.stringify(args, null, 2) }] };
        }
        if (subject.what === "tool" && subject.name === GATEWAY_TOOLS.change) {
          if (typeof subject.input !== "string") throw new Error("所请求修改的参数不可读，不能批准");
          const index = await readIndex(pending.origin!.session!);
          const attempt = index?.attempts.find(item => item.run_id === pending.origin!.run);
          const gateway = gatewayRuns.get(pending.origin!.session!);
          if (!attempt?.frozen.action_gateway || !gateway) throw new Error("这项修改不属于本轮的能力网关，不能批准");
          reviewEffects.set(`prologue:${pending.ref.id}`, effect.ref);
          const readable = await gatewayReview(gateway, subject.input);
          return { kind: "tool-operation", tool: subject.name, summary: readable.summary, fields: readable.fields };
        }
        if (subject.what === "tool" && subject.name.startsWith("molis-action-")) {
          if (typeof subject.input !== "string") throw new Error("Action arguments are unavailable");
          const index = await readIndex(pending.origin!.session!);
          const attempt = index?.attempts.find(item => item.run_id === pending.origin!.run);
          const selected = attempt?.action_tool_scope && attempt.frozen.action_tools?.find(ref => agentActionToolName(ref, attempt.action_tool_scope!) === subject.name);
          if (!selected) throw new Error("Action is outside this run's frozen tools");
          const args = JSON.parse(subject.input);
          if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Invalid action arguments");
          reviewEffects.set(`prologue:${pending.ref.id}`, effect.ref);
          return { kind: "tool-operation", tool: subject.name, summary: runtime.tools.get(subject.name)?.description ?? selected.capability_id,
            fields: [{ label: "Capability", value: selected.capability_id }, { label: "Version", value: String(selected.version) },
              { label: "Provider", value: selected.provider_id }, { label: "Arguments", value: JSON.stringify(args, null, 2) }] };
        }
        if (subject.what === "tool" && subject.name.startsWith("mcp:")) {
          if (typeof subject.input !== "string") throw new Error("MCP 原始参数不可读，不能批准");
          const index = await readIndex(pending.origin!.session!);
          const attempt = index?.attempts.find(item => item.run_id === pending.origin!.run);
          const selected = attempt?.frozen.mcp_tools.find(item => `mcp:${mcpConnectionId(item)}/${item.tool}` === subject.name);
          if (!selected?.version) throw new Error("MCP 操作不属于本轮固定工具，不能批准");
          const args = JSON.parse(subject.input);
          if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("MCP 原始参数格式无效");
          reviewEffects.set(`prologue:${pending.ref.id}`, effect.ref);
          return { kind: "mcp", server: selected.server_label ?? selected.server, tool: selected.tool, arguments_json: subject.input };
        }
        if (!ref) throw new Error("原始审查资源不可用，不能批准");
        const review = await readResource(ref);
        const root = pending.origin?.run && runRoots.get(pending.origin.run);
        if (!root || review.rootRef?.kind !== root.kind || review.rootRef?.id !== root.id || review.rootRef?.revision !== root.revision) throw new Error("审查工作区与本轮授权不一致");
        const index = pending.origin?.session ? await readIndex(pending.origin.session) : undefined;
        const childDirectory = index?.parent_run && index.attempts.find(attempt => attempt.run_id === pending.origin?.run)?.frozen.directory?.canonical_path;
        if (review.kind === "workspace-command" && review.version === 1
          && typeof review.executable === "string" && Array.isArray(review.argv) && review.argv.every((arg: unknown) => typeof arg === "string")
          && typeof review.cwd === "string" && Number.isFinite(review.timeoutMs) && review.timeoutMs > 0
          && Array.isArray(review.envAllowlist) && review.envAllowlist.every((name: unknown) => typeof name === "string") && typeof review.escalate === "boolean") {
          reviewEffects.set(`prologue:${pending.ref.id}`, effect.ref);
          return { kind: "command", ...(childDirectory ? { workspace_path: childDirectory } : {}), command: review.executable, args: review.argv, cwd: review.cwd,
            timeout_ms: review.timeoutMs, env_allowlist: review.envAllowlist, escalate: review.escalate,
            ...(review.background === true ? { background: true, outlives_run: review.outlivesRun === true } : {}) };
        }
        if (review.kind !== "workspace-patch" || review.version !== 1 || typeof review.path !== "string"
          || typeof review.baseExists !== "boolean" || typeof review.baseText !== "string" || typeof review.nextText !== "string") throw new Error("这类操作的完整审查尚未接通，不能批准");
        reviewEffects.set(`prologue:${pending.ref.id}`, effect.ref);
        // A file this round writes joins its work's scope; other work under way that covers it is named on the card.
        const work = pending.origin?.run ? runWork.get(pending.origin.run) : undefined;
        let concurrent: string[] = [];
        if (work) {
          void projectWork.touch(work.project, work.id, review.path).catch(() => undefined);
          try {
            const seen = await projectWork.read(work.project, { session_id: work.session.id, directory: work.directory, paths: [review.path] });
            concurrent = seen.overlaps.map(overlap => `会话「${overlap.work.title.slice(0, 40)}」（${overlap.work.state === "running" ? "进行中" : "等待开始"}）`);
          } catch { /* the card still shows the change itself */ }
        }
        return { kind: "text-edit", ...(childDirectory ? { workspace_path: childDirectory } : {}), target_path: review.path, exists: review.baseExists,
          before_text: review.baseExists ? review.baseText : null, after_text: review.nextText, ...(concurrent.length ? { concurrent } : {}) };
      },
  };
  const approvals = options.reviewQueue && new PrologueApprovalBridge({
    queue: options.reviewQueue, pendings: pendingPort,
    async recordRequest(pending, request) {
      await rememberReview(pending.origin!.session!, pending.ref.id, options.reviewQueue!.receipt(request.review_id)!);
    },
    async recordDecision(pending, receipt) {
      if (!pending.origin?.session) throw new Error("审查缺少会话归属，不能保存决定");
      await rememberReview(pending.origin.session, pending.ref.id, receipt);
      // Save the existing Host decision and durable steer before denying the
      // pending: the next model boundary must not race ahead of the feedback.
      // Failure keeps the original delivery_error path; never claim receipt.
      if (receipt.status === "rejected" && receipt.note?.trim()) {
        const active = pending.origin.run && activeRuns.get(pending.origin.run);
        if (!active || !active.live()) throw new Error("原执行已结束，修改意见尚未交给 Agent");
        const request = options.reviewQueue!.get(receipt.review_id)!;
        const document = request.document;
        const target = document.kind === "text-edit" ? document.target_path
          : document.kind === "command" ? [document.command, ...document.args].join(" ")
          : document.kind === "tool-operation" ? `${document.tool}：${document.summary}`
          : document.kind === "mcp" ? `${document.server} / ${document.tool}` : request.kind;
        await active.steer(`用户拒绝了这一次待审操作，并给出修改意见。原审查：${JSON.stringify(receipt.review_id)}；对象：${JSON.stringify(target)}。\n用户意见：\n${receipt.note}\n\n这条意见不批准任何写入，也不撤销已发生的其他操作。请结合当前任务核对并修改提案；新的操作仍须经过原宿主审查。`);
      }
    },
  });
  const restoredReviewBoards = new Set<string>();
  const detachReviews = options.reviewQueue?.registerRefresh(async boardId => {
    if (!restoredReviewBoards.has(boardId)) {
      const report = await runtime.effects.readRecovery();
      if (report.unavailable.length) throw new Error("部分执行审查历史不可读，请保留当前内容后重试");
      for (const effect of report.effects) {
        const pending = effect.pending;
        if (!pending?.origin?.session || !pending.origin.run) continue;
        const index = await readIndex(pending.origin.session);
        if (!index || index.owner.board_id !== boardId) continue;
        const attempt = index.attempts.find(item => item.run_id === pending.origin!.run);
        if (!attempt?.root_ref || activeRuns.has(pending.origin.run)) continue;
        runRoots.set(pending.origin.run, attempt.root_ref);
        const restored = await pendingPort.read(pending.ref);
        if (!restored) throw new Error("审查历史的待批引用不可读");
        const document = await pendingPort.document(restored);
        const decision = index.review_decisions?.[pending.ref.id];
        const request = { review_id: `prologue:${pending.ref.id}`, run: { session_id: pending.origin.session, run_id: pending.origin.run },
          board_id: boardId, plugin_id: index.owner.plugin_id, kind: document.kind, document,
          requested_at: decision?.requested_at ?? new Date(effect.preparedAtMs).toISOString(), expires_at: decision?.expires_at ?? null };
        if (decision && decision.status !== "pending") {
          const { status, decided_by, decided_at, note } = decision;
          options.reviewQueue!.restoreDecision(request, { status, decided_by, decided_at, note });
        } else {
          // No durable cancellation time exists in older records. Never turn
          // the time of opening history into a fictional execution event.
          options.reviewQueue!.restoreDecision(request, { status: "cancelled", decided_by: null, decided_at: null,
            note: "历史操作没有可恢复的批准；保留原提案供核对，不会重新执行" });
          await rememberReview(pending.origin.session, pending.ref.id, options.reviewQueue!.receipt(request.review_id)!);
        }
      }
      restoredReviewBoards.add(boardId);
    }
    for (const request of options.reviewQueue!.list(boardId)) {
      const ref = reviewEffects.get(request.review_id);
      if (!ref) continue;
      const effect = runtime.effects.get(ref);
      const receipt = options.reviewQueue!.receipt(request.review_id);
      if (!effect || receipt?.effect_settled || receipt?.effect_error) continue;
      if (receipt?.status === "pending" && ["cancelled", "denied"].includes(effect.state)) {
        options.reviewQueue!.cancel(request.review_id, "执行方已结束这笔操作");
      } else if (receipt?.status === "approved") {
        const dispatched = await runtime.effects.inspectDispatch(ref);
        if (effect.state === "completed" && dispatched.state === "dispatched" && dispatched.ok === true) {
          options.reviewQueue!.settle(request.review_id, { ok: true });
        } else if (["failed", "denied", "cancelled"].includes(effect.state) && dispatched.state !== "unknown") {
          options.reviewQueue!.settle(request.review_id, { ok: false, error: "执行未完成，请查看本轮工具结果；不会自动重试" });
        }
      }
      const latest = options.reviewQueue!.receipt(request.review_id);
      if (latest && ["cancelled", "expired"].includes(latest.status) && effect.pending?.origin?.session) {
        await rememberReview(effect.pending.origin.session, effect.pending.ref.id, latest);
      }
    }
  });
  // App provenance is encrypted in the existing Host store. Model events and
  // conversation remain solely in Prologue's session ledger.
  const indexKind = `molis-agent-index-${createHash("sha256").update(options.app.appId).digest("hex").slice(0, 24)}`;
  const indexes = new Map<string, { value: SessionIndex; version: number }>();
  const indexUpdates = new Map<string, Promise<void>>();
  const saveIndex = async (value: SessionIndex): Promise<void> => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    try {
      const record = await host.storage.commit({ kind: indexKind, id: value.ref.id,
        expectedVersion: indexes.get(value.ref.id)?.version ?? 0, metadata: { schema: 1 }, secureBody: bytes });
      indexes.set(value.ref.id, { value: structuredClone(value), version: record.version });
    } finally { bytes.fill(0); }
  };
  const readIndex = async (id: string): Promise<SessionIndex | undefined> => {
    const held = indexes.get(id);
    if (held) return structuredClone(held.value);
    const record = await host.storage.get({ kind: indexKind, id });
    if (!record || record.tombstoned) return undefined;
    const bytes = await host.storage.readSecure({ kind: indexKind, id });
    try {
      const value: SessionIndex = JSON.parse(new TextDecoder().decode(bytes));
      if (value.schema !== 1 || value.ref?.id !== id || value.ref?.kind !== "session"
        || typeof value.title !== "string" || !Array.isArray(value.attempts)
        || ![value.owner?.board_id, value.owner?.plugin_id, value.owner?.install_id].every(v => typeof v === "string" && v.length > 0)) {
        throw new Error("Coding 会话归属索引损坏，不能当作空会话继续");
      }
      if (value.workspace !== undefined && value.workspace !== "required" && value.workspace !== "none" && value.workspace !== "business"
        || value.attempts.some(attempt => (attempt.frozen.workspace ?? "required") !== (value.workspace ?? "required")
          || (value.workspace === "none" || value.workspace === "business") && (attempt.root_ref !== undefined || attempt.frozen.directory !== undefined))) {
        throw new Error("会话工作区模式索引不一致，不能猜测执行授权");
      }
      if (value.attempts.some(attempt => attempt.timing !== undefined && !validRunTiming(attempt.timing))) {
        throw new Error("Coding 显示时间索引损坏，不能猜测历史时间");
      }
      indexes.set(id, { value, version: record.version });
      return structuredClone(value);
    } finally { bytes.fill(0); }
  };
  // Start and control may overlap at a terminal boundary. Always update the
  // latest index under the same session queue; an old control closure must not
  // replace later attempts with the snapshot it captured when its run started.
  const updateIndex = async (id: string, change: (index: SessionIndex) => void): Promise<void> => {
    const previous = indexUpdates.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const index = await readIndex(id);
      if (!index) throw new Error("Coding 会话归属索引不可用，不能改变执行记录");
      change(index);
      await saveIndex(index);
    });
    indexUpdates.set(id, next);
    try { await next; }
    finally { if (indexUpdates.get(id) === next) indexUpdates.delete(id); }
  };
  // The project's work under way, on one standing SDK graph per project; what each item covers is kept beside it.
  const workKind = `molis-project-work-${createHash("sha256").update(options.app.appId).digest("hex").slice(0, 24)}`;
  const workVersions = new Map<string, number>();
  const projectWork = createProjectWork(runtime, {
    async load(project) {
      const record = await host.storage.get({ kind: workKind, id: project });
      if (!record || record.tombstoned) return {};
      workVersions.set(project, record.version);
      const bytes = await host.storage.readSecure({ kind: workKind, id: project });
      try { return JSON.parse(new TextDecoder().decode(bytes)); } finally { bytes.fill(0); }
    },
    async save(project, scopes) {
      const bytes = new TextEncoder().encode(JSON.stringify(scopes));
      try {
        const record = await host.storage.commit({ kind: workKind, id: project, expectedVersion: workVersions.get(project) ?? 0, metadata: { schema: 1 }, secureBody: bytes });
        workVersions.set(project, record.version);
      } finally { bytes.fill(0); }
    },
  }, runId => runWork.has(runId));
  /** Each session's main round running now, for messages that should reach it at once. */
  const liveSessions = new Map<string, string>();
  /** Unfinished plan steps another session handed to this one (its own plan's are not "handed"), board by board. */
  const handedSteps = (session: ExactRef<"session">) => runtime.boards.assignedTo(session)
    .filter(board => !board.standing)
    .map(board => ({ board: board.ref.id, nodes: board.nodes.filter(node => node.reports.some(report => report.handover?.to?.kind === "session" && report.handover.to.id === session.id)) }))
    .filter(board => board.nodes.length > 0);
  /** Tell a session's main round that is running now; false when it has none. */
  const steerSession = async (sessionId: string, text: string) => {
    const run = liveSessions.get(sessionId), active = run ? activeRuns.get(run) : undefined;
    if (!active?.live()) return false;
    await active.steer(text);
    return true;
  };
  const messages = createSessionMessages(runtime, {
    async owner(sessionId) {
      const index = await readIndex(sessionId).catch(() => undefined);
      return index ? { project: index.owner.board_id, ref: index.ref, subtask: Boolean(index.parent_run) } : undefined;
    },
    async title(project, sessionId) {
      const listed = (await projectWork.read(project).catch(() => ({ items: [] }))).items.find(item => item.session_id === sessionId);
      return listed?.title ?? (await readIndex(sessionId).catch(() => undefined))?.title ?? sessionId;
    },
    steer: (sessionId, text) => steerSession(sessionId, text),
    async overlapping(sessionId) {
      // The files this session's round under way names or wrote, against the other work under way in its directory.
      const index = await readIndex(sessionId).catch(() => undefined);
      if (!index) return [];
      const project = index.owner.board_id, mine = (await projectWork.read(project)).items.find(item => item.session_id === sessionId && item.state === "running");
      if (!mine) return [];
      const seen = await projectWork.read(project, { session_id: sessionId, directory: mine.directory, paths: mine.paths });
      return [...new Set(seen.overlaps.map(overlap => overlap.work.session_id))];
    },
  });
  /** Parked sessions and background commands; a wait that fires while its session runs a round is told to that round. */
  const waitsPort = createPrologueWaits(runtime, {
    project: async sessionId => (await readIndex(sessionId).catch(() => undefined))?.owner.board_id,
    title: async sessionId => {
      const index = await readIndex(sessionId).catch(() => undefined);
      if (!index) return sessionId;
      return (await projectWork.read(index.owner.board_id).catch(() => ({ items: [] }))).items.find(item => item.session_id === sessionId)?.title ?? index.title;
    },
    steer: (sessionId, text) => steerSession(sessionId, text),
  });
  /** Main rounds registered as project work: which item, in which project and directory. */
  const runWork = new Map<string, { project: string; id: string; session: ExactRef<"session">; directory: string }>();
  const stepBoards = createPrologueTaskBoards(runtime, async run => {
    const index = await readIndex(run.session_id), attempt = index?.attempts.find(attempt => attempt.run_id === run.run_id);
    return attempt && { ...attempt, session: index!.ref };
  }, async (run, text) => {
    // Only a round still running hears about changes; a settled one reads the graph when it next starts.
    const active = activeRuns.get(run.run_id);
    if (!active?.live()) return false;
    await active.steer(text);
    return true;
  }, async sessionId => {
    const index = await readIndex(sessionId);
    return index ? projectWork.boardId(index.owner.board_id) : undefined;
  }, sessionId => liveSessions.has(sessionId));
  const rememberReview = async (sessionId: string, pendingId: string, receipt: AgentReviewReceipt): Promise<void> => {
    const request = options.reviewQueue!.get(receipt.review_id);
    if (!request) throw new Error("原审查请求不可读取，不能保存决定");
    const saved = { status: receipt.status, decided_by: receipt.decided_by, decided_at: receipt.decided_at, note: receipt.note,
      requested_at: request.requested_at, expires_at: request.expires_at };
    if (isDeepStrictEqual((await readIndex(sessionId))?.review_decisions?.[pendingId], saved)) return;
    await updateIndex(sessionId, index => {
      const previous = index.review_decisions?.[pendingId];
      // The initial mirror may finish after a fast user decision. It must not
      // replace that decision with its earlier pending snapshot.
      if (saved.status === "pending" && previous && previous.status !== "pending") return;
      (index.review_decisions ??= {})[pendingId] = saved;
    });
  };
  const checkpoints = options.reviewQueue ? createPrologueCheckpoints({ runtime, queue: options.reviewQueue, readIndex, readResource,
    remember: (id, intent) => updateIndex(id, index => { (index.rewinds ??= []).push(intent); }),
    decision: (id, pendingId, receipt) => updateIndex(id, index => {
      (index.review_decisions ??= {})[pendingId] = { status: receipt.status, decided_by: receipt.decided_by, decided_at: receipt.decided_at, note: receipt.note };
    }),
  }) : undefined;
  const credentials = new PrologueCredentialBridge({
    host: { writeCredential: (input) => runtime.credentials.write(input) },
    resolve: options.resolveCredential,
  });
  const inference = createPrologueInference(runtime, async (input, signal, optional) => {
    const normalize = (value: string | null) => value?.trim() ? value : null;
    signal.throwIfAborted();
    await input.beforeDispatch?.();
    const snapshot = normalize(await input.resolveCredential(input.credential_ref));
    signal.throwIfAborted();
    const assertCurrent = async () => {
      signal.throwIfAborted();
      if (normalize(await input.resolveCredential(input.credential_ref)) !== snapshot) throw new Error("模型凭据或配置已改变");
      signal.throwIfAborted();
    };
    if (optional && snapshot === null) return { assertCurrent };
    if (snapshot === null) throw new Error("模型凭据不可用");
    const ref = await credentials.prologueRefFor(input.credential_ref, async () => { await assertCurrent(); return snapshot; }, signal);
    return { ref, assertCurrent };
  }, (guard, operation) => dispatchGuards.run(guard, operation));
  const builders = new Set<Awaited<ReturnType<typeof createPluginBuilderAgent>>>();
  let closingBuilders = false;
  const createBuilderAgent = async (input: PluginBuilderAgentOptions) => {
    if (closingBuilders) throw new Error("Agent 服务已关闭");
    const builder = await createPluginBuilderAgent(input, { runtime, writable: Boolean(options.reviewQueue),
      credentialRefFor: ref => credentials.prologueRefFor(ref, input.resolveCredential),
      withDispatchGuard: (guard, operation) => dispatchGuards.run(guard, operation) });
    if (closingBuilders) { await builder.close(); throw new Error("Agent 服务已关闭"); }
    builders.add(builder);
    const close = builder.close.bind(builder);
    builder.close = async () => { try { await close(); } finally { builders.delete(builder); } };
    return builder;
  };

  const readQuestion = async (run: AgentRunRef, id: string, revision: number) => {
    const pending = await runtime.effects.pendings.read({ kind: "pending", id, revision });
    if (!pending || pending.origin?.session !== run.session_id || pending.origin.run !== run.run_id
      || !["text", "questionnaire"].includes(pending.kind)) {
      throw new PrologueAdapterError("agent.pending_not_open", "原问题不属于本轮执行，不能提交答案");
    }
    return pending;
  };
  const questionUnavailable = (run: AgentRunRef, pending: Awaited<ReturnType<typeof readQuestion>>, now: number) =>
    pending.state !== "open" ? "这条问题已经结束，不能再次回答"
      : now >= pending.expiresAtMs ? "这条问题已过期，不能提交原答案"
      : !activeRuns.get(run.run_id)?.live() || !runtime.effects.pendings.hasLiveWaiter(pending.ref)
        ? "原执行者已经停止或离线，不能通过回答重新启动" : undefined;
  /** A run or open item of the session that no start claims: the only thing a start without a reference could have made. */
  const unclaimedWork = (index: SessionIndex, terminal: readonly { id: string }[], open: Awaited<ReturnType<typeof runtime.listOpenWork>>) =>
    terminal.some(ref => !index.attempts.some(attempt => attempt.run_id === ref.id))
    || open.items.some(item => item.origin.session === index.ref.id && !index.attempts.some(attempt => attempt.run_id === item.origin.run || attempt.run_id === item.id));
  const inspectRecovery = async (sessionId: string): Promise<import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecoveryReport> => {
    const index = await readIndex(sessionId);
    if (!index) throw new Error("会话执行索引不可用");
    const report = await runtime.sessions.inspectRecovery(index.ref);
    const open = await runtime.listOpenWork();
    const blockers: string[] = [];
    // Same rule as restoring the session: a start refused before its run existed, or one that provably made no run.
    if (index.attempts.some(attempt => !attempt.run_id && !attempt.refused)) {
      const opened = await runtime.sessions.open(index.ref);
      // Unreadable runs or open work leave the start unexplained; only a full, claimed picture rules it out.
      if (!opened || open.unavailable.length || unclaimedWork(index, await opened.terminalRuns(), open)) blockers.push("一次启动未保存完整引用，暂不能确认它对应的操作。");
    }
    if (report.runs.some(run => !index.attempts.some(attempt => attempt.run_id === run.ref.id))) blockers.push("存在未关联到此会话启动记录的轮次，需要核对来源。");
    if (open.unavailable.length) blockers.push("部分运行记录不可读取，请恢复存储访问后重新核对。");
    if (open.items.some(item => item.origin.session === sessionId && !report.runs.some(run => run.ref.id === item.origin.run || run.ref.id === item.id))) blockers.push("还有未关联到中断轮次的等待或操作，暂不能安全继续。");
    type RecoveredRun = Awaited<ReturnType<typeof runtime.sessions.inspectRecovery>>["runs"][number];
    const view = (run: RecoveredRun, subagent?: { subagent_id: string }) => {
      const reasons: string[] = [];
      if (run.live) reasons.push("此会话仍有活动执行，请通过执行控件停止。");
      if (run.operations.some(operation => operation.outcome === "unknown")) reasons.push("有操作缺少可核实的结果；不会自动重复执行，也不能将它标记为成功。");
      if (run.blockers.length && !reasons.length) reasons.push("执行或操作记录尚未核实，请稍后重新核对。");
      return { run_id: run.ref.id, version: run.version, live: run.live, waiting: run.waiting,
        operations: run.operations.map(operation => ({ ...operation })), blockers: reasons,
        can_close: run.canClose && blockers.length === 0, ...(subagent ? { subagent } : {}) };
    };
    // A subtask cut off by a restart blocks every new round of its parent until its own interrupted run is closed.
    const children = [];
    for (const child of childrenToReconcile(sessionId)) {
      const own = await runtime.sessions.inspectRecovery(child.session).catch(() => undefined);
      if (!own) { blockers.push("有子任务的中断记录不可读取，暂不能安全继续。"); continue; }
      if (!own.runs.length) blockers.push("有子任务的结果需要核对，但找不到它可以结束的中断轮次。");
      children.push(...own.runs.map(run => view(run, { subagent_id: child.ref.id })));
    }
    return { session_id: sessionId, blockers, runs: [...report.runs.map(run => view(run)), ...children] };
  };
  /** Subtasks of this session left without a known outcome, as the runtime projects them after a restart. */
  const childrenToReconcile = (sessionId: string) => runtime.subagents.list()
    .filter(child => child.parentSession.id === sessionId && child.state === "reconcile-required");
  const port: PrologueRuntimePort = {
    defaultContextWindowTokens: DEFAULT_CONTEXT_WINDOW_TOKENS,
    readStepBoard: run => stepBoards.read(run),
    amendStepBoard: (run, amendment, expectedVersion, actor) => stepBoards.amend(run, amendment, expectedVersion, actor),
    messages: { read: (project, sessionId) => messages.read(project, sessionId), cancel: (project, id) => messages.cancel(project, id),
      sendForPeople: (project, input, actorId) => messages.sendForPeople(project, input, actorId),
      act: (project, id, action, detail, actorId) => messages.act(project, id, action, detail, actorId),
      async prioritize(project, sessionId, actorId) {
        const index = await readIndex(sessionId).catch(() => undefined);
        if (!index || index.owner.board_id !== project) throw new Error("会话不属于这个项目");
        // Its work under way (or waiting): the files it names, against the other work under way in its directory.
        const mine = (await projectWork.read(project)).items.find(item => item.session_id === sessionId && ["running", "waiting"].includes(item.state));
        if (!mine) return { notified: [], paths: [] };
        const seen = await projectWork.read(project, { session_id: sessionId, directory: mine.directory, paths: mine.paths });
        const targets = [...new Set(seen.overlaps.map(overlap => overlap.work.session_id))].slice(0, MAX_BROADCAST);
        const paths = [...new Set(seen.overlaps.flatMap(overlap => overlap.paths))];
        const at = (await runtime.readClock()).wallTimeMs;
        for (const [n, target] of targets.entries()) {
          const other = await readIndex(target).catch(() => undefined);
          if (!other) continue;
          await runtime.sessions.open(other.ref);
          runtime.delivery.send({ from: index.ref, to: other.ref, kind: "notice", idempotencyKey: `priority.${sessionId.slice(0, 16)}.${String(at)}.${String(n)}`,
            body: `（宿主代用户发出）用户把会话「${mine.title.slice(0, 40)}」标成了优先。它要改 ${paths.join("、")}：请让出这些文件——先别再改它们，手头和它们有关的修改先停下，说明你停在哪里；等它做完或用户另行安排再继续。和这些文件无关的部分照常做。（标记人：${actorId}）` }, at);
        }
        await runtime.delivery.flush();
        return { notified: targets, paths };
      } },
    waits: waitsPort.waits,
    background: waitsPort.background,
    projectWork: {
      read: (project, probe) => projectWork.read(project, probe && { ...(probe.session_id ? { session_id: probe.session_id } : {}), directory: probe.directory, paths: workPaths(probe.text) }),
      async queue(project, input, actorId) {
        const index = await readIndex(input.session.session_id);
        if (!index || index.owner.board_id !== project) throw new Error("会话不属于这个项目");
        const item = await projectWork.queue(project, { session: index.ref, title: input.title?.slice(0, 120) ?? index.title, task: input.task, directory: input.directory, paths: workPaths(input.task), after: input.after, person: actorId });
        // The session is parked on the work it waits for: it is started with `data` when that work ends.
        const target = (await projectWork.read(project)).items.find(work => work.work_id === input.after);
        let waitId: string;
        try {
          waitId = await waitsPort.parkOnWork(index.ref, await projectWork.boardId(project), input.after, `等「${(target?.title ?? input.after).slice(0, 40)}」那一轮完成后再开始`,
            { app: input.data ?? null, work_id: item.work_id });
        } catch (error) {
          // That work's session is already waiting on this one: they would wait on each other for ever.
          await projectWork.release(project, item.work_id, actorId, "没有排上：会互相等待").catch(() => undefined);
          if ((error as { code?: unknown }).code === "WAIT_CYCLE") throw new Error(`不能这样等：「${(target?.title ?? input.after).slice(0, 40)}」那边已经在等这个会话，两边会一直互相等。先让其中一边继续，或者不等直接开始。`);
          throw error;
        }
        return { ...item, wait_id: waitId };
      },
      release: (project, workId, actorId, note) => projectWork.release(project, workId, actorId, note),
    },
    documents: {
      readImage: async resource => {
        const ref = { kind: "resource" as const, id: resource.id, revision: resource.revision } as ExactRef<"resource">;
        const handle = runtime.resources.inspect(ref);
        if (!handle || handle.byteLength > 20 * 1024 * 1024) return null;
        const bytes = new Uint8Array(handle.byteLength);
        for (let offset = 0; offset < bytes.byteLength;) {
          const chunk = await runtime.resources.readChunk(ref, offset, Math.min(64 * 1024, bytes.byteLength - offset));
          if (!chunk.bytes.byteLength) return null;
          bytes.set(chunk.bytes, offset); offset += chunk.bytes.byteLength;
        }
        return bytes;
      },
      intakeImage: async input => {
        // The runtime takes files in only from an authorized directory: a private one of the Host's, emptied at once.
        const dir = await (intakeRoot ??= (async () => {
          const where = options.storageRoot ? path.join(options.storageRoot, "image-intake") : await mkdtemp(path.join(tmpdir(), "molis-image-intake-"));
          await mkdir(where, { recursive: true, mode: 0o700 });
          const canonical = await realpath(where);
          return { path: canonical, ref: (await runtime.workspace.authorize({ path: canonical })).ref };
        })());
        const file = `${randomUUID()}.img`;
        await writeFile(path.join(dir.path, file), input.bytes, { mode: 0o600 });
        try {
          const batch = runtime.beginIntake(dir.ref);
          try {
            const item = await batch.add(file, input.name.slice(0, 120) || "image");
            if (!item.mediaType || !IMAGE_MEDIA_TYPES.includes(item.mediaType)) throw new PrologueAdapterError("agent.capability_unavailable", "只能带 PNG、JPEG、GIF 或 WebP 图片");
            await batch.publish();
            return { resource: { id: item.ref.id, revision: item.ref.revision }, media_type: item.mediaType, byte_length: item.byteLength };
          } catch (error) { await batch.cancel(); throw error; }
        } finally { await rm(path.join(dir.path, file), { force: true }); }
      },
      parse: async input => {
        const stage = runtime.resources.stage({ mediaKind: "binary", byteLength: input.bytes.byteLength, label: input.name.slice(0, 120) || "attachment" });
        let ref;
        try { stage.write(input.bytes); ref = (await stage.publishDurable()).ref; }
        catch (error) { stage.discard(); throw error; }
        const parsed = await runtime.parseResource({ ref });
        return { text: parsed.text, truncated: parsed.truncated, ...(parsed.pages !== undefined ? { pages: parsed.pages } : {}) };
      },
    },
    memory: (() => {
      type Entry = import("@molis-ai/molis-work-contracts/services/agent-host").AgentMemoryEntry;
      type Meta = import("@molis-ai/molis-work-contracts/services/agent-host").AgentMemoryMeta;
      type Candidate = import("@molis-ai/molis-work-contracts/services/agent-host").AgentMemoryCandidateEntry;
      type SdkMeta = import("@prologue/sdk").MemoryMeta;
      // Molis names fields in snake case; Prologue keeps its own. Nothing else is translated.
      const toSdk = (meta: Meta): SdkMeta => ({
        ...(meta.kind !== undefined ? { kind: meta.kind } : {}), ...(meta.source !== undefined ? { source: meta.source } : {}), ...(meta.basis !== undefined ? { basis: meta.basis } : {}),
        ...(meta.applies_when ? { appliesWhen: { ...(meta.applies_when.plugins ? { plugins: meta.applies_when.plugins } : {}), ...(meta.applies_when.object_kinds ? { objectKinds: meta.applies_when.object_kinds } : {}),
          ...(meta.applies_when.goals ? { goals: meta.applies_when.goals } : {}), ...(meta.applies_when.task !== undefined ? { task: meta.applies_when.task } : {}),
          ...(meta.applies_when.from_ms !== undefined ? { fromMs: meta.applies_when.from_ms } : {}), ...(meta.applies_when.until_ms !== undefined ? { untilMs: meta.applies_when.until_ms } : {}) } } : {}),
        ...(meta.evidence ? { evidence: meta.evidence.map(one => ({ kind: one.kind, ...(one.text !== undefined ? { text: one.text } : {}), ...(one.ref !== undefined ? { ref: one.ref } : {}), ...(one.at_ms !== undefined ? { atMs: one.at_ms } : {}) })) } : {}),
        ...(meta.expires_at_ms !== undefined ? { expiresAtMs: meta.expires_at_ms } : {}), ...(meta.approved_by ? { approvedBy: meta.approved_by } : {}),
        ...(meta.namespace !== undefined ? { namespace: meta.namespace } : {}),
      });
      const fromSdk = (meta: SdkMeta): Meta => ({
        ...(meta.kind !== undefined ? { kind: meta.kind } : {}), ...(meta.source !== undefined ? { source: meta.source } : {}), ...(meta.basis !== undefined ? { basis: meta.basis } : {}),
        ...(meta.appliesWhen ? { applies_when: { ...(meta.appliesWhen.plugins ? { plugins: [...meta.appliesWhen.plugins] } : {}), ...(meta.appliesWhen.objectKinds ? { object_kinds: [...meta.appliesWhen.objectKinds] } : {}),
          ...(meta.appliesWhen.goals ? { goals: [...meta.appliesWhen.goals] } : {}), ...(meta.appliesWhen.task !== undefined ? { task: meta.appliesWhen.task } : {}),
          ...(meta.appliesWhen.fromMs !== undefined ? { from_ms: meta.appliesWhen.fromMs } : {}), ...(meta.appliesWhen.untilMs !== undefined ? { until_ms: meta.appliesWhen.untilMs } : {}) } } : {}),
        ...(meta.evidence ? { evidence: meta.evidence.map(one => ({ kind: one.kind, ...(one.text !== undefined ? { text: one.text } : {}), ...(one.ref !== undefined ? { ref: one.ref } : {}), ...(one.atMs !== undefined ? { at_ms: one.atMs } : {}) })) } : {}),
        ...(meta.expiresAtMs !== undefined ? { expires_at_ms: meta.expiresAtMs } : {}), ...(meta.approvedBy ? { approved_by: { ...meta.approvedBy } } : {}),
        ...(meta.namespace !== undefined ? { namespace: meta.namespace } : {}),
      });
      const view = (entry: import("@prologue/sdk").MemoryEntry): Entry => ({ memory_id: entry.ref.id, scope: entry.scope as Entry["scope"], owner: entry.owner,
        text: entry.text, origin: entry.origin, tags: [...entry.tags], version: entry.version, meta: fromSdk(entry.meta ?? {}),
        ...(entry.paused ? { paused: { reason: entry.paused.reason, at_ms: entry.paused.atMs } } : {}), created_at_ms: entry.createdAtMs ?? 0, updated_at_ms: entry.updatedAtMs ?? 0 });
      const candidateView = (item: import("@prologue/sdk").ScopedCandidate): Candidate => ({ candidate_id: item.ref.id, scope: item.scope as Candidate["scope"], owner: item.owner,
        text: item.text, origin: item.origin, tags: [...item.tags], meta: fromSdk(item.meta), state: item.state, created_at_ms: item.createdAtMs,
        ...(item.settledAtMs !== undefined ? { settled_at_ms: item.settledAtMs } : {}), ...(item.entry ? { memory_id: item.entry.id } : {}) });
      const hydrated = new Set<string>();
      const ready = async (scope: Entry["scope"], owner: string) => {
        const key = `${scope}:${owner}`;
        if (!hydrated.has(key)) { await runtime.memory.hydrate([{ scope, owner }]); await runtime.memoryCandidates.hydrate([{ scope, owner }]); hydrated.add(key); }
      };
      const find = async (scope: Entry["scope"], owner: string, id: string) => {
        await ready(scope, owner);
        const entry = runtime.memory.list({ scope, owner }).find(item => item.ref.id === id);
        if (!entry) throw new PrologueAdapterError("agent.capability_unavailable", "这条记忆不存在或已删除");
        return entry;
      };
      const candidate = async (scope: Entry["scope"], owner: string, id: string) => {
        await ready(scope, owner);
        const found = runtime.memoryCandidates.list({ scope, owner }).find(item => item.ref.id === id);
        if (!found) throw new PrologueAdapterError("agent.capability_unavailable", "这条候选不存在");
        return found.ref;
      };
      const capability: import("@molis-ai/molis-work-contracts/services/agent-host").AgentMemoryCapability = {
        list: async (scope, owner) => { await ready(scope, owner); return runtime.memory.list({ scope, owner }).map(view); },
        write: async input => { await ready(input.scope, input.owner); return view(await runtime.memory.write({ scope: input.scope, owner: input.owner, text: input.text, origin: input.origin,
          ...(input.tags ? { tags: input.tags } : {}), ...(input.meta ? { meta: toSdk(input.meta) } : {}) })); },
        update: async input => view(await runtime.memory.update((await find(input.scope, input.owner, input.memory_id)).ref, input.text)),
        setMeta: async input => view(await runtime.memory.setMeta((await find(input.scope, input.owner, input.memory_id)).ref, toSdk(input.meta))),
        pause: async input => view(await runtime.memory.pause((await find(input.scope, input.owner, input.memory_id)).ref, input.reason)),
        resume: async input => view(await runtime.memory.resume((await find(input.scope, input.owner, input.memory_id)).ref)),
        remove: async input => { await runtime.memory.purge((await find(input.scope, input.owner, input.memory_id)).ref); return true; },
        recall: async input => { await ready(input.scope, input.owner);
          const atMs = (await runtime.readClock()).wallTimeMs;
          return runtime.memory.recall({ scope: input.scope, owner: input.owner, ...(input.keywords ? { keywords: input.keywords } : {}), ...(input.text !== undefined ? { text: input.text } : {}),
            ...(input.kinds ? { kinds: input.kinds } : {}), atMs, ...(input.limit ? { limit: input.limit } : {}) }).hits.map(hit => ({ entry: view(hit.entry), score: hit.score })); },
        screen: async text => {
          const screened = screenInbound(text);
          return { hold: screened.verdict === "hold", reasons: screened.reasons.map(reason => reason.rule), redacted: redactText(text) };
        },
        previewScope: async (scope, owner) => {
          await ready(scope, owner);
          const preview = runtime.memory.previewScope({ scope, owner });
          return { count: preview.count, fingerprint: preview.fingerprint, memory_ids: preview.entries.map(entry => entry.ref.id) };
        },
        clearScope: async input => {
          await ready(input.scope, input.owner);
          // Refused (nothing removed) when the scope changed since the preview; then every one is purged, not only tombstoned.
          const removed = await runtime.memory.removeScope({ scope: input.scope, owner: input.owner, fingerprint: input.fingerprint });
          for (const ref of removed) await runtime.memory.purge(ref);
          return removed.map(ref => ref.id);
        },
        candidates: {
          propose: async input => { await ready(input.scope, input.owner); return candidateView(await runtime.memoryCandidates.propose({ scope: input.scope, owner: input.owner, text: input.text, origin: input.origin,
            ...(input.tags ? { tags: input.tags } : {}), ...(input.meta ? { meta: toSdk(input.meta) } : {}) })); },
          list: async (scope, owner) => { await ready(scope, owner); return runtime.memoryCandidates.list({ scope, owner }).map(candidateView); },
          accept: async input => view(await runtime.memoryCandidates.accept(await candidate(input.scope, input.owner, input.candidate_id), {
            ...(input.text !== undefined ? { text: input.text } : {}), ...(input.origin !== undefined ? { origin: input.origin } : {}), ...(input.meta ? { meta: toSdk(input.meta) } : {}) })),
          promote: async input => view(await runtime.memoryCandidates.promote(await candidate(input.scope, input.owner, input.candidate_id), { policy: input.policy, version: input.version },
            { ...(input.origin !== undefined ? { origin: input.origin } : {}), ...(input.meta ? { meta: toSdk(input.meta) } : {}) })),
          settleInto: async input => view(await runtime.memoryCandidates.settleInto(await candidate(input.scope, input.owner, input.candidate_id),
            (await find(input.scope, input.owner, input.memory_id)).ref, input.by)),
          discard: async input => candidateView(await runtime.memoryCandidates.discard(await candidate(input.scope, input.owner, input.candidate_id))),
          expire: async input => candidateView(await runtime.memoryCandidates.expire(await candidate(input.scope, input.owner, input.candidate_id))),
          purge: async input => { await runtime.memoryCandidates.purge(await candidate(input.scope, input.owner, input.candidate_id)); },
        },
      };
      memoryRefs = async pinned => {
        const refs: import("@prologue/sdk").ExactRef<"memory">[] = [];
        for (const pin of pinned) {
          await ready(pin.scope, pin.owner);
          const found = runtime.memory.list({ scope: pin.scope, owner: pin.owner }).find(entry => entry.ref.id === pin.memory_id);
          // One deleted meanwhile is simply not there: the run is not given it.
          if (found) refs.push(found.ref);
        }
        return refs;
      };
      return capability;
    })(),
    schedule: {
      claim: () => { const claim = runtime.queue.claim(); return { survives_window_close: claim.survivesWindowClose, why: claim.why }; },
      enqueue: async input => {
        const index = await readIndex(input.session_id);
        if (!index) throw new PrologueAdapterError("agent.session_unknown", "会话不存在，不能安排定时");
        const due = Date.parse(input.due_at);
        if (!Number.isFinite(due)) throw new PrologueAdapterError("agent.capability_unavailable", "定时的时间无效");
        return scheduledView(await runtime.queue.enqueue({ key: input.key, sessionRef: index.ref, work: { kind: input.kind, payload: { ...input.payload } }, dueAtMs: due,
          ...(input.max_attempts ? { maxAttempts: input.max_attempts } : {}) }));
      },
      cancel: async key => {
        const task = runtime.queue.find(key);
        if (!task) return null;
        if (task.state !== "queued") return scheduledView(task);
        return scheduledView(await runtime.queue.cancel(task.ref));
      },
      find: key => { const task = runtime.queue.find(key); return task ? scheduledView(task) : null; },
      list: kind => runtime.queue.list().filter(task => !kind || task.work.kind === kind).map(scheduledView),
      handle: (kind, run) => { scheduleRunners.set(kind, run); return () => { if (scheduleRunners.get(kind) === run) scheduleRunners.delete(kind); }; },
    },
    recovery: {
      inspect: session => inspectRecovery(session.session_id),
      close: async (session, runId, expectedVersion) => {
        const index = await readIndex(session.session_id);
        // The session's own round, or the interrupted round of one of its subtasks: that one closes in the child's session.
        const child = childrenToReconcile(session.session_id).find(entry => entry.run.id === runId);
        if (!index?.attempts.some(attempt => attempt.run_id === runId) && !child) throw new Error("这轮执行不属于当前会话");
        const before = await inspectRecovery(session.session_id);
        if (before.blockers.length || before.runs.some(run => run.run_id === runId && !run.can_close)) throw new Error("仍有待核实的操作，不能关闭中断轮次");
        await runtime.sessions.recoverRun(child ? child.session : index!.ref, { kind: "run", id: runId, revision: 1 }, expectedVersion);
        return inspectRecovery(session.session_id);
      },
    },
    ...(options.reviewQueue ? { subagents: { workspaces: true as const, ...createPrologueSubagents(runtime, async run => {
      const index = await readIndex(run.session_id), attempt = index?.attempts.find(attempt => attempt.run_id === run.run_id);
      if (!attempt?.frozen.directory) throw new Error("原父任务没有工作区归属，不能分派目录子任务");
      return { path: attempt.frozen.directory.canonical_path, roles: attempt.subagent_roles ?? [], roots: attempt.subagent_roots,
        errors: { ...attempt.subagent_errors, ...subagentBridgeErrors.get(run.run_id) } };
    }) } } : {}),
    workspaceNone: true,
    workspaceBusiness: true,
    inlineMethods: true,
    imageAttachments: true,
    compaction: true,
    ...(checkpoints ? { checkpoints } : {}),
    async saveRunTiming(run, timing) {
      await updateIndex(run.session_id, index => {
        const attempt = index.attempts.find(item => item.run_id === run.run_id);
        if (!attempt) throw new Error("这轮执行不属于宿主会话索引，不能保存显示时间");
        attempt.timing = structuredClone(timing);
      });
    },
    actionTools: true,
    skillLibrary: createPrologueSkillLibrary(runtime),
    mcpLibrary,
    async readPendingQuestion(run, id, revision) {
      const pending = await readQuestion(run, id, revision);
      // The original persisted answer owns this fact, including after restart.
      // Do not turn an answered question back into an empty disabled form.
      if (pending.state === "settled") return null;
      const unavailable = questionUnavailable(run, pending, (await host.readClock()).monotonicMs);
      return { pending_id: pending.ref.id, pending_revision: pending.ref.revision, kind: pending.kind,
        prompt: pending.why, options: [], allows_free_text: pending.kind === "text",
        ...(pending.kind === "questionnaire" ? { questions: pending.questions.map(question => ({
          index: question.index, prompt: question.prompt, options: question.options,
          multiple: question.multiple === true, allow_other: question.allowOther === true,
        })) } : {}), answerable: unavailable === undefined,
        ...(unavailable ? { unavailable_reason: unavailable } : {}) };
    },
    async readCommandOutput(sessionId, ref) {
      const index = await readIndex(sessionId);
      if (!index) throw new Error("会话执行索引不可用");
      const session = await runtime.sessions.open(index.ref);
      if (!session) throw new Error("SDK 会话不可读");
      const terminal = await session.terminalRuns();
      const matches: Array<{ event: CommandEvent; runId: string; root: ExactRef<"authorized-root"> }> = [];
      for (const attempt of index.attempts) {
        if (!attempt.run_id || !attempt.root_ref || ref.run_id && ref.run_id !== attempt.run_id) continue;
        const saved = terminal.find(run => run.id === attempt.run_id);
        const events = saved ? await session.replay(saved) : commandEvents.get(attempt.run_id) ?? [];
        for (const event of events) if (event.type === "command-receipt" && event.callId === ref.call_id) {
          matches.push({ event, runId: attempt.run_id, root: attempt.root_ref });
        }
      }
      if (matches.length !== 1) throw new Error(matches.length ? "命令引用对应多次执行，请指定轮次" : "没有这次命令的持久回执；结果未知，不能当作成功或自动重跑");
      const { event, runId, root } = matches[0]!;
      const record = await readResource(event.receiptRef);
      const receipt = record.receipt;
      if (record.kind !== "workspace-command-receipt" || record.version !== 1 || !sameRef(record.rootRef, root)
        || typeof record.executable !== "string" || !Array.isArray(record.argv) || !record.argv.every((arg: unknown) => typeof arg === "string")
        || !receipt || receipt.commandId !== event.commandId || !sameRef(receipt.effectRef, event.effectRef)
        || typeof receipt.stdout !== "string" || typeof receipt.stderr !== "string" || typeof receipt.truncated !== "boolean"
        || typeof receipt.timedOut !== "boolean" || typeof receipt.cancelled !== "boolean"
        || receipt.exitCode !== undefined && !Number.isInteger(receipt.exitCode)
        || receipt.stopReason !== undefined && !["cancelled", "timed-out"].includes(receipt.stopReason)) throw new Error("命令回执与这轮执行不一致，不能展示为已确认结果");
      return { ref: { run_id: runId, call_id: ref.call_id }, command: [record.executable, ...record.argv.map((arg: string) => JSON.stringify(arg))].join(" "),
        exit_code: receipt.exitCode ?? null, stdout: receipt.stdout, stderr: receipt.stderr, truncated: receipt.truncated,
        timed_out: receipt.timedOut, cancelled: receipt.cancelled, ...(receipt.stopReason ? { stop_reason: receipt.stopReason } : {}) };
    },
    sessions: {
      async create(input) {
        const session = await runtime.sessions.create();
        await saveIndex({ schema: 1, ref: session.ref, title: input.title, workspace: input.workspace ?? "required",
          owner: { board_id: input.board_id, plugin_id: input.plugin_id, install_id: input.install_id, actor_id: input.actor_id }, attempts: [] });
        sessions.set(session.ref.id, session.ref);
        return session;
      },
      async restore(id) {
        const index = await readIndex(id);
        if (!index) return undefined;
        const session = await runtime.sessions.open(index.ref);
        if (!session) throw new Error("SDK 会话已不可读，保留原引用，不能创建新会话替代");
        if (index.workspace !== "none" && index.workspace !== "business") await checkpoints?.restore(id);
        const terminal = await session.terminalRuns();
        const open = await runtime.listOpenWork();

        const reasons: string[] = [];
        if (open.unavailable.length) reasons.push("未能查清运行时的未结束工作，暂不能安全继续");
        if (open.items.some(item => item.origin.session === id)) reasons.push("此会话仍有中断的执行、等待或结果未知的操作，需要核对");
        if (childrenToReconcile(id).length) reasons.push("有子任务在中断后结果待核对：核对并结束它的中断轮次后，才能开始新一轮");
        if (terminal.some(ref => !index.attempts.some(attempt => attempt.run_id === ref.id))) reasons.push("SDK 有执行记录缺少宿主启动索引，需要核对对应关系");
        const runs: PrologueRestoredSession["runs"] = [];
        const unclaimed = open.unavailable.length > 0 || unclaimedWork(index, terminal, open);
        for (const attempt of index.attempts) {
          // A start the runtime refused never created a run; one with no reference is only unknown while some run or
          // open item of this session is claimed by no start, because that is the only run it could have made.
          if (!attempt.run_id) { if (!attempt.refused && unclaimed) reasons.push("一次启动没有完整保存执行引用，不能判断是否发生过操作"); continue; }
          const ref = terminal.find(ref => ref.id === attempt.run_id);
          const pendingQuestions = !ref ? (await runtime.effects.pendings.readByOrigin({ session: id, run: attempt.run_id })).filter(pending => pending.state !== "settled" && ["text", "questionnaire"].includes(pending.kind)) : [];
          if (!ref) reasons.push("中断轮次仅有已保存的过程，结束状态与操作仍需核对，不会自动重复执行");
          runs.push({ ref: { run_id: attempt.run_id, session_id: id }, frozen: attempt.frozen,
            started_at: attempt.started_at, task: attempt.task,
            ...(attempt.stop_intent ? { stop_intent: attempt.stop_intent } : {}),
            ...(attempt.timing ? { timing: attempt.timing } : {}),
            ...(ref ? { terminal: true } : {}),
            ...(!ref ? { original_questions: pendingQuestions.filter(pending => pending.origin?.run === attempt.run_id).map(pending => ({ pending_id: pending.ref.id, pending_revision: pending.ref.revision, kind: pending.kind, why: pending.why })) } : {}),
            events: ref ? await session.replay(ref) : await session.readRunProgress({ kind: "run", id: attempt.run_id, revision: 1 }) });
        }
        sessions.set(id, index.ref);
        return { title: index.title, owner: index.owner, workspace: index.workspace ?? "required", runs,
          ...(reasons.length ? { recovery: { required: true as const, reason: [...new Set(reasons)].join("；") } } : {}) };
      },
    },
    async startAgentRun(input: PrologueStartInput) {
      const none = input.workspace === "none";
      // Business work: no root; the Host's frozen actions as this session's pack, and root-free tools only.
      const business = input.workspace === "business";
      const index = await readIndex(input.session_id);
      if (!index || (index.workspace ?? "required") !== (input.workspace ?? "required")) throw new Error("会话工作区模式与原始归属不一致");
      if (none && (input.root_path !== undefined || input.provenance.frozen.directory !== undefined
        || input.character.tools.length || input.actions || input.mcp_tools?.length || input.mcp_sources?.length
        || input.subagents?.length || input.subagent_workspaces?.length || input.provenance.frozen.execution_plan
        || actionToolSessions.has(input.session_id))) throw new Error("无目录会话不能获得工具或工作区授权");
      if (business && (input.root_path !== undefined || input.provenance.frozen.directory !== undefined || input.mcp_tools?.length || input.mcp_sources?.length
        || input.subagents?.length || input.subagent_workspaces?.length || input.provenance.frozen.execution_plan
        || input.character.tools.some(tool => !(BUSINESS_HOST_TOOLS as readonly string[]).includes(tool)))) throw new Error("业务会话只能使用宿主冻结的动作与不碰目录的工具");
      if (!none && !business && !input.root_path) throw new Error("执行缺少已授权工作区");
      const ref = sessions.get(input.session_id);
      const actionController = new AbortController();
      // None sessions do not construct or adopt any tool pack.
      // Business work with the gateway binds its three tools instead of one per action.
      // What this round really kept or forgot, for the stop check below: a reply may not claim what no call did.
      // A business round the person gave no memory (switched off) keeps nothing, so any claim of keeping is held too.
      const memory = input.action_gateway?.client.memory;
      // What the round has said so far: a claim made before the call that then failed counts as much as one at the end.
      const memoryDone = { keep: 0, forget: 0, off: !memory, spoken: "" };
      if (input.action_gateway) memoryRounds.set(input.session_id, memoryDone); else memoryRounds.delete(input.session_id);
      const offer = input.action_gateway?.client.offer;
      const offersDone = { offered: 0 };
      if (offer) offerRounds.set(input.session_id, offersDone); else offerRounds.delete(input.session_id);
      const gatewayForRun = input.action_gateway && (memory || offer) ? { ...input.action_gateway, client: { ...input.action_gateway.client,
        ...(memory ? { memory: {
          remember: async (value: Parameters<typeof memory.remember>[0]) => { const kept = await memory.remember(value); memoryDone.keep += 1; return kept; },
          list: () => memory.list(),
          forget: async (id: string) => { const result = await memory.forget(id); if (result.forgotten) memoryDone.forget += 1; return result; },
          ...(memory.propose ? { propose: memory.propose.bind(memory) } : {}),
        } } : {}),
        ...(offer ? { offer: async (proposal: Parameters<typeof offer>[0]) => { const made = await offer(proposal); offersDone.offered += 1; return made; } } : {}),
      } } : input.action_gateway;
      const actionTools = none ? undefined : gatewayForRun
        ? { ...prologueActionGateway(gatewayForRun, Math.min(60_000, runtime.tools.limits.maxTimeoutMs), actionController.signal), scope: "gateway" }
        : prologueActionTools(input.actions, Math.min(60_000, runtime.tools.limits.maxTimeoutMs), actionController.signal);
      if (input.action_gateway) {
        gatewayRuns.set(input.session_id, input.action_gateway);
        if (actionTools && "known" in actionTools) gatewayKnown.set(input.session_id, actionTools.known as Set<string>);
        // Refused before any review: a call to a capability that is gone, switched off or asked through the wrong tool.
        if (!gatewayHooks.has(input.session_id)) {
          gatewayHooks.add(input.session_id);
          const sessionId = input.session_id;
          runtime.hooks.register({ id: `molis-action-gateway-${sessionId}`, event: "tool-before", forSession: sessionId, handler: async context => {
            const gateway = gatewayRuns.get(sessionId);
            if (!gateway || !context.toolName) return { kind: "allow" as const };
            const problem = await gatewayProblem(gateway, context.toolName, context.input, gatewayKnown.get(sessionId));
            return problem ? { kind: "deny" as const, why: problem } : { kind: "allow" as const };
          } });
        }
      }
      // A session may alternate discussing and executing rounds: the guard follows the round now starting.
      const guard = stopGuards.get(input.session_id);
      if (guard) guard.writing = input.provenance.frozen.execution !== "read-only";
      else {
        const sessionId = input.session_id, created = { writing: input.provenance.frozen.execution !== "read-only", held: new Set<string>() };
        stopGuards.set(sessionId, created);
        runtime.hooks.register({ id: `molis-announce-guard-${sessionId}`, event: "session-stop", forSession: sessionId, handler: async context => {
          const run = context.origin?.run, text = (context.input as { text?: unknown } | undefined)?.text;
          if (!run || typeof text !== "string" || created.held.has(run)) return { kind: "allow" as const };
          // A claim of keeping or forgetting that no call made this round is held once, whatever the round's execution.
          const tracked = memoryRounds.get(sessionId);
          const claim = tracked ? claimsMemoryChange(tracked.spoken.trim() ? tracked.spoken.slice(-1200) : text) : null;
          if (claim && memoryRounds.get(sessionId)![claim] === 0) { created.held.add(run); return { kind: "deny" as const, why: memoryRounds.get(sessionId)!.off ? MEMORY_OFF_HELD : MEMORY_CLAIM_HELD[claim] }; }
          if (business && writesToolCallAsText(text)) { created.held.add(run); return { kind: "deny" as const, why: WRITTEN_CALL_HELD }; }
          if (offerRounds.get(sessionId)?.offered === 0 && claimsButton(text)) { created.held.add(run); return { kind: "deny" as const, why: BUTTON_CLAIM_HELD }; }
          // Tool names, capability ids this round found, UUIDs and error codes are ours, not the person's words.
          const ids = business ? mentionsInternalIds(text, gatewayKnown.get(sessionId) ?? []) : [];
          if (ids.length) { created.held.add(run); return { kind: "deny" as const, why: internalIdsHeld(ids) }; }
          if (!created.writing || !announcesWithoutActing(text)) return { kind: "allow" as const };
          created.held.add(run);
          return { kind: "deny" as const, why: ANNOUNCE_HELD };
        } });
      }
      const bindActions = !none && (!!input.actions || !!input.action_gateway || actionToolSessions.has(input.session_id));
      const session = ref === undefined ? undefined : await runtime.sessions.open(ref, bindActions ? { pack: actionTools!.pack, executors: actionTools!.executors } : undefined);
      if (bindActions && session) actionToolSessions.add(input.session_id);
      if (session === undefined) throw new Error("agent.session_unknown");
      const root = none || business ? undefined : await runtime.workspace.authorize({ path: input.root_path! });
      // Long instructions travel as a resource reference, not inline in the profile.
      const methods: string[] = [];
      for (const definition of input.skills ?? []) {
        const key = `${definition.skill_id}@${definition.version}`;
        const manifest = { id: definition.skill_id, version: definition.version, label: definition.name,
          shape: "bounded" as const, tools: definition.tools.map(prologueToolName), body: definition.body, humanInvocable: true };
        let skill = registeredMethods.get(key);
        if (skill && (skill.manifest.body !== manifest.body || skill.manifest.label !== manifest.label || JSON.stringify(skill.manifest.tools) !== JSON.stringify(manifest.tools))) throw new Error("方法同版本正文发生变化，请发布新版本");
        if (!skill) { skill = runtime.skills.register(manifest); registeredMethods.set(key, skill); }
        prepareSkillIntent({ registry: runtime.skills, skillRef: skill.ref, parameters: {}, mode: "inline",
          parentTools: input.character.tools.map(prologueToolName), hostTools: input.character.tools.map(prologueToolName) });
        const body = fillSkillBody({ body: skill.manifest.body!, parameters: {} });
        methods.push(`用户为本轮选择的方法：${definition.name}（${key}）\n${body}`);
      }
      const textResources: Array<{ ref: ExactRef<"resource">; as: "original" }> = [];
      for (const material of input.text_materials ?? []) {
        const ref = await stageTextResource(runtime, agentTextMaterialContent(material), "coding-material");
        textResources.push({ ref, as: "original" });
      }
      const childRoots: PrologueSubagentRoot[] = [];
      if (input.subagent_workspaces?.length && input.character.tools.some(tool => !["read-file", "list", "search", "context-remaining", "dispatch-subagent", "await-subagents", "steer-subagent", "ask-user", "board-read", "board-report", "session-send"].includes(tool))) throw new Error("独立目录协调者只能读取和分派，不能持有其他执行工具");
      for (const grant of input.subagent_workspaces ?? []) {
        const overlaps = (a: string, b: string) => { const relative = path.relative(a, b); return !relative || !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative); };
        if ([input.root_path!, ...childRoots.map(root => root.path)].some(other => overlaps(other, grant.directory.canonical_path) || overlaps(grant.directory.canonical_path, other))) throw new Error("子任务目录必须与主目录及其他子目录互不包含");
        const authorized = await runtime.workspace.authorize({ path: grant.directory.canonical_path });
        childRoots.push({ id: grant.workspace_id, rootRef: authorized.ref, path: grant.directory.canonical_path });
      }
      const childRoles = new Map<string, NonNullable<PrologueStartInput["subagents"]>[number]>();
      for (const role of input.subagents ?? []) {
        const allowed = ["read-file", "list", "search", "context-remaining", ...(childRoots.length && role.execution !== "read-only" ? ["write", "edit-file"] : []), ...(role.execution === "workspace-write" ? ["run-command"] : []),
          // A child may read and wait on its parent's background commands when the parent waits on them itself.
          ...(input.character.tools.includes("await-commands") ? ["command-output", "await-commands"] : [])];
        if (!childRoots.length && role.execution === "text-edit" || role.host_tools.some(tool => !allowed.includes(tool) || !childRoots.length && !input.character.tools.includes(tool))) throw new Error("子角色超出本轮允许的工具与目录");
        const ref = await stageInstructions(runtime, role.prompts.map(prompt => prompt.body).join("\n\n"));
        const draft = runtime.characters.create({ id: `molis-child-${randomUUID()}`, version: role.version, name: role.name, role: role.role_id,
          ...(ref ? { instructionsRef: ref } : {}), tools: role.host_tools.map(prologueToolName) });
        const published = runtime.characters.publish(draft.ref);
        childRoles.set(exactCharacterKey(published.ref), role);
      }
      const childScope = childRoots.length
        ? "每个子任务必须选择一个不同的 workspace 标识：" + JSON.stringify(childRoots.map(root => ({ id: root.id, path: root.path }))) + "。主任务只读，不能直接修改主工作区。子任务只在自己的目录里执行，修改仍经过宿主审查。"
          + "核对子任务成果时，可以给 read、list、search 加 workspace 参数（上面的标识）只读查看对应目录；不加就是主工作区。你的查看不代替子任务自己的先读后改，也不能在这些目录里写入或运行命令。"
        : "本轮没有分配独立子目录，不得填写 workspace 参数；所有子任务沿用当前授权目录，都不能修改文件；开放了运行命令的子角色可以运行检查命令，每条都经用户审查。";
      const childInstructions = childRoles.size ? childScope + "可分派的固定子角色：\n" + [...childRoles].map(([ref, role]) => `${ref}: ${role.name}; tools=${JSON.stringify(role.host_tools.map(prologueToolName))}`).join("\n") + "\n必须选择上述精确 character，并显式提供该角色列出的完整 tools 清单；不能遗漏角色需要的工具或增加其他工具。给子任务写清任务、必要上下文、依据路径与完成条件；不继承父聊天或材料。子任务只能使用所选角色的工具，不能再次分派。需要用户信息时作为阻塞返回给父任务。" : "";
      const plan = input.provenance.frozen.execution_plan;
      const continued = input.provenance.frozen.continues_step_board_of;
      // A continued plan keeps its graph — with every step a person inserted, skipped or reordered — rather than starting over.
      const stepBoard = plan ? continued ? await stepBoards.resume({ session_id: input.session_id, run_id: continued }) : await stepBoards.admit(plan, session.ref) : undefined;
      // A round without a plan of its own still starts knowing where the session's unfinished graph stands.
      const earlier = plan ? undefined : [...index.attempts].reverse().find(attempt => attempt.step_board && attempt.frozen.execution_plan);
      // The graph as it stands travels with this round's task, where it reads as newer than the conversation before it.
      const digest = plan && stepBoard ? stepBoards.digest(stepBoard, plan, session.ref.id)
        : earlier ? stepBoards.standing(earlier.step_board!, earlier.frozen.execution_plan!, session.ref.id) : "";
      if (digest) textResources.push({ ref: await stageTextResource(runtime, digest, "coding-board-digest"), as: "original" });
      // What other sessions in the project are doing, and where it overlaps this round, as the round starts.
      const project = index.owner.board_id, workText = `${input.task}\n${(plan?.steps ?? []).map(step => `${step.title}\n${step.acceptance}`).join("\n")}`;
      const scopePaths = none ? [] : workPaths(workText);
      if (!none && input.root_path && !index.parent_run) {
        try {
          const seen = await projectWork.read(project, { session_id: session.ref.id, directory: input.root_path, paths: scopePaths });
          const note = projectWorkDigest(await projectWork.boardId(project), seen.items, session.ref.id, seen.overlaps, input.character.tools.includes("session-send") && !index.parent_run);
          if (note) textResources.push({ ref: await stageTextResource(runtime, note, "coding-project-work"), as: "original" });
        } catch { /* the project's list is a courtesy to the round; a failed read leaves it out rather than stopping the round */ }
        // Messages other sessions left for this one while it was not running.
        const inbox = await messages.inbox(session.ref.id, project).catch(() => "");
        if (inbox) textResources.push({ ref: await stageTextResource(runtime, inbox, "coding-session-inbox"), as: "original" });
        // Steps other sessions handed to this one and not yet done: where they are, so this round can go on with them.
        const handed = handedSteps(session.ref);
        if (handed.length) textResources.push({ ref: await stageTextResource(runtime, ["别的会话交给你、还没做完的步骤（任务图上现在归你）：",
          ...handed.flatMap(one => one.nodes.map(node => `- 任务图 ${one.board}：${node.id}「${node.title.slice(0, 60)}」（${node.state}）`)),
          "用 board-read / board-report（board 写上面的任务图编号）处理这些步骤；做完后在交接信上答复对方。"].join("\n"), "coding-handed-steps"), as: "original" });
      }
      // The project's side panel browser, for this session only: its tools join the round and the round is told how to use them.
      // Read-only rounds only look; a page another live round holds is not shared, and the round is told why.
      const surface = business && surfaceHost && input.browser !== false
        ? await surfaceHost.attach(session, index.owner.board_id, input.session_id, { readOnly: input.provenance.frozen.execution === "read-only",
          live: sessionRefId => [...activeRuns.entries()].some(([runId, run]) => run.live() && runSessions.get(runId) === sessionRefId) })
          .catch((error: unknown) => ({ tools: [] as readonly string[], note: `侧栏浏览器这一轮不可用：${error instanceof Error ? error.message : String(error)}` }))
        : { tools: [] as readonly string[], note: null };
      const surfaceTools = surface.tools;
      const instructions = await stageInstructions(runtime, [input.character.instructions, childInstructions, ...methods,
        ...(surfaceTools.length ? [SURFACE_GUIDANCE] : []), ...(surface.note ? [`## 侧栏浏览器\n${surface.note}`] : []),
        ...(plan && stepBoard ? [stepBoards.instructions(stepBoard, plan, { session: session.ref.id, dispatch: childRoles.size > 0 })] : []), (none || business ? "" : await checkpoints?.context(input.session_id) ?? "")].join("\n\n"));
      if (!none && !business) {
        await mcpLibrary.validate(index.owner, input.mcp_tools ?? []);
        await mcpLibrary.validateSources(index.owner,input.mcp_sources ?? []);
      }
      const mcpTools: string[] = [];
      for (const selected of input.mcp_tools ?? []) {
        const conn = runtime.mcp.list().find(item => item.id === mcpConnectionId(selected))!;
        const snapshot = runtime.mcp.snapshotOf(conn.ref);
        const at = snapshot.tools.findIndex(tool => tool.name === selected.tool && tool.shapeFingerprint === selected.version);
        const adopted = runtime.adoptMcpTools(conn.ref);
        if (at < 0 || !adopted[at]) throw new Error("MCP 工具已变化，请重新选择");
        mcpTools.push(adopted[at]!);
      }
      const tools = [...input.character.tools.map(prologueToolName), ...mcpTools, ...(actionTools?.names ?? []), ...surfaceTools];
      const runTools = [...new Set([...tools, ...[...childRoles.values()].flatMap(role => role.host_tools.map(prologueToolName))])];
      // The memories the Host chose for this run, as exact references (one deleted meanwhile is simply not given).
      const pinnedMemory = input.memory?.pinned.length ? await memoryRefs(input.memory.pinned) : [];
      const created = runtime.characters.create({
        // This is a projection of the frozen role, not a user-managed Character.
        // A project prompt may change without changing the package role version.
        id: `molis-role-${randomUUID()}`,
        version: input.character.version,
        name: input.character.name,
        role: input.character.name,
        ...(instructions === undefined ? {} : { instructionsRef: instructions }),
        tools,
        // Reads memory only when the Host chose some for this run; never writes through the runtime's own path.
        ...(pinnedMemory.length ? { memoryPolicy: { recall: true, write: false } } : {}),
      });
      const character = runtime.characters.publish(created.ref);

      // Exchange our reference for one Prologue can resolve, before the Run
      // is started rather than when it first calls out.
      const credentialRef = await credentials.prologueRefFor(input.model.credential_ref);
      const attempt: SessionIndex["attempts"][number] = { ...input.provenance, task: input.task, ...(root ? { root_ref: root.ref } : {}),
        ...(actionTools?.names.length ? { action_tool_scope: actionTools.scope } : {}),
        ...(stepBoard ? { step_board: stepBoard.ref } : {}), ...(childRoles.size ? { subagent_roles: [...childRoles], subagent_roots: childRoots } : {}) };
      let attemptIndex = -1;
      // Persist the intent before the SDK can dispatch a model or tool. A crash
      // in this window remains visibly unresolved instead of silently retrying.
      await updateIndex(input.session_id, index => {
        attemptIndex = index.attempts.length;
        index.attempts.push(attempt);
      });
      try { await input.beforeStart?.(); }
      catch (error) {
        // The SDK has not seen this intent, so it is known not to have dispatched.
        await updateIndex(input.session_id, saved => {
          const held = saved.attempts[attemptIndex];
          if (held && !held.run_id && isDeepStrictEqual(held, attempt)) saved.attempts.splice(attemptIndex, 1);
        });
        throw error;
      }
      const dispatchGuard = async () => {
        await input.beforeDispatch?.();
        if (!none && !business) {
          await mcpLibrary.validate(index.owner, input.mcp_tools ?? []);
          await mcpLibrary.validateSources(index.owner, input.mcp_sources ?? []);
        }
      };
      const started = await dispatchGuards.run(dispatchGuard, () => runtime.startAgentRun({
        session,
        ...(root ? { rootRef: root.ref } : business ? { workspace: "app" as const } : { workspace: "none" as const }),
        // A digest round carries earlier rounds in its task; replaying them verbatim too is what stopped long sessions.
        ...(input.history === "digest" ? {} : { history: "session" as const }),
        ...(childRoles.size ? { subagents: {
          // The user's decision: a parent that split work across directories may read (never write) exactly those.
          ...(childRoots.length ? { workspaces: childRoots.map(({ id, rootRef }) => ({ id, rootRef })), requireWorkspace: true, parentReads: true } : {}),
          onStarted: async observed => {
            verifySubagentStart(runtime, childRoles, childRoots)(observed);
            const registered = runtime.subagents.list().find(child => child.run.id === observed.run.ref.id && child.session.id === observed.childSession.ref.id)!;
            const role = childRoles.get(exactCharacterKey(registered.character!))!;
            // A child with operations to review is tracked by the Host: one in its own directory, or one in the main
            // workspace that may run commands. A read-only child in the main workspace has nothing to review.
            // Without its own directory or a main workspace (workspace:none) there is nothing the Host could review.
            if (!childRoots.length && (role.execution !== "workspace-write" || !root || !input.root_path)) return;
            const granted = childRoots.length ? childRoots.find(root => root.id === observed.workspace!.id)! : { rootRef: root!.ref, path: input.root_path! };
            const childRun = { session_id: observed.childSession.ref.id, run_id: observed.run.ref.id };
            await saveIndex({ schema: 1, ref: observed.childSession.ref, title: role.name, owner: index.owner,
              parent_run: { session_id: observed.parentSession.id, run_id: observed.parentRun.id },
              attempts: [{ started_at: new Date().toISOString(), task: "", run_id: childRun.run_id, root_ref: granted.rootRef,
                frozen: { ...input.provenance.frozen, role_id: role.role_id, role_version: role.version, execution: role.execution,
                  subagent_workspaces: undefined, character: undefined, compaction: undefined, execution_plan: undefined, workspace: "required", directory: { canonical_path: granted.path, realpath_verified: true },
                  host_tools: [...role.host_tools], text_materials: [], skills: [], mcp_tools: [], mcp_sources: [], budget: null,
                  prompts: role.prompts.map(prompt => ({ prompt_id: prompt.prompt_id, version: prompt.version, layer: prompt.layer ?? "role" })) } }] });
            runRoots.set(childRun.run_id, granted.rootRef);
            activeRuns.set(childRun.run_id, { live: () => ["prepared", "running"].includes(observed.run.state), steer: text => observed.control.steer({ text }) });
            const bridgeFailed = async () => {
              const reason = "子任务的宿主审查或归属记录失败，已停止执行；请核对原工具结果后继续";
              const errors = subagentBridgeErrors.get(observed.parentRun.id) ?? {};
              errors[childRun.run_id] = reason;
              subagentBridgeErrors.set(observed.parentRun.id, errors);
              observed.control.stop("cancelled");
              try {
                await updateIndex(observed.parentSession.id, saved => {
                  const attempt = saved.attempts.find(attempt => attempt.run_id === observed.parentRun.id)!;
                  attempt.subagent_errors = { ...attempt.subagent_errors, [childRun.run_id]: reason };
                });
              } catch { errors[childRun.run_id] = reason + "；失败原因未能持久保存，请保留当前记录"; }
            };
            observed.run.subscribe(event => {
              if (event.type === "command-receipt") {
                const events = commandEvents.get(childRun.run_id) ?? [];
                if (!events.some(saved => sameRef(saved.receiptRef, event.receiptRef))) events.push(event);
                commandEvents.set(childRun.run_id, events);
              }
              if (event.type === "prompt" && event.role === "user") void updateIndex(childRun.session_id, saved => {
                if (!saved.attempts[0]!.task) saved.attempts[0]!.task = event.text;
              }).catch(bridgeFailed);
              if (event.type === "awaiting-approval") void approvals!.mirrorPending({ pendingRef: event.pendingRef, owner: index.owner, run: childRun })
                .catch(bridgeFailed);
            });
          },
        } } : {}),
        // Packed against the model's own window when it states a smaller one than the runtime default.
        ...(input.compaction || input.provenance.frozen.model_context ? { context: {
          // A failed early compaction does not end a round whose history still fits the window (the person chose this).
          ...(input.compaction ? { compactAboveTokens: input.compaction.above_tokens, continueWhenCompactionFails: true } : {}),
          ...(input.provenance.frozen.model_context ? { windowTokens: input.provenance.frozen.model_context.window_tokens } : {}),
        } } : {}),
        ...(input.compaction ? {
          compactor: createPrologueCompactor({ runtime, prompt: input.compaction.prompt, connection: {
            protocol: input.model.protocol, endpoint: input.model.endpoint, model: input.model.model, credentialRef,
            ...(input.model.prompt_cache === undefined || input.model.prompt_cache === "off" ? {} : { promptCache: input.model.prompt_cache }),
          } }),
        } : {}),
        start: {
          protocol: input.model.protocol,
          endpoint: input.model.endpoint,
          model: input.model.model,
          credentialRef,
          ...(input.provenance.frozen.budget?.max_output_tokens === undefined ? {} : { params: { maxOutputTokens: input.provenance.frozen.budget.max_output_tokens } }),
          // How long one model call may take to answer and then pause between parts. The SDK's 60 s default cut off
          // reasoning models on larger rounds before their first byte (MiniMax-M3, measured 2026-09-28); a round with
          // a time budget keeps that budget.
          timeoutMs: input.provenance.frozen.budget?.max_duration_ms ?? MODEL_CALL_TIMEOUT_MS,
          messages: [{ role: "user", text: input.task }],
          // Images the person brought ride on every model call of this Run; their bytes are spliced in by the Host.
          ...(input.image_materials?.length ? { attachments: input.image_materials.map(image => ({ ref: { kind: "resource" as const, id: image.resource.id, revision: image.resource.revision }, as: "original" as const })) } : {}),
          // `off` sends no field, so a Run with caching turned off is byte for
          // byte the request it would have been before caching existed.
          ...(input.model.prompt_cache === undefined || input.model.prompt_cache === "off"
            ? {}
            : { promptCache: input.model.prompt_cache }),
          // Absent when off: the request carries no thinking field at all. On, thinking and the answer share one
          // output limit, and the SDK's default (4096) is spent on thinking before a plan or file is written.
          ...(input.model.thinking ? { params: { thinking: input.model.thinking, maxOutputTokens: THINKING_OUTPUT_TOKENS } } : {}),
        },
        agent: {
          // A round started without a budget keeps the turns it always had; only subagents use the raised default.
          budget: {
            maxTurns: input.provenance.frozen.budget?.max_turns ?? ROUND_DEFAULT_TURNS,
            ...(input.provenance.frozen.budget?.max_total_tokens === undefined ? {} : { maxTokens: input.provenance.frozen.budget.max_total_tokens }),
            ...(input.provenance.frozen.budget?.max_duration_ms === undefined ? {} : { maxWallClockMs: input.provenance.frozen.budget.max_duration_ms }),
          },
          idempotencyKey: `molis-work-${input.session_id}-${randomUUID()}`,
          mode: input.mode,
          toolNames: runTools,
          mcpConnections: [...new Set([...(input.mcp_tools ?? []),...(input.mcp_sources ?? [])].map(mcpConnectionId))],
          characterRef: character.ref,
          ...(textResources.length ? { mount: { textResources } } : {}),
          ...(pinnedMemory.length ? { memory: { pinned: pinnedMemory, budgetChars: input.memory!.budget_chars } } : {}),
        },
      })).catch(async (error: unknown) => {
        // Refused while the context was still being packed: the runtime creates the run only after that, so nothing
        // ran and the attempt is a settled refusal rather than an unknown outcome that would block the session.
        const code = (error as { code?: string }).code;
        if (code && REFUSED_BEFORE_RUN.has(code)) await updateIndex(input.session_id, index => { index.attempts[attemptIndex]!.refused = { code, at: new Date().toISOString() }; }).catch(() => undefined);
        throw error;
      });
      if (root) runRoots.set(started.run.ref.id, root.ref);
      try { await updateIndex(input.session_id, index => { index.attempts[attemptIndex]!.run_id = started.run.ref.id; }); }
      catch (error) { actionController.abort(); started.control.stop("cancelled"); throw error; }
      if (actionTools?.names.length) actionControllers.set(started.run.ref.id, actionController);
      let stopping: Promise<void> | undefined;
      // A round is live until it ends: before its first model event it is still "prepared", and it hears a steer then too.
      runSessions.set(started.run.ref.id, session.ref.id);
      activeRuns.set(started.run.ref.id, { live: () => ["prepared", "running"].includes(started.run.state) && stopping === undefined,
        steer: text => started.control.steer({ text }) });
      if (plan && stepBoard) stepBoards.follow(stepBoard.ref, { session_id: session.ref.id, run_id: started.run.ref.id }, plan);
      // A main round is work under way in its project until it ends; a subtask's work is its parent's.
      if (!none && input.root_path && !index.parent_run) {
        try {
          const workId = await projectWork.begin(project, { session: session.ref, run_id: started.run.ref.id, title: input.session_title ?? index.title, task: input.task,
            directory: input.root_path, paths: scopePaths, ...(input.queued_work_id ? { queued: input.queued_work_id } : {}) });
          runWork.set(started.run.ref.id, { project, id: workId, session: session.ref, directory: input.root_path });
          liveSessions.set(session.ref.id, started.run.ref.id);
          // The round it was parked to start has started: that wait is taken up, so its firing starts nothing more.
          if (input.queued_work_id) await waitsPort.startedQueued(session.ref.id, input.queued_work_id).catch(() => undefined);
        } catch { /* not listed as project work; the round itself is unaffected */ }
      }
      const control = started.control;
      return {
        run: {
          ref: { id: started.run.ref.id },
          subscribe: (listener: (event: PrologueEvent) => void) =>
            started.run.subscribe((event) => {
              if (event.type === "text-delta" && typeof (event as { text?: unknown }).text === "string") memoryDone.spoken = (memoryDone.spoken + (event as { text: string }).text).slice(-4000);
              if (["completed", "failed", "cancelled"].includes(event.type)) {
                actionController.abort(); actionControllers.delete(started.run.ref.id);
                if (stepBoard) stepBoards.unfollow(stepBoard.ref.id);
                if (liveSessions.get(session.ref.id) === started.run.ref.id) liveSessions.delete(session.ref.id);
                const work = runWork.get(started.run.ref.id);
                if (work) { runWork.delete(started.run.ref.id); void projectWork.end(work.project, work.id, event.type === "cancelled" ? "stopped" : event.type).catch(() => undefined); }
                // A round that finished normally saw every message given to it; unanswered requests are settled.
                if (work && event.type === "completed") void messages.settle(session.ref.id).catch(() => undefined);
                // One that failed will not answer the requests someone waits on; they are ended so the waiting session wakes.
                if (work && event.type === "failed") void messages.failed(session.ref.id).catch(() => undefined);
              }
              if (event.type === "command-receipt") {
                const events = commandEvents.get(started.run.ref.id) ?? [];
                if (!events.some(saved => sameRef(saved.receiptRef, event.receiptRef))) events.push(event);
                commandEvents.set(started.run.ref.id, events);
              }
              if (event.type === "usage" || event.type === "usage-recorded") {
                const receipt: PrologueUsageReceipt = event.receipt;
                listener({ ...event, receipt });
              } else listener(event);
            }),
          cancel: () => { actionController.abort(); return started.run.cancel(); },
        },
        control: {
          get state() { return control.state; },
          stop(reason) {
            if (["completed", "failed", "stopped", "cancelled"].includes(control.state)) return Promise.resolve();
            // Persist user intent before cancellation; the SDK still owns when
            // the run actually ends. Repeated clicks reuse the first request.
            return stopping ??= (async () => {
              await updateIndex(input.session_id, index => { index.attempts[attemptIndex]!.stop_intent = reason; });
              actionController.abort();
              control.stop(reason);
            })().catch(error => { stopping = undefined; throw error; });
          },
          pause: () => control.pause(), resume: () => control.resume(),
          steer: input => control.steer(input), subscribe: listener => control.subscribe(listener),
        },
      };
    },
    shutdown: async () => {
      mcpLibrary.dispose();
      closingBuilders = true;
      await Promise.all([inference.close(), ...[...builders].map(builder => builder.close())]);
      for (const controller of actionControllers.values()) controller.abort();
      actionControllers.clear();
      stepBoards.close(); messages.close(); waitsPort.close();
      detachReviews?.();
      await checkpoints?.close(); await gitReviews?.close();
      return runtime.shutdown();
    },
  };

  return Object.assign(new PrologueAgentAdapter({
    runtime: port,
    modelConfiguration: options.modelConfiguration,
    approvals,
    async answerPending(run, answer) {
      if (!Number.isInteger(answer.pending_revision) || answer.pending_revision! < 1) {
        throw new PrologueAdapterError("agent.pending_not_open", "原问题缺少精确版本，不能提交答案");
      }
      const pending = await readQuestion(run, answer.pending_id, answer.pending_revision!);
      const now = await host.readClock();
      const unavailable = questionUnavailable(run, pending, now.monotonicMs);
      if (unavailable) throw new PrologueAdapterError("agent.pending_not_open", unavailable);
      if (pending.kind === "text") {
        if (typeof answer.text !== "string" || !answer.text.trim() || answer.answers !== undefined) throw new Error("请填写原问题的文字回答");
        await runtime.effects.pendings.answer(pending.ref, { kind: "text", text: answer.text }, now);
      } else {
        if (!answer.answers || answer.text !== undefined) throw new Error("请按原问卷逐题回答");
        await runtime.effects.pendings.answer(pending.ref, { kind: "questionnaire", answers: answer.answers }, now);
      }
    },
  }), { inference, createBuilderAgent, gitReviews, diagnostics: () => runtimeDiagnostics(runtime),
    /** The person's standing site decisions for the side panel's browser, applied to the running runtime. */
    surfaces: surfaceHost ? { decide: (decision: Parameters<PrologueSurfaces["decide"]>[0]) => surfaceHost!.decide(decision) } : undefined,
    async assertDirectoriesIdle(paths: readonly string[]) {
    const open = await runtime.listOpenWork();
    if (open.unavailable.length) throw new Error("未能查清未结束执行，暂不能整合工作区");
    for (const item of open.items) {
      if (!item.origin.session) continue; // Manual Git operations are guarded by the existing review queue.
      const index = await readIndex(item.origin.session);
      if (!index) throw new Error("未结束执行缺少目录归属，暂不能整合");
      const attempts = index.attempts.filter(attempt => !item.origin.run || attempt.run_id === item.origin.run);
      if (!attempts.length || attempts.some(attempt => attempt.frozen.execution !== "read-only" && attempt.frozen.directory && paths.includes(attempt.frozen.directory.canonical_path)
        || attempt.subagent_roots?.some(root => paths.includes(root.path)))) throw new Error(`“${index.title}”仍有涉及此目录的写入执行、待审或未知结果，请先核对原任务`);
    }
  } });
}

/** The runtime's own receipts, as the developer diagnostics page shows them. */
export function runtimeDiagnostics(runtime: Pick<import("@prologue/sdk").Runtime, "identity" | "state" | "assembly" | "capabilityReport" | "ledgerFailures">): AgentRuntimeDiagnostics {
  const report = runtime.capabilityReport;
  return {
    app: { app_id: runtime.identity.app.appId, app_version: runtime.identity.app.appVersion },
    state: runtime.state,
    fingerprint: runtime.assembly.fingerprint,
    slots: Object.entries(runtime.assembly.slots).map(([slot, resolved]) => ({ slot, state: resolved.state, implementation: resolved.implementation ?? null,
      version: resolved.version ?? null, why: resolved.why ?? null, fallback: resolved.usedFallback })),
    host: { requested: [...report.requested], effective: [...report.effective],
      not_present: Object.entries(report.actual).filter(([, state]) => state !== "present").map(([capability, state]) => ({ capability, state })) },
    ledger_failures: runtime.ledgerFailures.map(entry => ({ kind: entry.kind, seq: entry.seq, code: entry.code ?? null, detail: entry.detail ?? null })),
  };
}

function validRunTiming(value: unknown): value is PrologueRunTiming {
  if (!value || typeof value !== "object") return false;
  const timing = value as PrologueRunTiming;
  const at = (value: unknown) => value === null || typeof value === "string" && Number.isFinite(Date.parse(value));
  const rows = (value: unknown, key: "turn_id" | "call_id") => {
    if (!Array.isArray(value)) return false;
    const ids = new Set<string>();
    return value.every(item => {
      if (!item || typeof item[key] !== "string" || !item[key] || ids.has(item[key]) || !at(item.at)) return false;
      ids.add(item[key]); return true;
    });
  };
  return at(timing.ended_at) && rows(timing.turns, "turn_id") && rows(timing.activity, "call_id");
}

interface SessionIndex {
  schema: 1;
  /** Missing on historical rooted sessions. Never infer none from an absent directory. */
  workspace?: "required" | "none" | "business";
  parent_run?: AgentRunRef;
  ref: ExactRef<"session">;
  title: string;
  owner: PrologueRestoredSession["owner"];
  /** Frozen intent and display times only; streamed output stays in the SDK ledger. */
  attempts: Array<PrologueStartInput["provenance"] & { action_tool_scope?: string; refused?: { code: string; at: string }; step_board?: ExactRef<"task-board">; task: string; subagent_errors?: Record<string, string>; subagent_roots?: PrologueSubagentRoot[]; subagent_roles?: Array<[string, NonNullable<PrologueStartInput["subagents"]>[number]]>; run_id?: string; stop_intent?: "stopped" | "cancelled"; root_ref?: ExactRef<"authorized-root">; timing?: PrologueRunTiming }>;
  rewinds?: PrologueRewindIntent[];
  review_decisions?: Record<string, Pick<AgentReviewReceipt, "status" | "decided_by" | "decided_at" | "note"> & { requested_at?: string; expires_at?: string | null }>;
}

/** Prologue's own credential store, as much of it as this bridge needs. */
export interface PrologueCredentialHost {
  writeCredential(input: {
    label: string;
    secret: { plaintext: Uint8Array };
  }): Promise<{ ref: ExactRef<"credential"> }>;
}

/**
 * Hands a key across from Molis Work's secret store to Prologue's.
 *
 * Each Run resolves the current secret so rotation and removal take effect.
 * Equal secrets share one in-flight exchange; only a digest is kept in memory.
 * The plaintext bytes are zeroed right after the handover — the string itself
 * cannot be scrubbed in JavaScript, but the buffer that reached Prologue can.
 */
export class PrologueCredentialBridge {
  readonly #host: PrologueCredentialHost;
  readonly #resolve: PrologueNodeAdapterOptions["resolveCredential"];
  readonly #exchanged = new Map<string, { digest: string; result: Promise<ExactRef<"credential">> }>();

  constructor(input: {
    host: PrologueCredentialHost;
    resolve: PrologueNodeAdapterOptions["resolveCredential"];
  }) {
    this.#host = input.host;
    this.#resolve = input.resolve;
  }

  async prologueRefFor(credentialRef: string, resolve = this.#resolve, signal?: AbortSignal): Promise<ExactRef<"credential">> {
    if (resolve === undefined) {
      throw new Error(
        `没有配置凭据解析，${credentialRef} 在 Prologue 那边解析不了：`
        + "两边的密钥库是分开的，密钥必须交接一次",
      );
    }
    signal?.throwIfAborted();
    const plaintext = await resolve(credentialRef);
    signal?.throwIfAborted();
    if (plaintext === null || plaintext.trim() === "") {
      throw new Error(`密钥库里没有 ${credentialRef} 对应的密钥`);
    }
    const digest = createHash("sha256").update(plaintext).digest("hex");
    const cached = this.#exchanged.get(credentialRef);
    if (cached?.digest === digest) {
      const ref = await cached.result;
      signal?.throwIfAborted();
      if (await resolve(credentialRef) !== plaintext) throw new Error("模型凭据在交接期间已改变");
      signal?.throwIfAborted();
      return ref;
    }
    const bytes = new TextEncoder().encode(plaintext);
    const result = this.#host.writeCredential({ label: credentialRef, secret: { plaintext: bytes } })
      .then((snapshot) => snapshot.ref)
      .finally(() => bytes.fill(0));
    this.#exchanged.set(credentialRef, { digest, result });
    try {
      const ref = await result;
      signal?.throwIfAborted();
      if (await resolve(credentialRef) !== plaintext) throw new Error("模型凭据在交接期间已改变");
      signal?.throwIfAborted();
      return ref;
    } catch (error) {
      if (this.#exchanged.get(credentialRef)?.result === result) this.#exchanged.delete(credentialRef);
      throw error;
    }
  }
}

/** Translate the Host vocabulary at the SDK boundary; unknown tools fail before a Run. */
function prologueToolName(name: string): string {
  const translated = name === "read-file" ? "read" : name === "edit-file" ? "edit" : name;
  if (!(SYSTEM_TOOL_NAMES as readonly string[]).includes(translated)) {
    throw new Error(`agent.capability_unavailable: Prologue 不认识工具 ${name}`);
  }
  return translated;
}

/** Publish the actual instructions before handing their exact reference to Character. */
async function stageInstructions(
  sdk: Pick<Runtime, "resources">,
  instructions: string,
): Promise<ExactRef<"resource"> | undefined> {
  if (instructions.length > MAX_COMPOSED_INSTRUCTION_CHARS) {
    throw new PrologueAdapterError("agent.capability_unavailable", "本轮角色、项目说明、方法与恢复上下文合计超过 64000 字符，未启动执行。请缩短指令或减少本轮选择的方法后重试；不会截断指令。");
  }
  if (instructions.trim() === "") return undefined;
  return stageTextResource(sdk, instructions, "role-instructions");
}

async function stageTextResource(sdk: Pick<Runtime, "resources">, text: string, label: string): Promise<ExactRef<"resource">> {
  const bytes = new TextEncoder().encode(text);
  const stage = sdk.resources.stage({
    mediaKind: "text",
    byteLength: bytes.byteLength,
    label,
  });
  try {
    stage.write(bytes);
    return (await stage.publishDurable()).ref;
  } catch (error) {
    stage.discard();
    throw error;
  }
}
