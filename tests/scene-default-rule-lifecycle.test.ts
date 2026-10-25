import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { seedSceneRules, withFunctionsService } from "@molis-ai/molis-work-app-local-host";
import { publishedFunctionReference } from "@molis-ai/molis-work-module-functions";
import { ownerFilesProbe, ownerFilesProject } from "./fixtures/plugin-owner-files.js";
import { DECLARED_RULE_OPTIONS as OPTIONS, declaredRule, declaredScene } from "./fixtures/declared-rules.js";
import { openTestHome, type TestProject } from "./fixtures/test-home.js";

/**
 * A plugin's default rules and the scene bindings that name them go with its data (FI-2 round 2, RAC-502, RAC-503): an uninstall that keeps
 * nothing and a reinstall that drops what an uninstall kept both take them; an uninstall that keeps the data leaves them in the library,
 * with no provider to run them. What other plugins declared, the person's own rules and another project's binding are never touched, and
 * a rule stays while another project still has the plugin installed or kept (RAC-504, RAC-505).
 */
function ruleTools(home: string) {
  const declare = (plugin: string, key: string) => seedSceneRules(home, { provider_id: `${plugin}.provider`, plugin_id: plugin, title: "插件", kind: "plugin" }, [declaredScene(`scene.${key}`, declaredRule(key))], OPTIONS);
  const bind = (key: string, projectId: string) => withFunctionsService(home, service => service.saveActionSceneBinding(projectId, { binding_id: `${key}:${projectId}`, scene_id: `scene.${key}`,
    scene_version: 1, project_id: projectId, function: publishedFunctionReference(service.getByKey(key)!), enabled: true, title: "示例" }), OPTIONS);
  const rule = (key: string) => withFunctionsService(home, service => service.getByKey(key), OPTIONS);
  const bound = (key: string, projectId: string) => withFunctionsService(home, service => service.actionSceneBinding(`scene.${key}`, projectId), OPTIONS) !== null;
  return { declare, bind, rule, bound };
}

function fixture(t: test.TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "declared-rules-lifecycle-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const probe = ownerFilesProbe("rulelife", "project"), other = ownerFilesProbe("ruleother", "project");
  const project = ownerFilesProject(home, probe);
  t.after(() => project.close());
  const runtime = project.platform.runtime;
  const install = (discard = false) => runtime.install({ trust: { level: "unsigned" }, definition: probe.withoutFiles(), deployment: "local", ...(discard ? { discard_kept_data: true } : {}) }).install;
  return { home, probe, other, project, runtime, install, ...ruleTools(home) };
}

test("RAC-502 an uninstall that keeps nothing takes the plugin's rules and this project's bindings, and spares what is not its own", { timeout: 60_000 }, async t => {
  const r = fixture(t), otherProject = "other-project";
  const installId = r.install().install_id;
  r.declare(r.probe.id, "life_own"); r.bind("life_own", r.project.projectId);
  r.declare(r.probe.id, "life_shared"); r.bind("life_shared", r.project.projectId); r.bind("life_shared", otherProject);
  r.declare(r.other.id, "life_neighbour"); r.bind("life_neighbour", r.project.projectId);
  withFunctionsService(r.home, service => service.create({ function_key: "life_person" }), OPTIONS);

  await r.runtime.uninstall(installId, { retain_private_data: false });
  assert.equal(r.rule("life_own"), null, "the rule the plugin declared goes");
  assert.equal(r.bound("life_own", r.project.projectId), false, "and the binding that named it");
  assert.ok(r.rule("life_shared"), "a rule another project's binding still names stays");
  assert.equal(r.bound("life_shared", r.project.projectId), false, "while this project's binding to it goes");
  assert.equal(r.bound("life_shared", otherProject), true, "and the other project's stays");
  assert.ok(r.rule("life_neighbour") && r.bound("life_neighbour", r.project.projectId), "another plugin's rule and binding are untouched");
  assert.ok(r.rule("life_person"), "the person's own rule is untouched");
});

