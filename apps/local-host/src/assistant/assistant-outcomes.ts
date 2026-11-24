import { assistantWords } from "./assistant-saved-text.js";
import { isDeepStrictEqual } from "node:util";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { recordAssistantResultCard } from "./assistant-result-card.js";
import { isTerminalAgentPhase, type AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { actionResultSubject, requireSynchronous, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { describeReview } from "./assistant-review-words.js";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { identity, revisionOf } from "./assistant-relations.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import type { AssistantJobs } from "./assistant-jobs.js";
import { declaredUndo } from "../action-undo.js";
import { assistantErrors } from "./assistant-errors.js";
import { randomUUID } from "node:crypto";
import { assertPersonDecisionProject, type AssistantPersonDecision, type PersonActions } from "./assistant-executor.js";
import { AUTOMATION_ADOPTION_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { exactRevision } from "./assistant-inputs.js";
import { ownerOf } from "./assistant-round-start.js";
import { afterParkedAnswer, answerablePhase, PARKED_ANSWER_TASK, roundAfterParkedAnswer } from "./assistant-parked-answer.js";
import { RUNTIME, MAX_TEXT, sessionRef, type AssistantServicePorts, type AssistantCaller } from "./assistant-service-shared.js";
import { titleIn, type CapabilityTitles } from "./assistant-present.js";
import type { AssistantWorkReads } from "./assistant-work-reads.js";
import type { AssistantDispatch } from "./assistant-dispatch.js";
import { assistantEndControl, holdAssistantWorkLifetime, inAssistantWorkEffect } from "./assistant-work-permissions.js";
import type { AssistantStepGate } from "./assistant-step-gate.js";
import { isAccountQuestionId } from "../agent-definitions/skill-connector-categories.js";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";

export type AssistantOutcomesLinks = Pick<AssistantDispatch, "executorOf" | "dispatch"> & Pick<AssistantWorkReads, "latestRun"> & { read(workId: string): Promise<AssistantWorkView>; jobs: Pick<AssistantJobs, "follow">; stepGate?: Pick<AssistantStepGate, "answer"> };
export interface AssistantAnswerExecution {
  beforeEffect(): Promise<void>; assertCurrent(): void; handed(): void; accepted(): void;
}

/**
 * What the person decides and what a round produced: answers and confirmations, results handed back or made, the undo
 * each change declares, and the names objects had. Only its ports reach the Host; the other collaborators come through
 * `link`.
 */
export class AssistantOutcomes {
  constructor(private readonly store: Pick<AssistantStore, "addCard" | "get" | "permissionTransitions" | "raiseNotice" | "relations" | "rounds" | "saveUndo" | "setSetting" | "setting" | "undos">, private readonly ports: AssistantServicePorts, private readonly actorId: string, private readonly now: () => Date, private readonly titles: Map<string, CapabilityTitles>, private readonly link: AssistantOutcomesLinks) {}

  async answer(workId: string, input: { run_id: string; pending_id: string; pending_revision?: number; text?: string;
    answers?: ReadonlyArray<import("@molis-ai/molis-work-contracts/services/agent-interaction").AgentQuestionAnswer> }, caller: AssistantCaller = {}, execution?: AssistantAnswerExecution): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    const entry = this.store.permissionTransitions.holdWorkInput(workId);
    try { return await this.answerOriginal(work, input, caller, entry.assertCurrent, execution); }
    finally { entry.release(); }
  }

  private async answerOriginal(work: StoredWork, input: Parameters<AssistantOutcomes["answer"]>[1], caller: AssistantCaller, assertEntry: () => void, execution?: AssistantAnswerExecution): Promise<AssistantWorkView> {
    const workId = work.work_id;
    const host = await this.ports.host();
    const assertLifetime = await holdAssistantWorkLifetime(host, work);
    const original = assistantEndControl(this.store, work);
    const assertCurrent = () => {
      assertEntry(); assertLifetime?.(); original.assertCurrent(); execution?.assertCurrent();
      const current = this.store.get(this.actorId, workId);
      if (current.archived || current.delegated_by?.taken_back_at) throw assistantErrors.state("这项工作已经归档或收回");
      requireSynchronous(caller.assertBeforeStart?.());
    };
    const beforeEffect = async () => { await caller.beforeStart?.(); await execution?.beforeEffect(); assertCurrent(); };
    if (work.executor.kind === "plugin") {
      const executor = await this.link.executorOf(work, undefined, { control: { beforeEffect, assert_authority_current: assertCurrent } });
      const run = work.executor.session_id ? (await executor.read(work.executor.session_id, 6)).runs.find(item => item.ref.run_id === input.run_id) : undefined;
      const question = run?.awaiting_input.find(item => item.pending_id === input.pending_id);
      if (!run || !question || run.phase !== answerablePhase(question)) throw assistantErrors.stale("这个问题已经结束或被替换，回答没有发送");
      await beforeEffect(); execution?.handed();
      const result = await executor.control(work.executor.session_id!, run.ref.run_id, { kind: "answer", pending_id: input.pending_id, pending_revision: exactRevision(input.pending_revision, question.pending_revision),
        ...(execution ? { continue_after_answer: false } : {}),
        ...(input.text !== undefined ? { text: input.text } : {}), ...(input.answers ? { answers: input.answers } : {}) });
      if (!result.accepted) throw assistantErrors.state("执行方没有接受这份答案", { answer_accepted: false });
      execution?.accepted();
      return this.link.read(workId);
    }
    if (!this.store.rounds(work.work_id).some(round => round.run_id === input.run_id)) throw assistantErrors.scope("这个问题不属于这项工作");
    const adapter = host.adapter(RUNTIME);
    const run = await adapter.read({ session_id: work.session_id!, run_id: input.run_id });
    const question = run.awaiting_input.find(item => item.pending_id === input.pending_id);
    // A late answer to a question that is already closed or replaced starts nothing; one parked at a restart ends its round.
    if (!question || run.phase !== answerablePhase(question)) throw assistantErrors.stale("这个问题已经结束或被替换，回答没有发送");
    if (input.text !== undefined && (typeof input.text !== "string" || input.text.length > MAX_TEXT)) throw assistantErrors.invalid("回答过长");
    let commitChoice: (() => void) | undefined;
    if (question.questions?.some(item => isAccountQuestionId(item.id))) {
      if (!caller.allowConnectionChoice || caller.project_ref?.project_id !== work.project_ref?.project_id)
        throw assistantErrors.scope("请在这项工作所在的项目里本人选择账号");
      if (!question.answerable || exactRevision(input.pending_revision, question.pending_revision) !== question.pending_revision)
        throw assistantErrors.stale("这张账号选择卡已更新，请刷新后再选");
      if (!adapter.withEffect || !this.ports.prepareConnectionAnswer)
        throw assistantErrors.state("当前宿主无法保存这项工作的账号选择");
      commitChoice = await this.ports.prepareConnectionAnswer(work, question.questions, input.answers);
    }
    await beforeEffect(); execution?.handed();
    const sendAnswer = () => adapter.control(run.ref, { kind: "answer", pending_id: input.pending_id,
      ...(input.pending_revision !== undefined ? { pending_revision: input.pending_revision } : question.pending_revision !== undefined ? { pending_revision: question.pending_revision } : {}),
      ...(input.text !== undefined ? { text: input.text } : {}), ...(input.answers ? { answers: input.answers } : {}) });
    if (commitChoice && adapter.withEffect) await adapter.withEffect({ beforeEffect, assert_current: () => { assertCurrent(); commitChoice!(); } }, sendAnswer);
    else await inAssistantWorkEffect(adapter, { beforeEffect, assertCurrent }, sendAnswer);
    if (execution) { execution.accepted(); return this.link.read(workId); }
    return afterParkedAnswer(question.parked ? await roundAfterParkedAnswer(() => this.link.dispatch(this.store.get(this.actorId, workId), PARKED_ANSWER_TASK, [], null, undefined, "host", undefined, beforeEffect, assertCurrent, { byHost: true, ...(caller.reply_locale ? { reply_locale: caller.reply_locale } : {}) }), async () => adapter.recovery?.inspect(sessionRef(work))) : undefined, await this.link.read(workId));
  }

  async decide(workId: string, input: { review_id: string; version: string; decision: "approve" | "reject"; note?: string }, boundary?: Parameters<AgentHost["reviews"]["respond"]>[1], subtaskRun?: AgentRunRef, assertSubtaskCurrent?: () => void): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    if (subtaskRun && work.step_gate?.id === input.review_id && work.step_gate.run_id !== subtaskRun.run_id) throw assistantErrors.stale("下一步确认不属于这次原执行");
    await boundary?.beforeEffect?.();
    // 「接着做下一步？」 is the Host's own confirmation (PWA-156), answered here the same as through the task's row.
    if (work.step_gate?.id === input.review_id && await this.link.stepGate?.answer(workId, input.review_id, input.version, input.decision, assertSubtaskCurrent)) return this.link.read(workId);
    const host = await this.ports.host();
    const review = host.reviews.get(String(input.review_id));
    // A plugin-carried work's confirmations are the plugin's own, in the same queue its page decides from.
    const session = work.executor.kind === "plugin" && work.executor.session_id
      ? (await (await this.link.executorOf(work)).read(work.executor.session_id, 1)).runtime_session_id ?? null : work.session_id;
    if (!review || review.run?.session_id !== session || review.project_id !== ownerOf(work)
      || subtaskRun && (review.run.run_id !== subtaskRun.run_id || review.run.session_id !== subtaskRun.session_id)) throw assistantErrors.scope("这项确认不属于这项工作");
    if (!["approve", "reject"].includes(input.decision)) throw assistantErrors.invalid("请选择允许或拒绝");
    const receipt = await host.reviews.respond({ review_id: review.review_id, version: input.version, decision: input.decision, actor_id: this.actorId, ...(input.note ? { note: cutHead(String(input.note), 2000) } : {}) }, {
      beforeEffect: boundary?.beforeEffect,
      assertCurrent: request => {
        const current = this.store.get(this.actorId, workId);
        if (ownerOf(current) !== request.project_id || current.session_id !== work.session_id || current.archived !== work.archived || !isDeepStrictEqual(current.executor, work.executor)) {
          throw assistantErrors.scope("这项工作的执行归属已经改变，原确认没有提交");
        }
        return boundary?.assertCurrent?.(request);
      },
    });
    if (receipt.delivery_error) {
      throw assistantErrors.state(`决定已保存，但送达执行方失败，结果待核对：${receipt.delivery_error}`);
    }
    // The runtime tells the round only that policy blocked the change; the round must know the person declined it.
    if (!subtaskRun && input.decision === "reject" && work.executor.kind !== "plugin" && review.run) {
      const latest = await this.link.latestRun(host, work).catch(() => null);
      if (latest && latest.ref.run_id === review.run.run_id && !isTerminalAgentPhase(latest.phase)) {
        const why = input.note ? `，理由：${cutHead(String(input.note), 500)}` : "";
        await host.adapter(RUNTIME).inputs?.send(latest.ref, { source: "host", text: `（Molis 转告）用户拒绝了这次修改「${describeReview(review.document).summary}」${why}。它没有执行。不要换别的能力做同一件事；需要时问用户想怎么做。` }).catch(() => undefined);
      }
    }
    return this.link.read(workId);
  }

  /**
   * How the scope's capabilities are called, for showing a round's steps by name. Kept from the last dispatch; after a
   * restart it is read again from the current catalog rather than showing internal identifiers.
   */
  async capabilityTitles(work: StoredWork): Promise<CapabilityTitles | undefined> {
    const known = this.titles.get(ownerOf(work));
    if (known) return known;
    try {
      const authority = await this.ports.authority(work);
      if (!authority.actions) return undefined;
      const views = await (await authority.actions(RUNTIME)).discover();
      const titles: CapabilityTitles = new Map(views.map(view => [view.capability_id, { title: view.action.title, provider: view.provider.title }]));
      this.titles.set(ownerOf(work), titles);
      return titles;
    } catch { return undefined; }
  }

  /**
   * A plugin hands a result back to a work (its page raised a `reply`). The work keeps a relation to the object, read
   * from its owner like every other; nothing is copied, and receiving it does not mark the work done.
   */
  async receiveResult(workId: string, input: { object?: unknown; source?: unknown }): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    const object = input.object as { kind?: unknown; id?: unknown; version?: unknown } | undefined;
    const source = input.source as { surface?: unknown; title?: unknown } | undefined;
    const text = (value: unknown) => typeof value === "string" && value.trim() && value.length <= 200 ? value.trim() : null;
    const kind = text(object?.kind), id = text(object?.id), from = text(source?.title) ?? text(source?.surface);
    if (!kind || !id || !from) throw assistantErrors.invalid("交回的结果要说明对象种类、标识和来自哪里");
    this.store.relations.link(identity(work), "result", { kind, id, revision: revisionOf(typeof object?.version === "number" || typeof object?.version === "string" ? object.version : undefined) }, `${from} 交回`);
    this.store.raiseNotice(this.actorId, { kind: "result", work_id: work.work_id, work_title: work.title,
      text: assistantWords("workbench.assistant-notice.result", { from, title: work.title }) }, `${work.work_id}:result:${kind}:${id}:${String(object?.version ?? "")}`);
    return this.link.read(workId);
  }

  /** A command the Assistant ran for this work succeeded: keep the object it created or changed, at its new revision. */
  recordResult(work: StoredWork, view: ActionView, input: unknown, output: unknown, showCard = true): void {
    if (showCard) recordAssistantResultCard(this.store, work, view, output, this.now());
    void this.link.jobs.follow(work, view, output).catch(() => undefined);
    this.spendUndos(work, view, input);
    this.recordUndo(work, view, output);
    const result = actionResultSubject(view.action, input, output);
    if (!result) return;
    this.store.relations.link(identity(work), "result", { kind: result.subject.kind, id: result.subject.id, revision: result.revision },
      `${view.provider.title} · ${view.action.title}`);
    const title = titleIn(output, result.subject.id);
    if (title) this.rememberTitle(result.subject, title);
  }

  /** The name an object last had, kept so it can still be named once it is gone (undone, deleted) or unreadable. */
  rememberTitle(object: { kind: string; id: string }, title: string): void {
    const key = `object-title:${object.kind}:${object.id}`, value = cutHead(title, 200);
    if (value && this.store.setting(this.actorId, key) !== value) this.store.setSetting(this.actorId, key, value);
  }

  rememberedTitle(object: { kind: string; id: string }): string | null {
    return this.store.setting(this.actorId, `object-title:${object.kind}:${object.id}`);
  }

  /**
   * A change a round just made that is exactly one of this work's offered undos (seen: asked to drop a document it made,
   * the round discarded it itself) spends that undo: the panel no longer offers a take-back that can only fail.
   */
  private spendUndos(work: StoredWork, view: ActionView, input: unknown): void {
    const given = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
    for (const undo of this.store.undos(this.actorId, work.work_id)) {
      if (undo.state !== "available" || undo.reference.capability_id !== view.capability_id || undo.reference.version !== view.version
        || undo.reference.provider_id !== view.provider.provider_id) continue;
      if (!Object.entries(undo.input).every(([field, value]) => isDeepStrictEqual(given[field], value))) continue;
      this.store.saveUndo(this.actorId, { ...undo, state: "undone", undone_at: this.now().toISOString() });
    }
  }

  /** A change that declares how it is undone leaves that undo on its work, with the exact input its output gives. */
  recordUndo(work: StoredWork, view: ActionView, output: unknown): void {
    const undo = declaredUndo(view, output);
    if (!undo) return;
    const adoptionId = view.provider.provider_id === AUTOMATION_ADOPTION_PROVIDER_ID ? undo.input.adoption_id : undefined;
    const undoId = typeof adoptionId === "string" ? adoptionId : randomUUID();
    if (adoptionId && this.store.undos(this.actorId, work.work_id).some(record => record.undo_id === undoId)) return;
    this.store.saveUndo(this.actorId, { undo_id: undoId, work_id: work.work_id, title: `${view.provider.title} · ${view.action.title}`, state: "available",
      created_at: this.now().toISOString(), ...undo });
  }

  #undoing = new Map<string, Promise<AssistantWorkView>>();

  /** The person takes a change back: the owner's own undo, run once as the person's choice; the next round is told. */
  async undo(workId: string, undoId: string, decision?: AssistantPersonDecision): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    const record = this.store.undos(this.actorId, workId).find(item => item.undo_id === undoId);
    if (!record) throw assistantErrors.invalid("这项修改不能在这里撤销");
    if (record.reference.provider_id === AUTOMATION_ADOPTION_PROVIDER_ID) assertPersonDecisionProject(work.project_ref?.project_id ?? null, decision);
    if (record.state === "undone") throw assistantErrors.state("这项修改已经撤销过了");
    // Claimed before anything is sent: a second request while the owner's undo runs (another tab, a retry) gets this one's outcome and sends nothing.
    const claimed = this.#undoing.get(undoId);
    if (claimed) return claimed;
    const running = (async () => {
      let actions: PersonActions | null = null;
      try { actions = await this.ports.scopeActions?.(work, decision) ?? null; } catch { actions = null; }
      if (!actions) throw assistantErrors.unsupported("现在不能撤销，请到原处修改");
      try {
        const outcome = await actions.invoke(record.reference, record.input);
        decision?.assertCurrent();
        const summary = record.reference.provider_id === AUTOMATION_ADOPTION_PROVIDER_ID && outcome && typeof outcome === "object"
          && "summary" in outcome && typeof outcome.summary === "string" ? cutHead(outcome.summary, 600) : undefined;
        this.store.saveUndo(this.actorId, { ...record, state: "undone", undone_at: this.now().toISOString(), detail: summary });
      } catch (error) {
        decision?.assertCurrent();
        const detail = cutHead((error instanceof Error ? error.message : String(error)).replace(/^[A-Z_.]+:\s*/, ""), 300);
        // Spent meanwhile (the round made that very change itself): it is undone, whatever the owner said to this call.
        if (this.store.undos(this.actorId, workId).find(item => item.undo_id === undoId)?.state === "undone") return this.link.read(workId);
        this.store.saveUndo(this.actorId, { ...record, state: "failed", detail });
        throw assistantErrors.failed(`没能撤销「${record.title}」：${detail}`);
      }
      return this.link.read(workId);
    })();
    this.#undoing.set(undoId, running);
    try { return await running; } finally { this.#undoing.delete(undoId); }
  }
}
