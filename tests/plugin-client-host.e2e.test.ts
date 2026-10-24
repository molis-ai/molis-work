import assert from "node:assert/strict";
import test from "node:test";
import { todoManifest } from "@molis-ai/molis-work-plugin-todo";
import { formManifest } from "@molis-ai/molis-work-plugin-form";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

test("RAC-132 opaque factories receive Manifest routes and Todo/Form requests follow injected prefixes", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const observed: string[] = [];
  browser.server.prependListener("request", request => { observed.push(request.url ?? ""); });
  await pluginFrameInitScript(t, browser, `globalThis.molisWorkbenchPluginFactories = new Proxy({}, {
    set(target, key, factory) {
      target[key] = host => {
        window.clientHost = host; window.clientRequests = []; window.clientRequestsDone = 0;
        const request = globalThis.molisWorkRequest;
        globalThis.molisWorkRequest = Object.assign((url, init) => {
          window.clientRequests.push(url);
          return request(url, init).finally(() => { window.clientRequestsDone++; });
        }, request);
        return factory({...host, pluginRoute: path => host.pluginRoute('/probe-' + (host.projectId() ? 'project' : 'home') + path)});
      };
      return true;
    }
  });`);
  for (const scene of [
    { plugin: "todo", manifest: todoManifest, prefix: "", page: "/plugins/todo", firstPath: "/items" },
    { plugin: "todo", manifest: todoManifest, prefix: `/projects/${browser.projectId}`, page: `/projects/${browser.projectId}/?openPlugin=todo`, firstPath: "/items" },
    { plugin: "form", manifest: formManifest, prefix: `/projects/${browser.projectId}`, page: `/projects/${browser.projectId}/?openPlugin=form`, firstPath: "/forms" },
  ]) {
    const child = await pluginFrameBrowser(t, browser, scene.plugin);
    await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + scene.page }, browser.sessionId));
    await child.waitFor("window.clientHost && window.clientRequestsDone > 0");
    const paths = await child.evaluate<{ pluginId: string; projectId: string; plugin: string; platform: string; requests: string[] }>(`({
      pluginId: clientHost.pluginId, projectId: clientHost.projectId(), plugin: clientHost.pluginRoute('/probe'),
      platform: clientHost.route('/api/host/plugin-page-actions'), requests: clientRequests
    })`);
    assert.equal(paths.pluginId, scene.manifest.plugin_id);
    assert.equal(paths.projectId, scene.prefix ? browser.projectId : "");
    const pluginPrefix = scene.prefix + "/api/plugins/" + scene.manifest.plugin_id;
    assert.equal(paths.plugin, pluginPrefix + "/probe");
    assert.equal(paths.platform, scene.prefix + "/api/host/plugin-page-actions");
    const requested = pluginPrefix + "/probe-" + (scene.prefix ? "project" : "home") + scene.firstPath;
    assert.ok(paths.requests.some(path => new URL(path, browser.origin).pathname === requested), JSON.stringify(paths));
    assert.ok(observed.some(path => new URL(path, browser.origin).pathname === requested), "the actual request reaches the server with the injected plugin prefix");
    assert.equal(await child.evaluate(`(async () => {
      const pending = molisWorkRequest(clientHost.pluginRoute(${JSON.stringify(scene.firstPath)}), {scope: clientHost.scope});
      clientHost.scope.dispose();
      try { await pending; return 'completed'; } catch (error) { return error.name; }
    })()`), "AbortError", "the shared lifetime still cancels its in-flight request");
  }
});
