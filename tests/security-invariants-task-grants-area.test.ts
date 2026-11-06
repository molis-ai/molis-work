// SECURITY-INVARIANTS S-142, the Host's half (specs/proactive-assistant/task-grants-platform-area.md §2.3, §4): the route behind the
// platform's reads area on a plugin page is the trusted shell's alone. It takes only the outer page header without the frame bridge's,
// names only the task's key, finds the installation and the project from the page's authority, and writes as the person through
// `agent.task_grants.set`. Every refusal asserts that the task's grant records did not change. The shell's half (where the area is drawn
// and what a press must be) is tests/security-invariants-task-grants-area.e2e.test.ts.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

const READER = "io.molis.work.example.areareader", NEIGHBOUR = "io.molis.work.example.areaneighbour";
const empty = { type: "object", properties: {}, additionalProperties: false } as const;
const notesOf = (name: string): ActionDefinition => ({ capability_id: `${name}.notes.list`, version: 1, operation: "query", action: { title: "Notes", description: "What a task reads",
  kind: "query", scope: "project", audiences: ["agent", "user"], permissions: [], subject_kinds: [], input_schema: empty, output_schema: { type: "object" } } });

/** A plugin whose one read group is a category a task can be given; the reader's page is the one the shell opens, its neighbour is another installation in the same project. */
function reader(plugin_id: string, name: string) {
  const contexts: PluginStartContext[] = [], notes = notesOf(name);
  const definition: PluginDefinition = { manifest: { schema_version: 1, host_api_version: 1, plugin_id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: name }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [notes],
    read_groups: [{ group_id: "notes", title: "笔记", description: "这个插件的笔记", actions: [notes.capability_id] }] },
  async start(context) { contexts.push(context); return { kind: "app", actions: [{ ...notes, handle: () => ({ notes: [] }) }] }; } };
  return { definition, contexts };
}

async function world(t: TestContext) {
  const plugin = reader(READER, "areareader"), neighbour = reader(NEIGHBOUR, "areaneighbour");
  const f = await serveHomeRuntime(t, { pluginFixtures: { project: [plugin.definition, neighbour.definition] } });
  const open = async (title: string) => {
    const project = await f.project(title);
    await f.host.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [] }, project.reference);
    const context = plugin.contexts.at(-1), next = neighbour.contexts.at(-1);
    assert.ok(context && next, "the reader and its neighbour run in the project");
    const prefix = `/projects/${project.project_id}`;
    const opened = await f.request(prefix + "/api/host/plugin-pages", { method: "POST", body: { plugin_id: READER } });
    assert.equal(opened.status, 200, await opened.clone().text());
    const { page_id } = await opened.json() as { page_id: string };
    return { project, install: context.install_id, neighbour: next.install_id, prefix, page_id, endpoint: prefix + "/api/host/plugin-page-task-grants",
      trusted: { "x-molis-context-page": page_id }, child: { "x-molis-plugin-page": page_id } };
  };
  /** The grant records of every task subject in the Home, as written. */
  const records = async () => JSON.stringify((await readMcpToolPreference(f.home)).action_grants.filter(grant => grant.client_id.startsWith("agent:task:")));
  return { f, open, records };
}

test("S-142 TGA-08 TGA-09 TGA-17 the reads area's route is the trusted shell's, takes the installation from the page, and writes nothing once the page is gone", { timeout: 60_000 }, async t => {
  const { f, open, records } = await world(t);
  const a = await open("Area one"), b = await open("Area two");
  const post = (endpoint: string, headers: Record<string, string>, body: unknown) => f.request(endpoint, { method: "POST", headers, body });

  const read = await post(a.endpoint, a.trusted, { mode: "read", key: "daily" });
  assert.equal(read.status, 200, await read.clone().text());
  const reads = await read.json() as { categories: Array<{ provider_id: string; group_id?: string; plugin_id?: string }>; subject: { revision: string; categories: unknown[] } };
  const group = reads.categories.find(category => category.plugin_id === READER && category.group_id === "notes");
  assert.ok(group, "the reader's group is offered");
  assert.deepEqual(reads.subject, { revision: "", categories: [] });
  const set = { mode: "set", key: "daily", categories: [{ provider_id: group.provider_id, group_id: "notes" }], expected_revision: "" };
  const none = await records();

  // TGA-08: the frame's bridge adds its own header to every request; with it, alone or beside the outer one, the route refuses.
  for (const headers of [{}, a.child, { ...a.trusted, ...a.child }]) {
    const refused = await post(a.endpoint, headers, set);
    assert.equal(refused.status, 403, JSON.stringify(headers));
  }
  // A page of one project does not reach another project's route.
  assert.equal((await post(b.endpoint, a.trusted, set)).status, 403);
  assert.equal(await records(), none, "no refused request wrote");

  // TGA-09: the request names the key and the categories only; an installation, a project or any other name is refused.
  for (const extra of [{ plugin_install_id: a.neighbour }, { install_id: a.neighbour }, { plugin_install_id: b.install }, { project_id: b.project.project_id }, { note: "x" }]) {
    const refused = await post(a.endpoint, a.trusted, { ...set, ...extra });
    assert.equal(refused.status, 400, JSON.stringify(extra));
    assert.equal(((await refused.json()) as { code: string }).code, "actions.input_invalid");
  }
  for (const wrong of [{ key: "a:b" }, { key: "" }, { mode: "clear" }, { categories: "all" }, { expected_revision: 1 }]) {
    assert.equal((await post(a.endpoint, a.trusted, { ...set, ...wrong })).status, 400, JSON.stringify(wrong));
  }
  assert.equal(await records(), none, "no refused request wrote");

  // The person's write lands under the page's own installation and project only.
  const saved = await post(a.endpoint, a.trusted, set);
  assert.equal(saved.status, 200, await saved.clone().text());
  const grants = (await readMcpToolPreference(f.home)).action_grants.filter(grant => grant.client_id.startsWith("agent:task:"));
  assert.ok(grants.length > 0);
  assert.ok(grants.every(grant => grant.client_id === `agent:task:${a.project.project_id}:${a.install}:daily`), JSON.stringify(grants.map(grant => grant.client_id)));
  const written = await records();

  // TGA-17, the route's half: a page that is closed is no authority; the write is refused and nothing changes.
  await f.request(a.prefix + "/api/host/plugin-pages/" + a.page_id, { method: "DELETE" });
  const late = await post(a.endpoint, a.trusted, { ...set, key: "weekly" });
  assert.equal(late.status, 403, await late.clone().text());
  assert.equal((await post(a.endpoint, a.trusted, { mode: "read", key: "daily" })).status, 403);
  assert.equal(await records(), written, "a closed page wrote nothing");
});
