import { ReviewDecisionStore } from "@molis-ai/molis-work-service-agent-host";

/** Deterministic CAS failures for owner integration tests; Node durability is covered separately. */
export function reviewDecisionStorage() {
  const records = new Map<string, unknown>();
  const faults: { afterCommit?: () => void; beforeRead?: () => void } = {};
  const store = new ReviewDecisionStore({
    async read(id) { faults.beforeRead?.(); return structuredClone(records.get(id)); },
    async create(id, value, control) {
      await control.beforeEffect(); control.assertCurrent();
      if (records.has(id)) throw new Error("decision CAS conflict");
      records.set(id, structuredClone(value)); faults.afterCommit?.();
    },
    async withControl(control, operation) { await control.beforeEffect(); control.assertCurrent(); return operation(); },
  });
  return { store, faults, records };
}
