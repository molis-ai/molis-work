import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChromeHarness, ChromePage, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { UIV_BOOT_SCRIPT, UIV_STYLE, uivStorageKey } from "@molis-ai/molis-work-design-system";

// Real browser, shipped boot script, controllable device/network boundaries. These tests do not claim microphone or recognition quality.
const boundaryFixture = `
window.fixture = { streams: [], recorders: [], requests: [], media: [], submissions: [], deferMedia: false, deferProbe: false, delayStops: false, model: "available" };
fixture.makeStream = () => {
  const track = new EventTarget(); track.stopped = false; track.stop = () => { track.stopped = true; };
  const stream = { track, getTracks: () => [track], getAudioTracks: () => [track] };
  fixture.streams.push(stream); return stream;
};
Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: () => fixture.deferMedia
  ? new Promise(resolve => fixture.media.push({ resolve })) : Promise.resolve(fixture.makeStream()) });
window.AudioContext = undefined;
window.MediaRecorder = class extends EventTarget {
  static isTypeSupported(type) { return type === "audio/mp4" || type === "audio/webm"; }
  constructor(stream) { super(); this.stream = stream; this.state = "inactive"; fixture.recorders.push(this); }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; if (!fixture.delayStops) queueMicrotask(() => this.finish()); }
  finish() { const event = new Event("dataavailable"); Object.defineProperty(event, "data", { value: new Blob([new Uint8Array([1,2,3])], { type: "audio/mp4" }) }); this.dispatchEvent(event); this.dispatchEvent(new Event("stop")); }
};
window.molisWorkRequest = (_url, init) => new Promise((resolve, reject) => {
  const call = { op: init.body.op, body: init.body, signal: init.signal, resolve, reject };
  fixture.requests.push(call);
  if (call.op === "probe" && !fixture.deferProbe) resolve({ model: fixture.model, approximate_bytes: 626000000 });
});
document.addEventListener("submit", event => { event.preventDefault(); fixture.submissions.push({ id: event.target.id, key: event.target.dataset.uivSendKey }); });
window.errors = [];
addEventListener("error", event => errors.push(event.message));
addEventListener("unhandledrejection", event => errors.push(String(event.reason)));
`;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
${UIV_STYLE}body{margin:20px;font:14px sans-serif}form{display:block;border:1px solid #aaa;padding:12px;margin:12px;width:650px}textarea{display:block;min-height:55px;width:95%}button{margin:4px;padding:8px}p{margin:4px}.uiv-bar{display:inline-flex}
</style></head><body data-project-id="project">
<form id="home" data-home-talk-form data-uiv-key="home-a" aria-label="首页"><textarea></textarea><button type="submit">发送</button></form>
<form id="assistant" data-assistant-composer data-uiv-key="assistant-a" aria-label="助手"><span data-assistant-target-label>当前助手</span><textarea data-assistant-input></textarea><button type="submit" data-assistant-send>发送</button></form>
<form id="coding" data-coding-composer data-uiv-key="coding-a" aria-label="Coding"><select data-coding-intent><option value="plan">计划</option><option value="execute">执行</option></select><textarea data-coding-task></textarea><button type="submit" data-coding-send>发送</button></form>
<script>${boundaryFixture}</script><script>${UIV_BOOT_SCRIPT}</script><script>document.documentElement.dataset.ready="1"</script></body></html>`;

async function openFixture(t: TestContext): Promise<ChromePage | null> {
  const chrome = locateTestChrome();
  if (!chrome) { t.skip("Chrome is required; production composer lifecycle remains unverified"); return null; }
  const directory = await mkdtemp(join(tmpdir(), "molis-uiv-lifecycle-"));
  const server = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(html); });
  let harness: ChromeHarness | undefined;
  t.after(async () => {
    try { await harness?.close(); } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  harness = await ChromeHarness.start(directory, { executable: chrome });
  const { targetId } = await harness.command<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await harness.command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  const browser = new ChromePage(harness, sessionId, targetId);
  await browser.command("Page.enable");
  await browser.viewport(1000, 1200);
  await browser.command("Page.navigate", { url: `http://127.0.0.1:${address.port}/` });
  await browser.wait("document.documentElement.dataset.ready === '1' && document.querySelectorAll('[data-uiv-bound]').length === 3");
  return browser;
}
const options = { timeout: 60_000 };
const selector = (surface: string, part: string) => `#${surface} [data-uiv-${part}]`;
const status = (browser: ChromePage, surface = "assistant") => browser.evaluate<string>(`document.querySelector(${JSON.stringify(selector(surface, "voice-status"))}).textContent`);
const field = (browser: ChromePage, surface: string) => browser.evaluate<string>(`document.querySelector('#${surface} textarea').value`);
function draftKey(surface: "assistant" | "coding", sessionId: string): string { return uivStorageKey({ surface, projectId: "project", sessionId }); }
const saved = (browser: ChromePage, sessionId: string) => browser.evaluate<{ text: string; context: string | null }>(`JSON.parse(localStorage.getItem(${JSON.stringify(draftKey("coding", sessionId))}))`);
async function nextFrame(browser: ChromePage): Promise<void> { await browser.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))"); }
async function startRecord(browser: ChromePage, surface = "assistant"): Promise<void> {
  await browser.click(selector(surface, "mic"));
  await browser.wait(`fixture.recorders.at(-1)?.state === 'recording' && !document.querySelector(${JSON.stringify(selector(surface, "stop-record"))}).hidden`);
}
async function startTranscript(browser: ChromePage, surface = "coding"): Promise<void> {
  await startRecord(browser, surface);
  await browser.click(selector(surface, "stop-record"));
  await browser.wait("fixture.requests.some(call => call.op === 'transcribe')");
}
async function switchCoding(browser: ChromePage, id: string): Promise<void> {
  await browser.evaluate(`(() => { const form = document.querySelector('#coding'); form.querySelector('textarea').value = ''; form.querySelector('select').value = 'plan'; form.dataset.uivKey = ${JSON.stringify(id)}; })()`);
  await browser.wait(`document.querySelector('#coding').dataset.uivRestoredKey === ${JSON.stringify(draftKey("coding", id))}`);
}
async function intent(browser: ChromePage, value: string): Promise<void> {
  await browser.evaluate(`(() => { const select = document.querySelector('#coding select'); select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}
async function resolveTranscript(browser: ChromePage, text: string): Promise<void> {
  await browser.evaluate(`fixture.requests.find(call => call.op === 'transcribe').resolve({ text: ${JSON.stringify(text)}, unclear: false, model_required: false })`);
  await nextFrame(browser);
}

for (const held of ["microphone", "probe"]) {
  test(`UIV-06 cancelling preparation rejects a late ${held} result before a recorder starts`, options, async t => {
    const browser = await openFixture(t); if (!browser) return;
    await browser.fill("#assistant textarea", "准备前的草稿");
    await browser.evaluate(held === "microphone" ? "fixture.deferMedia = true" : "fixture.deferProbe = true");
    await browser.click(selector("assistant", "mic"));
    assert.match(await status(browser), /正在准备录音/);
    assert.equal(await browser.evaluate(`document.querySelector('${selector("assistant", "cancel-record")}').hidden`), false);
    await browser.click(selector("coding", "cancel-record"));
    if (held === "microphone") await browser.evaluate("fixture.media[0].resolve(fixture.makeStream())");
    else {
      assert.equal(await browser.evaluate("fixture.requests[0].signal.aborted"), true);
      await browser.evaluate("fixture.requests[0].resolve({ model: 'available' })");
    }
    await browser.wait("fixture.streams[0].track.stopped");
    assert.equal(await browser.evaluate("fixture.recorders.length"), 0);
    assert.equal(await field(browser, "assistant"), "准备前的草稿");
    assert.match(await status(browser), /已取消/);
    assert.deepEqual(await browser.evaluate("errors"), []);
  });
}

test("UIV-06 a cancelled recorder's late stop cannot close a later recording", options, async t => {
  const browser = await openFixture(t); if (!browser) return;
  await browser.evaluate("fixture.delayStops = true");
  await startRecord(browser);
  await browser.click(selector("assistant", "cancel-record"));
  assert.equal(await browser.evaluate("fixture.streams[0].track.stopped"), true);
  await startRecord(browser, "coding");
  await browser.evaluate("fixture.recorders[0].finish()");
  await nextFrame(browser);
  assert.deepEqual(await browser.evaluate("({count:fixture.recorders.length,state:fixture.recorders[1].state,stopped:fixture.streams[1].track.stopped,transcriptions:fixture.requests.filter(call=>call.op==='transcribe').length})"), { count: 2, state: "recording", stopped: false, transcriptions: 0 });
  assert.match(await status(browser, "coding"), /正在录音/);
  await browser.click(selector("coding", "cancel-record"));
  assert.equal(await browser.evaluate("fixture.streams[1].track.stopped"), true);
});

test("UIV-06 cancelling transcription aborts its transport and ignores a late nonempty transcript", options, async t => {
  const browser = await openFixture(t); if (!browser) return;
  await browser.fill("#assistant textarea", "保留原文");
  await startTranscript(browser, "assistant");
  assert.equal(await browser.evaluate("fixture.requests.find(call=>call.op==='transcribe').signal instanceof AbortSignal"), true);
  await browser.click(selector("assistant", "cancel-record"));
  assert.equal(await browser.evaluate("fixture.requests.find(call=>call.op==='transcribe').signal.aborted"), true);
  await browser.fill("#assistant textarea", "取消后又写的文字");
  await resolveTranscript(browser, "不应出现的迟到口述");
  assert.equal(await field(browser, "assistant"), "取消后又写的文字");
  assert.doesNotMatch(await browser.evaluate<string>("document.body.textContent"), /不应出现的迟到口述/);
  assert.equal(await browser.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(draftKey("assistant", "assistant-a"))})).text`), "取消后又写的文字");
  assert.deepEqual(await browser.evaluate("errors"), []);
});

