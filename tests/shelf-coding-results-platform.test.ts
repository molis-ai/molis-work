import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import test from "node:test";
import { PluginHostExecutor } from "@molis-ai/molis-work-app-local-host";
import { codingResultDocument } from "@molis-ai/molis-work-contracts/modules/coding";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { shelfManifest } from "@molis-ai/molis-work-plugin-shelf";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import type { PluginActionClient, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { openTestHome, type TestHome, type TestProject } from "./fixtures/test-home.js";

/**
 * What the real platform lets Shelf have of Coding's text: the project's own action directory, the Manifest's `consumes` and the plugin's
 * grant decide, and nothing else (specs/coding-plugin 验收 W5-01-CODING-13..14). The consumers below are fixtures that declare what Shelf declares.
 */

const REPORT = { artifact_id: "coding-report:session-a:run-1", version: 1 };
const BODY = "## 完整原文\r\n含 ``` 与 <script>。\n最后一行🌲";
const OWNER = "web-user";
const shelfPermission = shelfManifest.permissions.filter(row => row.permission === "artifact:read");
const refused = (code: string) => (error: unknown) => { assert.equal((error as { code?: string }).code, code); return true; };

async function seed(home: TestHome, project: TestProject) {
  await home.host.withProject(project.reference, owner => {
    owner.artifacts.commands.registerVersion({ ...pinnedArtifact("已固定的原报告"), project_id: project.project_id, actor_id: OWNER, ...REPORT,
      artifact_type_id: "coding.report.v1", schema_version: 1,
      producer: { plugin_id: "io.molis.work.coding", plugin_version: "1.20.0", binding_signature: "official-coding-binding" },
      content: { kind: "inline", payload: { title: "已固定的原报告", run_id: "run-1", source: { session_id: "session-a" }, body_markdown: BODY } } });
  });
}

/** A plugin installed in the project through the real executor, with the declaration and grants given, and the action client the platform bound for it. */
async function consumer(t: Parameters<typeof openTestHome>[0], home: TestHome, project: TestProject,
  declared: { name: string; consumes: readonly string[]; permissions: typeof shelfPermission; grants: readonly string[] }): Promise<PluginActionClient> {
  let client: PluginActionClient | undefined;
  const actions = { registry: home.host.actionRegistry(project.reference), client: home.host.actionClient(project.reference), project_id: project.project_id };
  const runtime = await home.host.withProject(project.reference, owner => new PluginRuntime(undefined, new PluginHostExecutor({ actions,
    project_id: project.project_id, actor_id: OWNER, artifacts: owner.artifacts, processItems: owner.processItems,
    ui: new UiHost(), privateStorageFor: () => { throw new Error("This consumer declares no private storage"); } }), { hostIds: ISOLATED_HOST_IDS, actions }));
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: `io.molis.work.fixture.${declared.name}`, version: "1.0.0", name: declared.name, kind: "app",
    publisher: { publisher_id: "fixture", signature: declared.name }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [...declared.permissions], capabilities: { provides: [], consumes: [...declared.consumes] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [] },
    async start(context) { client = context.services?.actions; return { kind: "app" }; } };
  const install = runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: [...declared.grants] }).install;
  t.after(() => runtime.stop(install.install_id));
  await runtime.start(install.install_id);
  assert.ok(client, "the real executor bound the declared action client");
  return client;
}

test("W5-01-CODING-13 a plugin that declares what Shelf declares and holds the grant gets Coding's own Markdown on the real host, and Coding's own refusals", { timeout: 90_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Coding text", ["coding"]);
  await seed(home, project);
  const shelfLike = await consumer(t, home, project, { name: "shelf-like", consumes: shelfManifest.capabilities.consumes, permissions: shelfPermission, grants: ["artifact:read"] });
  const document = await shelfLike.invoke(codingResultDocument, { reference: REPORT });
  assert.deepEqual([document.reference, document.title, document.markdown], [REPORT, "已固定的原报告", BODY]);
  assert.equal(typeof document.saved_at, "string");
  await assert.rejects(shelfLike.invoke(codingResultDocument, { reference: { artifact_id: "coding-report:session-a:absent", version: 1 } }), refused("coding.shelf_material_invalid"),
    "a version the project does not hold is refused in Coding's code: the plugin audience reaches the action");
  await assert.rejects(shelfLike.invoke(codingResultDocument, { reference: { ...REPORT, version: 2 } }), refused("coding.shelf_material_invalid"));
});

test("W5-01-CODING-14 without the declaration, without the grant, without Coding in the project, or as a person or an MCP client, the text is not reachable", { timeout: 90_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Coding text refused", ["coding"]), without = await home.createProject("No Coding", ["schedule"]);
  await seed(home, project);
  const input = { reference: REPORT };
  // It consumes another Coding action, so the client exists, but not this one.
  const undeclared = await consumer(t, home, project, { name: "undeclared", consumes: ["coding.artifacts.preview"], permissions: shelfPermission, grants: ["artifact:read"] });
  await assert.rejects(undeclared.invoke(codingResultDocument, input), refused("actions.forbidden"));
  const ungranted = await consumer(t, home, project, { name: "ungranted", consumes: shelfManifest.capabilities.consumes, permissions: shelfPermission.map(row => ({ ...row, required: false })), grants: [] });
  await assert.rejects(ungranted.invoke(codingResultDocument, input), refused("plugin.grant_denied"));
  const elsewhere = await consumer(t, home, without, { name: "elsewhere", consumes: shelfManifest.capabilities.consumes, permissions: shelfPermission, grants: ["artifact:read"] });
  await assert.rejects(elsewhere.invoke(codingResultDocument, input), refused("actions.dependency_missing"), "a project that has not installed Coding does not offer its text");
  // Not an action a person, an Agent, a workflow or an MCP client can pick.
  const views = await home.inspect("runtime:coding-text", project.project_id);
  assert.ok(views.some(view => view.capability_id.startsWith("coding.")), "the same directory does list Coding's actions open to an MCP client");
  assert.deepEqual(views.filter(view => view.capability_id === codingResultDocument.capability_id), []);
  const person = (audience: "user" | "agent" | "workflow" | "mcp") => home.host.actionClient(project.reference).invoke(
    { actor_id: OWNER, project_id: project.project_id, audience, permissions: ["artifact:read"] }, codingResultDocument, input);
  for (const audience of ["user", "agent", "workflow", "mcp"] as const) {
    await assert.rejects(person(audience), { code: "actions.forbidden", message: "当前调用者不可使用此能力" }, `${audience}: the action is open to the plugin audience only`);
  }
});
