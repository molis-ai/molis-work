import assert from "node:assert/strict";
import test from "node:test";
import { withFunctionsService } from "@molis-ai/molis-work-app-local-host";
import {
  ActionError, type ActionCallContext, type ActionDefinition, type ActionProviderRegistration, type ActionSceneDefinition,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorKind, inspectActionDeclarations, parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { openTestHome } from "./fixtures/test-home.js";

const PROVIDER = "io.molis.work.example.rule-subjects";
const OPTIONS = { env: {}, credential: () => null };
const CALLER: ActionCallContext = { actor_id: "owner", project_id: null, audience: "user", permissions: [] };
const BAD_KINDS = [[], ["outside_item"], ["fixture_item", "outside_item"]];

function scene(subjectKinds: readonly string[], ruleKinds: readonly string[], key = "fixture_subjects"): ActionSceneDefinition {
  return { scene_id: key, version: 1, title: "选择下一步", description: "为声明的对象选择下一步", trigger: "对象到达", scope: "home",
    subject_kinds: subjectKinds, permissions: [], input_schema: { type: "object" }, result_schema: { type: "object" },
    default_rule: { function_key: key, name: "对象规则", instructions: "按对象内容选择下一步。", subject_kinds: ruleKinds,
      options: [{ key: "first", description: "第一项" }, { key: "second", description: "第二项" }] } };
}

function manifest(scenes: readonly ActionSceneDefinition[]) {
  return { schema_version: 2, host_api_version: 2, plugin_id: PROVIDER, version: "0.1.0", name: "对象规则示例", kind: "native",
    publisher: { publisher_id: "fixture", signature: "fixture-rule-subjects" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    actions: [], action_scenes: scenes };
}

function declarationError(code: string, message: string) {
  return (error: unknown) => error instanceof ActionError && actionErrorKind(error) === "invalid" && error.code === code && error.message === message;
}

test("RAC-487-A SDK inspection and Manifest parsing reject empty, outside and mixed default-rule subjects in a restricted scene", () => {
  for (const kinds of BAD_KINDS) {
    const candidate = scene(["fixture_item", "fixture_note"], kinds);
    const message = `消费场景 ${candidate.scene_id} 的默认规则无效`;
    assert.deepEqual(inspectActionDeclarations([], [candidate]), [message], JSON.stringify(kinds));
    assert.throws(() => parsePluginManifest(manifest([candidate])), declarationError("plugin.declaration_invalid", message));
  }
});

test("RAC-487-B legal subsets and generic scenes retain their public declaration contracts", () => {
  for (const kinds of [["fixture_item"], ["fixture_note"], ["fixture_note", "fixture_item"]]) {
    const candidate = scene(["fixture_item", "fixture_note"], kinds);
    assert.deepEqual(inspectActionDeclarations([], [candidate]), []);
    assert.deepEqual(parsePluginManifest(manifest([candidate])).action_scenes, [candidate]);
  }
  for (const kinds of [[], ["choice_item"]]) {
    const candidate = scene([], kinds);
    assert.deepEqual(inspectActionDeclarations([], [candidate]), []);
    assert.deepEqual(parsePluginManifest(manifest([candidate])).action_scenes, [candidate]);
  }
  const missing = { ...scene([], []), subject_kinds: undefined };
  const message = `消费场景 ${missing.scene_id}@1 的触发、输入输出或权限定义不完整`;
  assert.deepEqual(inspectActionDeclarations([], [missing]), [message]);
  assert.throws(() => parsePluginManifest({ ...manifest([]), action_scenes: [missing] }), declarationError("plugin.declaration_invalid", message));
});

test("RAC-487-C Kernel registration refuses the whole provider before rule writes; corrected subsets and generic rules register and run", async t => {
  const home = await openTestHome(t, { host: { functions: OPTIONS } });
  const registry = home.host.actionRegistry();
  const scenes = () => home.host.sceneClient().discoverScenes(CALLER);
  const actions = () => home.host.inspectActions(CALLER);
  const rules = () => withFunctionsService(home.home, service => service.list(), OPTIONS);
  const probe: ActionDefinition = { capability_id: "fixture.subjects.probe", version: 1, operation: "query",
    action: { title: "检查登记", description: "确认合法提供方可调用", kind: "query", scope: "home", audiences: ["user"], permissions: [],
      subject_kinds: [], input_schema: { type: "object" }, output_schema: { type: "object" } } };
  let calls = 0;
  const registration = (declarations: readonly ActionSceneDefinition[]): ActionProviderRegistration => ({
    provider: { provider_id: PROVIDER, plugin_id: PROVIDER, title: "对象规则示例", kind: "plugin" }, definitions: [probe],
    handlers: [{ ...probe, handle: () => { calls++; return { registered: true }; } }], scenes: declarations,
    scene_handlers: declarations.map(({ scene_id, version }) => ({ scene_id, version, bindings: () => [], bind: () => undefined, consume: () => ({}) })),
  });
  const beforeScenes = await scenes();
  const beforeActions = await actions();
  const beforeRules = rules();
  const validFirst = scene(["fixture_item", "fixture_note"], ["fixture_note"], "fixture_first");
  for (const kinds of BAD_KINDS) {
    const invalid = scene(["fixture_item", "fixture_note"], kinds);
    assert.throws(() => registry.registerProvider(registration([validFirst, invalid])),
      declarationError("actions.definition_invalid", `消费场景 ${invalid.scene_id} 的默认规则无效`));
    assert.deepEqual(await scenes(), beforeScenes, "no scene from the rejected provider is registered");
    assert.deepEqual(await actions(), beforeActions, "no action from the rejected provider is registered");
    assert.deepEqual(rules(), beforeRules, "neither the valid first rule nor the invalid rule was written");
    assert.equal(calls, 0);
  }
  const corrected = [validFirst, scene(["fixture_item", "fixture_note"], ["fixture_note", "fixture_item"]),
    scene([], ["choice_item"], "fixture_generic_choice"), scene([], [], "fixture_generic_text")];
  assert.deepEqual(parsePluginManifest(manifest(corrected)).action_scenes, corrected);
  const dispose = registry.registerProvider(registration(corrected));
  try {
    const registered = (await scenes()).filter(view => view.provider.provider_id === PROVIDER);
    assert.deepEqual(registered.map(view => view.definition), corrected);
    for (const candidate of corrected) {
      const written = withFunctionsService(home.home, service => service.getByKey(candidate.default_rule!.function_key), OPTIONS);
      assert.ok(written, `${candidate.scene_id} is seeded after successful registration`);
      assert.equal(written.scene_id, candidate.scene_id);
      assert.deepEqual(written.subject_kinds, candidate.default_rule!.subject_kinds);
    }
    assert.deepEqual(await home.host.homeActionClient().invoke(CALLER, { capability_id: probe.capability_id, version: probe.version, provider_id: PROVIDER }, {}),
      { registered: true });
    assert.equal(calls, 1);
  } finally { dispose(); }
});
