import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { homeIntegrationRegistry, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { newPublisher } from "./fixtures/sandbox-package.js";

// RAC-2424 (T-119 follow-up): a connection whose package was removed has no card and no detail panel, so its own row carries the controls.
// The person replaces the token there, sees the new token after reopening the page, then removes the connection from the same row.
const PLUGIN_ID = "io.molis.work.example.orphanprobe";
const SERVICE = "example-orphan";
/** A throwaway credential made per call, so no credential-shaped literal sits in the file. */
const probeToken = (n: number) => `fixture-orphan-probe-token-${String(n).padStart(4, "0")}`;

/** How long a diagnostic request may take: a Host that took the connection but never answers must not hide the navigation error. */
const DIAGNOSTIC_DEADLINE_MS = 2_000;
/** The answer's status, or "unreachable" within a short fixed deadline; the diagnostic never hangs past it. */
async function diagnosticStatus(url: string): Promise<number | "unreachable"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIAGNOSTIC_DEADLINE_MS);
  try {
    return (await fetch(url, { signal: controller.signal })).status;
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}

/** What a signed integration package declares; `attach` reads the declarations only, nothing runs. */
function packageManifest(): PluginManifest {
  return {
    schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version: "1.0.0", name: "Orphan probe", kind: "integration",
    publisher: { publisher_id: "example", signature: newPublisher().identity },
    entrypoints: [{ deployment: "local", entrypoint: "./plugin.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "保存这个插件自己的数据" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, runtime: { scope: "home" },
    connection_services: [{ service_id: SERVICE, title: "Example orphan", group_id: "work", summary: "Orphan connection fixture", auth_kind: "token",
      auth: { methods: [{ kind: "token", label: "Example token" }] }, capabilities: [{ label: "内容拉取", fulfillment: "live" }], origins: ["https://api.example-orphan.com"] }],
    integrations: [{ integration_id: SERVICE, kind: "source", service_id: SERVICE }],
  };
}

// The diagnostic request may not hang: a Host that took the connection and never answers would otherwise hide the original error.
test("RAC-2424 a diagnostic request that never answers reports within its deadline, not as a test timeout", { timeout: 20_000 }, async () => {
  const server = createServer(() => { /* accept the request, never answer it */ });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const started = Date.now();
  try {
    assert.equal(await diagnosticStatus(`http://127.0.0.1:${port}/capabilities/connections`), "unreachable");
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  assert.ok(Date.now() - started < DIAGNOSTIC_DEADLINE_MS + 3_000, `reported in ${Date.now() - started} ms`);
});

test("RAC-2424 an orphan connection row replaces its token and removes itself from the page, both persisting across a reopen", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty", undefined, null); if (!browser) return;
  const { origin, homeDirectory, web, command, sessionId, evaluate, waitFor, click, navigate, on } = browser;
  // A first navigation that fails must say what happened (URL, answer, console), not sit until its timeout reads as UNKNOWN.
  const pageErrors: string[] = [];
  t.after(on("Runtime.exceptionThrown", params => { pageErrors.push("exception: " + JSON.stringify(params).slice(0, 300)); }));
  t.after(on("Runtime.consoleAPICalled", (params: { type?: string; args?: unknown }) => {
    if (params.type === "error") pageErrors.push("console: " + JSON.stringify(params.args ?? params).slice(0, 300));
  }));
  const connectionsUrl = origin + "/capabilities/connections";
  const openConnections = async () => {
    try {
      await navigate(() => command("Page.navigate", { url: connectionsUrl }, sessionId));
      await waitFor("document.querySelector('[data-connectors-settings]')?.dataset.connectorsBound === '1'", 20_000);
    } catch (error) {
      const status = await diagnosticStatus(connectionsUrl);
      const page = await evaluate("JSON.stringify({ href: location.href, ready: document.readyState, title: document.title, body: (document.body?.innerText || '').slice(0, 200) })").catch(() => "unavailable");
      throw new Error("Opening " + connectionsUrl + " failed: status " + status + "; page " + page + "; console " + (pageErrors.slice(-4).join(" | ") || "none"), { cause: error });
    }
  };
  const registry = await homeIntegrationRegistry(homeDirectory);
  assert.equal(await registry.attach(packageManifest(), () => null, () => true), true);
  const made = await web.post<{ connection: { connection_id: string } }>("/api/settings/connectors/connections",
    { service_id: SERVICE, display_name: "Orphan probe account", token: probeToken(1) });
  const id = made.connection.connection_id;
  await registry.detach(PLUGIN_ID);
  const row = `[data-connection-row="${id}"]`;
  const rowSelector = JSON.stringify(row);
  const revision = () => evaluate<string | undefined>(`document.querySelector(${rowSelector})?.dataset.connectionRevision`);
  const listedToken = () => withConnectorConnections(homeDirectory, store => store.resolveToken(id, SERVICE));

  await openConnections();
  assert.equal(await evaluate(`Boolean(document.querySelector(${rowSelector}))`), true, "the removed package's connection is still listed");
  assert.equal(await evaluate(`Boolean(document.querySelector('[data-connector-open="${SERVICE}"]'))`), false, "the removed package has no card");
  assert.equal(await evaluate(`Boolean(document.querySelector('[data-connector-detail="${SERVICE}"]'))`), false, "and no panel to open");
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(row + " [data-connection-replace]")}))`), true, "the row offers 更换令牌 itself");
  assert.equal(await evaluate(`[...document.querySelectorAll(${JSON.stringify(row + " details.settings-connection-inline > summary")})].map(node => node.textContent).includes("更换令牌")`), true, "its first inline form is 更换令牌");
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(row + " [data-connection-manage='remove']")}))`), true, "and 移除");
  const before = await revision();
  assert.ok(before, "the orphan row names the connection revision it renders");

  await click(row + " details.settings-connection-inline > summary");
  await click(row + " [data-connector-token]");
  await command("Input.insertText", { text: probeToken(2) }, sessionId);
  await click(row + " [data-connection-replace] button[type=submit]");
  await waitFor(`document.querySelector(${rowSelector})?.dataset.connectionRevision !== ${JSON.stringify(before)}`, 20_000);
  const after = await revision();
  assert.ok(after && after !== before, "the row reloads with the replaced token's revision");
  assert.equal(listedToken(), probeToken(2), "the new token is the stored one");
  assert.equal((await web.get<{ revision: string }>(`/api/settings/connectors/connections/${id}`)).revision, after,
    "the page's revision is the one the Home stores");

  await openConnections();
  assert.equal(await revision(), after, "reopening the page keeps the replaced token's revision");
  assert.equal(listedToken(), probeToken(2));
  assert.equal(await evaluate(`Boolean(document.querySelector(${rowSelector}))`), true, "the orphan row survives the reopen");

  await click(row + " [data-connection-manage='remove']");
  await waitFor(`!document.querySelector(${rowSelector})`, 20_000);
  assert.equal(withConnectorConnections(homeDirectory, store => store.list()).some(connection => connection.connection_id === id), false,
    "the row's 移除 deletes the connection");
  await openConnections();
  assert.equal(await evaluate(`Boolean(document.querySelector(${rowSelector}))`), false, "reopening the page still lists nothing");
  assert.deepEqual(withConnectorConnections(homeDirectory, store => store.list()), [], "and the Home stores no connection");
  assert.deepEqual(pageErrors, [], "the connections page and its client script complete without uncaught errors");
});
