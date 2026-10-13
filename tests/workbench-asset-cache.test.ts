import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createLocalWebAssets } from "../apps/local-host/dist/web-assets.js";
import { currentLocale, runWithLocale } from "@molis-ai/molis-work-app-local-host";

test("W2-18-ASSET-JS-02: Workbench asset cache preserves locale, body, ETag and HEAD while avoiding repeated rendering", async t => {
  let generated = 0;
  // Comments and line-leading space are notes and are not sent on the shared workbench script. The locale has to live in the program itself.
  const render = () => { generated++; return "/* locale */\nconst locale = " + JSON.stringify(currentLocale()) + ";"; };
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
  const firstBody = await first.text();
  assert.equal(new Function(firstBody + "\nreturn locale;")(), "zh");
  assert.doesNotMatch(firstBody, /locale \*\//);
  assert.equal(first.headers.get("cache-control"), "private, max-age=0, must-revalidate");
  const cached = await fetch(url, { headers: { "if-none-match": etag } });
  assert.equal(cached.status, 304); assert.equal(await cached.text(), "");
  assert.equal(cached.headers.get("etag"), etag);
  const head = await fetch(url, { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(await head.text(), ""); assert.equal(head.headers.get("etag"), etag);
  assert.equal(generated, 1);
  const english = await fetch(url, { headers: { "accept-language": "en", "if-none-match": etag } });
  assert.equal(english.status, 200);
  const englishBody = await english.text();
  assert.equal(new Function(englishBody + "\nreturn locale;")(), "en");
  assert.notEqual(englishBody, firstBody);
  assert.notEqual(english.headers.get("etag"), etag); assert.equal(generated, 2);
  assert.equal((await fetch(url)).headers.get("etag"), etag); assert.equal(generated, 2);
});

test("W2-18-ASSET-JS-01 / RAC-19: served JavaScript compacts trivia while preserving literals and automatic semicolon boundaries", async t => {
  const source = [
    '    const text = "    // literal";',
    '    const template = String.raw`line\n    // template`;',
    '    const interpolated = `head ${1}\n  literal`;',
    '    const nested = `outer ${`inner ${2}\n   kept`}\n  tail`;',
    '    function blockReturned() { return /*\n*/ 1; }',
    '    const regex = /\\/\\/literal/u;',
    '    // an actual source comment',
    '    function returned() { return\n        { wrong: true }; }',
    '    let first = 1, second = 2;',
    '    first\n        ++second;',
    '    const result = { text, template, interpolated, nested, block: blockReturned(), regex: regex.test("//literal"), returned: returned(), first, second };',
  ].join("\n");
  const render = () => source;
  const assets = createLocalWebAssets({ ptyClientFilePath: () => "unused", renderer: {
    renderMolisWorkWorkbenchStylesheet: render, renderMolisWorkWorkbenchClientScript: render,
    renderMolisWorkProjectIndexStylesheet: render, renderMolisWorkOnboardingStylesheet: render,
    renderMolisWorkSettingsStylesheet: render,
  } });
  const server = createServer((request, response) => {
    assets.serveWorkbenchAsset(request, response, "/assets/molis-work-workbench.js");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const served = await (await fetch(`http://127.0.0.1:${address.port}/assets/molis-work-workbench.js`)).text();
  assert.doesNotMatch(served, /an actual source comment/);
  assert.ok(Buffer.byteLength(served) < Buffer.byteLength(source));
  assert.deepEqual(new Function(served + "\nreturn result;")(), {
    text: "    // literal", template: "line\n    // template", interpolated: "head 1\n  literal", nested: "outer inner 2\n   kept\n  tail", block: undefined, regex: true, returned: undefined, first: 1, second: 3,
  });
});
