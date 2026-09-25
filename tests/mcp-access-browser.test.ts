import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { alchemistActions as a } from "@molis-ai/molis-work-plugin-alchemist";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { readMcpToolPreference } from "../apps/local-host/src/mcp-settings-store.js";

const artifacts = ".impeccable/review/action-service/mcp-access";
const row = (id: string) => `[data-grant-row*=${JSON.stringify(id)}]`;

test("MCP access UI saves real grants, drives standard MCP calls, handles lost responses and keeps lifecycle failures visible", { timeout: 100_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
  const { evaluate, command, sessionId, waitFor, click, navigate, reloadPage, homeDirectory, projectId, localHost, store } = b;
  assert.ok(projectId && localHost);
  const ref = { project_id: projectId, board_id: store.goalsQuery.listBoardIds()[0]!, storage_key: b.databasePath };
  const clients: Client[] = []; t.after(async () => { await Promise.all(clients.map(client => client.close())); });
  const connect = async (identity: string) => {
    const client = new Client({ name: "browser-grant-test", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/production-action-mcp-server.ts", import.meta.url)), homeDirectory, projectId, identity, b.databasePath, ref.board_id], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  const visit = async (query = "") => navigate(() => command("Page.navigate", { url: `${b.origin}/capabilities/access${query}` }, sessionId));
  const search = async (q: string, filter = "") => {
    await evaluate(`document.querySelector('[data-mcp-access-search] [name=q]').value=${JSON.stringify(q)};document.querySelector('[data-mcp-access-search] [name=filter]').value=${JSON.stringify(filter)}`);
    await click('[data-mcp-access-search] button[type=submit]');
    await waitFor(`document.querySelector('[data-mcp-access]').getAttribute('aria-busy') === 'false'`);
  };
  const status = (id: string) => evaluate(`document.querySelector(${JSON.stringify(row(id))})?.querySelector('[data-status]')?.dataset.status`);
  const grant = async (id: string, enabled: boolean) => {
    await click(`${row(id)} [data-grant-enabled="${enabled}"]`);
    await waitFor(`document.querySelector('[data-mcp-access]').getAttribute('aria-busy') === 'false'`);
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await visit();
  assert.match(await evaluate<string>("document.querySelector('[data-mcp-access]').innerText"), /选择一个客户端/);
  await click('.mcp-access-scope label:has([data-mcp-client]) [data-mw-select-trigger]');
  await click('.mcp-access-scope [data-value="custom"]');
  await click('[name=client_custom]');
  await command("Input.insertText", { text: "runtime:ui-alpha" }, sessionId);
  await click('.mcp-access-scope label:has([name=project]) [data-mw-select-trigger]');
  await click(`.mcp-access-scope [data-value="${projectId}"]`);
  await navigate(() => click('.mcp-access-scope button[type=submit]'));
  assert.equal(await evaluate("document.querySelector('[data-mcp-access]').dataset.clientId"), "runtime:ui-alpha");
  await search(a.directionCreate.capability_id);
  assert.equal(await status(a.directionCreate.capability_id), "ungranted");
  // Changing the visible scope must never leave the old scope actionable.
  const savedBeforeScopeChange = await readMcpToolPreference(homeDirectory);
  for (const select of ['[data-mcp-client]', '[name=project]']) {
    await evaluate(`globalThis.scopeInput=document.querySelector(${JSON.stringify(select)});globalThis.previousScope=scopeInput.value;scopeInput.value=${select === '[data-mcp-client]' ? "'runtime:codex'" : "''"};scopeInput.dispatchEvent(new Event('change'))`);
    assert.equal(await evaluate("document.querySelector('[data-mcp-access-result]').hidden"), true);
    assert.equal(await evaluate("document.querySelector('[data-mcp-scope-pending]').hidden"), false);
    // Even a synthetic click against the stale hidden DOM cannot mutate its former scope.
    await evaluate(`document.querySelector(${JSON.stringify(row(a.directionCreate.capability_id))}).querySelector('[data-grant-enabled=true]').click()`);
    assert.deepEqual(await readMcpToolPreference(homeDirectory), savedBeforeScopeChange);
    await evaluate("scopeInput.value=previousScope;scopeInput.dispatchEvent(new Event('change'))");
    assert.equal(await evaluate("document.querySelector('[data-mcp-access-result]').hidden"), false);
  }
  const alpha = await connect("ui-alpha"), beta = await connect("ui-beta");
  const createName = hostActionToolName(a.directionCreate);
  assert.equal((await alpha.listTools()).tools.some(tool => tool.name === createName), false);
  await grant(a.directionCreate.capability_id, true);
  assert.equal(await status(a.directionCreate.capability_id), "enabled");
  assert.equal((await readMcpToolPreference(homeDirectory)).action_grants?.find(item => item.capability_id === a.directionCreate.capability_id)?.client_id, "runtime:ui-alpha");
  assert.equal((await alpha.listTools()).tools.some(tool => tool.name === createName), true);
  assert.equal((await beta.listTools()).tools.some(tool => tool.name === createName), false);
  const created = await alpha.callTool({ name: createName, arguments: { description: "通过实际授权界面写入的探索方向" } });
  assert.equal(created.isError, false, JSON.stringify(created));
  const workspace = await localHost.actionClient(ref).invoke({ actor_id: "browser-test", project_id: projectId, audience: "user", permissions: ["alchemist:read"] }, a.bootstrap, {});
  assert.ok(JSON.stringify(workspace).includes((created.structuredContent as any).direction.id));
  await reloadPage();
  assert.equal(await status(a.directionCreate.capability_id), "enabled");
  // The write reaches the real server, then its response is lost. UI must not claim success.
  await evaluate(`globalThis.originalFetch=globalThis.fetch;globalThis.fetch=async(...args)=>{const response=await originalFetch(...args);if(String(args[0])==='/api/settings/mcp/actions'&&args[1]?.method==='POST'){globalThis.fetch=originalFetch;throw new TypeError('simulated response loss');}return response;}`);
  await grant(a.directionCreate.capability_id, false);
  assert.match(await evaluate<string>("document.querySelector('[data-mcp-access-feedback]').textContent"), /保存结果未确认/);
  assert.equal(await status(a.directionCreate.capability_id), "enabled", "uncertain result must not optimistically repaint the grant");
  assert.equal((await alpha.callTool({ name: createName, arguments: { description: "撤销后拒绝写入" } })).isError, true);
  await click('[data-mcp-access-refresh]');
  await waitFor(`document.querySelector('[data-mcp-access]').getAttribute('aria-busy')==='false'`);
  assert.equal(await status(a.directionCreate.capability_id), "disabled");

  // A previously unknown provider enters the same production registry, with no UI/Host whitelist.
  const id = `fixture.${randomUUID()}`; let online = true;
  const definition: ActionDefinition = { capability_id: id, version: 1, operation: "command", action: {
    title: '研究服务 <script>unsafe()</script>', description: "按项目整理研究材料，能力由插件自行注册。", scope: "project", kind: "operation", audiences: ["mcp"], permissions: ["fixture:write"], subject_kinds: [],
    input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "integer" },
  } };
  const install = (permissions: string[]) => localHost.actionRegistry(ref).registerProvider({ provider: { provider_id: id, title: "研究服务", kind: "plugin" }, definitions: [{ ...definition, action: { ...definition.action, permissions } }],
    handlers: [{ capability_id: id, version: 1, handle: () => 1, availability: () => online ? { available: true } : { available: false, code: "fixture.offline", reason: "服务未连接" } }] });
  let stop = install(["fixture:write"]); t.after(() => stop());
  await search(id); assert.equal(await status(id), "ungranted");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(row(id))}).querySelector('h3 script')`), null);
  online = false; await grant(id, true);
  assert.match(await evaluate<string>("document.querySelector('[data-mcp-access-feedback]').textContent"), /服务未连接/);
  assert.equal(await status(id), "ungranted");
  online = true; await grant(id, true); assert.equal(await status(id), "enabled");
  stop(); stop = install(["fixture:write", "fixture:network"]);
  await search(id); assert.equal(await status(id), "stale");
  await click(`${row(id)} summary`);
  assert.match(await evaluate<string>(`document.querySelector(${JSON.stringify(row(id))}).innerText`), /fixture:network/);
  await grant(id, true); assert.equal(await status(id), "enabled");
  online = false; await search(id); assert.equal(await status(id), "unavailable");
  stop(); await search(id); assert.equal(await status(id), "missing");
  await grant(id, false);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(row(id))}).querySelectorAll('button').length`), 0);
  await search("no-such-capability");
  assert.match(await evaluate<string>("document.querySelector('[data-mcp-access-rows]').innerText"), /没有符合条件/);

  // Default Home queries can be revoked using the same interface; a project-bound client observes it.
  await visit("?client=runtime:ui-alpha"); await search("functions.list");
  assert.equal(await status("functions.list"), "public");
  await grant("functions.list", false); assert.equal(await status("functions.list"), "disabled");
  const queryName = hostActionToolName({ capability_id: "functions.list", version: 1 });
  assert.equal((await alpha.listTools()).tools.some(tool => tool.name === queryName), false);
  assert.equal((await beta.listTools()).tools.some(tool => tool.name === queryName), true);
  await grant("functions.list", true); assert.equal(await status("functions.list"), "enabled");
  assert.equal((await alpha.callTool({ name: queryName, arguments: {} })).isError, false);

  // Capture the real access surface, after choosing a client and a useful provider filter.
  await visit(`?client=runtime:ui-alpha&project=${projectId}&q=alchemist`);
  await mkdir(artifacts, { recursive: true });
  for (const width of [1440, 390]) for (const theme of ["light", "dark"]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
    await evaluate(`localStorage.setItem('molis-work:theme',${JSON.stringify(theme)});dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:${JSON.stringify(theme)}}));document.querySelector('.settings-content').scrollTop=0;window.scrollTo(0,0);document.activeElement?.blur();document.fonts.ready`);
    await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `no horizontal overflow at ${width}/${theme}`);
    if (width === 390) assert.equal(await evaluate("Array.from(document.querySelectorAll('.mcp-access button')).filter(x=>x.getBoundingClientRect().height>0).every(x=>x.getBoundingClientRect().height>=44)"), true, "narrow-screen action controls must retain touch target size");
    const capture = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    await writeFile(`${artifacts}/access-${width}-${theme}.png`, Buffer.from(capture.data, "base64"));
  }
  await evaluate("document.querySelector('[name=project]').value='';document.querySelector('[name=project]').dispatchEvent(new Event('change'));document.querySelector('.settings-content').scrollTop=0");
  await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  const pendingScopeCapture = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  await writeFile(`${artifacts}/access-390-pending-scope-dark.png`, Buffer.from(pendingScopeCapture.data, "base64"));
  await evaluate(`document.querySelector('[name=project]').value=${JSON.stringify(projectId)};document.querySelector('[name=project]').dispatchEvent(new Event('change'))`);
  // Keyboard operation of the disclosure remains available on narrow screens.
  await evaluate(`document.querySelector(${JSON.stringify(row(a.directionCreate.capability_id))}).querySelector('summary').focus()`);
  assert.equal(await evaluate("document.activeElement.tagName"), "SUMMARY");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(row(a.directionCreate.capability_id))}).querySelector('details').open`), true);
  const detail = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  await writeFile(`${artifacts}/access-390-detail-dark.png`, Buffer.from(detail.data, "base64"));
  await evaluate("document.cookie='molis_work_locale=en; Path=/'"); await reloadPage();
  assert.match(await evaluate<string>("document.querySelector('.mcp-access-scope').innerText"), /Access scope/);
  assert.match(await evaluate<string>(`document.querySelector(${JSON.stringify(row(a.directionCreate.capability_id))}).innerText`), /Access revoked/);
});
