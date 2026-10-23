import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { gzipSync, brotliCompressSync, deflateSync } from "node:zlib";
import { classifyMaterialSource, materialSourceEmbeddedJSON, materialXiaohongshuNoteID, parseMaterialXiaohongshu, parseMaterialXiaoyuzhouAudio, readMaterialSource, type MaterialSourceOptions } from "../apps/local-host/src/material-source-providers.js";
import { assertMaterialHostAllowed, fetchMaterialPublicBytes, isMaterialPublicAddress, materialRedirectTarget, readMaterialPublicBody, resolveMaterialPublicAddresses, validateMaterialPublicURL, type MaterialPublicResponse } from "../apps/local-host/src/material-source-reader.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { type UploadedMaterial } from "../apps/local-host/src/material-upload.js";
import { ADDRESSES_NEVER_PUBLIC, ADDRESSES_PUBLIC } from "./fixtures/public-address-policy.js";
const page = (url: string, body: string, type = "text/html"): MaterialPublicResponse => ({ data: Buffer.from(body), type, final_url: url, status: 200 });
const material = (text: string): UploadedMaterial => ({ text, file_name: "source.mp4", extractor: "test-extractor", pages: [{ number: 1, text, method: "test", confidence: null }], coverage: { status: "sufficient", processed_pages: 1, total_pages: 1, issues: [] } });
const noteHTML = (id: string, note: Record<string, unknown>) => `<script>window.__INITIAL_STATE__=${JSON.stringify({ note: { noteDetailMap: { [id]: { note } } } })};</script>`;

