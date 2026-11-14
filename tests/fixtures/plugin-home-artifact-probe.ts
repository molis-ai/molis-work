import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { bindActionHandler } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "@molis-ai/molis-work-app-local-host";
import { datasetManifest } from "@molis-ai/molis-work-plugin-dataset";
import { createActionDefinition, objectSchema } from "@molis-ai/molis-work-plugin-sdk";

export const probeAction = createActionDefinition<Record<string, never>, unknown>("dataset.fixture.artifact-join", "command", {
  title: "Fixture pin", description: "Exercises a fixed version through a registered plugin action.", scheduling: "concurrent",
  audiences: ["user"], permissions: ["dataset:read", "dataset:write", "artifact:write"], subject_kinds: ["dataset"],
  input_schema: objectSchema({}), output_schema: objectSchema({ ok: { type: "boolean" } }),
}, 1);

/** The normal project start list opens this exact declared library and dispatches this additional test action. */
export function registerProbe(t: TestContext, body: () => unknown, started: (context: PluginStartContext) => void,
  schema: (sql: string) => string) {
  const registrations = PLATFORM_PLUGIN_REGISTRATIONS as PluginRegistration[];
  const index = registrations.findIndex(entry => entry.project_plugin_id === "dataset");
  const original = registrations[index], runtime = original?.project_runtime;
  assert.ok(original && runtime);
  const base = datasetManifest.databases!.home!;
  const library = { ...base, schema: schema(base.schema), project_rows: { ...base.project_rows!, artifact_join: {
    table: "datasets", id_column: "id", version_column: "version", artifact_id_column: "artifact_id", artifact_version_column: "artifact_version",
    write_columns: ["updated_at"], pending_column: "publication_pending_json",
  } } };
  const manifest = { ...datasetManifest, databases: { ...datasetManifest.databases, home: library }, actions: [...datasetManifest.actions ?? [], probeAction] };
  registrations[index] = { ...original, manifest, project_runtime: { ...runtime, create() {
    const definition = runtime.create();
    return { ...definition, manifest, async start(context) {
      const contribution = await definition.start(context);
      assert.equal(contribution.kind, "app");
      started(context);
      return { ...contribution, actions: [...contribution.actions ?? [], bindActionHandler(probeAction, body)] };
    } };
  } } };
  t.after(() => { registrations[index] = original; });
  return manifest;
}
