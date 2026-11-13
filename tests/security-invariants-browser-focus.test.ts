import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { BrowserHost, createBrowserSurfaceDriver } from "@molis-ai/molis-work-app-local-host";
import { locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import type { HostSurfaceContext } from "@molis-ai/molis-work-contracts/services/ui-surfaces";

test("APR-13: production browser focus reads the open shadow chain and refuses unverifiable frame or closed shadow input", { timeout: 45_000 }, async t => {
  const chrome = locateTestChrome(); assert.ok(chrome, "a dedicated test browser is required");
  const home = await mkdtemp(join(tmpdir(), "surface-focus-"));
  const server = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html" }); response.end("<!doctype html><title>Focus fixture</title><body></body>"); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const host = new BrowserHost({ homeDirectory: home, locate: () => ({ path: chrome, name: basename(chrome) }) });
  const page = host.page("fixture"), surface = createBrowserSurfaceDriver(page);
  t.after(async () => { await surface.close(); await host.close(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); });
  const context: HostSurfaceContext = { session_id: "focus", assertCurrent() {}, beforeEffect() {} };
  await page.navigate(`http://127.0.0.1:${address.port}/`);
  for (let attempt = 0; ; attempt++) {
    if (page.snapshot().title === "Focus fixture" && !page.snapshot().loading) break;
    assert.ok(attempt < 100); await new Promise(resolve => setTimeout(resolve, 20));
  }
  for (const mode of ["open-password", "open-otp", "closed", "editable-closed", "frame", "tampered"]) {
    await page.evaluate(`(async () => {
      document.body.replaceChildren();
      if (${JSON.stringify(mode)} === 'tampered') {
        const field = document.createElement('input'); field.type = 'password'; document.body.append(field); field.focus(); window.fixtureField = field;
        Object.defineProperty(HTMLInputElement.prototype, 'type', { get() { return 'text'; }, configurable: true });
        Element.prototype.getAttribute = () => ''; return;
      }
      if (${JSON.stringify(mode)} === 'frame') {
        const frame = document.createElement('iframe'); frame.srcdoc = '<input id="field" type="password">';
        const loaded = new Promise(resolve => frame.onload = resolve); document.body.append(frame); await loaded;
        frame.contentDocument.querySelector('input').focus(); return;
      }
      const host = document.createElement('div'); if (${JSON.stringify(mode)} === 'editable-closed') host.contentEditable = 'true'; document.body.append(host);
      const root = host.attachShadow({ mode: ${JSON.stringify(mode.includes("closed") ? "closed" : "open")} });
      const field = document.createElement('input'); field.id = 'field'; field.type = ${JSON.stringify(mode === "open-otp" ? "text" : "password")};
      field.autocomplete = ${JSON.stringify(mode === "open-otp" ? "one-time-code" : "current-password")};
      root.append(field); field.focus(); window.fixtureField = field;
    })()`);
    if (mode.startsWith("open") || mode === "tampered") assert.equal((await surface.focusedField!(context)).sensitive, true);
    else await assert.rejects(surface.focusedField!(context), /无法核对/u);
    for (const action of [{ what: "text", text: "must not type" }, { what: "key", keys: ["x"] }, { what: "key", keys: ["Control", "v"] }] as const) {
      await assert.rejects(surface.perform(action, context), /输入框|无法核对/u);
    }
    assert.equal(await page.evaluate(mode === "frame" ? "document.querySelector('iframe').contentDocument.querySelector('input').value" : "window.fixtureField.value"), "");
  }
  await page.evaluate("document.body.innerHTML = '<input id=plain aria-label=Name>'; document.getElementById('plain').focus()");
  assert.deepEqual(await surface.focusedField!(context), { label: "Name", sensitive: false });
  await surface.perform({ what: "text", text: "permitted text" }, context);
  assert.equal(await page.evaluate("document.getElementById('plain').value"), "permitted text");
});
