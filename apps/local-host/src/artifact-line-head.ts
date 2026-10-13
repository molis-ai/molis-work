import type { ArtifactLineHead } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalProjectApplication } from "./goal-project-application.js";

/**
 * The newest version of one work object's pinned line in a project's 成果库, and the revision of the object it pinned;
 * null when the project holds none. The number comes from the 成果库 itself, which also refuses a version that does not
 * increase, so a pin never asks for one the project already has.
 */
export function artifactLineHead(coordinator: GoalProjectApplication, projectId: string, artifactId: string): ArtifactLineHead | null {
  const latest = coordinator.artifacts.query.latestArtifactVersion(projectId, artifactId);
  if (!latest) return null;
  const revision = latest.origin.kind === "pinned" && /^\d+$/u.test(latest.origin.revision) ? Number(latest.origin.revision) : null;
  return { version: latest.version, source_revision: revision };
}
