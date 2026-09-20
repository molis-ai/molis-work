import { createHash, randomUUID } from "node:crypto";
import { BUILT_IN_ADAPTERS, SYSTEM_TOOL_NAMES, createAdapterRegistry, createRuntime, type ExactRef, type Runtime, type ModelEvent } from "@prologue/sdk";
import { createNodeHost } from "@prologue/sdk/node";

import {
  PrologueAgentAdapter,
  type PrologueAdapterPorts,
  type PrologueRuntimePort,
  type PrologueStartInput,
  type PrologueRestoredSession,
} from "./prologue.js";
import type { PrologueEvent, PrologueUsageReceipt } from "./prologue-stream.js";
import { resolveModelHostname } from "./node-model-dns.js";
import type { AgentReviewReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";
import { PrologueApprovalBridge, type ProloguePendingPort } from "./prologue-approvals.js";
import type { AgentReviewQueue } from "../reviews.js";

/**
 * The one file that imports the Prologue SDK.
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
 * there reaches our tests instead of quietly diverging. It lives in this file
 * because this is the one file allowed to import the SDK — that boundary is
 * what keeps the rest of the adapter testable without a model, a network or a
 * disk, and it is worth more than the convenience of importing twice.
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
  /** Host-owned surface; absence keeps all writes unavailable. */
  reviewQueue?: AgentReviewQueue;
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
}

/**
 * Build the Prologue Runtime on the Node host.
 *
 * Without a Host review owner it stays read-only. Attaching that owner enables
 * workspace writes with untrusted approval; each writing role must also pass
 * the capability matrix and its frozen tool allowlist.
 */
