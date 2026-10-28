import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectorPluginSlotActions, createPluginConnectionsPort, pluginSlotScope, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { connectionsProbe, grantConnections } from "./fixtures/connections-runtime.js";
import { person } from "./fixtures/home-runtime.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

const originalSecret = "fixture-before-browser-reconnection", renewedSecret = "fixture-after-browser-reconnection";
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;

async function transport(t: TestContext, directory: string) {
  const hosts = ["acme.atlassian.net", "other.atlassian.net", "api.github.com"];
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=acme.atlassian.net",
    "-addext", `subjectAltName=${hosts.map(host => `DNS:${host}`).join(",")}`, "-keyout", join(directory, "tenant-key.pem"), "-out", join(directory, "tenant-cert.pem")], { stdio: "ignore" });
  const [key, cert] = await Promise.all([readFile(join(directory, "tenant-key.pem")), readFile(join(directory, "tenant-cert.pem"))]);
  const seen: Array<{ host?: string; authorization?: string }> = [];
  const server = createServer({ key, cert }, (request, response) => {
    seen.push({ host: request.headers.host?.replace(/:\d+$/u, ""), authorization: request.headers.authorization });
    response.writeHead(200, { "content-type": "application/json" }); response.end("{}");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
  return { seen, options: { testServer: { port: (server.address() as AddressInfo).port, ca: cert }, allowAddress: () => true,
    lookup: (_host: string, done: (error: Error | null, addresses: Array<{ address: string; family: number }>) => void) => done(null, [{ address: "127.0.0.1", family: 4 }]) } };
}

test("S-57 S-69 RAC-654 RAC-657 a visible old tenant account reconnects through its existing form, keeps its binding and sends only to its confirmed site", { timeout: 120_000 }, async t => {
  const probe = connectionsProbe("tenantbrowser", { service: "jira" });
  const browser = await openGoalBrowser(t, "empty", undefined, null, undefined, undefined, {}, { home: [probe.definition] });
  if (!browser) return;
  const { localHost, homeDirectory: home, origin, command, sessionId, evaluate, waitFor, click, navigate } = browser;
  assert.ok(localHost);
  const { install } = await grantConnections(localHost, probe), network = await transport(t, home);
  const port = createPluginConnectionsPort(home, network.options);
  const saved = withConnectorConnections(home, store => ({ old: store.createToken({ serviceId: "jira", displayName: "旧站点账号", token: `acme.atlassian.net|person@example.com|${originalSecret}` }),
    spare: store.createToken({ serviceId: "jira", displayName: "另一个旧账号", token: `acme.atlassian.net|person@example.com|${originalSecret}` }) }));
  const slot = { plugin_id: probe.id, install_id: install.install_id, slot_id: "github", service_id: "jira" };
  await localHost.homeActionClient().invoke(person(["connectors:management:write"]), connectorPluginSlotActions.bind, { ...slot, connection_id: saved.old.connection_id });
  const bound = () => withConnectorConnections(home, store => store.binding(pluginSlotScope(install.install_id), probe.id, "github"));
  const request = (url: string) => port.request(slot, { url: new URL(url), method: "GET", headers: {}, signal: new AbortController().signal, beforeEffect: async () => {}, current: () => {} });
  await assert.rejects(request("https://acme.atlassian.net/rest/api/3/myself"), error => code("connector.plugin_requests.connection_unavailable")(error) && /服务连接.*重新连接/.test((error as Error).message));
  assert.equal(network.seen.length, 0);
  assert.deepEqual(await port.describe(slot), { bound: true, display_name: "旧站点账号", state: "reauth_required" });
  await navigate(() => command("Page.navigate", { url: origin + "/settings/connectors" }, sessionId));
  await waitFor("document.querySelector('[data-connectors-settings]')?.dataset.connectorsBound === '1' && document.querySelector('[data-plugin-slot-account] + [data-mw-select-trigger]')");
  const select = "[data-plugin-slot-account]", row = "[data-plugin-slot]";
  assert.equal(await evaluate(`document.querySelector('${select}').value`), saved.old.connection_id);
  assert.match(await evaluate<string>(`document.querySelector('${select} + [data-mw-select-trigger]').textContent`), /旧站点账号.*需要重新连接/);
  assert.equal(await evaluate(`document.querySelector('${select} option[value="${saved.spare.connection_id}"]').disabled`), true);
  // Saving the still-bound old account never claims that plugin requests are available.
  await evaluate(`document.querySelector('${select}').dispatchEvent(new Event('change', { bubbles: true }))`);
  await waitFor("/需要重新连接确认站点/.test(document.querySelector('[data-plugin-slot-result]')?.textContent || '')");
  assert.equal(bound()?.connection_id, saved.old.connection_id);
  const shots = reviewEvidenceUrl("tenant-reconnect/"); await mkdir(shots, { recursive: true });
  for (const theme of ["light", "dark"]) for (const width of [1440, 1024, 390]) {
    await evaluate(`localStorage.setItem('molis-work:theme', '${theme}'); dispatchEvent(new StorageEvent('storage', { key: 'molis-work:theme', newValue: '${theme}' }))`);
    await command("Emulation.setDeviceMetricsOverride", { width, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
    await evaluate(`document.querySelector('${row}').scrollIntoView({ block: 'center' }); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${theme} ${width}: no horizontal overflow`);
    await writeFile(new URL(`old-${theme}-${width}.png`, shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await click(`${row} [data-connector-open="jira"]`);
  await waitFor("!document.querySelector('[data-connector-detail=jira]').hidden");
  const form = `[data-connection-replace="${saved.old.connection_id}"]`;
  const fill = async (site: string, secret: string) => {
    const values = [site, "person@example.com", secret];
    for (const [index, value] of values.entries()) {
      const field = `${form} label:nth-of-type(${index + 1}) input`;
      await click(field);
      await evaluate(`document.querySelector(${JSON.stringify(field)}).value = ''`);
      await command("Input.insertText", { text: value }, sessionId);
    }
  };
  await fill("acme.atlassian.net", renewedSecret);
  await click(`${form} button[type=submit]`);
  await waitFor(`document.querySelector('[data-connection-row="${saved.old.connection_id}"]')?.textContent.includes('https://acme.atlassian.net')`);
  assert.equal(bound()?.connection_id, saved.old.connection_id, "the same account remains bound");
  assert.equal(withConnectorConnections(home, store => store.targetOrigin(saved.old.connection_id)), "https://acme.atlassian.net");
  assert.equal((await request("https://acme.atlassian.net/rest/api/3/myself")).authenticated, true);
  assert.deepEqual(network.seen, [{ host: "acme.atlassian.net", authorization: `Basic ${Buffer.from(`person@example.com:${renewedSecret}`).toString("base64")}` }]);
  await assert.rejects(request("https://other.atlassian.net/rest/api/3/myself"), code("connector.plugin_requests.connection_unavailable"));
  const before = withConnectorConnections(home, store => store.require(saved.old.connection_id));
  await fill("other.atlassian.net", "fixture-refused-cross-tenant-secret");
  await click(`${form} button[type=submit]`);
  await waitFor(`document.querySelector('[data-connection-row="${saved.old.connection_id}"] [data-connection-result]')?.dataset.tone === 'error'`);
  assert.deepEqual(withConnectorConnections(home, store => store.require(saved.old.connection_id)), before);
  assert.equal(withConnectorConnections(home, store => store.resolveToken(saved.old.connection_id, "jira")), `acme.atlassian.net|person@example.com|${renewedSecret}`);
  assert.equal(network.seen.length, 1, "cross-tenant request and reauthorization sent nothing");
  await click('[data-connector-detail="jira"] [data-connectors-back]');
  assert.match(await evaluate<string>(`document.querySelector('${select} + [data-mw-select-trigger]').textContent`), /旧站点账号/);
  assert.doesNotMatch(await evaluate<string>(`document.querySelector('${select} + [data-mw-select-trigger]').textContent`), /需要重新连接/);
  assert.deepEqual(await port.describe(slot), { bound: true, display_name: "旧站点账号", state: "connected", origin: "https://acme.atlassian.net" });
  await click(`${select} + [data-mw-select-trigger]`);
  await click('.mw-select-picker__menu:popover-open [data-mw-select-option="0"]');
  await waitFor("/已解除，插件不能再请求这个服务/.test(document.querySelector('[data-plugin-slot-result]')?.textContent || '')");
  assert.equal(bound(), null);
  await assert.rejects(request("https://acme.atlassian.net/rest/api/3/myself"), code("connector.plugin_requests.origin_refused"));
  assert.equal(network.seen.length, 1);
  const anonymous = await port.request({ ...slot, install_id: "unbound-fixed-service", service_id: "github" },
    { url: new URL("https://api.github.com/user"), method: "GET", headers: {}, signal: new AbortController().signal, beforeEffect: async () => {}, current: () => {} });
  assert.equal(anonymous.authenticated, false);
  assert.deepEqual(network.seen.at(-1), { host: "api.github.com", authorization: undefined });
  assert.equal(await evaluate(`document.documentElement.outerHTML.includes(${JSON.stringify(renewedSecret)})`), false);
});