test("UIV-07 transcript confirmation uses the original session's newest text and context after switching", options, async t => {
  const browser = await openFixture(t); if (!browser) return;
  await browser.fill("#coding textarea", "甲原文");
  await intent(browser, "execute");
  await startTranscript(browser);
  await browser.fill("#coding textarea", "甲已经改过");
  await switchCoding(browser, "coding-b");
  await browser.fill("#coding textarea", "乙自己的草稿");
  await resolveTranscript(browser, "这句属于甲");
  assert.equal(await browser.evaluate(`document.querySelector('${selector("coding", "confirm")}').hidden`), false);
  assert.deepEqual(await saved(browser, "coding-a"), { text: "甲已经改过", context: "execute" });
  assert.equal(await field(browser, "coding"), "乙自己的草稿");
  await switchCoding(browser, "coding-a");
  await browser.fill("#coding textarea", "甲确认前又改一次");
  await switchCoding(browser, "coding-b");
  await browser.click(selector("coding", "confirm"));
  assert.deepEqual(await saved(browser, "coding-a"), { text: "甲确认前又改一次\n这句属于甲", context: "execute" });
  assert.deepEqual(await saved(browser, "coding-b"), { text: "乙自己的草稿", context: "plan" });
  assert.equal(await field(browser, "coding"), "乙自己的草稿");
  await switchCoding(browser, "coding-a");
  assert.equal(await field(browser, "coding"), "甲确认前又改一次\n这句属于甲");
  assert.equal(await browser.evaluate("document.querySelector('#coding select').value"), "execute");
});