test("public source classifier uses exact domains and note paths without executing embedded JS", () => {
  assert.equal(classifyMaterialSource("https://www.bilibili.com/video/BVexample"), "bilibili"); assert.equal(classifyMaterialSource("https://b23.tv/abc"), "bilibili");
  assert.equal(classifyMaterialSource("https://www.xiaoyuzhoufm.com/episode/abc"), "xiaoyuzhou"); assert.equal(classifyMaterialSource("https://bilibili.com.evil.example/video/x"), "article");
  assert.equal(materialXiaohongshuNoteID("https://www.xiaohongshu.com/explore/abc_123?token=opaque"), "abc_123"); assert.equal(materialXiaohongshuNoteID("https://www.xiaohongshu.com/explore/abc/extra"), null); assert.equal(materialXiaohongshuNoteID("https://www.xiaohongshu.com/explore/%2fsecret"), null);
  assert.deepEqual(materialSourceEmbeddedJSON('<script>__INITIAL_STATE__={"text":"} undefined","missing":undefined}; evil();</script>', "__INITIAL_STATE__"), { text: "} undefined", missing: null });
  assert.equal(materialSourceEmbeddedJSON('<script>__INITIAL_STATE__={"x":(()=>{throw 1})()};</script>', "__INITIAL_STATE__"), null);
});
test("safe reader rejects credentialed, private, mapped IPv6 and reserved destinations before a network request", async () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "198.18.0.1", "192.0.2.1", "203.0.113.1", "::1", "::ffff:127.0.0.1", "2001:db8::1", "2002:7f00:1::"]) assert.equal(isMaterialPublicAddress(ip), false, ip);
  assert.equal(isMaterialPublicAddress("8.8.8.8"), true); assert.equal(isMaterialPublicAddress("2606:4700:4700::1111"), true);
  for (const url of ["file:///tmp/a", "https://user:secret@example.com", "http://127.0.0.1", "http://localhost", "http://host.local", "https://[::1]"]) assert.throws(() => validateMaterialPublicURL(url));
  // A refusal of the source reader is an ActionError under the platform's material name; the kind gives its status (a bad address is the caller's mistake, 400).
  for (const [url, code] of [["file:///tmp/a", "material.source.invalid_url"], ["http://localhost", "material.source.private_address"]] as const) {
    assert.throws(() => validateMaterialPublicURL(url), (error: unknown) => error instanceof ActionError && error.code === code && actionHttpStatus(error) === 400, url);
  }
  await assert.rejects(fetchMaterialPublicBytes("http://169.254.169.254/latest/meta-data"));
});
test("known proxy synthetic answers resolve through trusted DNS while private and mixed answers stay blocked", async () => {
  const publicAddress = { address: "8.8.8.8", family: 4 }; let calls = 0;
  const trustedDNS = async (hostname: string) => { assert.equal(hostname, "public.example"); calls++; return [publicAddress]; };
  assert.deepEqual(await resolveMaterialPublicAddresses("public.example", undefined, { lookup: async () => [{ address: "198.18.0.58", family: 4 }, { address: "fdfe:dcba:9876::3d", family: 6 }], trustedDNS }), [publicAddress]);
  assert.equal(calls, 1);
  for (const values of [["127.0.0.1"], ["10.0.0.1"], ["fdfe:1234::1"], ["198.18.0.58", "10.0.0.1"], ["198.18.0.58", "8.8.8.8"]]) await assert.rejects(resolveMaterialPublicAddresses("public.example", undefined, { lookup: async () => values.map(address => ({ address, family: address.includes(":") ? 6 : 4 })), trustedDNS }));
  assert.equal(calls, 1);
  await assert.rejects(resolveMaterialPublicAddresses("public.example", undefined, { lookup: async () => [{ address: "198.19.0.58", family: 4 }], trustedDNS: async () => [{ address: "10.0.0.1", family: 4 }] }), /内网地址/);
  await assert.rejects(resolveMaterialPublicAddresses("public.example", undefined, { lookup: async () => [{ address: "198.19.0.58", family: 4 }], trustedDNS: async () => [] }), /内网地址/);
  assert.deepEqual(await resolveMaterialPublicAddresses("public.example", undefined, { lookup: async () => [publicAddress], trustedDNS }), [publicAddress]); assert.equal(calls, 1);
});
test("public compressed bodies enforce both decoded and wire size without evaluating content", async () => {
  const text = Buffer.from("公开正文内容".repeat(30));
  for (const [encoding, compress] of [["gzip", gzipSync], ["br", brotliCompressSync], ["deflate", deflateSync]] as const) assert.deepEqual(await readMaterialPublicBody(Readable.from([compress(text)]), encoding, 4096), text);
  await assert.rejects(readMaterialPublicBody(Readable.from([gzipSync(Buffer.from("a".repeat(100000)))]), "gzip", 1024), /解压后超过/);
  await assert.rejects(readMaterialPublicBody(Readable.from([Buffer.alloc(2048)]), "identity", 1024), /超过读取限制/);
  await assert.rejects(readMaterialPublicBody(Readable.from([Buffer.from("not-gzip")]), "gzip", 1024), /解压失败/);
  await assert.rejects(readMaterialPublicBody(Readable.from([text]), "unknown", 4096), /不支持/);
});
test("Bilibili qualified Chinese subtitles retain timestamps without a model download", async () => {
  const url = "https://www.bilibili.com/video/BVexample"; const seen: string[] = [];
  const options: MaterialSourceOptions = {
    async fetch(target, options) {
      seen.push(target); assert.ok(options?.maxBytes && options.maxBytes <= 4_000_000);
      if (target === url) return page(url, '<script>__INITIAL_STATE__={"videoData":{"bvid":"BVexample","cid":123,"title":"视频标题"}}</script>');
      if (target.includes("/x/player/v2?")) return page(target, JSON.stringify({ code: 0, data: { subtitle: { subtitles: [{ lan: "en", subtitle_url: "https://cdn.example/english" }, { lan: "zh-Hans", subtitle_url: "//cdn.example/chinese" }] } } }), "application/json");
      if (target.endsWith("chinese")) return page(target, JSON.stringify({ body: Array.from({ length: 30 }, (_, i) => ({ from: i, to: i + 1, content: `这是第${i}段真实公开中文字幕内容` })) }), "application/json");
      throw new Error("unexpected fetch");
    },
    async extractMaterial() { assert.fail("qualified public subtitles must not invoke audio model"); }
  };
  const result = await readMaterialSource("/unused", url, options); assert.equal(result.provider, "bilibili"); assert.equal(result.segments?.length, 30); assert.equal(result.coverage.status, "sufficient"); assert.equal(result.title, "视频标题"); assert.ok(!seen.some(target => target.endsWith("english")));
});
test("Bilibili insufficient subtitles fall back to public DASH audio with explicit model choice preserved", async () => {
  const url = "https://www.bilibili.com/video/BVexample";
  await assert.rejects(readMaterialSource("/unused", url, {
    async fetch(target) {
      if (target === url) return page(url, '<script>__INITIAL_STATE__={"videoData":{"bvid":"BVexample","cid":123}}</script>');
      if (target.includes("/x/player/v2?")) return page(target, JSON.stringify({ code: 0, data: { subtitle: { subtitles: [] } } }), "application/json");
      if (target.includes("/x/player/playurl?")) return page(target, JSON.stringify({ code: 0, data: { dash: { audio: [{ baseUrl: "https://cdn.example/audio" }] } } }), "application/json");
      return page(target, "binary-audio", "audio/mp4");
    },
    async extractMaterial(_home, upload) { assert.equal(upload.allow_model_download, false); assert.equal(upload.file_name, "来源素材.m4a"); throw new ActionError("material.model_required", "explicit choice required", { kind: "conflict", details: { approximate_bytes: 626000000 } }); }
  }), (error: unknown) => error instanceof ActionError && error.code === "material.model_required" && actionHttpStatus(error) === 409 && error.details?.approximate_bytes === 626000000);
});
test("Xiaoyuzhou resolves public OG, JSON-LD and Next enclosure audio", async () => {
  assert.equal(parseMaterialXiaoyuzhouAudio('<meta content="https://cdn.example/a.mp3?x=1&amp;y=2" property="og:audio">'), "https://cdn.example/a.mp3?x=1&y=2");
  assert.equal(parseMaterialXiaoyuzhouAudio('<script type="application/ld+json">{"@type":"PodcastEpisode","audio":{"contentUrl":"https://cdn.example/a.mp3"}}</script>'), "https://cdn.example/a.mp3");
  assert.equal(parseMaterialXiaoyuzhouAudio('<script id="__NEXT_DATA__" type="application/json">{"props":{"enclosure":{"url":"https://cdn.example/a.m4a"}}}</script>'), "https://cdn.example/a.m4a");
  let extracted = false;
  const result = await readMaterialSource("/unused", "https://www.xiaoyuzhoufm.com/episode/abc", { allow_model_download: true, async fetch(target) { return target.includes("/episode/") ? page(target, '<meta property="og:audio" content="https://cdn.example/a.mp3"><meta property="og:title" content="节目标题">') : page(target, "audio", "audio/mpeg"); }, async extractMaterial(_home, upload) { assert.equal(upload.allow_model_download, true); extracted = true; return material("带来源的转写"); } });
  assert.equal(extracted, true); assert.equal(result.title, "节目标题"); assert.equal(result.source_url, "https://www.xiaoyuzhoufm.com/episode/abc");
});
test("Xiaohongshu exact note identity, source text and bounded images are preserved", async () => {
  const id = "abc123"; const url = `https://www.xiaohongshu.com/explore/${id}?xsec_token=private-query`;
  const html = noteHTML(id, { noteId: id, title: "标题", desc: "原始正文内容", tagList: [{ name: "实践" }], imageList: [{ urlDefault: "https://cdn.example/image.png" }] });
  const parsed = parseMaterialXiaohongshu(html, id); assert.equal(parsed.body, "原始正文内容");
  const result = await readMaterialSource("/unused", url, { async fetch(target, options) { if (target === url) return page(url, html); assert.equal(options?.headers?.referer, `https://www.xiaohongshu.com/explore/${id}`); assert.ok(options!.maxBytes! <= 25 * 1024 * 1024); return page(target, "image", "image/png"); }, async extractMaterial() { return material("图片上的文字"); } });
  assert.match(result.text, /原始正文内容/); assert.match(result.text, /图片上的文字/); assert.equal(result.pages?.[0]?.number, 1); assert.equal(result.coverage.status, "partial"); assert.equal(result.source_url, url);
  assert.throws(() => parseMaterialXiaohongshu(html, "different"), /不一致/);
});
test("restricted and redirected-to-other-note XHS pages stay explicit failures", async () => {
  const url = "https://www.xiaohongshu.com/explore/abc";
  await assert.rejects(readMaterialSource("/unused", url, { async fetch() { return page(url, "请登录后完成验证码"); } }), /公开页没有可读/);
  await assert.rejects(readMaterialSource("/unused", url, { async fetch() { return page("https://www.xiaohongshu.com/explore/other", noteHTML("other", { noteId: "other", desc: "别人的内容" })); } }), /ID 不一致/);
  await assert.rejects(readMaterialSource("/unused", url, { async fetch() { return page(url, noteHTML("abc", { noteId: "abc", title: "只有标题", tags: ["只有标签"] })); } }), /只有标题或元数据/);
});
test("XHS video without an enabled speech model returns original body and an explicit model requirement", async () => {
  const url = "https://www.xiaohongshu.com/explore/abc";
  const result = await readMaterialSource("/unused", url, { async fetch(target) { return target === url ? page(url, noteHTML("abc", { noteId: "abc", title: "视频", desc: "视频原作者的正文", type: "video", video: { masterUrl: "https://cdn.example/video.mp4" } })) : page(target, "video", "video/mp4"); }, async extractMaterial(_home, upload) { assert.equal(upload.allow_model_download, false); throw new ActionError("material.model_required", "download choice", { kind: "conflict", details: { approximate_bytes: 626000000, variant: "large-v3" } }); } });
  assert.match(result.text, /原作者的正文/); assert.equal(result.model_required?.approximate_bytes, 626000000); assert.equal(result.coverage.status, "partial"); assert.match(result.coverage.issues.join(" "), /等待明确下载/);
});
test("generic public articles retain readable body while omitting executable/page-navigation content", async () => {
  const result = await readMaterialSource("/unused", "https://example.com/article", { async fetch(target) { return page(target, `<title>示例&amp;文章</title><nav>导航</nav><article><script>secret()</script><p>${"真实公开文章内容。".repeat(8)}</p></article>`); } });
  assert.equal(result.title, "示例&文章"); assert.doesNotMatch(result.text, /secret|导航/); assert.equal(result.coverage.status, "partial");
});
test("cancelled source never starts fetching", async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(readMaterialSource("/unused", "https://example.com", { signal: controller.signal, async fetch() { calls++; throw new Error("should not fetch"); } })); assert.equal(calls, 0);
});

