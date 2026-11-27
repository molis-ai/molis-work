import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalProjectDatabase, MolisWorkLocalHost, openHomePluginStore, openProjectVersionStores, partitionPluginScope, startPartitionPluginInstance } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, PERSONAL_SPACE_PROJECT_ID, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { HOST_BUILD_TRUST, installIdentity } from "@molis-ai/molis-work-plugin-runtime";
import { createTodoPlugin, TODO_PLUGIN_ID, todoPrompts } from "@molis-ai/molis-work-plugin-todo";
import { pluginActions } from "./fixtures/plugin-actions.js";

test("RAC-191 Todo activation carries its organizer role and prompt body into the Host-issued caller declaration", async t => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "todo-agent-declaration-")));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  // Every Home has the personal space from the catalog's first open (batch 106).
  const personal = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => catalog.getProject(PERSONAL_SPACE_PROJECT_ID));
  const store = new LocalProjectDatabase(personal.database_path);
  const installs = openHomePluginStore(home);
  const actions = pluginActions(store, PERSONAL_SPACE_PROJECT_ID);
  const probe: ActionDefinition<Record<string, never>, boolean> = {
    capability_id: "fixture.todo.declaration", version: 1, operation: "query",
    action: { title: "Read Todo caller", description: "Captures the actual activation's caller declaration", kind: "query", scope: "project",
      audiences: ["plugin"], permissions: ["todo:read"], subject_kinds: [], input_schema: { type: "object", additionalProperties: false } },
  };
  let captured: HostPluginCaller | undefined;
  actions.registry.registerProvider({ provider: { provider_id: "platform", title: "Molis Work", kind: "system" },
    definitions: [probe], handlers: [{ ...probe, handle(context) { captured = context.host_plugin; return true; } }] });
  const definition = createTodoPlugin(), start = definition.start;
  const contexts: PluginStartContext[] = [];
  // Only the observation action is added: the real Todo start and its Agent declaration run unchanged.
  definition.manifest = { ...definition.manifest, capabilities: { ...definition.manifest.capabilities,
    consumes: [...definition.manifest.capabilities.consumes, probe.capability_id] } };
  definition.start = context => { contexts.push(context); return start(context); };
  const ports = { store, ...openProjectVersionStores(store), projectId: PERSONAL_SPACE_PROJECT_ID, actorId: LOCAL_PERSON_ACTOR_ID, homeDirectory: home, actions,
    escapeHtml: String, translate: (value: string) => value };
  const scope = partitionPluginScope(home, PERSONAL_SPACE_PROJECT_ID, TODO_PLUGIN_ID, installIdentity(definition.manifest));
  // The Host's own build starts it, as the per-partition supervisor does for a registration of this build.
  const instance = await startPartitionPluginInstance(ports, scope, { definition, trust: HOST_BUILD_TRUST }, installs.db);
  t.after(async () => {
    try { await instance.stop(); }
    finally { installs.db.close(); store.close(); await rm(home, { recursive: true, force: true }); }
  });
  assert.equal(contexts.length, 1);
  const client = contexts[0]!.services?.actions;
  assert.ok(client);
  assert.equal(await client.invoke(probe, {}), true);
  assert.ok(captured, "the production action client forwards the Host-issued caller");
  assert.equal(captured.plugin_id, TODO_PLUGIN_ID);
  assert.equal(captured.install_id, scope.install_id);
  assert.equal(captured.actor_id, LOCAL_PERSON_ACTOR_ID);
  assert.equal(captured.project_id, PERSONAL_SPACE_PROJECT_ID, "Todo runs in the partition it was started for");
  const agent = captured.declaration.manifest.agent;
  assert.deepEqual(agent?.roles.find(role => role.role_id === "organizer")?.prompts, ["todo-organizer"]);
  assert.equal(agent?.prompts.find(prompt => prompt.prompt_id === "todo-organizer")?.version, 2);
  const prompt = captured.declaration.agent_prompts?.find(item => item.prompt_id === "todo-organizer");
  assert.ok(prompt?.body.trim(), "the activation carries the prompt body, not only Manifest metadata");
  assert.equal(prompt.version, 2);
  const shipped = todoPrompts.find(item => item.prompt_id === "todo-organizer");
  assert.equal(prompt.body, shipped?.body);
  assert.ok(prompt.body_by_locale?.en?.trim());
  assert.deepEqual(prompt.body_by_locale, shipped?.body_by_locale);
});
