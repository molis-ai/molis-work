import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { HomeConsentLedger, pluginInstallActions, PLUGIN_CONSENT_PERMISSIONS } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalPluginActions, type GoalEventWorkStateView } from "@molis-ai/molis-work-plugin-goals/contract";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { projectReachPackage, REACH_PLUGIN_ID, REACH_GOAL_ID } from "./fixtures/home-project-reach-package.js";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { person, ref, operate, operationsOf } from "./fixtures/home-sandbox.js";
import { initializeBoard } from "./fixtures/goals-board.js";
import { goalApplicationOf } from "./fixtures/goal-application.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

const mac = { skip: process.platform !== "darwin", timeout: 180_000 };
const panel = `[data-project-reach="${REACH_PLUGIN_ID}"]`, ownerFrame = `iframe[src*="/plugins/${REACH_PLUGIN_ID}?"]`;
const homeDetails = `[data-plugin-trust-home] details:has(${panel})`;

async function fixture(t: TestContext) {
  const f = await serveHomeRuntime(t), a = await f.project("写作项目 A"), b = await f.project("研究项目 B"), publisher = newPublisher();
  for (const project of [a, b]) {
    await initializeBoard(f.host, project.reference);
    await f.host.withProject(project.reference, runtime => goalApplicationOf(runtime).goalEvents.createIntent({ project_id: project.project_id,
      goal_id: REACH_GOAL_ID, title: project.project_id, actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", idempotency_key: "create-goal" }));
  }
  const client = f.host.actionClient(a.reference), preview = await client.invoke(person(a.project_id), ref(pluginInstallActions.preview), { bundle: projectReachPackage(publisher) }) as { preview_id: string };
  await client.invoke(person(a.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Reach publisher" });
  const ledger = new HomeConsentLedger(f.home);
  const state = (project: typeof a) => f.host.actionClient(project.reference).invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user", permissions: ["goals:read"] },
    ref(goalPluginActions.state), { goal_id: REACH_GOAL_ID }) as Promise<GoalEventWorkStateView>;
  const settings = (project: typeof a, name: string, body: unknown = {}) => f.request(`/projects/${project.project_id}/api/settings/plugin-project-reach/${name}`, { method: "POST", body });
  return { ...f, a, b, publisher, ledger, state, settings };
}

async function packagePageHeaders(f: Awaited<ReturnType<typeof fixture>>) {
  const response = await f.request(`/projects/${f.a.project_id}/plugins/${REACH_PLUGIN_ID}?frame=workbench`);
  assert.equal(response.status, 200, "the actual package frame must open");
  const pageId = /"page_id":"([^"]+)"/u.exec(await response.text())?.[1];
  assert.ok(pageId, "the actual package frame must issue its page credential");
  return { "x-molis-plugin-page": pageId };
}

/** Observe the actual HTTP settings caller before the unchanged action client and ledger owner run. */
function holdSettingsGrant(f: Awaited<ReturnType<typeof fixture>>) {
  const original = f.host.actionClient, entered = deferred(), release = deferred(), finished = deferred();
  let caller: ActionCallContext | undefined;
  f.host.actionClient = function (...args: Parameters<typeof original>) {
    const client = original.apply(this, args);
    return { ...client, invoke: async (context, reference, value) => {
      if (caller || reference.capability_id !== "plugins.project_reach.grant") return client.invoke(context, reference, value);
      caller = context; entered.resolve(); await release.promise;
      try { return await client.invoke(context, reference, value); } finally { finished.resolve(); }
    } };
  };
  return { original, entered: entered.promise, release: release.resolve, finished: finished.promise, caller: () => caller,
    close() { release.resolve(); f.host.actionClient = original; } };
}

async function browserFixture(t: TestContext, f: Awaited<ReturnType<typeof fixture>>) {
  const executable = process.env.MOLIS_WORK_TEST_CHROME;
  assert.equal(executable, "/Users/yijunwang/.local/bin/molis-test-browser");
  for (const name of ["MOLIS_WORK_BUILDER_BROWSER", "MOLIS_WORK_BROWSER_PATH"]) assert.equal(process.env[name], executable, `${name} must use the same dedicated browser`);
  await access(executable, constants.X_OK); await access("/Users/yijunwang/.local/share/molis-test-browser/engine/chrome-headless-shell", constants.X_OK);
  const directory = await mkdtemp(join(tmpdir(), "t145-browser-"));
  let browser: ChromeHarness | undefined;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try { if (browser) await browser.command("Browser.close"); }
    finally { try { await browser?.close(); } finally { await rm(directory, { recursive: true, force: true }); } }
  };
  t.after(close);
  browser = await ChromeHarness.start(directory, { executable });
  const page = await browser.page();
  await page.command("Page.enable"); await page.command("Network.enable");
  const mutations: string[] = [];
  t.after(browser.on("Network.requestWillBeSent", (params, session) => {
    const request = params.request as { url: string; method: string };
    if (session === page.sessionId && request.method === "POST" && request.url.startsWith(f.origin + "/projects/")
      && /\/api\/settings\/plugin-project-reach\/(grant|revoke)$/u.test(new URL(request.url).pathname)) mutations.push(request.url);
  }));
  const resize = async (width = 1440) => {
    await page.viewport(width, 1000, width === 390);
    await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  };
  await resize();
  const navigate = async (path: string) => Promise.all([browser!.event("Page.loadEventFired"), page.command("Page.navigate", { url: f.origin + path })]);
  const reload = async () => Promise.all([browser!.event("Page.loadEventFired"), page.command("Page.reload")]);
  const adapter = { sessionId: page.sessionId, command: browser.command.bind(browser), on: browser.on.bind(browser), evaluate: page.evaluate.bind(page) };
  const child = await pluginFrameBrowser(t, adapter, REACH_PLUGIN_ID, ownerFrame);
  const openReach = async () => {
    await page.wait(`!!document.querySelector('${panel}')`, { describe: "document.querySelector('[data-plugin-trust-error]')?.innerText" });
    if (!await page.evaluate(`document.querySelector('${homeDetails}').open`)) await page.click(`${homeDetails} > summary`);
  };
  const openSettings = async (project = f.a) => {
    await navigate(`/projects/${project.project_id}/`);
    await page.wait("!!document.querySelector('[data-project-menu] > summary')");
    await page.click("[data-project-menu] > summary"); await page.click("[data-directory-open=project-settings]");
    await page.wait("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=plugins]')");
    await page.click("[data-directory-panel=project-settings] [data-settings-section=plugins]");
    await openReach();
  };
  const openPackage = async (project = f.a) => {
    await navigate(`/projects/${project.project_id}/`);
    await page.wait("!!document.querySelector('[data-plugin-picker-toggle]')"); await page.click("[data-plugin-picker-toggle]");
    const surface = f.host.homePlugins!.packageSurface(REACH_PLUGIN_ID)!;
    await page.click(`[data-plugin-picker-popover] [data-work-surface-open="${surface}"]`);
    await page.wait(`document.querySelector('${ownerFrame}')?.getClientRects().length > 0`);
    assert.ok((await page.evaluate<string>(`document.querySelector('${ownerFrame}').src`)).includes(`/projects/${project.project_id}/plugins/`));
    await child.waitFor("!!document.querySelector('[data-field=text]')");
  };
  const submit = async (text: string) => {
    await child.click("[data-field=text]");
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 4, commands: ["selectAll"] });
    await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 0 });
    await page.command("Input.insertText", { text });
    assert.equal(await child.evaluate("document.querySelector('[data-field=text]').value"), text, "real keyboard input reached the plugin frame");
    await child.click("button[type=submit]");
  };
  const decide = async (action: "grant" | "revoke", yes: boolean) => {
    const count = mutations.length;
    await page.click(`${panel} [data-project-reach-action=${action}]`);
    await page.wait("!!document.querySelector('dialog[open]')");
    assert.equal(await page.evaluate(`(() => { const nodes=[...document.querySelectorAll('${panel} button')]; return nodes.length>0 && nodes.every(node => node.disabled); })()`), true, "the pending decision prevents duplicate mutation");
    await page.click(`dialog[open] .mw-btn--${yes ? "danger" : "secondary"}`);
    await page.wait("!document.querySelector('dialog[open]')");
    if (yes) {
      const status = action === "grant" ? "已同意" : "未同意";
      await page.wait(`document.querySelector('${panel}')?.textContent.includes('${status}')`, { describe: `JSON.stringify({error:document.querySelector('[data-plugin-trust-error]')?.innerText,panel:document.querySelector('${panel}')?.textContent})` });
      await openReach();
      assert.ok((await page.evaluate<string>(`document.querySelector('${panel}').innerText`)).includes(status), "the person sees the returned approval state in the open plugin row");
    }
    await page.wait(`(() => { const nodes=[...document.querySelectorAll('${panel} button')]; return nodes.length>0 && nodes.every(node => !node.disabled); })()`);
    assert.equal(mutations.length, count + Number(yes), "cancel sends no mutation; confirmation sends exactly one");
  };
  const upgrade = async (version: string, extraCapability?: string) => {
    const file = join(directory, version + ".json"); await writeFile(file, JSON.stringify(projectReachPackage(f.publisher, { version, extraCapability })));
    const doc = await page.command<{ root: { nodeId: number } }>("DOM.getDocument");
    const input = await page.command<{ nodeId: number }>("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "[data-plugin-trust-pick]" });
    await page.command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] });
    await page.wait("document.querySelector('[data-plugin-trust-preview]')?.hidden === false");
    await page.click("[data-plugin-trust-preview] .mw-btn--primary");
    await page.wait("document.querySelector('[data-plugin-trust-preview]')?.hidden === true", { describe: "document.querySelector('[data-plugin-trust-error]')?.innerText" });
    await page.wait(`document.querySelector('${homeDetails} > summary')?.innerText.includes(' · ${version}')`);
    await openReach();
  };
  return { page, child, openSettings, openPackage, submit, decide, upgrade, resize, navigate, reload, close };
}

