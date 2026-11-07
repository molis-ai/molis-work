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
const AUTHORIZATION = "55555555-5555-4555-8555-555555555555", ELSEWHERE = "66666666-6666-4666-8666-666666666666";
const ENDPOINT = "https://mcp.notion.com/v2/mcp";
type Stage = "before" | "after" | "removed";

const mcpCard = { connector_id: "notion", title: "Notion", availability: "live", auth_kind: "oauth", group_id: "work", summary: "笔记与文档", capabilities: [],
  method_options: [{ kind: "mcp", support: "in_app", login_ready: true, note: "官方工具", links: [], mcp: { endpoint: "https://mcp.notion.com/mcp", client_registration: "dynamic" } }] } as const;
const tokenCard = { connector_id: "github", title: "GitHub", availability: "live", auth_kind: "token", group_id: "code", summary: "代码与发布", capabilities: [],
  method_options: [{ kind: "token", support: "paste", note: "", links: [] }] } as const;
const row = (connection_id: string, service_id: string, display_name: string, auth_method: "mcp" | "oauth" | "token", mcp_endpoint?: string) =>
  ({ connection_id, service_id, display_name, account_label: null, auth_method, source: "managed", enabled: true, state: "connected", revision: `rev-${connection_id.slice(0, 4)}`, ...(mcp_endpoint ? { mcp_endpoint } : {}) } as const);

function settings(stage: Stage, oldName: string): MolisWorkSettingsView {
  const rows = [
    ...(stage === "removed" ? [] : [row(OLD, "notion", oldName, "mcp", ENDPOINT)]),
    ...(stage === "before" ? [] : [row(NEW, "notion", "新 Notion", "mcp", ENDPOINT)]),
    row(ELSEWHERE, "notion", "另一台 Notion", "mcp", "https://notion.example.test/mcp"),
    row(NOTION_OAUTH, "notion", "Notion 账号", "oauth"), row(GITHUB, "github", "工作 GitHub", "token"),
  ];
  return {
    section: "connectors", runtimes: [], projects: [], connectors: [mcpCard, tokenCard], connector_connections: rows, context_project: null,
    web_service: { provider: "macos-launchagent", state: "absent", supported: true, owned: false, running: false, label: "Web", plist_path: "", command: [], stdout_log: "", stderr_log: "", message: "" },
    diagnostics: { home_directory: "/tmp", installation_state: "ready", version: "0.2.0", release_directory: "/tmp", project_count: 0, launchers: [] },
  };
}

interface Held { method: string | undefined; url: string; body: string; response: ServerResponse }

async function openConnections(t: TestContext, oldName = "旧 Notion") {
  const executable = locateTestChrome();
  if (!executable) { t.skip("Chrome is required for the connections page"); return null; }
  const css = renderMolisWorkSettingsStylesheet();
  const directory = await mkdtemp(join(tmpdir(), "molis-mcp-replacement-"));
  const held: Held[] = [], seen: Held[] = [], reads: string[] = [];
  // Who uses each connection (ASC-74): the page reads it when the service opens, and the offer after a new login uses that same read.
  // The test says what each read answers; the reads themselves are counted apart from the requests the test steps through.
  const usages = new Map<string, { usages: unknown[]; issues: string[] }>();
  let stage: Stage = "before", receive: ((request: Held) => void) | undefined, harness: ChromeHarness | undefined;
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    const read = request.method === "GET" ? /^\/api\/settings\/connectors\/connections\/([a-z0-9-]+)\/usages$/.exec(url) : null;
    if (read) {
      reads.push(read[1]!);
      response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(usages.get(read[1]!) ?? { usages: [], issues: [] }));
    } else if (url.startsWith("/api/settings/connectors/")) {
      const chunks: Buffer[] = [];
      request.on("data", chunk => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        const input = { method: request.method, url, body: Buffer.concat(chunks).toString(), response };
        seen.push(input);
        if (receive) { const deliver = receive; receive = undefined; deliver(input); } else held.push(input);
      });
    } else if (url.startsWith("/settings/connectors") || url.startsWith("/capabilities/connections")) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(renderMolisWorkSettings(settings(stage, oldName), "replacement-control-0123456789"));
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
  await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const open = async () => {
    await page.command("Page.navigate", { url: origin + "/settings/connectors?connector=notion" });
    await page.wait("document.querySelector('[data-connectors-settings]')?.dataset.connectorsBound === '1' && document.querySelector('[data-connector-item=\"notion\"]')?.dataset.open === 'true'");
  };
  await open();
  // Opening by address scrolls and focuses the title on the next frame; let it settle before measuring a real click.
  await page.wait("document.activeElement === document.querySelector('[data-connector-item=\"notion\"] [data-connection-toggle]')");
  const next = () => new Promise<Held>((resolve, reject) => {
    const ready = held.shift(); if (ready) { resolve(ready); return; }
    const timer = setTimeout(() => { receive = undefined; reject(new Error("No connections request arrived")); }, 10_000);
    receive = request => { clearTimeout(timer); resolve(request); };
  });
  const answer = (request: Held, body: unknown, status = 200) => { request.response.writeHead(status, { "content-type": "application/json" }); request.response.end(JSON.stringify(body)); };
  return { page, origin, next, answer, seen, reads, usages, exceptions, open, setStage: (value: Stage) => { stage = value; } };
}

