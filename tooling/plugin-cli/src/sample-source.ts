import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineArtifactPreviewAction } from "@molis-ai/molis-work-plugin-sdk";

/** The 成果 type the sample pins, and the name and preview action every pinned type must declare (specs/artifact-positioning A1/A7). */
export const SAMPLE_ARTIFACT_TYPE_ID = "io.molis.work.example.note";
export function sampleArtifactType(pluginId: string): { artifact_type_id: string; schema_version: number; title: string; preview: { capability_id: string; version: number } } {
  return { artifact_type_id: SAMPLE_ARTIFACT_TYPE_ID, schema_version: 1, title: "Sample result", preview: { capability_id: `${pluginId}.results.preview`, version: 1 } };
}

/** Serialized once into the generated manifest; handlers read these same definitions. */
export function samplePluginActions(pluginId: string): ActionDefinition[] {
  const result = { type: "object", properties: { artifact_id: { type: "string" }, version: { type: "integer", minimum: 1 },
    payload: { type: "object", properties: { title: { type: "string" }, sequence: { type: "integer", minimum: 1 } }, required: ["title", "sequence"], additionalProperties: false } },
    required: ["artifact_id", "version", "payload"], additionalProperties: false };
  const define = (name: string, title: string, description: string, permissions: string[], output_schema: Record<string, unknown>, command = false, external = false, result_view?: ActionDefinition["action"]["result_view"]): ActionDefinition => ({
    capability_id: `${pluginId}.${name}`, version: 1, operation: command ? "command" : "query", action: {
      title, description, kind: command ? "operation" : "query", scope: "project", audiences: external ? ["user", "workflow", "mcp"] : ["user"],
      permissions, subject_kinds: [], input_schema: { type: "object", properties: {}, additionalProperties: false }, output_schema, ...(result_view ? { result_view } : {}),
    },
  });
  const selfCalled = (definition: ActionDefinition): ActionDefinition => ({ ...definition, action: { ...definition.action, audiences: [...definition.action.audiences, "plugin"] } });
  const preview = defineArtifactPreviewAction(`${pluginId}.results.preview`, "sample result", ["artifact:read"]);
  return [
    define("health", "Sample health", "Read the sample connector's health without accessing private results.", [], {
      type: "object", properties: { ok: { type: "boolean" }, status: { enum: ["connected"] }, message: { type: "string" } }, required: ["ok", "status", "message"], additionalProperties: false,
    }, false, true),
    define("results.read", "Read my sample results", "Read the startup owner's private count and latest personal Artifact.", ["storage:private", "artifact:read"], {
      type: "object", properties: { count: { type: "integer", minimum: 0 }, latest: { anyOf: [result, { type: "null" }] } }, required: ["count", "latest"], additionalProperties: false,
    }),
    // The plugin saves a result from its own polling, outside any caller, so it is open to the plugin's own calls too (the `plugin` audience).
    selfCalled(define("results.publish", "Save my sample result", "Publish the next personal Artifact version and update the original private counter.",
      ["storage:private", "artifact:read", "artifact:write"], result, true, false, { summary: "Sample result saved", title_pointer: "/payload/title" })),
    { ...preview, action: { ...preview.action, title: "Preview a sample result", description: "Show one saved version of a sample result as readable text; changes nothing." } },
  ];
}

/** Uses only the packed public SDK, never repository implementation paths. */
export const samplePluginSource = `import { definePlugin, defineAction, definePollingIntegrationPlugin, bindOwnerPluginAction, bindArtifactPreview } from "@molis-ai/molis-work-plugin-sdk";
import manifest from "./manifest.json" with { type: "json" };

export default definePlugin({
  manifest,
  async start(context) {
    const services = context.services;
    if (!services?.storage || !services.actions) throw new Error("This sample requires the Molis Work application Host");
    const storage = services.storage;
    const artifactId = context.install_id + ":sample-result";
    const definition = name => manifest.actions.find(action => action.capability_id === manifest.plugin_id + "." + name);
    const healthAction = definition("health"), readAction = definition("results.read"), publishAction = definition("results.publish"), previewAction = definition("results.preview");
    function savedCount() {
      const value = storage.get("saved-count");
      const count = value === null ? 0 : Number(value);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid saved counter");
      return count;
    }
    function resultAt(version) {
      const result = services.artifacts.read({ artifact_id: artifactId, version });
      if (!result) throw new Error("Published result could not be read");
      return { artifact_id: artifactId, version, payload: result.payload };
    }
    function publishResult() {
      const version = savedCount() + 1;
      services.artifacts.publish({
        artifact_id: artifactId, version, artifact_type_id: "io.molis.work.example.note", schema_version: 1,
        content: { kind: "inline", payload: { title: "Local sample result", sequence: version } },
        // A 成果 says what it pins, what it is called and what its content is.
        origin: { kind: "pinned", subject: { kind: "counter", id: "sample" }, revision: String(version) },
        title: "Local sample result", media_type: "application/json",
      });
      // Publish first: if interrupted before this write, the same version/content can replay safely.
      storage.set("saved-count", String(version));
      return resultAt(version);
    }
    services.ui.register({
      descriptor: {
        contribution_id: manifest.ui.contributions[0],
        kind: "primary-page", label: "Local Plugin Sample", slots: [],
        surfaces: [{ surface_id: "main", target_slot_id: "plugin.main", format: "html" }],
      },
      render() {
        return "<section><h2>Local Plugin Sample</h2><p>Saved results: " + savedCount() + "</p></section>";
      },
    });
    const provider = {
      type: "local-sample",
      async health() { return { ok: true, status: "connected", message: "Local sample is ready" }; },
      async sync() {
        const result = await services.actions.invoke(publishAction, {});
        return { ok: true, mode: "live", cursor: { version: result.version }, items: [{
          externalId: artifactId + "@" + result.version, title: "Local sample result", kind: "update",
          summary: "Saved personal Artifact version " + result.version,
        }] };
      },
    };
    const polling = definePollingIntegrationPlugin({ manifest, createProvider: () => provider });
    return { ...await polling.start(context), actions: [
      defineAction(healthAction, () => provider.health()).handler,
      bindOwnerPluginAction(context, readAction, () => { const count = savedCount(); return { count, latest: count ? resultAt(count) : null }; }),
      bindOwnerPluginAction(context, publishAction, () => publishResult()),
      // The owner's half of the preview the 成果库 and the side panel show: this plugin's own type, as text.
      bindArtifactPreview(previewAction, "io.molis.work.example.note", artifact => ({
        media_type: "text/markdown", text: "# " + artifact.payload.title + "\\n\\nResult " + artifact.payload.sequence + "\\n",
      })),
    ] };
  },
});
`;
