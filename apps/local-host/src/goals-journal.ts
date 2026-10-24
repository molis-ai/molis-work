import { GOALS_JOURNAL_NAMESPACE } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsJournal } from "@molis-ai/molis-work-module-goals";
import type { GovernanceJournal } from "@molis-ai/molis-work-module-governance-collaboration";
import type { LocalSqliteJournal } from "@molis-ai/molis-work-storage";

/**
 * The project's journal as Goals and Governance reach it (PG-094 S9-1, S9-2): the storage's own methods, except that the cursor is
 * where Goals' own events end (`GOALS_JOURNAL_NAMESPACE`), as it is for a plugin on `services.project_database.journal`. Another
 * plugin's event, or the platform's, does not move it, and a cursor the page hands back is Goals' own too.
 */
export function goalsJournal(journal: LocalSqliteJournal): GoalsJournal & GovernanceJournal {
  return {
    eventCursor: projectId => goalsEventCursor(journal, projectId),
    appendEvent: input => journal.appendEvent(input),
    getIdempotency: (projectId, actorId, operation, key) => journal.getIdempotency(projectId, actorId, operation, key),
    putIdempotency: input => journal.putIdempotency(input),
  };
}

export const goalsEventCursor = (journal: LocalSqliteJournal, projectId: string): number =>
  journal.eventCursor(projectId, undefined, GOALS_JOURNAL_NAMESPACE);