test("RAC-27 source authority is checked before the first fetch, every later fetch and trusted DNS fallback", async () => {
  const refusal = new ActionError("actions.forbidden", "authority withdrawn"); let fetches = 0;
  const beforeEffect = () => { throw refusal; };
  await assert.rejects(readMaterialSource("/unused", "https://example.com", { beforeEffect,
    async fetch() { fetches++; throw new Error("must not fetch"); } }), error => error === refusal);
  assert.equal(fetches, 0);
  const url = "https://www.xiaoyuzhoufm.com/episode/abc";
  await assert.rejects(readMaterialSource("/unused", url, { beforeEffect() { if (fetches) throw refusal; },
    async fetch(target) { fetches++; return page(target, '<meta property="og:audio" content="https://cdn.example/audio.mp3">'); },
    async extractMaterial() { assert.fail("withdrawn source cannot reach extraction"); } }), error => error === refusal);
  assert.equal(fetches, 1, "no media fetch after the first page withdrew authority");
  let active = true, fallbacks = 0;
  await assert.rejects(resolveMaterialPublicAddresses("public.example", undefined, {
    async lookup() { active = false; return [{ address: "198.18.0.58", family: 4 }]; },
    async trustedDNS() { fallbacks++; return [{ address: "8.8.8.8", family: 4 }]; },
  }, () => { if (!active) throw refusal; }), error => error === refusal);
  assert.equal(fallbacks, 0, "no trusted DNS network request after lookup withdrew authority");
});

