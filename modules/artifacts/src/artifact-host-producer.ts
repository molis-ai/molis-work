import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { artifactsActions } from "./artifact-actions.js";
import { DOCUMENT_ARTIFACT_TYPE } from "./artifact-document-type.js";
import { ARTIFACTS_PLUGIN_ID, ARTIFACTS_PROVIDER_TITLE } from "./artifact-provider.js";

/**
 * The 成果库 as a producer that is part of the Host: the imported-file type it writes, declared as a Manifest's `artifacts.produces`
 * would be, and the preview action that type names. The Host reads it with the Manifests' declarations (PG-077); the 成果 plugin's
 * Manifest declares none of it.
 */
export const ARTIFACTS_HOST_PRODUCER: {
  readonly plugin_id: string;
  readonly name: string;
  readonly produces: PluginManifest["artifacts"]["produces"];
  readonly actions: readonly ActionDefinition[];
} = {
  plugin_id: ARTIFACTS_PLUGIN_ID, name: ARTIFACTS_PROVIDER_TITLE,
  produces: [{ artifact_type_id: DOCUMENT_ARTIFACT_TYPE, schema_version: 1, title: "导入的文件",
    preview: { capability_id: artifactsActions.preview.capability_id, version: artifactsActions.preview.version } }],
  actions: [artifactsActions.preview],
};
