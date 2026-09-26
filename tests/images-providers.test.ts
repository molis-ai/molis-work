import assert from "node:assert/strict";
import test from "node:test";
import { generateProviderImages, normalizeImageBaseUrl, type ImageProviderRequest } from "../plugins/native/images/src/providers.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const request: ImageProviderRequest = {
  api_format: "openai-images", base_url: "https://images.example/v1", model: "gpt-image-1.5",
  credential_ref: "image-fixture", resolveCredential: ref => ref === "image-fixture" ? "fixture-key" : null,
  prompt: "一只纸雕狐狸", size: "1024x1024", aspect_ratio: "",
};

test("images: Host receives the original model, prompt, credential reference and cancellation signal", async () => {
  const signal = new AbortController().signal;
  let calls = 0;
  const images = await generateProviderImages(request, signal, async (input, observedSignal) => {
    calls++;
    assert.equal(input, request);
    assert.equal(observedSignal, signal);
    assert.equal(input.resolveCredential(input.credential_ref), "fixture-key");
    assert.equal(input.resolveCredential("another-reference"), null);
    return [{ bytes: PNG, mime: "image/png" }];
  });
  assert.equal(calls, 1);
  assert.equal(images[0]?.mime, "image/png");
  assert.deepEqual(images[0]?.bytes, PNG);
});

test("images: Gemini selection and aspect ratio pass through without text emulation", async () => {
  const input = { ...request, api_format: "gemini" as const, model: "gemini-image", size: "", aspect_ratio: "16:9" };
  await generateProviderImages(input, new AbortController().signal, async (observed) => {
    assert.deepEqual(observed, input);
    return [{ bytes: PNG }];
  });
});

test("images: accepted endpoint schemes exclude credentials and secret-bearing query parameters", () => {
  assert.equal(normalizeImageBaseUrl("https://example.com/v1/"), "https://example.com/v1");
  assert.equal(normalizeImageBaseUrl("http://localhost:8787/v1"), "http://localhost:8787/v1");
  assert.equal(normalizeImageBaseUrl("http://[::1]:8787/v1"), "http://[::1]:8787/v1");
  for (const url of ["http://example.com/v1", "https://user:pass@example.com/v1", "https://example.com?key=secret", "https://example.com/#fragment", "file:///tmp/image.png"]) assert.throws(() => normalizeImageBaseUrl(url));
});

test("images: empty output, unsupported signatures and MIME mismatches never become saved assets", async () => {
  for (const [outputs, code] of [
    [[], "images.no_image"],
    [[{ bytes: Buffer.from("<svg onload='steal()' />") }], "images.invalid_image"],
    [[{ bytes: PNG, mime: "image/jpeg" }], "images.invalid_image"],
  ] as const) await assert.rejects(generateProviderImages(request, new AbortController().signal, async () => outputs), { code });
});

test("images: bounds and magic-byte checks remain enforced after the Host returns", async () => {
  const large = Buffer.alloc(10 * 1024 * 1024); PNG.copy(large);
  assert.equal((await generateProviderImages(request, new AbortController().signal, async () => [{ bytes: large }]))[0]!.bytes.length, large.length);
  const huge = Buffer.alloc(20 * 1024 * 1024 + 1); PNG.copy(huge);
  await assert.rejects(generateProviderImages(request, new AbortController().signal, async () => [{ bytes: huge }]), { code: "images.response_too_large" });
  assert.equal((await generateProviderImages(request, new AbortController().signal, async () => Array.from({length:8}, () => ({bytes:PNG})))).length, 4);
});

test("images: cancellation stops local waiting even if an injected execution port ignores it", async () => {
  const controller = new AbortController();
  const pending = generateProviderImages(request, controller.signal, () => new Promise(() => {}));
  controller.abort();
  await assert.rejects(pending, { code: "images.cancelled" });
  await assert.rejects(generateProviderImages(request, controller.signal, async () => assert.fail("aborted call dispatched")), { name: "AbortError" });
});