test("UIV-07 clearing then rewriting and switching sessions never restores the discarded dictation", options, async t => {
  const browser = await openFixture(t); if (!browser) return;
  await browser.fill("#coding textarea", "即将清空的原文");
  await intent(browser, "execute");
  await startTranscript(browser);
  await browser.fill("#coding textarea", "");
  assert.equal(await field(browser, "coding"), "");
  await browser.fill("#coding textarea", "清空后重新写的甲草稿");
  await switchCoding(browser, "coding-b");
  await browser.fill("#coding textarea", "乙草稿");
  await resolveTranscript(browser, "必须丢弃的旧口述");
  assert.deepEqual(await saved(browser, "coding-a"), { text: "清空后重新写的甲草稿", context: "execute" });
  assert.equal(await field(browser, "coding"), "乙草稿");
  assert.match(await status(browser, "coding"), /草稿已清空/);
  await switchCoding(browser, "coding-a");
  assert.equal(await field(browser, "coding"), "清空后重新写的甲草稿");
  assert.equal(await browser.evaluate(`document.querySelector('${selector("coding", "confirm")}').hidden`), true);
});

test("UIV-05 model compilation after download stays visibly preparing until the terminal success", options, async t => {
  const browser = await openFixture(t); if (!browser) return;
  await browser.evaluate("fixture.model = 'model_required'");
  await browser.click(selector("home", "mic"));
  await browser.wait(`!document.querySelector('${selector("home", "download")}').hidden`);
  await browser.click(selector("home", "download"));
  await browser.wait("fixture.requests.some(call => call.op === 'prepare')");
  await browser.evaluate(`fixture.requests.find(call => call.op === 'prepare').resolve(new Response(new ReadableStream({start(controller){
    fixture.prepareStream = controller;
    controller.enqueue(new TextEncoder().encode(JSON.stringify({stage:'model_download',progress:1})+'\\n'+JSON.stringify({stage:'model_loading',progress:0})+'\\n'));
  }}), {status:200,headers:{'content-type':'application/x-ndjson'}}))`);
  await browser.wait(`document.querySelector('${selector("home", "voice-status")}').textContent.includes('正在完成本机识别准备')`);
  assert.doesNotMatch(await status(browser, "home"), /已准备好/);
  assert.equal(await browser.evaluate(`document.querySelector('${selector("home", "cancel-record")}').hidden`), false);
  assert.equal(await browser.evaluate(`document.querySelector('${selector("home", "mic")}').hidden`), true);
  await browser.evaluate("fixture.prepareStream.enqueue(new TextEncoder().encode(JSON.stringify({ok:true})+'\\n'));fixture.prepareStream.close()");
  await browser.wait(`document.querySelector('${selector("home", "voice-status")}').textContent.includes('本地识别已准备好')`);
  assert.equal(await browser.evaluate(`document.querySelector('${selector("home", "mic")}').hidden`), false);
  assert.deepEqual(await browser.evaluate("errors"), []);
});

