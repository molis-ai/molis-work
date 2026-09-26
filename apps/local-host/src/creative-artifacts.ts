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
} from "@molis-ai/molis-work-contracts/modules/ppt";
import { DatasetError, datasetManifest, type DatasetPublishArtifactPort, type DatasetReadArtifactPort, type DatasetPublicationSnapshot } from "@molis-ai/molis-work-plugin-dataset";
import { FormError, formManifest, type FormPublishArtifactPort, type FormReadArtifactPort, type FormPublicationSnapshot } from "@molis-ai/molis-work-plugin-form";
import { PptError, pptManifest, type PptPublishArtifactPort, type PptReadArtifactPort, type PptPublicationSnapshot } from "@molis-ai/molis-work-plugin-ppt";
import type { GoalProjectApplication } from "./goal-project-application.js";

function producerOf(manifest: { plugin_id: string; version: string; publisher: { signature: string } }) {
  return {
    plugin_id: manifest.plugin_id,
    plugin_version: manifest.version,
    binding_signature: manifest.publisher.signature,
  };
}

export function registerFormArtifactVersion(
  coordinator: GoalProjectApplication,
  boardId: string,
  expectedProjectId: string,
  actorId: string,
): FormPublishArtifactPort {
  return (input) => {
    if (input.project_id !== expectedProjectId) throw new FormError("form.invalid", "问卷项目与当前项目不一致");
    const result = coordinator.artifacts.commands.registerVersion({
      board_id: boardId,
      actor_id: actorId,
      artifact_id: "form-" + input.record_id,
      version: input.version,
      artifact_type_id: FORM_ARTIFACT_TYPE_ID,
      schema_version: FORM_ARTIFACT_SCHEMA_VERSION,
      producer: producerOf(formManifest),
      content: { kind: "inline", payload: JSON.parse(JSON.stringify(input.content)) },
      metadata: { form_id: input.record_id, title: input.title },
      scope: "personal",
      supersedes_version: input.version > 1 ? input.version - 1 : null,
    });
    return { artifact_id: result.artifact.artifact_id, version: result.artifact.version };
  };
}

export function readFormArtifactVersion(coordinator: GoalProjectApplication, boardId: string, expectedProjectId: string, actorId: string): FormReadArtifactPort {
  return input => {
    if (input.project_id !== expectedProjectId) throw new FormError("form.invalid", "问卷项目与当前项目不一致");
    const artifact = coordinator.artifacts.query.getArtifactVersion(boardId, { artifact_id: "form-" + input.record_id, version: input.version });
    if (!artifact) return null;
    if (artifact.owner_actor_id !== actorId) throw new FormError("form.publication_owner", "此 Artifact 属于其他发起者，不能替换或代为恢复");
    if (artifact.artifact_type_id !== FORM_ARTIFACT_TYPE_ID || artifact.schema_version !== FORM_ARTIFACT_SCHEMA_VERSION
      || artifact.producer_plugin_id !== formManifest.plugin_id || artifact.producer_binding_signature !== formManifest.publisher.signature || artifact.content_kind !== "inline")
      throw new FormError("form.publication_conflict", "Artifact 来源或类型不一致，原记录已保留");
    const payload = artifact.payload as FormPublicationSnapshot | null;
    if (!payload || typeof payload.title !== "string" || typeof payload.description !== "string" || !Array.isArray(payload.questions) || !["draft", "published"].includes(payload.status))
      throw new FormError("form.publication_conflict", "Artifact 问卷内容不完整，原记录已保留");
    return payload;
  };
}

export function registerDatasetArtifactVersion(
  coordinator: GoalProjectApplication,
  boardId: string,
  expectedProjectId: string,
  actorId: string,
): DatasetPublishArtifactPort {
  return (input) => {
    if (input.project_id !== expectedProjectId) throw new DatasetError("dataset.invalid", "数据表项目与当前项目不一致");
    const result = coordinator.artifacts.commands.registerVersion({
      board_id: boardId,
      actor_id: actorId,
      artifact_id: "dataset-" + input.record_id,
      version: input.version,
      artifact_type_id: DATASET_ARTIFACT_TYPE_ID,
      schema_version: DATASET_ARTIFACT_SCHEMA_VERSION,
      producer: producerOf(datasetManifest),
      content: { kind: "inline", payload: JSON.parse(JSON.stringify(input.content)) },
      metadata: { dataset_id: input.record_id, title: input.title },
      scope: "personal",
      supersedes_version: input.version > 1 ? input.version - 1 : null,
    });
    return { artifact_id: result.artifact.artifact_id, version: result.artifact.version };
  };
}

