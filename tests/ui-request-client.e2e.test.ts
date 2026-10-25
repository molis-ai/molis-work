import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { grantHomeProbe, homeProbe, person } from "./fixtures/home-runtime.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// The request helper in a real page (W3-10): the settings page carries it, and what its unit tests show with fake ports holds
// against the real fetch, the real Host and a real network that goes away. Chrome is required.

interface Failure { message: string; code: string; status: number; callId: string | null; body: unknown; name: string }
const FAILURE = `(error => ({ message: error.message, code: error.code, status: error.status, callId: error.callId, body: error.body, name: error.name }))`;

test("the settings page's request helper reads, writes, fails and loses the connection as designed", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty");
  if (!browser) return;
  const { origin, sessionId, command, evaluate, navigate } = browser;
  await command("Network.enable", {}, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/settings/appearance" }, sessionId));
  assert.equal(await evaluate("typeof molisWorkRequest"), "function", "the page carries the helper");
  assert.equal(await evaluate("typeof molisWorkControlHeaders"), "function", "and the headers entrance the page's own programs still call");
  const caught = (expression: string) => evaluate<Failure>(`${expression}.then(() => { throw new Error('the request was expected to fail'); }, ${FAILURE})`);

  // A read: no token, no key; the answer is the parsed JSON.
  assert.deepEqual(await evaluate("molisWorkRequest('/api/settings/projects')"), { projects: [] });

  // A write passes the real guard: same origin, the page's token, a one-time key. The same key again is a replay.
  const created = await evaluate<{ project: { project_id: string } }>("molisWorkRequest('/api/settings/projects', { body: { display_name: '请求助手验证', user_confirmed: true }, key: 'request-helper-e2e-1' })");
  assert.ok(created.project.project_id);
  const replay = await caught("molisWorkRequest('/api/settings/projects', { body: { display_name: '请求助手验证', user_confirmed: true }, key: 'request-helper-e2e-1' })");
  assert.equal(replay.status, 409, "a key that was used is not used again");
  assert.equal(replay.name, "Error");
  assert.equal(replay.callId, null, "a refusal at the door has no call to look up, so no diagnostic ID");
  assert.equal((await (await fetch(origin + "/api/settings/projects")).json() as { projects: unknown[] }).projects.length, 1, "and nothing was created twice");

  // A write the Host answers with an error: the message is the Host's, the status and code come with it, and the body is kept.
  const refused = await caught("molisWorkRequest('/api/settings/projects', { body: {} })");
  assert.ok(refused.status >= 400 && refused.status < 500, `a refused write, got ${refused.status}`);
  assert.ok(refused.message.length > 0);
  assert.equal(typeof refused.code, "string");
  assert.equal(refused.callId, null);

  // An address that is not this page's origin is refused in the page: no request leaves the browser.
  await evaluate("performance.clearResourceTimings()");
  const foreign = await caught("molisWorkRequest('https://example.invalid/api/x', { body: {} })");
  assert.equal(foreign.code, "ui_host.cross_origin");
  assert.equal(foreign.status, 0);
  assert.equal(await evaluate("performance.getEntriesByType('resource').some(entry => entry.name.includes('example.invalid'))"), false);

  // The connection goes away: a read says the service cannot be reached; a write says the outcome is unknown. No browser English.
  await command("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
  const read = await caught("molisWorkRequest('/api/settings/projects')");
  const write = await caught("molisWorkRequest('/api/settings/projects', { body: { display_name: '不会成功', user_confirmed: true } })");
  await command("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
  assert.deepEqual([read.code, read.status, read.message], ["ui_host.unreachable", 0, "连不上 Molis Work 服务，请稍后重试"]);
  assert.deepEqual([write.code, write.status, write.message], ["ui_host.outcome_unknown", 0, "不知道这次操作有没有完成，请刷新后核对"]);
  assert.doesNotMatch(`${read.message}${write.message}`, /Failed to fetch|NetworkError|Load failed/);
  assert.equal((await (await fetch(origin + "/api/settings/projects")).json() as { projects: unknown[] }).projects.length, 1, "the write that got no answer did not happen");
});

test("a failure with a call ID gets a diagnostic ID button, and a real click copies the whole ID", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty");
  if (!browser) return;
  const { origin, sessionId, command, evaluate, click, navigate } = browser;
  await command("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  await navigate(() => command("Page.navigate", { url: origin + "/settings/appearance" }, sessionId));
  const callId = "3f9a2c1d-8b47-4e0a-9c55-0d1f6a7b2e90";
  await evaluate(`(() => {
    const box = document.createElement('p'); box.id = 'helper-error'; document.body.append(box);
    molisWorkRequest.show(box, Object.assign(new Error('没有找到这条记忆'), { code: 'memory.not_found', status: 404, callId: ${JSON.stringify(callId)}, body: null }), '兜底');
  })()`);
  assert.match(await evaluate<string>("document.querySelector('#helper-error').firstChild.textContent"), /^没有找到这条记忆/);
  assert.equal(await evaluate("document.querySelector('#helper-error [data-molis-call-id]').textContent"), "诊断编号 3f9a2c1d");
  await click("#helper-error [data-molis-call-id]");
  assert.equal(await evaluate("navigator.clipboard.readText()"), callId, "what is copied is the whole ID, which the diagnostics page looks up");
  assert.equal(await evaluate("document.querySelector('#helper-error [data-molis-call-id]').textContent"), "已复制");
  // A failure without a call ID (the page's own, or one the Host cannot look up) has no button.
  await evaluate("molisWorkRequest.show(document.querySelector('#helper-error'), new TypeError('Failed to fetch'), '没有完成，请重试')");
  assert.equal(await evaluate("document.querySelector('#helper-error').textContent"), "没有完成，请重试");
  assert.equal(await evaluate("document.querySelector('#helper-error [data-molis-call-id]')"), null);
});


test("PG049-STATUS-04 real settings shows invalid identity and prior history, and a real click withdraws it", { timeout: 90_000 }, async t => {
  const probe = homeProbe("directorystatus");
  probe.permissions.push("directory:read");
  probe.definition.manifest.permissions = [...probe.definition.manifest.permissions,
    { permission: "directory:read", reason: "Read the selected test folder", required: false }];
  let chosen = "", reading = "";
  probe.behavior.ask = async context => JSON.stringify(await context.services!.directory!.read({ grant_id: reading }));
  const browser = await openGoalBrowser(t, "empty", undefined, null, undefined, undefined,
    { chooseDirectory: async () => ({ status: "picked", path: chosen }) }, { home: [probe.definition] });
  if (!browser) return;
  const { localHost, homeDirectory, origin, command, sessionId, evaluate, waitFor, click, navigate } = browser;
  assert.ok(localHost);
  await grantHomeProbe(localHost, probe);
  const broken = join(homeDirectory, "old-folder"), healthy = join(homeDirectory, "same-folder");
  await mkdir(broken); await mkdir(healthy);
  await writeFile(join(broken, "note.md"), "a real directory read before its identity changes");
  const page = origin + "/settings/directories";
  await navigate(() => command("Page.navigate", { url: page }, sessionId));
  const select = () => evaluate<{ grant_id: string }>("molisWorkRequest('/api/host/directory-grants', { body: " + JSON.stringify({ plugin_id: probe.id }) + " })");
  chosen = broken; const old = await select(); reading = old.grant_id;
  assert.equal(JSON.parse(await localHost.homeActionClient().invoke<string>(person(probe.permissions), probe.ask, {})).outcome, "directory");
  chosen = healthy; const current = await select();
  await rename(broken, broken + "-old"); await mkdir(broken);
  await navigate(() => command("Page.navigate", { url: page }, sessionId));
  const oldRow = '[data-grant-id="' + old.grant_id + '"]', currentRow = '[data-grant-id="' + current.grant_id + '"]';
  await waitFor("document.querySelector(" + JSON.stringify(oldRow + " .settings-form-error") + ")?.textContent.includes('已失效')");
  assert.match(await evaluate<string>("document.querySelector(" + JSON.stringify(oldRow) + ").textContent"), /重新选择/);
  assert.match(await evaluate<string>("document.querySelector(" + JSON.stringify(currentRow) + ").textContent"), /目录有效/);
  assert.match(await evaluate<string>("document.querySelector('[data-local-directory-settings]').textContent"), /备份恢复会保留读取历史/);
  assert.match(await evaluate<string>("document.querySelector(" + JSON.stringify(oldRow) + ").textContent"), /读取次数 1/);
  await click(oldRow + " summary");
  await waitFor("document.querySelector(" + JSON.stringify(oldRow + " details") + ")?.open === true");
  assert.match(await evaluate<string>("document.querySelector(" + JSON.stringify(oldRow + " details") + ").textContent"), /directory/);
  const captures = new URL("../.impeccable/qa/review/directory-grant-status/", import.meta.url);
  await mkdir(captures, { recursive: true });
  for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
    const geometry = await evaluate<{ overflow: boolean; statusVisible: boolean }>("(() => { const status = document.querySelector(" + JSON.stringify(oldRow + " .settings-form-error") + "); return { overflow: document.documentElement.scrollWidth > innerWidth, statusVisible: status.getBoundingClientRect().height > 0 }; })()");
    assert.equal(geometry.overflow, false, "settings stays within viewport at " + width + "/" + theme);
    assert.equal(geometry.statusVisible, true);
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    await writeFile(new URL(width + "-" + theme + ".png", captures), Buffer.from(shot.data, "base64"));
  }
  const answers: Promise<unknown>[] = []; let confirmations = 0;
  t.after(browser.on("Page.javascriptDialogOpening", (event, session) => {
    if (event.type === "confirm") { confirmations++; answers.push(command("Page.handleJavaScriptDialog", { accept: true }, session)); }
  }));
  await click(oldRow + " button");
  await waitFor("!document.querySelector(" + JSON.stringify(oldRow) + ") && document.querySelector(" + JSON.stringify(currentRow) + ")");
  await Promise.all(answers); assert.equal(confirmations, 1);
  const after = await evaluate<{ grants: Array<{ grant_id: string; directory_status: string; read_count: number }> }>("molisWorkRequest('/api/host/directory-grants')");
  assert.deepEqual(after.grants.map(grant => [grant.grant_id, grant.directory_status, grant.read_count]), [[current.grant_id, "current", 0]]);
  assert.equal(JSON.parse(await localHost.homeActionClient().invoke<string>(person(probe.permissions), probe.ask, {})).outcome, "denied");
});
