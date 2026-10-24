import { GOALS_JOURNAL_NAMESPACE } from "@molis-ai/molis-work-contracts/modules/goals";

const strip = (name: string): string => name.slice(GOALS_JOURNAL_NAMESPACE.length);

/**
 * Goals' journal events as Goals reads them (PG-094 S9-2): the project's journal keeps Goals' events under its namespace
 * (`io.molis.work.goals.goal.created`, object type `io.molis.work.goals.goal`) and shows a plugin only its own; what the rest of Goals
 * (history, momentum, decisions) matches on stays the short domain name. This is the one place that knows the namespace on the way out.
 * Events of any other owner are dropped, and an event whose type is Goals' but whose object type is not is dropped too.
 */
export function goalsJournalEvents<T extends { type: string; object_type: string }>(events: readonly T[]): T[] {
  return events.flatMap(event => event.type.startsWith(GOALS_JOURNAL_NAMESPACE) && event.object_type.startsWith(GOALS_JOURNAL_NAMESPACE)
    ? [{ ...event, type: strip(event.type), object_type: strip(event.object_type) }] : []);
}
