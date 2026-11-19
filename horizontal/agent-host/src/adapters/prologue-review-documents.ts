import { isDeepStrictEqual } from "node:util";
import { WORKSPACE_COMMAND_KIND, isAfterWriteCheckOperationKey, type ExactRef, type Runtime } from "@prologue/sdk";
import type { AgentReviewReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";
import { gatewayReview, isGatewayChange } from "./prologue-action-gateway.js";
import { agentActionToolName, MOLIS_ACTION_TOOL_PREFIX } from "./prologue-action-tools.js";
import { PrologueApprovalBridge, type ProloguePendingPort } from "./prologue-approvals.js";
import { mcpConnectionId } from "./prologue-mcp.js";
import type { PrologueSurfaces } from "./prologue-surfaces.js";
import { presentReview, presentToolReview, reviewField, reviewText, type ReviewWord } from "../review-presentation.js";
import { createSurfaceReview, type SurfaceReview } from "./prologue-surface-review.js";
import type { createProjectWork } from "./prologue-project-work.js";
import { readResource, type NodeHost, type PrologueNodeAdapterOptions, type RoundState } from "./prologue-node-kit.js";
import type { SessionIndexStore } from "./prologue-session-index.js";
import { prologueReviewReference } from "./prologue-review-decisions.js";
import { inspectReviewEffect } from "./prologue-review-effects.js";
import { writeCheckKey } from "./prologue-write-checks.js";
import type { ReviewDecisionStore } from "../review-decisions.js";
import { matchExactPermission, reusableInput, type ExactPermission } from "./prologue-exact-permission.js";

/**
 * What the person reviews before a held operation goes through (W4-06 split this out of the Node composition): the
 * pending-question port, the card for each kind of operation, the approval bridge, and the review history a project reads
 * back after a restart.
 */
interface ReviewDeps {
  readonly runtime: Runtime;
  readonly host: NodeHost;
  readonly state: RoundState;
  readonly index: SessionIndexStore;
  readonly options: PrologueNodeAdapterOptions;
  readonly surfaces: () => PrologueSurfaces | undefined;
  readonly projectWork: ReturnType<typeof createProjectWork>;
  readonly decisions: ReviewDecisionStore;
}

type Pending = Parameters<ProloguePendingPort["document"]>[0];
type Effect = NonNullable<ReturnType<Runtime["effects"]["get"]>>;
type Card = Awaited<ReturnType<ProloguePendingPort["document"]>>;

const attemptOf = async (deps: ReviewDeps, pending: Pending) => {
  const index = await deps.index.read(pending.origin!.session!);
  return { index, attempt: index?.attempts.find(item => item.run_id === pending.origin!.run) };
};
const jsonObject = (input: string, message: string) => {
  const args = JSON.parse(input);
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error(message);
  return args;
};

/** Dispatching or steering a subagent: who is sent, to do what, with which tools and where, with the exact arguments. */
async function subagentCard(deps: ReviewDeps, pending: Pending, subject: { name: string; input?: unknown }): Promise<Card> {
  const { attempt } = await attemptOf(deps, pending);
  if (!attempt?.frozen.host_tools.includes(subject.name) || typeof subject.input !== "string") throw new Error("子任务操作不属于本轮固定工具");
  const args = jsonObject(subject.input, "子任务操作参数无效");
  const roleKey = typeof args.character === "string" ? args.character.split("@")[0] : "";
  const role = attempt.subagent_roles?.find(([key]) => key === roleKey)?.[1];
  const root = typeof args.workspace === "string" ? attempt.subagent_roots?.find(entry => entry.id === args.workspace) : undefined;
  const dispatch = subject.name === "dispatch-subagent", separate = Boolean(attempt.subagent_roots?.length);
  const readable = [
    ...(role ? [reviewField("子任务角色", role.name, "subtask-role")] : []),
    ...(typeof args.instruction === "string" ? [reviewField(dispatch ? "分工" : "补充要求", args.instruction, dispatch ? "assignment" : "additional-instructions")]
      : typeof args.text === "string" ? [reviewField("补充要求", args.text, "additional-instructions")] : []),
    ...(Array.isArray(args.tools) ? [reviewField("可用工具", args.tools.join("、"), "available-tools")] : []),
    ...(root ? [reviewField("工作目录", root.path, "working-directory")] : []),
  ];
  return presentToolReview({ kind: "tool-operation", tool: subject.name, summary: dispatch ? (separate ? "分派独立目录子任务；修改仍需审查，结果仍需核对" : "分派只读子任务；结果仍需核对") : "向原子任务补充要求" },
    [...readable, reviewField("本次完整参数", JSON.stringify(args, null, 2), "exact-arguments")],
    [reviewText(dispatch ? (separate ? "dispatch-separate" : "dispatch-read-only") : "steer-subtask")]);
}

/** Stopping a background command has no review resource of its own: the card names the command it stops. */
function commandStopCard(deps: ReviewDeps, subject: { name: string; input?: unknown }): Card {
  if (typeof subject.input !== "string") throw new Error("停止命令的参数不可读，不能批准");
  const args = JSON.parse(subject.input);
  const handle = args && typeof args === "object" && typeof args.handle === "string" ? args.handle : "";
  const task = handle ? deps.runtime.background.get(handle) : undefined;
  return presentToolReview({ kind: "tool-operation", tool: subject.name, summary: task ? "停止一条后台命令" : "停止一条命令" }, [
    reviewField("命令", task?.summary ?? handle, "command", { format: "sh" }),
    ...(task ? [reviewField("现在", task.state === "running" ? "还在运行" : task.state, "current-state",
      task.state === "running" ? { value: [reviewText("value.still-running")] } : {})] : []),
    reviewField("本次完整参数", JSON.stringify(args, null, 2), "exact-arguments"),
  ], [reviewText(task ? "stop-background" : "stop-command")]);
}

/** A change through the business gateway, a catalog action, or an MCP call: the card from the round's frozen tools. */
async function actionCard(deps: ReviewDeps, pending: Pending, effect: Effect, subject: { name: string; input?: unknown }): Promise<Card | undefined> {
  if (isGatewayChange(subject.name)) {
    if (typeof subject.input !== "string") throw new Error("所请求修改的参数不可读，不能批准");
    const { attempt } = await attemptOf(deps, pending);
    const gateway = effect.state === "awaiting-approval" && deps.state.activeRuns.get(pending.origin!.run!)?.live()
      ? deps.state.gatewayRuns.get(pending.origin!.session!) : undefined;
    if (!attempt?.frozen.action_gateway) throw new Error("这项修改不属于本轮的能力网关，不能批准");
    // History is drawn from the original proposal, never today's directory or
    // a recreated live gateway. This card cannot authorize execution.
    if (!gateway) return presentToolReview({ kind: "tool-operation", tool: subject.name, summary: effect.proposal.summary },
      [reviewField("本次完整参数", subject.input, "exact-arguments", { format: "exact" })]);
    const selected = deps.state.actionReviews.get(pending.origin!.session!)?.forEffect(effect);
    if (!selected) throw new Error("原能力审查授权不可读取");
    return gatewayReview(subject.input, selected.view, subject.name);
  }
  if (subject.name.startsWith(MOLIS_ACTION_TOOL_PREFIX)) {
    if (typeof subject.input !== "string") throw new Error("Action arguments are unavailable");
    const { attempt } = await attemptOf(deps, pending);
    const selected = attempt?.action_tool_scope && attempt.frozen.action_tools?.find(ref => agentActionToolName(ref, attempt.action_tool_scope!) === subject.name);
    if (!selected) throw new Error("Action is outside this run's frozen tools");
    const args = jsonObject(subject.input, "Invalid action arguments");
    return presentToolReview({ kind: "tool-operation", tool: subject.name, summary: effect.proposal.summary }, [
      reviewField("Capability", selected.capability_id, "capability"), reviewField("Version", String(selected.version), "version"),
      reviewField("Provider", selected.provider_id, "provider"), reviewField("Arguments", JSON.stringify(args, null, 2), "arguments"),
    ]);
  }
  if (subject.name.startsWith("mcp:")) {
    if (typeof subject.input !== "string") throw new Error("MCP 原始参数不可读，不能批准");
    const { attempt } = await attemptOf(deps, pending);
    const selected = attempt?.frozen.mcp_tools.find(item => `mcp:${mcpConnectionId(item)}/${item.tool}` === subject.name);
    if (!selected) throw new Error("MCP 操作不属于本轮固定工具，不能批准");
    jsonObject(subject.input, "MCP 原始参数格式无效");
    return { kind: "mcp", server: selected.server_label ?? selected.server, tool: selected.tool, arguments_json: subject.input };
  }
  return undefined;
}

/** A command or a file change in the round's own workspace: read from the exact review resource the runtime published. */
async function workspaceCard(deps: ReviewDeps, pending: Pending, ref: ExactRef<"resource">, hold?: (scope: ExactPermission) => void): Promise<Card> {
  const review = await readResource(deps.runtime, ref);
  const index = pending.origin?.session ? await deps.index.read(pending.origin.session) : undefined;
  const attempt = index?.attempts.find(each => each.run_id === pending.origin?.run);
  const root = pending.origin?.run && (deps.state.activeRuns.get(pending.origin.run)?.live() ? deps.state.runRoots.get(pending.origin.run) : attempt?.root_ref);
  if (!root || review.rootRef?.kind !== root.kind || review.rootRef?.id !== root.id || review.rootRef?.revision !== root.revision) throw new Error("审查工作区与本轮授权不一致");
  const childDirectory = index?.parent_run && attempt?.frozen.directory?.canonical_path;
  if (review.kind === WORKSPACE_COMMAND_KIND && review.version === 1
    && typeof review.executable === "string" && Array.isArray(review.argv) && review.argv.every((arg: unknown) => typeof arg === "string")
    && typeof review.cwd === "string" && Number.isFinite(review.timeoutMs) && review.timeoutMs > 0
    && Array.isArray(review.envAllowlist) && review.envAllowlist.every((name: unknown) => typeof name === "string") && typeof review.escalate === "boolean") {
    // Extra access the command names (paths, network) is shown exactly as asked; one the card cannot read is not approvable.
    const grants = review.grants === undefined ? undefined : commandGrants(review.grants);
    if (grants === null) throw new Error("命令点名要的额外访问不可读，不能批准");
    // The person's after-write check (§6.0p.3): which checker, from which list version, as its executor noted under this key.
    const check = isAfterWriteCheckOperationKey(review.operationKey) ? attempt?.write_checks?.[review.operationKey] ?? null : undefined;
    if (check === null) throw new Error("这条写后检查找不到当时用的检查器，不能批准");
    const run = pending.origin?.run ? deps.state.activeRuns.get(pending.origin.run) : undefined;
    const work = run?.work, directories = attempt?.frozen.directories, directory = attempt?.frozen.directory?.canonical_path;
    const ordinary = typeof review.operationKey === "string" && /^(?:run|start)-command:[1-9][0-9]*$/.test(review.operationKey);
    if (hold && index && !index.parent_run && work && run?.useExact && directories && directory && !grants && review.escalate === false
      && !check && ordinary) {
      const input = reusableInput({ command: review.executable, args: review.argv, cwd: review.cwd, timeout_ms: review.timeoutMs,
        env_allowlist: review.envAllowlist, background: review.background === true, outlives_run: review.outlivesRun === true });
      if (input) {
        const tree = directories.execution.kind === "worktree" ? directories.execution.worktree_id : undefined;
        // A missing directory proof limits reuse. The original SDK review can still describe a one-time decision.
        const control = await deps.options.checks?.holdCommandWorkspace?.(index.owner.project_id, directories.output, directory, tree).catch(() => undefined);
        if (control) hold({ title: index.title, scope: { kind: "command-exact", workspace_id: control.identity ?? tree ?? directories.output, workspace_path: directory, input_json: input }, control, work });
      }
    }
    return { kind: "command", ...(childDirectory ? { workspace_path: childDirectory } : {}), command: review.executable, args: review.argv, cwd: review.cwd,
      timeout_ms: review.timeoutMs, env_allowlist: review.envAllowlist, escalate: review.escalate, ...(grants ? { grants } : {}),
      ...(review.background === true ? { background: true, outlives_run: review.outlivesRun === true } : {}),
      ...(check ? { after_write_check: { checker_id: check.checker_id, display_name: check.display_name, version: check.version } } : {}) };
  }
  if (review.kind !== "workspace-patch" || review.version !== 1 || typeof review.path !== "string"
    || typeof review.baseExists !== "boolean" || typeof review.baseText !== "string" || typeof review.nextText !== "string") throw new Error("这类操作的完整审查尚未接通，不能批准");
  // A file this round writes joins its work's scope; other work under way that covers it is named on the card.
  const work = pending.origin?.run && deps.state.activeRuns.get(pending.origin.run)?.live() ? deps.state.runWork.get(pending.origin.run) : undefined;
  let concurrent: string[] = [];
  const concurrencyWords: ReviewWord[] = [];
  if (work) {
    void deps.projectWork.touch(work.project, work.id, review.path).catch(() => undefined);
    try {
      const seen = await deps.projectWork.read(work.project, { session_id: work.session.id, directory: work.directory, paths: [review.path] });
      concurrent = seen.overlaps.map(({ work }) => {
        const title = work.title.slice(0, 40), running = work.state === "running";
        if (concurrencyWords.length) concurrencyWords.push({ owner: "workbench", key: "common.list.separator" });
        concurrencyWords.push(reviewText(running ? "overlap-running" : "overlap-waiting", { title }));
        return `会话「${title}」（${running ? "进行中" : "等待开始"}）`;
      });
    } catch { /* the card still shows the change itself */ }
  }
  // The check before review of exactly this text, when the round's hook made one (prologue-write-checks.ts).
  const checks = pending.origin?.session ? deps.state.writeChecks.get(writeCheckKey(pending.origin.session, review.path, review.nextText)) : undefined;
  return presentReview({ kind: "text-edit", ...(childDirectory ? { workspace_path: childDirectory } : {}), target_path: review.path, exists: review.baseExists,
    before_text: review.baseExists ? review.baseText : null, after_text: review.nextText, ...(concurrent.length ? { concurrent } : {}), ...(checks ? { checks: structuredClone(checks) } : {}) },
  { concurrent: concurrencyWords });
}

/** The pending port the approval bridge uses: read, whether it can be answered now, answer, and the card to show. */
export function createPendingPort(deps: ReviewDeps): ProloguePendingPort {
  const { runtime, host, state, options } = deps;
  const surfaceReviews = new WeakMap<Pending, SurfaceReview>();
  const exactPermissions = new WeakMap<Pending, ExactPermission>();
  return {
    async read(ref) {
      const pending = await runtime.effects.pendings.read(ref);
      if (!pending) return undefined;
      const clock = await host.readClock();
      let expiresAtWallMs = state.deadlines.get(ref.id);
      if (expiresAtWallMs === undefined) {
        expiresAtWallMs = clock.wallTimeMs + Math.max(0, pending.expiresAtMs - clock.monotonicMs);
        state.deadlines.set(ref.id, expiresAtWallMs);
      }
      return { ...pending, expiresAtWallMs };
    },
    canAnswer(ref) {
      // EffectChain.whenSettled and ordinary Pending waits have different
      // wait registries in this SDK. hasLiveWaiter only covers the latter.
      // Require the actual live SDK Run plus its exact still-waiting effect;
      // restored references never enter activeRuns and cannot be approved.
      const pending = runtime.effects.pendings.get(ref);
      const effect = pending?.effectRef && runtime.effects.get(pending.effectRef);
      const run = pending?.origin?.run ? state.activeRuns.get(pending.origin.run) : undefined;
      return pending?.state === "open" && effect?.state === "awaiting-approval"
        && effect.pending?.ref.id === ref.id && effect.pending.ref.revision === ref.revision
        && effect.proposal.origin?.run === pending.origin?.run && effect.proposal.origin?.session === pending.origin?.session
        && Boolean(run?.live());
    },
    finalPresentation(pending, document) {
      const presented = surfaceReviews.get(pending)?.present() ?? document;
      const runId = pending.origin?.run;
      const run = runId ? state.activeRuns.get(runId) : undefined;
      if (run?.stop && run.usePolicy && !run.workSelection) return presented;
      if (presented.kind === "command") return { ...presented, session_rule_blocked: true };
      if (presented.kind !== "tool-operation" || !presented.round_allow) return presented;
      const { round_allow: _roundAllow, ...once } = presented;
      return once;
    },
    async answer(ref, answer, assertBeforeAnswer) { return runtime.effects.pendings.answer(ref, answer, await host.readClock(), { assertBeforeAnswer }); },
    async approvalAuthority(pending) {
      const run = pending.origin?.run && state.activeRuns.get(pending.origin.run);
      if (!run) throw new Error("原执行的持续授权不可读取");
      const effect = pending.effectRef && runtime.effects.get(pending.effectRef), subject = effect?.proposal.subject;
      const surfaceReview = surfaceReviews.get(pending);
      if (subject?.what === "surface" && !surfaceReview) throw new Error("原界面审查内容未核对");
      const changesAction = subject?.what === "tool" && (isGatewayChange(subject.name) || subject.name.startsWith("molis-action-"));
      const action = effect && changesAction
        ? state.actionReviews.get(pending.origin!.session!)?.forEffect(effect) : undefined;
      const nativeMcp = subject?.what === "tool" && subject.name.startsWith("mcp:");
      const mcp = nativeMcp && effect && typeof subject.input === "string"
        ? run.mcp?.approval(effect.ref, effect.proposal.origin, subject.name, jsonObject(subject.input, "原 MCP 参数不可读")) : undefined;
      if (nativeMcp && !mcp) throw new Error("原 MCP 调用、连接或工具版本已不可用");
      const selected = subject?.what === "surface" ? surfaceReview!.control : action?.control ?? mcp;
      if (changesAction && !selected) throw new Error("原能力审查授权不可读取");
      const app = effect && subject?.what === "surface" && subject.surface === "desktop" && !["app", "upload", "download"].includes(subject.action) && !run.workSelection
        && (effect.proposal.kind === "mutate-local" || effect.proposal.kind === "user-visible") && pending.origin?.session && pending.origin.run
        ? await attemptOf(deps, pending).then(({ index }) => index && options.reviewQueue?.permissions.app(index.owner.project_id,
          { session_id: pending.origin!.session!, run_id: pending.origin!.run! }, subject.scope)) : undefined;
      const mcpInput = mcp && reusableInput(mcp.args), mcpIdentity = mcp?.transport.identity;
      const mcpExact: ExactPermission | undefined = mcpInput && mcpIdentity && run.work
        ? { title: mcp.tool, scope: { kind: "mcp-exact", source_id: mcp.transport.source, connection_identity: mcpIdentity,
          tool: mcp.tool, tool_digest: mcp.digest, input_json: mcpInput }, control: mcp, work: run.work } : undefined;
      const exact = mcpExact ?? exactPermissions.get(pending);
      const automatic = action && run.policy && action.automatic(run.policy) || app && { ...app, activate: app.assertCurrent }
        || mcpExact && mcp && matchExactPermission(mcpExact, mcp.activate)
        || exact && run.useExact && matchExactPermission(exact, control => run.useExact!(pending.ref.id, control));
      const assertCurrent = () => {
        if (!run.live()) throw new Error("原执行已结束"); run.assertAuthority(); selected?.assertCurrent();
      };
      assertCurrent();
      return { assertCurrent, ...(run.workSelection ? { workSelection: true } : {}),
        ...(automatic ? { automatic } : {}),
        ...(exact ? { exactPermission: () => this.canAnswer(pending.ref) ? exact : undefined } : {}),
        ...(action?.choice ? { delegationChoice: () => {
          if (!this.canAnswer(pending.ref)) return undefined;
          action.assertChoiceCurrent();
          return action.choice;
        } } : {}),
        ...(surfaceReview?.control.beforeAnswer ? { beforeAnswer: surfaceReview.control.beforeAnswer } : {}), beforeEffect: async () => {
        assertCurrent(); await selected?.beforeEffect();
        assertCurrent();
      } };
    },
    async reference(pending) {
      const { index, attempt } = await attemptOf(deps, pending);
      const effect = pending.effectRef && runtime.effects.get(pending.effectRef);
      if (!index || !attempt || !effect) throw new Error("原审查的固定归属不可读");
      state.reviewEffects.set(`prologue:${pending.ref.id}`, effect.ref);
      const subject = effect.proposal.subject;
      const action = subject.what === "tool" && attempt.action_tool_scope
        ? attempt.frozen.action_tools?.find(ref => agentActionToolName(ref, attempt.action_tool_scope!) === subject.name) : undefined;
      const mcp = subject.what === "tool" ? attempt.frozen.mcp_tools.find(ref => `mcp:${mcpConnectionId(ref)}/${ref.tool}` === subject.name) : undefined;
      return prologueReviewReference(index.owner, `prologue:${pending.ref.id}`, effect, {
        run: { session_id: pending.origin!.session, run_id: pending.origin!.run },
        directory: attempt.frozen.directory?.canonical_path, action,
        mcp: mcp && { server: mcp.server, tool: mcp.tool, version: mcp.version, configuration_version: mcp.configuration_version },
      }, pending.ref.id);
    },
    async document(pending) {
      const effect = pending.effectRef && runtime.effects.get(pending.effectRef);
      const ref = effect?.proposal.reviewRef;
      if (!effect || effect.proposal.origin?.session !== pending.origin?.session
        || effect.proposal.origin?.run !== pending.origin?.run) throw new Error("原始审查或执行归属不可用，不能批准");
      const subject = effect.proposal.subject;
      if (subject.what === "tool" && ["dispatch-subagent", "steer-subagent"].includes(subject.name)) return subagentCard(deps, pending, subject);
      if (subject.what === "surface") {
        const review = await createSurfaceReview(runtime, state, deps.surfaces(), pending, effect, subject);
        surfaceReviews.set(pending, review); return review.document;
      }
      if (subject.what === "tool" && subject.name === "command-stop") return commandStopCard(deps, subject);
      const action = subject.what === "tool" ? await actionCard(deps, pending, effect, subject) : undefined;
      if (action) return action;
      if (!ref) throw new Error("原始审查资源不可用，不能批准");
      return workspaceCard(deps, pending, ref, held => exactPermissions.set(pending, held));
    },
  };
}

/** The decision the person made on a review, kept in the session's index so it reads back after a restart. */
export function createReviewMemory(deps: Pick<ReviewDeps, "index" | "options">) {
  return async (sessionId: string, pendingId: string, receipt: AgentReviewReceipt, assertPending?: () => void): Promise<void> => {
    const request = deps.options.reviewQueue!.get(receipt.review_id);
    if (!request) throw new Error("原审查请求不可读取，不能保存决定");
    const saved = { status: receipt.status, decided_by: receipt.decided_by, decided_at: receipt.decided_at, note: receipt.note,
      requested_at: request.requested_at, expires_at: request.expires_at };
    if (isDeepStrictEqual((await deps.index.read(sessionId))?.review_decisions?.[pendingId], saved)) return;
    await deps.index.update(sessionId, index => {
      if (saved.status === "pending") assertPending?.();
      const previous = index.review_decisions?.[pendingId];
      // The initial mirror may finish after a fast user decision. It must not
      // replace that decision with its earlier pending snapshot.
      if (saved.status === "pending" && previous && previous.status !== "pending") return;
      (index.review_decisions ??= {})[pendingId] = saved;
    });
  };
}

/** The approval bridge: requests mirrored to the Host's review queue; a refusal with a note reaches the round as a steer. */
export function createApprovals(deps: ReviewDeps, pendings: ProloguePendingPort, remember: ReturnType<typeof createReviewMemory>) {
  const queue = deps.options.reviewQueue;
  if (!queue) return undefined;
  return new PrologueApprovalBridge({
    queue, pendings,
    async recordRequest(pending, request) {
      await remember(pending.origin!.session!, pending.ref.id, queue.receipt(request.review_id)!, () => {
        if (!pendings.canAnswer(pending.ref) || queue.receipt(request.review_id)?.status !== "pending") throw new Error("原等待已结束，不能新增待批投影");
      });
    },
    allowAppForRound(pending, request, receipt) {
      const runId = pending.origin?.run, run = runId && deps.state.activeRuns.get(runId);
      const effect = pending.effectRef && deps.runtime.effects.get(pending.effectRef), original = effect?.proposal.subject, document = request.document;
      if (!runId || !run || !run.live() || !run.stop || run.workSelection || document.kind !== "tool-operation" || !document.round_allow
        || original?.what !== "surface" || original.surface !== "desktop" || ["app", "upload", "download"].includes(original.action) || original.scope !== document.round_allow.app
        || effect?.proposal.kind !== "mutate-local" && effect?.proposal.kind !== "user-visible" || receipt.source?.kind !== "person" || !receipt.decided_at) {
        throw new Error("原轮次或桌面应用许可不再有效");
      }
      queue.permissions.rememberApp(request, { id: original.scope, label: document.round_allow.label }, receipt.source.actor_id, receipt.decided_at,
        () => { if (!run.live()) throw new Error("原轮次已结束"); run.assertAuthority(); });
    },
    useRule(request, source) {
      const run = request.run && deps.state.activeRuns.get(request.run.run_id);
      if (!run?.live() || !run.stop || !run.usePolicy || run.workSelection) throw new Error("原轮次不能继续使用这份许可");
      run.assertAuthority();
      const held = queue.permissions.holdForRun(source, request, run.stop);
      return { assertCurrent: () => { run.assertAuthority(); held.assertCurrent(); },
        activate: () => run.usePolicy!(source.id, held.assertCurrent), release: held.release };
    },
    async recordDecision(pending, receipt) {
      if (!pending.origin?.session) throw new Error("审查缺少会话归属，不能保存决定");
      await remember(pending.origin.session, pending.ref.id, receipt);
      if (receipt.status === "rejected") deps.state.actionReviews.get(pending.origin.session)?.releaseEffect(pending.effectRef ? deps.runtime.effects.get(pending.effectRef) : undefined);
      // Save the existing Host decision and durable steer before denying the
      // pending: the next model boundary must not race ahead of the feedback.
      // Failure keeps the original delivery_error path; never claim receipt.
      if (receipt.status === "rejected" && receipt.note?.trim()) {
        const active = pending.origin.run && deps.state.activeRuns.get(pending.origin.run);
        if (!active || !active.live()) throw new Error("原执行已结束，修改意见尚未交给 Agent");
        const request = queue.get(receipt.review_id)!;
        const document = request.document;
        const target = document.kind === "text-edit" ? document.target_path
          : document.kind === "command" ? [document.command, ...document.args].join(" ")
          : document.kind === "tool-operation" ? `${document.tool}：${document.summary}`
          : document.kind === "mcp" ? `${document.server} / ${document.tool}` : request.kind;
        await active.steer(`用户拒绝了这一次待审操作，并给出修改意见。原审查：${JSON.stringify(receipt.review_id)}；对象：${JSON.stringify(target)}。\n用户意见：\n${receipt.note}\n\n这条意见不批准任何写入，也不撤销已发生的其他操作。请结合当前任务核对并修改提案；新的操作仍须经过原宿主审查。`);
      }
    },
  });
}

/** A project's review history read back once after a restart, then kept in step with the runtime's effects on each refresh. */
export function restoreReviewHistory(deps: ReviewDeps, pendings: ProloguePendingPort, remember: ReturnType<typeof createReviewMemory>) {
  const queue = deps.options.reviewQueue;
  if (!queue) return undefined;
  const restoredBoards = new Set<string>();
  const refreshing = new Map<string, Promise<void>>();
  let closed = false;
  const restore = async (projectId: string) => {
    const report = await deps.runtime.effects.readRecovery();
    if (report.unavailable.length) throw new Error("部分执行审查历史不可读，请保留当前内容后重试");
    for (const effect of report.effects) {
      const pending = effect.pending;
      if (!pending?.origin?.session || !pending.origin.run) continue;
      const index = await deps.index.read(pending.origin.session);
      if (!index || index.owner.project_id !== projectId) continue;
      const attempt = index.attempts.find(item => item.run_id === pending.origin!.run);
      if (!attempt || deps.state.activeRuns.has(pending.origin.run) || deps.state.sessionRuns.has(pending.origin.run)) continue;
      const restored = await pendings.read(pending.ref);
      if (!restored) throw new Error("审查历史的待批引用不可读");
      const reference = await pendings.reference(restored);
      const readPrevious = async () => {
        const current = await deps.index.read(pending.origin!.session!);
        if (!current || current.owner.project_id !== projectId) throw new Error("原审查的会话归属不可读");
        const original = current.attempts.find(item => item.run_id === pending.origin!.run);
        if (!original) throw new Error("原审查轮次不可读");
        const document = await pendings.document(restored), previous = current.review_decisions?.[pending.ref.id];
        const request = { review_id: reference.id, reference, run: { session_id: pending.origin!.session!, run_id: pending.origin!.run! },
          project_id: projectId, plugin_id: current.owner.plugin_id, kind: document.kind, document,
          requested_at: previous?.requested_at ?? new Date(effect.preparedAtMs).toISOString(), expires_at: previous?.expires_at ?? null };
        const decision = previous && previous.status !== "pending" ? previous : { status: "cancelled" as const, decided_by: null, decided_at: null,
          note: "历史操作没有可恢复的批准；保留原提案供核对，不会重新执行" };
        return { request, decision };
      };
      let recorded;
      try { recorded = await deps.decisions.read(reference); }
      catch {
        const subject = effect.proposal.subject;
        const document = presentToolReview({ kind: "tool-operation", tool: subject.what === "tool" ? subject.name : effect.proposal.kind, summary: effect.proposal.summary }, []);
        queue.restoreUnreadableDecision({ review_id: reference.id, reference, run: { session_id: pending.origin.session, run_id: pending.origin.run },
          project_id: projectId, plugin_id: index.owner.plugin_id, kind: document.kind, document, requested_at: new Date(effect.preparedAtMs).toISOString(), expires_at: null }, readPrevious);
        deps.state.reviewEffects.set(reference.id, effect.ref);
        continue;
      }
      if (recorded) { queue.restoreRecordedDecision(recorded); deps.state.reviewEffects.set(recorded.request.review_id, effect.ref); continue; }
      const historical = await readPrevious();
      queue.restoreDecision(historical.request, historical.decision);
      deps.state.reviewEffects.set(reference.id, effect.ref);
    }
    restoredBoards.add(projectId);
  };
  const refresh = async (projectId: string) => {
    if (!restoredBoards.has(projectId)) await restore(projectId);
    for (const request of queue.list(projectId)) {
      const ref = deps.state.reviewEffects.get(request.review_id);
      if (!ref) continue;
      let effect = deps.runtime.effects.get(ref);
      const receipt = queue.receipt(request.review_id);
      if (!effect || queue.isDeciding(request.review_id) || receipt?.decision_save_error || receipt?.effect_settled || receipt?.effect_error) continue;
      const inspected = await inspectReviewEffect(deps.runtime, ref);
      effect = inspected.effect; if (!effect) continue;
      const dispatched = inspected.dispatch;
      if (receipt?.source && receipt.delivery_error && ["prepared", "awaiting-approval", "authorized"].includes(effect.state)) {
        if (dispatched.state === "not-dispatched") { await deps.runtime.effects.cancel(ref); effect = deps.runtime.effects.get(ref)!; }
      }
      if (receipt?.status === "pending" && ["cancelled", "denied"].includes(effect.state)) {
        queue.cancel(request.review_id, "执行方已结束这笔操作");
      } else if (receipt?.status === "approved") {
        if (effect.state === "reconcile-required" || dispatched.state === "unknown") {
          if (["reconcile-required", "completed", "failed"].includes(effect.state)) queue.confirmDecisionClosed(request.review_id);
          queue.uncertain(request.review_id, "原操作结果尚未确定，请核对；不会自动重试");
        } else if (effect.state === "completed" && dispatched.state === "dispatched" && dispatched.ok === true) {
          queue.settle(request.review_id, { ok: true });
        } else if (["failed", "denied", "cancelled"].includes(effect.state)) {
          if (dispatched.state === "not-dispatched") queue.settleNotDispatched(request.review_id, "原操作未派出，不会自动重试");
          else queue.settle(request.review_id, { ok: false, error: "执行未完成，请查看本轮工具结果；不会自动重试" });
        }
      }
      if (receipt?.status === "rejected" && ["denied", "cancelled", "failed"].includes(effect.state)) queue.confirmDecisionClosed(request.review_id);
      if (["denied", "cancelled", "failed", "completed"].includes(effect.state)) deps.state.actionReviews.get(effect.proposal.origin?.session ?? "")?.releaseEffect(effect);
      const latest = queue.receipt(request.review_id);
      if (latest && ["cancelled", "expired"].includes(latest.status) && effect.pending?.origin?.session) {
        await remember(effect.pending.origin.session, effect.pending.ref.id, latest);
      }
    }
  };
  const detach = queue.registerRefresh(projectId => {
    if (closed) return Promise.resolve();
    const previous = refreshing.get(projectId); if (previous) return previous;
    const pending = refresh(projectId).finally(() => refreshing.delete(projectId));
    refreshing.set(projectId, pending); return pending;
  });
  return async () => { closed = true; detach(); await Promise.allSettled(refreshing.values()); };
}

/** A command's named extra access, as the runtime recorded it for review; null when it is not that shape. */
function commandGrants(value: unknown): import("@molis-ai/molis-work-contracts/services/agent-host").AgentCommandGrants | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { paths = [], network = false } = value as { paths?: unknown; network?: unknown };
  if (!Array.isArray(paths) || typeof network !== "boolean") return null;
  const named = paths.map(item => item && typeof item === "object" && typeof (item as { path?: unknown }).path === "string" && ["read", "write"].includes((item as { access?: unknown }).access as string)
    ? { path: (item as { path: string }).path, access: (item as { access: "read" | "write" }).access } : null);
  if (named.some(item => item === null) || !named.length && !network) return null;
  return { paths: named as Array<{ path: string; access: "read" | "write" }>, network };
}
