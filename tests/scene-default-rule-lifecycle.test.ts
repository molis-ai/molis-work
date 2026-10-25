import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { seedSceneRules, withFunctionsService } from "@molis-ai/molis-work-app-local-host";
import { publishedFunctionReference } from "@molis-ai/molis-work-module-functions";
import { ownerFilesProbe, ownerFilesProject } from "./fixtures/plugin-owner-files.js";
import { DECLARED_RULE_OPTIONS as OPTIONS, declaredRule, declaredScene } from "./fixtures/declared-rules.js";

/**
 * A plugin's default rules and the scene bindings that name them go with its data (FI-2 round 2, RAC-502, RAC-503): an uninstall that keeps
 * nothing and a reinstall that drops what an uninstall kept both take them; an uninstall that keeps the data leaves them in the library,
 * with no provider to run them. What other plugins declared, the person's own rules and another project's binding are never touched.
 */
function fixture(t: test.TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "declared-rules-lifecycle-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const probe = ownerFilesProbe("rulelife", "project"), other = ownerFilesProbe("ruleother", "project");
  const project = ownerFilesProject(home, probe);
  t.after(() => project.close());
  const runtime = project.platform.runtime;
  const install = (discard = false) => runtime.install({ trust: { level: "unsigned" }, definition: probe.withoutFiles(), deployment: "local", ...(discard ? { discard_kept_data: true } : {}) }).install;
  const declare = (plugin: string, key: string) => seedSceneRules(home, { provider_id: `${plugin}.provider`, plugin_id: plugin, title: "插件", kind: "plugin" }, [declaredScene(`scene.${key}`, declaredRule(key))], OPTIONS);
  const bind = (key: string, projectId: string) => withFunctionsService(home, service => service.saveActionSceneBinding(projectId, { binding_id: `${key}:${projectId}`, scene_id: `scene.${key}`,
    scene_version: 1, project_id: projectId, function: publishedFunctionReference(service.getByKey(key)!), enabled: true, title: "示例" }), OPTIONS);
  const rule = (key: string) => withFunctionsService(home, service => service.getByKey(key), OPTIONS);
  const bound = (key: string, projectId: string) => withFunctionsService(home, service => service.actionSceneBinding(`scene.${key}`, projectId), OPTIONS) !== null;
  return { home, probe, other, project, runtime, install, declare, bind, rule, bound };
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
