import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// PG-002 and BL-700, S-94: the 插件 page's switches, with the page program the Host really sends (its HTML, inline scripts and the shared request
// client) run in a real browser. The source-text checks in security-invariants-plugin-permissions-http.test.ts could not see a switch that did not
// work at all (the project's list handed the row renderer its index as the send function); this clicks the switches and reads what the page sends.
// Only the HTTP answers are stubbed: the Host's side of both doors is in that file and in security-invariants-plugin-permissions.test.ts.

const viewOf = (name: string, installId: string, permissions: Array<{ permission: string; required: boolean; granted: boolean; requested?: boolean }>) => ({
  install_id: installId, plugin_id: `io.molis.work.${name}`, name, version: "1.0.0", trust: "pinned", publisher_label: "example", publisher_signature: "ed25519:sha256:aa",
  state: "running", manifest_available: true, jobs: [], consents: [],
  permissions: permissions.map(item => ({ requested: true, ...item, reason: `${name} 要用它`, meaning: "" })),
});

interface Seen { url: string; body: unknown }

async function openPluginPage(t: TestContext) {
  const executable = locateTestChrome();
  if (!executable) { t.skip("Chrome is required for the plugin permission switches"); return null; }
  assert.equal(executable, "/Users/yijunwang/.local/bin/molis-test-browser");
  const host = await serveHomeRuntime(t), project = await host.project("权限开关页面");
  const prefix = `/projects/${project.project_id}`;
  const html = await (await host.request(`${prefix}/settings/plugins`)).text();
  assert.match(html, /molisWorkBindPluginTrustSettings/, "the Host sends the plugin settings program");
  const projectPlugin = viewOf("项目里的插件", "project-install", [
    { permission: "storage:private", required: true, granted: true },
    { permission: "model:read", required: false, granted: false },
    { permission: "network:api.example.com", required: false, granted: false },
  ]);
  const homePlugin = viewOf("个人空间的插件", "home-install", [{ permission: "surface:browser", required: false, granted: true },
    { permission: "owner-files:write", required: false, requested: false, granted: false }]);
  const state = new Map([[projectPlugin.install_id, projectPlugin], [homePlugin.install_id, homePlugin]]);
  const seen: Seen[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", chunk => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const url = request.url ?? "", text = Buffer.concat(chunks).toString();
      const json = (status: number, value: unknown) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
      if (request.method === "GET" && url.startsWith(`${prefix}/settings/plugins`)) { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(html); return; }
      if (url === `${prefix}/api/plugin-trust/overview`) { json(200, { plugins: [projectPlugin], publishers: [] }); return; }
      if (url === "/api/settings/plugin-permissions/list") { json(200, { plugins: [homePlugin] }); return; }
      if (url === `${prefix}/api/plugin-trust/permissions/set` || url === "/api/settings/plugin-permissions/set") {
        const body = JSON.parse(text) as { install_id: string; permission: string; granted: boolean };
        seen.push({ url, body });
        const view = state.get(body.install_id)!;
        for (const item of view.permissions) if (item.permission === body.permission) item.granted = body.granted;
        json(200, { install_id: body.install_id, changed: true, permissions: view.permissions });
        return;
      }
      json(404, { code: "actions.not_found", error: "stub" });
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const directory = await mkdtemp(join(tmpdir(), "molis-plugin-switch-"));
  let harness: ChromeHarness | undefined;
  t.after(async () => {
    try { await harness?.close(); }
    finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
  harness = await ChromeHarness.start(directory, { executable });
  const page = await harness.page();
  await page.command("Runtime.enable");
  await page.command("Page.navigate", { url: `http://127.0.0.1:${address.port}${prefix}/settings/plugins` });
  await page.wait("document.querySelectorAll('[data-plugin-trust-list] input[role=switch]').length === 2 && document.querySelectorAll('[data-plugin-trust-home] input[role=switch]').length === 1",
    { describe: "document.querySelector('[data-plugin-trust-error]')?.textContent" });
  await page.evaluate("document.querySelectorAll('details.plugin-trust-item').forEach(item => { item.open = true; })");
  const switchOf = (permission: string) => `input[role=switch][aria-label="${permission}"]`;
  const checked = (permission: string) => page.evaluate<boolean>(`document.querySelector('${switchOf(permission)}').checked`);
  const requests = async (count: number) => {
    const until = Date.now() + 8_000;
    while (seen.length < count && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 40));
    return seen;
  };
  return { page, seen, requests, switchOf, checked, prefix };
}

test("RAC-959 S-94 the 插件 page's switches, run in a browser, send the project's switch to the project's door and the Home plugin's to the Host settings door, and a wide permission waits for its confirmation", { timeout: 120_000 }, async t => {
  const browser = await openPluginPage(t); if (!browser) return;
  const { page, seen, requests, switchOf, checked, prefix } = browser;
  // RAC2865: the real renderer shows a shape-only row but gives it no granting control.
  assert.equal(await page.evaluate(`document.querySelector('${switchOf("owner-files:write")}')`), null);
  assert.match(await page.evaluate<string>("document.querySelector('[data-plugin-trust-home]').innerText"), /本次未请求/u);

  // The project's plugin: one click on an ordinary optional permission is one request to the project's door, and the switch stays on.
  await page.click(switchOf("model:read"));
  assert.deepEqual((await requests(1)).map(item => item.url), [`${prefix}/api/plugin-trust/permissions/set`]);
  assert.deepEqual(seen[0]!.body, { install_id: "project-install", permission: "model:read", granted: true });
  await page.wait(`document.querySelector('${switchOf("model:read")}').disabled === false`);
  assert.equal(await checked("model:read"), true, "the switch the person turned on stays on");
  assert.equal(await page.evaluate("document.querySelector('[data-plugin-trust-error]').hidden"), true, "no error is shown");

  // A permission that reaches out asks first: nothing is sent while the dialog is open, and cancelling puts the switch back.
  await page.click(switchOf("network:api.example.com"));
  await page.wait("document.querySelector('dialog[data-slot=alert-dialog]')?.open === true");
  assert.equal(seen.length, 1, "nothing is sent before the confirmation");
  await page.click("dialog[data-slot=alert-dialog] button.mw-btn--secondary");
  await page.wait("!document.querySelector('dialog[data-slot=alert-dialog]')");
  assert.equal(await checked("network:api.example.com"), false, "cancelling leaves it off");
  assert.equal(seen.length, 1, "cancelling sends nothing");

  // Confirming sends it.
  await page.click(switchOf("network:api.example.com"));
  await page.wait("document.querySelector('dialog[data-slot=alert-dialog]')?.open === true");
  await page.click("dialog[data-slot=alert-dialog] button.mw-btn--danger");
  assert.equal((await requests(2)).length, 2);
  assert.deepEqual(seen[1]!, { url: `${prefix}/api/plugin-trust/permissions/set`, body: { install_id: "project-install", permission: "network:api.example.com", granted: true } });

  // The Home's own plugin: its switch goes to the Host settings door, not the project's.
  await page.click(switchOf("surface:browser"));
  assert.equal((await requests(3)).length, 3);
  assert.deepEqual(seen[2]!, { url: "/api/settings/plugin-permissions/set", body: { install_id: "home-install", permission: "surface:browser", granted: false } });
  await page.wait(`document.querySelector('${switchOf("surface:browser")}').disabled === false`);
  assert.equal(await checked("surface:browser"), false, "the Home plugin's switch is off after its answer");
});
