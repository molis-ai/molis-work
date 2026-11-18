import { pluginActions, servesRoles, withFakeAgentHost } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { openCharacters } from "@molis-ai/molis-work-module-characters";
import { CHARACTER_ARTIFACT_TYPE, characterRoleActions } from "@molis-ai/molis-work-contracts/modules/characters";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseProjectPlugins, handleProjectPluginHttp, charactersProvider, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { AGENT_RUNTIME_CAPABILITIES, agentHostCapabilities as agent, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectDirectoryActions } from "@molis-ai/molis-work-contracts/modules/projects";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

test("ROLE-07 ROLE-13 Coding saves a stable role choice, blocks an unavailable one before SDK creation, and preserves task drafts across reopen", async () => {
  const home = mkdtempSync(join(tmpdir(), "coding-characters-")), dbPath = join(home, "board.db");
  await seedConfiguredModels(home); seedDemoBoard(dbPath); let store = new LocalProjectDatabase(dbPath);
  // The person's originals, each a member of this project (role-service-design §2): Coding offers the members.
  const personal = openCharacters(home, "web-user"), draft = personal.service.create({ title: "原角色", instructions: "旧的固定要求", host_tools: null });
  const other = personal.service.create({ title: "另一个角色", instructions: "别的要求", host_tools: null });
  const member = personal.service.roles.addMember(DEMO_PROJECT_ID, draft.character_id); personal.service.roles.addMember(DEMO_PROJECT_ID, other.character_id);
  const ref = { kind: "project" as const, member_id: member.current.member_id };
  // A newer version of the original after the choice: the choice stays the member, never a version.
  personal.service.update(draft.character_id, draft.revision, { title: "原角色", instructions: "新要求", host_tools: null });
  const ports = () => ({ db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event), eventCursor: (projectId: string) => store.eventCursor(projectId) });
  const artifacts = () => new ArtifactsModule(ports());
  const sessions = codingSessions(store);
  for (const id of ["app", "new", "fresh"]) await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: id, title: id, runtime_id: "prologue", at: new Date().toISOString() });
  const starts: AgentStartRequest[] = []; let created = 0;
  // Characters is the Host's own provider since CHR-1 (project-host.ts registers it for each project); this harness has no Host,
  // so it registers the same provider in each project registry it builds, over the person's drafts and the project's 成果库.
  const withCharacters = new WeakSet<object>();
  const roleCalls: Record<string, number> = { [characterRoleActions.list.capability_id]: 0, [characterRoleActions.resolve.capability_id]: 0 };
  const counted = async <T>(work: () => Promise<T>) => {
    for (const id in roleCalls) roleCalls[id] = 0;
    const result = await work();
    return { result, list: roleCalls[characterRoleActions.list.capability_id], resolve: roleCalls[characterRoleActions.resolve.capability_id] };
  };
  const actions = () => {
    const project = pluginActions(store, DEMO_PROJECT_ID);
    if (withCharacters.has(project.registry)) return project;
    withCharacters.add(project.registry);
    servesRoles(project);
    const library = artifacts();
    const provider = charactersProvider({ project_id: DEMO_PROJECT_ID, artifacts: library, processItems: new ProcessItemsModule(ports()) }, {
      actorId: "web-user", open: () => ({ service: personal.service, close: () => {} }),
      references: () => library.query.listArtifacts(DEMO_PROJECT_ID, { artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1 }).map(({ artifact_id, version }) => ({ artifact_id, version })) });
    // ROLE-13: each role read is counted where Characters answers it.
    project.registry.registerProvider({ ...provider, handlers: provider.handlers.map(handler => handler.capability_id in roleCalls
      ? { ...handler, handle: (...args: Parameters<typeof handler.handle>) => { roleCalls[handler.capability_id]++; return handler.handle(...args); } } : handler) });
    return project;
  };
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: home, projectId: DEMO_PROJECT_ID, actions: actions(), actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    agentHost: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      // The Runtime directory says the session's Runtime has verified a Character's tool limits (PG-054): the Runtime's declaration, not its id.
      if (definition.capability_id === agent.listRuntimes.capability_id) return [{ runtime_id: "prologue", display_name: "Prologue", provider_version: "fixture", supports_character_limits: true,
        capabilities: Object.fromEntries(AGENT_RUNTIME_CAPABILITIES.map(name => [name, "supported"])) }] as Output;
      if (definition.capability_id === projectDirectoryActions.get.capability_id) return [{ workspace_id: "work", canonical_path: home }] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "reader", available: true }] as Output;
      if (definition.capability_id === agent.listActions.capability_id) return [] as Output;
      if (definition.capability_id === agent.createSession.capability_id) { created++; return { runtime_id: "prologue", session_id: `sdk-${created}` } as Output; }
      if (definition.capability_id === agent.startRun.capability_id) { starts.push(structuredClone((args as any[])[1])); return { ref: { session_id: "sdk", run_id: "run" } } as Output; }
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [] } as Output;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), withFakeAgentHost(host())).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (suffix = "", method = "GET", body?: unknown, id = "app") => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/${id}${suffix}`, {
      method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }); return { status: result.status, body: await result.json() };
  };
  const ok = async (reply: Promise<{ status: number; body: unknown }>) => { const { status, body } = await reply; assert.equal(status, 200, JSON.stringify(body)); };
  const start = (extra = {}, id = "app") => request("/runs", "POST", { task: "保留原任务", intent: "discuss", workspace_id: "work", provider_id: "p", model_id: "m", ...extra }, id);
  try {
    assert.equal((await request()).body.character, null);
    const choices = await request("/characters");assert.equal(choices.status, 200, JSON.stringify(choices.body));
    assert.equal(choices.body.characters.length, 2);assert.ok(choices.body.characters.every((item: any) => item.available));
    // A choice is the member's id alone: text from the browser riding along is refused, not kept.
    assert.equal((await request("", "PATCH", { character: { ...ref, instructions: "伪造正文" }, draft: "不要丢失任务",expected_input_revision:0 })).status, 400);
    await ok(request("", "PATCH", { character: ref, draft: "不要丢失任务",expected_input_revision:0 }));
    assert.deepEqual((await request()).body.character, ref);assert.equal((await request()).body.character_title, "原角色");
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);store.close();store = new LocalProjectDatabase(dbPath);
    assert.deepEqual((await request()).body.character, ref);assert.equal((await request()).body.draft, "不要丢失任务");
    // ROLE-13: the picker is one `roles.list`; starting the task resolves its role once.
    const listed = await counted(() => request("/characters"));assert.deepEqual([listed.list, listed.resolve], [1, 0]);
    const started = await counted(() => ok(start()));assert.deepEqual([started.list, started.resolve], [1, 0], "a chosen role is checked in one roles.list, never resolved again");
    assert.deepEqual(starts[0].budget, {max_turns:60});assert.deepEqual(starts[0].character, ref, "only the stable choice reaches Agent Host, not browser text or a version");
    for (const character of [{ ...ref, version: 99 }, { kind: "project", member_id: "foreign-member" }]) assert.equal((await start({ character }, "new")).status, 400);
    assert.equal(created, 1);
    await ok(request("", "PATCH", { character: ref }, "new"));
    personal.service.roles.setMemberState(DEMO_PROJECT_ID, ref.member_id, member.revision, "disabled");
    // Plan C: a turned-off role is not chosen anew, but the session that already holds it keeps its task draft.
    assert.equal((await request("", "PATCH", { character: ref }, "new")).status, 400);
    await ok(request("", "PATCH", { draft: "来源停用仍能保存",expected_input_revision:0 }, "new"));
    assert.equal((await start({}, "new")).status, 400);assert.equal(created, 1);assert.equal(starts.length, 1);
    assert.equal((await request("", "GET", undefined, "new")).body.draft, "来源停用仍能保存");
    const turnedOff = (await request("/characters")).body.characters.find((item: any) => item.ref.member_id === ref.member_id);
    assert.deepEqual([turnedOff.available, turnedOff.reason], [false, "disabled"]);
    await ok(request("", "PATCH", { character: null }, "new"));
    await ok(start({}, "new"));assert.equal(starts[1].character, null);
    assert.equal((await request("", "PATCH", { character: { ...ref, version: 0 } })).status, 400);
    assert.deepEqual(starts[0].character, ref);
    // ROLE-13: a session with no choice of its own takes the default in one roles.resolve at its first round, checked in one roles.list.
    personal.service.roles.setDefault(null, { layer: "personal", selection: { kind: "personal", character_id: other.character_id } });
    const inherited = await counted(() => ok(start({}, "fresh")));
    assert.deepEqual([inherited.list, inherited.resolve], [1, 1]);
    assert.deepEqual(starts.at(-1)!.character, { kind: "personal", character_id: other.character_id });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    personal.close();store.close();rmSync(home, { recursive: true, force: true });
  }
});