// Security invariant S-10 (docs/system/SECURITY-INVARIANTS.md): the same table every address policy is held to.
test("the reader's address policy refuses every address of the shared table that is not public", () => {
  for (const address of ADDRESSES_NEVER_PUBLIC) assert.equal(isMaterialPublicAddress(address), false, address);
  for (const address of ADDRESSES_PUBLIC) assert.equal(isMaterialPublicAddress(address), true, address);
});

// BL-492 (specs/repository-anti-corruption/slices/pg017-sandbox-services.md §3.4): the material reader can be held to a list of exact host
// names, so a caller that approved a few domains (a sandboxed plugin, over its broker) gets no page, redirect, API or media file from another
// host. The list is checked before a host is looked up or contacted, on every request the reader makes.
const refusal = (expected: string) => (error: unknown) => (error as { code?: string } | undefined)?.code === expected;
const NOT_ALLOWED = "material.source.domain_not_allowed";
const host = (value: string) => new URL(value);

test("BL-492 a host outside the allowed list is refused, by exact name, and without a list every public host is allowed", () => {
  const allowed = ["docs.example.com", "example.org"];
  assert.doesNotThrow(() => assertMaterialHostAllowed(host("https://docs.example.com/a?b=1"), allowed));
  assert.doesNotThrow(() => assertMaterialHostAllowed(host("https://DOCS.example.com:443/a"), allowed), "a host name is compared as the URL parser lowercases it");
  for (const other of ["https://example.com/", "https://www.example.org/", "https://docs.example.com.evil.example/", "https://evil.example/docs.example.com", "https://user.docs.example.com/"]) {
    assert.throws(() => assertMaterialHostAllowed(host(other), allowed), refusal(NOT_ALLOWED), other);
  }
  assert.throws(() => assertMaterialHostAllowed(host("https://docs.example.com/"), []), refusal(NOT_ALLOWED), "an empty list allows nothing");
  assert.doesNotThrow(() => assertMaterialHostAllowed(host("https://anything.example/"), undefined));
});

