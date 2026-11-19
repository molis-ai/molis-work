/**
 * What a task's detail shows that a round changes when it ends: its last turn (the answer, or the sentence that it did not run and
 * why), its next time, and whether it is still on. The server writes it on the detail; the page compares a fresh read of the one task
 * with it to know a round has landed (96-2).
 */
export const roundStamp = (task: { readonly turns: readonly { readonly turn_id: string }[]; readonly next_due_at: string | null; readonly enabled: boolean }): string =>
  [task.turns.at(-1)?.turn_id ?? "", task.next_due_at ?? "", task.enabled ? "on" : "off"].join(" ");
