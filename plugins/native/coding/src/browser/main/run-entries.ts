import type { ActivityView, ChangeView, PendingQuestion, RunView, TurnView } from "./shapes.js";

type Entry =
  | { readonly kind: "turn"; readonly value: TurnView; readonly sequence: number }
  | { readonly kind: "activity"; readonly value: ActivityView; readonly sequence: number }
  | { readonly kind: "question"; readonly value: PendingQuestion; readonly sequence: number }
  | { readonly kind: "changes"; readonly value: ChangeView; readonly sequence: number };

/** What a round's conversation is made of, in order: calls that follow each other are one group. */
export type Group =
  | { readonly kind: "turn"; readonly value: TurnView }
  | { readonly kind: "activity"; readonly values: ActivityView[]; lastSequence: number }
  | { readonly kind: "question"; readonly value: PendingQuestion }
  | { readonly kind: "changes"; readonly value: ChangeView };

/** A round's turns, calls, open questions and changes, by the order they happened. */
export function groupEntries(run: RunView): Group[] {
  const entries: Entry[] = [
    ...run.turns.filter(turn => turn.kind !== "system").map((value, index): Entry => ({ kind: "turn", value, sequence: value.sequence ?? index })),
    ...run.activity.map((value, index): Entry => ({ kind: "activity", value, sequence: value.sequence ?? run.turns.length + index })),
    ...(run.awaiting_input || []).map((value, index): Entry => ({ kind: "question", value, sequence: value.sequence ?? run.turns.length + run.activity.length + index })),
    ...(run.turn_changes || []).map((value): Entry => ({ kind: "changes", value, sequence: value.sequence })),
  ].sort((a, b) => a.sequence - b.sequence);
  const groups: Group[] = [];
  for (const entry of entries) {
    const previous = groups.at(-1);
    if (entry.kind === "activity" && previous?.kind === "activity" && previous.lastSequence + 1 === entry.sequence) {
      previous.values.push(entry.value);
      previous.lastSequence = entry.sequence;
    } else if (entry.kind === "activity") {
      groups.push({ kind: "activity", values: [entry.value], lastSequence: entry.sequence });
    } else {
      groups.push(entry);
    }
  }
  return groups;
}
