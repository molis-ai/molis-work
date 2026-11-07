// SECURITY-INVARIANTS S-task-grants-page (specs/proactive-assistant/task-grants-platform-area.md §5, §5.3): the route behind 授权与放行 in a
// project's settings is the person's own. A plugin page reaches it with neither of its headers, a request names nothing beyond its mode's
// keys, every call is the person's in the route's project, and a task's title comes from its installation's own search source, shown and
// never relied on. Every refusal asserts that no task's grant records changed. The page itself is tests/task-grants-page.e2e.test.ts.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { EN } from "@molis-ai/molis-work-app-workbench";
import { defineSearchEntriesAction, LOCAL_PERSON_ACTOR_ID, searchEntriesPage, type ActionDefinition, type SearchEntriesInput, type SearchEntry } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

const TITLED = "io.molis.work.example.grantstitled", UNTITLED = "io.molis.work.example.grantsuntitled";
const empty = { type: "object", properties: {}, additionalProperties: false } as const;
const entry = (kind: string, id: string, title: string): SearchEntry => ({ subject: { kind, id }, revision: "r1", title, summary: "", updated_at: null, content: "summary", open: null });

/**
 * A plugin with one read group a task can be given. The titled one says its tasks are its `grants_task` objects and lists them, with a
 * note of another kind beside them, through its own search source: 501 of them, so a second page exists.
 */
function plugin(plugin_id: string, name: string, titled: boolean) {
  const contexts: PluginStartContext[] = [], listed: SearchEntriesInput[] = [];
  const notes: ActionDefinition = { capability_id: `${name}.notes.list`, version: 1, operation: "query", action: { title: "Notes", description: "What a task reads",
    kind: "query", scope: "project", audiences: ["agent", "user"], permissions: [], subject_kinds: [], input_schema: empty, output_schema: { type: "object" } } };
  const search = defineSearchEntriesAction(`${name}.search.entries`, 1, [{ kind: "grants_task", title: "任务", surface: name }, { kind: "grants_note", title: "笔记", surface: name }], "任务", []);
  const entries = [entry("grants_note", "daily", "不是任务"), entry("grants_task", "daily", "每天早上的简报"), entry("grants_task", "weekly", "每周回顾"),
    ...Array.from({ length: 499 }, (_, index) => entry("grants_task", `t${index}`, `任务 ${index}`)), entry("grants_task", "zlate", "排在第二页的任务")];
  const definition: PluginDefinition = { manifest: { schema_version: 1, host_api_version: 1, plugin_id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: name }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: titled ? [notes, search] : [notes],
    read_groups: [{ group_id: "notes", title: "笔记", description: "这个插件的笔记", actions: [notes.capability_id] }],
    ...(titled ? { task_subjects: { kind: "grants_task" } } : {}) },
  async start(context) { contexts.push(context); return { kind: "app", actions: [{ ...notes, handle: () => ({ notes: [] }) },
    ...(titled ? [{ ...search, handle: (_caller: unknown, input: unknown) => { listed.push(input as SearchEntriesInput); return searchEntriesPage(entries, input as SearchEntriesInput); } }] : [])] }; } };
  return { definition, contexts, listed };
}

async function world(t: TestContext) {
  const titled = plugin(TITLED, "grantstitled", true), untitled = plugin(UNTITLED, "grantsuntitled", false);
  const f = await serveHomeRuntime(t, { pluginFixtures: { project: [titled.definition, untitled.definition] } });
  const open = async (title: string) => {
    const project = await f.project(title);
    await f.host.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [] }, project.reference);
    const install = titled.contexts.at(-1)?.install_id, other = untitled.contexts.at(-1)?.install_id;
    assert.ok(install && other, "both plugins run in the project");
    const prefix = `/projects/${project.project_id}`, endpoint = prefix + "/api/settings/task-grants";
    const post = (body: unknown, headers: Record<string, string> = {}) => f.request(endpoint, { method: "POST", headers, body });
    const call = async <T>(body: unknown) => { const response = await post(body); assert.equal(response.status, 200, await response.clone().text()); return await response.json() as T; };
    const group = async (installId: string) => {
      const listed = await call<{ categories: Array<{ provider_id: string; group_id?: string; plugin_id?: string }> }>({ mode: "list" });
      const found = listed.categories.find(category => category.group_id === "notes" && category.provider_id === installId || category.group_id === "notes" && category.plugin_id === (installId === install ? TITLED : UNTITLED));
      assert.ok(found, "the plugin's group is offered"); return { provider_id: found.provider_id, group_id: "notes" };
    };
    return { project, install, other, prefix, endpoint, post, call, group };
  };
  /** The grant records of every task subject in the Home, as written. */
  const records = async () => JSON.stringify((await readMcpToolPreference(f.home)).action_grants.filter(grant => grant.client_id.startsWith("agent:task:")));
  return { f, open, records, titled };
}

