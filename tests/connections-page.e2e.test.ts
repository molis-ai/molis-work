// The 服务连接 page as the person uses it (spec assistant-service-connections §13.1 plan A, ASC-73～79): rows grouped by use that open
// in place, an account's four rows, 换账号 among the service's accounts, the steps of a login or a key, and 高级's unsaved changes.
// Real production settings HTML, styles and client scripts in Chrome; only the HTTP answers are the test's, so what is checked is what
// the page asks for and what it shows, not the Host's own checks.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { renderMolisWorkSettings, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchStylesheet, type MolisWorkSettingsView } from "./workbench-renderer-fixture.js";

const WORK = "11111111-1111-4111-8111-111111111111", HOME = "22222222-2222-4222-8222-222222222222", KEY = "33333333-3333-4333-8333-333333333333";
const AUTHORIZATION = "44444444-4444-4444-8444-444444444444";

const gitlab = { connector_id: "gitlab", title: "GitLab", availability: "live", auth_kind: "oauth", group_id: "code", summary: "看合并请求、读流水线", capabilities: [],
  method_options: [{ kind: "oauth", support: "in_app", login_ready: true, note: "", links: [],
    oauth: { client_secret_required: true, fields: [{ key: "base_url", label: "GitLab 地址", placeholder: "https://gitlab.com" }] } }] } as const;
const wechat = { connector_id: "wechat", title: "微信", availability: "live", auth_kind: "token", group_id: "chat", summary: "收发消息", capabilities: [],
  method_options: [{ kind: "token", support: "paste", note: "", links: [] }] } as const;
const notion = { connector_id: "notion", title: "Notion", availability: "live", auth_kind: "oauth", group_id: "files", summary: "笔记与文档", capabilities: [],
  method_options: [{ kind: "oauth", support: "in_app", login_ready: true, note: "", links: [] }] } as const;
const account = (connection_id: string, service_id: string, display_name: string, account_label: string | null, auth_method: "oauth" | "token") =>
  ({ connection_id, service_id, display_name, account_label, auth_method, source: "managed", enabled: true, state: "connected", revision: `rev-${connection_id.slice(0, 4)}` } as const);

interface Held { method: string | undefined; url: string; body: string; response: ServerResponse }

async function openPage(t: TestContext) {
  const executable = locateTestChrome();
  if (!executable) { t.skip("Chrome is required for the connections page"); return null; }
  const css = renderMolisWorkSettingsStylesheet();
  const directory = await mkdtemp(join(tmpdir(), "molis-connections-page-"));
  const held: Held[] = [], reads: string[] = [];
  const usages = new Map<string, { usages: unknown[]; issues: string[] }>();
  const rows: Array<ReturnType<typeof account>> = [account(WORK, "gitlab", "工作 GitLab", "yijun-work", "oauth"), account(HOME, "gitlab", "个人 GitLab", "yijun", "oauth")];
  let locale: "zh" | "en" = "zh", receive: ((request: Held) => void) | undefined, harness: ChromeHarness | undefined;
  const view = (): MolisWorkSettingsView => ({
    section: "connectors", runtimes: [], projects: [], connectors: [gitlab, notion, wechat], connector_connections: rows, context_project: null,
    web_service: { provider: "macos-launchagent", state: "absent", supported: true, owned: false, running: false, label: "Web", plist_path: "", command: [], stdout_log: "", stderr_log: "", message: "" },
    diagnostics: { home_directory: "/tmp", installation_state: "ready", version: "0.2.0", release_directory: "/tmp", project_count: 0, launchers: [] },
  });
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
        if (receive) { const deliver = receive; receive = undefined; deliver(input); } else held.push(input);
      });
    } else if (url.startsWith("/settings/connectors") || url.startsWith("/capabilities/connections")) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(runWithLocale(locale, () => renderMolisWorkSettings(view(), "connections-page-control-0123456789")));
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
  // Reduced motion, so a press lands on what a folded part shows once it has opened, as a person's press does after it settles.
  await page.viewport(1440, 960);
  const open = async (service: string) => {
    await page.command("Page.navigate", { url: `${origin}/settings/connectors?connector=${service}` });
    await page.wait(`document.querySelector('[data-connectors-settings]')?.dataset.connectorsBound === '1' && document.querySelector('[data-connector-item="${service}"]')?.dataset.open === 'true'`);
  };
  const next = () => new Promise<Held>((resolve, reject) => {
    const ready = held.shift(); if (ready) { resolve(ready); return; }
    const timer = setTimeout(() => { receive = undefined; reject(new Error("No connections request arrived")); }, 15_000);
    receive = request => { clearTimeout(timer); resolve(request); };
  });
  const answer = (request: Held, body: unknown, status = 200) => { request.response.writeHead(status, { "content-type": "application/json" }); request.response.end(JSON.stringify(body)); };
  return { page, origin, open, next, answer, reads, usages, rows, exceptions, setLocale: (value: "zh" | "en") => { locale = value; } };
}

