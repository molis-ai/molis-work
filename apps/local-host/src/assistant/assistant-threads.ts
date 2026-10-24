import { assistantErrors } from "./assistant-errors.js";
import { randomUUID } from "node:crypto";
import { ActionError, requireSynchronous, type RetainedActionAuthority, type ActionClient, type ActionCallContext, type ActionExecutionContext, type ActionReference, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AssistantThreadContext } from "@molis-ai/molis-work-contracts/services/assistant";
import { isTerminalAgentPhase, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { AssistantService } from "./assistant-service.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import type { StartThreadReply, ThreadReplyStatus } from "./assistant-thread-types.js";

interface ThreadPorts {
  actorId: string;
  host(): Promise<AgentHost>;
  project(id: string): Promise<LocalHostProjectReference>;
  client(project: LocalHostProjectReference): ActionClient;
  caller(project: LocalHostProjectReference): Promise<ActionCallContext>;
  alive(): boolean;
}
const reference = (view: ActionView): ActionReference => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
const identity = (input: StartThreadReply["target"]): string => JSON.stringify([input.provider_id, input.subject_kind, input.subject_id, input.thread_id]);

/** Fixed destinations, retries and delivery. Runtime execution stays in the existing Assistant service. */
export class AssistantThreads {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly guards = new Map<string, RetainedActionAuthority>();
  private readonly failures = new Map<string, string>();
  private readonly delivering = new Map<string, AbortController>();
  constructor(private readonly store: AssistantStore, private readonly service: AssistantService, private readonly ports: ThreadPorts) {}

  async start(input: StartThreadReply, caller: ActionExecutionContext): Promise<ThreadReplyStatus> {
    this.assertPerson(caller);
    const project = await this.ports.project(caller.project_id!);
    const client = this.ports.client(project);
    const views = await client.discover(caller);
    const find = (role: "context" | "reply") => views.filter(view => view.provider.provider_id === input.target.provider_id
      && view.action.thread_source?.role === role && view.action.thread_source.subject_kind === input.target.subject_kind && view.availability.available);
    const readers = find("context"), writers = find("reply");
    if (readers.length !== 1 || writers.length !== 1) throw assistantErrors.scope("原评论没有可用的上下文或回复入口");
    const reader = reference(readers[0]!), writer = reference(writers[0]!);
    const context = this.context(await client.invoke(caller, reader, { subject_id: input.target.subject_id, thread_id: input.target.thread_id, message_id: input.message_id,
      ...(input.draft ? { draft: input.draft } : {}) }));
    await caller.beforeEffect();
    let work = this.store.list(this.ports.actorId, { archived: "any", limit: -1 }).find(work => work.project_ref?.project_id === project.project_id
      && work.reply_target && identity(work.reply_target) === identity(input.target));
    if (work?.thread_round?.message_id === input.message_id) return work.thread_round.state === "failed"
      ? this.retry(work.work_id, work.revision, caller) : this.status(work.work_id, caller.project_id!);
    if (work?.thread_round && !["delivered", "stopped"].includes(work.thread_round.state)) {
      const run = await this.run(work);
      if (!run || !isTerminalAgentPhase(run.phase) || run.phase === "completed") throw assistantErrors.state("这条评论的上一轮尚未结束，请先查看或停止它");
      await caller.beforeEffect();
    }
    if (!work) work = this.store.create({ actor_id: this.ports.actorId, title: `${context.title} · 评论`,
      scope: { kind: "project", project_id: project.project_id }, project_ref: project, origin: { surface: "discussion", plugin_id: input.target.provider_id, title: context.title } });
    if (work.archived) {
      const request = await this.service.lifecycle.preview(work.work_id, false, `thread:${context.message.request_id}:${work.revision}`);
      work = await this.service.lifecycle.change(work.work_id, request, {
        beforeEffect: () => caller.beforeEffect(), assert_current: () => {
          if (!this.ports.alive()) throw assistantErrors.cancelled("原助理服务已关闭");
          caller.signal?.throwIfAborted();
          requireSynchronous(caller.assert_authority_current?.(), "最终授权检查必须同步完成");
        },
      });
    }
    this.service.lifecycle.assertStart(work);
    caller.signal?.throwIfAborted();
    requireSynchronous(caller.assert_authority_current?.(), "最终授权检查必须同步完成");
    work = this.store.update(this.ports.actorId, work.work_id, work.revision, {
      reply_target: { ...input.target, title: context.title }, thread_round: { request_id: context.message.request_id, attempt_id: randomUUID(),
        message_id: input.message_id, run_id: null, state: "starting", context, reader, writer } });
    return this.dispatch(work, caller);
  }

  async status(workId: string, projectId: string): Promise<ThreadReplyStatus> {
    const work = this.owned(workId, projectId), round = work.thread_round!;
    let state: string = round.state;
    const run = await this.run(work);
    if (state === "running") state = run?.phase === "completed"
      ? this.guards.has(workId) && !this.failures.has(workId) ? "delivering" : "delivery-pending" : run?.phase ?? "needs-check";
    if (state === "starting") state = "needs-check";
    return { work_id: work.work_id, revision: work.revision, message_id: round.message_id, state,
      ...(this.failures.has(workId) ? { error: this.failures.get(workId) } : {}), truncated: round.context.truncated };
  }

  async list(target: StartThreadReply["target"], projectId: string): Promise<ThreadReplyStatus | null> {
    const work = this.store.list(this.ports.actorId, { archived: "any", limit: -1 }).find(work => work.project_ref?.project_id === projectId
      && work.reply_target && identity(work.reply_target) === identity(target));
    return work ? this.status(work.work_id, projectId) : null;
  }

  async retry(workId: string, expected: number, caller: ActionExecutionContext): Promise<ThreadReplyStatus> {
    this.assertPerson(caller);
    let work = this.owned(workId, caller.project_id!);
    if (work.revision !== expected) throw assistantErrors.stale("这项回复已改变，请刷新后重试");
    const run = await this.run(work);
    await caller.beforeEffect();
    if (work.thread_round!.state === "delivered") return this.status(workId, caller.project_id!);
    if (run?.phase === "completed" && work.thread_round!.state !== "stopped") {
      this.retainAuthority(work, caller);
      await this.deliver(work, run);
      return this.status(workId, caller.project_id!);
    }
    if ((!run && work.thread_round!.state !== "failed") || (run && !isTerminalAgentPhase(run.phase))) {
      if (run) { this.retainAuthority(work, caller); this.watch(workId); return this.status(workId, caller.project_id!); }
      throw assistantErrors.needs_check("上次启动的结果尚不明确，没有重新调用模型");
    }
    this.retainAuthority(work, caller);
    await this.authorize(work, true);
    await caller.beforeEffect();
    work = this.store.update(this.ports.actorId, workId, expected, { thread_round: { ...work.thread_round!, attempt_id: randomUUID(), run_id: null, state: "starting" } });
    return this.dispatch(work, caller);
  }

  async stop(workId: string, caller: ActionExecutionContext): Promise<ThreadReplyStatus> {
    this.assertPerson(caller);
    const work = this.owned(workId, caller.project_id!);
    if (work.thread_round!.state === "delivered") return this.status(workId, caller.project_id!);
    await caller.beforeEffect();
    this.delivering.get(workId)?.abort();
    clearTimeout(this.timers.get(workId));this.timers.delete(workId);
    this.store.update(this.ports.actorId, workId, work.revision, { thread_round: { ...work.thread_round!, state: "stopped" } });
    const run = await this.run(work);
    if (run && !isTerminalAgentPhase(run.phase)) await this.service.control(workId, { kind: "stop" });
    return this.status(workId, caller.project_id!);
  }

  async authorize(work: StoredWork, restarting = false): Promise<void> {
    this.assertRoundCurrent(work, restarting);
    await this.guards.get(work.work_id)?.();
    const caller = await this.ports.caller(work.project_ref!);
    const value = await this.ports.client(work.project_ref!).invoke(caller, work.thread_round!.reader,
      { subject_id: work.reply_target!.subject_id, thread_id: work.reply_target!.thread_id, message_id: work.thread_round!.message_id });
    this.context(value);
    this.assertRoundCurrent(work, restarting);
    this.guards.get(work.work_id)?.assertCurrent();
  }

  private async dispatch(work: StoredWork, caller: ActionExecutionContext): Promise<ThreadReplyStatus> {
    const round = work.thread_round!;
    const previousRun = this.store.rounds(work.work_id).at(-1)?.run_id;
    this.retainAuthority(work, caller);
    try {
      const result = await this.service.send({ work_id: work.work_id, text: round.context.message.body, request_id: round.attempt_id,
        materials: [{ material_id: `thread-${round.attempt_id}`, kind: "text", title: `${round.context.title} · 原评论上下文${round.context.truncated ? "（部分内容）" : ""}`, text: round.context.text, explicit: true }] },
      { project_ref: work.project_ref, thread_request: round.attempt_id, beforeStart: async () => { await this.authorize(work); await caller.beforeEffect(); },
        assertBeforeStart: () => { this.assertRoundCurrent(work); this.guards.get(work.work_id)?.assertCurrent(); requireSynchronous(caller.assert_authority_current?.(), "最终授权检查必须同步完成"); } }, "page");
      await this.authorize(work);
      const current = this.assertRoundCurrent(work);
      this.guards.get(work.work_id)?.assertCurrent();
      this.store.update(this.ports.actorId, work.work_id, current.revision, { thread_round: { ...round, run_id: result.run_id ?? null, state: "running" } });
      this.failures.delete(work.work_id);this.watch(work.work_id);
    } catch (error) {
      const current = this.store.get(this.ports.actorId, work.work_id);
      const authorized = await this.guards.get(work.work_id)?.().then(() => true, () => false);
      if (authorized && current.thread_round?.attempt_id === round.attempt_id && current.thread_round.state === "starting") {
        const session = current.session_id ? await (await this.ports.host()).adapter("prologue").readSession({ runtime_id: "prologue", session_id: current.session_id }).catch(() => undefined) : null;
        const run = session?.latest_run;
        const started = run && run.ref.run_id !== previousRun;
        this.store.update(this.ports.actorId, work.work_id, current.revision, { thread_round: { ...round,
          run_id: started ? run.ref.run_id : null, state: started ? "running" : session === undefined ? "needs-check" : "failed" } });
        if (started) this.watch(work.work_id);
      } else if (current.thread_round?.state === "stopped") await this.service.control(work.work_id, { kind: "stop" });
      this.failures.set(work.work_id, error instanceof Error ? error.message : "助理未能开始");
      throw error;
    }
    return this.status(work.work_id, caller.project_id!);
  }

  private watch(workId: string): void {
    if (this.timers.has(workId)) return;
    const timer = setTimeout(() => {
      this.timers.delete(workId);
      if (!this.ports.alive()) return;
      void this.tick(workId).catch(error => this.failures.set(workId, error instanceof Error ? error.message : "回复暂未投递"));
    }, 500);
    timer.unref();this.timers.set(workId, timer);
  }
  private async tick(workId: string): Promise<void> {
    const work = this.store.get(this.ports.actorId, workId);
    if (work.thread_round?.state !== "running") return;
    const run = await this.run(work);
    if (!run) return;
    if (run.phase === "completed") await this.deliver(work, run);
    else if (!isTerminalAgentPhase(run.phase)) this.watch(workId);
  }
  private async deliver(work: StoredWork, run: AgentRunView): Promise<void> {
    if (this.delivering.has(work.work_id)) return;
    const control = new AbortController();this.delivering.set(work.work_id, control);
    try {
      const body = run.turns.filter(turn => turn.kind === "assistant" && turn.text.trim()).at(-1)?.text.trim();
      if (!body) throw assistantErrors.empty_reply("这一轮没有可投递的回复，请查看运行结果");
      await this.authorize(work);
      const caller = await this.ports.caller(work.project_ref!);
      const retained = this.guards.get(work.work_id);
      if (!retained) throw assistantErrors.authority("宿主没有提供后台回复的授权检查");
      const assertCurrent = (reference?: ActionReference, permissions?: readonly string[]) => {
        control.signal.throwIfAborted();
        const current = this.assertRoundCurrent(work);
        if (current.thread_round!.state !== "running") throw new ActionError("actions.cancelled", "原回复已经停止或被替换");
        retained.assertCurrent();
        requireSynchronous(caller.assert_authority_current?.(reference, permissions), "最终授权检查必须同步完成");
      };
      const guard = async (ref: ActionReference) => {
        await retained();
        await caller.validate_authority?.(ref);
        assertCurrent(ref);
      };
      await this.ports.client(work.project_ref!).invoke({ ...caller, signal: control.signal, validate_authority: guard, assert_authority_current: assertCurrent,
        assistant_reply: { target: work.reply_target!, message_id: work.thread_round!.message_id, request_id: work.thread_round!.request_id,
          work_id: work.work_id, run_id: run.ref.run_id, body } }, work.thread_round!.writer,
      { subject_id: work.reply_target!.subject_id, thread_id: work.reply_target!.thread_id });
      await guard(work.thread_round!.writer);
      this.store.update(this.ports.actorId, work.work_id, null, { thread_round: { ...work.thread_round!, state: "delivered" } });
      this.failures.delete(work.work_id);
    } finally { this.delivering.delete(work.work_id); }
  }
  private retainAuthority(work: StoredWork, caller: ActionExecutionContext): void {
    // The background work has its own lifetime. Keep revocable transport grants, never a completed handler's beforeEffect.
    if (!caller.retainAuthority) throw assistantErrors.authority("宿主没有提供后台回复的授权检查");
    this.guards.set(work.work_id, caller.retainAuthority([work.thread_round!.reader, work.thread_round!.writer]));
  }
  private async run(work: StoredWork): Promise<AgentRunView | null> {
    return work.session_id && work.thread_round?.run_id ? (await this.ports.host()).adapter("prologue").read({ session_id: work.session_id, run_id: work.thread_round.run_id }) : null;
  }
  private owned(workId: string, projectId: string): StoredWork {
    const work = this.store.get(this.ports.actorId, workId);
    if (!work.reply_target || !work.thread_round || work.project_ref?.project_id !== projectId) throw assistantErrors.scope("这项回复不属于当前项目的评论");
    return work;
  }
  private assertRoundCurrent(work: StoredWork, restarting = false): StoredWork {
    const current = this.owned(work.work_id, work.project_ref!.project_id);
    if (current.archived || !restarting && current.thread_round?.state === "stopped" || current.thread_round?.attempt_id !== work.thread_round?.attempt_id) throw new ActionError("actions.cancelled", "这次评论回复已停止或被替换");
    return current;
  }
  private assertPerson(caller: ActionExecutionContext): void {
    if (caller.actor_id !== this.ports.actorId || caller.audience !== "user" || !caller.project_id) throw new ActionError("actions.forbidden", "请从原评论显式召唤助理");
  }
  private context(value: unknown): AssistantThreadContext {
    const context = value as Partial<AssistantThreadContext> | null;
    if (!context || typeof context.title !== "string" || typeof context.revision !== "string" || typeof context.text !== "string" || context.text.length > 100000
      || typeof context.truncated !== "boolean" || typeof context.message?.body !== "string" || typeof context.message.message_id !== "string" || typeof context.message.request_id !== "string") throw new ActionError("actions.output_invalid", "评论提供方返回了无效的上下文");
    return context as AssistantThreadContext;
  }
}
