import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { pagesActions, pagesContentActions } from "@molis-ai/molis-work-plugin-pages";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { openTestHome } from "./fixtures/test-home.js";
import { queryProbe } from "./fixtures/action-query.js";

for (const mode of ["allowed", "source-missing", "pages-hidden", "controlled owner unavailable", "hidden", "disabled"] as const) test(`AQD-04 Home plugin on a real project HTTP path: ${mode}`, async t => {
  const probe = queryProbe(`queryhome-${mode.replaceAll(" ", "-")}`, "home", mode !== "source-missing");
  const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.project_plugin_id === "issues")!;
  assert.ok(entry.runtime);
  probe.definition.manifest = { ...probe.definition.manifest, plugin_id: entry.manifest.plugin_id,
    permissions: [...probe.definition.manifest.permissions, ...entry.manifest.permissions.filter(item => !probe.definition.manifest.permissions.some(own => own.permission === item.permission))] };
  t.mock.method(entry.runtime, "create", () => probe.definition);
  const s = await openTestHome(t, mode === "controlled owner unavailable" ? { host: { actionAvailability: (_caller, action) =>
    action.capability_id === pagesContentActions.read.capability_id
      ? { available: false, code: "actions.plugin_disabled", reason: "Controlled owner unavailable" } : { available: true } } } : {}), project = await s.createProject("Home project query", ["pages"]), client = s.host.actionClient(project.reference);
  const request = (path: string, body: unknown, method = "POST") => fetch(s.origin + path, { method, headers: { origin: s.origin, "content-type": "application/json",
    "x-molis-work-control-token": s.controlToken, "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify(body) });
  const page = await client.invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: ["pages:write"] }, pagesActions.create,
    { title: "Home query material", markdown: "Native Pages through Home" }) as { document: { id: string } };
  if (mode === "pages-hidden") {
    const disabled = await request(`/api/settings/projects/${project.project_id}/plugins`, { plugin_id: "pages" }, "DELETE");
    assert.equal(disabled.status, 200, await disabled.clone().text());
    assert.ok((await disabled.json()).hidden.includes("pages"));
  }
  const path = `/projects/${project.project_id}/api/plugins/${entry.manifest.plugin_id}/read`;
  if (mode === "allowed" || mode === "source-missing" || mode === "pages-hidden" || mode === "controlled owner unavailable") {
    const response = await request(path, { item_id: page.document.id });
    if (mode === "allowed") {
      assert.equal(response.status, 200, await response.clone().text()); assert.match(await response.text(), /Native Pages through Home/);
      assert.equal(probe.seen.at(-1)!.project_id, project.project_id); assert.equal(probe.seen.at(-1)!.actor_id, LOCAL_PERSON_ACTOR_ID);
    } else {
      if (mode === "source-missing") assert.equal(probe.contexts.at(-1)!.grants.includes("pages:read"), false);
      assert.notEqual(response.status, 200);
      // A hidden Pages refuses the delegated read too: a dependency does not keep a hidden plugin available (platform-authority-audience §9.1).
      if (mode === "controlled owner unavailable" || mode === "pages-hidden") assert.equal((await response.json()).code, "actions.plugin_disabled");
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
    const response = mode === "hidden" ? await request(`/api/settings/projects/${project.project_id}/plugins`, { plugin_id: "issues" }, "DELETE")
      : await request(`/api/plugins/${entry.manifest.plugin_id}/disable`, {});
    assert.equal(response.status, 200, await response.clone().text());
  } finally { release.resolve(); }
  assert.notEqual((await pending).status, 200);
  if (mode === "disabled") await (await s.host.homePlugins!.ready()).supervisor.enable(entry.manifest.plugin_id);
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("delivered"), null);
});
