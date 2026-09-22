import { createHash, randomUUID } from "node:crypto";
import { BUILT_IN_ADAPTERS, SYSTEM_TOOL_NAMES, createAdapterRegistry, createRuntime, prepareSkillIntent, fillSkillBody, type Skill, type ExactRef, type Runtime, type ModelEvent } from "@prologue/sdk";
import { createNodeHost } from "@prologue/sdk/node";
import path from "node:path";

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
import { createPrologueMcpLibrary, mcpConnectionId } from "./prologue-mcp.js";
import { createPrologueCheckpoints, type PrologueRewindIntent } from "./prologue-checkpoints.js";
import { createPrologueGitReviews, type PrologueGitReviewPort } from "./prologue-git.js";
import { createPrologueCompactor } from "./prologue-compaction.js";
import { createPrologueSkillLibrary } from "./prologue-methods.js";
import { resolveModelHostname } from "./node-model-dns.js";
import { agentTextMaterialContent } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentReviewReceipt, AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
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

// This resource combines base/role/Character/project instructions, selected
// methods and recovery context. The SDK default is for one instruction file;
// it must not silently cut a valid 20,000-character published Character.
const MAX_COMPOSED_INSTRUCTION_CHARS = 64_000;

/**
 * Build the Prologue Runtime on the Node host.
 *
 * Without a Host review owner it stays read-only. Attaching that owner enables
 * workspace writes with untrusted approval; each writing role must also pass
 * the capability matrix and its frozen tool allowlist.
 */
