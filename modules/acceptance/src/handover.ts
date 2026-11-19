import type { AcceptanceHandoverSubject } from "@molis-ai/molis-work-contracts/modules/acceptance";
import type { SqliteBaselineDatabase } from "@molis-ai/molis-work-storage";
import { acceptanceView } from "./state.js";
import { AcceptanceStore } from "./store.js";

/**
 * Goals' requirements and acceptance written into the platform's tables, inside the project library's 5→6 upgrade only (contract-design
 * §10.4; CONTRACT-CHANGES 「当前保留机制」, removed once the earliest supported golden already has these tables). The rows come worked out;
 * decisions keep Goals' applied decision as their standing (`goals_v5`). Afterwards every current requirement must read as Goals read it,
 * or the upgrade fails and the library stays as it was (§10.9 question 8).
 */
export function importAcceptanceHandover(db: SqliteBaselineDatabase, projectId: string, subjects: readonly AcceptanceHandoverSubject[]): void {
  const store = new AcceptanceStore(db, projectId);
  for (const handed of subjects) {
    if (store.subjectNo(handed.subject, null) !== null) throw new Error(`acceptance handover: ${handed.subject.subject.id} already has a record`);
    const no = store.subjectNo(handed.subject, { at: handed.created_at })!;
    for (const row of handed.requirements) store.addRequirement(no, row, row.actor_id);
    for (const row of handed.deliveries) store.addDelivery(no, { ...row, summary: null, made_in_session: null, made_in_run: null }, row.actor_id);
    for (const row of handed.checks) store.addCheck(no, { ...row, kind: "engineering" }, { session: row.reporter_session, actor_id: row.actor_id });
    for (const row of handed.decisions) store.addDecision(no, { ...row, origin: "goals_v5" });
    const view = acceptanceView(handed.subject, store.rows(no));
    const read = new Map(view.requirements.map(item => [item.id, item.satisfied]));
    const ids = new Set([...read.keys(), ...Object.keys(handed.satisfied)]);
    for (const id of ids) {
      if (read.get(id) !== handed.satisfied[id]) throw new Error(`acceptance handover: ${handed.subject.subject.id}/${id} reads ${String(read.get(id))} where Goals read ${String(handed.satisfied[id])}`);
    }
  }
}
