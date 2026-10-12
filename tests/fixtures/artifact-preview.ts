import { bindArtifactPreview, defineArtifactPreviewAction } from "@molis-ai/molis-work-plugin-sdk";
import type { ActionDefinition, ActionHandlerBinding } from "@molis-ai/molis-work-plugin-sdk";

/** What a Manifest that produces a 成果 type has to carry for it: the entry for `artifacts.produces`, the preview action and its handler. */
export interface ArtifactPreviewFixture {
  /** One `artifacts.produces` entry with its display name and preview reference. */
  readonly type: { artifact_type_id: string; schema_version: number; title: string; preview: { capability_id: string; version: number } };
  /** The preview action, for the Manifest's `actions`. */
  readonly definition: ActionDefinition;
  /** The owner's half of the preview, for the plugin's `actions`: Runtime wants every declared action to have a handler. */
  readonly handler: ActionHandlerBinding;
}

/**
 * A 成果 type as a Manifest must now declare it (specs/artifact-positioning A1/A7): named, with a preview action of its own
 * plugin (one per type, so a plugin with several types calls this once for each). The preview shows the version's title;
 * fixtures that test something else about the 成果 do not care what it shows.
 */
export function artifactPreview(pluginId: string, artifactTypeId = "example.note", title = "示例笔记"): ArtifactPreviewFixture {
  const definition = defineArtifactPreviewAction(`${pluginId}.${artifactTypeId}.preview`, title, []);
  return {
    type: { artifact_type_id: artifactTypeId, schema_version: 1, title, preview: { capability_id: definition.capability_id, version: definition.version } },
    definition,
    handler: bindArtifactPreview(definition, artifactTypeId, artifact => ({ media_type: "text/plain", text: artifact.title })),
  };
}
