import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { withFunctionsService, type FunctionsHostOptions } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import {
  INBOX_DISMISS_BEHAVIOR_ID, INBOX_DONE_BEHAVIOR_ID, SYSTEM_HOME_DOCK_FUNCTION_KEY, SYSTEM_INBOX_ADMIT_FUNCTION_KEY, SYSTEM_INBOX_NEXT_FUNCTION_KEY,
} from "@molis-ai/molis-work-contracts/modules/functions";
import type { ActionProviderRegistration, ActionSceneDefaultRule, ActionSceneDefinition, ActionSceneHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { openTestHome } from "./fixtures/test-home.js";

const ROOT = new URL("../", import.meta.url);
const OPTIONS: FunctionsHostOptions = { env: {}, credential: () => null };

const rule = (function_key: string, overrides: Partial<ActionSceneDefaultRule> = {}): ActionSceneDefaultRule => ({
  function_key, name: "挑下一步", instructions: "看这条该显示哪个按钮。", subject_kinds: ["fixture_item"],
  options: [{ key: "fixture.first", description: "第一个" }, { key: "fixture.second", description: "第二个" }], ...overrides,
});

const scene = (scene_id: string, default_rule?: ActionSceneDefaultRule): ActionSceneDefinition => ({
  scene_id, version: 1, title: "示例用途", description: "示例用途的说明", trigger: "示例事件", scope: "project", subject_kinds: ["fixture_item"],
  permissions: ["fixture:read"], configuration_permissions: ["fixture:write"], input_schema: { type: "object", properties: {} }, result_schema: { type: "object", properties: {} },
  ...(default_rule ? { default_rule } : {}),
});

const registration = (provider_id: string, scenes: readonly ActionSceneDefinition[]): ActionProviderRegistration => ({
  provider: { provider_id, plugin_id: provider_id, title: "已安装的插件", kind: "plugin" }, definitions: [], handlers: [], scenes,
  scene_handlers: scenes.map(({ scene_id, version }): ActionSceneHandlerBinding => ({ scene_id, version, bindings: () => [], targets: () => [],
    bind: () => undefined, consume: () => ({}) })),
});

/** The scenes the shipped plugins declare, from the built-in catalog's public export; the Home dock's is the Host's own and is checked on a started Host. */
const declared = (): ActionSceneDefinition[] => BUILTIN_PLUGIN_CATALOG.flatMap(entry => entry.manifest.action_scenes ?? []).filter(candidate => candidate.default_rule);

test("RAC-484 the shipped Feed and Inbox scenes declare their rules, and the Functions Module has none of its own", async () => {
  const keys = declared().map(candidate => candidate.default_rule!.function_key).sort();
  assert.deepEqual(keys, [SYSTEM_INBOX_ADMIT_FUNCTION_KEY, SYSTEM_INBOX_NEXT_FUNCTION_KEY].sort());
  const files = await readdir(new URL("modules/functions/src/", ROOT));
  assert.equal(files.includes("builtin.ts"), false, "no built-in rule file");
  for (const name of files) {
    const text = await readFile(new URL(`modules/functions/src/${name}`, ROOT), "utf8");
    assert.doesNotMatch(text, /system_(pick_home_dock|admit_inbox|pick_inbox_next)|SYSTEM_(HOME_DOCK|INBOX_ADMIT|INBOX_NEXT)_FUNCTION_KEY/, `${name} names a rule`);
  }
});

test("RAC-484 a Home no scene has been registered into has no rule, and a started Host has the three the shipped scenes declare", async t => {
  const home = await openTestHome(t, { host: { functions: OPTIONS } });
  assert.deepEqual(withFunctionsService(home.home, service => service.list(), OPTIONS), [], "nothing is written before a scene registers");
  const project = await home.createProject("规则", ["feed", "inbox"]);
  // The shipped scenes register as the Host prepares the project's plugins.
  await home.inspect("owner", project.project_id);
  const keys = withFunctionsService(home.home, service => service.list().map(record => record.function_key), OPTIONS);
  assert.deepEqual([...keys].sort(), [SYSTEM_HOME_DOCK_FUNCTION_KEY, SYSTEM_INBOX_ADMIT_FUNCTION_KEY, SYSTEM_INBOX_NEXT_FUNCTION_KEY].sort());
  const dock = withFunctionsService(home.home, service => service.getByKey(SYSTEM_HOME_DOCK_FUNCTION_KEY), OPTIONS)!;
  assert.deepEqual(dock.criteria.map(option => option.key), [INBOX_DONE_BEHAVIOR_ID, INBOX_DISMISS_BEHAVIOR_ID]);
  for (const record of withFunctionsService(home.home, service => service.list(), OPTIONS)) {
    assert.equal(record.status, "published");
    assert.match(record.id, /^declared-/);
  }
});

test("RAC-485 a rule an installed plugin's scene declares is written like a shipped one, with its own words and options", async t => {
  const home = await openTestHome(t, { host: { functions: OPTIONS } });
  const registry = home.host.actionRegistry();
  const dispose = registry.registerProvider(registration("io.molis.work.example.installed", [scene("example.pick", rule("example_pick_next"))]));
  try {
    const written = withFunctionsService(home.home, service => service.getByKey("example_pick_next"), OPTIONS);
    assert.ok(written, "the installed plugin's rule is in the library");
    assert.equal(written.scene_id, "example.pick");
    assert.equal(written.status, "published");
    assert.equal(written.name, "挑下一步");
    assert.deepEqual(written.criteria.map(option => [option.key, option.description]), [["fixture.first", "第一个"], ["fixture.second", "第二个"]]);
    assert.deepEqual([...written.subject_kinds], ["fixture_item"]);
  } finally { dispose(); }
});

test("RAC-486 the first declaration of a rule key wins: a later declaration of the same key, from any plugin, never writes over it", async t => {
  const home = await openTestHome(t, { host: { functions: OPTIONS } });
  const registry = home.host.actionRegistry();
  const first = registry.registerProvider(registration("io.molis.work.example.first", [scene("example.first", rule("example_shared", { name: "先声明的" }))]));
  const before = withFunctionsService(home.home, service => service.getByKey("example_shared"), OPTIONS)!;
  const second = registry.registerProvider(registration("io.molis.work.example.second", [scene("example.second", rule("example_shared", { name: "后声明的" }))]));
  const again = registry.registerProvider(registration("io.molis.work.example.third", [scene("example.third", rule("example_shared", { name: "第三个声明的", instructions: "另一套说明" }))]));
  try {
    const kept = withFunctionsService(home.home, service => service.list().filter(record => record.function_key === "example_shared"), OPTIONS);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]!.name, "先声明的");
    assert.deepEqual(kept[0], before, "the stored rule is untouched");
    assert.equal(kept[0]!.scene_id, "example.first");
  } finally { again(); second(); first(); }
});

