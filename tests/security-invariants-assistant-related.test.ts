import assert from "node:assert/strict";
import test from "node:test";
import { assistantRelatedAction, assistantRelatedRegistration, type RelatedWorksSource } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { todoManifest } from "@molis-ai/molis-work-plugin-todo";
import { cogniaManifest } from "@molis-ai/molis-work-plugin-cognia";

// PG-057: an isolated page reads the Assistant works related to its object through the action gateway, never the Host's HTTP.

function harness() {
  const asked: Array<{ project_id: string | null; kind: string; id: string }> = [];
  const object = (relation: "result" | "material", kind: string, id: string) => ({ relation, subject: { kind, id }, title: id, recorded_revision: null,
    current_revision: null, state: "current" as const, recorded_at: "2026-10-25T00:00:00.000Z" });
  const service: RelatedWorksSource = {
    related: async (projectId: string | null, object: { kind: string; id: string }) => {
      asked.push({ project_id: projectId, ...object });
      return [{ work_id: "w1", title: "整理", state: "idle" as const, relation: "origin" as const, recorded_revision: null, updated_at: "2026-10-25T00:00:00.000Z" }];
    },
    read: async () => ({ objects: [object("result", "pages_document", "doc-1"), object("result", "todo_item", "t1"), object("material", "shelf_item", "s1")] }),
  };
  const handler = assistantRelatedRegistration(() => service).handlers[0]!;
  return { asked, invoke: (caller: ActionCallContext, input: unknown) => handler.handle(caller, input) };
}

const person: ActionCallContext = { actor_id: "local-person", project_id: "p1", audience: "user", permissions: [] };
const plugin = (manifest: PluginManifest, permissions: readonly string[]): ActionCallContext => ({
  actor_id: "local-person", project_id: "p1", audience: "plugin", permissions,
  host_plugin: { plugin_id: manifest.plugin_id, install_id: "install-1", actor_id: "local-person", project_id: "p1", declaration: { manifest }, assertActive: () => undefined } as HostPluginCaller,
});
const readerOf = (manifest: PluginManifest, kind: string) => manifest.actions!.find(definition => definition.action.input_type === "molis.subject-reference.v1"
  && definition.action.subject_kinds.includes(kind))!;

test("RAC-912: the action is open to the person and to plugin pages, and Todo declares that it consumes it", () => {
  assert.equal(assistantRelatedAction.capability_id, "assistant.works.related");
  assert.equal(assistantRelatedAction.version, 1);
  assert.deepEqual(assistantRelatedAction.action.audiences, ["user", "plugin"]);
  assert.ok(todoManifest.capabilities.consumes.includes("assistant.works.related"));
  assert.ok(readerOf(todoManifest, "todo_item"), "Todo reads its own todo_item back");
});

test("RAC-912: a plugin page reads the works of its own object, with results other than the object itself", async () => {
  const { asked, invoke } = harness();
  const todo = plugin(todoManifest, readerOf(todoManifest, "todo_item").action.permissions);
  const result = await invoke(todo, { kind: "todo_item", id: "t1" }) as { works: Array<{ work_id: string; results: Array<{ subject: { id: string } }> }> };
  assert.deepEqual(asked, [{ project_id: "p1", kind: "todo_item", id: "t1" }]);
  assert.deepEqual(result.works.map(work => [work.work_id, work.results.map(item => item.subject.id)]), [["w1", ["doc-1"]]]);
});

test("RAC-913 S-47: a plugin page cannot read another owner's object, nor its own without the reader's grants", async () => {
  const { asked, invoke } = harness();
  const todo = plugin(todoManifest, readerOf(todoManifest, "todo_item").action.permissions);
  await assert.rejects(() => invoke(todo, { kind: "cognia_material", id: "m1" }), { code: "actions.forbidden" });
  await assert.rejects(() => invoke(plugin(todoManifest, []), { kind: "todo_item", id: "t1" }), { code: "actions.forbidden" });
  const unnamed: ActionCallContext = { ...todo, host_plugin: undefined };
  await assert.rejects(() => invoke(unnamed, { kind: "todo_item", id: "t1" }), { code: "actions.forbidden" });
  assert.deepEqual(asked, [], "a refused page reaches no Assistant record");
});

test("RAC-912: a page and the person both read in the call's project, as the page's HTTP read did", async () => {
  const { asked, invoke } = harness();
  const reader = readerOf(cogniaManifest, "cognia_material");
  await invoke(plugin(cogniaManifest, reader.action.permissions), { kind: "cognia_material", id: "m1" });
  await invoke({ ...plugin(cogniaManifest, reader.action.permissions), project_id: null }, { kind: "cognia_material", id: "m2" });
  await invoke(person, { kind: "cognia_material", id: "m3" });
  assert.deepEqual(asked.map(item => [item.id, item.project_id]), [["m1", "p1"], ["m2", null], ["m3", "p1"]]);
});
