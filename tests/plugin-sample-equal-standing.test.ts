import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { agentTaskGrantActions, type TaskGrantListResult, type TaskGrantSubject } from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import { pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { effectsFromContract, parsePluginManifest, sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { pluginComponentChoices, type PluginComponentPlan } from "@molis-ai/molis-work-design-system";
import {
  defineWorkflowContentActions, defineSubjectContextAction, definePlacementRelationAction, defineSearchEntriesAction, defineResumeSummaryAction, defineWorkTerminalPromptAction,
  intakeMaterial, isPlacementRelationPart, isResumeSummaryAction, isWorkTerminalPromptAction,
  LOCAL_PERSON_ACTOR_ID, PLACEMENT_RELATION_ROLES, workTerminalActions, type ActionView,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginDefinition, type PluginManifest, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { SETTINGS_READ_INPUT_SCHEMA, SETTINGS_READ_OUTPUT_SCHEMA, SETTINGS_WRITE_INPUT_SCHEMA } from "@molis-ai/molis-work-contracts/platform/settings";
import type { ReviewRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { mac, person as sandboxPerson, ref } from "./fixtures/home-sandbox.js";
import { PACKAGE_PLUGIN_ID, fixturePublisher, newPublisher, signedPackage, type PackageFiles } from "./fixtures/sandbox-package.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { openTestHome } from "./fixtures/test-home.js";

// PEQ-05 (specs/plugin-equal-standing/contract-design.md §5): the repository's third-party sample uses only contracts and the plugin SDK, and
// declares what the built-in plugins declare. The Host offers each to the person as it offers a built-in one, and MCP reads its resume summary.

const SAMPLE = new URL("../examples/plugin-sample/", import.meta.url);
const PLUGIN = "com.example.notes";
const id = (name: string) => PLUGIN + "." + name;

function settingsInstallation(html: string) {
  const section = html.match(/<section[^>]+data-dynamic-plugin-settings="[^"]+"[^>]*>/u)?.[0];
  assert.ok(section);
  const read = (attribute: string) => {
    const value = section.match(new RegExp(attribute + '="([^"]+)"'))?.[1];
    assert.ok(value, attribute);
    return value;
  };
  return { manifest_digest: read("data-manifest-digest"), plugin_install_id: read("data-plugin-install-id"), installation_generation: read("data-installation-generation"), scope: read("data-plugin-scope") };
}

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

  // P1-1: dynamic Workbench settings discovery exposes the sample plugin without hardcoding BUILTIN_PLUGIN_CATALOG,
  // and the person can write its setting and redeem its trusted decision via Workbench HTTP (PEQ-05).
  const appearancePage = await fetch(`${home.origin}/settings/appearance?project=${encodeURIComponent(project.project_id)}`);
  assert.equal(appearancePage.status, 200);
  const appearanceHtml = await appearancePage.text();
  assert.ok(appearanceHtml.includes(`/settings/${PLUGIN}`), "Workbench settings sidebar dynamically lists third-party settings_entries plugin");
  const sampleSettingsPage = await fetch(`${home.origin}/settings/${PLUGIN}?project=${encodeURIComponent(project.project_id)}`);
  assert.equal(sampleSettingsPage.status, 200);
  const settingsHtml = await sampleSettingsPage.text();
  assert.match(settingsHtml, /Hello/);
  const currentSetting = await call<{ values: Array<{ key: string; revision: string; value: unknown }> }>("settings.read", { keys: ["greeting"] });
  const writtenSetting = await home.web.post<{ values: Array<{ key: string; value: unknown }> }>("/api/settings/plugin-entries/write", {
    ...settingsInstallation(settingsHtml), plugin_id: PLUGIN, project_id: project.project_id,
    key: "greeting", layer: "project", change: { set: "Workbench Greeting" },
    expected_revision: currentSetting.values[0]!.revision, request_id: "sample-wb-set-1",
  });
  assert.equal(writtenSetting.values[0]?.value, "Workbench Greeting", "PEQ-05: sample plugin setting writable via Workbench HTTP");
  const updatedSettingsPage = await fetch(`${home.origin}/settings/${PLUGIN}?project=${encodeURIComponent(project.project_id)}`);
  assert.equal(updatedSettingsPage.status, 200);
  assert.match(await updatedSettingsPage.text(), /Workbench Greeting/, "PEQ-05: updated sample setting rendered on Workbench settings page");

  await call("notes.create", {});
  const webReview = await home.web.post<ReviewRequest>(`/projects/${project.project_id}/api/project-approvals/request`, {
    action: { capability_id: clearView.capability_id, version: clearView.version, provider_id: clearView.provider.provider_id },
    request_id: "clear-via-web",
  });
  assert.equal(webReview.choices[0]?.id, "clear", "PEQ-05: sample trusted decision request served via Workbench HTTP");
  const webDecided = await home.web.post<{ record?: { decision?: string }; replayed?: boolean }>(`/projects/${project.project_id}/api/project-approvals/decide`, {
    reference: webReview.reference, choice_id: "clear", request_key: "sample-web-clear-1",
  });
  assert.equal(webDecided.record?.decision, "clear", "PEQ-05: sample trusted decision redeemed via Workbench HTTP");
  assert.equal(webDecided.replayed, false);
  const afterWebClear = await call<{ focus: unknown }>("resume.summary", {});
  assert.equal(afterWebClear.focus, null, "PEQ-05: Workbench HTTP trusted decision atomically cleared sample notes");
});

const SIGNED_SANDBOX_ID = "com.example.sandbox-standing";
const SANDBOX_CODE = `
async function readState(sdk) {
  const raw = await sdk.storage.get('state');
  return raw ? JSON.parse(raw) : { greeting: 'Welcome', revision: 1, items: [{ id: 'card-1', title: 'Sandbox card', bindings: [] }] };
}
async function writeState(sdk, state) {
  state.revision += 1;
  await sdk.storage.set('state', JSON.stringify(state));
  return state;
}
function settingValues(state) {
  return { values: [{ key: 'greeting', revision: String(state.revision), state: 'ok', value: state.greeting, source: 'project', layers: { provider_default: 'Welcome', project: state.greeting } }] };
}
function attachedTo(state, key) {
  return { targets: state.items.filter(item => item.bindings.includes(key)).map(item => ({ kind: 'sandbox_card', id: item.id })) };
}
export const operations = {
  'settings.read': async (_input, sdk) => settingValues(await readState(sdk)),
  'settings.write': async (input, sdk) => {
    const state = await readState(sdk);
    if (input.expected_revision !== String(state.revision)) throw Object.assign(new Error('revision changed'), { code: 'actions.conflict' });
    state.greeting = 'set' in input.change ? String(input.change.set) : 'Welcome';
    await writeState(sdk, state);
    return settingValues(state);
  },
  'cards.read': async (input, sdk) => {
    const state = await readState(sdk), item = state.items.find(item => item.id === input.subject_id);
    if (!item) throw Object.assign(new Error('No such card'), { code: 'actions.missing' });
    return { subject: { kind: 'sandbox_card', id: item.id }, revision: String(state.revision),
      title: item.title, content: item.body || item.title, truncated: false, open: { surface: '${SIGNED_SANDBOX_ID}', id: item.id } };
  },
  'cards.receive': async (input, sdk) => {
    const state = await readState(sdk);
    let item = state.items.find(item => item.request === input.request_id);
    if (!item) {
      item = { id: 'received-' + state.items.length, title: input.title, body: input.body, request: input.request_id, bindings: [] };
      state.items.push(item);
      await writeState(sdk, state);
    }
    return { subject: { kind: 'sandbox_card', id: item.id }, title: item.title };
  },
  'cards.search': async (_input, sdk) => {
    const state = await readState(sdk);
    return { collection_revision: String(state.revision), next_cursor: null, entries: state.items.map(item => ({
      subject: { kind: 'sandbox_card', id: item.id }, revision: String(state.revision), title: item.title,
      summary: item.title, updated_at: null, content: 'summary', open: { surface: '${SIGNED_SANDBOX_ID}', id: item.id },
    })) };
  },
  'resume.summary': async (_input, sdk) => {
    const state = await readState(sdk);
    const first = state.items[0];
    return {
      title: 'Sandbox cards',
      focus: first ? { subject: { kind: 'sandbox_card', id: first.id }, title: first.title, next_hint: '', status_label: 'active', open: { surface: '${SIGNED_SANDBOX_ID}', id: first.id } } : null,
      next: [],
      progress: { total: state.items.length, done: 0, items: state.items.map(item => ({ id: item.id, title: item.title, status: 'open', next_hint: 'Prepare sandbox card', pending_decision_count: 0, updated_at: '2026-11-20T12:00:00Z' })) },
    };
  },
  'work.prompt': async (input, sdk) => {
    const state = await readState(sdk);
    const card = state.items.find(item => item.id === input.subject_id);
    if (!card) throw Object.assign(new Error('No such card'), { code: 'actions.missing' });
    return { subject: { kind: 'sandbox_card', id: card.id }, title: card.title, read_only: false, instruction: 'Advance sandbox card ' + card.id };
  },
  'attach.list': async (input, sdk) => attachedTo(await readState(sdk), input.subject.kind + ':' + input.subject.id),
  'attach.bind': async (input, sdk) => {
    const state = await readState(sdk), key = input.subject.kind + ':' + input.subject.id;
    const card = state.items.find(item => item.id === input.target.id);
    if (!card) throw Object.assign(new Error('No such card'), { code: 'actions.missing' });
    if (!card.bindings.includes(key)) { card.bindings.push(key); await writeState(sdk, state); }
    return attachedTo(state, key);
  },
  'attach.release': async (input, sdk) => {
    const state = await readState(sdk), key = input.subject.kind + ':' + input.subject.id;
    const card = state.items.find(item => item.id === input.target.id);
    if (!card) throw Object.assign(new Error('No such card'), { code: 'actions.missing' });
    card.bindings = card.bindings.filter(entry => entry !== key);
    await writeState(sdk, state);
    return attachedTo(state, key);
  },
  'attach.candidates': async (input, sdk) => {
    const state = await readState(sdk), key = input.subject.kind + ':' + input.subject.id;
    return { targets: state.items.map(card => ({ subject: { kind: 'sandbox_card', id: card.id }, current: card.bindings.includes(key) })) };
  },
  'attach.create': async (input, sdk) => {
    const state = await readState(sdk), key = input.subject.kind + ':' + input.subject.id;
    const card = { id: 'card-' + (state.items.length + 1), title: input.name, bindings: [key] };
    state.items.push(card);
    await writeState(sdk, state);
    return { targets: [{ kind: 'sandbox_card', id: card.id }] };
  },
};
`;

function signedStandingPackage(publisher = newPublisher()): PluginPackageBundle {
  const kind = { kind: "sandbox_card", title: "Sandbox card", glyph: "bookmark" };
  const reader = defineSubjectContextAction("read", 1, kind.kind, kind.title, ["storage:private"]);
  const { receive } = defineWorkflowContentActions({ id: "sample", title: "Card collection", icon: "bookmark", subject_kind: kind.kind, read_permissions: [], write_permissions: ["storage:private"] });
  const search = defineSearchEntriesAction("s", 1, [{ ...kind, surface: SIGNED_SANDBOX_ID }], "Cards", ["storage:private"]);
  const resumeDef = defineResumeSummaryAction("r", 1, ["sandbox_card"], "r", ["storage:private"]);
  const wtDef = defineWorkTerminalPromptAction("w", 1, "sandbox_card", "w", ["storage:private"]);
  const rel = (role: (typeof PLACEMENT_RELATION_ROLES)[number]) => definePlacementRelationAction("card", role, "p", 1, {
    kinds: [], title: role, description: role, permissions: ["storage:private"],
    ...(role === "list" ? { target: { kind: "sandbox_card", noun: "Sandbox card" } } : {}),
  });
  return signedPackage(publisher, (files: PackageFiles, manifest: PluginManifest) => {
    const contract: SandboxPluginContract = {
      version: 1,
      pluginId: manifest.plugin_id,
      revision: "standing-v1",
      ui: { locales: { default: "en", available: ["en"] } },
      entities: [],
      acceptance: [],
      settings_entries: {
        entries: [{ key: "greeting", title: { key: "sandbox-standing.greeting" }, summary: { key: "sandbox-standing.greeting-summary" }, layers: ["project"], schema: { type: "string", maxLength: 80 } }],
        read_operation: "settings.read",
        write_operation: "settings.write",
      },
      operations: [
        {
          id: "settings.read", kind: "query", action_protocol: { kind: "settings", role: "read" },
          input: SETTINGS_READ_INPUT_SCHEMA, output: SETTINGS_READ_OUTPUT_SCHEMA,
          errors: [], effects: { storage: ["read"] },
          examples: [{ input: { keys: ["greeting"] }, output: { values: [{ key: "greeting", revision: "1", state: "ok", value: "Welcome", source: "project" }] } }],
        },
        {
          id: "settings.write", kind: "command", action_protocol: { kind: "settings", role: "write" },
          input: SETTINGS_WRITE_INPUT_SCHEMA, output: SETTINGS_READ_OUTPUT_SCHEMA,
          errors: [{ code: "actions.conflict", description: "revision changed" }], effects: { storage: ["read", "write"] },
          examples: [{ input: { key: "greeting", layer: "project", change: { set: "Hi" }, expected_revision: "1", request_id: "r1" }, output: { values: [{ key: "greeting", revision: "2", state: "ok", value: "Hi", source: "project" }] } }],
        },
        {
          id: "cards.read", kind: "query", read_protocol: { kind: "subject_context", subject_kind: kind.kind },
          input: reader.action.input_schema, output: reader.action.output_schema!, errors: [{ code: "actions.missing", description: "Card missing" }], effects: { storage: ["read"] },
          examples: [{ input: { subject_id: "card-1" }, output: { subject: { kind: kind.kind, id: "card-1" }, revision: "1", title: "Card", content: "Card", truncated: false } }],
        },
        {
          id: "cards.receive", kind: "command", action_protocol: { kind: "workflow_receive", title: "Card collection", subject_kind: kind.kind, icon: "bookmark" },
          input: receive.action.input_schema, output: receive.action.output_schema!, errors: [], effects: { storage: ["read", "write"] },
          examples: [{ input: { title: "A", body: "Body", request_id: "one" }, output: { subject: { kind: kind.kind, id: "received-1" }, title: "A" } }],
        },
        {
          id: "cards.search", kind: "query", read_protocol: { kind: "search_entries", kinds: [kind] },
          input: search.action.input_schema, output: search.action.output_schema!, errors: [], effects: { storage: ["read"] },
          examples: [{ input: { cursor: null, limit: 10 }, output: { collection_revision: "1", next_cursor: null, entries: [] } }],
        },
        {
          id: "resume.summary", kind: "query", read_protocol: { kind: "resume_summary", subject_kinds: ["sandbox_card"] },
          input: resumeDef.action.input_schema, output: resumeDef.action.output_schema!,
          errors: [], effects: { storage: ["read"] },
          examples: [{ input: {}, output: { title: "Sandbox cards", focus: null, next: [] } }],
        },
        {
          id: "work.prompt", kind: "query", read_protocol: { kind: "work_terminal_prompt", subject_kind: "sandbox_card" },
          input: wtDef.action.input_schema, output: wtDef.action.output_schema!,
          errors: [{ code: "actions.missing", description: "card missing" }], effects: { storage: ["read"] },
          examples: [{ input: { subject_id: "card-1" }, output: { subject: { kind: "sandbox_card", id: "card-1" }, title: "Sandbox card", read_only: false, instruction: "Advance" } }],
        },
        {
          id: "attach.list", kind: "query", action_protocol: { kind: "placement_relation", relation: "card", role: "list", target: { kind: "sandbox_card", noun: "Sandbox card" } },
          input: rel("list").action.input_schema, output: rel("list").action.output_schema!,
          errors: [], effects: { storage: ["read"] },
          examples: [{ input: { subject: { kind: "page", id: "p1" } }, output: { targets: [] } }],
        },
        {
          id: "attach.bind", kind: "command", action_protocol: { kind: "placement_relation", relation: "card", role: "bind" },
          input: rel("bind").action.input_schema, output: rel("bind").action.output_schema!,
          errors: [{ code: "actions.missing", description: "card missing" }], effects: { storage: ["read", "write"] },
          examples: [{ input: { subject: { kind: "page", id: "p1" }, target: { kind: "sandbox_card", id: "card-1" } }, output: { targets: [{ kind: "sandbox_card", id: "card-1" }] } }],
        },
        {
          id: "attach.release", kind: "command", action_protocol: { kind: "placement_relation", relation: "card", role: "release" },
          input: rel("release").action.input_schema, output: rel("release").action.output_schema!,
          errors: [{ code: "actions.missing", description: "card missing" }], effects: { storage: ["read", "write"] },
          examples: [{ input: { subject: { kind: "page", id: "p1" }, target: { kind: "sandbox_card", id: "card-1" } }, output: { targets: [] } }],
        },
        {
          id: "attach.candidates", kind: "query", action_protocol: { kind: "placement_relation", relation: "card", role: "candidates" },
          input: rel("candidates").action.input_schema, output: rel("candidates").action.output_schema!,
          errors: [], effects: { storage: ["read"] },
          examples: [{ input: { subject: { kind: "page", id: "p1" } }, output: { targets: [] } }],
        },
        {
          id: "attach.create", kind: "command", action_protocol: { kind: "placement_relation", relation: "card", role: "create" },
          input: rel("create").action.input_schema, output: rel("create").action.output_schema!,
          errors: [], effects: { storage: ["read", "write"] },
          examples: [{ input: { subject: { kind: "page", id: "p1" }, name: "New" }, output: { targets: [{ kind: "sandbox_card", id: "card-2" }] } }],
        },
      ],
      pages: [{ id: "home", title: "沙箱样例", regions: [{ id: "main", title: "主区", operationIds: [] }] }],
    };
    Object.assign(manifest, sandboxPluginManifest({
      pluginId: manifest.plugin_id, name: "Signed Sandbox Standing", version: manifest.version,
      publisher: manifest.publisher, presentation: false, effects: effectsFromContract(contract), contract,
    }));
    const parts: PluginComponentPlan[] = [
      { id: "title", pageId: "home", regionId: "main", intent: "heading", purpose: "标题", props: { title: "沙箱样例" } },
    ];
    const nodes = parts.map(part => ({ ...part, kind: pluginComponentChoices(part, contract)[0]!.kind }));
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.entrypoint] = SANDBOX_CODE;
    files[SANDBOX_PACKAGE_FILES.interface] = JSON.stringify({ parts, nodes });
    files["locales/en.json"] = JSON.stringify({
      format_version: 1, owner: manifest.plugin_id, locale: "en",
      messages: { "sandbox-standing.greeting": "Greeting", "sandbox-standing.greeting-summary": "Signed sandbox greeting" },
    });
  }, { pluginId: SIGNED_SANDBOX_ID });
}

test("P1-1 & P0-5: signed third-party sandbox package gets settings_entries (Workbench UI), resume_summary (MCP), placement_relation, and work_terminals (with revokePublisher live-PID kill)", { ...mac, timeout: 90_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Signed Sandbox Standing");
  const folder = await realpath(await mkdtemp(join(tmpdir(), "signed-wt-ws-")));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await home.host.ensureWebCatalog(home.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: home.home }, catalog =>
    catalog.commit(() => catalog.changeDirectories({
      project_id: project.project_id, actor_id: LOCAL_PERSON_ACTOR_ID,
      change: { kind: "set_output", target: { workspace_path: folder } },
      expected_revision: catalog.projectDirectories(project.project_id).revision,
    })),
  );

  const publisher = fixturePublisher("PSD-03");
  const projectClient = home.host.actionClient(project.reference);
  const installCaller = { ...sandboxPerson(), project_id: project.project_id };
  const preview = await projectClient.invoke(installCaller, ref(pluginInstallActions.preview), { bundle: signedStandingPackage(publisher) }) as { preview_id: string };
  await projectClient.invoke(installCaller, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Sandbox Publisher" });

  const person = await home.host.localPersonContext(project.reference);
  const views = (await projectClient.discover(person)).filter(item => item.provider.plugin_id === SIGNED_SANDBOX_ID);
  const byLocal = (localId: string) => views.find(item => item.action.local_id === localId)!;

  const kinds = await home.web.get<{ kinds: Record<string, string>; glyphs: Record<string, string> }>(`/projects/${project.project_id}/api/assistant/surface-kinds`);
  assert.equal(kinds.kinds[SIGNED_SANDBOX_ID], "sandbox_card");
  assert.equal(kinds.glyphs.sandbox_card, "bookmark");
  const brief = await home.web.get<{ html: string }>(`/api/projects/${project.project_id}/brief`);
  assert.match(brief.html, /Sandbox card/, "PSD-03 M2: the project brief renders the signed package's progress item");

  // 1. placement_relation: all 5 roles projected & live inside sandbox.
  for (const role of PLACEMENT_RELATION_ROLES) {
    assert.ok(views.some(item => item.action.placement_relation?.relation === "card" && item.action.placement_relation.role === role), `sandbox placement_relation ${role}`);
  }
  const bound = await projectClient.invoke(person, { capability_id: byLocal("attach.bind").capability_id, version: byLocal("attach.bind").version, provider_id: byLocal("attach.bind").provider.provider_id }, {
    subject: { kind: "page", id: "doc-sbx" }, target: { kind: "sandbox_card", id: "card-1" },
  });
  assert.deepEqual(bound, { targets: [{ kind: "sandbox_card", id: "card-1" }] });

  // 2. settings_entries: discovered in Workbench sidebar, rendered on /settings/<plugin_id>, writable via /api/settings/plugin-entries/write.
  const navRes = await fetch(`${home.origin}/settings/appearance?project=${encodeURIComponent(project.project_id)}`);
  assert.equal(navRes.status, 200);
  assert.ok((await navRes.text()).includes(`/settings/${SIGNED_SANDBOX_ID}`), "signed sandbox plugin appears in Workbench settings nav");
  const settingsBefore = await fetch(`${home.origin}/settings/${SIGNED_SANDBOX_ID}?project=${encodeURIComponent(project.project_id)}`);
  assert.equal(settingsBefore.status, 200);
  const settingsHtml = await settingsBefore.text();
  assert.match(settingsHtml, /Welcome/);
  const writeReply = await home.web.post<{ values: Array<{ key: string; value: unknown }> }>("/api/settings/plugin-entries/write", {
    ...settingsInstallation(settingsHtml), plugin_id: SIGNED_SANDBOX_ID, project_id: project.project_id,
    key: "greeting", layer: "project", change: { set: "Updated from Workbench" }, expected_revision: "2", request_id: "sbx-set-1",
  });
  assert.equal(writeReply.values[0]?.value, "Updated from Workbench");
  const settingsAfter = await fetch(`${home.origin}/settings/${SIGNED_SANDBOX_ID}?project=${encodeURIComponent(project.project_id)}`);
  assert.match(await settingsAfter.text(), /Updated from Workbench/);

  // Use the actual card menu route and read back the receiver's persisted content through its own subject reader.
  const menu = "/projects/" + project.project_id + "/api/mainline/receive";
  const targets = await (await home.request(menu + "/targets", { method: "POST", body: {} })).json() as { targets: Array<{ station: string; title: string }> };
  const destination = targets.targets.find(target => target.title === "Card collection");
  assert.ok(destination);
  const sent = await home.request(menu, { method: "POST", body: { station: destination.station, source: { kind: "sandbox_card", id: "card-1" }, title: "Delivered", text: "Body from the Workbench" } });
  const receipt = await sent.json() as { object?: { id: string }; error?: unknown };
  assert.equal(sent.status, 200, JSON.stringify(receipt));
  const ownerRead = byLocal("cards.read");
  const delivered = await projectClient.invoke(person, { capability_id: ownerRead.capability_id, version: ownerRead.version, provider_id: ownerRead.provider.provider_id }, { subject_id: receipt.object!.id }) as { content: string };
  assert.equal(delivered.content, "Body from the Workbench");

  // 3. resume_summary: aggregated by real MolisWorkServer context_resolve.
  const runtimeContext = { runtime_id: "codex", stable_work_context_id: "sbx-standing-ctx", host_declares_stable: true };
  await home.host.ensureWebCatalog(home.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: home.home }, catalog => {
    catalog.bindRuntimeContext({ context: runtimeContext, project_id: project.project_id, actor_id: LOCAL_PERSON_ACTOR_ID, user_confirmed: true });
  });
  const resumeView = byLocal("resume.summary");
  await home.grant("runtime:codex", project.project_id, [{ capability_id: resumeView.capability_id, version: resumeView.version }]);
  const runtimeServer = new MolisWorkServer("runtime", {
    databasePath: project.database_path, projectId: project.project_id, webBaseUrl: home.origin,
  }, { homeDirectory: home.home, runtimeContext }, home.host);
  t.after(() => runtimeServer.close());
  const resolved = JSON.parse(await runtimeServer.callTool("molis_work_v1_context_resolve", {})) as {
    resume: { sections: Array<{ plugin_id: string; focus: { subject: { id: string } } | null }> };
  };
  assert.equal(resolved.resume.sections.find(s => s.plugin_id === SIGNED_SANDBOX_ID)?.focus?.subject.id, "card-1");

  // 4. work_terminals + P0-5 revokePublisher live OS PID death!
  const promptOut = await projectClient.invoke(person, workTerminalActions.prompt, {
    plugin_id: SIGNED_SANDBOX_ID, subject: { kind: "sandbox_card", id: "card-1" },
  }) as { prompt: string };
  assert.match(promptOut.prompt, /Advance sandbox card card-1/);

  const pidFile = join(folder, "signed-wt.pid");
  const opened = await projectClient.invoke(person, workTerminalActions.open, {
    plugin_id: SIGNED_SANDBOX_ID, subject: { kind: "sandbox_card", id: "card-1" },
    command: "/bin/sh", args: ["-c", `echo $$ > '${pidFile}'; exec /bin/sleep 60`], key: "sbx-live",
  }) as { panel_id: string; started: boolean };
  assert.equal(opened.started, true);
  let pid = 0;
  for (let i = 0; i < 100 && !pid; i += 1) {
    if (existsSync(pidFile)) pid = Number((await readFile(pidFile, "utf8")).trim());
    if (!pid) await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.ok(pid > 0, "signed sandbox work terminal spawned a real OS process");
  assert.doesNotThrow(() => process.kill(pid, 0), "spawned process is alive before revoking publisher");

  // P0-5: Revoking the pinned publisher immediately kills the live OS process.
  await home.web.post("/api/settings/plugin-publishers/revoke", { key_id: publisher.identity });
  let alive = true;
  for (let i = 0; i < 60 && alive; i += 1) {
    try { process.kill(pid, 0); await new Promise(resolve => setTimeout(resolve, 25)); } catch { alive = false; }
  }
  assert.equal(alive, false, "P0-5: revoking publisher immediately kills live work-terminal OS process");
});

// 44C-3 (PSD-03, PSD-04a; BL-b44-psd03-sample-plugin): a third-party package under a reverse-domain id and a plugin studio package under
// `studio.<id>` are each installed from the real entry (the install preview, then the person's confirm), and each opens its own page in
// the workbench frame and answers a call from it, through the same routes a built-in plugin's page uses. Neither id is the Host's.
test("44C-3 PSD-03 PSD-04a a signed com.example package and a studio.<id> package install from the real entry, open their pages and answer their calls", { ...mac, timeout: 120_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Third-party standing");
  const prefix = "/projects/" + project.project_id, client = f.host.actionClient(project.reference), caller = { ...sandboxPerson(), project_id: project.project_id };
  const publisher = fixturePublisher("PSD-04a");
  for (const pluginId of [PACKAGE_PLUGIN_ID, "studio.4f0c7d1e-2b3a-4c5d-8e9f-0a1b2c3d4e5f"]) {
    assert.ok(!pluginId.startsWith("io.molis.work."), `${pluginId} is not under the Host's reserved prefix`);
    const preview = await client.invoke(caller, ref(pluginInstallActions.preview), { bundle: signedPackage(publisher, undefined, { pluginId }) }) as { preview_id: string };
    await client.invoke(caller, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Example publisher" });
    const page = await f.request(prefix + "/plugins/" + pluginId + "?frame=workbench");
    const html = await page.text();
    assert.equal(page.status, 200, `${pluginId}: its page is served, not 404: ${html.slice(0, 200)}`);
    const pageId = /"page_id":"([^"]+)"/u.exec(html)?.[1];
    assert.ok(pageId, `${pluginId}: the page is the package's own installed frame`);
    assert.ok(html.includes(`/api/plugins/${pluginId}/call`), `${pluginId}: the page calls through its own call route`);
    const call = await f.request(prefix + "/api/plugins/" + pluginId + "/call", { method: "POST", body: { componentId: "notes", binding: "read", payload: {} }, headers: { "x-molis-plugin-page": pageId } });
    assert.equal(call.status, 200, `${pluginId}: its call route answers, not 404: ${await call.clone().text()}`);
    assert.ok("value" in (await call.json() as object), `${pluginId}: the call's answer is the operation's value`);
    const views = (await client.discover(caller)).filter(view => view.provider.plugin_id === pluginId);
    assert.ok(views.length > 0, `${pluginId}: its operations are in the project's directory like a built-in plugin's`);
  }
});

