import type { PagesBody } from "@molis-ai/molis-work-contracts/modules/pages";
import { PagesError } from "./error.js";
import type { PagesStore } from "./store.js";

export interface PagesPublishArtifactPort {
  (input: {
    project_id: string;
    page_id: string;
    title: string;
    body: PagesBody;
    goal_id: string;
    version: number;
  }): { artifact_id: string; version: number };
}

export function requirePromoteArtifactPort(
  publishArtifact: PagesPublishArtifactPort | undefined,
): PagesPublishArtifactPort {
  if (!publishArtifact) {
    throw new PagesError("pages.unavailable", "当前环境不能发出 Artifact");
  }
  return publishArtifact;
}

export function promotePagesDocument(
  store: PagesStore,
  id: string,
  projectId: string,
  publishArtifact: PagesPublishArtifactPort,
  goalId?: string,
): {
  document: ReturnType<PagesStore["get"]>;
  artifact: { artifact_id: string; version: number };
} {
  const current = store.get(id, projectId);
  const goal_id = goalId ?? current.goal_id;
  const published = publishArtifact({
    project_id: projectId,
    page_id: current.id,
    title: current.title,
    body: current.body,
    goal_id,
    version: (current.artifact_version || 0) + 1,
  });
  return {
    document: store.update(current.id, {
      goal_id,
      artifact_id: published.artifact_id,
      artifact_version: published.version,
    }, projectId),
    artifact: published,
  };
}
