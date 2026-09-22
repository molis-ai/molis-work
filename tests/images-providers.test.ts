import assert from "node:assert/strict";
import test from "node:test";
import { generateProviderImages, normalizeImageBaseUrl, type ImageFetch, type ImageProviderRequest } from "../plugins/native/images/src/providers.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const request: ImageProviderRequest = {
  api_format: "openai-images", base_url: "https://images.example/v1", model: "gpt-image-1.5",
  api_key: "secret-test-key", prompt: "一只纸雕狐狸", size: "1024x1024", aspect_ratio: "",
};
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

test("images: OpenAI-compatible request uses only shared fields and decodes a real PNG", async () => {
  let calls = 0;
  const fetch: ImageFetch = async (url, init) => {
    calls += 1;
    assert.equal(String(url), "https://images.example/v1/images/generations");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer secret-test-key");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.credentials, "omit");
    assert.deepEqual(JSON.parse(String(init?.body)), { model: "gpt-image-1.5", prompt: "一只纸雕狐狸", size: "1024x1024" });
    return json({ data: [{ b64_json: PNG.toString("base64") }] });
  };
  const images = await generateProviderImages(request, new AbortController().signal, fetch);
  assert.equal(calls, 1);
  assert.equal(images[0]?.mime, "image/png");
  assert.deepEqual(images[0]?.bytes, PNG);
});

test("images: Gemini uses generateContent, API key header, image aspect ratio and skips thought images", async () => {
  const fetch: ImageFetch = async (url, init) => {
    assert.equal(String(url), "https://generativelanguage.googleapis.com/v1beta/models/gemini-image:generateContent");
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "secret-test-key");
    assert.equal(new Headers(init?.headers).get("authorization"), null);
    assert.deepEqual(JSON.parse(String(init?.body)), {
      contents: [{ parts: [{ text: request.prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "16:9" } },
    });
    return json({ candidates: [{ content: { parts: [
      { thought: true, inlineData: { mimeType: "image/png", data: "invalid-thought-is-ignored" } },
      { text: "说明" },
      { inlineData: { mimeType: "image/png", data: PNG.toString("base64") } },
      { inline_data: { mime_type: "image/png", data: PNG.toString("base64") } },
    ] } }] });
  };
  const images = await generateProviderImages({ ...request, api_format: "gemini", base_url: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-image", aspect_ratio: "16:9", size: "" }, new AbortController().signal, fetch);
  assert.equal(images.length, 2);
  assert.ok(images.every((image) => image.bytes.equals(PNG)));
});

test("images: signed image URL downloads never receive the provider key or allow redirects", async () => {
  let calls = 0;
  const fetch: ImageFetch = async (url, init) => {
    calls += 1;
    if (calls === 1) return json({ data: [{ url: "https://cdn.example/generated.png?signature=temporary" }] });
    assert.equal(String(url), "https://cdn.example/generated.png?signature=temporary");
    assert.equal(new Headers(init?.headers).get("authorization"), null);
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), null);
    assert.equal(init?.redirect, "error");
    assert.equal(init?.credentials, "omit");
    return new Response(PNG, { headers: { "content-type": "image/png" } });
  };
  assert.deepEqual((await generateProviderImages(request, new AbortController().signal, fetch))[0]?.bytes, PNG);
  assert.equal(calls, 2);
});

test("images: provider output cannot request loopback or private hosts and local downloads stay on the configured origin", async () => {
  for (const url of ["http://127.0.0.1:7777/private-image", "https://127.0.0.1/image", "https://[::1]/image", "https://10.1.2.3/image", "https://192.168.1.2/image", "https://host.local/image"]) {
    let calls = 0;
    await assert.rejects(generateProviderImages(request, new AbortController().signal, async () => { calls += 1; return json({ data: [{ url }] }); }), { code: "images.invalid_url" });
    assert.equal(calls, 1);
  }
  const local = { ...request, base_url: "http://127.0.0.1:8787/v1", api_key: "" };
  await assert.rejects(generateProviderImages(local, new AbortController().signal,
    async () => json({ data: [{ url: "http://127.0.0.1:7777/image" }] })), { code: "images.invalid_url" });
  let localCalls = 0;
  const results = await generateProviderImages(local, new AbortController().signal, async () => {
    localCalls += 1;
    return localCalls === 1 ? json({ data: [{ url: "http://127.0.0.1:8787/image" }] }) : new Response(PNG, { headers: { "content-type": "image/png" } });
  });
  assert.equal(results.length, 1);
  assert.equal(localCalls, 2);
});

test("images: multi-megabyte Base64 responses do not overflow the validator stack", async () => {
  const large = Buffer.alloc(10 * 1024 * 1024);
  PNG.copy(large);
  const images = await generateProviderImages(request, new AbortController().signal,
    async () => json({ data: [{ b64_json: large.toString("base64") }] }));
  assert.equal(images[0]?.bytes.byteLength, large.length);
});

test("images: accepted endpoint schemes exclude credentials and secret-bearing query parameters", () => {
  assert.equal(normalizeImageBaseUrl("https://example.com/v1/"), "https://example.com/v1");
  assert.equal(normalizeImageBaseUrl("http://localhost:8787/v1"), "http://localhost:8787/v1");
  assert.equal(normalizeImageBaseUrl("http://[::1]:8787/v1"), "http://[::1]:8787/v1");
  for (const url of ["http://example.com/v1", "https://user:pass@example.com/v1", "https://example.com?key=secret", "https://example.com/#fragment", "file:///tmp/image.png"]) {
    assert.throws(() => normalizeImageBaseUrl(url));
  }
});

test("images: no-image, invalid Base64 and unsafe image content are explicit failures", async () => {
  const cases: Array<[unknown, string]> = [
    [{ data: [] }, "images.no_image"],
    [{ data: [{ b64_json: "not base64?" }] }, "images.invalid_image"],
    [{ data: [{ b64_json: Buffer.from("<svg onload='steal()' />").toString("base64") }] }, "images.invalid_image"],
    [{ data: [{ url: "http://remote.example/image.png" }] }, "images.invalid_url"],
  ];
  for (const [payload, code] of cases) {
    await assert.rejects(generateProviderImages(request, new AbortController().signal, async () => json(payload)), { code });
  }
  await assert.rejects(generateProviderImages({ ...request, api_format: "gemini" }, new AbortController().signal,
    async () => json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: PNG.toString("base64") } }] } }] })), { code: "images.invalid_image" });
});