/** Both publishers use identical operation and group names. Only the scope, signer and values distinguish these installations. */
function scopedSettingsPackage(scope: "home" | "project", version = "1.0.0") {
  const pluginId = "com.example.settings", publisher = fixturePublisher(scope);
  const layer = scope === "home" ? "personal" : "project", key = "greeting-" + scope, title = "Owner " + scope;
  const example = { values: [{ key, value: title, state: "ok", source: layer, revision: "1" }] };
  return signedPackage(publisher, (files, manifest) => {
    const contract: SandboxPluginContract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!);
    const complete = { ...contract, ui: { locales: { default: "en", available: ["en"] } },
      settings_entries: { entries: [{ key, title: { key: "settings.title" }, layers: [layer], schema: { type: "string", maxLength: 80 } }], read_operation: "settings.read", write_operation: "settings.write" },
      read_groups: [{ group_id: "values", title, description: title + " reads", operations: ["notes.list"] }],
    } satisfies SandboxPluginContract;
    complete.operations.push({ id: "settings.read", kind: "query", action_protocol: { kind: "settings", role: "read" }, input: SETTINGS_READ_INPUT_SCHEMA, output: SETTINGS_READ_OUTPUT_SCHEMA,
      effects: { storage: ["read"] }, errors: [], examples: [{ input: { keys: [key] }, output: example }] },
    { id: "settings.write", kind: "command", action_protocol: { kind: "settings", role: "write" }, input: SETTINGS_WRITE_INPUT_SCHEMA, output: SETTINGS_READ_OUTPUT_SCHEMA,
      effects: { storage: ["read", "write"] }, errors: [], examples: [{ input: { key, layer, change: { set: title }, expected_revision: "1", request_id: "set" }, output: example }] });
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(complete);
    files["locales/en.json"] = JSON.stringify({ format_version: 1, owner: pluginId, locale: "en", messages: { "settings.title": title } });
    files[SANDBOX_PACKAGE_FILES.entrypoint] = files[SANDBOX_PACKAGE_FILES.entrypoint]!.replace("export const operations", `
      const initial = ${JSON.stringify(example)};
      async function get(sdk) { return JSON.parse(await sdk.storage.get("setting") || JSON.stringify(initial)); }
      export const operations`).replace(/\};\s*$/u, `
      'settings.read': async (_, sdk) => get(sdk),
      'settings.write': async (input, sdk) => {
        const state = await get(sdk), row = state.values[0];
        if (input.expected_revision !== row.revision || input.key !== row.key) throw Error('stale setting');
        row.value = input.change.set; row.revision = String(Number(row.revision) + 1);
        await sdk.storage.set('setting', JSON.stringify(state)); return state;
      },
    };`);
    return { ...sandboxPluginManifest({ pluginId, version, name: title, publisher: manifest.publisher, presentation: false,
      contract: complete, effects: effectsFromContract(complete), ...(scope === "home" ? { runtime: { scope } } : {}) }),
      summary: title, ...(version === "1.0.0" ? {} : { upgrade_compatibility: { compatible_from_versions: ["1.0.0"] } }) };
  }, { pluginId, scope, version });
}