test("S-task-grants-page TGA-28 the settings route is the person's own page's: a plugin page's headers, an extra key or another mode write nothing, and a write lands in the route's project", { timeout: 60_000 }, async t => {
  const { f, open, records } = await world(t);
  const a = await open("Grants one"), b = await open("Grants two");
  const set = { mode: "set", plugin_install_id: a.install, key: "daily", categories: [await a.group(a.install)], expected_revision: "" };
  await a.call(set);
  const written = await records();
  assert.notEqual(written, "[]", "the person's set wrote the task's records");

  // A plugin page, with its frame bridge's header, the shell's page header, or both: refused before anything is read or written.
  const opened = await f.request(a.prefix + "/api/host/plugin-pages", { method: "POST", body: { plugin_id: TITLED } });
  assert.equal(opened.status, 200, await opened.clone().text());
  const { page_id } = await opened.json() as { page_id: string };
  for (const headers of [{ "x-molis-plugin-page": page_id }, { "x-molis-context-page": page_id }, { "x-molis-plugin-page": page_id, "x-molis-context-page": page_id }, { "x-molis-plugin-page": "made-up" }]) {
    for (const body of [{ mode: "list" }, { ...set, key: "weekly" }, { mode: "clear", plugin_install_id: a.install, key: "daily" }, { mode: "titles", plugin_install_id: a.install, cursor: null }]) {
      const refused = await a.post(body, headers);
      assert.equal(refused.status, 403, JSON.stringify({ headers, mode: body.mode }));
    }
  }
  // Without the control token, nothing either: the local request gate's one opaque refusal (web-http.ts `authorizeLocalWebRequest`).
  const untokened = await f.request(a.endpoint, { method: "POST", authorized: false, body: { mode: "list" } });
  assert.equal(untokened.status, 403);
  assert.equal(((await untokened.json()) as { code: string }).code, "host.request_refused");
  assert.equal(await records(), written, "no plugin page wrote");

  // Each mode takes its own keys only: an actor, a project, another installation's name under another key, anything else is refused.
  const bodies = [{ mode: "list" }, set, { mode: "clear", plugin_install_id: a.install, key: "daily" }, { mode: "titles", plugin_install_id: a.install, cursor: null }];
  for (const body of bodies) for (const extra of [{ project_id: b.project.project_id }, { actor_id: "agent:prologue" }, { install_id: a.other }, { audience: "agent" }, { note: "x" }]) {
    const refused = await a.post({ ...body, ...extra });
    assert.equal(refused.status, 400, JSON.stringify({ mode: body.mode, extra }));
    assert.equal(((await refused.json()) as { code: string }).code, "actions.input_invalid");
  }
  for (const wrong of [{ mode: "read" }, { mode: "set", plugin_install_id: a.install, key: "daily" }, { ...set, plugin_install_id: "" }, { ...set, categories: "all" },
    { ...set, expected_revision: 1 }, { mode: "titles", plugin_install_id: a.install, cursor: 3 }, { mode: "clear", key: "daily" }]) {
    assert.equal((await a.post(wrong)).status, 400, JSON.stringify(wrong));
  }
  assert.equal((await f.request(a.endpoint)).status, 405, "only POST");
  assert.equal(await records(), written, "no refused request wrote");

  // The project is the route's: the same installation named on the other project's route writes that project's task, never this one's.
  await b.call({ ...set, categories: [await b.group(b.install)] });
  const grants = (await readMcpToolPreference(f.home)).action_grants.filter(grant => grant.client_id.startsWith("agent:task:"));
  assert.deepEqual([...new Set(grants.map(grant => grant.client_id))].sort(),
    [`agent:task:${a.project.project_id}:${a.install}:daily`, `agent:task:${b.project.project_id}:${b.install}:daily`].sort());
});

