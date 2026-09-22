import type { PptRecord } from "@molis-ai/molis-work-contracts/modules/ppt";
import { PptError } from "./error.js";
import type { PptStore } from "./store.js";

export interface PptPublishArtifactPort {
  (input: {
    project_id: string;
    record_id: string;
    title: string;
    version: number;
    content: {
      title: string;
      description: string;
      color_primary: string;
      color_background: string;
      color_text: string;
      slides: PptRecord["slides"];
    };
  }): { artifact_id: string; version: number };
}

export function requirePptArtifactPort(
  publishArtifact: PptPublishArtifactPort | undefined,
): PptPublishArtifactPort {
  if (!publishArtifact) throw new PptError("ppt.unavailable", "当前环境不能发出 Artifact");
  return publishArtifact;
}

export function promotePpt(
  store: PptStore,
  id: string,
  projectId: string,
  publishArtifact: PptPublishArtifactPort,
): { presentation: PptRecord; artifact: { artifact_id: string; version: number } } {
  const current = store.get(id, projectId);
  const version = (current.artifact_version || 0) + 1;
  const published = publishArtifact({
    project_id: projectId,
    record_id: current.id,
    title: current.title,
    version,
    content: {
      title: current.title,
      description: current.description,
      color_primary: current.color_primary,
      color_background: current.color_background,
      color_text: current.color_text,
      slides: current.slides,
    },
  });
  return {
    presentation: store.rememberArtifact(current.id, published.artifact_id, published.version, projectId),
    artifact: published,
  };
}
