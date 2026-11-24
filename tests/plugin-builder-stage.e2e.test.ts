import assert from "node:assert/strict";
import { once } from "node:events";
import type { ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LocalProjectDatabase, seedDemoGoals } from "@molis-ai/molis-work-app-local-host";
import { AgentBuilderStore, BUILDER_PLUGIN_ID, builderManifest } from "@molis-ai/molis-work-plugin-studio";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { readyPublication } from "./fixtures/studio-publishing.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// The studio is content in its isolated Host stage (SYS-15): no nested workbench shell or page brand, and
// it ends above the bottom bar. A studio taller than its stage ran under the bar and hid the composer's model note at
// narrow widths.
for (const [width, height] of [[757, 1044], [1440, 900]] as const) test(`plugin studio ${width}px: the studio is drawn in its stage and ends above the bottom bar`, { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { origin, projectId, command, sessionId, navigate } = browser;
  const { waitFor, evaluate } = await pluginFrameBrowser(t, browser, "plugin-builder");
  await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=plugin-builder` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-work-surface=plugin-builder] [data-agent-studio]')?.getClientRects().length)", 12_000);
  // Its client runs in the isolated stage: the models it can build with are listed in its own bar.
  await waitFor("document.querySelector('[data-work-surface=plugin-builder] [data-as-model]')?.options.length > 0 || !document.querySelector('[data-work-surface=plugin-builder] [data-as-model-setup]')?.hidden", 15_000);
  assert.equal(await evaluate("Boolean(document.querySelector('[data-work-surface=plugin-builder] iframe, [data-work-surface=plugin-builder] .as-brand'))"), false, "no nested frame and no page brand");
  assert.equal(await browser.evaluate("location.pathname"), `/projects/${projectId}/`);
  // The stage ends above the bar; a studio taller than it (the narrow layout) scrolls inside it, and the composer's model
  // note can be brought into view above the bar.
  const owner = await browser.evaluate<{ top: number; bottom: number; bar: number }>(`(() => {
    const frame = document.querySelector('iframe[data-plugin-frame="plugin-builder"]').getBoundingClientRect();
    return { top: frame.top, bottom: frame.bottom, bar: document.querySelector('.workbench-bar').getBoundingClientRect().top };
  })()`);
  const box = await evaluate<{ stage: number; bar: number; note: number; noteHeight: number }>(`(() => {
    const stage = document.querySelector('[data-work-surface=plugin-builder]');
    const note = stage.querySelector('[data-as-model-note]');
    note.scrollIntoView({ block: 'end' });
    const rect = note.getBoundingClientRect();
    return { stage: stage.getBoundingClientRect().bottom, bar: ${owner.bar - owner.top}, note: rect.bottom, noteHeight: rect.height };
  })()`);
  assert.ok(owner.bottom <= owner.bar + 0.5, `the Host frame ends above the bottom bar: ${JSON.stringify(owner)}`);
  assert.ok(box.stage <= box.bar + 0.5, `the stage ends above the bottom bar: ${JSON.stringify(box)}`);
  assert.ok(box.note <= box.bar + 0.5, `the composer's model note shows above the bottom bar: ${JSON.stringify(box)}`);
});