test("S-task-grants-page TGA-24 TGA-26 the route lists every task once and names a task through its installation's own search source, one page of 500 at a time", { timeout: 60_000 }, async t => {
  const { open, titled } = await world(t);
  const a = await open("Grants titles");
  const mine = await a.group(a.install), theirs = await a.group(a.other);
  for (const [install, key, group] of [[a.install, "daily", mine], [a.install, "zlate", mine], [a.other, "daily", theirs]] as const)
    await a.call({ mode: "set", plugin_install_id: install, key, categories: [group], expected_revision: "" });

  type Listed = { subjects: Array<{ plugin_install_id: string; key: string; categories: Array<{ status: string }> }>; installations: Array<{ plugin_install_id: string; plugin_id: string; name: string; titled: boolean }> };
  const listed = await a.call<Listed & { categories: Array<{ provider_id: string; title: string; description: string }> }>({ mode: "list" });
  // The page shows each category in the person's language: 项目资料 too, whose description the Host makes of its readable actions' titles.
  const knowledge = listed.categories.find(category => category.provider_id === "system.knowledge");
  assert.ok(knowledge && EN[knowledge.title] && EN[knowledge.description], `项目资料 has English: ${JSON.stringify(knowledge)}`);
  assert.deepEqual(listed.subjects.map(subject => [subject.plugin_install_id, subject.key, subject.categories.map(category => category.status)]).sort(),
    [[a.install, "daily", ["granted"]], [a.install, "zlate", ["granted"]], [a.other, "daily", ["granted"]]].sort());
  assert.deepEqual(listed.installations.map(install => [install.plugin_install_id, install.plugin_id, install.name, install.titled]).sort(),
    [[a.install, TITLED, "grantstitled", true], [a.other, UNTITLED, "grantsuntitled", false]].sort(), "each installation by its own name, and whether it says what its tasks are");

  // The installation's own source, as the person, one page at a time: only the declared kind, with where each opens.
  type Titles = { entries: Array<{ key: string; title: string; open: { surface: string; id: string } }>; next_cursor: string | null };
  const first = await a.call<Titles>({ mode: "titles", plugin_install_id: a.install, cursor: null });
  assert.deepEqual(titled.listed, [{ cursor: null, limit: 500 }], "one call of the source, the first page of 500");
  assert.ok(first.next_cursor, "a second page exists");
  assert.equal(first.entries.find(item => item.key === "daily")?.title, "每天早上的简报", "the task's own title, not the note's of the same id");
  assert.deepEqual(first.entries.find(item => item.key === "daily")?.open, { surface: "grantstitled", id: "daily" }, "where it opens, from the source's declaration");
  assert.ok(first.entries.every(item => item.title !== "不是任务"), "another kind is left out");
  assert.ok(!first.entries.some(item => item.key === "zlate"));
  assert.deepEqual(Object.keys(first.entries[0]!).sort(), ["key", "open", "title"], "nothing else of an entry is passed on");
  const second = await a.call<Titles>({ mode: "titles", plugin_install_id: a.install, cursor: first.next_cursor });
  assert.equal(second.entries.find(item => item.key === "zlate")?.title, "排在第二页的任务");
  assert.equal(second.next_cursor, null);
  // A plugin that does not say what its tasks are is not asked; the page names its task by the plugin.
  assert.deepEqual(await a.call({ mode: "titles", plugin_install_id: a.other, cursor: null }), { entries: [], next_cursor: null });
  assert.equal(titled.listed.length, 2);

  // All of a task's grants go in one clear, naming its installation; the other installation's task of the same key keeps its own.
  assert.deepEqual(await a.call({ mode: "clear", plugin_install_id: a.install, key: "daily" }), { cleared: true });
  const after = await a.call<Listed>({ mode: "list" });
  assert.deepEqual(after.subjects.map(subject => [subject.plugin_install_id, subject.key]).sort(), [[a.install, "zlate"], [a.other, "daily"]].sort());
});
