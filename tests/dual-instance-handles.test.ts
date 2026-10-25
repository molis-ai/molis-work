import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { defineAction, definePlugin } from "@molis-ai/molis-work-plugin-sdk";
import {
  createPluginBackgroundClient, createPluginMaterialsClient, createPluginModelClient, createPluginOwnerFilesClient, MemoryPluginRuntimeRepository,
  PluginRuntime, type PluginMaterialsPort, type PluginModelPort,
} from "@molis-ai/molis-work-plugin-runtime";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineInstructionPrompt, instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { PluginBackgroundClient, PluginDefinition, PluginManifest, PluginMaterialsClient, PluginModelClient, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginOwnerFilesClient, PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin-owner-files";
import { openDualHome } from "./fixtures/dual-home.js";
import { dualPlugin } from "./fixtures/dual-plugin.js";

/**
 * DUAL-16, S-48 (specs/dual-instance-plugins U3): the two halves of a dual-instance plugin share `install_id` and differ in
 * `installation_generation`. A half's code may keep the other half's handles (both run in this process), but every service checks
 * the running action's instance, not only its installation: inside one half's action the other half's model, owner files,
 * materials and background handles are refused before they reach their port, and the half's own handles pass that check.
 * Storage, events and the actions client are proven end to end, in a Test Home whose Host runs both halves (`openDualHome`).
 */

const PLUGIN = "io.molis.work.example.handles";
const PROJECT = "project-one";
const FILES_READ = "handles:files-read", FILES_WRITE = "handles:files-write";
const PERMISSIONS = ["model:invoke", "materials:read", FILES_READ];
type Half = "home" | "project";
type Service = "model" | "files" | "materials" | "background";
type Handles = { model: PluginModelClient; files: PluginOwnerFilesClient; materials: PluginMaterialsClient; background: PluginBackgroundClient };

/** One concurrent query per half. It tries the handle `service` of the half `use` names and answers with what came back. */
function act(half: Half, handles: Partial<Record<Half, Handles>>) {
  return defineAction<{ use: Half; service: Service }, { outcome: string }>({
    capability_id: `${PLUGIN}.${half}`, version: 1, operation: "query",
    action: { title: half, description: `${half} 一半的探针`, kind: "query", scope: half, audiences: ["user"], permissions: PERMISSIONS,
      scheduling: "concurrent", subject_kinds: [],
      input_schema: { type: "object", additionalProperties: false, required: ["use", "service"],
        properties: { use: { type: "string", enum: ["home", "project"] }, service: { type: "string", enum: ["model", "files", "materials", "background"] } } },
      output_schema: { type: "object", properties: { outcome: { type: "string" } }, required: ["outcome"] } },
  }, async (_context, input) => ({ outcome: await attempt(handles[input.use]!, input.service) }));
}

const prompt = instructed(defineInstructionPrompt({ owner_id: PLUGIN, prompt_id: "probe", version: 1, title: "探针", purpose: "测试",
  used_by: ["双实例探针"], body: "回答。" }), "数据");
async function attempt(handles: Handles, service: Service): Promise<string> {
  try {
    if (service === "model") await handles.model.complete(prompt);
    else if (service === "files") handles.files.stat("notes");
    else if (service === "materials") await handles.materials.extract!({ file_name: "a.txt", bytes: new Uint8Array([0x61]) });
    else await handles.background.start(async () => "done");
    return "ok";
  } catch (error) {
    return error instanceof ActionError ? error.code : error instanceof Error ? error.message : String(error);
  }
}

function manifest(actions: PluginManifest["actions"]): PluginManifest {
  return { schema_version: 2, host_api_version: 2, plugin_id: PLUGIN, version: "1.0.0", name: "句柄探针", kind: "app",
    publisher: { publisher_id: "molis", signature: "handles-example" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: ["storage:private", "model:invoke", "materials:read", FILES_READ, FILES_WRITE].map(permission => ({ permission, required: true, reason: "句柄探针" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions };
}

/** Each port notes which half's handle reached it; a refused handle never does. */
function ports(half: Half, reached: string[]) {
  const unused = () => { throw new Error("不该用到"); };
  const model: PluginModelPort = { choices: () => [], availability: () => ({ available: true }), decodeJson: () => ({ ok: false }),
    complete: async () => { reached.push(`${half}.model`); throw new Error("reached"); } };
  const files: PluginOwnerFilesWriter = { stat: () => { reached.push(`${half}.files`); return null; }, read: unused, list: unused, mkdir: unused,
    writeFile: unused, replaceFileAtomic: unused, copyFile: unused, removeTree: unused, setAccess: unused };
  const materials: PluginMaterialsPort = { readSource: unused, readDocuments: unused,
    extract: async () => { reached.push(`${half}.materials`); throw new Error("reached"); } };
  return { model, files, materials };
}

function half(which: Half, actions: { home: ReturnType<typeof act>; project: ReturnType<typeof act> }, handles: Partial<Record<Half, Handles>>,
  reached: string[], contexts: Partial<Record<Half, PluginStartContext>>): PluginDefinition {
  const own = manifest([actions.home.definition, actions.project.definition]);
  return definePlugin({ manifest: own, async start(context) {
    contexts[which] = context;
    const gate = { install_id: context.install_id, installation_generation: context.installation_generation, assertActive() {},
      requireGrant: (permission: string) => context.requireGrant(permission) };
    const port = ports(which, reached);
    handles[which] = {
      model: createPluginModelClient(own, port.model, gate),
      files: createPluginOwnerFilesClient(own, { store_name: "probe", entries: [], read_permission: FILES_READ, write_permission: FILES_WRITE },
        port.files, gate).client,
      materials: createPluginMaterialsClient(own, port.materials, { ...gate, project_id: context.project_id ?? null }),
      background: createPluginBackgroundClient(gate).client,
    };
    return { kind: "app", actions: [actions[which].handler] };
  } });
}

async function openHalves() {
  const service = new ActionService(), handles: Partial<Record<Half, Handles>> = {}, reached: string[] = [];
  const contexts: Partial<Record<Half, PluginStartContext>> = {};
  const actions = { home: act("home", handles), project: act("project", handles) };
  const runtime = (redemption: { partial: true; outside_project?: true }, projectId?: string) => new PluginRuntime(new MemoryPluginRuntimeRepository(),
    undefined, { redemption: () => redemption, actions: { registry: service, ...(projectId ? { project_id: projectId } : {}), providerId: () => PLUGIN } });
  for (const [which, target] of [["home", runtime({ partial: true, outside_project: true })], ["project", runtime({ partial: true }, PROJECT)]] as const) {
    const definition = half(which, actions, handles, reached, contexts);
    const installed = target.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: definition.manifest.permissions.map(item => item.permission) }).install;
    await target.start(installed.install_id);
  }
  const home: ActionCallContext = { actor_id: "alice", audience: "user", permissions: PERMISSIONS };
  const callers: Record<Half, ActionCallContext> = { home, project: { ...home, project_id: PROJECT } };
  const run = async (inside: Half, use: Half, used: Service) =>
    (await service.invoke(callers[inside], actions[inside].definition, { use, service: used })).outcome;
  return { run, reached, contexts };
}

const refusals: Record<Service, string> = { model: "plugin.model_action_required", files: "actions.forbidden",
  materials: "plugin.materials_action_required", background: "plugin.background_action_required" };

test("DUAL-16, S-48: the two halves share the installation and are two instances", async () => {
  const { contexts } = await openHalves();
  assert.equal(contexts.home!.install_id, contexts.project!.install_id);
  assert.notEqual(contexts.home!.installation_generation, contexts.project!.installation_generation);
});

for (const [inside, other] of [["project", "home"], ["home", "project"]] as const) {
  test(`DUAL-16, S-48: inside the ${inside} half's action the ${other} half's model, owner files, materials and background handles are refused`, async () => {
    const { run, reached } = await openHalves();
    for (const used of ["model", "files", "materials", "background"] as const) {
      assert.equal(await run(inside, other, used), refusals[used], `${other} 一半的 ${used} 句柄`);
    }
    assert.deepEqual(reached, [], "被拒的句柄不到端口");

    // The positive control: the half's own handles pass the instance check. The model and materials reach their port (the model
    // service answers its port's failure as its own `plugin.model_failed`); owner files read; the background handle goes on to the
    // next check, which a query does not pass.
    assert.equal(await run(inside, inside, "model"), "plugin.model_failed");
    assert.equal(await run(inside, inside, "files"), "ok");
    assert.equal(await run(inside, inside, "materials"), "reached");
    assert.equal(await run(inside, inside, "background"), "plugin.background_undeclared");
    assert.deepEqual(reached, [`${inside}.model`, `${inside}.files`, `${inside}.materials`]);
  });
}

/** Refused as the other instance's write, not for any other reason the action might have. */
const otherInstance = (error: unknown) => error instanceof Error && "code" in error && error.code === "actions.forbidden"
  && error.message.includes("另一个插件实例");

test("DUAL-16, S-48: each half's private storage takes a write only from its own half's action", { timeout: 60_000 }, async t => {
  const s = await openDualHome(t, undefined, dualPlugin("dualprobe", true)), { actions } = s.dual;
  const context = await s.page();
  const homeStore = s.dual.services.home!.storage!, projectStore = s.dual.services.project!.storage!;

  s.dual.inside(() => homeStore.set("written", "by-project"));
  await assert.rejects(s.client.invoke(context, actions.project, {}), otherInstance, "the project half's action holding the Home half's storage");
  assert.equal(homeStore.get("written"), null, "nothing reached the Home half's data");
  s.dual.inside(() => projectStore.set("written", "by-project"));
  assert.deepEqual(await s.client.invoke(context, actions.project, {}), { half: "project", project_id: s.projectId });
  assert.equal(projectStore.get("written"), "by-project");

  s.dual.inside(() => projectStore.set("written", "by-home"));
  await assert.rejects(s.client.invoke(context, actions.home, {}), otherInstance, "the Home half's action holding the project half's storage");
  assert.equal(projectStore.get("written"), "by-project");
  s.dual.inside(() => homeStore.set("written", "by-home"));
  assert.deepEqual(await s.client.invoke(context, actions.home, {}), { half: "home", project_id: s.projectId });
  assert.equal(homeStore.get("written"), "by-home");
});

test("DUAL-16, S-48: the project half's events and actions handles refuse a call from the other half's action", { timeout: 60_000 }, async t => {
  const s = await openDualHome(t, undefined, dualPlugin("dualprobe", true)), { actions } = s.dual;
  const context = await s.page();
  const changed = { event_type_id: `${s.dual.id}.changed`, type_version: 1, payload: {} };
  // The Home half is given no events service (DUAL-05), so only the project half's handle can be held by the other half.
  const events = s.dual.services.project!.events!;
  s.dual.inside(() => events.publish(changed));
  await assert.rejects(s.client.invoke(context, actions.home, {}), otherInstance, "the Home half's action holding the project half's events");
  s.dual.inside(() => assert.equal(events.publish(changed).accepted, true));
  assert.deepEqual(await s.client.invoke(context, actions.project, {}), { half: "project", project_id: s.projectId });

  // A plugin calls its own actions through its half's actions client, passing its caller on; the other half's client refuses it.
  const homeActions = s.dual.services.home!.actions!, projectActions = s.dual.services.project!.actions!;
  s.dual.inside(caller => homeActions.invoke(actions.home, {}, caller));
  await assert.rejects(s.client.invoke(context, actions.project, {}), otherInstance, "the project half's action holding the Home half's actions client");
  s.dual.inside(async caller => assert.deepEqual(await projectActions.invoke(actions.reach, {}, caller), { half: "project", project_id: s.projectId }));
  assert.deepEqual(await s.client.invoke(context, actions.project, {}), { half: "project", project_id: s.projectId });
});
