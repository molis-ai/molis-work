import type { PagesBody, PagesRecord } from "./contract.js";
import { pagesErrors } from "./error.js";
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

/** The store operations publication needs, each its own transaction (the begin must commit before the artifact is written). */
export interface PagesPromoteStore {
  get(id: string, projectId?: string): PagesRecord;
  beginPublication(id: string, projectId: string, actorId: string, goalId?: string, expectedVersion?: number, existing?: PagesPublicationSnapshot, version?: number): PagesPublicationIntent | Promise<PagesPublicationIntent>;
  completePublication(id: string, projectId: string, intent: PagesPublicationIntent, artifact: { artifact_id: string; version: number }): PagesRecord | Promise<PagesRecord>;
}

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

export async function promotePagesDocument(
  store: PagesPromoteStore,
  id: string,
  projectId: string,
  publishArtifact: PagesPublishArtifactPort,
  goalId?: string,
  options: { actorId: string; expectedVersion?: number; readArtifact?: PagesReadArtifactPort; lineHead?: PagesLineHeadPort; beforePublish?: () => Promise<void> } = { actorId: LOCAL_PERSON_ACTOR_ID },
): Promise<{
  document: PagesRecord;
  artifact: { artifact_id: string; version: number };
  recovered: boolean;
}> {
  const current = store.get(id, projectId);
  const head = options.lineHead?.({ project_id: projectId, page_id: id }) ?? null;
  const version = nextPinnedVersion({ recorded: current.artifact_version, pending: current.publication_pending?.version ?? null, head });
  // A pending intent reads its retained version. Without one, nextPinnedVersion chose a new version;
  // a previous head is never reconstructed into a missing publication snapshot.
  const existing = options.readArtifact?.({ project_id: projectId, page_id: id, version });
  // Check the newest version already written for this line too, not only the one the record counted: after a move out and
  // back the record counts none, and a version that cannot be continued must be refused before an intent is recorded.
  const written = Math.max(current.artifact_version, head?.version ?? 0);
  if (written > 0) options.readArtifact?.({ project_id: projectId, page_id: id, version: written });
  const intent = await store.beginPublication(id, projectId, options.actorId, goalId, options.expectedVersion ?? current.version, existing ?? undefined, version);
  if (existing && (existing.title !== intent.title || existing.goal_id !== intent.goal_id || !isDeepStrictEqual(existing.body, intent.body))) {
    throw pagesErrors.publication_conflict("已保存的成果与上次发布快照不同，文稿和原记录均已保留");
  }
  if (!existing) await options.beforePublish?.();
  const published = existing ? { artifact_id: "pages-" + id, version: intent.version }
    : publishArtifact({ project_id: projectId, page_id: id, title: intent.title, body: intent.body, goal_id: intent.goal_id, version: intent.version, source_version: intent.source_version });
  if (published.artifact_id !== "pages-" + id || published.version !== intent.version) throw pagesErrors.publication_conflict("成果返回的身份与本次发布不一致，上次快照已保留");
  return {
    document: await store.completePublication(id, projectId, intent, published),
    artifact: published,
    recovered: !!current.publication_pending || !!existing,
  };
}