export function readDatasetArtifactVersion(coordinator: GoalProjectApplication, boardId: string, expectedProjectId: string, actorId: string): DatasetReadArtifactPort {
  return input => {
    if (input.project_id !== expectedProjectId) throw new DatasetError("dataset.invalid", "数据表项目与当前项目不一致");
    const artifact = coordinator.artifacts.query.getArtifactVersion(boardId, { artifact_id: "dataset-" + input.record_id, version: input.version });
    if (!artifact) return null;
    if (artifact.owner_actor_id !== actorId) throw new DatasetError("dataset.publication_owner", "此 Artifact 属于其他发起者，不能替换或代为恢复");
    if (artifact.artifact_type_id !== DATASET_ARTIFACT_TYPE_ID || artifact.schema_version !== DATASET_ARTIFACT_SCHEMA_VERSION
      || artifact.producer_plugin_id !== datasetManifest.plugin_id || artifact.producer_binding_signature !== datasetManifest.publisher.signature || artifact.content_kind !== "inline")
      throw new DatasetError("dataset.publication_conflict", "Artifact 来源或类型不一致，原记录已保留");
    const payload = artifact.payload as DatasetPublicationSnapshot | null;
    if (!payload || typeof payload.title !== "string" || typeof payload.description !== "string" || !Array.isArray(payload.columns) || !Array.isArray(payload.rows))
      throw new DatasetError("dataset.publication_conflict", "Artifact 数据表内容不完整，原记录已保留");
    return payload;
  };
}

export function registerPptArtifactVersion(
  coordinator: GoalProjectApplication,
  boardId: string,
  expectedProjectId: string,
  actorId: string,
): PptPublishArtifactPort {
  return (input) => {
    if (input.project_id !== expectedProjectId) throw new PptError("ppt.invalid", "演示稿项目与当前项目不一致");
    const result = coordinator.artifacts.commands.registerVersion({
      board_id: boardId,
      actor_id: actorId,
      artifact_id: "ppt-" + input.record_id,
      version: input.version,
      artifact_type_id: PPT_ARTIFACT_TYPE_ID,
      schema_version: PPT_ARTIFACT_SCHEMA_VERSION,
      producer: producerOf(pptManifest),
      content: { kind: "inline", payload: JSON.parse(JSON.stringify(input.content)) },
      metadata: { presentation_id: input.record_id, title: input.title },
      scope: "personal",
      supersedes_version: input.version > 1 ? input.version - 1 : null,
    });
    return { artifact_id: result.artifact.artifact_id, version: result.artifact.version };
  };
}

export function readPptArtifactVersion(coordinator: GoalProjectApplication, boardId: string, expectedProjectId: string, actorId: string): PptReadArtifactPort {
  return input => {
    if (input.project_id !== expectedProjectId) throw new PptError("ppt.invalid", "演示稿项目与当前项目不一致");
    const artifact = coordinator.artifacts.query.getArtifactVersion(boardId, { artifact_id: "ppt-" + input.record_id, version: input.version });
    if (!artifact) return null;
    if (artifact.owner_actor_id !== actorId) throw new PptError("ppt.publication_owner", "此 Artifact 属于其他发起者，不能替换或代为恢复");
    if (artifact.artifact_type_id !== PPT_ARTIFACT_TYPE_ID || artifact.schema_version !== PPT_ARTIFACT_SCHEMA_VERSION
      || artifact.producer_plugin_id !== pptManifest.plugin_id || artifact.producer_binding_signature !== pptManifest.publisher.signature || artifact.content_kind !== "inline")
      throw new PptError("ppt.publication_conflict", "Artifact 来源或类型不一致，原记录已保留");
    const payload = artifact.payload as PptPublicationSnapshot | null;
    if (!payload || typeof payload.title !== "string" || typeof payload.description !== "string" || !Array.isArray(payload.slides) || typeof payload.color_primary !== "string" || typeof payload.color_background !== "string" || typeof payload.color_text !== "string")
      throw new PptError("ppt.publication_conflict", "Artifact 演示稿内容不完整，原记录已保留");
    return payload;
  };
}
