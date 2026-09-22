import type { DatasetRecord } from "@molis-ai/molis-work-contracts/modules/dataset";
import { DatasetError } from "./error.js";
import type { DatasetStore } from "./store.js";

export interface DatasetPublishArtifactPort {
  (input: {
    project_id: string;
    record_id: string;
    title: string;
    version: number;
    content: {
      title: string;
      description: string;
      columns: DatasetRecord["columns"];
      rows: DatasetRecord["rows"];
    };
  }): { artifact_id: string; version: number };
}

export function requireDatasetArtifactPort(
  publishArtifact: DatasetPublishArtifactPort | undefined,
): DatasetPublishArtifactPort {
  if (!publishArtifact) throw new DatasetError("dataset.unavailable", "当前环境不能发出 Artifact");
  return publishArtifact;
}

export function promoteDataset(
  store: DatasetStore,
  id: string,
  projectId: string,
  publishArtifact: DatasetPublishArtifactPort,
): { dataset: DatasetRecord; artifact: { artifact_id: string; version: number } } {
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
      columns: current.columns,
      rows: current.rows,
    },
  });
  return {
    dataset: store.rememberArtifact(current.id, published.artifact_id, published.version, projectId),
    artifact: published,
  };
}
