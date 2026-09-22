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
import { datasetManifest, type DatasetPublishArtifactPort } from "@molis-ai/molis-work-plugin-dataset";
import { formManifest, type FormPublishArtifactPort } from "@molis-ai/molis-work-plugin-form";
import { pptManifest, type PptPublishArtifactPort } from "@molis-ai/molis-work-plugin-ppt";
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
): FormPublishArtifactPort {
  return (input) => {
    const result = coordinator.artifacts.commands.registerVersion({
      board_id: boardId,
      actor_id: "web-user",
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

export function registerDatasetArtifactVersion(
  coordinator: GoalProjectApplication,
  boardId: string,
): DatasetPublishArtifactPort {
  return (input) => {
    const result = coordinator.artifacts.commands.registerVersion({
      board_id: boardId,
      actor_id: "web-user",
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

export function registerPptArtifactVersion(
  coordinator: GoalProjectApplication,
  boardId: string,
): PptPublishArtifactPort {
  return (input) => {
    const result = coordinator.artifacts.commands.registerVersion({
      board_id: boardId,
      actor_id: "web-user",
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
