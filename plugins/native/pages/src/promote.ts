import type { PagesBody } from "@molis-ai/molis-work-contracts/modules/pages";
import type { PagesStore } from "./store.js";
import { PagesError } from "./error.js";
import { isDeepStrictEqual } from "node:util";
import { LOCAL_PERSON_ACTOR_ID, nextPinnedVersion, type ArtifactLineHead } from "@molis-ai/molis-work-contracts/platform/actions";

export interface PagesPublicationSnapshot { title: string; body: PagesBody; goal_id: string }
export interface PagesPublicationIntent extends PagesPublicationSnapshot {
  version: number;
  source_version: number;
  original_goal_id: string;
  actor_id: string;
}
export type PagesReadArtifactPort = (input: { project_id: string; page_id: string; version: number }) => PagesPublicationSnapshot | null;
/** The newest fixed version of this document in the project's 成果库, whatever the record counted. */
export type PagesLineHeadPort = (input: { project_id: string; page_id: string }) => ArtifactLineHead | null;

export interface PagesPublishArtifactPort {
  (input: {
    project_id: string;
    page_id: string;
    title: string;
    body: PagesBody;
    goal_id: string;
    version: number;
    /** The document revision this version pins (artifact-positioning A1). */
    source_version: number;
  }): { artifact_id: string; version: number };
}

export function promotePagesDocument(
  store: PagesStore,
  id: string,
  projectId: string,
  publishArtifact: PagesPublishArtifactPort,
  goalId?: string,
  options: { actorId: string; expectedVersion?: number; readArtifact?: PagesReadArtifactPort; lineHead?: PagesLineHeadPort } = { actorId: LOCAL_PERSON_ACTOR_ID },
): {
  document: ReturnType<PagesStore["get"]>;
  artifact: { artifact_id: string; version: number };
  recovered: boolean;
} {
  const current = store.get(id, projectId);
  const head = options.lineHead?.({ project_id: projectId, page_id: id }) ?? null;
  const version = nextPinnedVersion({ recorded: current.artifact_version, pending: current.publication_pending?.version ?? null, head });
  // Read the version already written before recording a new intent. This also repairs
  // old interrupted publications that predate the durable snapshot column.
  const existing = options.readArtifact?.({ project_id: projectId, page_id: id, version });
  // Check the newest version already written for this line too, not only the one the record counted: after a move out and
  // back the record counts none, and a version that cannot be continued must be refused before an intent is recorded.
  const written = Math.max(current.artifact_version, head?.version ?? 0);
  if (written > 0) options.readArtifact?.({ project_id: projectId, page_id: id, version: written });
  const intent = store.beginPublication(id, projectId, options.actorId, goalId, options.expectedVersion ?? current.version, existing ?? undefined, version);
  if (existing && (existing.title !== intent.title || existing.goal_id !== intent.goal_id || !isDeepStrictEqual(existing.body, intent.body))) {
    throw new PagesError("pages.publication_conflict", "已保存的成果与上次发布快照不同，文稿和原记录均已保留");
  }
  const published = existing ? { artifact_id: "pages-" + id, version: intent.version }
    : publishArtifact({ project_id: projectId, page_id: id, title: intent.title, body: intent.body, goal_id: intent.goal_id, version: intent.version, source_version: intent.source_version });
  if (published.artifact_id !== "pages-" + id || published.version !== intent.version) throw new PagesError("pages.publication_conflict", "成果返回的身份与本次发布不一致，上次快照已保留");
  return {
    document: store.completePublication(id, projectId, intent, published),
    artifact: published,
    recovered: !!current.publication_pending || !!existing,
  };
}
