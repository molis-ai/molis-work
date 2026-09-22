import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { gzipSync, brotliCompressSync, deflateSync } from "node:zlib";
import { classifyJellySource, jellySourceEmbeddedJSON, jellyXiaohongshuNoteID, parseJellyXiaohongshu, parseJellyXiaoyuzhouAudio, readJellyMaterialSource, type JellySourceOptions } from "../apps/local-host/src/jelly-source-providers.js";
import { fetchJellyPublicBytes, isJellyPublicAddress, readJellyPublicBody, resolveJellyPublicAddresses, validateJellyPublicURL, type JellyPublicResponse } from "../apps/local-host/src/jelly-source-reader.js";
import { JellyMaterialError, type JellyMaterialExtraction } from "../apps/local-host/src/jelly-native-material.js";
const page = (url: string, body: string, type = "text/html"): JellyPublicResponse => ({ data: Buffer.from(body), type, final_url: url, status: 200 });
const material = (text: string): JellyMaterialExtraction => ({ text, file_name: "source.mp4", source_sha256: "a".repeat(64), extractor: "test-extractor", pages: [{ number: 1, text, method: "test", confidence: null }], coverage: { status: "sufficient", processed_pages: 1, total_pages: 1, issues: [] } });
const noteHTML = (id: string, note: Record<string, unknown>) => `<script>window.__INITIAL_STATE__=${JSON.stringify({ note: { noteDetailMap: { [id]: { note } } } })};</script>`;