test("RAC-2644–2649 S-107 actual project settings, signed File upgrade and workbench navigation retain A through page, refresh, withdrawal and project switch", mac, async t => {
  const f = await fixture(t), ui = await browserFixture(t, f);
  try {
  const b0 = await f.state(f.b), a0 = await f.state(f.a);
  await ui.openPackage(); await ui.submit("unapproved page must not write");
  await ui.child.waitFor("document.body.innerText.includes('同意')"); assert.deepEqual(await f.state(f.a), a0);
  await ui.openSettings();
  assert.match(await ui.page.evaluate<string>(`document.querySelector('${panel}').innerText`), /未同意/u);
  const initial = f.ledger.consents(REACH_PLUGIN_ID); await ui.decide("grant", false);
  assert.deepEqual(f.ledger.consents(REACH_PLUGIN_ID), initial, "cancel sends no agreement mutation");
  await ui.decide("grant", true);
  const original = f.ledger.consents(REACH_PLUGIN_ID).find(row => row.kind === "project_reach" && !row.revoked_at)!;
  assert.equal(original.subject, JSON.stringify([f.a.project_id, f.host.homePlugins!.installation(REACH_PLUGIN_ID)!.install_id]));
  await ui.openPackage(); await ui.submit("A from the actual workbench");
  await ui.child.waitFor("document.body.innerText.includes('已记录')");
  assert.equal((await f.state(f.a)).progress_summary!.summary, "A from the actual workbench"); assert.deepEqual(await f.state(f.b), b0);
  await ui.reload(); await ui.child.waitFor("!!document.querySelector('[data-field=text]')");
  assert.ok((await ui.page.evaluate<string>(`document.querySelector('${ownerFrame}').src`)).includes(`/projects/${f.a.project_id}/plugins/`));
  await ui.submit("A after refresh"); await ui.child.waitFor("document.body.innerText.includes('已记录')");
  assert.equal((await f.state(f.a)).progress_summary!.summary, "A after refresh");
  const caller: ActionCallContext = { actor_id: "reach-agent", audience: "agent", project_id: f.a.project_id, permissions: [] }, client = f.host.actionClient(f.a.reference);
  await operate(client, caller, await operationsOf(client, caller, REACH_PLUGIN_ID), "reach.submit", { text: "A agent using the same agreement" });
  assert.equal((await f.state(f.a)).progress_summary!.summary, "A agent using the same agreement");
  await ui.openSettings(); await ui.upgrade("1.1.0");
  assert.deepEqual(f.ledger.consent(original.consent_id), original); assert.notEqual(f.host.homePlugins!.installation(REACH_PLUGIN_ID)!.manifest_digest, original.manifest_digest);
  await ui.openPackage(); await ui.submit("A after the same-declaration File upgrade"); await ui.child.waitFor("document.body.innerText.includes('已记录')");
  assert.equal((await f.state(f.a)).progress_summary!.summary, "A after the same-declaration File upgrade");
  await ui.openSettings();
  await ui.upgrade("1.2.0", "model.generate");
  assert.match(await ui.page.evaluate<string>(`document.querySelector('${panel}').innerText`), /声明的动作增加/u);
  const blocked = await f.state(f.a); await ui.openPackage(); await ui.submit("A before renewed agreement");
  await ui.child.waitFor("document.body.innerText.includes('声明的动作增加')"); assert.deepEqual(await f.state(f.a), blocked);
  await ui.openSettings();
  const expanded = f.ledger.consents(REACH_PLUGIN_ID); await ui.decide("grant", false); assert.deepEqual(f.ledger.consents(REACH_PLUGIN_ID), expanded);
  const agreement = await ui.page.evaluate<string>(`document.querySelector('${panel}').innerText`);
  for (const title of ["写作项目 A", goalPluginActions.state.action.title, goalPluginActions.progress.action.title, "费用计入你的模型服务"]) assert.ok(agreement.includes(title), title);
  for (const internal of [f.a.project_id, original.subject, "goals.progress.record", "model.generate"]) assert.ok(!agreement.includes(internal), "the approval explains actions without internal identity: " + internal);
  const screenshots = join(process.cwd(), ".impeccable/qa/review/t145"); await mkdir(screenshots, { recursive: true });
  for (const width of [1440, 390]) {
    await ui.resize(width);
    await ui.page.evaluate(`document.querySelector('${panel}').scrollIntoView({block:'center'})`);
    assert.equal(await ui.page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    assert.equal(await ui.page.evaluate(`(() => { const p=document.querySelector('${panel}').getBoundingClientRect();return [...document.querySelectorAll('${panel} button')].every(n=>{const b=n.getBoundingClientRect();return b.width>0&&b.left>=p.left&&b.right<=p.right;}); })()`), true);
    await ui.page.screenshot(join(screenshots, `approval-expanded-${width}.png`));
  }
  await ui.resize(); await ui.decide("grant", true);
  const current = f.ledger.consents(REACH_PLUGIN_ID).find(row => row.kind === "project_reach" && !row.revoked_at)!;
  assert.notEqual(current.consent_id, original.consent_id); assert.ok(current.approved_capability_ids!.includes("model.generate"));
  assert.equal(current.manifest_digest, f.host.homePlugins!.installation(REACH_PLUGIN_ID)!.manifest_digest);
  await ui.openPackage(); await ui.submit("A after renewed agreement"); await ui.child.waitFor("document.body.innerText.includes('已记录')");
  await ui.openSettings(); await ui.decide("revoke", true);
  const before = await f.state(f.a); await ui.openPackage(); await ui.submit("withdrawn page");
  await ui.child.waitFor("document.body.innerText.includes('同意')"); assert.deepEqual(await f.state(f.a), before);
  await ui.openPackage(f.b); await ui.submit("B never agreed"); await ui.child.waitFor("document.body.innerText.includes('同意')");
  assert.deepEqual(await f.state(f.b), b0);
  await ui.openSettings(f.b); assert.match(await ui.page.evaluate<string>(`document.querySelector('${panel}').innerText`), /未同意/u);
  await ui.navigate(`/plugins/${REACH_PLUGIN_ID}`);
  await ui.page.wait(`!!document.querySelector('${ownerFrame}')`);
  assert.equal(new URL(await ui.page.evaluate<string>(`document.querySelector('${ownerFrame}').src`)).pathname, `/plugins/${REACH_PLUGIN_ID}`);
  await ui.child.waitFor("!!document.querySelector('[data-field=text]')"); await ui.submit("Home has no triggering project");
  await ui.child.waitFor("document.body.innerText.includes('不可用')");
  assert.deepEqual(await f.state(f.a), before); assert.deepEqual(await f.state(f.b), b0);
  } finally { await ui.close(); }
});

test("S-107 project settings reject copied credentials, other audiences, extra identity inputs, global revoke and a plugin page", mac, async t => {
  const f = await fixture(t), response = await f.settings(f.a, "list");
  assert.equal(response.status, 200, await response.clone().text());
  const selection = (await response.json() as { plugins: Array<{ plugin_id: string; snapshot: string }> }).plugins.find(item => item.plugin_id === REACH_PLUGIN_ID)!;
  const input = { plugin_id: selection.plugin_id, snapshot: selection.snapshot }, before = f.ledger.consents(REACH_PLUGIN_ID);
  for (const field of ["actor_id", "project_id", "subject", "install_id", "manifest_digest", "approved_capability_ids"]) {
    const refusal = await f.settings(f.a, "grant", { ...input, [field]: "forged" }); assert.equal(refusal.status, 400, await refusal.text());
  }
  for (const audience of ["user", "agent", "mcp", "workflow", "plugin"] as const) {
    const caller: ActionCallContext = { ...person(f.a.project_id), audience, permissions: PLUGIN_CONSENT_PERMISSIONS };
    await assert.rejects(f.host.actionClient(f.a.reference).invoke(caller, { capability_id: "plugins.project_reach.grant", version: 1 }, input));
  }
  const hold = holdSettingsGrant(f);
  const granted = f.settings(f.a, "grant", input);
  try {
    await Promise.race([hold.entered, granted.then(() => { throw new Error("did not observe the real settings credential"); })]);
    const entry = hold.caller()!, client = hold.original.call(f.host, f.a.reference), action = { capability_id: "plugins.project_reach.grant", version: 1 };
    await assert.rejects(client.invoke({ ...entry, user_action: { ...entry.user_action! } }, action, input));
    await assert.rejects(client.invoke({ ...entry, delegated_by: REACH_PLUGIN_ID }, action, input));
    await assert.rejects(hold.original.call(f.host, f.b.reference).invoke({ ...entry, project_id: f.b.project_id }, action, input));
    await assert.rejects(f.host.homeActionClient().invoke({ ...entry, project_id: null }, action, input));
    assert.deepEqual(f.ledger.consents(REACH_PLUGIN_ID), before);
    hold.release(); assert.equal((await granted).status, 200);
  } finally { hold.close(); await Promise.allSettled([granted]); }
  await assert.rejects(hold.original.call(f.host, f.a.reference).invoke(hold.caller()!, { capability_id: "plugins.project_reach.grant", version: 1 }, input), "a settings credential ends with the actual request");
  const client = f.host.actionClient(f.a.reference), preview = await client.invoke(person(f.a.project_id), ref(pluginInstallActions.preview), { bundle: projectReachPackage(f.publisher, { version: "1.1.0" }) }) as { preview_id: string };
  await client.invoke(person(f.a.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true });
  const afterUpgrade = f.ledger.consents(REACH_PLUGIN_ID), stale = await f.settings(f.a, "grant", input);
  assert.equal(stale.status, 409, await stale.text()); assert.deepEqual(f.ledger.consents(REACH_PLUGIN_ID), afterUpgrade);
  const listed = await f.settings(f.b, "list"), current = (await listed.json() as { plugins: Array<{ plugin_id: string; snapshot: string }> }).plugins.find(item => item.plugin_id === REACH_PLUGIN_ID)!;
  const interrupted = holdSettingsGrant(f), stop = new AbortController();
  const pending = f.request(`/projects/${f.b.project_id}/api/settings/plugin-project-reach/grant`, { method: "POST", body: { plugin_id: current.plugin_id, snapshot: current.snapshot }, signal: stop.signal });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  try {
    await Promise.race([interrupted.entered, pending.then(() => { throw new Error("did not observe the settings request before disconnect"); })]);
    const signal = interrupted.caller()!.signal; assert.ok(signal);
    const cancelled = new Promise<void>(resolve => { if (signal.aborted) resolve(); else signal.addEventListener("abort", () => resolve(), { once: true }); });
    stop.abort(); await cancelled; interrupted.release(); await rejected; await interrupted.finished;
    assert.deepEqual(f.ledger.consents(REACH_PLUGIN_ID), afterUpgrade, "disconnect before the real owner cannot create B's project agreement");
  } finally { stop.abort(); interrupted.close(); await Promise.allSettled([pending, rejected]); if (interrupted.caller()) await interrupted.finished; }
  const row = f.ledger.consents(REACH_PLUGIN_ID).find(item => item.kind === "project_reach" && !item.revoked_at)!;
  const global = await f.request("/api/settings/plugin-consents/revoke", { method: "POST", body: { consent_id: row.consent_id } });
  assert.equal(global.status, 403, await global.text()); assert.equal(f.ledger.consent(row.consent_id)!.revoked_at, null);
  const refusedPage = await f.request(`/projects/${f.a.project_id}/api/settings/plugin-project-reach/revoke`, { method: "POST", body: input, headers: await packagePageHeaders(f) });
  assert.equal(refusedPage.status, 403, await refusedPage.text()); assert.equal(f.ledger.consent(row.consent_id)!.revoked_at, null);
});


test("RAC-2647 S-107 copying a real page invocation control does not copy its project authority", mac, async t => {
  const f = await fixture(t), listed = await f.settings(f.a, "list");
  const selection = (await listed.json() as { plugins: Array<{ plugin_id: string; snapshot: string }> }).plugins.find(row => row.plugin_id === REACH_PLUGIN_ID)!;
  assert.equal((await f.settings(f.a, "grant", { plugin_id: selection.plugin_id, snapshot: selection.snapshot })).status, 200);
  const platform = await f.host.homePlugins!.ready(), original = platform.router, before = await f.state(f.a);
  const headers = await packagePageHeaders(f);
  let copied = false;
  platform.router = function () {
    const router = original.call(this), dispatch = router.dispatch.bind(router);
    router.dispatch = request => { copied = true; return dispatch({ ...request, execution: request.execution && { ...request.execution } }); };
    return router;
  };
  const call = () => f.request(`/projects/${f.a.project_id}/api/plugins/${REACH_PLUGIN_ID}/call`, { method: "POST", headers, body: { componentId: "editor", binding: "submit", payload: { form: { text: "actual page control" } } } });
  try {
    const refused = await call(); assert.equal(copied, true); assert.equal(refused.status, 400, await refused.clone().text());
    assert.match(await refused.text(), /不可用/u); assert.deepEqual(await f.state(f.a), before);
  } finally { platform.router = original; }
  const fresh = await call(); assert.equal(fresh.status, 200, await fresh.text());
  assert.equal((await f.state(f.a)).progress_summary!.summary, "actual page control");
});