const text = (page: ChromePage, expression: string) => page.evaluate<string>(`((${expression})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`);
const row = (id: string) => `[data-connection-row="${id}"]`;
const stateOf = (service: string) => `document.querySelector('[data-connector-item="${service}"] > .settings-connection-row > [data-connector-state]')`;

test("ASC-73 ASC-74 ASC-77: services are rows grouped by use; an account's four rows read who uses it once; 换账号 moves those uses and keeps the account", { timeout: 120_000 }, async t => {
  const browser = await openPage(t); if (!browser) return;
  const { page, open, next, answer, reads, usages, exceptions } = browser;
  usages.set(WORK, { usages: [{ usage_id: "feed:1", title: "Feed 来源 · molis", source: { provider_id: "system.connectors" } }, { usage_id: "assistant:1", title: "助理", source: { provider_id: "system.connectors" } }, { usage_id: "slot:1", title: "Coding 仓库", source: { provider_id: "system.connectors" } }], issues: [] });
  await open("gitlab");
  // ASC-73: one column, grouped by use; the service is a row, open in place, and the others stay closed rows.
  assert.deepEqual(await page.evaluate("[...document.querySelectorAll('[data-connector-subgroup]')].map(group => group.dataset.connectorSubgroup)"), ["code", "docs", "chat"]);
  assert.deepEqual(await page.evaluate("[...document.querySelectorAll('[data-connector-item]')].map(item => item.dataset.connectorItem + ':' + item.dataset.open)"), ["gitlab:true", "notion:false", "wechat:false"]);
  assert.equal(await text(page, stateOf("gitlab")), "已连接 2 个账号");
  // ASC-74: four rows in plain words; who uses it is read when the service opens, once per account.
  await page.wait(`document.querySelector('[data-connection-usages="${WORK}"]')?.textContent.includes('等 3 处')`);
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('${row(WORK)} .connection-facts .setting-copy > strong')].map(node => node.textContent)`), ["这个账号", "连得上吗", "能做什么", "谁在用"]);
  assert.equal(await text(page, `document.querySelector('${row(WORK)} .connection-facts .setting-value')`), "yijun-work");
  assert.equal(await text(page, `document.querySelector('[data-connection-usages="${HOME}"]')`), "还没有地方在用");
  assert.deepEqual([...reads].sort(), [HOME, WORK].sort(), "each account's uses are read once when the service opens");

  // ASC-77: 换账号 offers the service's other connected account and one more login; the row waits on the person meanwhile.
  await page.click(`[data-connection-switch="${WORK}"]`);
  const chooser = `document.querySelector('${row(WORK)} [data-connection-switch-panel]')`;
  assert.equal(await page.evaluate(`${chooser}.hidden`), false);
  assert.deepEqual(await page.evaluate(`[...${chooser}.querySelectorAll('input[type=radio]')].map(input => input.value + ':' + input.checked)`), [`${HOME}:true`, "add:false"]);
  assert.equal(await text(page, stateOf("gitlab")), "换账号", "the row says it waits on the person's choice");
  // A radio's mark sits on its label's first line (the 选账号 card's rule, visual-order mark-offset).
  const offsets = await page.evaluate<number[]>(`[...${chooser}.querySelectorAll('.mw-check-row')].map(label => {
    const mark = label.querySelector('input').getBoundingClientRect(), words = label.querySelector('span');
    const range = document.createRange(); range.selectNodeContents(words); const line = range.getClientRects()[0];
    return Math.abs((mark.top + mark.height / 2) - (line.top + line.height / 2));
  })`);
  assert.ok(offsets.length === 2 && offsets.every(offset => offset <= 1.5), `radio marks line up with their first line: ${offsets}`);
  // 先不换 puts the row back as it was.
  await page.click(`${row(WORK)} [data-connection-switch-cancel]`);
  assert.equal(await page.evaluate(`${chooser}.hidden`), true);
  assert.equal(await text(page, stateOf("gitlab")), "已连接 2 个账号");
  await page.click(`[data-connection-switch="${WORK}"]`);
  const before = reads.length;
  await page.click(`${row(WORK)} [data-connection-switch-go]`);
  const request = await next();
  assert.equal(request.url, `/api/settings/connectors/connections/${HOME}/switch`);
  assert.deepEqual(JSON.parse(request.body), { from_connection_id: WORK });
  assert.ok(reads.slice(before).includes(WORK), "the uses are read again right before the switch");
  answer(request, { results: [{ provider_id: "system.connectors", switched: ["feed:1", "assistant:1"], refused: [{ usage_id: "slot:1", code: "connector.plugin_slots.project_required" }] }], failed: [] });
  const result = `document.querySelector('${row(WORK)} [data-connection-result]')`;
  await page.wait(`${result} && !${result}.hidden && ${result}.textContent.includes('换过去 2 处')`);
  assert.match(await text(page, result), /换过去 2 处，1 处没换：.*Coding 仓库：请到它所在的项目里/);
  assert.doesNotMatch(await text(page, result), /原来的账号留着/, "with uses left over, it does not claim all is well");
  assert.equal(await page.evaluate(`Boolean(document.querySelector('${row(WORK)}'))`), true, "the account switched from stays");
  assert.equal(await text(page, stateOf("gitlab")), "已连接 2 个账号");
  // N6: what an action answered is in a box of its own.
  assert.notEqual(await page.evaluate(`getComputedStyle(${result}).borderTopStyle`), "none");
  // M3: sentences put together in Chinese take no space between them (the English test below takes one).
  await page.click(`[data-connection-switch="${HOME}"]`);
  await page.click(`${row(HOME)} [data-connection-switch-go]`);
  const second = await next();
  assert.equal(second.url, `/api/settings/connectors/connections/${WORK}/switch`);
  answer(second, { results: [], failed: [] });
  const outcome = `document.querySelector('${row(HOME)} [data-connection-result]')`;
  await page.wait(`${outcome}?.textContent.includes('不用换')`);
  assert.equal(await page.evaluate(`${outcome}.textContent`), "没有查到用它的地方，不用换。原来的账号留着，照常可用。");
  assert.deepEqual(exceptions, []);
});

test("ASC-78: a login shows its steps and, when cancelled, changes nothing; a key the service refuses is said as such", { timeout: 120_000 }, async t => {
  const browser = await openPage(t); if (!browser) return;
  const { page, open, next, answer, rows, origin, exceptions } = browser;
  await open("gitlab");
  // One more account: the login is behind 再加一个账号, and the row runs while the browser login is under way.
  await page.click("[data-connector-item='gitlab'] [data-connector-add] > summary");
  await page.click("[data-connector-item='gitlab'] [data-connector-add] [data-protocol-start='oauth']");
  const start = await next();
  assert.equal(start.url, "/api/settings/connectors/methods/oauth/start");
  answer(start, { authorization_url: `${origin}/official-login`, authorization_id: AUTHORIZATION });
  const progress = "document.querySelector(\"[data-connector-item='gitlab'] [data-connector-add] [data-connection-progress]\")";
  await page.wait(`${progress}?.dataset.state === 'running'`);
  assert.match(await text(page, progress), /第 1 步，共 3 步：在浏览器登录/);
  assert.equal(await text(page, stateOf("gitlab")), "连接中");
  const poll = await next();
  assert.equal(poll.url, `/api/settings/connectors/authorizations/${AUTHORIZATION}`);
  answer(poll, { status: "cancelled" });
  await page.wait(`${progress}?.dataset.state === 'cancelled'`);
  assert.match(await text(page, "document.querySelector(\"[data-connector-item='gitlab'] [data-connector-add] [data-protocol-result]\")"), /没有连上：登录页关了，或在服务那边点了取消。这里什么都没改/);
  assert.equal(await text(page, stateOf("gitlab")), "已连接 2 个账号", "the row is put back as it was");

  // A key: step 2 (验证密钥) while the Host saves and checks it, then what the check said.
  await page.click("[data-connector-item='wechat'] [data-connection-toggle]");
  await page.wait("document.querySelector('[data-connector-item=wechat]').dataset.open === 'true' && !document.querySelector('[data-connector-item=wechat]').getAnimations({ subtree: true }).some(motion => motion.playState === 'running' && motion.effect?.getComputedTiming().iterations !== Infinity)");
  await page.fill("[data-connector-auth='wechat'] input[type=text]", "ww-fixture-corp");
  await page.fill("[data-connector-auth='wechat'] input[type=password]", "fixture-only-wechat-secret");
  await page.click("[data-connector-auth='wechat'] button[type=submit]");
  const save = await next();
  assert.equal(save.url, "/api/settings/connectors/connections");
  assert.equal((JSON.parse(save.body) as { token?: string }).token, "ww-fixture-corp:fixture-only-wechat-secret");
  const keyProgress = "document.querySelector(\"[data-connector-auth='wechat'] [data-connection-progress]\")";
  assert.match(await text(page, keyProgress), /第 2 步，共 3 步：验证密钥/);
  rows.push(account(KEY, "wechat", "微信", null, "token"));
  answer(save, { connection: rows.at(-1), verification: { available: false, reason: "refused" } }, 201);
  const feedback = "document.querySelector('[data-connector-detail=wechat] [data-connector-feedback]')";
  await page.wait(`${feedback}?.textContent.includes('没通过检查')`);
  assert.match(await text(page, feedback), /密钥存好了，但没通过检查：服务拒绝了它，或暂时连不上/);
  assert.equal(await page.evaluate(`Boolean(document.querySelector('${row(KEY)}'))`), true);
  assert.deepEqual(exceptions, []);
});

test("ASC-76: 高级 is folded at the foot of the service; its unsaved settings stay as a draft in this window, never a secret", { timeout: 120_000 }, async t => {
  const browser = await openPage(t); if (!browser) return;
  const { page, open, exceptions } = browser;
  await open("gitlab");
  const advanced = "document.querySelector('[data-connector-detail=gitlab] [data-connector-advanced]')";
  assert.equal(await page.evaluate(`${advanced}.open`), false, "folded until asked for");
  assert.equal(await page.evaluate(`${advanced} === document.querySelector('[data-connector-detail=gitlab]').lastElementChild`), true, "at the foot of the service");
  assert.equal(await page.evaluate(`Boolean(${advanced}.querySelector('.settings-connection-manage [data-connection-manage=remove]'))`), true, "an account's own settings are there");
  await page.click("[data-connector-detail=gitlab] [data-connector-advanced] > summary");
  await page.click("[data-connector-detail=gitlab] [data-connector-advanced] [data-method-choice] > summary");
  await page.fill("[data-connector-detail=gitlab] [data-connector-advanced] [data-protocol-field='setting:base_url']", "https://gitlab.example.test");
  const secret = "[data-connector-detail=gitlab] [data-connector-advanced] [data-protocol-field='client_secret']";
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(secret)}).type`), "password", "the own app asks for its secret");
  await page.fill(secret, "fixture-only-app-secret");
  await open("gitlab");
  const draft = "document.querySelector('[data-connector-detail=gitlab] [data-connector-draft]')";
  await page.wait(draft);
  assert.match(await text(page, draft), /「高级」里有上次没保存的改动.*密钥不会留下，要重新填/);
  const stored = await page.evaluate<string>("sessionStorage.getItem('molis-connectors-draft:gitlab') || ''");
  assert.match(stored, /gitlab\.example\.test/);
  assert.doesNotMatch(stored, /fixture-only-app-secret/, "a secret is never kept");
  await page.click("[data-connector-detail=gitlab] [data-connector-draft] .mw-btn");
  assert.equal(await page.evaluate(`${advanced}.open`), true);
  assert.equal(await page.evaluate("document.querySelector(\"[data-connector-detail=gitlab] [data-connector-advanced] [data-protocol-field='setting:base_url']\").value"), "https://gitlab.example.test");
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(secret)}).value`), "");
  assert.equal(await page.evaluate(draft), null, "the note goes once taken up");
  assert.deepEqual(exceptions, []);
});

test("ASC-73 ASC-79: the page in both languages, themes and three widths: rows on one line, results boxed, nothing wider than the window", { timeout: 180_000 }, async t => {
  const browser = await openPage(t); if (!browser) return;
  const { page, open, next, answer, setLocale, exceptions } = browser;
  const shots = reviewEvidenceUrl("connections-page/"); await mkdir(shots, { recursive: true });
  for (const locale of ["zh", "en"] as const) {
    setLocale(locale);
    for (const theme of ["light", "dark"]) for (const width of [1440, 1024, 390]) {
      await page.viewport(width, 960);
      await open("gitlab");
      await page.evaluate(`localStorage.setItem('molis-work:theme', '${theme}')`);
      await open("gitlab");
      assert.equal(await page.evaluate("document.documentElement.dataset.theme"), theme);
      await page.click(`[data-connection-switch="${WORK}"]`);
      assert.equal(await page.evaluate("document.documentElement.lang.slice(0, 2)"), locale);
      assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${locale}/${theme}/${width}: no horizontal overflow`);
      // Rows do not wrap: a service row's name, caption and state, and an account's labels and values, each keep one line.
      const wrapped = await page.evaluate<string[]>(`[...document.querySelectorAll('.settings-connection-item > .settings-connection-row .settings-connection-row__identity > :is(strong, small), .settings-connection-item > .settings-connection-row > [data-connector-state], .connection-facts .setting-copy > strong, .connection-facts .setting-value > *')]
        .filter(node => node.getClientRects().length && node.getBoundingClientRect().height > parseFloat(getComputedStyle(node).lineHeight) * 1.5 + 4).map(node => node.textContent.trim())`);
      assert.deepEqual(wrapped, [], `${locale}/${theme}/${width}: rows keep one line`);
      // Buttons have edges.
      assert.deepEqual(await page.evaluate("[...document.querySelectorAll('[data-connector-detail=gitlab] .settings-connection-account .mw-btn')].filter(button => button.getClientRects().length && getComputedStyle(button).borderTopStyle === 'none').map(button => button.textContent)"), []);
      await page.evaluate("document.querySelector('[data-connector-item=gitlab]').scrollIntoView({ block: 'start', behavior: 'instant' })");
      await page.screenshot(fileURLToPath(new URL(`gitlab-${locale}-${theme}-${width}.png`, shots)));
    }
  }
  // English titles at 390 (#1862) and the switch words read as English; its sentences are joined with one space (M3).
  assert.equal(await text(page, `document.querySelector('${row(WORK)} [data-connection-switch-panel] legend')`), "Which account should replace yijun-work where it is used");
  await page.click(`${row(WORK)} [data-connection-switch-go]`);
  answer(await next(), { results: [], failed: [] });
  const outcome = `document.querySelector('${row(WORK)} [data-connection-result]')`;
  await page.wait(`${outcome}?.textContent.includes('nothing to switch')`);
  assert.equal(await page.evaluate(`${outcome}.textContent`), "Nothing was found using it, so there is nothing to switch. The original account stays and keeps working.");
  assert.deepEqual(exceptions, []);
});

// The step progress's styles reach a page once, with the model settings' sheet that both sheets carry; the connections page's own sheet
// takes the parts after them (§13.6), so a sheet that carries both does not draw them twice.
test("ASC-78: the step progress's styles are in each settings sheet once", () => {
  const once = (sheet: string) => sheet.split(".connection-progress{display:flex").length - 1;
  assert.equal(once(renderMolisWorkSettingsStylesheet()), 1);
  assert.equal(once(renderMolisWorkWorkbenchStylesheet()), 1);
});
