import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { intakeMaterial, isPlacementRelationPart, isResumeSummaryAction, isWorkTerminalPromptAction, LOCAL_PERSON_ACTOR_ID, PLACEMENT_RELATION_ROLES, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ReviewRequest } from "@molis-ai/molis-work-contracts/platform/ui";
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
  // PEQ-17: any plugin can declare an object work terminal with only a read-only user prompt query and zero terminal/workspace permissions.
  assert.deepEqual(manifest.work_terminals, [{ subject_kind: "sample_note", prompt_action: id("work_prompt") }], "an object work terminal declaration");
  assert.ok(isWorkTerminalPromptAction(action("work_prompt")), "the prompt action matches the work-terminal contract");
  assert.deepEqual(manifest.permissions.filter(item => ["terminal:run", "workspace:read", "projects:guidance-read"].includes(item.permission)), [],
    "object work terminals require no terminal, workspace or guidance permissions on the plugin");
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
  // P1-4: notes.read returns reverse-domain open.surface without failing SUBJECT_CONTEXT_OUTPUT_SCHEMA validation.
  const noteContext = await call<{ subject: { kind: string; id: string }; open?: { surface: string; id: string } }>("notes.read", { subject_id: made.note.id });
  assert.deepEqual(noteContext.subject, note);
  assert.deepEqual(noteContext.open, { surface: PLUGIN, id: made.note.id });
  const bound = await call("attach.bind", { subject: doc, target: note, read: { title: "A document" } });
  assert.deepEqual(bound, { targets: [note] });
  assert.deepEqual(await call("attach.list", { subject: doc }), { targets: [note] });
  assert.deepEqual(await call("attach.bind", { subject: doc, target: note, read: { title: "A document" } }), bound, "a repeated attach adds none");
  assert.deepEqual(await call("attach.candidates", { subject: doc }), { targets: [{ subject: note, current: true }] });
  const settings = await call<{ values: { key: string; value: unknown; source: string }[] }>("settings.read", { keys: ["greeting"] });
  assert.deepEqual(settings.values.map(({ key, value, source }) => ({ key, value, source })), [{ key: "greeting", value: "Hello", source: "provider_default" }]);
  // The write behind a trusted decision is refused when the person's own call carries no decision.
  await assert.rejects(call("notes.clear", {}), { code: "actions.forbidden" });

  // MCP: the project connection gathers every resume summary in the directory, the sample's as its own section via MolisWorkServer.
  const runtime = "runtime:sample-standing";
  await home.grant(runtime, project.project_id, [view("resume.summary")].map((item: ActionView) => ({ capability_id: item.capability_id, version: item.version })));
  const mcp = await home.mcp(runtime, project.project_id);
  const discovered = await mcp.client.discover(mcp.caller);
  const summary = discovered.find(item => item.provider.plugin_id === PLUGIN && isResumeSummaryAction(item.action));
  assert.ok(summary, "the resume summary is in the Runtime's directory");
  const answer = await mcp.client.invoke(mcp.caller, { capability_id: summary.capability_id, version: summary.version, provider_id: summary.provider.provider_id }, {});
  assert.equal((answer as { focus: { subject: { id: string } } | null }).focus?.subject.id, made.note.id);

  // P1-4: real MolisWorkServer context_resolve aggregates the sample plugin's resume.summary section.
  const runtimeContext = { runtime_id: "codex", stable_work_context_id: "sample-standing-ctx", host_declares_stable: true };
  await home.host.ensureWebCatalog(home.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: home.home }, catalog => {
    catalog.bindRuntimeContext({ context: runtimeContext, project_id: project.project_id, actor_id: LOCAL_PERSON_ACTOR_ID, user_confirmed: true });
  });
  await home.grant("runtime:codex", project.project_id, [view("resume.summary")].map((item: ActionView) => ({ capability_id: item.capability_id, version: item.version })));
  const runtimeServer = new MolisWorkServer("runtime", {
    databasePath: project.database_path, projectId: project.project_id, webBaseUrl: home.origin,
  }, {
    homeDirectory: home.home,
    runtimeContext,
  }, home.host);
  t.after(() => runtimeServer.close());
  const resolved = JSON.parse(await runtimeServer.callTool("molis_work_v1_context_resolve", {})) as {
    resume: { sections: Array<{ plugin_id: string; focus: { subject: { id: string } } | null }> };
  };
  const sampleSection = resolved.resume.sections.find(section => section.plugin_id === PLUGIN);
  assert.ok(sampleSection, "MolisWorkServer context_resolve includes third-party sample resume.summary section");
  assert.equal(sampleSection.focus?.subject.id, made.note.id);

  // P1-4: full trusted decision flow (review_request -> review_decide) redeems notes.clear atomically in SQLite.
  const management = new MolisWorkServer("management", { databasePath: project.database_path, projectId: project.project_id }, undefined, home.host);
  t.after(() => management.close());
  const clearView = view("notes.clear");
  const reviewRequest = JSON.parse(await management.callTool("molis_work_v1_review_request", {
    database_path: project.database_path,
    project_id: project.project_id,
    action: { capability_id: clearView.capability_id, version: clearView.version, provider_id: clearView.provider.provider_id },
    request_id: "clear-all",
  })) as ReviewRequest;
  assert.equal(reviewRequest.choices[0]?.id, "clear");
  const decided = JSON.parse(await management.callTool("molis_work_v1_review_decide", {
    database_path: project.database_path,
    project_id: project.project_id,
    reference: reviewRequest.reference,
    choice_id: "clear",
    request_key: "sample-clear-1",
  })) as { record?: { decision?: string }; replayed?: boolean };
  assert.equal(decided.record?.decision, "clear");
  assert.equal(decided.replayed, false);
  const afterClear = await call<{ focus: unknown }>("resume.summary", {});
  assert.equal(afterClear.focus, null, "notes.clear atomically emptied sample notes under trusted decision");
});