const resultOf = (id: string) => `document.querySelector('[data-connection-row="${id}"] [data-connection-result]')`;
const text = (page: ChromePage, expression: string) => page.evaluate<string>(`(${expression})?.textContent.trim() ?? ''`);

/** Log in again from the old MCP connection: the button says so, and the login it starts is a new one, not this connection's. */
async function startLoginAgain(page: ChromePage, oldName = "旧 Notion") {
  assert.equal(await text(page, `document.querySelector('[data-connection-reauthorize="${OLD}"]')`), "重新登录");
  await page.click(`[data-connection-reauthorize="${OLD}"]`);
  const area = `document.querySelector('[data-connector-detail="notion"] [data-protocol="mcp"]')`;
  assert.deepEqual(await page.evaluate(`({ replaces: ${area}.dataset.replaces, connection: ${area}.dataset.connectionId ?? null })`), { replaces: OLD, connection: null });
  assert.match(await text(page, `${area}.querySelector('[data-protocol-result]')`), /新建一条连接，原来的这条不动/);
  assert.equal(await page.evaluate(`${area}.querySelector('[data-protocol-field="endpoint"]').value`), ENDPOINT, "the login starts at the old connection's address");
  // B2: the new connection gets a name told apart from the old one's, shown where only names are (Coding's MCP settings).
  assert.match(await page.evaluate<string>(`document.querySelector('[data-connector-detail="notion"] [data-connector-new-name]').value`), new RegExp(`^${oldName}（重新登录 \\d+月\\d+日）$`));
  await page.evaluate(`${area}.querySelector('[data-protocol-start="mcp"]').click()`);
}

/** Back from the login with the given usages read for the old connection; the page says the next step at its top and focuses the offer. */
async function returnWith(browser: NonNullable<Awaited<ReturnType<typeof openConnections>>>, read: { usages: unknown[]; issues: string[] }) {
  const { page, next, answer, setStage, reads, usages } = browser;
  const start = await next();
  assert.equal(start.url, "/api/settings/connectors/methods/mcp/start");
  const body = JSON.parse(start.body) as Record<string, unknown>;
  assert.equal(body.service_id, "notion");
  assert.equal(body.endpoint, ENDPOINT);
  assert.match(String(body.display_name), /^旧 Notion（重新登录 /);
  assert.equal("connection_id" in body, false, "the login is never sent as the old connection's: the Host would refuse it, and it must not swap the account");
  setStage("after");
  usages.set(OLD, read);
  const before = reads.length;
  answer(start, { connection_id: NEW, tools: [] });
  await page.wait(`${resultOf(NEW)}?.querySelector('.settings-connector-actions')`);
  assert.equal(reads.slice(before).filter(id => id === OLD).length, 1, "the old connection's uses are read once, for its row and the offer alike");
  assert.match(await text(page, `document.querySelector('[data-connector-detail="notion"] [data-connector-feedback]')`), /下面可以把用到原来那条的地方换到新连接/);
  assert.equal(await page.evaluate(`document.activeElement === ${resultOf(NEW)}`), true, "the offer takes the focus, so it is seen and read");
  assert.match(await text(page, resultOf(NEW)), /这条是替「旧 Notion」重新登录的。.*Coding 的 MCP 设置这里还查不到；如果那里选了「旧 Notion」，请到那里改选这条/s);
  assert.equal(await page.evaluate(`${resultOf(NEW)}.querySelector('a[href^="/settings/coding-settings"]')?.textContent`), "设置 Agent 工具");
}
const buttonIn = (id: string, label: string) => `[...${resultOf(id)}.querySelectorAll('button')].find(button => button.textContent === ${JSON.stringify(label)})`;

