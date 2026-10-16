import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { connectorSetupAction, connectorManagementActions, CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantCard } from "@molis-ai/molis-work-contracts/services/assistant";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { openWork } from "./fixtures/assistant-send-journey.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// A local fixture value is entered only in the protected form. No real provider, model or account is contacted.
test("ASC-08 ASC-36 ASC-37: open, leave, reopen, fill and cancel a protected setup request in the existing settings surface", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty", undefined, null); if (!browser) return;
  const { localHost, origin, homeDirectory, command, sessionId, evaluate, waitFor, click, navigate } = browser;
  assert.ok(localHost);
  const caller: ActionCallContext = { actor_id: "assistant:protected-form", runtime_session_id: "protected-form", audience: "agent", project_id: null, permissions: [CONNECTOR_MANAGEMENT_WRITE, CONNECTOR_MANAGEMENT_READ] };
  const prepare = (name: string, service = "model-api") => localHost.homeActionClient().invoke(caller, connectorSetupAction, { service_id: service, method: "token", display_name: name, expected_revision: null }) as Promise<{ authorization_id: string; url: string }>;
  const read = (id: string) => localHost.homeActionClient().invoke(caller, connectorManagementActions.authorization, { authorization_id: id }) as Promise<{ status: string; connection_id: string }>;
  const open = async (url: string) => {
    await navigate(() => command("Page.navigate", { url: origin + url }, sessionId));
    await waitFor("document.querySelector('[data-setup-id]')?.dataset.connectorsBound === '1'", 15_000);
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  // The conversation is used after the person leaves first-run onboarding, still with no project or model.
  assert.equal(await evaluate(`fetch('/api/onboarding/dismiss', { method: 'POST', headers: molisWorkControlHeaders(),
    body: JSON.stringify({ kind: 'first_run', user_confirmed: true }) }).then(r => r.status)`), 200);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  const placed = await evaluate<{ work_id: string; card: AssistantCard }>(`fetch('/api/assistant/cards', {
    method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({ message_id: crypto.randomUUID(), source: { surface: 'fixture', title: '服务接入' },
      card: { title: '准备模型连接', summary: '打开专用表单完成本人操作', reference: { capability_id: 'connectors.setup.prepare', version: 1, provider_id: 'system.connectors' },
        input: { service_id: 'model-api', method: 'token', display_name: '本次模型连接', expected_revision: null } } })
  }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(JSON.stringify(body)); return body; })`);
  await openWork(browser, placed.work_id);
  const selector = `[data-assistant-thread] [data-card="${placed.card.card_id}"]`;
  await click(selector + " [data-ix-action=run]");
  await waitFor(`document.querySelector(${JSON.stringify(selector)})?.dataset.status === 'done'`);
  const url = await evaluate<string>(`document.querySelector(${JSON.stringify(selector + " a[href]")}).getAttribute('href')`);
  const request = { url, authorization_id: new URL(url, origin).searchParams.get("setup")! };
  assert.ok(request.authorization_id);
  await browser.reloadPage();
  await openWork(browser, placed.work_id);
  await waitFor(`document.querySelector(${JSON.stringify(selector + " a[href]")})`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector + " a[href]")}).getAttribute('href')`), url, "reopened conversation keeps the same request");
  await click(selector + " a[href]");
  await waitFor("document.querySelector('[data-setup-id]')?.dataset.connectorsBound === '1'", 15_000);
  assert.equal(await evaluate("document.querySelector('[data-connector-token]').type"), "password");
  assert.equal(await evaluate("document.querySelectorAll('[data-connector-auth]').length"), 1);
  // Leaving the form does not cancel the authorization or persist any credential.
  await navigate(() => command("Page.navigate", { url: "about:blank" }, sessionId));
  assert.equal((await read(request.authorization_id)).status, "prepared");
  assert.deepEqual(withConnectorConnections(homeDirectory, store => store.list()), []);
  await open(request.url);
  const shots = reviewEvidenceUrl("assistant-service-connections/"); await mkdir(shots, { recursive: true });
  for (const width of [1440, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `form fits ${width}px`);
    // Capture before filling; even a password field's value is excluded from review evidence.
    await writeFile(new URL(`protected-form-${width}.png`, shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  }
  const fixtureValue = "fixture-protected-form-value";
  await click("[data-connector-token]");
  await command("Input.insertText", { text: fixtureValue }, sessionId);
  await click("[data-connector-auth] button[type=submit]");
  await waitFor("!document.querySelector('[data-connector-auth]') && /连接已保存/.test(document.querySelector('[data-connector-feedback]')?.textContent || '')", 15_000);
  const completed = await read(request.authorization_id);
  assert.equal(completed.status, "connected");
  assert.equal(withConnectorConnections(homeDirectory, store => store.resolveToken(completed.connection_id, "model-api")), fixtureValue);
  assert.equal(await evaluate(`document.documentElement.outerHTML.includes(${JSON.stringify(fixtureValue)})`), false);
  assert.equal(JSON.stringify(completed).includes(fixtureValue), false);
  const conversation = await (await fetch(origin + "/api/assistant/works/" + placed.work_id)).text();
  assert.equal(conversation.includes(fixtureValue), false, "the actual persisted conversation never receives the protected input");
  await open(request.url);
  assert.equal(await evaluate("Boolean(document.querySelector('[data-connector-auth]'))"), false, "completed request cannot be submitted twice");
  const cancelled = await prepare("不再接入"); await open(cancelled.url);
  await click("[data-setup-cancel]");
  await waitFor("!document.querySelector('[data-connector-auth]') && /这次接入没有完成/.test(document.querySelector('[data-connector-feedback]')?.textContent || '')", 15_000);
  assert.equal((await read(cancelled.authorization_id)).status, "cancelled");
  assert.equal(withConnectorConnections(homeDirectory, store => store.list()).length, 1);
  const failedCheck = await prepare("检查未通过的账号", "github");
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => String(input).startsWith("https://api.github.com/")
    ? Response.json({ message: "fixture-provider-rejection" }, { status: 401 }) : realFetch(input, init));
  await open(failedCheck.url);
  await click("[data-connector-token]"); await command("Input.insertText", { text: fixtureValue }, sessionId);
  await click("[data-connector-auth] button[type=submit]");
  await waitFor("!document.querySelector('[data-connector-auth]') && /凭据已保存，但检查未通过/.test(document.querySelector('[data-connector-feedback]')?.textContent || '')");
  assert.equal((await read(failedCheck.authorization_id)).status, "connected", "saving succeeded independently of identity verification");
  assert.equal(await evaluate(`document.documentElement.outerHTML.includes(${JSON.stringify(fixtureValue)})`), false);
  await click("[data-setup-id] a[href='/capabilities/connections']");
  await waitFor("document.querySelector('[data-connectors-settings]:not([data-setup-id])')");
});
