import { isDeepStrictEqual } from "node:util";
import { WORKSPACE_COMMAND_KIND, isAfterWriteCheckOperationKey, type ExactRef, type Runtime } from "@prologue/sdk";
import type { AgentReviewReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";
import { GATEWAY_TOOLS, gatewayReview } from "./prologue-action-gateway.js";
import { agentActionToolName } from "./prologue-action-tools.js";
import { PrologueApprovalBridge, type ProloguePendingPort } from "./prologue-approvals.js";
import { mcpConnectionId } from "./prologue-mcp.js";
import { allowDesktopAppForRound, desktopActionCard, type PrologueSurfaces } from "./prologue-surfaces.js";
import type { createProjectWork } from "./prologue-project-work.js";
import { readResource, readResourceText, type NodeHost, type PrologueNodeAdapterOptions, type RoundState } from "./prologue-node-kit.js";
import type { SessionIndexStore } from "./prologue-session-index.js";

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
  const readable = [
    ...(role ? [{ label: "子任务角色", value: role.name }] : []),
    ...(typeof args.instruction === "string" ? [{ label: subject.name === "dispatch-subagent" ? "分工" : "补充要求", value: args.instruction }] : typeof args.text === "string" ? [{ label: "补充要求", value: args.text }] : []),
    ...(Array.isArray(args.tools) ? [{ label: "可用工具", value: args.tools.join("、") }] : []),
    ...(root ? [{ label: "工作目录", value: root.path }] : []),
  ];
  return { kind: "tool-operation", tool: subject.name, summary: subject.name === "dispatch-subagent" ? (attempt.subagent_roots?.length ? "分派独立目录子任务；修改仍需审查，结果仍需核对" : "分派只读子任务；结果仍需核对") : "向原子任务补充要求",
    fields: [...readable, { label: "本次完整参数", value: JSON.stringify(args, null, 2) }] };
}

/** An action on the side panel's browser or the desktop: on which site or app, what, and which file. */
async function surfaceCard(deps: ReviewDeps, pending: Pending, effect: Effect, subject: { surface: string; action: string; scope: string }): Promise<Card> {
  const surfaceHost = deps.surfaces();
  const label = effect.proposal.summary.replace(/^On this \w+: /u, "").replace(/\.$/u, "");
  const typed = subject.action === "text" && effect.proposal.reviewRef ? await readResourceText(deps.runtime, effect.proposal.reviewRef).catch(() => undefined) : undefined;
  if (subject.surface === "desktop") return desktopActionCard(surfaceHost, pending.origin?.session ?? "", subject.action, subject.scope, label, typed, effect.proposal.kind);
  const detail = surfaceHost ? await surfaceHost.describe(pending.origin?.session ?? "", subject.action, label, typed) : label;
  const verbs: Record<string, string> = { pointer: "点击页面", key: "按键", text: "输入文字", navigate: "打开网址", wait: "等待页面", upload: "向网站上传本机文件", download: "把文件存到本机" };
  const where = subject.scope === "about:blank" ? "空白页" : subject.scope;
  return { kind: "tool-operation", tool: "surface-act", summary: `在 ${where} ${verbs[subject.action] ?? subject.action}`,
    fields: [{ label: "网站", value: where }, { label: "动作", value: verbs[subject.action] ?? subject.action }, { label: "详情", value: detail },
      ...(subject.action === "upload" ? [{ label: "注意", value: "上传会把这个文件发送给该网站，确认前请核对文件" }] : [])] };
}

/** Stopping a background command has no review resource of its own: the card names the command it stops. */
function commandStopCard(deps: ReviewDeps, subject: { name: string; input?: unknown }): Card {
  if (typeof subject.input !== "string") throw new Error("停止命令的参数不可读，不能批准");
  const args = JSON.parse(subject.input);
  const handle = args && typeof args === "object" && typeof args.handle === "string" ? args.handle : "";
  const task = handle ? deps.runtime.background.get(handle) : undefined;
  return { kind: "tool-operation", tool: subject.name, summary: task ? "停止一条后台命令" : "停止一条命令",
    fields: [{ label: "命令", value: task?.summary ?? handle }, ...(task ? [{ label: "现在", value: task.state === "running" ? "还在运行" : task.state }] : []),
      { label: "本次完整参数", value: JSON.stringify(args, null, 2) }] };
}

