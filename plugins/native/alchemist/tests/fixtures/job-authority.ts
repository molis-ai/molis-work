import type { JobAcceptance, LocalWorker } from "../../src/studio/server/jobs/local-worker.js";

/** Unit-test authority double; transport tests use the real Kernel and Host entrypoints. */
export function jobAuthority(): JobAcceptance & { revoke(): void } {
  let current = true;
  const assertCurrent = () => { if (!current) throw new Error("actions.forbidden"); };
  return { authority: Object.assign(async () => { assertCurrent(); }, { assertCurrent }), actorId: "actor-local",
    exploration: { modelId: "fixture", taste: [] }, revoke: () => { current = false; } };
}
export function acceptTestJob(worker: LocalWorker, jobId: string) { const accepted = jobAuthority(); worker.accept(jobId, accepted); return accepted; }
