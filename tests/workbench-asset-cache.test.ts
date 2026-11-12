import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, get, type IncomingMessage, type RequestOptions } from "node:http";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { constants, gunzipSync, gzipSync } from "node:zlib";
import { renderWorkbenchDocument, workbenchLanguageResource } from "@molis-ai/molis-work-app-workbench";
import { createLocalWebAssets } from "../apps/local-host/dist/web-assets.js";
import { currentLocale, runWithLocale } from "@molis-ai/molis-work-app-local-host";

test("W2-18-ASSET-JS-02: Workbench asset cache preserves locale, body, ETag and HEAD while avoiding repeated rendering", async t => {
  let generated = 0;
  // RING-06: comments are notes and are not sent on the shared workbench script. The locale has to live in the program itself.
  const render = () => { generated++; return "/* " + currentLocale() + " */\nglobalThis.assetLocale = " + JSON.stringify(currentLocale()) + ";"; };
  const assets = createLocalWebAssets({ ptyClientFilePath: () => "unused", renderer: {
    renderMolisWorkWorkbenchStylesheet: render, renderMolisWorkWorkbenchClientScript: render,
    renderMolisWorkArrivalStylesheet: render,
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
  const first = await fetch(url, { headers: { "accept-encoding": "gzip" } });
  const etag = first.headers.get("etag")!;
  const body = await first.text(), globals: { assetLocale?: string } = {};
  runInNewContext(body, globals);assert.equal(globals.assetLocale, "zh");
  assert.doesNotMatch(body, /\/\* zh \*\//);
  assert.equal(first.headers.get("cache-control"), "private, max-age=0, must-revalidate");
  assert.equal(first.headers.get("content-encoding"), null);
  assert.equal(first.headers.get("vary"), null);
  const cached = await fetch(url, { headers: { "if-none-match": etag } });
  assert.equal(cached.status, 304); assert.equal(await cached.text(), "");
  assert.equal(cached.headers.get("etag"), etag);
  const head = await fetch(url, { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(await head.text(), ""); assert.equal(head.headers.get("etag"), etag);
  assert.equal(generated, 1);
  const english = await fetch(url, { headers: { "accept-language": "en", "if-none-match": etag } });
  assert.equal(english.status, 200); const englishBody = await english.text(); runInNewContext(englishBody, globals); assert.equal(globals.assetLocale, "en");
  assert.notEqual(englishBody, body);
  assert.notEqual(english.headers.get("etag"), etag); assert.equal(generated, 2);
  assert.equal((await fetch(url)).headers.get("etag"), etag); assert.equal(generated, 2);
});

test("FSS-20 FSS-34 FSS-35: Workbench language assets negotiate gzip and revalidate the selected representation", async t => {
  const unexpected = () => assert.fail("a language asset never renders another Workbench asset");
  const assets = createLocalWebAssets({ ptyClientFilePath: unexpected, renderer: {
    renderMolisWorkWorkbenchStylesheet: unexpected, renderMolisWorkWorkbenchClientScript: unexpected,
    renderMolisWorkArrivalStylesheet: unexpected, renderMolisWorkSettingsStylesheet: unexpected,
  } });
  const server = createServer((request, response) => {
    if (!assets.serveWorkbenchAsset(request, response, request.url!)) { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const read = async (href: string, options: RequestOptions = {}) => {
    const reply = await new Promise<IncomingMessage>((resolve, reject) => { get(origin + href, options, resolve).once("error", reject); });
    const chunks: Buffer[] = [];
    for await (const chunk of reply) chunks.push(chunk);
    return { status: reply.statusCode, headers: reply.headers, body: Buffer.concat(chunks) };
  };

  for (const lang of ["zh", "en"]) {
    const page = renderWorkbenchDocument({ lang, title: "Probe", body_html: "" });
    const href = page.match(/data-ui-language-resource[^>]*src="([^"]+)"/u)?.[1];
    assert.ok(href);
    const asset = workbenchLanguageResource(href); assert.ok(asset);
    const identity = await read(href);
    const gzip = await read(href, { headers: { "accept-encoding": "br, GZip" } });
    assert.equal(gzip.headers["content-encoding"], "gzip", lang);
    assert.equal(identity.headers["content-encoding"], undefined, lang);
    assert.equal(identity.headers.etag, asset.etag, lang);
    assert.deepEqual(identity.body, Buffer.from(asset.body), lang);
    assert.deepEqual(gunzipSync(gzip.body), identity.body, lang);
    assert.deepEqual(gzip.body, gzipSync(identity.body, { level: constants.Z_BEST_SPEED }), lang);
    assert.equal(gzip.headers.etag, `"${createHash("sha256").update(gzip.body).digest("base64url")}"`, lang);
    assert.notEqual(gzip.headers.etag, identity.headers.etag, lang);

    for (const [encoding, variant, other] of [["identity", identity, gzip], ["gzip", gzip, identity]] as const) {
      const headers = { "accept-encoding": encoding };
      assert.equal(variant.status, 200, encoding);
      assert.equal(variant.headers.vary, "Accept-Encoding", encoding);
      assert.equal(variant.headers["cache-control"], "private, max-age=31536000, immutable", encoding);
      assert.equal(variant.headers["content-length"], String(variant.body.length), encoding);
      const head = await read(href, { method: "HEAD", headers });
      assert.equal(head.status, 200, encoding); assert.equal(head.body.length, 0, encoding);
      for (const name of ["etag", "vary", "content-type", "content-encoding", "content-length", "cache-control"]) {
        assert.equal(head.headers[name], variant.headers[name], `${encoding} HEAD ${name}`);
      }
      for (const method of ["GET", "HEAD"]) {
        const hit = await read(href, { method, headers: { ...headers, "if-none-match": variant.headers.etag } });
        assert.deepEqual([hit.status, hit.headers.etag, hit.headers.vary, hit.headers["cache-control"], hit.body.length],
          [304, variant.headers.etag, "Accept-Encoding", variant.headers["cache-control"], 0], `${encoding} ${method}`);
      }
      const miss = await read(href, { headers: { ...headers, "if-none-match": other.headers.etag } });
      assert.equal(miss.status, 200, encoding);
      assert.equal(miss.headers.etag, variant.headers.etag, encoding);
      assert.deepEqual(miss.body, variant.body, encoding);
    }

    for (const [accept, encoding] of [
      ["", "identity"], ["br", "identity"], ["gzip;q=0.6", "gzip"], ["*;q=0.5", "gzip"],
      ["gzip;q=0.3, identity;q=0.7", "identity"], ["gzip;q=0.7, identity;q=0.3", "gzip"],
      ["gzip;q=0, *;q=1", "identity"], ["gzip;q=0, gzip", "identity"], ["*;q=0, GZIP; Q=0.700", "gzip"],
      ["*;q=0, identity;q=0.5", "identity"], ["gzip;q=1.1", "identity"], ["gzip;q=0.1234", "identity"],
      ["gzip;q=0, identity;q=0", null], ["*;q=0", null], ["gzip;q=broken, identity;q=0", null],
    ] as const) {
      const selected = await read(href, { method: encoding === null ? "GET" : "HEAD", headers: { "accept-encoding": accept } });
      assert.deepEqual([selected.status, selected.headers["content-encoding"], selected.headers.vary, selected.body.length],
        [encoding === null ? 406 : 200, encoding === "gzip" ? "gzip" : undefined, "Accept-Encoding", 0], accept);
    }
  }
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
