import assert from "node:assert/strict";
import test from "node:test";
import type { PluginInstalledView } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { HomeConsentLedger } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { residentManagement } from "./fixtures/resident-management.js";

// ac-trust T7, the interface's door: a project's 插件 page reads what is installed and installs a signed package, and takes an agreement
// back, through `/projects/<id>/api/plugin-trust/*`. RAC-407 every step that changes something is behind the control token and the page's origin, and the routes read nothing the entry says about
// who the person is; RAC-408 a package is previewed, then installed under the pin the person gives; RAC-409 an agreement is taken back
// and the overview says so; RAC-406 the page is in the project's settings.

const mac = { skip: process.platform !== "darwin", timeout: 240_000 };
interface Overview { plugins: PluginInstalledView[]; publishers: Array<{ key_id: string; label: string }> }

async function setup(t: Parameters<typeof residentManagement>[0]) {
  const env = await residentManagement(t, { completeText: null });
  const prefix = `${env.origin}/projects/${env.project.project_id}`;
  const send = async <Body = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string | undefined> } = {}) => {
    const response = await fetch(prefix + path, { method: init.method ?? "POST", headers: env.headers(init.headers), ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) });
    return { status: response.status, body: await response.json() as Body };
  };
  const overview = async () => (await send<Overview>("/api/plugin-trust/overview", { method: "GET" })).body;
  return { ...env, prefix, send, overview };
}

test("RAC-407 the plugin routes need the control token, take only the steps they name, and refuse a body that says who the person is", mac, async t => {
  const env = await setup(t);
  const bundle = signedPackage(newPublisher());
  for (const step of ["install/preview", "install/confirm", "consents/revoke"]) {
    assert.equal((await env.send(`/api/plugin-trust/${step}`, { body: { bundle }, headers: { "x-molis-work-control-token": undefined } })).status >= 400, true, `${step} without the control token`);
  }
  assert.equal((await env.send("/api/plugin-trust/install/preview", { body: { bundle }, headers: { origin: "http://127.0.0.1:1" } })).status >= 400, true, "another origin");
  assert.equal((await env.send("/api/plugin-trust/install/preview", { method: "GET" })).status >= 400, true, "a read of a step");
  assert.equal((await env.send("/api/plugin-trust/nowhere", { body: {} })).status >= 400, true, "no such step");
  const forged = await env.send("/api/plugin-trust/consents/revoke", { body: { consent_id: "x", user_action: { source: "web", conversation_ref: "a", message_ref: "b" } } });
  assert.equal(forged.body.code, "actions.input_invalid", "the entry stamps who acted; the body is not read for it");
  assert.equal((await env.send("/api/plugin-trust/consents/revoke", { body: { consent_id: "no-such-consent" } })).body.code, "plugin.consent_unknown");
});

test("RAC-408 a package is previewed (nothing is written), then installed under the pin the person gives, and the overview lists it with what it asked for", mac, async t => {
  const env = await setup(t);
  const publisher = newPublisher(), bundle = signedPackage(publisher);
  const before = await env.overview();
  const preview = await env.send<{ preview_id: string; preview: { permissions: Array<{ permission: string; reason: string; meaning: string | null }> } }>("/api/plugin-trust/install/preview", { body: { bundle } });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const shown = preview.body;
  assert.deepEqual(shown.preview.permissions.map(item => [item.permission, item.reason, item.meaning === null]), [["storage:private", "保存这个插件自己的数据", false]]);
  assert.deepEqual((await env.overview()).plugins.length, before.plugins.length, "a preview installs nothing");
  assert.equal((await env.send("/api/plugin-trust/install/confirm", { body: { preview_id: shown.preview_id, consent: true } })).body.code, "plugin.publisher_untrusted");
  const again = await env.send("/api/plugin-trust/install/preview", { body: { bundle } });
  const installed = await env.send("/api/plugin-trust/install/confirm", { body: { preview_id: (again.body as { preview_id: string }).preview_id, consent: true, pin_label: "Example" } });
  assert.equal(installed.status, 200, JSON.stringify(installed.body));
  const after = await env.overview();
  const plugin = after.plugins.find(item => item.plugin_id === PACKAGE_PLUGIN_ID)!;
  assert.deepEqual([plugin.trust, plugin.publisher_label, plugin.manifest_available, plugin.permissions.map(item => item.permission)], ["pinned", "Example", true, ["storage:private"]]);
  assert.deepEqual(after.publishers.map(pin => [pin.key_id, pin.label]), [[publisher.identity, "Example"]]);
  assert.equal(after.plugins.some(item => item.trust === "host"), true, "the plugins that ship with Molis Work are listed too, as such");
});

test("RAC-409 taking an agreement back through the route writes revoked_at, and the overview shows it as revoked", mac, async t => {
  const env = await setup(t);
  const publisher = newPublisher();
  const preview = await env.send("/api/plugin-trust/install/preview", { body: { bundle: signedPackage(publisher) } });
  await env.send("/api/plugin-trust/install/confirm", { body: { preview_id: (preview.body as { preview_id: string }).preview_id, consent: true, pin_label: "Example" } });
  const ledger = new HomeConsentLedger(env.home);
  const [given] = ledger.record({ plugin_id: PACKAGE_PLUGIN_ID, publisher_signature: publisher.identity, manifest_digest: "digest", granted_by: "user", grants: [{ kind: "always_on", subject: "plugin" }], at: "2026-10-25T00:00:00.000Z" });
  const listed = (await env.overview()).plugins.find(item => item.plugin_id === PACKAGE_PLUGIN_ID)!;
  assert.deepEqual(listed.consents.map(item => [item.consent_id, item.revoked_at]), [[given!.consent_id, null]]);
  const revoked = await env.send("/api/plugin-trust/consents/revoke", { body: { consent_id: given!.consent_id } });
  assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
  const after = (await env.overview()).plugins.find(item => item.plugin_id === PACKAGE_PLUGIN_ID)!;
  assert.equal(after.consents.length, 1);
  assert.notEqual(after.consents[0]!.revoked_at, null, "kept as a row, marked revoked");
});

test("RAC-406 the project's settings has a 插件 page, in the directory and as an embedded section", mac, async t => {
  const env = await setup(t);
  const page = await fetch(`${env.prefix}/settings/plugins`).then(response => response.text());
  assert.match(page, /data-plugin-trust-settings/);
  assert.match(page, new RegExp(`href="[^"]*/projects/${env.project.project_id}/settings/plugins"`), "the project settings navigation links it");
  const embedded = await fetch(`${env.prefix}/settings/plugins?embed=1`).then(response => response.text());
  assert.match(embedded, /data-plugin-trust-settings/);
  assert.doesNotMatch(embedded, /<main class="settings-shell">/, "an embedded section brings no page chrome");
});
