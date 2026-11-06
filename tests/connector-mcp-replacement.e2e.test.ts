// ASC-59 (spec assistant-service-connections §13.2, the person 2026-11-06): logging in again to a remote MCP service makes a new connection,
// and the new one offers to take over what used the old one. Real production settings HTML and client scripts in Chrome; only the HTTP
// answers are the test's, so what is checked is what the page asks for and what it shows, not the Host's own checks (those are S-108).
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { renderMolisWorkSettings, renderMolisWorkSettingsStylesheet, type MolisWorkSettingsView } from "./workbench-renderer-fixture.js";

const OLD = "11111111-1111-4111-8111-111111111111", NEW = "22222222-2222-4222-8222-222222222222";
const GITHUB = "33333333-3333-4333-8333-333333333333", NOTION_OAUTH = "44444444-4444-4444-8444-444444444444";
const AUTHORIZATION = "55555555-5555-4555-8555-555555555555";
type Stage = "before" | "after" | "removed";

const mcpCard = { connector_id: "notion", title: "Notion", availability: "live", auth_kind: "oauth", group_id: "work", summary: "笔记与文档", capabilities: [],
  method_options: [{ kind: "mcp", support: "in_app", login_ready: true, note: "官方工具", links: [], mcp: { endpoint: "https://mcp.notion.com/mcp", client_registration: "dynamic" } }] } as const;
const tokenCard = { connector_id: "github", title: "GitHub", availability: "live", auth_kind: "token", group_id: "code", summary: "代码与发布", capabilities: [],
  method_options: [{ kind: "token", support: "paste", note: "", links: [] }] } as const;
const row = (connection_id: string, service_id: string, display_name: string, auth_method: "mcp" | "oauth" | "token") =>
  ({ connection_id, service_id, display_name, account_label: null, auth_method, source: "managed", enabled: true, state: "connected", revision: `rev-${connection_id.slice(0, 4)}` } as const);

function settings(stage: Stage): MolisWorkSettingsView {
  const rows = [
    ...(stage === "removed" ? [] : [row(OLD, "notion", "旧 Notion", "mcp")]),
    ...(stage === "before" ? [] : [row(NEW, "notion", "新 Notion", "mcp")]),
    row(NOTION_OAUTH, "notion", "Notion 账号", "oauth"), row(GITHUB, "github", "工作 GitHub", "token"),
  ];
  return {
    section: "connectors", runtimes: [], projects: [], connectors: [mcpCard, tokenCard], connector_connections: rows, context_project: null,
    web_service: { provider: "macos-launchagent", state: "absent", supported: true, owned: false, running: false, label: "Web", plist_path: "", command: [], stdout_log: "", stderr_log: "", message: "" },
    diagnostics: { home_directory: "/tmp", installation_state: "ready", version: "0.2.0", release_directory: "/tmp", project_count: 0, launchers: [] },
  };
}

interface Held { method: string | undefined; url: string; body: string; response: ServerResponse }

async function openConnections(t: TestContext) {
  const executable = locateTestChrome();
  if (!executable) { t.skip("Chrome is required for the connections page"); return null; }
  const css = renderMolisWorkSettingsStylesheet();
  const directory = await mkdtemp(join(tmpdir(), "molis-mcp-replacement-"));
  const held: Held[] = [], seen: Held[] = [];
  let stage: Stage = "before", receive: ((request: Held) => void) | undefined, harness: ChromeHarness | undefined;
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    if (url.startsWith("/api/settings/connectors/")) {
      const chunks: Buffer[] = [];
      request.on("data", chunk => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        const input = { method: request.method, url, body: Buffer.concat(chunks).toString(), response };
        seen.push(input);
        if (receive) { const deliver = receive; receive = undefined; deliver(input); } else held.push(input);
      });
    } else if (url.startsWith("/settings/connectors") || url.startsWith("/capabilities/connections")) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(renderMolisWorkSettings(settings(stage), "replacement-control-0123456789"));
    } else if (url === "/assets/molis-work-settings.css") {
      response.writeHead(200, { "content-type": "text/css; charset=utf-8" }); response.end(css);
    } else if (url === "/official-login") { response.writeHead(200, { "content-type": "text/html" }); response.end("<p>login</p>"); }
    else { response.writeHead(404); response.end(); }
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
  const open = async () => {
    await page.command("Page.navigate", { url: origin + "/settings/connectors?connector=notion" });
    await page.wait("document.querySelector('[data-connectors-settings]')?.dataset.connectorsBound === '1' && !document.querySelector('[data-connector-detail=\"notion\"]').hidden");
  };
  await open();
  const next = () => new Promise<Held>((resolve, reject) => {
    const ready = held.shift(); if (ready) { resolve(ready); return; }
    const timer = setTimeout(() => { receive = undefined; reject(new Error("No connections request arrived")); }, 10_000);
    receive = request => { clearTimeout(timer); resolve(request); };
  });
  const answer = (request: Held, body: unknown, status = 200) => { request.response.writeHead(status, { "content-type": "application/json" }); request.response.end(JSON.stringify(body)); };
  return { page, origin, next, answer, seen, exceptions, open, setStage: (value: Stage) => { stage = value; } };
}

