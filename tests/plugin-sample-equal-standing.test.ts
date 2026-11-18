import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { intakeMaterial, isPlacementRelationPart, isResumeSummaryAction, LOCAL_PERSON_ACTOR_ID, PLACEMENT_RELATION_ROLES, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openTestHome } from "./fixtures/test-home.js";

// PEQ-05 (specs/plugin-equal-standing/contract-design.md §5): the repository's third-party sample uses only contracts and the plugin SDK, and
// declares what the built-in plugins declare. The Host offers each to the person as it offers a built-in one, and MCP reads its resume summary.

const SAMPLE = new URL("../examples/plugin-sample/", import.meta.url);
const PLUGIN = "io.molis.work.example.notes";
const id = (name: string) => PLUGIN + "." + name;

test("PEQ-05: the sample imports only contracts and the plugin SDK, and its Manifest passes the SDK's checks with every declaration", () => {
  const source = readFileSync(new URL("index.mjs", SAMPLE), "utf8");
  const imports = [...source.matchAll(/from\s+"([^"]+)"/gu)].map(match => match[1]!);
  assert.deepEqual(imports.filter(name => !name.startsWith("@molis-ai/molis-work-plugin-sdk") && name !== "./manifest.json"), []);
  const manifest = parsePluginManifest(JSON.parse(readFileSync(new URL("manifest.json", SAMPLE), "utf8")));
  const action = (name: string) => manifest.actions!.find(item => item.capability_id === id(name))!.action;
  assert.ok(manifest.settings_entries?.entries.some(entry => entry.key === "greeting"), "a settings section");
  assert.ok(isResumeSummaryAction(action("resume.summary")), "a resume summary");
  assert.equal(action("notes.clear").requires_trusted_decision, true, "a write the person confirms in the platform's decision");
  assert.deepEqual(action("attach.list").placement_relation, { relation: "note", role: "list", target: { kind: "sample_note", noun: "Sample note", noun_text: { key: "notes.attach.noun" } } },
    "「挂到…」 not only for Goals");
  const blank = action("notes.create").intake;
  assert.ok(blank && "start" in blank && blank.start && blank.accepts?.length === 0, "a blank starting point");
});

test("PEQ-05: in a project the sample's declarations are the person's to use, and MCP reads its resume summary like any plugin's", { timeout: 60_000 }, async t => {
  const definition = (await import(new URL("index.mjs", SAMPLE).href)).default as PluginDefinition;
  const home = await openTestHome(t, { host: { pluginFixtures: { project: [definition] } } });
  const project = await home.createProject("Sample standing");
  const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user" as const, permissions: ["storage:private"] };
  const views = await home.host.inspectActions(person, project.reference);
  const own = views.filter(view => view.provider.plugin_id === PLUGIN && view.availability.available);
  const view = (name: string) => own.find(item => item.capability_id === id(name))!;
  const call = async <O>(name: string, input: unknown) => await home.host.actionClient(project.reference).invoke(person, { capability_id: view(name).capability_id, version: view(name).version, provider_id: view(name).provider.provider_id }, input) as O;

  // Workbench: what the person can start from nothing, and where 「挂到…」 can hang a thing, come from the sample's own declarations.
  const starts = own.filter(item => { const intake = item.action.intake; return intake && "start" in intake && intake.start && intakeMaterial(intake, "text") === undefined; });
  assert.deepEqual(starts.map(item => item.capability_id), [id("notes.create")]);
  for (const role of PLACEMENT_RELATION_ROLES) {
    assert.ok(own.some(item => item.action.placement_relation?.relation === "note" && item.action.placement_relation.role === role && isPlacementRelationPart(item.action, role)), role);
  }
  const made = await call<{ note: { id: string } }>("notes.create", {});
  const doc = { kind: "page", id: "doc-1" }, note = { kind: "sample_note", id: made.note.id };
  const bound = await call("attach.bind", { subject: doc, target: note, read: { title: "A document" } });
  assert.deepEqual(bound, { targets: [note] });
  assert.deepEqual(await call("attach.list", { subject: doc }), { targets: [note] });
  assert.deepEqual(await call("attach.bind", { subject: doc, target: note, read: { title: "A document" } }), bound, "a repeated attach adds none");
  assert.deepEqual(await call("attach.candidates", { subject: doc }), { targets: [{ subject: note, current: true }] });
  const settings = await call<{ values: { key: string; value: unknown; source: string }[] }>("settings.read", { keys: ["greeting"] });
  assert.deepEqual(settings.values.map(({ key, value, source }) => ({ key, value, source })), [{ key: "greeting", value: "Hello", source: "provider_default" }]);
  // The write behind a trusted decision is refused when the person's own call carries no decision.
  await assert.rejects(call("notes.clear", {}), { code: "actions.forbidden" });

  // MCP: the project connection gathers every resume summary in the directory, the sample's as its own section.
  const runtime = "runtime:sample-standing";
  await home.grant(runtime, project.project_id, [view("resume.summary")].map((item: ActionView) => ({ capability_id: item.capability_id, version: item.version })));
  const mcp = await home.mcp(runtime, project.project_id);
  const discovered = await mcp.client.discover(mcp.caller);
  const summary = discovered.find(item => item.provider.plugin_id === PLUGIN && isResumeSummaryAction(item.action));
  assert.ok(summary, "the resume summary is in the Runtime's directory");
  const answer = await mcp.client.invoke(mcp.caller, { capability_id: summary.capability_id, version: summary.version, provider_id: summary.provider.provider_id }, {});
  assert.equal((answer as { focus: { subject: { id: string } } | null }).focus?.subject.id, made.note.id);
});
