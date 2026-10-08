import {
  DATASET_ARTIFACT_SCHEMA_VERSION,
  DATASET_ARTIFACT_TYPE_ID,
} from "@molis-ai/molis-work-contracts/modules/dataset";
import {
  FORM_ARTIFACT_SCHEMA_VERSION,
  FORM_ARTIFACT_TYPE_ID,
} from "@molis-ai/molis-work-contracts/modules/form";
import {
  PPT_ARTIFACT_SCHEMA_VERSION,
  PPT_ARTIFACT_TYPE_ID,
  PPT_SUBJECT_KIND,
} from "@molis-ai/molis-work-contracts/modules/ppt";
import { DatasetError, datasetManifest, type DatasetLineHeadPort, type DatasetPublishArtifactPort, type DatasetReadArtifactPort, type DatasetPublicationSnapshot } from "@molis-ai/molis-work-plugin-dataset";
import { FormError, formManifest, type FormLineHeadPort, type FormPublishArtifactPort, type FormReadArtifactPort, type FormPublicationSnapshot } from "@molis-ai/molis-work-plugin-form";
import { PptError, pptManifest, type PptLineHeadPort, type PptPublishArtifactPort, type PptReadArtifactPort, type PptPublicationSnapshot } from "@molis-ai/molis-work-plugin-ppt";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalProjectApplication } from "./goal-project-application.js";
import { artifactLineHead } from "./artifact-line-head.js";

// A pinned record belongs to the person: whoever pinned it (`actorId`) is its producer, kept as `created_by`, and the
// read ports below read it whoever that was.
function producerOf(manifest: { plugin_id: string; version: string; publisher: { signature: string } }) {
  return {
    plugin_id: manifest.plugin_id,
    plugin_version: manifest.version,
    binding_signature: manifest.publisher.signature,
  };
}

/** What the project's 成果库 holds of this record's line, for numbering its next pin. */
export function formArtifactLineHead(coordinator: GoalProjectApplication, projectId: string, expectedProjectId: string): FormLineHeadPort {
  return input => {
    if (input.project_id !== expectedProjectId) throw new FormError("form.invalid", "问卷项目与当前项目不一致");
    return artifactLineHead(coordinator, projectId, "form-" + input.record_id);
  };
}

export function datasetArtifactLineHead(coordinator: GoalProjectApplication, projectId: string, expectedProjectId: string): DatasetLineHeadPort {
  return input => {
    if (input.project_id !== expectedProjectId) throw new DatasetError("dataset.invalid", "数据表项目与当前项目不一致");
    return artifactLineHead(coordinator, projectId, "dataset-" + input.record_id);
  };
}

export function pptArtifactLineHead(coordinator: GoalProjectApplication, projectId: string, expectedProjectId: string): PptLineHeadPort {
  return input => {
    if (input.project_id !== expectedProjectId) throw new PptError("ppt.invalid", "演示稿项目与当前项目不一致");
    return artifactLineHead(coordinator, projectId, "ppt-" + input.record_id);
  };
}

export function registerFormArtifactVersion(
  coordinator: GoalProjectApplication,
  projectId: string,
  expectedProjectId: string,
  actorId: string,
): FormPublishArtifactPort {
  return (input) => {
    if (input.project_id !== expectedProjectId) throw new FormError("form.invalid", "问卷项目与当前项目不一致");
    const result = coordinator.artifacts.commands.registerVersion({
      project_id: projectId,
      actor_id: actorId,
      owner_actor_id: LOCAL_PERSON_ACTOR_ID,
      artifact_id: "form-" + input.record_id,
      version: input.version,
      artifact_type_id: FORM_ARTIFACT_TYPE_ID,
      schema_version: FORM_ARTIFACT_SCHEMA_VERSION,
      producer: producerOf(formManifest),
      content: { kind: "inline", payload: JSON.parse(JSON.stringify(input.content)) },
      metadata: { form_id: input.record_id, title: input.title },
      // A pinned revision of the form (artifact-positioning A1); the content is the form's JSON snapshot.
      origin: { kind: "pinned", subject: { kind: "form", id: input.record_id }, revision: String(input.source_version) },
      title: input.title, media_type: "application/json",
      scope: "personal",
      supersedes_version: input.version > 1 ? input.version - 1 : null,
    });
    return { artifact_id: result.artifact.artifact_id, version: result.artifact.version };
  };
}

export function readFormArtifactVersion(coordinator: GoalProjectApplication, projectId: string, expectedProjectId: string): FormReadArtifactPort {
  return input => {
    if (input.project_id !== expectedProjectId) throw new FormError("form.invalid", "问卷项目与当前项目不一致");
    const artifact = coordinator.artifacts.query.getArtifactVersion(projectId, { artifact_id: "form-" + input.record_id, version: input.version });
    if (!artifact) return null;
    if (artifact.artifact_type_id !== FORM_ARTIFACT_TYPE_ID || artifact.schema_version !== FORM_ARTIFACT_SCHEMA_VERSION
      || artifact.producer_plugin_id !== formManifest.plugin_id || artifact.producer_binding_signature !== formManifest.publisher.signature || artifact.content_kind !== "inline")
      throw new FormError("form.publication_conflict", "成果来源或类型不一致，原记录已保留");
    const payload = artifact.payload as FormPublicationSnapshot | null;
    if (!payload || typeof payload.title !== "string" || typeof payload.description !== "string" || !Array.isArray(payload.questions) || !["draft", "published"].includes(payload.status))
      throw new FormError("form.publication_conflict", "成果问卷内容不完整，原记录已保留");
    return payload;
  };
}

