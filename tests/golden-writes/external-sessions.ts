import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** external-sessions/external-sessions.db: toggle and restore the project's AI read permit without touching local tool session roots. */
export default async function ({ call, projectId }: GoldenWriteContext) {
  const scope = (await call("sessions.scope.read", { include_counts: false }, { project_owner: true })) as {
    project_ai_reads: Array<{ project: { project_id: string }; revision: number }>;
  };
  const current = scope.project_ai_reads.find(row => row.project.project_id === projectId);
  const rev = current?.revision ?? 0;
  const enabled = await call("sessions.project_ai_read.set", { allowed: true, expected_revision: rev }, { project_owner: true });
  readsBack(enabled, `"allowed":true`);
  const disabled = await call("sessions.project_ai_read.set", { allowed: false, expected_revision: rev + 1 }, { project_owner: true });
  readsBack(disabled, `"allowed":false`);
}
