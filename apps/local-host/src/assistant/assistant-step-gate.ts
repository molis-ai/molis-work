import { randomUUID } from "node:crypto";
import { ASSISTANT_NEXT_STEP_REVIEW, type AssistantPendingReview } from "@molis-ai/molis-work-contracts/services/assistant";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import { assistantErrors, whenThere } from "./assistant-errors.js";

type Gate = NonNullable<StoredWork["step_gate"]>;
type Ports = {
  store: Pick<AssistantStore, "get" | "update">; actorId: string; now: () => Date;
  /** Start the step that was held, as it would have started by itself: the hand-back of the work's parts, or the runtime's continuation. */
  goOn(work: StoredWork, gate: Gate): Promise<void>;
};

/**
 * 「每步先问我」 (PWA-156, user decision 2026-11-15): a work the person switched it on for goes on by itself only after a yes. Each
 * time it would — its parts handed back, or a wait it was waiting on ended — the step is held and the work asks 「接着做下一步？」
 * on its task and in its conversation, as a confirmation the Host keeps (not the runtime's: nothing ran yet). A yes starts that
 * step the way it would have started; a no leaves it for the person's next word. The limit on rounds in a row still applies.
 */
export class AssistantStepGate {
  constructor(private readonly ports: Ports) {}

  /**
   * Whether the step under `request_key` may start now. With the switch off it always may; with it on, only after a yes for that
   * step. The first time it is held the ask is written on the work (once: the same step asks once, whichever path asks again).
   */
  pass(work: StoredWork, path: Gate["path"], request_key: string, run_id: string | null): boolean {
    if (!work.ask_each_step) return true;
    if (work.step_answer?.request_key === request_key) return work.step_answer.decision === "approve";
    if (work.step_gate?.request_key === request_key) return false;
    this.ports.store.update(this.ports.actorId, work.work_id, null, { step_gate: { id: `next-step-${randomUUID()}`, path, request_key, run_id, asked_at: this.ports.now().toISOString() } }, false);
    return false;
  }

  /** The person's answer to the ask (through the conversation's card or the task's row): the same answer either way. */
  async answer(workId: string, review_id: string, decision: "approve" | "reject", assertCurrent?: () => void): Promise<boolean> {
    const work = this.ports.store.get(this.ports.actorId, workId), gate = work.step_gate;
    if (!gate || gate.id !== review_id) return false;
    if (!["approve", "reject"].includes(decision)) throw assistantErrors.invalid("请选择接着做或先不做");
    assertCurrent?.();
    const now = this.ports.store.update(this.ports.actorId, workId, null, { step_gate: undefined, step_answer: { request_key: gate.request_key, decision } }, false);
    if (decision === "approve") await this.ports.goOn(now, gate);
    return true;
  }

  /** Switch it on or off. Off while a step is held answers yes for it: nothing asks any more, so the step goes on. */
  async set(workId: string, on: unknown): Promise<StoredWork> {
    if (typeof on !== "boolean") throw assistantErrors.invalid("请说明开还是关");
    const work = this.ports.store.get(this.ports.actorId, workId);
    if (work.executor.kind === "plugin" || work.reply_target) throw assistantErrors.invalid("这项工作由别的执行方接着做，这里管不到它的每一步");
    const updated = this.ports.store.update(this.ports.actorId, workId, null, { ask_each_step: on ? true : undefined }, false);
    if (!on && work.step_gate) await this.answer(workId, work.step_gate.id, "approve");
    return whenThere(() => this.ports.store.get(this.ports.actorId, workId)) ?? updated;
  }
}

/** The held step as a confirmation of the work's (its conversation's card and its task's row read it like any other), in the reader's language. */
export function stepReview(work: Pick<StoredWork, "step_gate">): AssistantPendingReview[] {
  const gate = work.step_gate;
  return gate ? [{ review_id: gate.id, kind: ASSISTANT_NEXT_STEP_REVIEW, run_id: gate.run_id, summary: uiText.text("workbench.assistant-step-gate.ask"),
    fields: [{ label: uiText.text("workbench.assistant-step-gate.why-label"), value: uiText.text(gate.path === "hand-back" ? "workbench.assistant-step-gate.why-hand-back" : "workbench.assistant-step-gate.why-continuation") }],
    requested_at: gate.asked_at, expires_at: null }] : [];
}
