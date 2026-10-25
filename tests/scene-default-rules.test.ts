import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { withFunctionsService } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import {
  INBOX_DISMISS_BEHAVIOR_ID, INBOX_DONE_BEHAVIOR_ID, SYSTEM_HOME_DOCK_FUNCTION_KEY, SYSTEM_INBOX_ADMIT_FUNCTION_KEY, SYSTEM_INBOX_NEXT_FUNCTION_KEY,
} from "@molis-ai/molis-work-contracts/modules/functions";
import type { ActionSceneDefaultRule, ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { HOST_BUILD_TRUST, MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ownerFilesProbe } from "./fixtures/plugin-owner-files.js";
import { DECLARED_RULE_OPTIONS, declaredRegistration, declaredRule, declaredScene } from "./fixtures/declared-rules.js";
import { openTestHome } from "./fixtures/test-home.js";

const ROOT = new URL("../", import.meta.url);
const OPTIONS = DECLARED_RULE_OPTIONS, rule = declaredRule, scene = declaredScene, registration = declaredRegistration;

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
    assert.match(record.id, /^declared:/);
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

test("RAC-486 a rule key belongs to the plugin that declared it first: another plugin declaring it is refused, with nothing registered or written", async t => {
  const home = await openTestHome(t, { host: { functions: OPTIONS } });
  const registry = home.host.actionRegistry();
  const first = registry.registerProvider(registration("io.molis.work.example.first", [scene("example.first", rule("example_shared", { name: "先声明的" }))]));
  const before = withFunctionsService(home.home, service => service.getByKey("example_shared"), OPTIONS)!;
  try {
    for (const [plugin, name] of [["second", "后声明的"], ["third", "第三个声明的"]] as const) {
      assert.throws(() => registry.registerProvider(registration(`io.molis.work.example.${plugin}`, [scene(`example.${plugin}`, rule("example_shared", { name, instructions: "另一套说明" }))])),
        (error: { code?: string }) => error.code === "functions.rule_key_taken", `${plugin} is refused`);
    }
    const kept = withFunctionsService(home.home, service => service.list().filter(record => record.function_key === "example_shared"), OPTIONS);
    assert.equal(kept.length, 1);
    assert.deepEqual(kept[0], before, "the stored rule is untouched");
    assert.equal(kept[0]!.id, "declared:io.molis.work.example.first:example_shared", "the row names who declared it");
    assert.equal(kept[0]!.scene_id, "example.first");
    // The declarer registering again (its provider restarted) is no conflict.
    first();
    const again = registry.registerProvider(registration("io.molis.work.example.first", [scene("example.first", rule("example_shared", { name: "先声明的" }))]));
    again();
    assert.deepEqual(withFunctionsService(home.home, service => service.getByKey("example_shared"), OPTIONS), before);
  } finally { first(); }
});

test("RAC-501 the keys the Host's own scenes declare are reserved: any other plugin declaring one is refused at registration, and a plugin that is not host-trusted is refused at install", async t => {
  const reserved = BUILTIN_PLUGIN_CATALOG.flatMap(entry => (entry.manifest.action_scenes ?? []).flatMap(candidate => candidate.default_rule ? [candidate.default_rule.function_key] : []));
  assert.ok(reserved.includes(SYSTEM_INBOX_NEXT_FUNCTION_KEY));
  const home = await openTestHome(t, { host: { functions: OPTIONS } });
  for (const key of [...reserved, SYSTEM_HOME_DOCK_FUNCTION_KEY]) {
    assert.throws(() => home.host.actionRegistry().registerProvider(registration("io.molis.work.example.squatter", [scene("example.squat", rule(key))])),
      (error: { code?: string }) => error.code === "functions.rule_key_taken", key);
  }
  assert.deepEqual(withFunctionsService(home.home, service => service.list(), OPTIONS), [], "a refused registration writes nothing");

  const repository = new MemoryPluginRuntimeRepository();
  const runtime = new PluginRuntime(repository, undefined, { reservedRuleKeys: () => new Set(reserved) });
  const base = ownerFilesProbe("reservedkeys", "project").withoutFiles();
  const declaring = (key: string, suffix = ""): PluginDefinition => ({ ...base, manifest: { ...base.manifest, plugin_id: `${base.manifest.plugin_id}${suffix}`,
    publisher: { ...base.manifest.publisher, signature: `${base.manifest.publisher.signature}${suffix}` },
    permissions: [...base.manifest.permissions, ...["fixture:read", "fixture:write"].map(permission => ({ permission, required: false, reason: "Scene fixture" }))], action_scenes: [scene("reservedkeys.pick", rule(key))] } });
  for (const trust of [{ level: "unsigned" }, { level: "pinned", publisher_key_id: `ed25519:sha256:${"a".repeat(64)}` }] as const) {
    assert.throws(() => runtime.install({ definition: declaring(reserved[0]!), deployment: "local", trust, grants: [] }),
      (error: { code?: string }) => error.code === "plugin.rule_key_reserved", trust.level);
  }
  assert.deepEqual(repository.list(), [], "a refused install leaves no record");
  runtime.install({ definition: declaring("example_not_reserved"), deployment: "local", trust: { level: "unsigned" } });
  assert.equal(repository.list().length, 1, "a key nobody reserved installs");
  runtime.install({ definition: declaring(reserved[0]!, ".shipped"), deployment: "local", trust: HOST_BUILD_TRUST });
  assert.equal(repository.list().length, 2, "a reserved key under host trust is the Host's own build, and installs");
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