/** A change through the business gateway, a catalog action, or an MCP call: the card from the round's frozen tools. */
async function actionCard(deps: ReviewDeps, pending: Pending, subject: { name: string; input?: unknown }): Promise<Card | undefined> {
  if (subject.name === GATEWAY_TOOLS.change) {
    if (typeof subject.input !== "string") throw new Error("所请求修改的参数不可读，不能批准");
    const { attempt } = await attemptOf(deps, pending);
    const gateway = deps.state.gatewayRuns.get(pending.origin!.session!);
    if (!attempt?.frozen.action_gateway || !gateway) throw new Error("这项修改不属于本轮的能力网关，不能批准");
    const readable = await gatewayReview(gateway, subject.input);
    return { kind: "tool-operation", tool: subject.name, summary: readable.summary, fields: readable.fields };
  }
  if (subject.name.startsWith("molis-action-")) {
    if (typeof subject.input !== "string") throw new Error("Action arguments are unavailable");
    const { attempt } = await attemptOf(deps, pending);
    const selected = attempt?.action_tool_scope && attempt.frozen.action_tools?.find(ref => agentActionToolName(ref, attempt.action_tool_scope!) === subject.name);
    if (!selected) throw new Error("Action is outside this run's frozen tools");
    const args = jsonObject(subject.input, "Invalid action arguments");
    return { kind: "tool-operation", tool: subject.name, summary: deps.runtime.tools.get(subject.name)?.description ?? selected.capability_id,
      fields: [{ label: "Capability", value: selected.capability_id }, { label: "Version", value: String(selected.version) },
        { label: "Provider", value: selected.provider_id }, { label: "Arguments", value: JSON.stringify(args, null, 2) }] };
  }
  if (subject.name.startsWith("mcp:")) {
    if (typeof subject.input !== "string") throw new Error("MCP 原始参数不可读，不能批准");
    const { attempt } = await attemptOf(deps, pending);
    const selected = attempt?.frozen.mcp_tools.find(item => `mcp:${mcpConnectionId(item)}/${item.tool}` === subject.name);
    if (!selected?.version) throw new Error("MCP 操作不属于本轮固定工具，不能批准");
    jsonObject(subject.input, "MCP 原始参数格式无效");
    return { kind: "mcp", server: selected.server_label ?? selected.server, tool: selected.tool, arguments_json: subject.input };
  }
  return undefined;
}

/** A command or a file change in the round's own workspace: read from the exact review resource the runtime published. */
async function workspaceCard(deps: ReviewDeps, pending: Pending, ref: ExactRef<"resource">): Promise<Card> {
  const review = await readResource(deps.runtime, ref);
  const index = pending.origin?.session ? await deps.index.read(pending.origin.session) : undefined;
  const attempt = index?.attempts.find(each => each.run_id === pending.origin?.run);
  const root = attempt?.root_ref;
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
    return { kind: "command", ...(childDirectory ? { workspace_path: childDirectory } : {}), command: review.executable, args: review.argv, cwd: review.cwd,
      timeout_ms: review.timeoutMs, env_allowlist: review.envAllowlist, escalate: review.escalate, ...(grants ? { grants } : {}),
      ...(review.background === true ? { background: true, outlives_run: review.outlivesRun === true } : {}),
      ...(check ? { after_write_check: { checker_id: check.checker_id, display_name: check.display_name, version: check.version } } : {}) };
  }
  if (review.kind !== "workspace-patch" || review.version !== 1 || typeof review.path !== "string"
    || typeof review.baseExists !== "boolean" || typeof review.baseText !== "string" || typeof review.nextText !== "string") throw new Error("这类操作的完整审查尚未接通，不能批准");
  // A file this round writes joins its work's scope; other work under way that covers it is named on the card.
  const work = pending.origin?.run ? deps.state.runWork.get(pending.origin.run) : undefined;
  let concurrent: string[] = [];
  if (work) {
    void deps.projectWork.touch(work.project, work.id, review.path).catch(() => undefined);
    try {
      const seen = await deps.projectWork.read(work.project, { session_id: work.session.id, directory: work.directory, paths: [review.path] });
      concurrent = seen.overlaps.map(overlap => `会话「${overlap.work.title.slice(0, 40)}」（${overlap.work.state === "running" ? "进行中" : "等待开始"}）`);
    } catch { /* the card still shows the change itself */ }
  }
  return { kind: "text-edit", ...(childDirectory ? { workspace_path: childDirectory } : {}), target_path: review.path, exists: review.baseExists,
    before_text: review.baseExists ? review.baseText : null, after_text: review.nextText, ...(concurrent.length ? { concurrent } : {}) };
}

