import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { connectorLocalActions, connectorManagementActions, connectorCliActions, connectorRecordActions, CONNECTOR_RECORDS_READ } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { createCliPackageFixture } from "./fixtures/connector-cli-package.js";
import { MCP_FIXTURE } from "./fixtures/mcp-notes-server.js";

test("ASC-08 ASC-14 ASC-22: local setup shows the fixed plan, protects input and saves a callable tool at desktop and mobile sizes", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty", undefined, null); if (!browser) return;
  const { localHost, homeDirectory, origin, command, sessionId, evaluate, navigate, waitFor, click } = browser; assert.ok(localHost);
  const caller: ActionCallContext = { actor_id: "local-form-person", audience: "agent", project_id: null,
    permissions: ["connectors:management:read", "connectors:management:write", "mcp:external"] };
  await writeFile(join(homeDirectory, "local-form.mjs"), "if(process.env.SERVICE_KEY!=='fixture-local-page-secret')process.exit(1);\n" + MCP_FIXTURE);
  const input = { display_name: "本地笔记工具", expected_revision: null, source: { kind: "executable", executable: realpathSync(process.execPath) },
    args: ["local-form.mjs"], cwd: realpathSync(homeDirectory), environment_names: ["SERVICE_KEY"] };
  const prepared = await localHost.homeActionClient().invoke(caller, connectorLocalActions.prepare, input) as { url: string; authorization_id: string };
  const open = async () => {
    await navigate(() => command("Page.navigate", { url: origin + prepared.url }, sessionId));
    await waitFor("document.querySelector('[data-connector-local]') && document.querySelector('[data-setup-id]')?.dataset.connectorsBound === '1'");
  };
  await open();
  assert.equal(await evaluate("document.querySelector('[data-local-secret]').type"), "password");
  assert.match(await evaluate<string>("document.querySelector('[data-connector-local]').textContent"), /local-form.mjs/);
  assert.match(await evaluate<string>("document.querySelector('.settings-heading').textContent"), /本地 MCP/);
  await navigate(() => command("Page.navigate", { url: "about:blank" }, sessionId)); await open();
  const shots = reviewEvidenceUrl("assistant-service-connections/"); await mkdir(shots, { recursive: true });
  for (const width of [1440, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `local setup fits ${width}px`);
    await writeFile(new URL(`local-form-${width}.png`, shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  }
  await click("[data-local-secret]"); await command("Input.insertText", { text: "fixture-local-page-secret" }, sessionId);
  await click("[data-connector-local] button[type=submit]");
  await waitFor("!document.querySelector('[data-connector-local]') && /连接已保存/.test(document.querySelector('[data-connector-feedback]')?.textContent || '')", 15_000);
  assert.equal(await evaluate("document.documentElement.outerHTML.includes('fixture-local-page-secret')"), false);
  const result = await localHost.homeActionClient().invoke(caller, connectorManagementActions.authorization, { authorization_id: prepared.authorization_id }) as { status: string; connection_id: string };
  assert.equal(result.status, "connected");
  const output = await localHost.homeActionClient().invoke(caller, { capability_id: `mcp.connector.${result.connection_id}.record_review_note`, version: 1,
    provider_id: `system.connectors#mcp:${result.connection_id}` }, { note: "from the actual protected form" });
  assert.match(JSON.stringify(output), /from the actual protected form/);
});

test("ASC-07 ASC-14 ASC-19 ASC-22: closing and reopening the CLI page resumes installation and the same real PTY login", { timeout: 120_000 }, async t => {
  let release = () => {}; const download = new Promise<void>(resolve => { release = resolve; }); t.after(release);
  const browser = await openGoalBrowser(t, "empty", undefined, null); if (!browser) return;
  const { localHost, homeDirectory, origin, command, sessionId, evaluate, navigate, waitFor, click } = browser; assert.ok(localHost);
  const source = await createCliPackageFixture(t, homeDirectory, () => download), actions = localHost.homeActionClient();
  const caller: ActionCallContext = { actor_id: "cli-form-person", audience: "agent", project_id: null,
    permissions: ["connectors:management:read", "connectors:management:write", CONNECTOR_RECORDS_READ] };
  const prepared = await actions.invoke(caller, connectorCliActions.prepare, source.input) as { url: string; authorization_id: string };
  const state = () => actions.invoke(caller, connectorManagementActions.authorization, { authorization_id: prepared.authorization_id }) as Promise<{ status: string; connection_id: string }>;
  const open = async () => {
    await navigate(() => command("Page.navigate", { url: origin + prepared.url }, sessionId));
    await waitFor("document.querySelector('[data-setup-id]')?.dataset.connectorsBound === '1'");
  };
  const leave = () => navigate(() => command("Page.navigate", { url: "about:blank" }, sessionId));
  const shots = reviewEvidenceUrl("assistant-service-connections/"); await mkdir(shots, { recursive: true });
  await open();
  assert.match(await evaluate<string>("document.querySelector('[data-connector-local]').textContent"), /vercel.*1.2.3/);
  for (const width of [1440, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `CLI plan fits ${width}px`);
    await writeFile(new URL(`cli-plan-${width}.png`, shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  }
  await click("[data-connector-local] button[type=submit]");
  const deadline = Date.now() + 15_000;
  while (!source.downloads()) { assert.ok(Date.now() < deadline, "install must start its actual download"); await new Promise(resolve => setTimeout(resolve, 20)); }
  await leave(); await open(); await waitFor("document.querySelector('[data-pending-setup]')");
  release(); await waitFor("document.querySelector('[data-cli-login]') && !document.querySelector('[data-pending-setup]')", 30_000);
  assert.equal((await state()).status, "prepared");
  await click("[data-cli-login]"); await waitFor("/Enter fixture login:/.test(document.querySelector('[data-cli-output]')?.textContent || '')");
  const job = await evaluate<string>("document.querySelector('[data-cli-job]').dataset.cliJob");
  await leave(); await open();
  await waitFor("/Enter fixture login:/.test(document.querySelector('[data-cli-output]')?.textContent || '')");
  assert.equal(await evaluate("document.querySelector('[data-cli-job]').dataset.cliJob"), job);
  assert.equal(await evaluate("document.querySelector('[data-cli-login]').disabled"), true);
  for (const width of [1440, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
    await evaluate("document.querySelector('[data-cli-job]').scrollIntoView({ block: 'center' })");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `CLI login fits ${width}px`);
    await writeFile(new URL(`cli-login-${width}.png`, shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  }
  await click('[data-protocol-field="cli_input"]'); await command("Input.insertText", { text: "private-browser-cli-input" }, sessionId);
  await click("[data-cli-input]"); await waitFor(`!document.querySelector('[data-protocol-field="cli_input"]')?.value`);
  await leave();
  const completed = Date.now() + 10_000;
  while ((await state()).status !== "connected") { assert.ok(Date.now() < completed, "Host completes without the page"); await new Promise(resolve => setTimeout(resolve, 20)); }
  await open(); assert.match(await evaluate<string>("document.querySelector('[data-connector-feedback]').textContent"), /连接已保存/);
  assert.equal(await evaluate("document.documentElement.outerHTML.includes('private-browser-cli-input')"), false);
  const result = await actions.invoke(caller, connectorRecordActions.read, { connection_id: (await state()).connection_id }); assert.match(JSON.stringify(result), /managed-client-project/);
});