test("public source classifier uses exact domains and note paths without executing embedded JS", () => {
  assert.equal(classifyJellySource("https://www.bilibili.com/video/BVexample"), "bilibili"); assert.equal(classifyJellySource("https://b23.tv/abc"), "bilibili");
  assert.equal(classifyJellySource("https://www.xiaoyuzhoufm.com/episode/abc"), "xiaoyuzhou"); assert.equal(classifyJellySource("https://bilibili.com.evil.example/video/x"), "article");
  assert.equal(jellyXiaohongshuNoteID("https://www.xiaohongshu.com/explore/abc_123?token=opaque"), "abc_123"); assert.equal(jellyXiaohongshuNoteID("https://www.xiaohongshu.com/explore/abc/extra"), null); assert.equal(jellyXiaohongshuNoteID("https://www.xiaohongshu.com/explore/%2fsecret"), null);
  assert.deepEqual(jellySourceEmbeddedJSON('<script>__INITIAL_STATE__={"text":"} undefined","missing":undefined}; evil();</script>', "__INITIAL_STATE__"), { text: "} undefined", missing: null });
  assert.equal(jellySourceEmbeddedJSON('<script>__INITIAL_STATE__={"x":(()=>{throw 1})()};</script>', "__INITIAL_STATE__"), null);
});
test("safe reader rejects credentialed, private, mapped IPv6 and reserved destinations before a network request", async () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "198.18.0.1", "192.0.2.1", "203.0.113.1", "::1", "::ffff:127.0.0.1", "2001:db8::1", "2002:7f00:1::"]) assert.equal(isJellyPublicAddress(ip), false, ip);
  assert.equal(isJellyPublicAddress("8.8.8.8"), true); assert.equal(isJellyPublicAddress("2606:4700:4700::1111"), true);
  for (const url of ["file:///tmp/a", "https://user:secret@example.com", "http://127.0.0.1", "http://localhost", "http://host.local", "https://[::1]"]) assert.throws(() => validateJellyPublicURL(url));
  await assert.rejects(fetchJellyPublicBytes("http://169.254.169.254/latest/meta-data"));
});
test("known proxy synthetic answers resolve through trusted DNS while private and mixed answers stay blocked", async () => {
  const publicAddress = { address: "8.8.8.8", family: 4 }; let calls = 0;
  const trustedDNS = async (hostname: string) => { assert.equal(hostname, "public.example"); calls++; return [publicAddress]; };
  assert.deepEqual(await resolveJellyPublicAddresses("public.example", undefined, { lookup: async () => [{ address: "198.18.0.58", family: 4 }, { address: "fdfe:dcba:9876::3d", family: 6 }], trustedDNS }), [publicAddress]);
  assert.equal(calls, 1);
  for (const values of [["127.0.0.1"], ["10.0.0.1"], ["fdfe:1234::1"], ["198.18.0.58", "10.0.0.1"], ["198.18.0.58", "8.8.8.8"]]) await assert.rejects(resolveJellyPublicAddresses("public.example", undefined, { lookup: async () => values.map(address => ({ address, family: address.includes(":") ? 6 : 4 })), trustedDNS }));
  assert.equal(calls, 1);
  await assert.rejects(resolveJellyPublicAddresses("public.example", undefined, { lookup: async () => [{ address: "198.19.0.58", family: 4 }], trustedDNS: async () => [{ address: "10.0.0.1", family: 4 }] }), /内网地址/);
  await assert.rejects(resolveJellyPublicAddresses("public.example", undefined, { lookup: async () => [{ address: "198.19.0.58", family: 4 }], trustedDNS: async () => [] }), /内网地址/);
  assert.deepEqual(await resolveJellyPublicAddresses("public.example", undefined, { lookup: async () => [publicAddress], trustedDNS }), [publicAddress]); assert.equal(calls, 1);
});
test("public compressed bodies enforce both decoded and wire size without evaluating content", async () => {
  const text = Buffer.from("公开正文内容".repeat(30));
  for (const [encoding, compress] of [["gzip", gzipSync], ["br", brotliCompressSync], ["deflate", deflateSync]] as const) assert.deepEqual(await readJellyPublicBody(Readable.from([compress(text)]), encoding, 4096), text);
  await assert.rejects(readJellyPublicBody(Readable.from([gzipSync(Buffer.from("a".repeat(100000)))]), "gzip", 1024), /解压后超过/);
  await assert.rejects(readJellyPublicBody(Readable.from([Buffer.alloc(2048)]), "identity", 1024), /超过读取限制/);
  await assert.rejects(readJellyPublicBody(Readable.from([Buffer.from("not-gzip")]), "gzip", 1024), /解压失败/);
  await assert.rejects(readJellyPublicBody(Readable.from([text]), "unknown", 4096), /不支持/);
});
test("Bilibili qualified Chinese subtitles retain timestamps without a model download", async () => {
  const url = "https://www.bilibili.com/video/BVexample"; const seen: string[] = [];
  const options: JellySourceOptions = {
    async fetch(target, options) {
      seen.push(target); assert.ok(options?.maxBytes && options.maxBytes <= 4_000_000);
      if (target === url) return page(url, '<script>__INITIAL_STATE__={"videoData":{"bvid":"BVexample","cid":123,"title":"视频标题"}}</script>');
      if (target.includes("/x/player/v2?")) return page(target, JSON.stringify({ code: 0, data: { subtitle: { subtitles: [{ lan: "en", subtitle_url: "https://cdn.example/english" }, { lan: "zh-Hans", subtitle_url: "//cdn.example/chinese" }] } } }), "application/json");
      if (target.endsWith("chinese")) return page(target, JSON.stringify({ body: Array.from({ length: 30 }, (_, i) => ({ from: i, to: i + 1, content: `这是第${i}段真实公开中文字幕内容` })) }), "application/json");
      throw new Error("unexpected fetch");
    },
    async extractMaterial() { assert.fail("qualified public subtitles must not invoke audio model"); }
  };
  const result = await readJellyMaterialSource("/unused", url, options); assert.equal(result.provider, "bilibili"); assert.equal(result.segments?.length, 30); assert.equal(result.coverage.status, "sufficient"); assert.equal(result.title, "视频标题"); assert.ok(!seen.some(target => target.endsWith("english")));
});
test("Bilibili insufficient subtitles fall back to public DASH audio with explicit model choice preserved", async () => {
  const url = "https://www.bilibili.com/video/BVexample";
  await assert.rejects(readJellyMaterialSource("/unused", url, {
    async fetch(target) {
      if (target === url) return page(url, '<script>__INITIAL_STATE__={"videoData":{"bvid":"BVexample","cid":123}}</script>');
      if (target.includes("/x/player/v2?")) return page(target, JSON.stringify({ code: 0, data: { subtitle: { subtitles: [] } } }), "application/json");
      if (target.includes("/x/player/playurl?")) return page(target, JSON.stringify({ code: 0, data: { dash: { audio: [{ baseUrl: "https://cdn.example/audio" }] } } }), "application/json");
      return page(target, "binary-audio", "audio/mp4");
    },
    async extractMaterial(_home, upload) { assert.equal(upload.allow_model_download, false); assert.equal(upload.file_name, "来源素材.m4a"); throw new JellyMaterialError("jelly.material.model_required", "explicit choice required", 409, { approximate_bytes: 626000000 }); }
  }), (error: unknown) => error instanceof JellyMaterialError && error.code === "jelly.material.model_required");
});
test("Xiaoyuzhou resolves public OG, JSON-LD and Next enclosure audio", async () => {
  assert.equal(parseJellyXiaoyuzhouAudio('<meta content="https://cdn.example/a.mp3?x=1&amp;y=2" property="og:audio">'), "https://cdn.example/a.mp3?x=1&y=2");
  assert.equal(parseJellyXiaoyuzhouAudio('<script type="application/ld+json">{"@type":"PodcastEpisode","audio":{"contentUrl":"https://cdn.example/a.mp3"}}</script>'), "https://cdn.example/a.mp3");
  assert.equal(parseJellyXiaoyuzhouAudio('<script id="__NEXT_DATA__" type="application/json">{"props":{"enclosure":{"url":"https://cdn.example/a.m4a"}}}</script>'), "https://cdn.example/a.m4a");
  let extracted = false;
  const result = await readJellyMaterialSource("/unused", "https://www.xiaoyuzhoufm.com/episode/abc", { allow_model_download: true, async fetch(target) { return target.includes("/episode/") ? page(target, '<meta property="og:audio" content="https://cdn.example/a.mp3"><meta property="og:title" content="节目标题">') : page(target, "audio", "audio/mpeg"); }, async extractMaterial(_home, upload) { assert.equal(upload.allow_model_download, true); extracted = true; return material("带来源的转写"); } });
  assert.equal(extracted, true); assert.equal(result.title, "节目标题"); assert.equal(result.source_url, "https://www.xiaoyuzhoufm.com/episode/abc");
});
test("Xiaohongshu exact note identity, source text and bounded images are preserved", async () => {
  const id = "abc123"; const url = `https://www.xiaohongshu.com/explore/${id}?xsec_token=private-query`;
  const html = noteHTML(id, { noteId: id, title: "标题", desc: "原始正文内容", tagList: [{ name: "实践" }], imageList: [{ urlDefault: "https://cdn.example/image.png" }] });
  const parsed = parseJellyXiaohongshu(html, id); assert.equal(parsed.body, "原始正文内容");
  const result = await readJellyMaterialSource("/unused", url, { async fetch(target, options) { if (target === url) return page(url, html); assert.equal(options?.headers?.referer, `https://www.xiaohongshu.com/explore/${id}`); assert.ok(options!.maxBytes! <= 25 * 1024 * 1024); return page(target, "image", "image/png"); }, async extractMaterial() { return material("图片上的文字"); } });
  assert.match(result.text, /原始正文内容/); assert.match(result.text, /图片上的文字/); assert.equal(result.pages?.[0]?.number, 1); assert.equal(result.coverage.status, "partial"); assert.equal(result.source_url, url);
  assert.throws(() => parseJellyXiaohongshu(html, "different"), /不一致/);
});
test("restricted and redirected-to-other-note XHS pages stay explicit failures", async () => {
  const url = "https://www.xiaohongshu.com/explore/abc";
  await assert.rejects(readJellyMaterialSource("/unused", url, { async fetch() { return page(url, "请登录后完成验证码"); } }), /公开页没有可读/);
  await assert.rejects(readJellyMaterialSource("/unused", url, { async fetch() { return page("https://www.xiaohongshu.com/explore/other", noteHTML("other", { noteId: "other", desc: "别人的内容" })); } }), /ID 不一致/);
  await assert.rejects(readJellyMaterialSource("/unused", url, { async fetch() { return page(url, noteHTML("abc", { noteId: "abc", title: "只有标题", tags: ["只有标签"] })); } }), /只有标题或元数据/);
});
test("XHS video without an enabled speech model returns original body and an explicit model requirement", async () => {
  const url = "https://www.xiaohongshu.com/explore/abc";
  const result = await readJellyMaterialSource("/unused", url, { async fetch(target) { return target === url ? page(url, noteHTML("abc", { noteId: "abc", title: "视频", desc: "视频原作者的正文", type: "video", video: { masterUrl: "https://cdn.example/video.mp4" } })) : page(target, "video", "video/mp4"); }, async extractMaterial(_home, upload) { assert.equal(upload.allow_model_download, false); throw new JellyMaterialError("jelly.material.model_required", "download choice", 409, { approximate_bytes: 626000000, variant: "large-v3" }); } });
  assert.match(result.text, /原作者的正文/); assert.equal(result.model_required?.approximate_bytes, 626000000); assert.equal(result.coverage.status, "partial"); assert.match(result.coverage.issues.join(" "), /等待明确下载/);
});
test("generic public articles retain readable body while omitting executable/page-navigation content", async () => {
  const result = await readJellyMaterialSource("/unused", "https://example.com/article", { async fetch(target) { return page(target, `<title>示例&amp;文章</title><nav>导航</nav><article><script>secret()</script><p>${"真实公开文章内容。".repeat(8)}</p></article>`); } });
  assert.equal(result.title, "示例&文章"); assert.doesNotMatch(result.text, /secret|导航/); assert.equal(result.coverage.status, "partial");
});
test("cancelled source never starts fetching", async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(readJellyMaterialSource("/unused", "https://example.com", { signal: controller.signal, async fetch() { calls++; throw new Error("should not fetch"); } })); assert.equal(calls, 0);
});