test("B47-F4 B12 an expired Studio page keeps the message for the same paused build after refresh", { timeout: 60_000 }, async t => {
  let buildId = "", projectId = "", database = "";
  const browser = await openGoalBrowser(t, "user", (path, id) => {
    database = path;
    projectId = id!;
    return seedDemoGoals(database, projectId);
  }, null, undefined, undefined, { async prepareHome(home) {
    const fixture = readyPublication(home, projectId, "project"), store = new LocalProjectDatabase(database);
    try {
      const storage = new SqlitePluginPrivateStorage(store.db).forPlugin({
        install_id: "agent-studio:" + projectId, installation_generation: "studio", plugin_id: BUILDER_PLUGIN_ID, version: builderManifest.version,
        deployment: "local", grants: ["storage:private"], project_id: projectId, requireGrant() {},
      }, builderManifest);
      const values = JSON.parse(await readFile(fixture.statePath, "utf8")) as Record<string, string>;
      for (const [key, value] of Object.entries(values)) storage.set(key, value);
      buildId = fixture.build.id;
      new AgentBuilderStore(storage).update(buildId, fixture.build.revision, build => { build.phase = "failed"; });
    } finally { store.close(); await fixture.workflow.close(); }
  } });
  if (!browser) return;
  const studio = await pluginFrameBrowser(t, browser, "plugin-builder"), { server, sessionId } = browser;
  const buildPath = "/api/plugin-builder/studio/builds/" + buildId;
  // End the real stream without closing the page. A page with a live stream deliberately keeps its authority.
  const streams = new Set<ServerResponse>(), previewRead = Promise.withResolvers<void>();
  server.prependListener("request", (req, res) => {
    if (req.method === "POST" && req.url?.endsWith(buildPath + "/call")) res.once("close", previewRead.resolve);
    if (req.method !== "GET" || !req.url?.endsWith(buildPath + "/events")) return;
    streams.add(res);
    res.once("close", () => streams.delete(res));
  });
  await pluginFrameInitScript(t, browser, `window.molisWorkbenchPluginFactories=new Proxy({}, {
    set(target,key,initialize) {
      target[key]=key==='plugin-builder' ? host => {
        const Source=globalThis.EventSource;
        globalThis.EventSource=class extends Source {
          constructor(...args){super(...args);window.studioStream=this;}
        };
        return initialize(host);
      } : initialize;
      return true;
    }
  });`);
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + "/projects/" + projectId + "/?openPlugin=plugin-builder" }, sessionId));
  const select = "document.querySelector('[data-as-builds]')";
  await studio.waitFor(`[...${select}.options].some(option => option.value === ${JSON.stringify(buildId)})`, 15_000);
  await studio.evaluate(`(() => { const select = ${select}; select.value = ${JSON.stringify(buildId)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await studio.waitFor("document.querySelector('[data-as-title]')?.textContent === 'Fixed notes'", 15_000);
  await studio.waitFor("window.studioStream?.readyState === 1", 15_000);
  const [stream] = streams;
  assert.equal(streams.size, 1, "one real event stream is open for the build");
  const closed = once(stream!, "close");
  await studio.evaluate("window.studioStream.close()");
  // The preview on this build also reads a component. Wait for it to return before counting idle time.
  await closed;
  await previewRead.promise;
  await studio.waitFor("window.__molisPluginPending === 0", 15_000);
  const first = Promise.withResolvers<number>(), retried = Promise.withResolvers<number>();
  let count = 0;
  const trail: string[] = [];
  server.prependListener("request", (req, res) => {
    if (!req.url?.includes("/api/plugin-builder/studio/")) return;
    trail.push(`${req.method} ${req.url?.split("/studio/")[1]?.replace(buildId, "draft")} (page: ${Boolean(req.headers["x-molis-plugin-page"])})`);
    if (req.method === "POST" && req.url?.endsWith(buildPath + "/action")) res.once("finish", () => (++count === 1 ? first : retried).resolve(res.statusCode));
  });
  const input = "document.querySelector('[data-as-input]')", words = "  保留这条修改意见  ";
  await studio.evaluate(`(() => { const field = ${input}; field.value = ${JSON.stringify(words)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const advance = Date.now() + 31 * 60_000, clock = t.mock.method(Date, "now", () => advance);
  try {
    await studio.click(".as-send");
    assert.equal(await first.promise, 403, trail.join("\n"));
    await studio.waitFor("/已过期/.test(document.querySelector('[data-as-feed]').innerText)", 12_000);
    assert.equal(await studio.evaluate(input + ".value"), words);
    await browser.reloadPage();
    await studio.waitFor(`${input}?.value === ${JSON.stringify(words)}`, 15_000);
    assert.equal(await studio.evaluate(select + ".value"), buildId);
    await studio.click(".as-send");
    assert.equal(await retried.promise, 200);
    await studio.waitFor(input + "?.value === ''", 10_000);
  } finally { clock.mock.restore(); }
});
