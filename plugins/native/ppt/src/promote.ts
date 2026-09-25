import type { PptRecord } from "@molis-ai/molis-work-contracts/modules/ppt";
import { PptError } from "./error.js";
import type { PptStore } from "./store.js";
import { isDeepStrictEqual } from "node:util";

export type PptPublicationSnapshot = Pick<PptRecord, "title" | "description" | "color_primary" | "color_background" | "color_text" | "slides">;
export interface PptPublicationIntent { content: PptPublicationSnapshot; version: number; source_version: number; actor_id: string }
export type PptReadArtifactPort = (input: { project_id: string; record_id: string; version: number }) => PptPublicationSnapshot | null;

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

export function promotePpt(
  store: PptStore,
  id: string,
  projectId: string,
  publishArtifact: PptPublishArtifactPort,
  options: { actorId: string; expectedVersion?: number; readArtifact?: PptReadArtifactPort },
): { presentation: PptRecord; artifact: { artifact_id: string; version: number }; recovered: boolean } {
  const current = store.get(id, projectId);
  const version = current.publication_pending?.version ?? current.artifact_version + 1;
  const existing = options.readArtifact?.({ project_id: projectId, record_id: id, version });
  if (current.artifact_version > 0) options.readArtifact?.({ project_id: projectId, record_id: id, version: current.artifact_version });
  const intent = store.beginPublication(id, projectId, options.actorId, options.expectedVersion ?? current.version, existing ?? undefined);
  if (existing && !isDeepStrictEqual(existing, intent.content)) throw new PptError("ppt.publication_conflict", "Artifact 与原发布快照不同，演示稿及快照已保留");
  const published = existing ? { artifact_id: "ppt-" + id, version: intent.version } : publishArtifact({
    project_id: projectId,
    record_id: current.id,
    title: intent.content.title,
    version: intent.version,
    content: intent.content,
  });
  if (published.artifact_id !== "ppt-" + id || published.version !== intent.version) throw new PptError("ppt.publication_conflict", "Artifact 返回身份与发布意图不一致，原快照已保留");
  return {
    presentation: store.completePublication(current.id, projectId, intent, published),
    artifact: published,
    recovered: !!existing || !!current.publication_pending,
  };
}