test("ASC-59 logging in again to an MCP service makes a new connection, then moves the old one's uses in one step and removes it on request", { timeout: 90_000 }, async t => {
  const browser = await openConnections(t); if (!browser) return;
  const { page, next, answer, seen, exceptions, open, setStage } = browser;
  await startLoginAgain(page);
  const source = (provider_id: string) => ({ capability_id: "connectors.usages", version: 1, provider_id });
  await returnWith(browser, { usages: [
    { usage_id: "here", title: "模型 here", enabled: true, actions: [], source: source("system.connectors"), reporter: "模型" },
    { usage_id: "there", title: "模型 there", enabled: true, actions: [], source: source("system.connectors"), reporter: "模型" },
    // Reports its usages but declares no switch: it is left with the general advice (review S6).
    { usage_id: "pic", title: "Images 生图", enabled: true, actions: [], source: source("plugin.images"), reporter: "Images" },
  ], issues: ["Notes：暂时无法读取使用位置"] });
  const move = `${resultOf(NEW)}?.querySelector('.mw-btn--primary')`;
  assert.equal(await text(page, move), "把用到「旧 Notion」的 3 个地方换到这条");
  assert.match(await text(page, resultOf(NEW)), /能查的地方里有 3 处用它.*模型 here.*Images 生图.*没能查：Notes：暂时无法读取使用位置/s, "a reporter that could not be read is said, not taken as unused");
  assert.deepEqual(await page.evaluate(`[...${resultOf(NEW)}.querySelectorAll('li')].map(item => item.textContent)`), ["模型 here", "模型 there", "Images 生图"], "what could not be read is not listed as a use (N3)");
  assert.equal(await page.evaluate(`${resultOf(OLD)}.hidden`), true, "the old connection's own row is left as it was");
  // Two quick clicks send one switch: the button is busy from the first.
  await page.evaluate(`(() => { const button = ${move}; button.click(); button.click(); })()`);
  const switched = await next();
  assert.deepEqual([switched.method, switched.url, JSON.parse(switched.body)], ["POST", `/api/settings/connectors/connections/${NEW}/switch`, { from_connection_id: OLD }]);
  answer(switched, { results: [{ capability_id: "models.connection.switch", version: 1, provider_id: "system.connectors", reporter: "模型", switched: ["here"], refused: [{ usage_id: "there", code: "connector.plugin_slots.usage_missing" }] }], failed: [] });
  await page.wait(`${resultOf(NEW)}.textContent.includes('换过去 1 处')`);
  // N1: the list follows the colon; what the page cannot see comes after it, a paragraph of its own.
  // What the read before could not check stays said after the switch (ASC-77): it is never "all moved" while a place was unchecked.
  assert.match(await text(page, resultOf(NEW)), /换过去 1 处，2 处没换：模型 there：这里已经不用原来那条了Images 生图：还不能一步换，请到用它的地方改选这条没能查：Notes：暂时无法读取使用位置Coding 的 MCP 设置这里还查不到/);
  assert.notEqual(await page.evaluate(`${resultOf(NEW)}.dataset.tone`), "error", "some moved: a partial result is not shown as an error");
  assert.equal(await page.evaluate(`${move}?.textContent.includes('换到这条') ?? false`), false, "the switch is not offered again once it has run");
  assert.equal(await page.evaluate(`document.activeElement === ${resultOf(NEW)}`), true, "the removed button leaves the focus on the result");
  assert.equal(seen.filter(request => request.url.endsWith("/switch")).length, 1);
  // Removing asks once first, saying what it cuts off; nothing is removed until the person confirms, and cancel puts the choices back (N2).
  const role = await page.evaluate<string | null>(`${resultOf(NEW)}.getAttribute('role')`);
  await page.evaluate(`${buttonIn(NEW, "移除旧连接")}.click()`);
  await page.wait(`${resultOf(NEW)}.textContent.includes('移除原来那条「旧 Notion」后，还在用它的地方会断开。已知 2 处没换过来。')`);
  assert.deepEqual(await page.evaluate(`[...${resultOf(NEW)}.querySelectorAll('button')].map(button => button.textContent)`), ["取消", "确认移除"]);
  await page.evaluate(`${buttonIn(NEW, "取消")}.click()`);
  await page.wait(`${resultOf(NEW)}.textContent.includes('换过去 1 处，2 处没换')`);
  assert.deepEqual(await page.evaluate(`[...${resultOf(NEW)}.querySelectorAll('button')].map(button => button.textContent)`), ["移除旧连接", "留着"]);
  assert.equal(await page.evaluate(`${resultOf(NEW)}.getAttribute('role')`), role, "ASC-79 M2: cancel puts back the result's role with its words");
  await page.evaluate(`${buttonIn(NEW, "移除旧连接")}.click()`);
  await page.wait(`${buttonIn(NEW, "确认移除")}`);
  assert.equal(seen.filter(request => request.url.endsWith("/manage")).length, 0);
  await page.evaluate(`${buttonIn(NEW, "确认移除")}.click()`);
  const removed = await next();
  assert.deepEqual([removed.url, JSON.parse(removed.body)], [`/api/settings/connectors/connections/${OLD}/manage`, { action: "remove", expected_revision: "rev-1111" }]);
  setStage("removed");
  answer(removed, { connection: { connection_id: OLD } });
  await page.wait(`document.querySelector('[data-connector-detail="notion"] [data-connector-feedback]')?.textContent.includes('已移除「旧 Notion」。')`);
  // Opening the page again offers nothing: the login's note was used once.
  await open();
  await page.evaluate("new Promise(resolve => setTimeout(resolve, 600))");
  assert.equal(await page.evaluate("document.querySelector('[data-connection-replacement]')"), null, "a returned page does not offer the switch again");
  assert.equal(seen.filter(request => request.url.endsWith("/switch")).length, 1);
  assert.deepEqual(exceptions, []);
});