test("RAC-487 a malformed default rule is refused with the scene, and nothing is written", async t => {
  const bad: Array<[string, ActionSceneDefaultRule]> = [
    ["one option", rule("example_one", { options: [{ key: "fixture.first", description: "只有一个" }] })],
    ["a repeated option", rule("example_repeat", { options: [{ key: "fixture.first", description: "a" }, { key: "fixture.first", description: "b" }] })],
    ["a key that is not a function key", rule("Example-Key")],
    ["an empty instruction", rule("example_blank", { instructions: "  " })],
  ];
  for (const [label, candidate] of bad) {
    assert.notDeepEqual(inspectActionDeclarations([], [scene("example.bad", candidate)]), [], label);
  }
  const labelled: ActionSceneDefinition = { ...scene("example.labelled", rule("example_labelled")), result_type: "molis.behavior-recommendation.v1",
    recommendation_labels: { "fixture.first": "第一个" }, result_schema: { type: "object", properties: { status: { enum: ["ok", "needs_review"] },
      suggested_behavior_ids: { type: "array", items: { enum: ["fixture.first"] } } }, required: ["status", "suggested_behavior_ids"] } };
  assert.match(inspectActionDeclarations([], [labelled]).join("\n"), /默认规则选项必须是它的推荐名称/, "an option the scene cannot recommend");
  assert.match(inspectActionDeclarations([], [scene("example.a", rule("example_twice")), scene("example.b", rule("example_twice"))]).join("\n"), /默认规则重复/);
  assert.deepEqual(inspectActionDeclarations([], [scene("example.ok", rule("example_fine"))]), []);

  const home = await openTestHome(t, { host: { functions: OPTIONS } });
  assert.throws(() => home.host.actionRegistry().registerProvider(registration("io.molis.work.example.bad", [scene("example.bad", bad[0]![1])])));
  assert.equal(withFunctionsService(home.home, service => service.getByKey("example_one"), OPTIONS), null);
});
