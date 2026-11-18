import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { AcceptanceCommitIntents, openAcceptance } from "@molis-ai/molis-work-module-acceptance";
import { projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import { hostLog } from "./host-log.js";
import type { MolisWorkLocalHost } from "./project-host.js";

const STALE_INTENT_MS = 86_400_000;

/**
 * The acceptance rows commit in `acceptance.db`, the platform record in the project library. The acceptance transaction also keeps
 * the exact platform record until the project commit succeeds. A crash or a failed project commit can therefore leave that record
 * behind; on the next Host start / acceptance read this applies it once, idempotently, before anyone reads the acceptance state.
 */
export async function recoverAcceptanceCommits(host: MolisWorkLocalHost, homeDirectory: string,
  resolveProject: (projectId: string) => Promise<LocalHostProjectReference | null>, projectId?: string): Promise<void> {
  const pending = new AcceptanceCommitIntents(homeDirectory).list(projectId);
  if (!pending.length) return;
  const opened = openAcceptance(homeDirectory);
  try {
    for (const intent of pending) {
      try {
        if (!opened.service.hasDecision(intent.project_id, intent.decision_id)) {
          // Written just before the acceptance commit: wait for the commit. A stale file from a failed acceptance commit is not a decision.
          if (Date.now() - Date.parse(intent.created_at) > STALE_INTENT_MS) opened.service.completeCommitIntent(intent.decision_id);
          continue;
        }
        const record = JSON.parse(intent.record_json) as ProjectTrustedDecision;
        if (record.decision_id !== intent.decision_id || record.reference?.owner?.project_id !== intent.project_id) continue;
        const project = await resolveProject(intent.project_id);
        if (!project) continue;
        await host.withProject(project, ({ store }) => store.db.transaction(() =>
          projectReviewDecisions(store.db, project.project_id).restore(record)).immediate());
        opened.service.completeCommitIntent(intent.decision_id);
      } catch (error) { hostLog.warn("acceptance", "commit_intent_recovery_failed", error, { decision_id: intent.decision_id, project_id: intent.project_id }); }
    }
  } finally { opened.close(); }
}