test("ASC-59 when nothing counted uses the old connection, the page says what it looked at, not that nothing uses it, and keeping it asks nothing", { timeout: 60_000 }, async t => {
  const browser = await openConnections(t); if (!browser) return;
  const { page, seen, exceptions } = browser;
  await startLoginAgain(page);
  await returnWith(browser, { usages: [], issues: ["Images：暂时无法读取使用位置"] });
  const shown = await text(page, resultOf(NEW));
  assert.match(shown, /能查的地方里，没有查到用它的。/);
  assert.doesNotMatch(shown, /没有地方在用/, "what the page cannot see (Coding) is never said to be unused");
  assert.match(shown, /没能查：Images：暂时无法读取使用位置/);
  assert.equal(await page.evaluate(`${resultOf(NEW)}.querySelector('li')`), null, "what could not be read is not listed as a use (N3)");
  assert.equal(await page.evaluate(`${resultOf(NEW)}.querySelector('.mw-btn--primary')`), null, "nothing to move: no switch is offered");
  assert.deepEqual(await page.evaluate(`[...${resultOf(NEW)}.querySelectorAll('button')].map(button => button.textContent)`), ["移除旧连接", "留着"]);
  await page.evaluate(`${buttonIn(NEW, "移除旧连接")}.click()`);
  await page.wait(`${resultOf(NEW)}.textContent.includes('移除原来那条「旧 Notion」后，还在用它的地方会断开。')`);
  assert.doesNotMatch(await text(page, resultOf(NEW)), /已知/, "no known count when none was found");
  await page.evaluate(`${buttonIn(NEW, "取消")}.click()`);
  await page.wait(`${resultOf(NEW)}.textContent.includes('能查的地方里，没有查到用它的。')`);
  await page.evaluate(`${buttonIn(NEW, "留着")}.click()`);
  await page.wait(`${resultOf(NEW)}.textContent.includes('原来那条「旧 Notion」留着，两条连接都能用')`);
  assert.equal(await page.evaluate(`document.activeElement === ${resultOf(NEW)}`), true, "the removed buttons leave the focus on the result");
  assert.deepEqual(seen.filter(request => /\/(switch|manage)$/.test(request.url)), [], "nothing is switched or removed");
  assert.equal(await page.evaluate(`!!document.querySelector('[data-connection-row="${OLD}"]')`), true);
  assert.deepEqual(exceptions, []);
});

