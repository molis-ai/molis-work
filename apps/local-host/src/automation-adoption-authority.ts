import { isDeepStrictEqual } from "node:util";
import { ActionError, type ActionCallContext, type ActionUserAction, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { hasProtectedWebAction } from "./plugin-consent-settings-entry.js";

interface CardDecision {
  readonly project_id: string;
  readonly work_id?: string;
  readonly action: ExactActionReference;
  readonly input: unknown;
  assertCurrent(): void;
  readonly receipt?: { record(adoptionId: string): void; clear(adoptionId: string): void };
}

const pending = new WeakMap<ActionUserAction, CardDecision>();
const refused = () => new ActionError("actions.forbidden", "请在项目助理里本人确认原建议");

/** Bind the issued panel request to one dispatch, regardless of what other person actions it can read. */
export async function withAutomationCardDecision<T>(entry: ActionUserAction, decision: CardDecision, invoke: () => Promise<T>): Promise<T> {
  if (!hasProtectedWebAction(entry) || pending.has(entry)) throw refused();
  decision.assertCurrent();
  const held = { ...decision, action: { ...decision.action }, input: structuredClone(decision.input) };
  pending.set(entry, held);
  try { return await invoke(); }
  finally { pending.delete(entry); }
}

export function takeAutomationCardDecision(caller: ActionCallContext, action: ExactActionReference, input: unknown): CardDecision {
  const entry = caller.user_action;
  if (!hasProtectedWebAction(entry)) throw refused();
  const held = pending.get(entry);
  if (!held || caller.project_id !== held.project_id || !isDeepStrictEqual(action, held.action) || !isDeepStrictEqual(input, held.input)) throw refused();
  pending.delete(entry);
  held.assertCurrent();
  return held;
}
