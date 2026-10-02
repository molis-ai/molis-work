import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createLocalWebAssets } from "../apps/local-host/src/web-assets.js";
import { currentLocale, runWithLocale } from "../apps/local-host/src/web-locale.js";

test("Workbench asset cache preserves locale, body, ETag and HEAD while avoiding repeated rendering", async t => {
  let generated = 0;
  const render = () => { generated++; return '/* ' + currentLocale() + ' */'; };
  const assets = createLocalWebAssets({ ptyClientFilePath: () => "unused", renderer: {
    renderMolisWorkWorkbenchStylesheet: render, renderMolisWorkWorkbenchClientScript: render,
    renderMolisWorkProjectIndexStylesheet: render, renderMolisWorkOnboardingStylesheet: render,
    renderMolisWorkSettingsStylesheet: render,
  } });
  const server = createServer((request, response) => runWithLocale(request.headers["accept-language"] === "en" ? "en" : "zh", () => {
    if (!assets.serveWorkbenchAsset(request, response, new URL(request.url!, "http://localhost").pathname)) {
      response.writeHead(404); response.end();
    }
  }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/assets/molis-work-workbench.js`;
  const first = await fetch(url);
  const etag = first.headers.get("etag")!;
  assert.equal(await first.text(), "/* zh */");
  assert.equal(first.headers.get("cache-control"), "private, max-age=0, must-revalidate");
  const cached = await fetch(url, { headers: { "if-none-match": etag } });
  assert.equal(cached.status, 304); assert.equal(await cached.text(), "");
  assert.equal(cached.headers.get("etag"), etag);
  const head = await fetch(url, { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(await head.text(), ""); assert.equal(head.headers.get("etag"), etag);
  assert.equal(generated, 1);
  const english = await fetch(url, { headers: { "accept-language": "en", "if-none-match": etag } });
  assert.equal(english.status, 200); assert.equal(await english.text(), "/* en */");
  assert.notEqual(english.headers.get("etag"), etag); assert.equal(generated, 2);
  assert.equal((await fetch(url)).headers.get("etag"), etag); assert.equal(generated, 2);
});
