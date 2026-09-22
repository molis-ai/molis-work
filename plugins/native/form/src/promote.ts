import type { FormRecord } from "@molis-ai/molis-work-contracts/modules/form";
import { FormError } from "./error.js";
import type { FormStore } from "./store.js";

export interface FormPublishArtifactPort {
  (input: {
    project_id: string;
    record_id: string;
    title: string;
    version: number;
    content: {
      title: string;
      description: string;
      status: FormRecord["status"];
      questions: FormRecord["questions"];
    };
  }): { artifact_id: string; version: number };
}

export function requireFormArtifactPort(
  publishArtifact: FormPublishArtifactPort | undefined,
): FormPublishArtifactPort {
  if (!publishArtifact) throw new FormError("form.unavailable", "当前环境不能发出 Artifact");
  return publishArtifact;
}

export function promoteForm(
  store: FormStore,
  id: string,
  projectId: string,
  publishArtifact: FormPublishArtifactPort,
): { form: FormRecord; artifact: { artifact_id: string; version: number } } {
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
      status: current.status,
      questions: current.questions,
    },
  });
  return {
    form: store.rememberArtifact(current.id, published.artifact_id, published.version, projectId),
    artifact: published,
  };
}