test("images: response bounds cover announced JSON and streaming image bytes", async () => {
  await assert.rejects(generateProviderImages(request, new AbortController().signal,
    async () => new Response("{}", { headers: { "content-length": String(41 * 1024 * 1024) } })), { code: "images.response_too_large" });
  let calls = 0;
  let cancelled = false;
  const fetch: ImageFetch = async () => {
    calls += 1;
    if (calls === 1) return json({ data: [{ url: "https://cdn.example/image.png" }] });
    return new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel() { cancelled = true; },
    }));
  };
  await assert.rejects(generateProviderImages(request, new AbortController().signal, fetch), { code: "images.response_too_large" });
  assert.equal(cancelled, true);
});

test("images: errors expose HTTP status and recovery guidance without the response or credentials", async () => {
  for (const status of [401, 429, 503]) {
    await assert.rejects(generateProviderImages(request, new AbortController().signal,
      async () => new Response("secret-test-key private provider internals", { status })), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.doesNotMatch(error.message, /secret-test-key|private provider/u);
      return true;
    });
  }
});

test("images: at most four returned images are processed and ignored-abort fetch cannot retain local waiting", async () => {
  const images = await generateProviderImages(request, new AbortController().signal,
    async () => json({ data: Array.from({ length: 8 }, () => ({ b64_json: PNG.toString("base64") })) }));
  assert.equal(images.length, 4);
  const controller = new AbortController();
  const pending = generateProviderImages(request, controller.signal, () => new Promise(() => {}));
  controller.abort();
  await assert.rejects(pending, { code: "images.cancelled" });
});
