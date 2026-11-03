import { isDeepStrictEqual } from "node:util";
import { recordAssistantResultCard } from "./assistant-result-card.js";
import { isTerminalAgentPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import { actionResultSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { describeReview } from "./assistant-review-words.js";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { identity, revisionOf } from "./assistant-relations.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import type { AssistantJobs } from "./assistant-jobs.js";
import { declaredUndo } from "../action-undo.js";
import { assistantErrors } from "./assistant-errors.js";
import { randomUUID } from "node:crypto";
import type { PersonActions } from "./assistant-executor.js";
import { exactRevision } from "./assistant-inputs.js";
import { ownerOf } from "./assistant-round-start.js";
import { afterParkedAnswer, answerablePhase, PARKED_ANSWER_TASK, roundAfterParkedAnswer } from "./assistant-parked-answer.js";
import { RUNTIME, MAX_TEXT, sessionRef, type AssistantServicePorts, type AssistantCaller } from "./assistant-service-shared.js";
import { titleIn, type CapabilityTitles } from "./assistant-present.js";
import type { AssistantWorkReads } from "./assistant-work-reads.js";
import type { AssistantDispatch } from "./assistant-dispatch.js";

export type AssistantOutcomesLinks = Pick<AssistantDispatch, "executorOf" | "dispatch"> & Pick<AssistantWorkReads, "latestRun"> & { read(workId: string): Promise<AssistantWorkView>; jobs: Pick<AssistantJobs, "follow"> };

/**
 * What the person decides and what a round produced: answers and confirmations, results handed back or made, the undo
 * each change declares, and the names objects had. Only its ports reach the Host; the other collaborators come through
 * `link`.
 */
export class AssistantOutcomes {
  constructor(private readonly store: Pick<AssistantStore, "addCard" | "get" | "raiseNotice" | "relations" | "rounds" | "saveUndo" | "setSetting" | "setting" | "undos">, private readonly ports: AssistantServicePorts, private readonly actorId: string, private readonly now: () => Date, private readonly titles: Map<string, CapabilityTitles>, private readonly link: AssistantOutcomesLinks) {}

  async answer(workId: string, input: { run_id: string; pending_id: string; pending_revision?: number; text?: string;
    answers?: ReadonlyArray<import("@molis-ai/molis-work-contracts/services/agent-interaction").AgentQuestionAnswer> }, caller: AssistantCaller = {}): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    if (work.executor.kind === "plugin") {
      const executor = await this.link.executorOf(work);
      const run = work.executor.session_id ? (await executor.read(work.executor.session_id, 6)).runs.find(item => item.ref.run_id === input.run_id) : undefined;
      const question = run?.awaiting_input.find(item => item.pending_id === input.pending_id);
      if (!run || !question || run.phase !== answerablePhase(question)) throw assistantErrors.stale("这个问题已经结束或被替换，回答没有发送");
      await executor.control(work.executor.session_id!, run.ref.run_id, { kind: "answer", pending_id: input.pending_id, pending_revision: exactRevision(input.pending_revision, question.pending_revision),
        ...(input.text !== undefined ? { text: input.text } : {}), ...(input.answers ? { answers: input.answers } : {}) });
      return this.link.read(workId);
    }
    if (!this.store.rounds(work.work_id).some(round => round.run_id === input.run_id)) throw assistantErrors.scope("这个问题不属于这项工作");
    const host = await this.ports.host();
    const run = await host.adapter(RUNTIME).read({ session_id: work.session_id!, run_id: input.run_id });
    const question = run.awaiting_input.find(item => item.pending_id === input.pending_id);
    // A late answer to a question that is already closed or replaced starts nothing; one parked at a restart ends its round.
    if (!question || run.phase !== answerablePhase(question)) throw assistantErrors.stale("这个问题已经结束或被替换，回答没有发送");
    if (input.text !== undefined && (typeof input.text !== "string" || input.text.length > MAX_TEXT)) throw assistantErrors.invalid("回答过长");
    await host.adapter(RUNTIME).control(run.ref, { kind: "answer", pending_id: input.pending_id,
      ...(input.pending_revision !== undefined ? { pending_revision: input.pending_revision } : question.pending_revision !== undefined ? { pending_revision: question.pending_revision } : {}),
      ...(input.text !== undefined ? { text: input.text } : {}), ...(input.answers ? { answers: input.answers } : {}) });
    return afterParkedAnswer(question.parked ? await roundAfterParkedAnswer(() => this.link.dispatch(this.store.get(this.actorId, workId), PARKED_ANSWER_TASK, [], null, undefined, "host", undefined, caller.beforeStart, caller.assertBeforeStart, { byHost: true }), async () => host.adapter(RUNTIME).recovery?.inspect(sessionRef(work))) : undefined, await this.link.read(workId));
  }

  async decide(workId: string, input: { review_id: string; decision: "approve" | "reject"; note?: string }): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    const host = await this.ports.host();
    const review = host.reviews.get(String(input.review_id));
    // A plugin-carried work's confirmations are the plugin's own, in the same queue its page decides from.
    const session = work.executor.kind === "plugin" && work.executor.session_id
      ? (await (await this.link.executorOf(work)).read(work.executor.session_id, 1)).runtime_session_id ?? null : work.session_id;
    if (!review || review.run?.session_id !== session || review.project_id !== ownerOf(work)) throw assistantErrors.scope("这项确认不属于这项工作");
    if (!["approve", "reject"].includes(input.decision)) throw assistantErrors.invalid("请选择允许或拒绝");
    await host.reviews.respond({ review_id: review.review_id, decision: input.decision, actor_id: this.actorId, ...(input.note ? { note: String(input.note).slice(0, 2000) } : {}) });
    // The runtime tells the round only that policy blocked the change; the round must know the person declined it.
    if (input.decision === "reject" && work.executor.kind !== "plugin" && review.run) {
      const latest = await this.link.latestRun(host, work).catch(() => null);
      if (latest && latest.ref.run_id === review.run.run_id && !isTerminalAgentPhase(latest.phase)) {
        const why = input.note ? `，理由：${String(input.note).slice(0, 500)}` : "";
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
    this.store.raiseNotice(this.actorId, { kind: "result", work_id: work.work_id, work_title: work.title, text: `${from} 把结果交回了「${work.title}」` }, `${work.work_id}:result:${kind}:${id}:${String(object?.version ?? "")}`);
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
    const key = `object-title:${object.kind}:${object.id}`, value = title.slice(0, 200);
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
  private recordUndo(work: StoredWork, view: ActionView, output: unknown): void {
    const undo = declaredUndo(view, output);
    if (!undo) return;
    this.store.saveUndo(this.actorId, { undo_id: randomUUID(), work_id: work.work_id, title: `${view.provider.title} · ${view.action.title}`, state: "available",
      created_at: this.now().toISOString(), ...undo });
  }

  #undoing = new Map<string, Promise<AssistantWorkView>>();

  /** The person takes a change back: the owner's own undo, run once as the person's choice; the next round is told. */
  async undo(workId: string, undoId: string): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    const record = this.store.undos(this.actorId, workId).find(item => item.undo_id === undoId);
    if (!record) throw assistantErrors.invalid("这项修改不能在这里撤销");
    if (record.state === "undone") throw assistantErrors.state("这项修改已经撤销过了");
    // Claimed before anything is sent: a second request while the owner's undo runs (another tab, a retry) gets this one's outcome and sends nothing.
    const claimed = this.#undoing.get(undoId);
    if (claimed) return claimed;
    const running = (async () => {
      let actions: PersonActions | null = null;
      try { actions = await this.ports.scopeActions?.(work) ?? null; } catch { actions = null; }
      if (!actions) throw assistantErrors.unsupported("现在不能撤销，请到原处修改");
      try {
        await actions.invoke(record.reference, record.input);
        this.store.saveUndo(this.actorId, { ...record, state: "undone", undone_at: this.now().toISOString(), detail: undefined });
      } catch (error) {
        const detail = (error instanceof Error ? error.message : String(error)).replace(/^[A-Z_.]+:\s*/, "").slice(0, 300);
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