test("RAC-503 an uninstall that keeps the data leaves the rules and bindings, and a reinstall that drops the kept data takes them", { timeout: 60_000 }, async t => {
  const r = fixture(t);
  const installId = r.install().install_id;
  r.declare(r.probe.id, "life_kept"); r.bind("life_kept", r.project.projectId);

  await r.runtime.uninstall(installId, { retain_private_data: true });
  assert.equal(r.rule("life_kept")?.status, "published", "the rule stays in the library");
  assert.equal(r.bound("life_kept", r.project.projectId), true, "with its binding; no provider is registered to run it");
  assert.equal(r.install().install_id, installId, "a reinstall keeping the data finds both");
  assert.ok(r.rule("life_kept") && r.bound("life_kept", r.project.projectId));
  await r.runtime.uninstall(installId, { retain_private_data: true });

  assert.equal(r.install(true).install_id, installId);
  assert.equal(r.rule("life_kept"), null, "reinstalling and dropping the kept data takes the rule");
  assert.equal(r.bound("life_kept", r.project.projectId), false, "and the binding");
});

/**
 * One plugin installed in two catalog projects of one Home, each with its own library: A has a binding to the plugin's rule, B has none
 * but holds the rule and a sample its person added. `stillB` asserts B and the rule as they were, and that another plugin cannot take the key.
 */
async function twoInstalls(t: test.TestContext) {
  const testHome = await openTestHome(t, { host: { functions: OPTIONS } });
  const probe = ownerFilesProbe("rulehold", "project"), thirdParty = ownerFilesProbe("rulethird", "project");
  const [a, b] = [await testHome.createProject("项目 A"), await testHome.createProject("项目 B")];
  const open = (entry: TestProject) => ownerFilesProject(testHome.home, probe, { file: entry.database_path, projectId: entry.project_id });
  const projectA = open(a), projectB = open(b);
  t.after(() => Promise.all([projectA.close(), projectB.close()]));
  const install = (project: typeof projectA, discard = false) => project.platform.runtime.install({ trust: { level: "unsigned" }, definition: probe.withoutFiles(), deployment: "local",
    ...(discard ? { discard_kept_data: true } : {}) }).install;
  const home = testHome.home, tools = ruleTools(home), key = "hold_shared";
  const installA = install(projectA), installB = install(projectB);
  assert.equal(installA.install_id, installB.install_id, "one plugin, one installation id, in both projects");
  tools.declare(probe.id, key);
  tools.bind(key, a.project_id);
  const sample = withFunctionsService(home, service => service.addSample(service.getByKey(key)!.id, { input: "B 的人留下的示例" }), OPTIONS);
  assert.equal(tools.bound(key, b.project_id), false, "B has no binding");
  const declared = tools.rule(key);
  assert.deepEqual(declared, sample);
  assert.equal(declared?.id, `declared:${probe.id}:${key}`);
  assert.equal(declared?.samples.length, 1);
  const stillB = () => {
    assert.deepEqual(tools.rule(key), declared, "B's rule, its owner and its sample are as they were");
    assert.equal(tools.bound(key, b.project_id), false);
    assert.equal(projectB.platform.runtime.get(installB.install_id)?.state, "installed", "B's installation is untouched");
    assert.throws(() => tools.declare(thirdParty.id, key), (error: { code?: string }) => error.code === "functions.rule_key_taken", "another plugin still cannot claim the key");
  };
  return { ...tools, home, key, thirdParty: thirdParty.id, a, b, projectA, projectB, install, installId: installA.install_id, stillB };
}

test("RAC-504 a project's uninstall takes only its own bindings: another project's install keeps the rule, and the last installation to go takes it", { timeout: 120_000 }, async t => {
  const r = await twoInstalls(t);

  await r.projectA.platform.runtime.uninstall(r.installId, { retain_private_data: false });
  assert.equal(r.bound(r.key, r.a.project_id), false, "A's own binding goes with A's data");
  r.stillB();

  await r.projectB.platform.runtime.uninstall(r.installId, { retain_private_data: true });
  assert.ok(r.rule(r.key), "B keeping its data is a claim on the rule, though nothing runs it now");

  r.install(r.projectB, true);
  assert.equal(r.rule(r.key), null, "B was the last: reinstalling and dropping what it kept takes the rule");
  assert.doesNotThrow(() => r.declare(r.thirdParty, r.key), "the key is free for another plugin once nothing holds it");
});

test("RAC-505 a project's reinstall that drops its kept data leaves the rule another project's install holds", { timeout: 120_000 }, async t => {
  const r = await twoInstalls(t);

  await r.projectA.platform.runtime.uninstall(r.installId, { retain_private_data: true });
  assert.equal(r.bound(r.key, r.a.project_id), true, "A kept its data, binding included");
  r.stillB();

  r.install(r.projectA, true);
  assert.equal(r.bound(r.key, r.a.project_id), false, "A dropping what it kept takes A's binding");
  r.stillB();
});
