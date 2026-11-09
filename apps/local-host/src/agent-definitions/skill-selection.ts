import { AsyncLocalStorage } from "node:async_hooks";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";

/** Trusted round entry only. Model arguments never create or replace this selection. */
export interface SkillSelection {
  actor_id: string;
  project_id: string | null;
  consumer: "assistant" | "coding" | "agent";
  named: readonly SkillRef[];
  engine?: "builtin" | "local";
}
const selections = new AsyncLocalStorage<SkillSelection>();

/** A round's owner freezes its authenticated selection before invoking the shared catalog actions. */
export function withSkillSelection<T>(selection: SkillSelection, operation: () => T): T {
  return selections.run(structuredClone(selection), operation);
}

export function currentSkillSelection(caller: ActionCallContext): SkillSelection | undefined {
  const selection = selections.getStore();
  return selection?.actor_id === caller.actor_id && selection.project_id === caller.project_id ? selection : undefined;
}
