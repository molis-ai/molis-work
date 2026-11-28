import { projectPluginRevisionAt } from "./fixtures/project-plugin-settings.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { pagesActions, pagesContentActions } from "@molis-ai/molis-work-plugin-pages";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { openTestHome } from "./fixtures/test-home.js";
import { queryProbe } from "./fixtures/action-query.js";

for (const mode of ["allowed", "source-missing", "pages-removed", "controlled owner unavailable", "removed", "disabled"] as const) test(`AQD-04 Home plugin on a real project HTTP path: ${mode}`, async t => {
  const probe = queryProbe(`queryhome-${mode.replaceAll(" ", "-")}`, "home", mode !== "source-missing");
  // No built-in plugin runs only in the Home since batch 108 (Issues and the others moved into partitions): the probe is a Home plugin of its own.
  const pluginId = probe.definition.manifest.plugin_id;
  const s = await openTestHome(t, { host: { pluginFixtures: { home: [probe.definition] }, ...mode === "controlled owner unavailable" ? { actionAvailability: (_caller: unknown, action: { capability_id: string }) =>
    action.capability_id === pagesContentActions.read.capability_id
      ? { available: false as const, code: "actions.plugin_disabled", reason: "Controlled owner unavailable" } : { available: true as const } } : {} } }), project = await s.createProject("Home project query", ["pages"]), client = s.host.actionClient(project.reference);
  // The person grants the probe what it asks for (a built-in plugin's permissions are granted with it; a fixture's optional ones are not).
  const platform = await s.host.homePlugins!.ready(), install = s.host.homePlugins!.installation(pluginId)!;
  await platform.runtime.stop(install.install_id); platform.runtime.grant(install.install_id, probe.definition.manifest.permissions.map(row => row.permission)); await platform.supervisor.restart(pluginId);
  const request = (path: string, body: unknown, method = "POST", signal?: AbortSignal) => fetch(s.origin + path, { method, signal, headers: { origin: s.origin, "content-type": "application/json",
    "x-molis-work-control-token": s.controlToken, "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify(body) });
  const enabled = await request(`/api/settings/projects/${project.project_id}/plugins`,
    { plugin_id: pluginId, expected_revision: await projectPluginRevisionAt(s.origin, project.project_id) });
  assert.equal(enabled.status, 200, await enabled.clone().text());
  const page = await client.invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: ["pages:write"] }, pagesActions.create,
    { title: "Home query material", markdown: "Native Pages through Home" }) as { document: { id: string } };
  if (mode === "pages-removed") {
    const disabled = await request(`/api/settings/projects/${project.project_id}/plugins`, { plugin_id: "pages", expected_revision: await projectPluginRevisionAt(s.origin, project.project_id) }, "DELETE");
    assert.equal(disabled.status, 200, await disabled.clone().text());
    assert.equal((await disabled.json()).plugins.includes("pages"), false, "taken out of the project (batch 107: Pages is no longer personal)");
  }
  const path = `/projects/${project.project_id}/api/plugins/${pluginId}/read`;
  if (mode === "allowed" || mode === "source-missing" || mode === "pages-removed" || mode === "controlled owner unavailable") {
    const response = await request(path, { item_id: page.document.id });
    if (mode === "allowed") {
      assert.equal(response.status, 200, await response.clone().text()); assert.match(await response.text(), /Native Pages through Home/);
      assert.equal(probe.seen.at(-1)!.project_id, project.project_id); assert.equal(probe.seen.at(-1)!.actor_id, LOCAL_PERSON_ACTOR_ID);
    } else {
      if (mode === "source-missing") assert.equal(probe.contexts.at(-1)!.grants.includes("pages:read"), false);
      assert.notEqual(response.status, 200);
      // Pages taken out of the project refuses the delegated read too: a dependency does not keep a plugin available (platform-authority-audience §9.1).
      // An owner the Host holds back is disabled; Pages taken out of the project has no instance here, so the read it depends on is missing.
      if (mode === "controlled owner unavailable") assert.equal((await response.json()).code, "actions.plugin_disabled");
      if (mode === "pages-removed") assert.equal((await response.json()).code, "actions.dependency_missing");
      assert.equal(probe.contexts.at(-1)!.services!.storage!.get("delivered"), null);
    }
    if (mode !== "allowed") {
      const text = await request(path, { text: "Text remains available" });
      assert.equal(text.status, 200, await text.clone().text()); assert.equal(await text.json(), "Text remains available");
    }
    return;
  }
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const target = { ...pagesContentActions.read, capability_id: "query.target" };
  await client.discover({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user", permissions: ["pages:read"] });
  // Under the Host's own provider the person holds `pages:read` (PG-007 stage 4); a made-up host provider would give the route nothing.
  s.host.actionRegistry(project.reference).registerProvider({ provider: { provider_id: "platform", title: "Held query", kind: "system", project_id: project.project_id },
    definitions: [target], handlers: [{ ...target, handle: async () => { entered.resolve(); await release.promise; return { title: "Held", body: "Late content" }; } }] });
  probe.target.current = target;
  const pending = request(path, { item_id: page.document.id });
  try {
    await Promise.race([entered.promise, pending.then(async response => { throw new Error(`Missed query wait: ${response.status} ${await response.text()}`); })]);
    if (mode === "removed") {
      const expected_revision = await projectPluginRevisionAt(s.origin, project.project_id);
      const response = await request(`/api/settings/projects/${project.project_id}/plugins`, { plugin_id: pluginId, expected_revision }, "DELETE", AbortSignal.timeout(20_000));
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal((await response.json()).plugins.includes(pluginId), false);
    } else {
      const response = await request(`/api/plugins/${pluginId}/disable`, {});
      assert.equal(response.status, 200, await response.clone().text());
    }
  } finally { release.resolve(); }
  assert.notEqual((await pending).status, 200);
  if (mode === "disabled") await (await s.host.homePlugins!.ready()).supervisor.enable(pluginId);
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("delivered"), null);
});