export function registerDatasetArtifactVersion(
  coordinator: GoalProjectApplication,
  projectId: string,
  expectedProjectId: string,
  actorId: string,
): DatasetPublishArtifactPort {
  return (input) => {
    if (input.project_id !== expectedProjectId) throw new DatasetError("dataset.invalid", "数据表项目与当前项目不一致");
    const result = coordinator.artifacts.commands.registerVersion({
      project_id: projectId,
      actor_id: actorId,
      owner_actor_id: LOCAL_PERSON_ACTOR_ID,
      artifact_id: "dataset-" + input.record_id,
      version: input.version,
      artifact_type_id: DATASET_ARTIFACT_TYPE_ID,
      schema_version: DATASET_ARTIFACT_SCHEMA_VERSION,
      producer: producerOf(datasetManifest),
      content: { kind: "inline", payload: JSON.parse(JSON.stringify(input.content)) },
      metadata: { dataset_id: input.record_id, title: input.title },
      // A pinned revision of the dataset (artifact-positioning A1); the content is the dataset's JSON snapshot.
      origin: { kind: "pinned", subject: { kind: "dataset", id: input.record_id }, revision: String(input.source_version) },
      title: input.title, media_type: "application/json",
      scope: "personal",
      supersedes_version: input.version > 1 ? input.version - 1 : null,
    });
    return { artifact_id: result.artifact.artifact_id, version: result.artifact.version };
  };
}

export function readDatasetArtifactVersion(coordinator: GoalProjectApplication, projectId: string, expectedProjectId: string): DatasetReadArtifactPort {
  return input => {
    if (input.project_id !== expectedProjectId) throw new DatasetError("dataset.invalid", "数据表项目与当前项目不一致");
    const artifact = coordinator.artifacts.query.getArtifactVersion(projectId, { artifact_id: "dataset-" + input.record_id, version: input.version });
    if (!artifact) return null;
    if (artifact.artifact_type_id !== DATASET_ARTIFACT_TYPE_ID || artifact.schema_version !== DATASET_ARTIFACT_SCHEMA_VERSION
      || artifact.producer_plugin_id !== datasetManifest.plugin_id || artifact.producer_binding_signature !== datasetManifest.publisher.signature || artifact.content_kind !== "inline")
      throw new DatasetError("dataset.publication_conflict", "成果来源或类型不一致，原记录已保留");
    const payload = artifact.payload as DatasetPublicationSnapshot | null;
    if (!payload || typeof payload.title !== "string" || typeof payload.description !== "string" || !Array.isArray(payload.columns) || !Array.isArray(payload.rows))
      throw new DatasetError("dataset.publication_conflict", "成果数据表内容不完整，原记录已保留");
    return payload;
  };
}

export function registerPptArtifactVersion(
  coordinator: GoalProjectApplication,
  projectId: string,
  expectedProjectId: string,
  actorId: string,
): PptPublishArtifactPort {
  return (input) => {
    if (input.project_id !== expectedProjectId) throw new PptError("ppt.invalid", "演示稿项目与当前项目不一致");
    const result = coordinator.artifacts.commands.registerVersion({
      project_id: projectId,
      actor_id: actorId,
      owner_actor_id: LOCAL_PERSON_ACTOR_ID,
      artifact_id: "ppt-" + input.record_id,
      version: input.version,
      artifact_type_id: PPT_ARTIFACT_TYPE_ID,
      schema_version: PPT_ARTIFACT_SCHEMA_VERSION,
      producer: producerOf(pptManifest),
      content: { kind: "inline", payload: JSON.parse(JSON.stringify(input.content)) },
      metadata: { presentation_id: input.record_id, title: input.title },
      // A pinned revision of the presentation (artifact-positioning A1); the content is the presentation's JSON snapshot.
      origin: { kind: "pinned", subject: { kind: PPT_SUBJECT_KIND, id: input.record_id }, revision: String(input.source_version) },
      title: input.title, media_type: "application/json",
      scope: "personal",
      supersedes_version: input.version > 1 ? input.version - 1 : null,
    });
    return { artifact_id: result.artifact.artifact_id, version: result.artifact.version };
  };
}

export function readPptArtifactVersion(coordinator: GoalProjectApplication, projectId: string, expectedProjectId: string): PptReadArtifactPort {
  return input => {
    if (input.project_id !== expectedProjectId) throw new PptError("ppt.invalid", "演示稿项目与当前项目不一致");
    const artifact = coordinator.artifacts.query.getArtifactVersion(projectId, { artifact_id: "ppt-" + input.record_id, version: input.version });
    if (!artifact) return null;
    if (artifact.artifact_type_id !== PPT_ARTIFACT_TYPE_ID || artifact.schema_version !== PPT_ARTIFACT_SCHEMA_VERSION
      || artifact.producer_plugin_id !== pptManifest.plugin_id || artifact.producer_binding_signature !== pptManifest.publisher.signature || artifact.content_kind !== "inline")
      throw new PptError("ppt.publication_conflict", "成果来源或类型不一致，原记录已保留");
    const payload = artifact.payload as PptPublicationSnapshot | null;
    if (!payload || typeof payload.title !== "string" || typeof payload.description !== "string" || !Array.isArray(payload.slides) || typeof payload.color_primary !== "string" || typeof payload.color_background !== "string" || typeof payload.color_text !== "string")
      throw new PptError("ppt.publication_conflict", "成果演示稿内容不完整，原记录已保留");
    return payload;
  };
}