test("44C-01/02 PSD-04 same-id publishers expose separate settings and task categories", { ...mac, timeout: 180_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Scoped settings"), pluginId = "com.example.settings";
  const client = f.host.actionClient(project.reference), caller = sandboxPerson(project.project_id);
  const install = async (scope: "project" | "home", version?: string) => {
    const preview = await client.invoke(caller, ref(pluginInstallActions.preview), { bundle: scopedSettingsPackage(scope, version) }) as { preview_id: string };
    await client.invoke(caller, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Owner " + scope });
  };
  await install("home"); await install("project");
  const query = "?project=" + encodeURIComponent(project.project_id);
  const nav = await (await f.request("/settings/appearance" + query)).text();
  const page = async (scope: string) => {
    const path = nav.match(new RegExp("/settings/com[.]example[.]settings~" + scope + "~plugin-install-[a-f0-9]+"))?.[0];
    assert.ok(path, scope);
    const response = await f.request(path + query);
    assert.equal(response.status, 200);
    return response.text();
  };
  const write = (identity: ReturnType<typeof settingsInstallation>, value: string, revision: string) =>
    f.request("/api/settings/plugin-entries/write", { method: "POST", body: { ...identity, plugin_id: pluginId, project_id: project.project_id,
      key: "greeting-" + identity.scope, layer: identity.scope === "home" ? "personal" : "project", change: { set: value }, expected_revision: revision, request_id: value } });
  const home = settingsInstallation(await page("home")), local = settingsInstallation(await page("project"));
  assert.notEqual(home.plugin_install_id, local.plugin_install_id);
  assert.equal((await write(home, "home-updated", "1")).status, 200);
  assert.doesNotMatch(await page("project"), /home-updated/);
  assert.equal((await write(local, "project-updated", "1")).status, 200);
  assert.match(await page("project"), /project-updated/);
  assert.match(await page("home"), /home-updated/);
  const owner = await f.host.localPersonContext(project.reference);
  const current = () => client.invoke(owner, ref(agentTaskGrantActions.list), {}) as Promise<TaskGrantListResult>;
  const categories = (await current()).categories.filter(category => category.plugin_id === pluginId);
  assert.deepEqual(categories.map(row => row.description).sort(), ["Owner home reads", "Owner project reads"]);
  assert.equal(new Set(categories.map(row => row.provider_id)).size, 1);
  const grant = categories.find(row => row.description === "Owner home reads")!;
  const category = { provider_id: grant.provider_id, group_id: grant.group_id, installation: grant.installation };
  const set = (categories: typeof category[], expected_revision: string) => client.invoke(owner, ref(agentTaskGrantActions.set),
    { plugin_install_id: local.plugin_install_id, key: "sample", categories, expected_revision }) as Promise<TaskGrantSubject>;
  const held = await set([category], "");
  assert.deepEqual(held.categories.map(row => [row.description, row.status]), [["Owner home reads", "granted"]]);
  await set([], held.revision);
  await assert.rejects(set([category], held.revision), { code: "actions.conflict" });
  await install("project", "1.1.0");
  assert.notEqual((await write(local, "old-release", "2")).status, 200);
  assert.match(await page("home"), /home-updated/);
});