const resultOf = (id: string) => `document.querySelector('[data-connection-row="${id}"] [data-connection-result]')`;
const text = (page: ChromePage, expression: string) => page.evaluate<string>(`(${expression})?.textContent.trim() ?? ''`);

/** Log in again from the old MCP connection: the button says so, and the login it starts is a new one, not this connection's. */
async function startLoginAgain(page: ChromePage) {
  assert.equal(await text(page, `document.querySelector('[data-connection-reauthorize="${OLD}"]')`), "重新登录");
  await page.click(`[data-connection-reauthorize="${OLD}"]`);
  const area = `document.querySelector('[data-connector-detail="notion"] [data-protocol="mcp"]')`;
  assert.deepEqual(await page.evaluate(`({ replaces: ${area}.dataset.replaces, connection: ${area}.dataset.connectionId ?? null })`), { replaces: OLD, connection: null });
  assert.match(await text(page, `${area}.querySelector('[data-protocol-result]')`), /新建一条连接，原来的这条不动/);
  await page.evaluate(`${area}.querySelector('[data-protocol-start="mcp"]').click()`);
}

test("ASC-59 logging in again to an MCP service makes a new connection, then moves the old one's uses in one step and removes it on request", { timeout: 90_000 }, async t => {
  const browser = await openConnections(t); if (!browser) return;
  const { page, next, answer, seen, exceptions, open, setStage } = browser;
  await startLoginAgain(page);
  const start = await next();
  assert.equal(start.url, "/api/settings/connectors/methods/mcp/start");
  const body = JSON.parse(start.body) as Record<string, unknown>;
  assert.equal(body.service_id, "notion");
  assert.equal("connection_id" in body, false, "the login is never sent as the old connection's: the Host would refuse it, and it must not swap the account");
  setStage("after");
  answer(start, { connection_id: NEW, tools: [] });
  const usages = await next();
  assert.deepEqual([usages.method, usages.url], ["GET", `/api/settings/connectors/connections/${OLD}/usages`]);
  answer(usages, { usages: [{ usage_id: "here", title: "模型 here", enabled: true, actions: [] }, { usage_id: "there", title: "模型 there", enabled: true, actions: [] }], issues: [] });
  const move = `${resultOf(NEW)}?.querySelector('.mw-btn--primary')`;
  await page.wait(`${move}`);
  assert.equal(await text(page, move), "把用到「旧 Notion」的 2 个地方换到这条");
  assert.match(await text(page, resultOf(NEW)), /这条是替「旧 Notion」重新登录的/);
  assert.equal(await page.evaluate(`${resultOf(OLD)}.hidden`), true, "the old connection's own row is left as it was");
  // Two quick clicks send one switch: the button is busy from the first.
  await page.evaluate(`(() => { const button = ${move}; button.click(); button.click(); })()`);
  const switched = await next();
  assert.deepEqual([switched.method, switched.url, JSON.parse(switched.body)], ["POST", `/api/settings/connectors/connections/${NEW}/switch`, { from_connection_id: OLD }]);
  answer(switched, { results: [{ capability_id: "models.connection.switch", version: 1, provider_id: "system.connectors", reporter: "模型", switched: ["here"], refused: [{ usage_id: "there", code: "model_provider.origin_mismatch" }] }], failed: [] });
  await page.wait(`${resultOf(NEW)}.textContent.includes('换过去 1 处')`);
  assert.match(await text(page, resultOf(NEW)), /换过去 1 处，1 处没换：.*1 处：新连接绑定的地址和这个模型的地址不一致/s);
  assert.equal(await page.evaluate(`${move}?.textContent.includes('换到这条') ?? false`), false, "the switch is not offered again once it has run");
  assert.equal(seen.filter(request => request.url.endsWith("/switch")).length, 1);
  await page.evaluate(`[...${resultOf(NEW)}.querySelectorAll('button')].find(button => button.textContent === '移除旧连接').click()`);
  const removed = await next();
  assert.deepEqual([removed.url, JSON.parse(removed.body)], [`/api/settings/connectors/connections/${OLD}/manage`, { action: "remove", expected_revision: "rev-1111" }]);
  setStage("removed");
  answer(removed, { connection: { connection_id: OLD } });
  await page.wait(`document.querySelector('[data-connector-detail="notion"] [data-connector-feedback]')?.textContent.includes('已移除「旧 Notion」。还有 1 处没换过来')`);
  // Opening the page again offers nothing: the login's note was used once.
  await open();
  await page.evaluate("new Promise(resolve => setTimeout(resolve, 600))");
  assert.equal(seen.filter(request => request.url.endsWith("/usages")).length, 1, "a returned page does not offer the switch again");
  assert.deepEqual(exceptions, []);
});

