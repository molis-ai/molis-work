import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HomePluginHost } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createTodoPlugin, TODO_DATABASE, TODO_PLUGIN_ID, todoPrompts } from "@molis-ai/molis-work-plugin-todo";

test("RAC-191 Todo activation carries its organizer role and prompt body into the Host-issued caller declaration", async t => {
  const home = await mkdtemp(join(tmpdir(), "todo-agent-declaration-"));
  const registry = new ActionService();
  const probe: ActionDefinition<Record<string, never>, boolean> = {
    capability_id: "fixture.todo.declaration", version: 1, operation: "query",
    action: { title: "Read Todo caller", description: "Captures the actual activation's caller declaration", kind: "query", scope: "home",
      audiences: ["plugin"], permissions: ["todo:read"], subject_kinds: [], input_schema: { type: "object", additionalProperties: false } },
  };
  let captured: HostPluginCaller | undefined;
  const unregister = registry.registerProvider({ provider: { provider_id: "platform", title: "Molis Work", kind: "system" },
    definitions: [probe], handlers: [{ ...probe, handle(context) { captured = context.host_plugin; return true; } }] });
  const definition = createTodoPlugin(), start = definition.start;
  const contexts: PluginStartContext[] = [];
  // Only the observation action is added: the real Todo start and its Agent declaration run unchanged.
  definition.manifest = { ...definition.manifest, capabilities: { ...definition.manifest.capabilities,
    consumes: [...definition.manifest.capabilities.consumes, probe.capability_id] } };
  definition.start = context => { contexts.push(context); return start(context); };
  const supervisor = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry, client: registry,
    entries: [{ scope: "home", manifest: definition.manifest, create: () => definition, database: TODO_DATABASE,
      package_name: "@molis-ai/molis-work-plugin-todo", factory_export: "createTodoPlugin" }] });
  t.after(async () => {
    try { await supervisor.close(); }
    finally { unregister(); await rm(home, { recursive: true, force: true }); }
  });
  await supervisor.ready();
  const installation = supervisor.installation(TODO_PLUGIN_ID);
  assert.equal(installation?.state, "running");
  assert.equal(contexts.length, 1);
  const actions = contexts[0]!.services?.actions;
  assert.ok(actions);
  assert.equal(await actions.invoke(probe, {}), true);
  assert.ok(captured, "the production action client forwards the Host-issued caller");
  assert.equal(captured.plugin_id, TODO_PLUGIN_ID);
  assert.equal(captured.install_id, installation!.install_id);
  assert.equal(captured.actor_id, LOCAL_PERSON_ACTOR_ID);
  assert.equal(captured.project_id, null);
  const agent = captured.declaration.manifest.agent;
  assert.deepEqual(agent?.roles.find(role => role.role_id === "organizer")?.prompts, ["todo-organizer"]);
  assert.equal(agent?.prompts.find(prompt => prompt.prompt_id === "todo-organizer")?.version, 2);
  const prompt = captured.declaration.agent_prompts?.find(item => item.prompt_id === "todo-organizer");
  assert.ok(prompt?.body.trim(), "the activation carries the prompt body, not only Manifest metadata");
  assert.equal(prompt.version, 2);
  assert.equal(prompt.body, todoPrompts.find(item => item.prompt_id === "todo-organizer")?.body);
});