export async function createPrologueNodeAdapter(
  options: PrologueNodeAdapterOptions,
): Promise<PrologueAgentAdapter> {
  const host = createNodeHost({
    ...(options.storageRoot === undefined ? {} : { storageRoot: options.storageRoot }),
    resolveHost: resolveModelHostname,
  });
  const runtime = await createRuntime({
    app: options.app,
    host,
    preset: "local-agent",
    network: { model: true },
    posture: options.reviewQueue
      ? { sandbox: "workspace-write", approval: "untrusted" }
      : { sandbox: "read-only", approval: "on-request" },
    ...(options.reviewQueue ? { permissionMode: { mode: "ask-always" as const } } : {}),
    require: ["secrets", "network", "clock", "workspace.read", "storage"],
  });

  const sessions = new Map<string, ExactRef<"session">>();
  const runRoots = new Map<string, ExactRef<"authorized-root">>();
  const activeRuns = new Map<string, () => boolean>();
  const reviewEffects = new Map<string, ExactRef<"effect">>();
  const deadlines = new Map<string, number>();
  type CommandEvent = Extract<ModelEvent, { type: "command-receipt" }>;
  const commandEvents = new Map<string, CommandEvent[]>();
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
          && Boolean(pending.origin?.run && activeRuns.get(pending.origin.run)?.());
      },
      async answer(ref, answer) { return runtime.effects.pendings.answer(ref, answer, await host.readClock()); },
      async document(pending) {
        const effect = pending.effectRef && runtime.effects.get(pending.effectRef);
        const ref = effect?.proposal.reviewRef;
        if (!effect || !ref || effect.proposal.origin?.session !== pending.origin?.session
          || effect.proposal.origin?.run !== pending.origin?.run) throw new Error("原始审查或执行归属不可用，不能批准");
        const review = await readResource(ref);
        const root = pending.origin?.run && runRoots.get(pending.origin.run);
        if (!root || review.rootRef?.kind !== root.kind || review.rootRef?.id !== root.id || review.rootRef?.revision !== root.revision) throw new Error("审查工作区与本轮授权不一致");
        if (review.kind === "workspace-command" && review.version === 1
          && typeof review.executable === "string" && Array.isArray(review.argv) && review.argv.every((arg: unknown) => typeof arg === "string")
          && typeof review.cwd === "string" && Number.isFinite(review.timeoutMs) && review.timeoutMs > 0
          && Array.isArray(review.envAllowlist) && review.envAllowlist.every((name: unknown) => typeof name === "string") && typeof review.escalate === "boolean") {
          reviewEffects.set(`prologue:${pending.ref.id}`, effect.ref);
          return { kind: "command", command: review.executable, args: review.argv, cwd: review.cwd,
            timeout_ms: review.timeoutMs, env_allowlist: review.envAllowlist, escalate: review.escalate };
        }
        if (review.kind !== "workspace-patch" || review.version !== 1 || typeof review.path !== "string"
          || typeof review.baseExists !== "boolean" || typeof review.baseText !== "string" || typeof review.nextText !== "string") throw new Error("这类操作的完整审查尚未接通，不能批准");
        reviewEffects.set(`prologue:${pending.ref.id}`, effect.ref);
        return { kind: "text-edit", target_path: review.path, exists: review.baseExists,
          before_text: review.baseExists ? review.baseText : null, after_text: review.nextText };
      },
  };
  const approvals = options.reviewQueue && new PrologueApprovalBridge({
    queue: options.reviewQueue, pendings: pendingPort,
    async recordDecision(pending, receipt) {
      if (!pending.origin?.session) throw new Error("审查缺少会话归属，不能保存决定");
      await updateIndex(pending.origin.session, index => {
        index.review_decisions ??= {};
        index.review_decisions[pending.ref.id] = { status: receipt.status, decided_by: receipt.decided_by, decided_at: receipt.decided_at, note: receipt.note };
      });
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
        const request = { review_id: `prologue:${pending.ref.id}`, run: { session_id: pending.origin.session, run_id: pending.origin.run },
          board_id: boardId, plugin_id: index.owner.plugin_id, kind: document.kind, document,
          requested_at: new Date(effect.preparedAtMs).toISOString(), expires_at: null };
        const decision = index.review_decisions?.[pending.ref.id];
        if (decision) options.reviewQueue!.restoreDecision(request, decision);
        else { options.reviewQueue!.request(request); options.reviewQueue!.cancel(request.review_id, "历史操作没有可恢复的批准；保留原提案供核对，不会重新执行"); }
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
  const credentials = new PrologueCredentialBridge({
    host: { writeCredential: (input) => runtime.credentials.write(input) },
    resolve: options.resolveCredential,
  });
  const port: PrologueRuntimePort = {
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
        await saveIndex({ schema: 1, ref: session.ref, title: input.title,
          owner: { board_id: input.board_id, plugin_id: input.plugin_id, install_id: input.install_id }, attempts: [] });
        sessions.set(session.ref.id, session.ref);
        return session;
      },
      async restore(id) {
        const index = await readIndex(id);
        if (!index) return undefined;
        const session = await runtime.sessions.open(index.ref);
        if (!session) throw new Error("SDK 会话已不可读，保留原引用，不能创建新会话替代");
        const terminal = await session.terminalRuns();
        const open = await runtime.listOpenWork();
        const reasons: string[] = [];
        if (open.unavailable.length) reasons.push("未能查清运行时的未结束工作，暂不能安全继续");
        if (open.items.some(item => item.origin.session === id)) reasons.push("此会话仍有中断的执行、等待或结果未知的操作，需要核对");
        if (terminal.some(ref => !index.attempts.some(attempt => attempt.run_id === ref.id))) reasons.push("SDK 有执行记录缺少宿主启动索引，需要核对对应关系");
        const runs: PrologueRestoredSession["runs"] = [];
        for (const attempt of index.attempts) {
          if (!attempt.run_id) { reasons.push("一次启动没有完整保存执行引用，不能判断是否发生过操作"); continue; }
          const ref = terminal.find(ref => ref.id === attempt.run_id);
          if (!ref) reasons.push("中断轮次尚未提交事件账，不会自动重复执行");
          runs.push({ ref: { run_id: attempt.run_id, session_id: id }, frozen: attempt.frozen,
            started_at: attempt.started_at, task: attempt.task,
            ...(attempt.stop_intent ? { stop_intent: attempt.stop_intent } : {}),
            ...(ref ? { events: await session.replay(ref) } : {}) });
        }
        sessions.set(id, index.ref);
        return { title: index.title, owner: index.owner, runs,
          ...(reasons.length ? { recovery: { required: true as const, reason: [...new Set(reasons)].join("；") } } : {}) };
      },
    },
    async startAgentRun(input: PrologueStartInput) {
      const ref = sessions.get(input.session_id);
      const session = ref === undefined ? undefined : await runtime.sessions.open(ref);
      if (session === undefined) throw new Error("agent.session_unknown");
      const root = await runtime.workspace.authorize({ path: input.root_path });
      // Long instructions travel as a resource reference, not inline in the profile.
      const instructions = await stageInstructions(runtime, input.character.instructions);
      const tools = input.character.tools.map(prologueToolName);
      const created = runtime.characters.create({
        // This is a projection of the frozen role, not a user-managed Character.
        // A project prompt may change without changing the package role version.
        id: `molis-role-${randomUUID()}`,
        version: input.character.version,
        name: input.character.name,
        role: input.character.name,
        ...(instructions === undefined ? {} : { instructionsRef: instructions }),
        tools,
      });
      const character = runtime.characters.publish(created.ref);

      // Exchange our reference for one Prologue can resolve, before the Run
      // is started rather than when it first calls out.
      const credentialRef = await credentials.prologueRefFor(input.model.credential_ref);
      const attempt: SessionIndex["attempts"][number] = { ...input.provenance, task: input.task, root_ref: root.ref };
      let attemptIndex = -1;
      // Persist the intent before the SDK can dispatch a model or tool. A crash
      // in this window remains visibly unresolved instead of silently retrying.
      await updateIndex(input.session_id, index => {
        attemptIndex = index.attempts.length;
        index.attempts.push(attempt);
      });
      const started = await runtime.startAgentRun({
        session,
        rootRef: root.ref,
        history: "session",
        start: {
          protocol: input.model.protocol,
          endpoint: input.model.endpoint,
          model: input.model.model,
          credentialRef,
          messages: [{ role: "user", text: input.task }],
          // `off` sends no field, so a Run with caching turned off is byte for
          // byte the request it would have been before caching existed.
          ...(input.model.prompt_cache === undefined || input.model.prompt_cache === "off"
            ? {}
            : { promptCache: input.model.prompt_cache }),
        },
        agent: {
          idempotencyKey: `molis-work-${input.session_id}-${randomUUID()}`,
          mode: input.mode,
          toolNames: tools,
          characterRef: character.ref,
        },
      });
      runRoots.set(started.run.ref.id, root.ref);
      try { await updateIndex(input.session_id, index => { index.attempts[attemptIndex]!.run_id = started.run.ref.id; }); }
      catch (error) { started.control.stop("cancelled"); throw error; }
      let stopping: Promise<void> | undefined;
      activeRuns.set(started.run.ref.id, () => started.run.state === "running" && stopping === undefined);
      const control = started.control;
      return {
        run: {
          ref: { id: started.run.ref.id },
          subscribe: (listener: (event: PrologueEvent) => void) =>
            started.run.subscribe((event) => {
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
          cancel: () => started.run.cancel(),
        },
        control: {
          get state() { return control.state; },
          stop(reason) {
            if (["completed", "failed", "stopped", "cancelled"].includes(control.state)) return Promise.resolve();
            // Persist user intent before cancellation; the SDK still owns when
            // the run actually ends. Repeated clicks reuse the first request.
            return stopping ??= (async () => {
              await updateIndex(input.session_id, index => { index.attempts[attemptIndex]!.stop_intent = reason; });
              control.stop(reason);
            })().catch(error => { stopping = undefined; throw error; });
          },
          pause: () => control.pause(), resume: () => control.resume(),
          steer: input => control.steer(input), subscribe: listener => control.subscribe(listener),
        },
      };
    },
    shutdown: () => { detachReviews?.(); return runtime.shutdown(); },
  };

  return new PrologueAgentAdapter({
    runtime: port,
    modelConfiguration: options.modelConfiguration,
    approvals,
  });
}

interface SessionIndex {
  schema: 1;
  ref: ExactRef<"session">;
  title: string;
  owner: PrologueRestoredSession["owner"];
  /** Frozen user intent, not streamed output or a second execution ledger. */
  attempts: Array<PrologueStartInput["provenance"] & { task: string; run_id?: string; stop_intent?: "stopped" | "cancelled"; root_ref?: ExactRef<"authorized-root"> }>;
  review_decisions?: Record<string, Pick<AgentReviewReceipt, "status" | "decided_by" | "decided_at" | "note">>;
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

  async prologueRefFor(credentialRef: string): Promise<ExactRef<"credential">> {
    if (this.#resolve === undefined) {
      throw new Error(
        `没有配置凭据解析，${credentialRef} 在 Prologue 那边解析不了：`
        + "两边的密钥库是分开的，密钥必须交接一次",
      );
    }
    const plaintext = await this.#resolve(credentialRef);
    if (plaintext === null || plaintext.trim() === "") {
      throw new Error(`密钥库里没有 ${credentialRef} 对应的密钥`);
    }
    const digest = createHash("sha256").update(plaintext).digest("hex");
    const cached = this.#exchanged.get(credentialRef);
    if (cached?.digest === digest) return cached.result;
    const bytes = new TextEncoder().encode(plaintext);
    const result = this.#host.writeCredential({ label: credentialRef, secret: { plaintext: bytes } })
      .then((snapshot) => snapshot.ref)
      .finally(() => bytes.fill(0));
    this.#exchanged.set(credentialRef, { digest, result });
    try {
      return await result;
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
  if (instructions.trim() === "") return undefined;
  const bytes = new TextEncoder().encode(instructions);
  const stage = sdk.resources.stage({
    mediaKind: "text",
    byteLength: bytes.byteLength,
    label: "role-instructions",
  });
  try {
    stage.write(bytes);
    return (await stage.publishDurable()).ref;
  } catch (error) {
    stage.discard();
    throw error;
  }
}
