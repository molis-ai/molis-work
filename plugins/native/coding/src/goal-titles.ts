import { GOALS_ACTIONS } from "./goals-actions.js";
import { platformErrorKind } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { codingActionControl, type CodingBeforeWrite } from "./route-entry.js";
import { currentGoalDirectory } from "./goal-context.js";

/** How many pages of the Goal directory one read walks looking for a title it has not found yet. */
const MAX_PAGES = 5;
const keyOf = (goalId: string) => `goal-title:${goalId}`;

/** A refused or failed read of Goals leaves the title as it was; only the end of the call itself is passed on. */
const ended = (error: unknown, beforeWrite: CodingBeforeWrite) =>
  beforeWrite.signal?.aborted === true || (error as { name?: unknown } | undefined)?.name === "AbortError"
  || platformErrorKind((error as { code?: unknown } | undefined)?.code as string) === "cancelled";

/**
 * The titles of the Goals sessions are attached to (PG-091). Goals owns a Goal and its title; Coding reads the title through Goals' public
 * read actions, declared in its Manifest `capabilities.consumes`, and keeps what it read only to draw the session directory, which is
 * rendered at once and cannot wait for an action. Queries refresh the in-memory projection; the independent observation job
 * persists titles for the next activation. A Goal whose title has never been read keeps its id in the directory and shows 「关联 Goal 暂不可用」
 * in the page, as an unresolvable Goal always has; one read before that cannot be read now keeps the last title read.
 */
export function codingGoalTitles(context: PluginStartContext) {
  const memory = new Map<string, string>();
  /** What is known now: in this process, or kept in the plugin's private storage from an earlier read. */
  const known = (goalId: string): string | undefined => {
    const seen = memory.get(goalId);
    if (seen !== undefined) return seen;
    const kept = context.services?.storage?.get(keyOf(goalId));
    if (typeof kept === "string" && kept) { memory.set(goalId, kept); return kept; }
    return undefined;
  };
  /**
   * Read the titles of these Goals into memory, persisting only for a command or background observation. The directory of open Goals names most of them in one call; one the
   * directory does not list (archived or discarded) is read by its id, once. Goals unavailable (stopped, not granted, no such
   * Goal) is not an error here: the title stays what it was.
   */
  const read = async (goalIds: Iterable<string>, beforeWrite: CodingBeforeWrite, persist = false): Promise<void> => {
    const wanted = [...new Set(goalIds)].filter(Boolean);
    if (!wanted.length || !context.services?.actions) return;
    const control = codingActionControl(beforeWrite), found = new Map<string, string>();
    try {
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const listed = await currentGoalDirectory(context, cursor, control);
        for (const goal of listed.goals) if (wanted.includes(goal.goal_id)) found.set(goal.goal_id, goal.title);
        // Go on only while a Goal is neither named here nor already known; a Goal that left the directory is not looked for page after page.
        if (!listed.next_cursor || wanted.every(id => found.has(id) || known(id) !== undefined)) break;
        cursor = listed.next_cursor;
      }
      for (const id of wanted) {
        if (found.has(id) || known(id) !== undefined) continue;
        const { goal } = await context.services.actions.invoke(GOALS_ACTIONS.contract, { goal_id: id }, control).catch(error => {
          if (ended(error, beforeWrite)) throw error;
          return { goal: null };
        });
        if (goal?.title) found.set(id, goal.title);
      }
    } catch (error) {
      if (ended(error, beforeWrite)) throw error;
    }
    const changed = [...found].filter(([id, title]) => (persist ? context.services?.storage?.get(keyOf(id)) : known(id)) !== title);
    if (!changed.length) return;
    if (persist) await beforeWrite();
    beforeWrite.assert_current();
    for (const [id, title] of changed) {
      if (persist) remember(id, title);
      else memory.set(id, title);
    }
  };
  /** A title already in hand (the Goal the person has just chosen). */
  const remember = (goalId: string, title: string): void => {
    memory.set(goalId, title);
    context.services?.storage?.set(keyOf(goalId), title);
  };
  return { known, read, remember };
}

export type CodingGoalTitles = ReturnType<typeof codingGoalTitles>;
