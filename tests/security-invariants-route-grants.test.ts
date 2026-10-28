// Security invariant S-15 (docs/system/SECURITY-INVARIANTS.md): a plugin route's own declared permission is checked against the
// installation behind the route alone, whoever calls and whatever the caller holds. `home:write` is one of the person's own permissions
// over the Host's services (the Home provider's `HOME_ACTION_PERMISSIONS` in apps/local-host/src/home-actions.ts, taken into `LOCAL_OWNER_PERMISSIONS` in apps/local-host/src/local-owner-permissions.ts), so every page caller's context
// carries it. A route that declares it is still refused while its installation does not hold it: a dispatch entry that handed the
// caller's permissions to the router (as Home routes did before #788) would let this route through.
import assert from "node:assert/strict";
import test from "node:test";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

const OWNER_PERMISSION = "home:write";

/** A plugin whose `owned` route declares a permission the person also holds as owner; optional, so its installation is not given it. */
function ownerNamedRoute(scope: "home" | "project") {
  const id = `io.molis.work.example.owner-route-${scope}`, reached: string[] = [];
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: `Owner route ${scope}`,
    kind: "app", publisher: { publisher_id: "example", signature: `owner-route-${scope}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: OWNER_PERMISSION, required: false, reason: "A route that names one of the person's own permissions" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    routes: [{ route_id: "open", method: "GET", path: "/open" }, { route_id: "owned", method: "POST", path: "/owned", permission: OWNER_PERMISSION }] },
  async start() {
    return { kind: "app", routes: ["open", "owned"].map(route_id => ({ route_id, handle() { reached.push(route_id); return { status: 200, body: { route_id } }; } })) };
  } };
  return { id, definition, reached };
}

for (const scope of ["home", "project"] as const) {
  test(`S-15 a route whose permission the person also holds as owner is refused while the installation behind it lacks that grant (${scope})`, { timeout: 60_000 }, async t => {
    const probe = ownerNamedRoute(scope);
    const { host, request, project } = await serveHomeRuntime(t, { pluginFixtures: { [scope]: [probe.definition] } });
    const current = scope === "project" ? await project("Owner permission on a route") : undefined;
    const prefix = `${current ? `/projects/${current.project_id}` : ""}/api/plugins/${probe.id}`;
    const open = await request(`${prefix}/open`);
    assert.equal(open.status, 200, await open.clone().text());
    assert.deepEqual(probe.reached, ["open"], "the plugin runs and this entry dispatches its routes");

    const refused = await request(`${prefix}/owned`, { method: "POST", body: {} });
    assert.deepEqual([refused.status, (await refused.json() as { code: string }).code], [403, "actions.forbidden"]);
    assert.deepEqual(probe.reached, ["open"], "the refused route never reached the plugin");
    if (scope === "project") return;

    // The Home installation, read directly: it does not hold the permission, and once it does, the same route answers.
    const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(probe.id)!;
    assert.ok(!install.grants.includes(OWNER_PERMISSION));
    await platform.runtime.stop(install.install_id);
    platform.runtime.grant(install.install_id, [...install.grants, OWNER_PERMISSION]);
    assert.equal((await platform.supervisor.restart(probe.id)).status, "running");
    const granted = await request(`${prefix}/owned`, { method: "POST", body: {} });
    assert.equal(granted.status, 200, await granted.clone().text());
    assert.deepEqual(probe.reached, ["open", "owned"]);
  });
}
