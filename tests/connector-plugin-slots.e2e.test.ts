import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { renderMolisWorkSettings, renderMolisWorkSettingsStylesheet, type MolisWorkSettingsView } from "./workbench-renderer-fixture.js";

const binding = { install_id: "slots-install", plugin_id: "slots-probe", slot_id: "api", service_id: "github" };
const projectId = '项目 /&?" +#%';
const apiPath = "/api/settings/connectors/plugin-slots";
// An independent expected wire value: do not derive it with the renderer's encoding algorithm.
const projectQuery = "?project=%E9%A1%B9%E7%9B%AE%20%2F%26%3F%22%20%2B%23%25";
const account = "[data-plugin-slot-account]";

interface HeldRequest { method: string | undefined; url: string | undefined; body: string; response: ServerResponse }
interface SlotState {
  value: string; saved: string; disabled: boolean; busy: string | null;
  hidden: boolean; tone: string | undefined; role: string | null; text: string;
}

function settings(project: boolean): MolisWorkSettingsView {
  return {
    section: "connectors", runtimes: [], projects: [], connectors: [],
    context_project: project ? { project_id: projectId, display_name: "编码项目" } : null,
    plugin_slots: [{ ...binding, plugin_name: "账号测试", reason: "保存账号", connection_id: "account-original", tenant: false }],
    connector_connections: ["account-original", "account-next"].map(connection_id => ({
      connection_id, service_id: "github", display_name: connection_id, account_label: null,
      auth_method: "token", source: "managed", enabled: true, state: "connected",
    })),
    web_service: { provider: "macos-launchagent", state: "absent", supported: true, owned: false, running: false,
      label: "Web", plist_path: "", command: [], stdout_log: "", stderr_log: "", message: "" },
    diagnostics: { home_directory: "/tmp", installation_state: "ready", version: "0.2.0", release_directory: "/tmp", project_count: 0, launchers: [] },
  };
}

/** Real production settings HTML and inline scripts; only the HTTP response is controlled, not Host authorization or storage. */
async function openSlots(t: TestContext, project: boolean) {
  const executable = locateTestChrome();
  if (!executable) { t.skip("Chrome is required for plugin slot settings"); return null; }
  const html = renderMolisWorkSettings(settings(project), "slots-component-control-0123456789");
  const css = renderMolisWorkSettingsStylesheet();
  const directory = await mkdtemp(join(tmpdir(), "molis-plugin-slots-"));
  const held: HeldRequest[] = [], seen: HeldRequest[] = [];
  let receive: ((request: HeldRequest) => void) | undefined, harness: ChromeHarness | undefined;
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/api/settings/connectors/")) {
      const chunks: Buffer[] = [];
      request.on("data", chunk => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        const input = { method: request.method, url: request.url, body: Buffer.concat(chunks).toString(), response };
        seen.push(input);
        if (receive) { const deliver = receive; receive = undefined; deliver(input); } else held.push(input);
      });
    } else if (request.url?.startsWith("/settings/connectors")) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(html);
    } else if (request.url === "/assets/molis-work-settings.css") {
      response.writeHead(200, { "content-type": "text/css; charset=utf-8" }); response.end(css);
    } else { response.writeHead(404); response.end(); }
  });
  t.after(async () => {
    try { await harness?.close(); }
    finally {
      try {
        server.closeAllConnections();
        if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  harness = await ChromeHarness.start(directory, { executable });
  const page = await harness.page(), exceptions: unknown[] = [];
  harness.on("Runtime.exceptionThrown", event => exceptions.push(event));
  await page.command("Runtime.enable");
  await page.command("Page.navigate", { url: origin + "/settings/connectors" + (project ? projectQuery : "") });
  await page.wait("document.querySelector('[data-connectors-settings]')?.dataset.connectorsBound === '1'");
  const next = () => new Promise<HeldRequest>((resolve, reject) => {
    const ready = held.shift(); if (ready) { resolve(ready); return; }
    const timer = setTimeout(() => { receive = undefined; reject(new Error("No plugin slot request arrived")); }, 10_000);
    receive = request => { clearTimeout(timer); resolve(request); };
  });
  return { page, next, seen, exceptions };
}

for (const project of [false, true]) {
  test(`RAC-657 R55 ${project ? "encoded Project" : "Home"} slot saves, rolls back to the latest successful account on refusal, and saves again`, { timeout: 60_000 }, async t => {
    const browser = await openSlots(t, project); if (!browser) return;
    const { page, next, seen, exceptions } = browser;
    const state = () => page.evaluate<SlotState>(`(() => {
      const select = document.querySelector('${account}'), result = document.querySelector('[data-plugin-slot-result]');
      return { value: select.value, saved: select.dataset.saved, disabled: select.disabled, busy: select.getAttribute('aria-busy'),
        hidden: result.hidden, tone: result.dataset.tone, role: result.getAttribute('role'), text: result.textContent.trim() };
    })()`);
    assert.equal(await page.evaluate("document.querySelector('[data-plugin-slots]').dataset.pluginSlots"), "plugin-slots" + (project ? projectQuery : ""));
    assert.deepEqual(await page.evaluate(`({value: document.querySelector('${account}').value, saved: document.querySelector('${account}').dataset.saved})`),
      { value: "account-original", saved: "account-original" });
    const change = async (value: string, saved: string) => {
      await page.evaluate(`(() => { const select = document.querySelector('${account}'); select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      const request = await next();
      assert.equal(request.method, "POST");
      assert.equal(request.url, apiPath + (project ? projectQuery : ""));
      assert.equal(new URL(request.url!, "http://127.0.0.1").searchParams.get("project"), project ? projectId : null);
      assert.deepEqual(JSON.parse(request.body), { ...binding, connection_id: value });
      const pending = await state();
      assert.deepEqual({ value: pending.value, saved: pending.saved, disabled: pending.disabled, busy: pending.busy },
        { value, saved, disabled: true, busy: "true" }, "the held HTTP response keeps the previous saved account and marks the select busy");
      return request.response;
    };
    const settle = async (response: ServerResponse, status: number, body: object, value: string) => {
      response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body));
      await page.wait(`document.querySelector('${account}').getAttribute('aria-busy') === 'false'`);
      const result = await state();
      assert.deepEqual(result, { value, saved: value, disabled: false, busy: "false", hidden: false,
        tone: status === 200 ? "success" : "error", role: status === 200 ? "status" : "alert",
        text: status === 200 ? "已保存，插件之后的请求用这个账号。" : "没有权限保存账号" });
    };
    await settle(await change("account-next", "account-original"), 200, {}, "account-next");
    await settle(await change("account-original", "account-next"), 403,
      { code: "actions.forbidden", error: "没有权限保存账号" }, "account-next");
    await settle(await change("account-original", "account-next"), 200, {}, "account-original");
    assert.equal(seen.length, 3, "one request per change, including recovery after refusal");
    assert.deepEqual(exceptions, [], "the current production page and client scripts complete without uncaught exceptions");
  });
}