test("UIV-05 a 200 download stream without a positive terminal result remains retryable failure", options, async t => {
  const browser = await openFixture(t); if (!browser) return;
  await browser.evaluate("fixture.model = 'model_required'");
  await browser.click(selector("home", "mic"));
  await browser.wait(`!document.querySelector('${selector("home", "download")}').hidden`);
  await browser.click(selector("home", "download"));
  await browser.wait("fixture.requests.some(call => call.op === 'prepare')");
  await browser.evaluate(`fixture.requests.find(call => call.op === 'prepare').resolve(new Response(JSON.stringify({stage:'model_download',progress:1})+'\\n', {status:200, headers:{'content-type':'application/x-ndjson'}}))`);
  await browser.wait(`document.querySelector('${selector("home", "voice-status")}').textContent.includes('下载没有完成')`);
  assert.doesNotMatch(await status(browser, "home"), /已准备好/);
  assert.equal(await browser.evaluate(`document.querySelector('${selector("home", "download")}').hidden`), false);
  assert.deepEqual(await browser.evaluate("errors"), []);
});

test("UIV-03 an old session's send success cannot clear the same text in the new session", options, async t => {
  const browser = await openFixture(t); if (!browser) return;
  await browser.fill("#coding textarea", "两份草稿恰好相同");
  await intent(browser, "execute");
  await browser.click("#coding [data-coding-send]");
  await browser.wait("fixture.submissions.length === 1");
  const sendingKey = await browser.evaluate<string>("fixture.submissions[0].key");
  assert.equal(sendingKey, draftKey("coding", "coding-a"));
  await switchCoding(browser, "coding-b");
  await browser.fill("#coding textarea", "两份草稿恰好相同");
  await browser.evaluate(`(() => { const form = document.querySelector('#coding'); form.dataset.uivResultKey = ${JSON.stringify(sendingKey)}; form.dataset.uivPhase = 'succeeded'; })()`);
  await nextFrame(browser);
  assert.deepEqual(await saved(browser, "coding-a"), { text: "", context: "execute" });
  assert.deepEqual(await saved(browser, "coding-b"), { text: "两份草稿恰好相同", context: "plan" });
  assert.equal(await field(browser, "coding"), "两份草稿恰好相同");
  await switchCoding(browser, "coding-a");
  assert.equal(await field(browser, "coding"), "");
  assert.deepEqual(await browser.evaluate("errors"), []);
});


test("UIV-03 editing and retyping the same text during a send preserves the later draft", options, async t => {
  const browser = await openFixture(t); if (!browser) return;
  await browser.fill("#coding textarea", "下一轮仍然要说这句");
  await browser.click("#coding [data-coding-send]");
  await browser.wait("fixture.submissions.length === 1");
  await browser.fill("#coding textarea", "");
  await browser.fill("#coding textarea", "下一轮仍然要说这句");
  await browser.evaluate("document.querySelector('#coding').dataset.uivPhase = 'succeeded'");
  await nextFrame(browser);
  assert.equal(await field(browser, "coding"), "下一轮仍然要说这句");
  assert.equal((await saved(browser, "coding-a")).text, "下一轮仍然要说这句");
  await switchCoding(browser, "coding-b");
  await switchCoding(browser, "coding-a");
  assert.equal(await field(browser, "coding"), "下一轮仍然要说这句");
});