test("BL-492 the first request is refused before any lookup or request, and a redirect off the list is refused the same way", async () => {
  // A host that would resolve and answer if asked: the refusal is the reader's own, before it asks anyone.
  await assert.rejects(fetchMaterialPublicBytes("https://example.com/", { allowedHosts: ["docs.example.com"] }), refusal(NOT_ALLOWED));
  const from = host("https://docs.example.com/start");
  assert.equal(materialRedirectTarget(from, "/next?page=2", ["docs.example.com"]), "https://docs.example.com/next?page=2");
  assert.equal(materialRedirectTarget(from, "https://example.org/", ["docs.example.com", "example.org"]), "https://example.org/");
  assert.equal(materialRedirectTarget(from, "https://evil.example/", undefined), "https://evil.example/", "no list, no restriction");
  for (const location of ["https://evil.example/", "//evil.example/x", "https://docs.example.com.evil.example/", "https://example.com/"]) {
    assert.throws(() => materialRedirectTarget(from, location, ["docs.example.com"]), refusal(NOT_ALLOWED), location);
  }
  assert.throws(() => materialRedirectTarget(from, undefined, ["docs.example.com"]), refusal("material.source.redirect_invalid"));
  assert.throws(() => materialRedirectTarget(from, "http://[bad", ["docs.example.com"]), refusal("material.source.redirect_invalid"));
});

test("BL-492 every request a source's reader makes carries the list: its page, the API it follows to and the media it downloads", async () => {
  const url = "https://www.bilibili.com/video/BVexample"; const seen: string[] = [];
  const state = '<script>__INITIAL_STATE__={"videoData":{"bvid":"BVexample","cid":123,"title":"视频标题"}}</script>';
  const options = (allowedHosts: readonly string[]): MaterialSourceOptions => ({
    allowed_hosts: allowedHosts,
    async fetch(target, request) {
      // The reader hands its fetcher the list on every call; the fetcher is the real check, applied to what it was handed.
      assert.deepEqual(request?.allowedHosts, allowedHosts);
      assertMaterialHostAllowed(host(target), request?.allowedHosts);
      seen.push(target);
      if (target === url) return page(url, state);
      if (target.includes("/x/player/v2?")) return page(target, JSON.stringify({ code: 0, data: { subtitle: { subtitles: [{ lan: "zh-Hans", subtitle_url: "https://cdn.example/chinese" }] } } }), "application/json");
      if (target.endsWith("chinese")) return page(target, JSON.stringify({ body: Array.from({ length: 30 }, (_, i) => ({ from: i, to: i + 1, content: `这是第${i}段真实公开中文字幕内容` })) }), "application/json");
      throw new Error("unexpected fetch");
    },
    async extractMaterial() { assert.fail("subtitles are enough"); },
  });
  // Only the page's host is allowed: the page is read, the API on another host is refused, and nothing after it is requested.
  await assert.rejects(readMaterialSource("/unused", url, options(["www.bilibili.com"])), refusal(NOT_ALLOWED));
  assert.deepEqual(seen, [url]);
  // Every host the read follows to, allowed: it reads.
  seen.length = 0;
  const read = await readMaterialSource("/unused", url, options(["www.bilibili.com", "api.bilibili.com", "cdn.example"]));
  assert.equal(read.provider, "bilibili");
  assert.equal(seen.length, 3);
  // A plain article on an allowed host reads; the same article on another host is refused before its fetch.
  const article = (allowedHosts: readonly string[]) => readMaterialSource("/unused", "https://example.com/post", { allowed_hosts: allowedHosts, async fetch(target, request) {
    assertMaterialHostAllowed(host(target), request?.allowedHosts); return page(target, `<article><p>${"真实公开文章内容。".repeat(8)}</p></article>`);
  } });
  assert.equal((await article(["example.com"])).provider, "article");
  await assert.rejects(article(["docs.example.com"]), refusal(NOT_ALLOWED));
});
