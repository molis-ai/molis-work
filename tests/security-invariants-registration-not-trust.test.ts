import assert from "node:assert/strict";
import test from "node:test";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "@molis-ai/molis-work-app-local-host";
import { openTestHome } from "./fixtures/test-home.js";
import { grantHomeProbe, homeProbe } from "./fixtures/home-runtime.js";

// RAC-565 (specs/repository-anti-corruption/slices/w5-02-registry.md §B1, S-08, S-15): being built in is the Host's start list, the
// generated `apps/local-host/src/plugin-registry.generated.ts` that lists the workspace's own packages. A package installed into the
// Home is not made one by what it carries: a `registration` export naming a built-in's key, `bundled` and `personal` is never read.
// Who may provide under a plugin id (ac-trust T6, S-68) stays one check elsewhere; these assert only the result.

/** What a built-in's package exports beside its plugin, as an installed package could carry it too. */
const carried = { project_plugin_id: "todo", bundled: true, personal: true, catalog_order: 0 };

test("RAC-565 S-08 S-15 a package installed into the Home that carries a registration is not on the start list, is not bundled, and provides under its install id", { timeout: 60_000 }, async t => {
  const probe = homeProbe("carriesregistration");
  const home = await openTestHome(t, { host: { pluginFixtures: { home: [Object.assign(probe.definition, { registration: carried })] } } });
  const { install } = await grantHomeProbe(home.host, probe);
  assert.ok(install);

  assert.equal(PLATFORM_PLUGIN_REGISTRATIONS.some(entry => entry.manifest.plugin_id === probe.id), false, "not on the start list");
  const registered = home.host.homePlugins!.registered().filter(entry => entry.manifest.plugin_id === probe.id);
  assert.deepEqual(registered.map(entry => entry.key), [probe.id], "keyed by its own plugin id, not the key it carries");
  assert.notEqual(install.publisher_trust, "host", "not vouched for as part of the build");
  assert.deepEqual(home.host.homePlugins!.outsideBuild(), [probe.id], "outside the build, whatever it says about itself");

  const actions = (await home.host.inspectActions({ actor_id: "local:person", project_id: null, audience: "user", permissions: [] }))
    .filter(view => view.provider.plugin_id === probe.id);
  assert.ok(actions.length > 0, "its actions are listed");
  for (const view of actions) assert.equal(view.provider.provider_id, install.install_id, `${view.capability_id} is provided under the install, not the plugin id`);
});

test("RAC-565 S-08 S-15 a package installed into the Home under a built-in's plugin id does not start beside it", { timeout: 60_000 }, async t => {
  const todo = PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.project_plugin_id === "todo")!;
  const probe = homeProbe("takesbuiltinid");
  const impostor = { ...probe.definition, manifest: { ...probe.definition.manifest, plugin_id: todo.manifest.plugin_id }, registration: carried };
  // Refused as the Home is put together, before anything of it runs.
  await assert.rejects(openTestHome(t, { host: { pluginFixtures: { home: [impostor] } } }), /不能冒充内置插件的定义/);
});
