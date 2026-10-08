import type { PptRecord } from "@molis-ai/molis-work-contracts/modules/ppt";
import { PptError } from "./error.js";
import type { PptStore } from "./store.js";
import { isDeepStrictEqual } from "node:util";
import { nextPinnedVersion, type ArtifactLineHead } from "@molis-ai/molis-work-contracts/platform/actions";

export type PptPublicationSnapshot = Pick<PptRecord, "title" | "description" | "color_primary" | "color_background" | "color_text" | "slides">;
export interface PptPublicationIntent { content: PptPublicationSnapshot; version: number; source_version: number; actor_id: string }
export type PptReadArtifactPort = (input: { project_id: string; record_id: string; version: number }) => PptPublicationSnapshot | null;
/** The newest fixed version of this record in the project's 成果库, whatever the record counted. */
export type PptLineHeadPort = (input: { project_id: string; record_id: string }) => ArtifactLineHead | null;

export interface PptPublishArtifactPort {
  (input: {
    project_id: string;
    record_id: string;
    title: string;
    version: number;
    /** The record revision this version pins (artifact-positioning A1). */
    source_version: number;
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
  options: { actorId: string; expectedVersion?: number; readArtifact?: PptReadArtifactPort; lineHead?: PptLineHeadPort },
): { presentation: PptRecord; artifact: { artifact_id: string; version: number }; recovered: boolean } {
  const current = store.get(id, projectId);
  const version = nextPinnedVersion({ recorded: current.artifact_version, pending: current.publication_pending?.version ?? null,
    head: options.lineHead?.({ project_id: projectId, record_id: id }) ?? null });
  const existing = options.readArtifact?.({ project_id: projectId, record_id: id, version });
  if (current.artifact_version > 0) options.readArtifact?.({ project_id: projectId, record_id: id, version: current.artifact_version });
  const intent = store.beginPublication(id, projectId, options.actorId, options.expectedVersion ?? current.version, existing ?? undefined, version);
  if (existing && !isDeepStrictEqual(existing, intent.content)) throw new PptError("ppt.publication_conflict", "成果与原发布快照不同，演示稿及快照已保留");
  const published = existing ? { artifact_id: "ppt-" + id, version: intent.version } : publishArtifact({
    project_id: projectId,
    record_id: current.id,
    title: intent.content.title,
    version: intent.version,
    source_version: intent.source_version,
    content: intent.content,
  });
  if (published.artifact_id !== "ppt-" + id || published.version !== intent.version) throw new PptError("ppt.publication_conflict", "成果返回身份与发布意图不一致，原快照已保留");
  return {
    presentation: store.completePublication(current.id, projectId, intent, published),
    artifact: published,
    recovered: !!existing || !!current.publication_pending,
  };
}
