import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { AcceptanceCommitIntents, openAcceptance } from "@molis-ai/molis-work-module-acceptance";
import { projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import { hostLog } from "./host-log.js";
import type { MolisWorkLocalHost } from "./project-host.js";

const STALE_INTENT_MS = 86_400_000;

/**
 * Recovers intent files left by the former separate-commit path. New decisions commit both libraries in one attached transaction;
 * recovery applies the existing exact platform record once, without rerunning the business action.
 */
export async function recoverAcceptanceCommits(host: MolisWorkLocalHost, homeDirectory: string,
  resolveProject: (projectId: string) => Promise<LocalHostProjectReference | null>, projectId?: string): Promise<void> {
  const intents = new AcceptanceCommitIntents(homeDirectory), pending = intents.list(projectId);
  if (!pending.length) return;
  const opened = openAcceptance(homeDirectory);
  try {
    for (const intent of pending) {
      try {
        if (!opened.service.hasDecision(intent.project_id, intent.decision_id)) {
          // Written just before the acceptance commit: wait for the commit. A stale file from a failed acceptance commit is not a decision.
          if (Date.now() - Date.parse(intent.created_at) > STALE_INTENT_MS) intents.remove(intent.decision_id);
          continue;
        }
        const record = JSON.parse(intent.record_json) as ProjectTrustedDecision;
        if (record.decision_id !== intent.decision_id || record.reference?.owner?.project_id !== intent.project_id) continue;
        const project = await resolveProject(intent.project_id);
        if (!project) continue;
        await host.withProject(project, ({ store }) => store.db.transaction(() =>
          projectReviewDecisions(store.db, project.project_id).restore(record)).immediate());
        intents.remove(intent.decision_id);
      } catch (error) { hostLog.warn("acceptance", "commit_intent_recovery_failed", error, { decision_id: intent.decision_id, project_id: intent.project_id }); }
    }
  } finally { opened.close(); }
}