/** The pending port the approval bridge uses: read, whether it can be answered now, answer, and the card to show. */
export function createPendingPort(deps: ReviewDeps): ProloguePendingPort {
  const { runtime, host, state } = deps;
  return {
    async read(ref) {
      const pending = await runtime.effects.pendings.read(ref);
      if (!pending) return undefined;
      const current = pending.origin?.session ? deps.index.capture(pending.origin.session) : undefined;
      const clock = await host.readClock();
      current?.();
      let expiresAtWallMs = state.deadlines.get(ref.id);
      if (expiresAtWallMs === undefined) {
        expiresAtWallMs = clock.wallTimeMs + Math.max(0, pending.expiresAtMs - clock.monotonicMs);
        state.deadlines.set(ref.id, expiresAtWallMs);
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
        && Boolean(pending.origin?.run && state.activeRuns.get(pending.origin.run)?.live());
    },
    async answer(ref, answer) { return runtime.effects.pendings.answer(ref, answer, await host.readClock()); },
    async document(pending) {
      if (!pending.origin?.session) throw new Error("审查缺少会话归属");
      const current = deps.index.capture(pending.origin.session);
      const effect = pending.effectRef && runtime.effects.get(pending.effectRef);
      const ref = effect?.proposal.reviewRef;
      if (!effect || effect.proposal.origin?.session !== pending.origin?.session
        || effect.proposal.origin?.run !== pending.origin?.run) throw new Error("原始审查或执行归属不可用，不能批准");
      const subject = effect.proposal.subject;
      const card = subject.what === "tool" && ["dispatch-subagent", "steer-subagent"].includes(subject.name) ? await subagentCard(deps, pending, subject)
        : subject.what === "surface" ? await surfaceCard(deps, pending, effect, subject)
          : subject.what === "tool" && subject.name === "command-stop" ? commandStopCard(deps, subject)
            : subject.what === "tool" ? await actionCard(deps, pending, subject) : undefined;
      if (!card && !ref) throw new Error("原始审查资源不可用，不能批准");
      const result = card ?? await workspaceCard(deps, pending, ref!);
      current(); state.reviewEffects.set(`prologue:${pending.ref.id}`, effect.ref);
      return result;
    },
  };
}

/** The decision the person made on a review, kept in the session's index so it reads back after a restart. */
export function createReviewMemory(deps: Pick<ReviewDeps, "index" | "options">) {
  return async (sessionId: string, pendingId: string, receipt: AgentReviewReceipt): Promise<void> => {
    const request = deps.options.reviewQueue!.get(receipt.review_id);
    if (!request) throw new Error("原审查请求不可读取，不能保存决定");
    const saved = { status: receipt.status, decided_by: receipt.decided_by, decided_at: receipt.decided_at, note: receipt.note,
      requested_at: request.requested_at, expires_at: request.expires_at };
    if (isDeepStrictEqual((await deps.index.read(sessionId))?.review_decisions?.[pendingId], saved)) return;
    await deps.index.update(sessionId, index => {
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
    queue, pendings, capture: deps.index.capture,
    async recordRequest(pending, request) { await remember(pending.origin!.session!, pending.ref.id, queue.receipt(request.review_id)!); },
    async allowAppForRound(pending) { allowDesktopAppForRound(deps.surfaces(), pending.effectRef && deps.runtime.effects.get(pending.effectRef), pending.origin?.run ? deps.state.runRefs.get(pending.origin.run) : undefined); },
    async recordDecision(pending, receipt) {
      if (!pending.origin?.session) throw new Error("审查缺少会话归属，不能保存决定");
      await remember(pending.origin.session, pending.ref.id, receipt);
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
  const restore = async (projectId: string) => {
    const report = await deps.runtime.effects.readRecovery();
    if (report.unavailable.length) throw new Error("部分执行审查历史不可读，请保留当前内容后重试");
    for (const effect of report.effects) {
      const pending = effect.pending;
      if (!pending?.origin?.session || !pending.origin.run) continue;
      const index = await deps.index.read(pending.origin.session).catch(error => { if (error?.code === "agent.session_busy") return undefined; throw error; });
      if (!index || index.owner.project_id !== projectId) continue;
      const current = deps.index.capture(pending.origin.session);
      const attempt = index.attempts.find(item => item.run_id === pending.origin!.run);
      if (!attempt?.root_ref || deps.state.activeRuns.has(pending.origin.run)) continue;
      const restored = await pendings.read(pending.ref);
      if (!restored) throw new Error("审查历史的待批引用不可读");
      const document = await pendings.document(restored);
      current(); deps.state.runRoots.set(pending.origin.run, attempt.root_ref);
      const decision = index.review_decisions?.[pending.ref.id];
      const request = { review_id: `prologue:${pending.ref.id}`, run: { session_id: pending.origin.session, run_id: pending.origin.run },
        project_id: projectId, plugin_id: index.owner.plugin_id, kind: document.kind, document,
        requested_at: decision?.requested_at ?? new Date(effect.preparedAtMs).toISOString(), expires_at: decision?.expires_at ?? null };
      if (decision && decision.status !== "pending") {
        const { status, decided_by, decided_at, note } = decision;
        queue.restoreDecision(request, { status, decided_by, decided_at, note });
      } else {
        // No durable cancellation time exists in older records. Never turn
        // the time of opening history into a fictional execution event.
        queue.restoreDecision(request, { status: "cancelled", decided_by: null, decided_at: null,
          note: "历史操作没有可恢复的批准；保留原提案供核对，不会重新执行" });
        await remember(pending.origin.session, pending.ref.id, queue.receipt(request.review_id)!);
      }
    }
    restoredBoards.add(projectId);
  };
  return queue.registerRefresh(async projectId => {
    if (!restoredBoards.has(projectId)) await restore(projectId);
    for (const request of queue.list(projectId)) {
      const ref = deps.state.reviewEffects.get(request.review_id);
      if (!ref) continue;
      const effect = deps.runtime.effects.get(ref);
      const receipt = queue.receipt(request.review_id);
      if (!effect || receipt?.effect_settled || receipt?.effect_error) continue;
      if (receipt?.status === "pending" && ["cancelled", "denied"].includes(effect.state)) {
        queue.cancel(request.review_id, "执行方已结束这笔操作");
      } else if (receipt?.status === "approved") {
        const current = effect.proposal.origin?.session ? deps.index.capture(effect.proposal.origin.session) : undefined;
        const dispatched = await deps.runtime.effects.inspectDispatch(ref);
        current?.();
        if (effect.state === "completed" && dispatched.state === "dispatched" && dispatched.ok === true) {
          queue.settle(request.review_id, { ok: true });
        } else if (["failed", "denied", "cancelled"].includes(effect.state) && dispatched.state !== "unknown") {
          queue.settle(request.review_id, { ok: false, error: "执行未完成，请查看本轮工具结果；不会自动重试" });
        }
      }
      const latest = queue.receipt(request.review_id);
      if (latest && ["cancelled", "expired"].includes(latest.status) && effect.pending?.origin?.session) {
        await remember(effect.pending.origin.session, effect.pending.ref.id, latest);
      }
    }
  });
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
