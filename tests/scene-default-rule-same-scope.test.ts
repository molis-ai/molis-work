import assert from "node:assert/strict";
import test from "node:test";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { seedSceneRules, withFunctionsService } from "@molis-ai/molis-work-app-local-host";
import { ownerFilesProbe, ownerFilesProject } from "./fixtures/plugin-owner-files.js";
import { DECLARED_RULE_OPTIONS as OPTIONS, declaredRule, declaredScene } from "./fixtures/declared-rules.js";
import { openTestHome } from "./fixtures/test-home.js";

/**
 * FI-2 round 2, the exact-installation exclusion (REVIEW 6399282622): the installation being cleaned is the one `{ scope, install_id }`, so
 * another installation of the same plugin in the same project or in the Home still holds the plugin's rules. An installation's id is the
 * plugin and the publisher's signature (`installIdentity`), so one scope can hold two of them: two signatures of one plugin, or a kept
 * old one beside a new one. Cleaning one must neither take the rule row, its sample nor its key while the other holds; the last to go
 * takes them. RAC-504 and RAC-505 (`scene-default-rule-lifecycle.test.ts`) keep the other half: the same id in another project still holds.
 */
const KEY = "scope_shared";

/** The same plugin as another publisher's build: a different signature, so a different installation id. */
const signedAs = (definition: PluginDefinition, signature: string): PluginDefinition =>
  ({ ...definition, manifest: { ...definition.manifest, publisher: { ...definition.manifest.publisher, signature } } });

function rules(home: string, pluginId: string) {
  const declare = (plugin: string) => seedSceneRules(home, { provider_id: `${plugin}.provider`, plugin_id: plugin, title: "插件", kind: "plugin" }, [declaredScene(`scene.${KEY}`, declaredRule(KEY))], OPTIONS);
  declare(pluginId);
  const sample = withFunctionsService(home, service => service.addSample(service.getByKey(KEY)!.id, { input: "同一作用域里留下的示例" }), OPTIONS);
  const rule = () => withFunctionsService(home, service => service.getByKey(KEY), OPTIONS);
  assert.deepEqual(rule(), sample);
  assert.equal(rule()?.id, `declared:${pluginId}:${KEY}`);
  assert.equal(rule()?.samples.length, 1);
  return { declared: sample, rule, takenBy: (plugin: string) => assert.throws(() => declare(plugin), (error: { code?: string }) => error.code === "functions.rule_key_taken", "another plugin still cannot claim the key") };
}

for (const scope of ["project", "home"] as const) {
  test(`RAC-504a ${scope === "project" ? "a project" : "the Home"} holding two signatures of one plugin: cleaning one leaves the rule row, its sample and its key while the other is installed or kept, and the last to go takes them`, { timeout: 120_000 }, async t => {
    const probe = ownerFilesProbe(`samescope${scope}`, scope), third = ownerFilesProbe(`samescopethird${scope}`, scope);
    const definitions = [signedAs(probe.withoutFiles(), "signature-one"), signedAs(probe.withoutFiles(), "signature-two")] as const;
    // Installed by hand into the Host's own Home Runtime, which runs unsigned code in its process only for the objects it was told of (S-75 ⑥).
    const testHome = await openTestHome(t, { catalogPolicy: false, host: { functions: OPTIONS, pluginFixtures: { installed: new Set(definitions) } } });
    let runtime;
    if (scope === "project") {
      const entry = await testHome.createProject("同一项目");
      const project = ownerFilesProject(testHome.home, probe, { file: entry.database_path, projectId: entry.project_id });
      t.after(() => project.close());
      runtime = project.platform.runtime;
    } else {
      runtime = (await testHome.host.homePlugins!.ready()).runtime;
    }
    const install = (index: 0 | 1, discard = false) => runtime.install({ trust: { level: "unsigned" }, definition: definitions[index], deployment: "local", ...(discard ? { discard_kept_data: true } : {}) }).install;
    const first = install(0), second = install(1);
    assert.notEqual(first.install_id, second.install_id, "two signatures, two installations, one scope");
    const r = rules(testHome.home, probe.id);

    // An installed holder: cleaning the other one that keeps nothing leaves everything.
    await runtime.uninstall(first.install_id, { retain_private_data: false });
    assert.equal(runtime.get(second.install_id)?.state, "installed", "the other installation is untouched");
    assert.deepEqual(r.rule(), r.declared, "the rule row, its owner and its sample are as they were");
    r.takenBy(third.id);

    // A kept holder: the installed one goes without keeping anything, the kept one still has a claim.
    install(0);
    await runtime.uninstall(first.install_id, { retain_private_data: true });
    await runtime.uninstall(second.install_id, { retain_private_data: false });
    assert.deepEqual(r.rule(), r.declared, "an installation that kept its data holds the rule though nothing runs it");
    r.takenBy(third.id);

    // The last to go: dropping what the kept one holds releases the rule and the key.
    install(0, true);
    assert.equal(r.rule(), null, "the last installation took the rule");
    assert.doesNotThrow(() => rules(testHome.home, third.id), "and the key is free for another plugin");
  });
}
