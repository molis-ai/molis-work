import assert from "node:assert/strict";
import test from "node:test";
import type { ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginMaterialsClient, runInPluginAction, type PluginMaterialsDispatch, type PluginMaterialsPort } from "@molis-ai/molis-work-plugin-runtime";

// BL-492: a plugin's `readSource` can be held to a list of exact domains (the reader's side is tested in tests/jelly-source-providers.test.ts).
// The client checks the list's shape before anything is read and hands it to the Host's reader as it is.

const code = (expected: string) => (error: unknown) => (error as { code?: string } | undefined)?.code === expected;

const manifest: PluginManifest = {
  schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.domainsprobe", version: "1.0.0", name: "Domains probe", kind: "app",
  publisher: { publisher_id: "example", signature: "probe-domains" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: ["storage:private", "materials:fetch"].map(permission => ({ permission, required: true, reason: "probe" })),
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
};

test("BL-492 the plugin client passes a checked list to the Host's reader, and nothing leaves on a list it refuses", async () => {
  const dispatches: PluginMaterialsDispatch[] = [];
  const port: PluginMaterialsPort = {
    async extract() { throw new Error("not read"); }, async readDocuments() { throw new Error("not read"); },
    async readSource(url, options) { await options.beforeEffect(); dispatches.push(options); return { text: url, source_url: url, provider: "article", extractor: "probe", coverage: { status: "sufficient", processed_pages: 1, total_pages: 1, issues: [] } }; },
  };
  const client = createPluginMaterialsClient(manifest, port, { install_id: "install-domains", installation_generation: "g1", project_id: null, assertActive() {}, requireGrant() {} });
  const definition: ActionDefinition = { capability_id: "example.domains.read", version: 1, operation: "command", action: {
    title: "read", description: "probe", scope: "home", kind: "operation", subject_kinds: [], audiences: ["user"], permissions: ["materials:fetch"], scheduling: "concurrent",
    input_schema: { type: "object", additionalProperties: false } } };
  const caller = { permissions: ["materials:fetch"], audience: "user", signal: new AbortController().signal, beforeEffect: async () => {} } as ActionExecutionContext;
  const read = (request: Parameters<NonNullable<typeof client.readSource>>[1]) => runInPluginAction({ install_id: "install-domains", installation_generation: "g1", definition, caller }, () => client.readSource!("https://docs.example.com/a", request));
  await read({ allowedDomains: ["docs.example.com", "example.org"] });
  assert.deepEqual(dispatches.at(-1)!.allowedDomains, ["docs.example.com", "example.org"]);
  await read({});
  assert.equal(dispatches.at(-1)!.allowedDomains, undefined, "without a list the Host's reader is not narrowed");
  const before = dispatches.length;
  for (const allowedDomains of [[], "docs.example.com", [1], ["Docs.Example.com"], ["docs.example.com", "docs.example.com"], ["localhost"], ["https://docs.example.com"], ["docs.example.com/path"], ["a.example", ...Array.from({ length: 20 }, (_, i) => `h${i}.example.com`)]]) {
    await assert.rejects(read({ allowedDomains } as never), code("plugin.materials_domains_invalid"), JSON.stringify(allowedDomains).slice(0, 60));
  }
  assert.equal(dispatches.length, before, "no refused list reached the Host's reader");
});