export async function createPrologueNodeAdapter(
  options: PrologueNodeAdapterOptions,
): Promise<PrologueAgentAdapter & { gitReviews?: PrologueGitReviewPort }> {
  const host = createNodeHost({
    ...(options.storageRoot === undefined ? {} : { storageRoot: options.storageRoot }),
    resolveHost: resolveModelHostname,
  });
  const runtime = await createRuntime({
    app: options.app,
    host,
    preset: "local-agent",
    config: { tool: { deferToolSchemasBeyond: 20 }, context: { maxInstructionChars: MAX_COMPOSED_INSTRUCTION_CHARS } },
    network: { model: true, mcp: true, loopback: true },
    posture: options.reviewQueue
      ? { sandbox: "workspace-write", approval: "untrusted" }
      : { sandbox: "read-only", approval: "on-request" },
    ...(options.reviewQueue ? { permissionMode: { mode: "ask-always" as const } } : {}),
    require: ["secrets", "network", "clock", "workspace.read", "storage"],
  });

  const mcpLibrary = createPrologueMcpLibrary(runtime);
  const registeredMethods = new Map<string, Skill>();
  const sessions = new Map<string, ExactRef<"session">>();
  const runRoots = new Map<string, ExactRef<"authorized-root">>();
  const activeRuns = new Map<string, { live(): boolean; steer(text: string): Promise<void> }>();
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
          return { kind: "tool-operation", tool: subject.name, summary: subject.name === "dispatch-subagent" ? (attempt.subagent_roots?.length ? "分派独立目录子任务；修改仍需审查，结果仍需核对" : "分派只读子任务；结果仍需核对") : "向原子任务补充要求",
            fields: [{ label: "本次完整参数", value: JSON.stringify(args, null, 2) }] };
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
        const childDirectory = index?.parent_run && index.attempts.find(attempt => attempt.run_id === pending.origin?.run)?.frozen.directory.canonical_path;
        if (review.kind === "workspace-command" && review.version === 1
          && typeof review.executable === "string" && Array.isArray(review.argv) && review.argv.every((arg: unknown) => typeof arg === "string")
          && typeof review.cwd === "string" && Number.isFinite(review.timeoutMs) && review.timeoutMs > 0
          && Array.isArray(review.envAllowlist) && review.envAllowlist.every((name: unknown) => typeof name === "string") && typeof review.escalate === "boolean") {
          reviewEffects.set(`prologue:${pending.ref.id}`, effect.ref);
          return { kind: "command", ...(childDirectory ? { workspace_path: childDirectory } : {}), command: review.executable, args: review.argv, cwd: review.cwd,
            timeout_ms: review.timeoutMs, env_allowlist: review.envAllowlist, escalate: review.escalate };
        }
        if (review.kind !== "workspace-patch" || review.version !== 1 || typeof review.path !== "string"
          || typeof review.baseExists !== "boolean" || typeof review.baseText !== "string" || typeof review.nextText !== "string") throw new Error("这类操作的完整审查尚未接通，不能批准");
        reviewEffects.set(`prologue:${pending.ref.id}`, effect.ref);
        return { kind: "text-edit", ...(childDirectory ? { workspace_path: childDirectory } : {}), target_path: review.path, exists: review.baseExists,
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
      // Save the existing Host decision and durable steer before denying the
      // pending: the next model boundary must not race ahead of the feedback.
      // Failure keeps the original delivery_error path; never claim receipt.
      if (receipt.status === "rejected" && receipt.note?.trim()) {
        const active = pending.origin.run && activeRuns.get(pending.origin.run);
        if (!active || !active.live()) throw new Error("原执行已结束，修改意见尚未交给 Agent");
        const request = options.reviewQueue!.get(receipt.review_id)!;
        const target = request.document.kind === "text-edit" ? request.document.target_path : request.kind;
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
  const inspectRecovery = async (sessionId: string): Promise<import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecoveryReport> => {
    const index = await readIndex(sessionId);
    if (!index) throw new Error("会话执行索引不可用");
    const report = await runtime.sessions.inspectRecovery(index.ref);
    const open = await runtime.listOpenWork();
    const blockers: string[] = [];
    if (index.attempts.some(attempt => !attempt.run_id)) blockers.push("一次启动未保存完整引用，暂不能确认它对应的操作。");
    if (report.runs.some(run => !index.attempts.some(attempt => attempt.run_id === run.ref.id))) blockers.push("存在未关联到此会话启动记录的轮次，需要核对来源。");
    if (open.unavailable.length) blockers.push("部分运行记录不可读取，请恢复存储访问后重新核对。");
    if (open.items.some(item => item.origin.session === sessionId && !report.runs.some(run => run.ref.id === item.origin.run || run.ref.id === item.id))) blockers.push("还有未关联到中断轮次的等待或操作，暂不能安全继续。");
    return { session_id: sessionId, blockers, runs: report.runs.map(run => {
      const reasons: string[] = [];
      if (run.live) reasons.push("此会话仍有活动执行，请通过执行控件停止。");
      if (run.operations.some(operation => operation.outcome === "unknown")) reasons.push("有操作缺少可核实的结果；不会自动重复执行，也不能将它标记为成功。");
      if (run.blockers.length && !reasons.length) reasons.push("执行或操作记录尚未核实，请稍后重新核对。");
      return { run_id: run.ref.id, version: run.version, live: run.live, waiting: run.waiting,
        operations: run.operations.map(operation => ({ ...operation })), blockers: reasons,
        can_close: run.canClose && blockers.length === 0 };
    }) };
  };
  const port: PrologueRuntimePort = {
    recovery: {
      inspect: session => inspectRecovery(session.session_id),
      close: async (session, runId, expectedVersion) => {
        const index = await readIndex(session.session_id);
        if (!index?.attempts.some(attempt => attempt.run_id === runId)) throw new Error("这轮执行不属于当前会话");
        const before = await inspectRecovery(session.session_id);
        if (before.blockers.length || before.runs.some(run => run.run_id === runId && !run.can_close)) throw new Error("仍有待核实的操作，不能关闭中断轮次");
        await runtime.sessions.recoverRun(index.ref, { kind: "run", id: runId, revision: 1 }, expectedVersion);
        return inspectRecovery(session.session_id);
      },
    },
    ...(options.reviewQueue ? { subagents: { workspaces: true as const, ...createPrologueSubagents(runtime, async run => {
      const index = await readIndex(run.session_id), attempt = index?.attempts.find(attempt => attempt.run_id === run.run_id);
      if (!attempt) throw new Error("原父任务归属不可读取");
      return { path: attempt.frozen.directory.canonical_path, roles: attempt.subagent_roles ?? [], roots: attempt.subagent_roots,
        errors: { ...attempt.subagent_errors, ...subagentBridgeErrors.get(run.run_id) } };
    }) } } : {}),
    inlineMethods: true,
    compaction: true,
    ...(checkpoints ? { checkpoints } : {}),
    async saveRunTiming(run, timing) {
      await updateIndex(run.session_id, index => {
        const attempt = index.attempts.find(item => item.run_id === run.run_id);
        if (!attempt) throw new Error("这轮执行不属于宿主会话索引，不能保存显示时间");
        attempt.timing = structuredClone(timing);
      });
    },
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
        await checkpoints?.restore(id);
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
          const pendingQuestions = !ref ? (await runtime.effects.pendings.readByOrigin({ session: id, run: attempt.run_id })).filter(pending => pending.state !== "settled" && ["text", "questionnaire"].includes(pending.kind)) : [];
          if (!ref) reasons.push("中断轮次仅有已保存的过程，结束状态与操作仍需核对，不会自动重复执行");
          runs.push({ ref: { run_id: attempt.run_id, session_id: id }, frozen: attempt.frozen,
            started_at: attempt.started_at, task: attempt.task,
            ...(attempt.stop_intent ? { stop_intent: attempt.stop_intent } : {}),
            ...(attempt.timing ? { timing: attempt.timing } : {}),
            ...(!ref ? { original_questions: pendingQuestions.filter(pending => pending.origin?.run === attempt.run_id).map(pending => ({ pending_id: pending.ref.id, pending_revision: pending.ref.revision, kind: pending.kind, why: pending.why })) } : {}),
            events: ref ? await session.replay(ref) : await session.readRunProgress({ kind: "run", id: attempt.run_id, revision: 1 }) });
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
      if (input.subagent_workspaces?.length && input.character.tools.some(tool => !["read-file", "search", "context-remaining", "dispatch-subagent", "await-subagents", "steer-subagent", "ask-user"].includes(tool))) throw new Error("独立目录协调者只能读取和分派，不能持有其他执行工具");
      for (const grant of input.subagent_workspaces ?? []) {
        const overlaps = (a: string, b: string) => { const relative = path.relative(a, b); return !relative || !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative); };
        if ([input.root_path, ...childRoots.map(root => root.path)].some(other => overlaps(other, grant.directory.canonical_path) || overlaps(grant.directory.canonical_path, other))) throw new Error("子任务目录必须与主目录及其他子目录互不包含");
        const authorized = await runtime.workspace.authorize({ path: grant.directory.canonical_path });
        childRoots.push({ id: grant.workspace_id, rootRef: authorized.ref, path: grant.directory.canonical_path });
      }
      const childRoles = new Map<string, NonNullable<PrologueStartInput["subagents"]>[number]>();
      for (const role of input.subagents ?? []) {
        const allowed = ["read-file", "search", "context-remaining", ...(childRoots.length && role.execution !== "read-only" ? ["write", "edit-file"] : []), ...(childRoots.length && role.execution === "workspace-write" ? ["run-command"] : [])];
        if (!childRoots.length && role.execution !== "read-only" || role.host_tools.some(tool => !allowed.includes(tool) || !childRoots.length && !input.character.tools.includes(tool))) throw new Error("子角色超出本轮允许的工具与目录");
        const ref = await stageInstructions(runtime, role.prompts.map(prompt => prompt.body).join("\n\n"));
        const draft = runtime.characters.create({ id: `molis-child-${randomUUID()}`, version: role.version, name: role.name, role: role.role_id,
          ...(ref ? { instructionsRef: ref } : {}), tools: role.host_tools.map(prologueToolName) });
        const published = runtime.characters.publish(draft.ref);
        childRoles.set(exactCharacterKey(published.ref), role);
      }
      const childScope = childRoots.length
        ? "每个子任务必须选择一个不同的 workspace 标识：" + JSON.stringify(childRoots.map(root => ({ id: root.id, path: root.path }))) + "。主任务只读，不能直接修改主工作区。子任务只在自己的目录里执行，修改仍经过宿主审查。"
        : "本轮没有分配独立子目录，不得填写 workspace 参数；所有子任务沿用当前授权目录且只读。";
      const childInstructions = childRoles.size ? childScope + "可分派的固定子角色：\n" + [...childRoles].map(([ref, role]) => `${ref}: ${role.name}; tools=${JSON.stringify(role.host_tools.map(prologueToolName))}`).join("\n") + "\n必须选择上述精确 character，并显式提供该角色列出的完整 tools 清单；不能遗漏角色需要的工具或增加其他工具。给子任务写清任务、必要上下文、依据路径与完成条件；不继承父聊天或材料。子任务只能使用所选角色的工具，不能再次分派。需要用户信息时作为阻塞返回给父任务。" : "";
      const instructions = await stageInstructions(runtime, [input.character.instructions, childInstructions, ...methods, await checkpoints?.context(input.session_id) ?? ""].join("\n\n"));
      const index = await readIndex(input.session_id);
      if (!index) throw new Error("执行归属不可读");
      await mcpLibrary.validate(index.owner, input.mcp_tools ?? []);
      await mcpLibrary.validateSources(index.owner,input.mcp_sources ?? []);
      const mcpTools: string[] = [];
      for (const selected of input.mcp_tools ?? []) {
        const conn = runtime.mcp.list().find(item => item.id === mcpConnectionId(selected))!;
        const snapshot = runtime.mcp.snapshotOf(conn.ref);
        const at = snapshot.tools.findIndex(tool => tool.name === selected.tool && tool.shapeFingerprint === selected.version);
        const adopted = runtime.adoptMcpTools(conn.ref);
        if (at < 0 || !adopted[at]) throw new Error("MCP 工具已变化，请重新选择");
        mcpTools.push(adopted[at]!);
      }
      const tools = [...input.character.tools.map(prologueToolName), ...mcpTools];
      const runTools = [...new Set([...tools, ...[...childRoles.values()].flatMap(role => role.host_tools.map(prologueToolName))])];
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
      const attempt: SessionIndex["attempts"][number] = { ...input.provenance, task: input.task, root_ref: root.ref, ...(childRoles.size ? { subagent_roles: [...childRoles], subagent_roots: childRoots } : {}) };
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
        ...(childRoles.size ? { subagents: {
          ...(childRoots.length ? { workspaces: childRoots.map(({ id, rootRef }) => ({ id, rootRef })), requireWorkspace: true } : {}),
          onStarted: async observed => {
            verifySubagentStart(runtime, childRoles, childRoots)(observed);
            if (!childRoots.length) return;
            const registered = runtime.subagents.list().find(child => child.run.id === observed.run.ref.id && child.session.id === observed.childSession.ref.id)!;
            const role = childRoles.get(exactCharacterKey(registered.character!))!;
            const granted = childRoots.find(root => root.id === observed.workspace!.id)!;
            const childRun = { session_id: observed.childSession.ref.id, run_id: observed.run.ref.id };
            await saveIndex({ schema: 1, ref: observed.childSession.ref, title: role.name, owner: index.owner,
              parent_run: { session_id: observed.parentSession.id, run_id: observed.parentRun.id },
              attempts: [{ started_at: new Date().toISOString(), task: "", run_id: childRun.run_id, root_ref: granted.rootRef,
                frozen: { ...input.provenance.frozen, role_id: role.role_id, role_version: role.version, execution: role.execution,
                  subagent_workspaces: undefined, character: undefined, compaction: undefined, directory: { canonical_path: granted.path, realpath_verified: true },
                  host_tools: [...role.host_tools], text_materials: [], skills: [], mcp_tools: [], mcp_sources: [], budget: null,
                  prompts: role.prompts.map(prompt => ({ prompt_id: prompt.prompt_id, version: prompt.version, layer: prompt.layer ?? "role" })) } }] });
            runRoots.set(childRun.run_id, granted.rootRef);
            activeRuns.set(childRun.run_id, { live: () => observed.run.state === "running", steer: text => observed.control.steer({ text }) });
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
        ...(input.compaction ? {
          context: { compactAboveTokens: input.compaction.above_tokens },
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
          toolNames: runTools,
          mcpConnections: [...new Set([...(input.mcp_tools ?? []),...(input.mcp_sources ?? [])].map(mcpConnectionId))],
          characterRef: character.ref,
          ...(textResources.length ? { mount: { textResources } } : {}),
        },
      });
      runRoots.set(started.run.ref.id, root.ref);
      try { await updateIndex(input.session_id, index => { index.attempts[attemptIndex]!.run_id = started.run.ref.id; }); }
      catch (error) { started.control.stop("cancelled"); throw error; }
      let stopping: Promise<void> | undefined;
      activeRuns.set(started.run.ref.id, { live: () => started.run.state === "running" && stopping === undefined,
        steer: text => started.control.steer({ text }) });
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
    shutdown: async () => { detachReviews?.(); await checkpoints?.close(); await gitReviews?.close(); return runtime.shutdown(); },
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
  }), { gitReviews });
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
  parent_run?: AgentRunRef;
  ref: ExactRef<"session">;
  title: string;
  owner: PrologueRestoredSession["owner"];
  /** Frozen intent and display times only; streamed output stays in the SDK ledger. */
  attempts: Array<PrologueStartInput["provenance"] & { task: string; subagent_errors?: Record<string, string>; subagent_roots?: PrologueSubagentRoot[]; subagent_roles?: Array<[string, NonNullable<PrologueStartInput["subagents"]>[number]]>; run_id?: string; stop_intent?: "stopped" | "cancelled"; root_ref?: ExactRef<"authorized-root">; timing?: PrologueRunTiming }>;
  rewinds?: PrologueRewindIntent[];
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
