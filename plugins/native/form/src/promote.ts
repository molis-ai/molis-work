import type { FormRecord } from "@molis-ai/molis-work-contracts/modules/form";
import { FormError } from "./error.js";
import type { FormStore } from "./store.js";
import { isDeepStrictEqual } from "node:util";
import { nextPinnedVersion, type ArtifactLineHead } from "@molis-ai/molis-work-contracts/platform/actions";

export type FormPublicationSnapshot = Pick<FormRecord, "title" | "description" | "status" | "questions">;
export interface FormPublicationIntent { content: FormPublicationSnapshot; version: number; source_version: number; actor_id: string }
export type FormReadArtifactPort = (input: { project_id: string; record_id: string; version: number }) => FormPublicationSnapshot | null;
/** The newest fixed version of this record in the project's 成果库, whatever the record counted. */
export type FormLineHeadPort = (input: { project_id: string; record_id: string }) => ArtifactLineHead | null;

export interface FormPublishArtifactPort {
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
      status: FormRecord["status"];
      questions: FormRecord["questions"];
    };
  }): { artifact_id: string; version: number };
}

export function promoteForm(
  store: FormStore,
  id: string,
  projectId: string,
  publishArtifact: FormPublishArtifactPort,
  options: { actorId: string; expectedVersion?: number; readArtifact?: FormReadArtifactPort; lineHead?: FormLineHeadPort },
): { form: FormRecord; artifact: { artifact_id: string; version: number }; recovered: boolean } {
  const current = store.get(id, projectId);
  const head = options.lineHead?.({ project_id: projectId, record_id: id }) ?? null;
  const version = nextPinnedVersion({ recorded: current.artifact_version, pending: current.publication_pending?.version ?? null, head });
  const existing = options.readArtifact?.({ project_id: projectId, record_id: id, version });
  // Check the newest version already written for this line too, not only the one the record counted: after a move out and
  // back the record counts none, and a version that cannot be continued must be refused before an intent is recorded.
  const written = Math.max(current.artifact_version, head?.version ?? 0);
  if (written > 0) options.readArtifact?.({ project_id: projectId, record_id: id, version: written });
  const intent = store.beginPublication(id, projectId, options.actorId, options.expectedVersion ?? current.version, existing ?? undefined, version);
  if (existing && !isDeepStrictEqual(existing, intent.content)) throw new FormError("form.publication_conflict", "成果与原发布快照不同，问卷及快照已保留");
  const published = existing ? { artifact_id: "form-" + id, version: intent.version } : publishArtifact({
    project_id: projectId,
    record_id: current.id,
    title: intent.content.title,
    version: intent.version,
    source_version: intent.source_version,
    content: intent.content,
  });
  if (published.artifact_id !== "form-" + id || published.version !== intent.version) throw new FormError("form.publication_conflict", "成果返回身份与发布意图不一致，原快照已保留");
  return {
    form: store.completePublication(current.id, projectId, intent, published),
    artifact: published,
    recovered: !!existing || !!current.publication_pending,
  };
}
