import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { molisWorkHostProjectReference, pluginControlActions, pluginInstallActions, readSandboxPackage } from "@molis-ai/molis-work-app-local-host";
import type { ProjectPluginInstalledView } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { SANDBOX_PACKAGE_FILES } from "@molis-ai/molis-work-contracts/platform/plugin";
import { verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { sandboxPackageBuildId } from "@molis-ai/molis-work-plugin-sdk";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { person, ref } from "./fixtures/home-sandbox.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { projectInstallation } from "./fixtures/signed-package-host.js";
import { packSignedObjectSlot } from "./fixtures/signed-surface-slot.js";

test("IUI-07 IUI-08 IUI-13: externally packed project and Home stages mount a stored Inbox reference in the trusted parent", { skip: process.platform !== "darwin", timeout: 150_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null);
  if (!b) return;
  const { projectId, localHost, store } = b;
  assert.ok(projectId && localHost);
  const prefix = "/projects/" + projectId, client = localHost.actionClient(molisWorkHostProjectReference({ projectId, databasePath: b.databasePath }));
  const caller = person(projectId);
  const feed = createLocalFeedApplication(store.db), sources = createLocalFeedSourceService(store.db, projectId);
  const source = sources.register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "signed-mount" }).source;
  const records = [];
  const request = (path: string, body?: unknown, page?: string, contextual = false) => fetch(b.origin + path, { method: body === undefined ? "GET" : "POST",
    headers: { origin: b.origin, "content-type": "application/json", "x-molis-work-control-token": b.controlToken, "x-molis-work-idempotency-key": randomUUID(),
      ...(page ? { [contextual ? "x-molis-context-page" : "x-molis-plugin-page"]: page } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  await b.setViewport(1440, 900);
  await b.command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: b.origin }, b.sessionId);
  for (const scope of ["project", "home"] as const) {
    const id = "io.molis.work.example.surface-slot-" + scope, title = "Original Inbox item for the " + scope + " slot";
    const { item } = feed.ingestItem({ source, externalId: scope, title, summary: "Original summary", occurredAt: new Date().toISOString(), attention: false });
    const { entry } = feed.ensureInboxEntryForFeedItem(projectId, item.item_id, "manual");
    const { bundle, surface } = await packSignedObjectSlot(t, scope, id, "inbox_entry");
    const parsed = readSandboxPackage(verifyPluginPackageSignature(bundle).bundle.payload);
    assert.deepEqual(parsed.ui, surface.ui);
    assert.deepEqual(parsed.nodes.find(node => node.kind === "surface-slot")?.surfaceSlot, { slot_id: "references.originals" });
    const changed = structuredClone(bundle);
    changed.payload.files.find(file => file.path === SANDBOX_PACKAGE_FILES.interface)!.content_base64 = Buffer.from(JSON.stringify({ ...surface, ui: { slots: [] } })).toString("base64");
    assert.throws(() => verifyPluginPackageSignature(changed), { code: "plugin.signature_invalid" });
    const preview = await client.invoke(caller, ref(pluginInstallActions.preview), { bundle }) as { preview_id: string; runtime_scope: string };
    assert.equal(preview.runtime_scope, scope);
    await client.invoke(caller, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
    const framed = await request(prefix + "/plugins/" + id + "?frame=workbench"), html = await framed.text();
    assert.equal(framed.status, 200, html.slice(0, 200));
    const page = /"page_id":"([^"]+)"/u.exec(html)?.[1];
    assert.ok(page);
    const endpoint = prefix + "/api/contextual/surface-slot";
    const reserve = { intent: "reserve", mount_id: 1, slot_id: "references.originals", subjects: [{ kind: "inbox_entry", id: entry.entry_id }] };
    assert.equal((await request(endpoint, reserve, page)).status, 403, "the ordinary child transport cannot call a trusted slot");
    const foreign = await request(endpoint, { ...reserve, slot_id: "inbox.origin" }, page, true);
    assert.equal(foreign.status, 403, "the actual signed stage cannot borrow another contribution's declaration");
    const originalSlot = await request(endpoint, { ...reserve, mount_id: 2 }, page, true);
    assert.equal(originalSlot.status, 200);
    const { slot } = await originalSlot.json() as { slot: string };
    assert.equal((await request(prefix + "/api/host/plugin-page-actions", {
      mode: "component_submit", component_id: "editor", payload: { form: { id: entry.entry_id } },
    }, page)).status, 200, "the original signed component stores the reference");
    const surfaceId = scope === "home" ? id : "app-" + sandboxPackageBuildId(id, bundle.payload.manifest.publisher.signature);
    records.push({ scope, id, surfaceId, entry, title, page, slot, endpoint });
  }
  const switched = await packSignedObjectSlot(t, "home", records[0]!.id, "inbox_entry");
  await assert.rejects(client.invoke(caller, ref(pluginInstallActions.preview), { bundle: switched.bundle }), /范围不能更换/u);
  assert.equal(localHost.homePlugins?.installation(records[0]!.id), null, "a rejected scope change does not create an installation");

  const requests = new Map<string, { path: string; status: number; mode?: string }>();
  const documents: string[] = [];
  t.after(b.on("Network.requestWillBeSent", params => {
    const request = params.request as { url: string; postData?: string };
    const path = new URL(request.url).pathname;
    if (params.type === "Document" && new URL(request.url).origin === b.origin) documents.push(path);
    if (!/surface-slot|plugin-page-actions|workbench-plugin-frame/u.test(path)) return;
    const data = request.postData ? JSON.parse(request.postData) : undefined;
    requests.set(String(params.requestId), { path, status: 0, mode: data?.intent ?? data?.mode });
  }));
  t.after(b.on("Network.responseReceived", params => {
    const seen = requests.get(String(params.requestId));
    if (seen) seen.status = (params.response as { status: number }).status;
  }));
  await b.command("Network.enable", {}, b.sessionId);
  for (const { scope, id, surfaceId, entry, title, page, slot, endpoint } of records) {
    const holder = '[data-work-surface="' + surfaceId + '"][data-installed-plugin="' + id + '"] > iframe';
    const child = await pluginFrameBrowser(t, b, id, holder);
    let navigation: { loaderId?: string; errorText?: string } | undefined;
    try { await b.navigate(async () => { navigation = await b.command<typeof navigation>("Page.navigate", { url: b.origin + prefix + "/plugins/" + id }, b.sessionId); }); }
    catch (cause) { throw new Error(JSON.stringify({ scope, navigation, documents: documents.slice(-15) }), { cause }); }
    const doc = "document.querySelector(" + JSON.stringify(holder) + ")?.contentDocument";
    const area = '[data-framed-area] .surface-slot-body';
    const one = (selector: string) => doc + "?.querySelector(" + JSON.stringify(selector) + ")";
    const content = area + ' [data-home-subject-id="' + entry.entry_id + '"]';
    try { await b.waitFor(`${one(content)}?.innerText.includes(${JSON.stringify(title)})`, 10_000); }
    catch (cause) {
      const state = await b.evaluate(`(() => {const holder = document.querySelector(${JSON.stringify(holder)}), doc = holder?.contentDocument;
        return {url: location.pathname + location.search, stage: holder?.parentElement?.dataset.workSurface, hidden: !!holder?.closest('[hidden]'),
          frames: [...document.querySelectorAll('[data-installed-plugin]')].map(section => ({id: section.dataset.installedPlugin, surface: section.dataset.workSurface})),
          carrier: doc?.body?.innerText.slice(0, 500), opaque: doc?.querySelector('[data-plugin-frame]')?.dataset.pluginFrame,
          slot: doc?.querySelector('[data-framed-area]')?.innerText.slice(0, 300)};})()`);
      throw new Error(JSON.stringify({ state, requests: [...requests.values()] }), { cause });
    }
    assert.equal(await b.evaluate(`document.querySelectorAll(${JSON.stringify(holder)}).length`), 1, "the original signed stage is drawn only once");
    assert.equal(await b.evaluate(`location.pathname + location.search`), prefix + "/", "the direct address opens that workbench stage");
    assert.ok([...requests.values()].some(item => item.mode === "reserve" && item.status === 200)
      && [...requests.values()].some(item => item.mode === "read" && item.status === 200), "the browser reserved and read a trusted area");
    await child.waitFor("document.querySelector('[data-component-surface-slot]')?.getBoundingClientRect().height > 0");
    assert.deepEqual(await child.evaluate(`({ children: document.querySelector('[data-component-surface-slot]').childElementCount,
      title: document.body.innerText.includes(${JSON.stringify(title)}), controls: !!document.querySelector('[data-presentation-action]') })`), { children: 0, title: false, controls: false });
    const pick = (label: string) => `[...(${doc}?.querySelectorAll(${JSON.stringify(area + ' [data-presentation-action]')}) ?? [])].find(button => button.textContent.trim() === ${JSON.stringify(label)})`;
    const press = async (expression: string) => {
      await b.waitFor(`!!(${expression})?.checkVisibility() && !(${expression}).hasAttribute('aria-disabled') && !(${expression}).closest('[data-unready]')`);
      const point = await b.evaluate<{ x: number; y: number }>(`(() => { const outer = document.querySelector(${JSON.stringify(holder)}).getBoundingClientRect();
        const button = (${expression}); button.scrollIntoView({block:'nearest'}); const box = button.getBoundingClientRect();
        return { x: outer.left + box.left + box.width / 2, y: outer.top + box.top + box.height / 2 }; })()`);
      for (const type of ["mousePressed", "mouseReleased"]) await b.command("Input.dispatchMouseEvent", { type, button: "left", clickCount: 1, ...point }, b.sessionId);
    };
    const choose = async (label: string) => {
      await b.waitFor(`!!(${pick(label)})`);
      if (!await b.evaluate(`!!(${pick(label)})?.checkVisibility()`)) await press(one(area + " .mw-presentation__more summary"));
      await press(pick(label));
    };
    const status = scope === "project" ? "done" : "dismissed";
    await choose("更多操作");
    await choose(status === "done" ? "做完了" : "忽略");
    assert.equal(feed.getInboxEntry(projectId, entry.entry_id).revision, entry.revision);
    await press(one(area + ' [data-framed-control="confirm"]'));
    try {
      await b.waitFor(`${one(area)}?.textContent.includes('已完成') && !${one(content)} && !${one(area + ' [data-framed-control="confirm"]')}`, 5_000);
    } catch (cause) {
      const confirmation = [...requests].findLast(([, event]) => event.mode === "confirm");
      const answer = confirmation && await b.command<{ body: string }>("Network.getResponseBody", { requestId: confirmation[0] }, b.sessionId).catch(() => null);
      const state = await b.evaluate(`${one(area)}?.innerText.slice(-400)`);
      const { status: actual, revision } = feed.getInboxEntry(projectId, entry.entry_id);
      throw new Error(JSON.stringify({ scope, state, actual, revision, answer: answer?.body?.slice(0, 250), requests: [...requests.values()] }), { cause });
    }
    const written = feed.getInboxEntry(projectId, entry.entry_id);
    assert.deepEqual([written.status, written.revision], [status, entry.revision + 1]);

    const carrier = new URL(await b.evaluate<string>("document.querySelector(" + JSON.stringify(holder) + ").src"), b.origin);
    const originalInstallation = JSON.parse(carrier.searchParams.get("installation")!);
    carrier.searchParams.set("installation", JSON.stringify({ ...originalInstallation, scope: scope === "project" ? "home" : "project" }));
    assert.equal((await request(carrier.pathname + carrier.search)).status, 409, "the original carrier cannot change its scope");
    if (scope === "project") {
      await client.invoke(caller, ref(pluginControlActions.disable), { plugin_id: id });
      const { plugins } = await client.invoke(caller, ref(pluginInstallActions.installed), {}) as { plugins: ProjectPluginInstalledView[] };
      const disabled = plugins.find(plugin => plugin.plugin_id === id);
      assert.equal(disabled?.state, "disabled");
      await client.invoke(caller, ref(pluginControlActions.enable), { plugin_id: id, expected_installation: projectInstallation(disabled!) });
    } else {
      await b.web.post("/api/settings/plugin-permissions/disable", { plugin_id: id });
      assert.equal(localHost.homePlugins?.installation(id)?.state, "disabled");
      await b.web.post("/api/settings/plugin-permissions/enable", { plugin_id: id });
    }
    const retired = await request(endpoint, { intent: "read", slot }, page, true);
    assert.ok(retired.status === 403 || retired.status === 409, "an old page or activation cannot read after the original install restarts");
    assert.doesNotMatch(await retired.text(), new RegExp(title, "u"));
    await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/" }, b.sessionId));
    await b.click("[data-plugin-picker-toggle]");
    await b.click('[data-plugin-picker-popover] [data-work-surface-open="' + surfaceId + '"]');
    await b.waitFor(`${one(area)}?.textContent.includes('暂时读不到') && !${one(content)}`, 15_000);
    assert.equal(await b.evaluate(`document.querySelectorAll(${JSON.stringify(holder)}).length`), 1, "the switcher reopens the same single original stage");
    assert.deepEqual([feed.getInboxEntry(projectId, entry.entry_id).status, feed.getInboxEntry(projectId, entry.entry_id).revision], [status, written.revision]);
    const inbox = await pluginFrameBrowser(t, b, "inbox");
    await b.click('[data-plugin-strip] [data-plugin-id="inbox"]');
    const inboxEntry = '[data-inbox-row][data-inbox-entry-id="' + entry.entry_id + '"]';
    await inbox.waitFor(`document.querySelector(${JSON.stringify(inboxEntry)})?.dataset.inboxStatus === ${JSON.stringify(status)}`);
    await inbox.click(inboxEntry);
    await inbox.click('[data-inbox-detail="' + entry.entry_id + '"] [data-inbox-action="open"]');
    await inbox.waitFor(`document.querySelector(${JSON.stringify(inboxEntry)})?.dataset.inboxStatus === "open"`);
    const reactivated = feed.getInboxEntry(projectId, entry.entry_id);
    assert.deepEqual([reactivated.status, reactivated.revision], ["open", written.revision + 1]);
    await b.reloadPage();
    await b.click("[data-plugin-picker-toggle]");
    await b.click('[data-plugin-picker-popover] [data-work-surface-open="' + surfaceId + '"]');
    await b.waitFor(`${one(content)}?.innerText.includes(${JSON.stringify(title)})`, 15_000);
  }
});