test("ASC-59 a cancelled login offers no switch and leaves the old connection as it was", { timeout: 60_000 }, async t => {
  const browser = await openConnections(t); if (!browser) return;
  const { page, origin, next, answer, seen, exceptions } = browser;
  await startLoginAgain(page);
  const start = await next();
  answer(start, { connection_id: NEW, authorization_id: AUTHORIZATION, authorization_url: origin + "/official-login" });
  await page.wait(`JSON.parse(sessionStorage.getItem('molis-connectors-pending') || 'null')?.replaces === ${JSON.stringify(OLD)}`);
  const status = await next();
  assert.equal(status.url, `/api/settings/connectors/authorizations/${AUTHORIZATION}`);
  answer(status, { status: "cancelled" });
  await page.wait(`document.querySelector('[data-connector-detail="notion"] [data-protocol="mcp"] [data-protocol-result]').textContent.includes('授权已取消')`);
  assert.equal(await page.evaluate("sessionStorage.getItem('molis-connectors-pending')"), null);
  assert.equal(await page.evaluate("document.querySelector('[data-connection-replacement]')"), null);
  assert.equal(await page.evaluate(`!!document.querySelector('[data-connection-row="${OLD}"]')`), true);
  assert.deepEqual(seen.filter(request => /\/(usages|switch|manage)$/.test(request.url)), [], "nothing is read, switched or removed");
  assert.deepEqual(exceptions, []);
});

test("ASC-59 a note naming another service's connection, a connection that is not MCP, or the new one itself is offered nothing", { timeout: 60_000 }, async t => {
  const browser = await openConnections(t); if (!browser) return;
  const { page, seen, exceptions, open, setStage } = browser;
  setStage("after");
  for (const replaces of [GITHUB, NOTION_OAUTH, NEW, "99999999-9999-4999-8999-999999999999"]) {
    await page.evaluate(`sessionStorage.setItem('molis-connectors-notice', ${JSON.stringify(JSON.stringify({ service: "notion", id: NEW, message: "已连接", replaces }))})`);
    await open();
    await page.evaluate("new Promise(resolve => setTimeout(resolve, 300))");
    assert.equal(await page.evaluate("document.querySelector('[data-connection-replacement]')"), null, replaces);
    assert.equal(await page.evaluate("sessionStorage.getItem('molis-connectors-notice')"), null, "the note is used once whatever it named");
  }
  assert.deepEqual(seen.filter(request => /\/(usages|switch|manage)$/.test(request.url)), [], "nothing is read or switched");
  assert.deepEqual(exceptions, []);
});
