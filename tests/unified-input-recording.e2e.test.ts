import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, constants } from "node:fs";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ChromeHarness, ChromePage, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { UIV_BOOT_SCRIPT, UIV_STYLE } from "@molis-ai/molis-work-design-system";
import { handleLocalVoiceHttp } from "@molis-ai/molis-work-app-local-host";

const run = promisify(execFile);
const expected = "今天核对统一输入";
const prepareFirst = process.env.UIV_VOICE_PREPARE === "1";
function prerequisites(t: TestContext): { chrome: string; models: string; helper: string } | null {
  const chrome = locateTestChrome();
  const models = process.env.UIV_VOICE_MODEL_DIR ?? "";
  const helper = process.env.UIV_JELLY_WHISPER_HELPER || fileURLToPath(new URL("../apps/local-host/native/materials/bin/jelly-whisper", import.meta.url));
  const known = process.env.UIV_KNOWN_WAV;
  if (process.platform !== "darwin" || !chrome || (!prepareFirst && (!models || !existsSync(models))) || !existsSync(helper) || !existsSync("/usr/bin/sandbox-exec")
    || (known ? !existsSync(known) : !existsSync("/usr/bin/say") || !existsSync("/usr/bin/afconvert"))) {
    t.skip("Chrome, a prepared model and known speech fixture are required; a skip does not validate real encoding or offline transcription");
    return null;
  }
  if (!prepareFirst) assert.ok(lstatSync(models).isDirectory() && !lstatSync(models).isSymbolicLink(), "copy an actual isolated model directory");
  return { chrome, models, helper };
}
async function knownWav(directory: string): Promise<Buffer> {
  if (process.env.UIV_KNOWN_WAV) return readFile(process.env.UIV_KNOWN_WAV);
  const source = join(directory, "known.aiff"), wav = join(directory, "known.wav");
  await run("/usr/bin/say", ["-v", "Tingting", "-o", source, expected], { timeout: 30_000 });
  await run("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", source, wav], { timeout: 30_000 });
  return readFile(wav);
}
function shellQuote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }
async function deniedHelper(directory: string, helper: string): Promise<{ file: string; log: string }> {
  await access(helper, constants.X_OK);
  const file = join(directory, "offline-helper"), log = join(directory, "helper-argv.log");
  // exec preserves the process that the production cancellation path owns; no wrapper child can outlive a cancelled request.
  await writeFile(file, `#!/bin/sh\nprintf '%s\\n' "$@" >> ${shellQuote(log)}\nexec /usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network*)' ${shellQuote(helper)} "$@"\n`, { mode: 0o700 });
  return { file, log };
}
function pageHtml(wav: Buffer): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${UIV_STYLE}body{padding:24px;font:14px sans-serif}form{width:680px}textarea{width:95%;height:70px}button{padding:8px;margin:4px}</style></head><body data-project-id="recording">
<form data-assistant-composer data-uiv-key="real-encoding" aria-label="编码回归"><span data-assistant-target-label>本机转写</span><textarea data-assistant-input></textarea><button data-assistant-send type="submit">发送</button></form>
<script>
window.errors = []; window.voiceRequests = []; window.voiceTimings = []; window.activeTiming = null; window.originalRecorder = MediaRecorder;
document.addEventListener('click', event => {
  if (event.target.closest('[data-uiv-stop-record]')) { activeTiming = {stopAt:performance.now()}; voiceTimings.push(activeTiming); }
}, true);
document.addEventListener('input', event => {
  if (event.target.matches('textarea') && event.target.value.trim() && activeTiming && !activeTiming.draftAt) {
    const timing = activeTiming; timing.draftAt = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const field = document.querySelector('textarea'), bounds = field.getBoundingClientRect();
      if (field.value.trim() && bounds.width > 0 && bounds.height > 0 && getComputedStyle(field).visibility === 'visible') timing.visibleAt = performance.now();
    }));
  }
}, true);
addEventListener('error', event => errors.push(event.message)); addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
window.molisWorkRequest = async (url, init) => {
  voiceRequests.push(init.body);
  const timing = init.body.op === 'transcribe' ? activeTiming : null;
  if (timing) timing.requestAt = performance.now();
  const response = await fetch(url, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(init.body),signal:init.signal});
  if (init.as === 'response') return response;
  const body = await response.json();
  if (timing) timing.responseAt = performance.now();
  if (!response.ok && !(init.accept || []).includes(response.status)) throw new Error(body.error || 'voice request failed');
  return body;
};
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {configurable:true,value:async () => {
  const context = new AudioContext(); await context.resume();
  const bytes = Uint8Array.from(atob(${JSON.stringify(wav.toString("base64"))}), char => char.charCodeAt(0));
  const buffer = await context.decodeAudioData(bytes.buffer); const source = context.createBufferSource(); source.buffer = buffer;
  const destination = context.createMediaStreamDestination(); source.connect(destination);
  window.fixtureAudio = {context, source, destination}; return destination.stream;
}});
document.addEventListener('submit', event => event.preventDefault());
</script><script>${UIV_BOOT_SCRIPT}</script><script>document.documentElement.dataset.ready='1'</script></body></html>`;
}
function serveVoice(home: string, html: string) {
  const errors: string[] = [], pending = new Set<Promise<void>>();
  const server = createServer((request, response) => {
    if (request.method === "GET") { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(html); return; }
    const task = handleLocalVoiceHttp(request, response, new URL(request.url ?? "/", "http://127.0.0.1"), home)
      .then(() => undefined).catch(error => { errors.push(String(error)); if (!response.destroyed) { response.writeHead(500); response.end(); } });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  return { server, errors, async close() {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await Promise.allSettled([...pending]);
  } };
}
async function openPage(harness: ChromeHarness, url: string): Promise<ChromePage> {
  const { targetId } = await harness.command<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await harness.command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  const browser = new ChromePage(harness, sessionId, targetId);
  await browser.command("Page.enable");
  await browser.viewport(1000, 700);
  await browser.command("Page.navigate", { url });
  await browser.wait("document.documentElement.dataset.ready === '1' && document.querySelector('[data-uiv-mic]')");
  return browser;
}

test("UIV-05 UIV-08 the shipped composer transcribes real Chrome MediaRecorder output with its helper offline", { timeout: prepareFirst ? 900_000 : 360_000 }, async t => {
  const required = prerequisites(t); if (!required) return;
  const directory = await mkdtemp(join(tmpdir(), "molis-uiv-real-recording-"));
  const home = join(directory, "home"), models = join(home, "lingguang", "models");
  let harness: ChromeHarness | undefined;
  let service: ReturnType<typeof serveVoice> | undefined;
  const previousHelper = process.env.MOLIS_JELLY_WHISPER_HELPER;
  t.after(async () => {
    try { await harness?.close(); }
    finally {
      try { await service?.close(); }
      finally {
        if (previousHelper === undefined) delete process.env.MOLIS_JELLY_WHISPER_HELPER;
        else process.env.MOLIS_JELLY_WHISPER_HELPER = previousHelper;
        if (process.env.UIV_RECORDING_KEEP_HOME !== "1") await rm(directory, { recursive: true, force: true });
      }
    }
  });
  await mkdir(join(home, "lingguang"), { recursive: true });
  if (!prepareFirst) await cp(required.models, models, { recursive: true, mode: constants.COPYFILE_FICLONE });
  const offline = await deniedHelper(directory, required.helper);
  process.env.MOLIS_JELLY_WHISPER_HELPER = prepareFirst ? required.helper : offline.file;
  const wav = await knownWav(directory);
  service = serveVoice(home, pageHtml(wav));
  await new Promise<void>((resolve, reject) => { service!.server.once("error", reject); service!.server.listen(0, "127.0.0.1", resolve); });
  const address = service.server.address(); assert.ok(address && typeof address === "object");
  harness = await ChromeHarness.start(directory, { executable: required.chrome });
  const browser = await openPage(harness, `http://127.0.0.1:${address.port}/`);
  assert.equal(await browser.evaluate("MediaRecorder === originalRecorder && MediaRecorder.isTypeSupported('audio/mp4;codecs=mp4a.40.2')"), true, "exercise Chrome's real recorder and AAC encoder");
  if (prepareFirst) {
    await browser.click("[data-uiv-mic]");
    await browser.wait("!document.querySelector('[data-uiv-download]').hidden", { timeoutMs: 30_000 });
    await browser.evaluate("window.prepareStarted = performance.now()");
    await browser.click("[data-uiv-download]");
    await browser.wait("document.querySelector('[data-uiv-voice-status]').textContent.includes('本地识别已准备好')", { timeoutMs: 600_000, describe: "document.querySelector('[data-uiv-voice-status]').textContent" });
    t.diagnostic(JSON.stringify({ prepareMs: await browser.evaluate("performance.now() - prepareStarted"), home, preparation: "empty model directory; actual download and warmup via delivered UI" }));
    process.env.MOLIS_JELLY_WHISPER_HELPER = offline.file;
  }
  // First use at a new model path, then two recordings at the same path. No test-driver clock in the measured interval.
  for (let trial = 0; trial < 3; trial += 1) {
    await browser.evaluate("document.querySelector('textarea').value = ''; document.querySelector('textarea').dispatchEvent(new Event('input', {bubbles:true}))");
    await browser.click("[data-uiv-mic]");
    await browser.wait("!document.querySelector('[data-uiv-stop-record]').hidden", { timeoutMs: 30_000 });
    const played = await browser.command<{ exceptionDetails?: unknown }>("Runtime.evaluate", {
      userGesture: true, awaitPromise: true, returnByValue: true,
      expression: "(async()=>{await fixtureAudio.context.resume();await new Promise(resolve=>{fixtureAudio.source.onended=resolve;fixtureAudio.source.start();});})()",
    });
    assert.equal(played.exceptionDetails, undefined);
    await browser.click("[data-uiv-stop-record]");
    await browser.wait("activeTiming && activeTiming.visibleAt > 0", { timeoutMs: 150_000, describe: "document.querySelector('[data-uiv-voice-status]').textContent" });
    const actualText = await browser.evaluate<string>("document.querySelector('textarea').value");
    const timings = await browser.evaluate<{ stopAt: number; requestAt: number; responseAt: number; draftAt: number; visibleAt: number }>("activeTiming");
    const elapsedMs = timings.visibleAt - timings.stopAt;
    assert.ok(timings.stopAt <= timings.requestAt && timings.requestAt <= timings.responseAt && timings.responseAt <= timings.draftAt && timings.draftAt <= timings.visibleAt);
    assert.ok(elapsedMs > 0);
    const recorded = await browser.evaluate<{ mime: string; audio_base64: string }>("voiceRequests.filter(value => value.op === 'transcribe').at(-1)");
    assert.match(recorded.mime, /^audio\/mp4(?:;|$)/);
    assert.doesNotMatch(recorded.mime, /opus|webm/i);
    const bytes = Buffer.from(recorded.audio_base64, "base64");
    assert.ok(bytes.length > 1_000);
    assert.equal(bytes.subarray(4, 8).toString("ascii"), "ftyp", "the production upload is actual MP4 bytes, not the source WAV");
    assert.notEqual(createHash("sha256").update(bytes).digest("hex"), createHash("sha256").update(wav).digest("hex"));
    const argv = await readFile(offline.log, "utf8");
    assert.match(argv, /capabilities/); assert.match(argv, /extract/);
    assert.doesNotMatch(argv, /https?:|--allow-model-download/);
    assert.deepEqual(service.errors, []);
    assert.deepEqual(await browser.evaluate("errors"), []);
    await browser.evaluate("fixtureAudio.context.close()");
    t.diagnostic(JSON.stringify({ sourceSha256: createHash("sha256").update(wav).digest("hex"), recordedMime: recorded.mime, recordedBytes: bytes.length, transcript: actualText, trial: trial + 1, modelPathState: prepareFirst ? "after-real-prepare" : trial === 0 ? "first-use-at-copied-path" : "same-path-repeat", elapsedMs, finishAndEncodeMs: timings.requestAt - timings.stopAt, requestMs: timings.responseAt - timings.requestAt, applyAndPaintMs: timings.visibleAt - timings.responseAt, measurement: "stop click capture to second animation frame after draft input", helperNetworkDenied: true }));
    assert.equal(actualText, expected, "transcription must match the predetermined spoken phrase on every recording");
  }
});
