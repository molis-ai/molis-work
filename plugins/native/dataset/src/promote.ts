import type { DatasetRecord } from "@molis-ai/molis-work-contracts/modules/dataset";
import { DatasetError } from "./error.js";
import type { DatasetStore } from "./store.js";
import { isDeepStrictEqual } from "node:util";

export type DatasetPublicationSnapshot = Pick<DatasetRecord, "title" | "description" | "columns" | "rows">;
export interface DatasetPublicationIntent { content: DatasetPublicationSnapshot; version: number; source_version: number; actor_id: string }
export type DatasetReadArtifactPort = (input: { project_id: string; record_id: string; version: number }) => DatasetPublicationSnapshot | null;

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

export function promoteDataset(
  store: DatasetStore,
  id: string,
  projectId: string,
  publishArtifact: DatasetPublishArtifactPort,
  options: { actorId: string; expectedVersion?: number; readArtifact?: DatasetReadArtifactPort },
): { dataset: DatasetRecord; artifact: { artifact_id: string; version: number }; recovered: boolean } {
  const current = store.get(id, projectId);
  const version = current.publication_pending?.version ?? current.artifact_version + 1;
  const existing = options.readArtifact?.({ project_id: projectId, record_id: id, version });
  if (current.artifact_version > 0) options.readArtifact?.({ project_id: projectId, record_id: id, version: current.artifact_version });
  const intent = store.beginPublication(id, projectId, options.actorId, options.expectedVersion ?? current.version, existing ?? undefined);
  if (existing && !isDeepStrictEqual(existing, intent.content)) throw new DatasetError("dataset.publication_conflict", "Artifact 与原发布快照不同，数据表及快照已保留");
  const published = existing ? { artifact_id: "dataset-" + id, version: intent.version } : publishArtifact({
    project_id: projectId,
    record_id: current.id,
    title: intent.content.title,
    version: intent.version,
    content: intent.content,
  });
  if (published.artifact_id !== "dataset-" + id || published.version !== intent.version) throw new DatasetError("dataset.publication_conflict", "Artifact 返回身份与发布意图不一致，原快照已保留");
  return {
    dataset: store.completePublication(current.id, projectId, intent, published),
    artifact: published,
    recovered: !!existing || !!current.publication_pending,
  };
}
