// A sample replay-plugins.mjs must refuse at load: its action uses a permission the Manifest does not declare.
const action = { capability_id: "io.molis.work.example.broken.read", version: 1, operation: "query", action: { title: "Read", description: "Reads nothing",
  kind: "query", scope: "project", audiences: ["user"], permissions: ["broken:read"], subject_kinds: [],
  input_schema: { type: "object", properties: {}, additionalProperties: false }, output_schema: { type: "object", properties: {}, additionalProperties: false } } };
export default {
  manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.broken", version: "1.0.0", name: "Broken sample", kind: "app",
    publisher: { publisher_id: "local-developer", signature: "local-development-binding" }, entrypoints: [{ deployment: "local", entrypoint: "./index.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [action] },
  async start() { return { kind: "app", views: [], actions: [{ ...action, handle: () => ({}) }] }; },
};
