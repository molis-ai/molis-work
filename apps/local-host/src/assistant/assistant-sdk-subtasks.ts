import { assistantWorkPermission, holdAssistantWorkLifetime } from "./assistant-work-permissions.js";
import { requireSynchronous, type HostOfferedOriginalInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRunRef, AgentSubagentCommand, AgentSubagentView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID, type AssistantSdkSubtaskReview } from "@molis-ai/molis-work-contracts/services/assistant";
import { subagentExecution, waitForSubagentChange } from "@molis-ai/molis-work-service-agent-host";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import { sessionRef, type AssistantServicePorts } from "./assistant-service-shared.js";
import { ownerOf } from "./assistant-round-start.js";
import { assistantErrors } from "./assistant-errors.js";
import { hostLog } from "../host-log.js";

const resultNoticeKey = (parent: AgentRunRef, childId: string, attemptId: string) =>
  `sdk-subtask-result:${JSON.stringify([parent.session_id, parent.run_id, childId, attemptId])}`;

/** The Assistant's SDK children use the same Host owner as Coding, addressed through their original Work and parent Run. */
export class AssistantSdkSubtasks {
  private noticing?: Promise<void>;
  constructor(private readonly store: AssistantStore, private readonly actorId: string, private readonly ports: Pick<AssistantServicePorts, "host" | "authority">,
    private readonly result: (parent: StoredWork, title: string, key: string) => void) {}
  private async original(workId: string, parentRunId?: string) {
    const work = this.store.get(this.actorId, workId), adapter = (await this.ports.host()).adapter("prologue");
    if (!work.session_id) throw assistantErrors.scope("原助理会话不可读取");
    const owner = (await adapter.sessionLifecycle?.read(sessionRef(work)))?.owner;
    if (!owner || owner.actor_id !== this.actorId || owner.project_id !== ownerOf(work) || owner.plugin_id !== ASSISTANT_PLUGIN_ID || owner.install_id !== ASSISTANT_INSTALL_ID)
      throw assistantErrors.scope("子任务不属于这项助理工作");
    const session = await adapter.readSession(sessionRef(work));
    const run = parentRunId === undefined ? undefined : session.runs.find(one => one.run_id === parentRunId);
    if (parentRunId !== undefined && !run) throw assistantErrors.scope("原执行不属于这项助理工作");
    if (!adapter.subagents) throw assistantErrors.unsupported("当前运行时不能读取子任务");
    return { work, adapter, port: adapter.subagents, session, run };
  }
  async list(workId: string): Promise<AgentSubagentView[]> {
    const work = this.store.get(this.actorId, workId);
    if (!work.session_id) return [];
    const { session, port } = await this.original(workId);
    return (await Promise.all(session.runs.map(run => port.list(run)))).flat();
  }
  /** The existing notice sweep reads original results, even while the parent panel is closed. */
  noticeResults(): Promise<void> {
    return this.noticing ??= this.scanResults()
      .catch(error => { hostLog.warn("assistant", "subtask_result_unconfirmed", error); })
      .finally(() => { this.noticing = undefined; });
  }
  private async scanResults(): Promise<void> {
    // Old Work remains eligible. Only result candidates without an original notice require replay.
    const bySession = new Map<string, StoredWork>();
    for (const work of this.store.list(this.actorId, { limit: Number.MAX_SAFE_INTEGER })) {
      if (!work.session_id || work.archived || work.executor.kind !== "assistant" || work.delegated_by?.taken_back_at) continue;
      if (!bySession.has(work.session_id)) bySession.set(work.session_id, work);
    }
    if (!bySession.size) return;
    const { subagents } = (await this.ports.host()).adapter("prologue");
    const candidates = subagents?.resultCandidates?.(new Set(bySession.keys()));
    if (!candidates?.length) return;
    const raised = this.store.noticeReceipts.keysOfKind(this.actorId, "result");
    const pending = new Map<string, { work: StoredWork; run: AgentRunRef; keys: Set<string> }>();
    for (const candidate of candidates) {
      const run = candidate.parent_run, work = bySession.get(run.session_id);
      const key = resultNoticeKey(run, candidate.subagent_id, candidate.attempt_run_id);
      if (!work || raised.has(key)) continue;
      const parent = JSON.stringify([run.session_id, run.run_id]);
      const group = pending.get(parent) ?? { work, run, keys: new Set<string>() };
      group.keys.add(key);
      pending.set(parent, group);
    }
    for (const group of pending.values()) {
      try {
        await this.notifyResults(group.work, group.run, group.keys);
      } catch (error) { hostLog.warn("assistant", "subtask_result_unconfirmed", error); }
    }
  }
  private async notifyResults(work: StoredWork, parent: AgentRunRef, keys: ReadonlySet<string>): Promise<void> {
    const { run, port } = await this.original(work.work_id, parent.run_id);
    const children = await port.list(run!);
    this.current(work);
    for (const child of children) {
      if (child.parent_run.session_id !== parent.session_id || child.parent_run.run_id !== parent.run_id) continue;
      const attempts = [...child.budget?.prior_attempts ?? [], ...(child.child_run ? [{ run_id: child.child_run.run_id, state: child.state }] : [])];
      for (const attempt of attempts) {
        const key = resultNoticeKey(parent, child.subagent_id, attempt.run_id);
        if (keys.has(key) && ["completed", "failed", "cancelled"].includes(attempt.state)) this.result(work, child.role_name ?? child.role_id, key);
      }
    }
  }
  async read(workId: string, parentRunId: string, childId: string) {
    const { work, run, port } = await this.original(workId, parentRunId);
    if (!port.conversation) throw assistantErrors.unsupported("当前运行时不能读取子任务对话");
    const conversation = await port.conversation(run!, childId);
    try { this.current(work); } catch (error) { conversation.input_unavailable = error instanceof Error ? error.message : "原工作不可操作"; }
    const childRun = conversation.child.child_run;
    const has_reviews = Boolean(childRun && (await this.ports.host()).reviews.list(ownerOf(work)).some(review => review.run?.session_id === childRun.session_id && review.run.run_id === childRun.run_id));
    return { work_id: work.work_id, scope: work.scope, parent_title: work.title, conversation, has_reviews };
  }
  async check(workId: string, parentRunId: string, childId: string, requestId: string) {
    const { run, port } = await this.original(workId, parentRunId);
    if (!port.checkRequest) throw assistantErrors.unsupported("当前运行时不能核对原请求");
    return port.checkRequest(run!, childId, requestId, this.actorId);
  }
  async wait(workId: string, parentRunId: string, childId: string, since: string | null, timeout: number, signal: AbortSignal) {
    const { work, run, port } = await this.original(workId, parentRunId);
    const answer = await waitForSubagentChange(port, run!, childId, since, timeout, signal);
    this.current(work);
    return answer;
  }
  private current(work: StoredWork): void {
    const now = this.store.get(this.actorId, work.work_id);
    if (now.archived || now.session_id !== work.session_id || now.executor.kind !== "assistant" || now.delegated_by?.taken_back_at)
      throw assistantErrors.stale("原助理工作已归档、收回或换了执行者，请回到原工作查看");
  }
  async review(workId: string, parentRunId: string, childId: string, input: AssistantSdkSubtaskReview,
    caller: { beforeEffect(): Promise<void>; assertCurrent(request: import("@molis-ai/molis-work-contracts/services/agent-host").AgentReviewRequest): void }) {
    input = structuredClone(input);
    const entry = this.store.permissionTransitions.holdWorkInput(workId);
    try {
    const { work, adapter, run, port } = await this.original(workId, parentRunId);
    const assertLifetime = await holdAssistantWorkLifetime(await this.ports.host(), work);
    const assertInput = () => { entry.assertCurrent(); assertLifetime?.(); this.current(work); };
    assertInput();
    if (!port.assertCurrent) throw assistantErrors.unsupported("当前运行时不能核对审批提交边界");
    const child = (await port.list(run!)).find(one => one.subagent_id === childId);
    if (!child?.child_run || !input.child_run || child.child_run.run_id !== input.child_run.run_id || child.child_run.session_id !== input.child_run.session_id)
      throw assistantErrors.stale("原子任务执行已改变，未批准其他执行");
    const host = await this.ports.host(), review = host.reviews.get(input.review_id);
    if (!review || review.project_id !== ownerOf(work) || review.run?.run_id !== child.child_run.run_id || review.run.session_id !== child.child_run.session_id)
      throw assistantErrors.scope("这项审批不属于指定子任务");
    if (!["approve", "reject"].includes(input.decision)) throw assistantErrors.invalid("请选择允许或拒绝");
    if (input.remember !== undefined && !["session", "app-this-round"].includes(input.remember)) throw assistantErrors.invalid("请选择原审批支持的授权范围");
    const authority = await this.ports.authority(work), parent = await adapter.read(run!);
    if (!child.host_tools) throw assistantErrors.stale("原子角色已不可核对");
    const role = { role_id: child.role_id, version: child.role_version, execution: child.execution, host_tools: child.host_tools };
    const execution = subagentExecution(authority, "prologue", parent.frozen, { actor_id: this.actorId, project_id: ownerOf(work) });
    const current = () => {
      requireSynchronous(caller.assertCurrent(review), "最终授权检查必须同步完成");
      execution.assertBeforeStart?.(); execution.assertSubagent?.(role); assertInput();
      port.assertCurrent!(run!, childId, input.child_run);
    };
    const control = { beforeEffect: async () => { await caller.beforeEffect(); await execution.beforeStart?.(); current(); }, assertCurrent: current };
    return await host.reviews.respond({ review_id: review.review_id, version: input.version, decision: input.decision, actor_id: this.actorId,
      ...(input.note ? { note: String(input.note).slice(0, 2000) } : {}), ...(input.remember ? { remember: input.remember } : {}) }, control);
    } finally { entry.release(); }
  }

