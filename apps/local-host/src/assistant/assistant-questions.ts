import type { InteractionValues } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import type { AssistantStore } from "./assistant-store.js";

/** At most this many half-written answers per work: a round rarely waits on more than one question at a time. */
const KEPT = 4;
const MAX_DRAFT = 20_000;

/**
 * Half-written answers, kept with the work they belong to (not a table of their own: the work's record already travels
 * with it, and a question's draft ends with its work). Only the latest few are kept; an answered question's goes.
 */
export class AssistantQuestionDrafts {
  constructor(private readonly ports: { store: AssistantStore; actorId: string; fail(code: string, message: string): Error }) {}

  read(workId: string): Record<string, InteractionValues> {
    return (this.ports.store.get(this.ports.actorId, workId).question_drafts ?? {}) as Record<string, InteractionValues>;
  }

  save(workId: string, pendingId: string, values: unknown): void {
    if (!/^[\w:.-]{1,200}$/.test(pendingId) || !values || typeof values !== "object" || Array.isArray(values) || JSON.stringify(values).length > MAX_DRAFT) {
      throw this.ports.fail("assistant.invalid", "草稿写法不对或过长");
    }
    const kept = Object.entries(this.read(workId)).filter(([id]) => id !== pendingId).slice(-(KEPT - 1));
    this.ports.store.update(this.ports.actorId, workId, null, { question_drafts: Object.fromEntries([...kept, [pendingId, values as InteractionValues]]) }, false);
  }

  drop(workId: string, pendingId: string): void {
    const drafts = this.read(workId);
    if (!(pendingId in drafts)) return;
    const { [pendingId]: _answered, ...rest } = drafts;
    this.ports.store.update(this.ports.actorId, workId, null, { question_drafts: rest }, false);
  }
}
