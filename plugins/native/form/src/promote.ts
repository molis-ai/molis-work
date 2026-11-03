import type { FormRecord } from "./contract.js";
import { formErrors } from "./error.js";
import type { FormStores } from "./store.js";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
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

/**
 * Pin the form's current revision. Three steps, each its own write: record the intent, pin the version, then record the
 * pin on the form. A pin cut off between them leaves the intent, and the next call recovers it.
 */
export async function promoteForm(
  stores: FormStores,
  caller: ActionExecutionContext,
  id: string,
  projectId: string,
  publishArtifact: FormPublishArtifactPort,
  options: { actorId: string; expectedVersion?: number; readArtifact?: FormReadArtifactPort; lineHead?: FormLineHeadPort; beforePublish?: () => Promise<void> },
): Promise<{ form: FormRecord; artifact: { artifact_id: string; version: number }; recovered: boolean }> {
  const current = stores.read(store => store.get(id, projectId));
  const head = options.lineHead?.({ project_id: projectId, record_id: id }) ?? null;
  const version = nextPinnedVersion({ recorded: current.artifact_version, pending: current.publication_pending?.version ?? null, head });
  const existing = options.readArtifact?.({ project_id: projectId, record_id: id, version });
  // Check the newest version already written for this line too, not only the one the record counted: after a move out and
  // back the record counts none, and a version that cannot be continued must be refused before an intent is recorded.
  const written = Math.max(current.artifact_version, head?.version ?? 0);
  if (written > 0) options.readArtifact?.({ project_id: projectId, record_id: id, version: written });
  const intent = await stores.write(caller, store => store.beginPublication(id, projectId, options.actorId, options.expectedVersion ?? current.version, existing ?? undefined, version));
  if (existing && !isDeepStrictEqual(existing, intent.content)) throw formErrors.publication_conflict("成果与原发布快照不同，问卷及快照已保留");
  if (!existing) await options.beforePublish?.();
  const published = existing ? { artifact_id: "form-" + id, version: intent.version } : publishArtifact({
    project_id: projectId,
    record_id: current.id,
    title: intent.content.title,
    version: intent.version,
    source_version: intent.source_version,
    content: intent.content,
  });
  if (published.artifact_id !== "form-" + id || published.version !== intent.version) throw formErrors.publication_conflict("成果返回身份与发布意图不一致，原快照已保留");
  return {
    form: await stores.write(caller, store => store.completePublication(current.id, projectId, intent, published)),
    artifact: published,
    recovered: !!existing || !!current.publication_pending,
  };
}