  async command(workId: string, parentRunId: string, childId: string, input: AgentSubagentCommand,
    caller: { original?: Omit<HostOfferedOriginalInput, "action">; beforeEffect(): Promise<void>; assertCurrent(): void }) {
    input = structuredClone(input);
    const entry = this.store.permissionTransitions.holdWorkInput(workId);
    try {
    const { work, adapter, run, port } = await this.original(workId, parentRunId);
    const assertLifetime = await holdAssistantWorkLifetime(await this.ports.host(), work);
    const assertInput = () => { entry.assertCurrent(); assertLifetime?.(); this.current(work); };
    assertInput();
    if (!port.command) throw assistantErrors.unsupported("当前运行时不能操作子任务");
    const text = input.kind === "send" || input.kind === "continue" ? input.text : undefined;
    if (text !== undefined && (!caller.original || caller.original.written_by !== "person" || caller.original.install_id !== ASSISTANT_INSTALL_ID
      || caller.original.input_id !== input.request_id || caller.original.text !== text)) throw assistantErrors.scope("缺少这次本人输入的原件证明");
    const authority = await this.ports.authority(work), parent = await adapter.read(run!);
    const execution = subagentExecution(authority, "prologue", parent.frozen, { actor_id: this.actorId, project_id: ownerOf(work) });
    return await port.command(run!, childId, input, { actor_id: this.actorId, original_text: text, execution: { ...execution, delegation: assistantWorkPermission(work),
      beforeStart: async () => { await caller.beforeEffect(); await execution.beforeStart?.(); assertInput(); },
      assertBeforeStart: () => { requireSynchronous(caller.assertCurrent(), "最终授权检查必须同步完成"); execution.assertBeforeStart?.(); assertInput(); },
    } });
    } finally { entry.release(); }
  }
}