test("ASC-59 B2 an old connection under the default name gets a new one named apart from it, so Coding's list can tell them apart", { timeout: 60_000 }, async t => {
  const browser = await openConnections(t, "Notion"); if (!browser) return;
  const { page, next, exceptions } = browser;
  await startLoginAgain(page, "Notion");
  const start = await next();
  const name = (JSON.parse(start.body) as { display_name?: string }).display_name;
  assert.notEqual(name, "Notion", "not the service's name the old connection already has");
  assert.match(String(name), /^Notion（重新登录 \d+月\d+日）$/);
  // Leaving the login for another account takes back the name the page put in.
  await page.evaluate(`document.querySelector('[data-connector-detail="notion"] [data-connector-add] > summary').click()`);
  assert.equal(await page.evaluate<string>(`document.querySelector('[data-connector-detail="notion"] [data-connector-new-name]').value`), "");
  assert.deepEqual(exceptions, []);
});

test("ASC-79 M1: the name put in for a new login keeps within the 100 characters a name may have, however long the old one is", { timeout: 60_000 }, async t => {
  const long = "很长的 Notion 连接名".repeat(7).slice(0, 98);
  const browser = await openConnections(t, long); if (!browser) return;
  const { page, exceptions } = browser;
  await page.click(`[data-connection-reauthorize="${OLD}"]`);
  const name = await page.evaluate<string>(`document.querySelector('[data-connector-detail="notion"] [data-connector-new-name]').value`);
  assert.equal([...name].length, 100, "cut to whole characters at 100");
  assert.ok(name.startsWith(`${long}（`), "the old name comes first, whole");
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
  await page.wait(`document.querySelector('[data-connector-detail="notion"] [data-protocol="mcp"] [data-protocol-result]').textContent.includes('没有连上')`);
  assert.equal(await page.evaluate("sessionStorage.getItem('molis-connectors-pending')"), null);
  assert.equal(await page.evaluate("document.querySelector('[data-connection-replacement]')"), null);
  assert.equal(await page.evaluate(`!!document.querySelector('[data-connection-row="${OLD}"]')`), true);
  assert.deepEqual(seen.filter(request => /\/(switch|manage)$/.test(request.url)), [], "nothing is switched or removed");
  assert.deepEqual(exceptions, []);
});

test("ASC-59 a note naming another service's connection, a connection that is not MCP, one at another address, or the new one itself is offered nothing", { timeout: 60_000 }, async t => {
  const browser = await openConnections(t); if (!browser) return;
  const { page, seen, exceptions, open, setStage } = browser;
  setStage("after");
  for (const replaces of [GITHUB, NOTION_OAUTH, ELSEWHERE, NEW, "99999999-9999-4999-8999-999999999999"]) {
    await page.evaluate(`sessionStorage.setItem('molis-connectors-notice', ${JSON.stringify(JSON.stringify({ service: "notion", id: NEW, message: "已连接", replaces }))})`);
    await open();
    await page.evaluate("new Promise(resolve => setTimeout(resolve, 300))");
    assert.equal(await page.evaluate("document.querySelector('[data-connection-replacement]')"), null, replaces);
    assert.equal(await page.evaluate("sessionStorage.getItem('molis-connectors-notice')"), null, "the note is used once whatever it named");
  }
  assert.deepEqual(seen.filter(request => /\/(switch|manage)$/.test(request.url)), [], "nothing is switched or removed");
  assert.deepEqual(exceptions, []);
});
