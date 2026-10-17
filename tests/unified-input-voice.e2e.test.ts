import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, appendFileSync, chmodSync, constants, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createLocalFeedApplication, createLocalFeedSourceService, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";

const run = promisify(execFile);
const EXPECTED_DICTATION = "今天核对统一输入";

function voiceModelDir(): string {
  const modelDir = process.env.UIV_VOICE_MODEL_DIR?.replace(/\/+$/u, "") ?? "";
  if (!modelDir || !existsSync(modelDir)) return "";
  const stat = lstatSync(modelDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return "";
  if (!existsSync("/usr/bin/sandbox-exec")) return "";
  const known = process.env.UIV_KNOWN_WAV;
  if (known && existsSync(known)) return modelDir;
  if (existsSync("/usr/bin/say") && existsSync("/usr/bin/afconvert")) return modelDir;
  return "";
}
function directoryBytes(directory: string): number {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    total += entry.isDirectory() ? directoryBytes(full) : lstatSync(full).size;
  }
  return total;
}
function deniedHelper(helper: string, argvLog: string): string {
  const file = join(mkdtempSync(join(tmpdir(), "uiv-helper-")), "helper.mjs");
  const body = `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(argvLog)}, JSON.stringify({ denied: true, args }) + "\\n");
const child = spawn("/usr/bin/sandbox-exec", ["-p", "(version 1)(allow default)(deny network*)", ${JSON.stringify(helper)}, ...args], { stdio: ["ignore", "pipe", "pipe"] });
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.on("exit", code => process.exit(code ?? 1));
`;
  writeFileSync(file, body, { mode: 0o700 });
  chmodSync(file, 0o700);
  return file;
}
async function knownDictationWav(): Promise<Buffer> {
  const given = process.env.UIV_KNOWN_WAV;
  if (given && existsSync(given)) return readFileSync(given);
  const dir = mkdtempSync(join(tmpdir(), "uiv-known-"));
  const aiff = join(dir, "known.aiff");
  const wav = join(dir, "known.wav");
  await run("/usr/bin/say", ["-v", "Tingting", "-o", aiff, EXPECTED_DICTATION], { timeout: 30_000 });
  await run("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, wav], { timeout: 30_000 });
  return readFileSync(wav);
}

test("UIV-01 三个入口画出同一作曲条，键盘、浅色深色和窄屏可操作", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null, { async request(method, params) {
    if (method !== "turn/start") return method === "thread/turns/list" ? { data: [], nextCursor: null } : { thread: { id: params.threadId } };
    return { turn: { id: "uiv-turn" } };
  }, subscribe() { return () => undefined; } });
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId, localHost, reloadPage } = browser;
  assert.ok(localHost);
  const resources = await localHost.sessionResources();
  resources.registry.createSession({ runtime_id: "codex", native_runtime_session_id: "uiv-target", project_id: projectId, title: "统一输入会话", actor_id: "browser-test", user_confirmed: true });
  const feed = createLocalFeedApplication(browser.store.db);
  const source = createLocalFeedSourceService(browser.store.db, projectId).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "uiv-browser" }).source;
  const item = feed.ingestItem({ source, externalId: "uiv-browser", title: "统一输入这件事", summary: "用来打开首页对话", body: "正文留在事项里。", occurredAt: new Date().toISOString(), attention: false }).item;
  await feed.flushPendingJudgments();
  await localHost.withProject(molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId }), () => undefined);
  const errors = () => evaluate<string[]>("window.__uivErrors");
  const note = async (line: string) => {
    const dir = process.env.UIV_EVIDENCE_DIR;
    if (!dir) return;
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, "uiv-browser-notes.txt"), `${line}\n`);
  };
  if (process.env.UIV_EVIDENCE_DIR) { await mkdir(process.env.UIV_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.UIV_EVIDENCE_DIR, "uiv-browser-notes.txt"), ""); }
  const readComposer = () => evaluate<{ field: string; send: string; voice: string; value: string; disabled: boolean }>(`(() => { const form = document.querySelector('[data-assistant-composer]'); const field = document.querySelector('[data-assistant-input]'); return { field: form.querySelector('[data-uiv-field-state]')?.textContent || '', send: form.querySelector('[data-uiv-send-status]')?.textContent || '', voice: form.querySelector('[data-uiv-voice-status]')?.textContent || '', value: field.value, disabled: !!field.disabled }; })()`);
  const shot = async (name = "uiv-composer.png") => {
    const image = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    const bytes = Buffer.from(image.data, "base64");
    assert.ok(bytes.length > 8_000, "the composer screenshot has pixels");
    const dir = process.env.UIV_EVIDENCE_DIR;
    if (dir) { await mkdir(dir, { recursive: true }); await writeFile(join(dir, name), bytes); }
  };
  const measure = async (label: string, parts: Array<"assistant" | "coding" | "home">) => {
    const box = await evaluate<{ assistant: number; assistantInner: number; assistantField: number; assistantAttach: number; assistantFieldBottom: number; assistantFieldTop: number; assistantAttachMid: number; assistantFieldMid: number; barTop: number; barBottom: number; pinBottom: number; coding: number; codingInner: number; codingField: number; codingModel: number; home: number; homeInner: number; homeField: number; viewport: number }>(`(() => {
      const metrics = (selector) => { const node = document.querySelector(selector); if (!node || node.hidden || node.closest("[hidden]")) return { outer: 0, inner: 0 }; return { outer: node.getBoundingClientRect().width, inner: node.clientWidth }; };
      const assistant = metrics("[data-assistant-composer]");
      const coding = metrics("[data-coding-composer] .coding-composer-shell");
      const home = metrics("[data-home-talk-form]");
      const field = (selector) => { const node = document.querySelector(selector); if (!node || node.hidden || node.closest("[hidden]")) return 0; return node.getBoundingClientRect().width; };
      const widthOf = (selector) => { const node = document.querySelector(selector); if (!node) return 0; const picker = node.closest(".mw-select-picker"); const trigger = picker ? picker.querySelector(".mw-select-picker__trigger") : null; const target = trigger && trigger.getBoundingClientRect().width > 0 ? trigger : node; if (target.hidden || target.closest("[hidden]")) return 0; return target.getBoundingClientRect().width; };
      const rectOf = (selector) => { const node = document.querySelector(selector); if (!node) return { top: 0, bottom: 0, height: 0 }; const rect = node.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, height: rect.height }; };
      const assistantFieldRect = rectOf("[data-assistant-input]");
      const assistantAttachRect = rectOf("[data-assistant-attach]");
      const barRect = rectOf(".workbench-bar");
      const pinRect = rectOf(".dock-pin");
      return { assistant: assistant.outer, assistantInner: assistant.inner, assistantField: field("[data-assistant-input]"), assistantAttach: widthOf("[data-assistant-attach]"), assistantFieldTop: assistantFieldRect.top, assistantFieldBottom: assistantFieldRect.bottom, assistantFieldMid: assistantFieldRect.top + assistantFieldRect.height / 2, assistantAttachMid: assistantAttachRect.top + assistantAttachRect.height / 2, barTop: barRect.top, barBottom: barRect.bottom, pinBottom: pinRect.bottom, coding: coding.outer, codingInner: coding.inner, codingField: field("[data-coding-task]"), codingModel: widthOf("[data-coding-composer] [data-coding-model]"), home: home.outer, homeInner: home.inner, homeField: field("[data-home-talk-form] textarea"), viewport: innerWidth };
    })()`);
    if (parts.includes("assistant")) {
      assert.ok(box.assistantInner > 0, `${label} assistant composer is on screen`);
      assert.ok(box.assistantField > 40, `${label} assistant field ${box.assistantField} of ${box.assistantInner}`);
      assert.ok(box.assistantFieldBottom <= box.barBottom + 1 && box.assistantFieldTop >= box.barTop - 1, `${label} assistant field stays inside the dock ${box.assistantFieldTop}-${box.assistantFieldBottom} bar ${box.barTop}-${box.barBottom}`);
      assert.ok(box.pinBottom <= box.barBottom + 1, `${label} dock icon stays inside the bar ${box.pinBottom} of ${box.barBottom}`);
      assert.ok(box.assistantAttach > 0 && box.assistantAttach < box.assistantField, `${label} attach stays beside the field`);
      assert.ok(box.assistantAttachMid >= box.assistantFieldBottom && box.assistantAttachMid < box.barBottom, `${label} attach is reachable below the multiline field`);
      if (box.viewport <= 720) assert.ok(box.assistant >= box.viewport * 0.8, `${label} assistant composer ${box.assistant} of viewport ${box.viewport}`);
    }
    if (parts.includes("coding")) {
      assert.ok(box.codingInner > 0, `${label} coding composer is on screen`);
      assert.ok(box.codingField >= box.codingInner * 0.7, `${label} coding field ${box.codingField} of ${box.codingInner}`);
      assert.ok(box.codingModel > 0 && box.codingModel < box.codingField, `${label} model control stays beside the field`);
      if (box.viewport <= 720) assert.ok(box.coding >= box.viewport * 0.8, `${label} coding composer ${box.coding} of viewport ${box.viewport}`);
    }
    if (parts.includes("home")) {
      assert.ok(box.homeInner > 0, `${label} home composer is on screen`);
      assert.ok(box.homeField >= box.homeInner * 0.7, `${label} home field ${box.homeField} of ${box.homeInner}`);
      if (box.viewport <= 720) assert.ok(box.home >= box.viewport * 0.8, `${label} home composer ${box.home} of viewport ${box.viewport}`);
    }
  };
  const event = `[data-home-subject-kind="feed_item"][data-home-subject-id="${item.item_id}"]`;
  const codingReady = "document.querySelector('[data-coding-task]') instanceof HTMLTextAreaElement && !document.querySelector('[data-coding-task]').disabled && document.querySelector('[data-coding-composer] .coding-composer-shell').getBoundingClientRect().width > 0";
  const dismissAssistantPanel = async () => {
    const open = await evaluate<boolean>("(() => { const panel = document.querySelector('[data-assistant-panel]'); return !!panel && !panel.hidden; })()");
    if (!open) return;
    await click("[data-assistant-panel-close]");
    await waitFor("document.querySelector('[data-assistant-panel]').hidden");
  };
  const showCoding = async () => {
    await dismissAssistantPanel();
    // Open the menu through its real button before scrolling a row; opening it can resize the focused composer.
    if (await evaluate("document.querySelector('[data-plugin-picker-popover]').hidden")) await click('[data-plugin-picker-toggle]');
    await waitFor("Math.abs(parseFloat(getComputedStyle(document.body).getPropertyValue('--dock-h'))-document.querySelector('.workbench-bar').getBoundingClientRect().height)<1");
    await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
    await waitFor("!document.querySelector('[data-coding-workbench]').hidden");
    await waitFor(`(${codingReady}) || !!document.querySelector('[data-coding-session]')?.getClientRects().length || !!document.querySelector('[data-coding-new]')?.getClientRects().length`);
    if (await evaluate(codingReady)) return;
    const sessionVisible = await evaluate<boolean>("!!document.querySelector('[data-coding-session]')?.getClientRects().length");
    if (sessionVisible) await click("[data-coding-session]");
    else await click("[data-coding-new]");
    await waitFor(codingReady);
  };
  const showHome = async () => {
    await click(`[data-plugin-strip] [data-plugin-id="home"]`);
    await waitFor(`!!document.querySelector(${JSON.stringify(event)})`);
    await click(event);
    await evaluate("document.querySelector('[data-home-open-talk]')?.scrollIntoView({block:'center',inline:'nearest'})");
    const placed = await evaluate<string>(`(() => { const button = document.querySelector('[data-home-open-talk]'); const form = document.querySelector('[data-assistant-composer]'); const box = (node) => { const rect = node.getBoundingClientRect(); return [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value)).join(','); }; const rect = button.getBoundingClientRect(); const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return 'viewport ' + innerWidth + 'x' + innerHeight + ' button ' + box(button) + ' form ' + box(form) + ' hit ' + (hit === button || button.contains(hit) ? 'button' : (hit?.className || hit?.tagName || 'none')); })()`);
    assert.match(placed, /hit button$/, placed);
    await click("[data-home-open-talk]");
    await waitFor("document.querySelector('[data-home-talk-form] textarea') && !document.querySelector('[data-home-talk-form]').closest('[hidden]')");
  };
  const openSurfaces = async (label: string) => {
    await waitFor("document.querySelector('[data-dock] [data-assistant-input]') instanceof HTMLTextAreaElement");
    await showCoding();
    await measure(`${label}-coding`, ["coding"]);
    await showHome();
    await waitFor("document.querySelectorAll('[data-uiv-mic]').length >= 3");
    await measure(label, ["assistant", "home"]);
  };
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.__uivErrors=[];addEventListener('error',event=>window.__uivErrors.push(event.message));addEventListener('unhandledrejection',event=>window.__uivErrors.push(String(event.reason)));" }, sessionId);
  // Captured once when the page boots. A later assignment does not change the recorder the composer already closed over.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { class UivFakeRecorder extends EventTarget { constructor(stream, options) { super(); this.stream = stream; this.state = "inactive"; this.mimeType = (options && options.mimeType) || "audio/webm"; } static isTypeSupported(type) { return type === "audio/webm" || type === "audio/mp4" || type === "audio/wav"; } start() { this.state = "recording"; } stop() { if (this.state === "inactive") return; this.state = "inactive"; const available = new Event("dataavailable"); const samples = 800; const dataSize = samples * 2; const buffer = new ArrayBuffer(44 + dataSize); const view = new DataView(buffer); const write = (offset, text) => { for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index)); }; write(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, dataSize, true); Object.defineProperty(available, "data", { value: new Blob([buffer], { type: "audio/wav" }) }); this.dispatchEvent(available); this.dispatchEvent(new Event("stop")); } } try { window.MediaRecorder = UivFakeRecorder; } catch { Object.defineProperty(window, "MediaRecorder", { configurable: true, writable: true, value: UivFakeRecorder }); } })();` }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await openSurfaces("desktop");
  const applyTheme = (value: string) => evaluate(`localStorage.setItem('molis-work:theme',${JSON.stringify(value)});window.dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:${JSON.stringify(value)}}))`);
  await applyTheme("light");
  const light = await evaluate<string>("getComputedStyle(document.querySelector('[data-assistant-input]')).color");
  await applyTheme("dark");
  const dark = await evaluate<string>("getComputedStyle(document.querySelector('[data-assistant-input]')).color");
  assert.notEqual(light, dark, "light and dark text colors differ");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-assistant-composer] [data-uiv-mic]')).display !== 'none'"), true);
  await applyTheme("light");
  const labels = await evaluate<string[]>(`[...document.querySelectorAll('form.uiv-composer [data-uiv-field-state]')].map(node => node.textContent || '')`);
  assert.ok(labels.length >= 3, "each composer has a text field state");
  for (const label of labels) assert.match(label, /空白|正在输入|已有草稿|现在不可用|处理中|失败/, label);
  await note(`field-states-before ${labels.join("|")}`);
  await evaluate("document.querySelector('[data-assistant-input]').focus()");
  await command("Input.insertText", { text: "统一这句" }, sessionId);
  assert.equal((await readComposer()).field, "已有草稿");
  const composing = await evaluate<{ isComposing: boolean; keyCode: number; status: string; value: string; before: string }>(`(() => { const field = document.querySelector('[data-assistant-input]'); const before = field.value; let seen = { isComposing: false, keyCode: 0 }; const capture = (event) => { seen = { isComposing: event.isComposing, keyCode: event.keyCode }; }; document.addEventListener('keydown', capture, true); field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, ctrlKey: true, isComposing: true })); document.removeEventListener('keydown', capture, true); return { isComposing: seen.isComposing, keyCode: seen.keyCode, status: document.querySelector('[data-assistant-composer] [data-uiv-send-status]').textContent, value: field.value, before }; })()`);
  assert.equal(composing.isComposing, true, "the dispatched Enter carried isComposing");
  assert.equal(composing.value, composing.before, "an IME composition Enter does not send");
  assert.equal(composing.status, "", "composition Enter does not start sending");
  await note(`composition isComposing=${composing.isComposing} keyCode=${composing.keyCode}`);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  assert.match(await evaluate<string>("document.querySelector('[data-assistant-input]').value"), /统一这句\n/);
  await evaluate(`(() => { const deny = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")); if (!navigator.mediaDevices) return; try { navigator.mediaDevices.getUserMedia = deny; } catch { Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: deny }); } })()`);
  await click("[data-assistant-composer] [data-uiv-mic]");
  await waitFor("document.querySelector('[data-assistant-composer] [data-uiv-voice-status]').textContent.length > 0");
  assert.equal(await evaluate("document.querySelector('[data-assistant-composer] [data-uiv-stop-record]').hidden"), true, "recording chrome stays hidden without a microphone and a prepared model");
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-assistant-composer] [data-uiv-voice-status]').textContent"), /云端识别|上传识别/);
  // UI contract fixture: Linux does not ship the macOS helper. Native model probing and transcription are exercised separately below.
  await evaluate(`(() => { const real=window.fetch.bind(window); window.fetch=async(input,init)=>{const url=typeof input==='string'?input:input.url; if(url.includes('/api/local-voice') && init?.body?.includes('"op":"probe"')) return new Response(JSON.stringify({model:'missing'}),{status:200,headers:{'content-type':'application/json'}}); return real(input,init);}; })()`);
  await evaluate(`(() => { const allow = () => Promise.resolve(new MediaStream()); const devices = navigator.mediaDevices; if (!devices) throw new Error("mediaDevices missing"); try { devices.getUserMedia = allow; } catch { Object.defineProperty(devices, "getUserMedia", { configurable: true, value: allow }); } })()`);
  await click("[data-assistant-composer] [data-uiv-mic]");
  await waitFor("!document.querySelector('[data-assistant-composer] [data-uiv-download]').hidden");
  assert.equal(await evaluate("document.querySelector('[data-assistant-composer] [data-uiv-stop-record]').hidden"), true, "stop stays hidden until a model is available");
  assert.equal(await evaluate<string>("document.querySelector('[data-assistant-composer] [data-uiv-download]').textContent.trim()"), "下载");
  assert.match(await evaluate<string>("document.querySelector('[data-assistant-composer] [data-uiv-voice-status]').textContent"), /本地识别需要下载模型/);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-assistant-composer] [data-uiv-voice-status]').textContent"), /云端识别|上传识别/);
  // UI only. An empty stream and a probe answer of {model:"available"} paint the shipped stop and cancel. This is not UIV-05 or UIV-08 工程通过.
  await evaluate(`(() => { const real = window.fetch.bind(window); window.fetch = async (input, init) => { const url = typeof input === "string" ? input : (input && input.url) || ""; const body = init && typeof init.body === "string" ? init.body : ""; if (window.__uivThrowAssistantSend && url.includes("/api/assistant/send")) throw new TypeError("Failed to fetch"); if (url.includes("/api/local-voice") && body.includes('"op":"probe"')) return new Response(JSON.stringify({ model: "available" }), { status: 200, headers: { "content-type": "application/json" } }); if (url.includes("/api/local-voice") && body.includes('"op":"transcribe"')) { await new Promise(resolve => setTimeout(resolve, 800)); return real(input, init); } return real(input, init); }; const allow = () => Promise.resolve(new MediaStream()); const devices = navigator.mediaDevices; if (!devices) throw new Error("mediaDevices missing"); try { devices.getUserMedia = allow; } catch { Object.defineProperty(devices, "getUserMedia", { configurable: true, value: allow }); } })()`);
  await click("[data-assistant-composer] [data-uiv-mic]");
  await waitFor("!document.querySelector('[data-assistant-composer] [data-uiv-stop-record]').hidden && !document.querySelector('[data-assistant-composer] [data-uiv-cancel-record]').hidden");
  const chrome = await evaluate<{ stopText: string; cancelText: string; stopBox: number; cancelBox: number; aiText: string; codingText: string; codingTitle: string; same: boolean; status: string }>(`(() => { const stop = document.querySelector('[data-assistant-composer] [data-uiv-stop-record]'); const cancel = document.querySelector('[data-assistant-composer] [data-uiv-cancel-record]'); const ai = document.querySelector('[data-assistant-control="stop"]'); const coding = document.querySelector('[data-coding-stop]'); const width = (node) => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 ? rect.width : 0; }; return { stopText: stop.textContent.trim(), cancelText: cancel.textContent.trim(), stopBox: width(stop), cancelBox: width(cancel), aiText: ai ? ai.textContent.trim() : "", codingText: coding ? coding.textContent.trim() : "", codingTitle: coding ? (coding.getAttribute("title") || "") : "", same: stop === ai || stop === coding || stop.hasAttribute("data-assistant-control") || stop.hasAttribute("data-coding-stop"), status: document.querySelector('[data-assistant-composer] [data-uiv-voice-status]').textContent }; })()`);
  assert.equal(chrome.stopText, "停止录音");
  assert.equal(chrome.cancelText, "取消录音");
  assert.ok(chrome.stopBox > 0, "stop recording is on screen");
  assert.ok(chrome.cancelBox > 0, "cancel recording is on screen");
  assert.notEqual(chrome.stopText, chrome.aiText, "stop recording is not the assistant stop-AI label");
  assert.notEqual(chrome.stopText, chrome.codingText, "stop recording is not the coding stop-AI label");
  assert.match(chrome.codingTitle, /停止这一轮/);
  assert.equal(chrome.same, false);
  assert.match(chrome.status, /正在录音/);
  assert.doesNotMatch(chrome.status, /云端识别|上传识别/);
  const recording = await readComposer();
  assert.equal(recording.field, "处理中", recording.voice);
  await note(`recording field=${recording.field} voice=${recording.voice}`);
  await shot();
  await click("[data-assistant-composer] [data-uiv-cancel-record]");
  await waitFor("document.querySelector('[data-assistant-composer] [data-uiv-stop-record]').hidden && document.querySelector('[data-assistant-composer] [data-uiv-cancel-record]').hidden");
  assert.match(await evaluate<string>("document.querySelector('[data-assistant-input]').value"), /统一这句/);
  await waitFor("!document.querySelector('[data-assistant-composer] [data-uiv-mic]').hidden");
  await click("[data-assistant-composer] [data-uiv-mic]");
  await waitFor("!document.querySelector('[data-assistant-composer] [data-uiv-stop-record]').hidden");
  await click("[data-assistant-composer] [data-uiv-stop-record]");
  await waitFor("document.querySelector('[data-assistant-composer] [data-uiv-voice-status]').textContent.includes('正在转写')");
  const edited = await evaluate<{ ok: boolean; status: string; value: string }>(`(() => { const field = document.querySelector('[data-assistant-input]'); const status = document.querySelector('[data-assistant-composer] [data-uiv-voice-status]').textContent; const next = field.value + '改过'; field.value = next; field.dispatchEvent(new Event('input', { bubbles: true })); return { ok: status.includes('正在转写') && !field.disabled && field.value === next, status, value: field.value }; })()`);
  assert.equal(edited.ok, true, edited.status);
  await waitFor(`(() => { const text = document.querySelector('[data-assistant-composer] [data-uiv-voice-status]').textContent; return text.includes('本地识别需要下载模型') || text.includes('等待用户明确选择') || text.includes('未听清') || text.includes('转写没有成功') || text.includes('音频无效'); })()`);
  const transcribed = await readComposer();
  assert.match(transcribed.value, /统一这句\n改过/);
  assert.doesNotMatch(transcribed.value, /whisper|fixture transcript|听写结果/);
  await note(`transcribe-inflight field=${transcribed.field} voice=${transcribed.voice} value=${JSON.stringify(transcribed.value)}`);
  const leave = await evaluate<string>(`(() => { const form = document.querySelector('[data-assistant-composer]'); const cancel = form.querySelector('[data-uiv-cancel-record]'); const discard = form.querySelector('[data-uiv-discard]'); if (cancel && !cancel.hidden) return 'cancel'; if (discard && !discard.hidden) return 'discard'; return ''; })()`);
  assert.ok(leave === "cancel" || leave === "discard", transcribed.voice);
  await click(`[data-assistant-composer] [data-uiv-${leave === "cancel" ? "cancel-record" : "discard"}]`);
  await waitFor("document.querySelector('[data-assistant-composer] [data-uiv-stop-record]').hidden");
  assert.match((await readComposer()).value, /改过/);
  await evaluate("document.querySelector('[data-assistant-input]').focus()");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, sessionId);
  await waitFor("document.querySelector('[data-assistant-composer] [data-uiv-send-status]').textContent.includes('发送失败')");
  const failed = await readComposer();
  const problem = await evaluate<string>("document.querySelector('.assistant-problem')?.textContent || ''");
  assert.match(failed.value, /统一这句/);
  assert.match(failed.send, /发送失败/);
  assert.equal(failed.field, "失败");
  await note(`send-failed field=${failed.field} send=${failed.send} problem=${problem.replace(/\\s+/g, " ").trim()}`);
  await evaluate("window.__uivThrowAssistantSend = true; document.querySelector('[data-assistant-input]').focus()");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, sessionId);
  await waitFor("document.querySelector('[data-assistant-composer] [data-uiv-send-status]').textContent.includes('是否送到还不确定')");
  const uncertain = await readComposer();
  assert.match(uncertain.value, /统一这句/);
  assert.match(uncertain.send, /是否送到还不确定/);
  await note(`send-uncertain field=${uncertain.field} send=${uncertain.send} value=${JSON.stringify(uncertain.value)}`);
  await command("Emulation.setDeviceMetricsOverride", { width: 600, height: 900, deviceScaleFactor: 1, mobile: true }, sessionId);
  await openSurfaces("narrow");
  await shot("uiv-composer-narrow.png");
  assert.deepEqual(await errors(), []);
  await reloadPage();
  await waitFor("document.querySelector('[data-assistant-input]') instanceof HTMLTextAreaElement && document.querySelector('[data-assistant-input]').value.includes('统一这句')");
  const restored = await evaluate<string>("document.querySelector('[data-assistant-input]').value");
  assert.match(restored, /统一这句/);
  await note(`restored ${JSON.stringify(restored)}`);
  await openSurfaces("again");
  assert.equal(await evaluate("document.querySelectorAll('form.uiv-composer').length >= 3"), true);
  assert.deepEqual(await errors(), []);
});

test("UIV-05 注入已知音频，停止后草稿无时间戳，再修改并发送", {
  timeout: 300_000,
  skip: voiceModelDir() ? false : "prepared local model, sandbox-exec, or a known wav is absent; a skip is not 工程通过",
}, async t => {
  // The recorder only supplies the wav. Probe and transcribe stay on the delivered server, and the helper is network-denied. A skip is not a pass.
  const modelDir = voiceModelDir();
  assert.ok(modelDir);
  const helper = process.env.UIV_JELLY_WHISPER_HELPER
    || fileURLToPath(new URL("../apps/local-host/native/materials/bin/jelly-whisper", import.meta.url));
  accessSync(helper, constants.X_OK);
  const wav = await knownDictationWav();
  const sha256 = createHash("sha256").update(wav).digest("hex");
  const argvLog = join(mkdtempSync(join(tmpdir(), "uiv-argv-")), "argv.log");
  writeFileSync(argvLog, "");
  const wrapped = deniedHelper(helper, argvLog);
  const note = async (line: string) => {
    const dir = process.env.UIV_EVIDENCE_DIR;
    if (!dir) return;
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, "uiv-browser-voice.txt"), `${line}\n`);
  };
  await note(`wav bytes=${wav.length} sha256=${sha256} expected=${EXPECTED_DICTATION}`);
  const previous = process.env.MOLIS_JELLY_WHISPER_HELPER;
  process.env.MOLIS_JELLY_WHISPER_HELPER = wrapped;
  try {
    const browser = await openGoalBrowser(t, "seeded", undefined, null, { async request(method, params) {
      if (method !== "turn/start") return method === "thread/turns/list" ? { data: [], nextCursor: null } : { thread: { id: params.threadId } };
      return { turn: { id: "uiv-voice-turn" } };
    }, subscribe() { return () => undefined; } });
    if (!browser) return;
    await issueModel(t, browser.homeDirectory, { replyText: "已收到这句。" });
    const home = realpathSync(browser.homeDirectory);
    const models = join(home, "lingguang", "models");
    mkdirSync(join(home, "lingguang"), { recursive: true, mode: 0o700 });
    try {
      await run("/bin/cp", ["-cR", modelDir, models], { timeout: 60_000 });
    } catch {
      await run("/bin/rm", ["-rf", models], { timeout: 60_000 });
      await run("/bin/cp", ["-R", modelDir, models], { timeout: 180_000 });
    }
    const copied = lstatSync(models);
    assert.equal(copied.isSymbolicLink(), false);
    assert.equal(copied.isDirectory(), true);
    assert.equal(realpathSync(models), models);
    assert.ok(directoryBytes(models) > 100_000_000, "copied model cache is a real directory");
    const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId } = browser;
    const snapshot = () => evaluate<{ value: string; voice: string; field: string; send: string }>(`(() => { const form = document.querySelector('[data-assistant-composer]'); const field = document.querySelector('[data-assistant-input]'); return { value: field ? field.value : '', voice: form?.querySelector('[data-uiv-voice-status]')?.textContent || '', field: form?.querySelector('[data-uiv-field-state]')?.textContent || '', send: form?.querySelector('[data-uiv-send-status]')?.textContent || '' }; })()`);
    const source = `(() => { const wav = Uint8Array.from(atob(${JSON.stringify(wav.toString("base64"))}), c => c.charCodeAt(0)); class UivKnownRecorder extends EventTarget { constructor(stream, options) { super(); this.stream = stream; this.state = "inactive"; this.mimeType = (options && options.mimeType) || "audio/wav"; } static isTypeSupported(type) { return type === "audio/webm" || type === "audio/mp4" || type === "audio/wav"; } start() { this.state = "recording"; } stop() { if (this.state === "inactive") return; this.state = "inactive"; const available = new Event("dataavailable"); Object.defineProperty(available, "data", { value: new Blob([wav], { type: "audio/wav" }) }); this.dispatchEvent(available); this.dispatchEvent(new Event("stop")); } } try { window.MediaRecorder = UivKnownRecorder; } catch { Object.defineProperty(window, "MediaRecorder", { configurable: true, writable: true, value: UivKnownRecorder }); } })();`;
    await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.__uivErrors=[];addEventListener('error',event=>window.__uivErrors.push(event.message));addEventListener('unhandledrejection',event=>window.__uivErrors.push(String(event.reason)));" }, sessionId);
    await command("Page.addScriptToEvaluateOnNewDocument", { source }, sessionId);
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
    await waitFor("document.querySelector('[data-dock] [data-assistant-input]') instanceof HTMLTextAreaElement");
    await evaluate("(() => { const field = document.querySelector('[data-assistant-input]'); field.value = ''; field.dispatchEvent(new Event('input', { bubbles: true })); })()");
    assert.equal(await evaluate("document.querySelector('[data-assistant-input]').value"), "");
    await evaluate("(() => { const allow = () => Promise.resolve(new MediaStream()); const devices = navigator.mediaDevices; if (!devices) throw new Error('mediaDevices missing'); try { devices.getUserMedia = allow; } catch { Object.defineProperty(devices, 'getUserMedia', { configurable: true, value: allow }); } })()");
    await click("[data-assistant-composer] [data-uiv-mic]");
    try {
      await waitFor("!document.querySelector('[data-assistant-composer] [data-uiv-stop-record]').hidden", 30_000);
    } catch (error) {
      const stuck = await snapshot();
      await note(`stop-hidden field=${stuck.field} voice=${stuck.voice} value=${JSON.stringify(stuck.value)}`);
      throw error;
    }
    assert.equal(await evaluate<string>("document.querySelector('[data-assistant-composer] [data-uiv-stop-record]').textContent.trim()"), "停止录音");
    await click("[data-assistant-composer] [data-uiv-stop-record]");
    const settled = `(() => { const value = document.querySelector('[data-assistant-input]').value; const voice = document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || ''; return value === ${JSON.stringify(EXPECTED_DICTATION)} || (voice.length > 0 && !voice.includes('正在转写') && !voice.includes('正在录音')); })()`;
    try {
      await waitFor(settled, 150_000);
    } catch (error) {
      const stuck = await snapshot();
      await note(`transcript-timeout field=${stuck.field} voice=${stuck.voice} value=${JSON.stringify(stuck.value)}`);
      throw error;
    }
    const landed = await snapshot();
    const argv = readFileSync(argvLog, "utf8");
    await note(`draft field=${landed.field} voice=${landed.voice} value=${JSON.stringify(landed.value)} argv_denied=${argv.includes('"denied":true')} argv_http=${argv.includes("http")} argv_allow_download=${argv.includes("--allow-model-download")} argv_extract=${argv.includes('"extract"')}`);
    assert.equal(argv.includes('"denied":true'), true);
    assert.equal(argv.includes("http"), false);
    assert.equal(argv.includes("--allow-model-download"), false);
    assert.equal(argv.includes('"extract"'), true);
    assert.equal(landed.value, EXPECTED_DICTATION, landed.voice);
    assert.doesNotMatch(landed.value, /\[\d+\.\d{2}/u);
    assert.doesNotMatch(landed.voice, /云端识别|上传识别/);
    const edited = `${EXPECTED_DICTATION}，改过`;
    await evaluate(`(() => { const field = document.querySelector('[data-assistant-input]'); field.value = ${JSON.stringify(edited)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    assert.equal((await snapshot()).value, edited);
    await evaluate("document.querySelector('[data-assistant-input]').focus()");
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, sessionId);
    try {
      await waitFor("(() => { const field = document.querySelector('[data-assistant-input]'); const send = document.querySelector('[data-assistant-composer] [data-uiv-send-status]')?.textContent || ''; return !!field && field.value === '' && send.includes('已发送') && !send.includes('正在发送'); })()", 60_000);
    } catch (error) {
      const stuck = await snapshot();
      const stuckProblem = await evaluate<string>("(document.querySelector('.assistant-problem')?.textContent || '').replace(/\\s+/g, ' ').trim()");
      await note(`send-timeout field=${stuck.field} send=${stuck.send} voice=${stuck.voice} value=${JSON.stringify(stuck.value)} problem=${stuckProblem}`);
      throw error;
    }
    const sent = await snapshot();
    const problem = await evaluate<string>("(document.querySelector('.assistant-problem')?.textContent || '').replace(/\\s+/g, ' ').trim()");
    const stored = await evaluate<string>("[...Array(localStorage.length)].map((_, index) => localStorage.key(index)).filter(key => key && key.startsWith('molis.uiv.v1:') && key.includes(':assistant:')).map(key => localStorage.getItem(key) || '').join('\\n')");
    await note(`send-cleared field=${sent.field} send=${sent.send} voice=${sent.voice} value=${JSON.stringify(sent.value)} problem=${problem} stored=${JSON.stringify(stored)}`);
    assert.match(sent.send, /已发送/);
    assert.doesNotMatch(sent.send, /正在发送/);
    assert.equal(sent.value, "");
    assert.equal(problem.includes("无法开始工作"), false, problem);
    assert.equal(stored.includes(edited), false, stored);
    assert.deepEqual(await evaluate<string[]>("window.__uivErrors"), []);
  } finally {
    if (previous == null) delete process.env.MOLIS_JELLY_WHISPER_HELPER;
    else process.env.MOLIS_JELLY_WHISPER_HELPER = previous;
  }
});

test("UIV-01 UIV-02 UIV-03 UIV-11 三入口补齐不可用、键盘、回执与截图", { timeout: 180_000 }, async t => {
  // Drives the shipped composers. A CDP composition is not the macOS candidate window. A fake stream only paints recording chrome for screenshots and is not UIV-05.
  let release: ((value: { turn: { id: string } }) => void) | undefined;
  let runtimeMode: "accept" | "unknown" | "delay" | "reject" = "accept";
  const turns: Array<Record<string, unknown>> = [];
  t.after(() => { release?.({ turn: { id: "uiv-gap-cleanup" } }); });
  const browser = await openGoalBrowser(t, "seeded", undefined, null, { async request(method, params) {
    if (method !== "turn/start") return method === "thread/turns/list" ? { data: [], nextCursor: null } : { thread: { id: params.threadId } };
    turns.push(params as Record<string, unknown>);
    if (runtimeMode === "reject") throw Object.assign(new Error("fixture definite rejection"), { deliveryAccepted: false, retryable: true });
    if (runtimeMode === "unknown") throw new Error("fixture connection lost");
    if (runtimeMode === "delay") return await new Promise(resolve => { release = resolve; });
    return { turn: { id: `uiv-gap-${turns.length}` } };
  }, subscribe() { return () => undefined; } });
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId, localHost } = browser;
  assert.ok(localHost);
  const resources = await localHost.sessionResources();
  const chosen = resources.registry.createSession({ runtime_id: "codex", native_runtime_session_id: "uiv-gap-target", project_id: projectId, title: "统一输入补齐会话", actor_id: "browser-test", user_confirmed: true });
  const feed = createLocalFeedApplication(browser.store.db);
  const source = createLocalFeedSourceService(browser.store.db, projectId).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "uiv-gap" }).source;
  const item = feed.ingestItem({ source, externalId: "uiv-gap", title: "统一输入补齐这件事", summary: "用来打开首页对话", body: "正文留在事项里。", occurredAt: new Date().toISOString(), attention: false }).item;
  await feed.flushPendingJudgments();
  await localHost.withProject(molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId }), () => undefined);
  const note = async (line: string) => {
    t.diagnostic(line);
    const dir = process.env.UIV_EVIDENCE_DIR;
    if (!dir) return;
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, "uiv-gaps.txt"), `${line}\n`);
  };
  const shot = async (name: string) => {
    const image = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    const bytes = Buffer.from(image.data, "base64");
    assert.ok(bytes.length > 8_000, `${name} has pixels`);
    const dir = process.env.UIV_EVIDENCE_DIR;
    if (dir) { await mkdir(dir, { recursive: true }); await writeFile(join(dir, name), bytes); }
    await note(`shot ${name} bytes=${bytes.length}`);
  };
  const waitNoted = async (expr: string, timeout = 20_000) => {
    try { await waitFor(expr, timeout); }
    catch (error) {
      const html = await evaluate<string>(`JSON.stringify({ errors: window.__uivErrors, dock: document.querySelector('[data-work-surface=home]')?.dataset.dock || '', talkHidden: document.querySelector('[data-home-talk]')?.hidden ?? null, bar: !!document.querySelector('.home-detail__primary'), pressed: document.querySelector('[data-home-open-talk]')?.getAttribute('aria-pressed') || '', homeStatus: document.querySelector('.home-talk-status')?.textContent || '', homeError: document.querySelector('.home-talk-error')?.textContent || '', homeValue: document.querySelector('[data-home-talk-form] textarea')?.value || '', homeDisabled: !!document.querySelector('[data-home-talk-form] textarea')?.disabled, homeField: document.querySelector('[data-home-talk-form] [data-uiv-field-state]')?.textContent || '', homeSend: document.querySelector('[data-home-talk-form] [data-uiv-send-status]')?.textContent || '', codingDisabled: !!document.querySelector('[data-coding-task]')?.disabled, codingField: document.querySelector('[data-coding-composer] [data-uiv-field-state]')?.textContent || '', codingSend: document.querySelector('[data-coding-composer] [data-uiv-send-status]')?.textContent || '', codingStatus: document.querySelector('[data-coding-status]')?.textContent || '', assistantSend: document.querySelector('[data-assistant-composer] [data-uiv-send-status]')?.textContent || '', voice: document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '' })`);
      await note(`wait-failed ${expr} ${html}`);
      throw error;
    }
  };
  const read = (form: string, field: string) => evaluate<{ field: string; send: string; value: string; disabled: boolean; sendDisabled: boolean; visible: boolean }>(`(() => { const form = document.querySelector(${JSON.stringify(form)}); const field = document.querySelector(${JSON.stringify(field)}); const submit = form ? form.querySelector('[data-assistant-send], [data-coding-send], button[type=submit]') : null; const rect = field ? field.getBoundingClientRect() : { width: 0, height: 0 }; return { field: form?.querySelector('[data-uiv-field-state]')?.textContent || '', send: form?.querySelector('[data-uiv-send-status]')?.textContent || '', value: field?.value || '', disabled: !!field?.disabled, sendDisabled: !!submit?.disabled, visible: rect.width > 0 && rect.height > 0 }; })()`);
  const focus = (selector: string) => evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  const activate = async (selector: string) => {
    const point = await evaluate<{ x: number; y: number; how: string }>(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return { x: 0, y: 0, how: 'missing' }; element.scrollIntoView({ block: 'nearest' }); const rect = element.getBoundingClientRect(); if (rect.width > 0 && rect.height > 0) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, how: 'pointer' }; if (element instanceof HTMLElement) { element.click(); return { x: 0, y: 0, how: 'dom-click' }; } return { x: 0, y: 0, how: 'hidden' }; })()`);
    await note(`activate ${selector} ${point.how} ${point.x},${point.y}`);
    if (point.how === 'missing' || point.how === 'hidden') throw new Error(`cannot activate ${selector}: ${point.how}`);
    if (point.how === 'dom-click') return;
    await command("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 }, sessionId);
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 }, sessionId);
  };
  const setValue = (selector: string, value: string) => evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)}); field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const ctrlEnter = async () => {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, sessionId);
  };
  const newline = async () => {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", windowsVirtualKeyCode: 13 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  };
  const blankAndNewline = async (selector: string, form: string, sentence: string) => {
    await focus(selector);
    await setValue(selector, "   ");
    await ctrlEnter();
    await waitNoted(`(document.querySelector(${JSON.stringify(form)})?.querySelector('[data-uiv-send-status]')?.textContent || '').includes('没有可发送的文字')`);
    const blank = await read(form, selector);
    assert.match(blank.send, /没有可发送的文字/);
    assert.equal(blank.value.trim(), "");
    await setValue(selector, "");
    await focus(selector);
    await command("Input.insertText", { text: sentence }, sessionId);
    await newline();
    const lined = await read(form, selector);
    assert.match(lined.value, new RegExp(`${sentence}\\n`));
    assert.equal(lined.send.includes("正在发送"), false);
    await note(`keys ${form} blank=${blank.send} newline=${JSON.stringify(lined.value)}`);
    return lined;
  };
  const compose = async (selector: string, form: string) => {
    const outcome: { error: string; keys: Array<{ key: string; keyCode: number; isComposing: boolean }>; afterEnter: string; afterCommit: string; send: string; imeUi: number } = { error: "", keys: [], afterEnter: "", afterCommit: "", send: "", imeUi: 0 };
    try {
      await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); window.__uivKeys = []; input.addEventListener('keydown', event => window.__uivKeys.push({ key: event.key, keyCode: event.keyCode, isComposing: event.isComposing }), true); input.focus(); })()`);
      await command("Input.imeSetComposition", { text: "ceshi", selectionStart: 5, selectionEnd: 5 }, sessionId);
      await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 }, sessionId);
      await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 }, sessionId);
      await new Promise(resolve => setTimeout(resolve, 400));
      outcome.keys = await evaluate<Array<{ key: string; keyCode: number; isComposing: boolean }>>("window.__uivKeys || []");
      outcome.afterEnter = (await read(form, selector)).value;
      outcome.send = (await read(form, selector)).send;
      await focus(selector);
      await command("Input.insertText", { text: "测试" }, sessionId);
      await new Promise(resolve => setTimeout(resolve, 300));
      const committed = await read(form, selector);
      outcome.afterCommit = committed.value;
      outcome.send = committed.send;
      outcome.imeUi = await evaluate<number>("document.querySelectorAll('[aria-label*=候选], [class*=candidate]').length");
    } catch (error) {
      outcome.error = error instanceof Error ? error.message : String(error);
    } finally {
      try { await command("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 }, sessionId); } catch { /* no open composition */ }
      await evaluate("document.activeElement instanceof HTMLElement && document.activeElement.blur()");
    }
    await note(`ime ${form} ${JSON.stringify(outcome)}`);
    return outcome;
  };
  const event = `[data-home-subject-kind="feed_item"][data-home-subject-id="${item.item_id}"]`;
  const dismissAssistantPanel = async () => {
    const open = await evaluate<boolean>("(() => { const panel = document.querySelector('[data-assistant-panel]'); return !!panel && !panel.hidden; })()");
    if (!open) return;
    await activate("[data-assistant-panel-close]");
    await waitNoted("document.querySelector('[data-assistant-panel]').hidden");
  };
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.__uivErrors=[];addEventListener('error',event=>window.__uivErrors.push(event.message));addEventListener('unhandledrejection',event=>window.__uivErrors.push(String(event.reason)));" }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { class UivFakeRecorder extends EventTarget { constructor(stream, options) { super(); this.stream = stream; this.state = "inactive"; this.mimeType = (options && options.mimeType) || "audio/webm"; } static isTypeSupported(type) { return type === "audio/webm" || type === "audio/mp4" || type === "audio/wav"; } start() { this.state = "recording"; } stop() { if (this.state === "inactive") return; this.state = "inactive"; const available = new Event("dataavailable"); const samples = 800; const dataSize = samples * 2; const buffer = new ArrayBuffer(44 + dataSize); const view = new DataView(buffer); const write = (offset, text) => { for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index)); }; write(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, dataSize, true); Object.defineProperty(available, "data", { value: new Blob([buffer], { type: "audio/wav" }) }); this.dispatchEvent(available); this.dispatchEvent(new Event("stop")); } } try { window.MediaRecorder = UivFakeRecorder; } catch { Object.defineProperty(window, "MediaRecorder", { configurable: true, writable: true, value: UivFakeRecorder }); } })();` }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await waitNoted("document.querySelector('[data-dock] [data-assistant-input]') instanceof HTMLTextAreaElement");
  const applyTheme = (value: string) => evaluate(`localStorage.setItem('molis-work:theme',${JSON.stringify(value)});window.dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:${JSON.stringify(value)}}))`);
  await applyTheme("light");
  const light = await evaluate<string>("getComputedStyle(document.querySelector('[data-assistant-input]')).color");
  await dismissAssistantPanel();
  await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await waitNoted("!document.querySelector('[data-coding-workbench]').hidden");
  await waitNoted("!!document.querySelector('[data-coding-session]')?.getClientRects().length || !!document.querySelector('[data-coding-new]')?.getClientRects().length");
  await evaluate(`(() => { window.__uivSeen = []; const field = document.querySelector('[data-coding-task]'); const label = document.querySelector('[data-coding-composer] [data-uiv-field-state]'); const remember = () => { const shell = document.querySelector('[data-coding-composer] .coding-composer-shell'); const rect = shell ? shell.getBoundingClientRect() : { width: 0, height: 0 }; window.__uivSeen.push({ disabled: !!field?.disabled, label: label?.textContent || '', visible: rect.width > 0 && rect.height > 0 && getComputedStyle(shell).display !== 'none' }); }; remember(); if (field) new MutationObserver(remember).observe(field, { attributes: true, attributeFilter: ['disabled'] }); if (label) new MutationObserver(remember).observe(label, { childList: true, characterData: true, subtree: true }); const workbench = document.querySelector('[data-coding-workbench]'); if (workbench) new MutationObserver(remember).observe(workbench, { attributes: true }); })()`);
  if (await evaluate<boolean>("!!document.querySelector('[data-coding-session]')?.getClientRects().length")) await click("[data-coding-session]");
  else await click("[data-coding-new]");
  await waitNoted("document.querySelector('[data-coding-task]') instanceof HTMLTextAreaElement && !document.querySelector('[data-coding-task]').disabled");
  const codingSeen = await evaluate<Array<{ disabled: boolean; label: string; visible: boolean }>>("window.__uivSeen || []");
  const codingUnavailable = codingSeen.some(row => row.disabled && row.visible && row.label.includes("现在不可用"));
  await note(`coding-disabled-samples ${JSON.stringify(codingSeen)} hit=${codingUnavailable}`);
  await blankAndNewline("[data-coding-task]", "[data-coding-composer]", "编码这句");
  await setValue("[data-coding-task]", "编码这句\n还在");
  await focus("[data-coding-task]");
  const codingBefore = await read("[data-coding-composer]", "[data-coding-task]");
  await ctrlEnter();
  await new Promise(resolve => setTimeout(resolve, 600));
  const codingAfter = await read("[data-coding-composer]", "[data-coding-task]");
  const codingStatus = await evaluate<string>("document.querySelector('[data-coding-status]')?.textContent || ''");
  await note(`coding-send beforeDisabled=${codingBefore.sendDisabled} after field=${codingAfter.field} send=${codingAfter.send} value=${JSON.stringify(codingAfter.value)} status=${codingStatus} sendDisabled=${codingAfter.sendDisabled}`);
  assert.equal(codingAfter.value.includes("编码这句"), true, "coding did not clear the draft");
  if (codingAfter.send.includes("已发送")) await note("coding success status was observed; draft clear is recorded only from the value above");
  const codingIme = await compose("[data-coding-task]", "[data-coding-composer]");
  // Headless Chrome stops animation frames after imeSetComposition. Home reveals the talk sheet on the next frame.
  const countFrames = () => evaluate<number>("new Promise(resolve => { let n = 0; const timer = setTimeout(() => resolve(n), 400); const tick = () => { n += 1; if (n >= 2) { clearTimeout(timer); resolve(n); } else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })");
  let frames = await countFrames();
  await note(`raf-after-coding-ime ${frames}`);
  if (frames < 2) {
    try { await command("Emulation.setFocusEmulationEnabled", { enabled: true }, sessionId); } catch (error) { await note(`focus-emulation ${error instanceof Error ? error.message : String(error)}`); }
    frames = await countFrames();
    await note(`raf-after-focus ${frames}`);
  }
  if (frames < 2) {
    try { await command("Page.setWebLifecycleState", { state: "active" }, sessionId); } catch (error) { await note(`lifecycle ${error instanceof Error ? error.message : String(error)}`); }
    frames = await countFrames();
    await note(`raf-after-lifecycle ${frames}`);
  }
  await activate(`[data-plugin-strip] [data-plugin-id="home"]`);
  await waitNoted(`!!document.querySelector(${JSON.stringify(event)})`);
  await activate(event);
  await evaluate("document.querySelector('[data-home-open-talk]')?.scrollIntoView({block:'center',inline:'nearest'})");
  const placed = await evaluate<string>(`(() => { const button = document.querySelector('[data-home-open-talk]'); const rect = button.getBoundingClientRect(); const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return hit === button || button.contains(hit) ? 'button' : (hit?.className || hit?.tagName || 'none'); })()`);
  assert.equal(placed, "button", placed);
  await activate("[data-home-open-talk]");
  await waitNoted("document.querySelector('[data-home-talk-form] textarea') && !document.querySelector('[data-home-talk]').hidden");
  await blankAndNewline("[data-home-talk-form] textarea", "[data-home-talk-form]", "首页这句");
  const homeIme = await compose("[data-home-talk-form] textarea", "[data-home-talk-form]");
  await setValue("[data-home-talk-form] textarea", "首页这句\n留到继续");
  await waitNoted("!!document.querySelector('[name=talk-session]:not(:disabled)')");
  await activate(`[name=talk-session][value="${chosen.session_id}"]`);
  await waitNoted("!document.querySelector('[data-home-talk-form] [type=submit]').disabled");
  await setValue("[data-assistant-input]", "助手留着");
  const otherBefore = await evaluate<{ assistant: string; coding: string }>("({ assistant: document.querySelector('[data-assistant-input]')?.value || '', coding: document.querySelector('[data-coding-task]')?.value || '' })");
  await note(`other-before assistant=${JSON.stringify(otherBefore.assistant)} coding=${JSON.stringify(otherBefore.coding)}`);
  runtimeMode = "delay";
  const turnsBefore = turns.length;
  await focus("[data-home-talk-form] textarea");
  await ctrlEnter();
  await waitNoted("document.querySelector('.home-talk-status').textContent.includes('正在发送')");
  await focus("[data-home-talk-form] textarea");
  await ctrlEnter();
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(turns.length, turnsBefore + 1, "a second Ctrl+Enter while home is sending does not start another turn");
  release?.({ turn: { id: "uiv-gap-accepted" } });
  release = undefined;
  runtimeMode = "accept";
  await waitNoted("document.querySelector('.home-talk-status').textContent.includes('已被会话接收')");
  const homeAccepted = await read("[data-home-talk-form]", "[data-home-talk-form] textarea");
  const homeReceipt = await evaluate<string>("document.querySelector('.home-talk-status')?.textContent || ''");
  const homeTalkVisible = await evaluate<boolean>("!document.querySelector('[data-home-talk]').hidden && document.querySelector('[data-home-talk-form] textarea').getClientRects().length > 0");
  const continueLabel = await evaluate<string>("document.querySelector('[data-talk-action=new]')?.textContent || ''");
  await note(`home-accepted visible=${homeTalkVisible} disabled=${homeAccepted.disabled} field=${homeAccepted.field} send=${homeAccepted.send} value=${JSON.stringify(homeAccepted.value)} receipt=${homeReceipt.trim()} continue=${continueLabel.trim()}`);
  const kept = await evaluate<{ assistant: string; coding: string; homeTalk: string; uivHome: string }>(`(() => { const textOf = (value) => { try { const parsed = JSON.parse(value); return typeof parsed.text === 'string' ? parsed.text : value; } catch { return value; } }; const homeTalk = []; const uivHome = []; for (let index = 0; index < localStorage.length; index += 1) { const key = localStorage.key(index) || ''; const value = localStorage.getItem(key) || ''; if (key.startsWith('molis.home-talk:')) homeTalk.push(textOf(value)); if (key.startsWith('molis.uiv.v1:home:')) uivHome.push(textOf(value)); } return { assistant: document.querySelector('[data-assistant-input]')?.value || '', coding: document.querySelector('[data-coding-task]')?.value || '', homeTalk: homeTalk.join('\\n'), uivHome: uivHome.join('\\n') }; })()`);
  await note(`home-cleared value=${JSON.stringify(homeAccepted.value)} send=${homeAccepted.send} field=${homeAccepted.field} assistant=${JSON.stringify(kept.assistant)} coding=${JSON.stringify(kept.coding)} homeTalk=${kept.homeTalk} uivHome=${kept.uivHome}`);
  assert.equal(homeTalkVisible, true);
  assert.match(homeReceipt, /已被会话接收/);
  assert.equal(homeAccepted.value, "");
  assert.equal(homeAccepted.send.includes("已发送"), true, homeAccepted.send);
  assert.equal(homeAccepted.disabled, true);
  assert.equal(homeAccepted.field, "现在不可用");
  assert.match(continueLabel, /继续说一句/);
  assert.equal(kept.assistant, otherBefore.assistant);
  assert.equal(kept.assistant, "助手留着");
  assert.equal(kept.coding, otherBefore.coding);
  assert.equal(kept.homeTalk.includes("首页这句"), false, kept.homeTalk);
  assert.equal(kept.uivHome.includes("首页这句"), false, kept.uivHome);
  await activate("[data-talk-action=new]");
  await waitNoted("!document.querySelector('[data-home-talk-form] textarea').disabled && document.querySelector('[data-home-talk-form] textarea').value === ''");
  const homeCleared = await read("[data-home-talk-form]", "[data-home-talk-form] textarea");
  await note(`home-continue field=${homeCleared.field} send=${homeCleared.send} value=${JSON.stringify(homeCleared.value)} disabled=${homeCleared.disabled}`);
  assert.equal(homeCleared.value, "");
  await setValue("[data-home-talk-form] textarea", "失败这句");
  await waitNoted("!!document.querySelector('[name=talk-session]:not(:disabled)')");
  if (await evaluate<string>("document.querySelector('[name=talk-session]:checked')?.value || ''") !== chosen.session_id) await activate(`[name=talk-session][value="${chosen.session_id}"]`);
  await waitNoted("!document.querySelector('[data-home-talk-form] [type=submit]').disabled");
  runtimeMode = "reject";
  await focus("[data-home-talk-form] textarea");
  await ctrlEnter();
  await waitNoted("document.querySelector('.home-talk-status').textContent.includes('明确未接收')");
  const homeFailed = await read("[data-home-talk-form]", "[data-home-talk-form] textarea");
  const failedReceipt = await evaluate<string>("document.querySelector('.home-talk-status')?.textContent || ''");
  await note(`home-failed disabled=${homeFailed.disabled} field=${homeFailed.field} send=${homeFailed.send} value=${JSON.stringify(homeFailed.value)} receipt=${failedReceipt.trim()}`);
  assert.match(failedReceipt, /明确未接收/);
  assert.match(homeFailed.value, /失败这句/);
  assert.equal(homeFailed.send.includes("已发送"), false, homeFailed.send);
  await activate("[data-talk-action=edit]");
  await waitNoted("!document.querySelector('[data-home-talk-form] textarea').disabled && document.querySelector('[data-home-talk-form] textarea').value.includes('失败这句')");
  await setValue("[data-home-talk-form] textarea", "不确定这句");
  await waitNoted("!!document.querySelector('[name=talk-session]:not(:disabled)')");
  if (await evaluate<string>("document.querySelector('[name=talk-session]:checked')?.value || ''") !== chosen.session_id) await activate(`[name=talk-session][value="${chosen.session_id}"]`);
  await waitNoted("!document.querySelector('[data-home-talk-form] [type=submit]').disabled");
  runtimeMode = "unknown";
  const unknownBefore = turns.length;
  await focus("[data-home-talk-form] textarea");
  await ctrlEnter();
  await waitNoted("(() => { const receipt = document.querySelector('.home-talk-status')?.textContent || ''; const send = document.querySelector('[data-home-talk-form] [data-uiv-send-status]')?.textContent || ''; const error = document.querySelector('.home-talk-error')?.textContent || ''; return receipt.includes('尚未确认') || send.includes('是否送到还不确定') || error.length > 0; })()");
  const homeUnknown = await read("[data-home-talk-form]", "[data-home-talk-form] textarea");
  const unknownReceipt = await evaluate<string>("document.querySelector('.home-talk-status')?.textContent || ''");
  const unknownError = await evaluate<string>("document.querySelector('.home-talk-error')?.textContent || ''");
  await note(`home-unknown turns=${turns.length - unknownBefore} disabled=${homeUnknown.disabled} field=${homeUnknown.field} send=${homeUnknown.send} value=${JSON.stringify(homeUnknown.value)} receipt=${unknownReceipt.trim()} error=${unknownError.trim()}`);
  assert.equal(turns.length, unknownBefore + 1);
  assert.match(homeUnknown.value, /不确定这句/);
  await focus("[data-assistant-input]");
  await blankAndNewline("[data-assistant-input]", "[data-assistant-composer]", "助手这句");
  const assistantIme = await compose("[data-assistant-input]", "[data-assistant-composer]");
  const imeReached = [codingIme, homeIme, assistantIme].map(item => ({ error: item.error, key229: item.keys.some(key => key.keyCode === 229), composing: item.keys.some(key => key.isComposing), committed: item.afterCommit.includes("测试"), send: item.send, imeUi: item.imeUi }));
  await note(`ime-summary ${JSON.stringify(imeReached)}`);
  for (const item of [codingIme, homeIme, assistantIme]) {
    if (item.error) continue;
    assert.equal(item.send.includes("正在发送") || item.send.includes("已发送"), false, item.send);
    assert.equal(item.afterCommit.includes("测试"), true, item.afterCommit);
  }
  if (await evaluate<boolean>("!document.querySelector('[data-home-talk]').hidden")) await activate("[data-home-close-talk]");
  await dismissAssistantPanel();
  await applyTheme("dark");
  const dark = await evaluate<string>("getComputedStyle(document.querySelector('[data-assistant-input]')).color");
  const theme = await evaluate<string>("document.documentElement.dataset.resolvedTheme || document.documentElement.dataset.theme || ''");
  assert.notEqual(light, dark, "dark text color differs from light");
  await note(`theme resolved=${theme} light=${light} dark=${dark}`);
  await evaluate(`(() => { const real = window.fetch.bind(window); window.fetch = async (input, init) => { const url = typeof input === "string" ? input : (input && input.url) || ""; const body = init && typeof init.body === "string" ? init.body : ""; if (url.includes("/api/local-voice") && body.includes('"op":"probe"')) return new Response(JSON.stringify({ model: "available" }), { status: 200, headers: { "content-type": "application/json" } }); return real(input, init); }; const allow = () => Promise.resolve(new MediaStream()); const devices = navigator.mediaDevices; if (!devices) throw new Error("mediaDevices missing"); try { devices.getUserMedia = allow; } catch { Object.defineProperty(devices, "getUserMedia", { configurable: true, value: allow }); } })()`);
  await activate("[data-assistant-composer] [data-uiv-mic]");
  await waitNoted("!document.querySelector('[data-assistant-composer] [data-uiv-stop-record]').hidden && !document.querySelector('[data-assistant-composer] [data-uiv-cancel-record]').hidden");
  const recording = await evaluate<{ stop: string; cancel: string; stopBox: number; voice: string; field: string }>(`(() => { const stop = document.querySelector('[data-assistant-composer] [data-uiv-stop-record]'); const cancel = document.querySelector('[data-assistant-composer] [data-uiv-cancel-record]'); const box = (node) => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 ? rect.width : 0; }; return { stop: stop.textContent.trim(), cancel: cancel.textContent.trim(), stopBox: box(stop), voice: document.querySelector('[data-assistant-composer] [data-uiv-voice-status]').textContent, field: document.querySelector('[data-assistant-composer] [data-uiv-field-state]').textContent }; })()`);
  await note(`dark-recording stop=${recording.stop} cancel=${recording.cancel} box=${recording.stopBox} voice=${recording.voice} field=${recording.field} theme=${theme}`);
  assert.equal(recording.stop, "停止录音");
  assert.equal(recording.cancel, "取消录音");
  assert.ok(recording.stopBox > 0);
  assert.match(recording.voice, /正在录音/);
  await shot("uiv-composer-dark.png");
  await command("Emulation.setDeviceMetricsOverride", { width: 600, height: 900, deviceScaleFactor: 1, mobile: true }, sessionId);
  await dismissAssistantPanel();
  await evaluate("document.querySelector('[data-assistant-composer] [data-uiv-stop-record]')?.scrollIntoView({block:'center',inline:'nearest'})");
  await waitNoted("(() => { const stop = document.querySelector('[data-assistant-composer] [data-uiv-stop-record]'); const rect = stop.getBoundingClientRect(); return !stop.hidden && rect.width > 0 && rect.height > 0 && innerWidth <= 600; })()");
  const narrow = await evaluate<{ stop: string; stopBox: number; viewport: number; voice: string }>(`(() => { const stop = document.querySelector('[data-assistant-composer] [data-uiv-stop-record]'); const rect = stop.getBoundingClientRect(); return { stop: stop.textContent.trim(), stopBox: rect.width, viewport: innerWidth, voice: document.querySelector('[data-assistant-composer] [data-uiv-voice-status]').textContent }; })()`);
  await note(`narrow-recording viewport=${narrow.viewport} stop=${narrow.stop} box=${narrow.stopBox} voice=${narrow.voice}`);
  assert.equal(narrow.viewport <= 600, true);
  assert.equal(narrow.stop, "停止录音");
  assert.ok(narrow.stopBox > 0);
  assert.match(narrow.voice, /正在录音/);
  await shot("uiv-composer-narrow-recording.png");
  await activate("[data-assistant-composer] [data-uiv-cancel-record]");
  await waitNoted("document.querySelector('[data-assistant-composer] [data-uiv-stop-record]').hidden");
  assert.deepEqual(await evaluate<string[]>("window.__uivErrors"), []);
  await note(`unavailable home=${homeAccepted.field} codingHit=${codingUnavailable}`);
});

test("UIV-03 助手发送成功只清空这一份草稿", { timeout: 180_000 }, async t => {
  // Drives the shipped composers. The model reply is a real local fixture server, not a stubbed success body.
  const browser = await openGoalBrowser(t, "seeded", undefined, null, { async request(method, params) {
    if (method !== "turn/start") return method === "thread/turns/list" ? { data: [], nextCursor: null } : { thread: { id: params.threadId } };
    return { turn: { id: "uiv-clear-turn" } };
  }, subscribe() { return () => undefined; } });
  if (!browser) return;
  await issueModel(t, browser.homeDirectory, { replyText: "已收到这句。" });
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId, localHost, reloadPage } = browser;
  assert.ok(localHost);
  const resources = await localHost.sessionResources();
  resources.registry.createSession({ runtime_id: "codex", native_runtime_session_id: "uiv-clear-target", project_id: projectId, title: "统一输入清空会话", actor_id: "browser-test", user_confirmed: true });
  const note = (line: string) => {
    t.diagnostic(line);
    const dir = process.env.UIV_EVIDENCE_DIR;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "uiv-clear.txt"), `${line}\n`);
  };
  const read = (form: string, field: string) => evaluate<{ field: string; send: string; value: string; disabled: boolean; sendDisabled: boolean }>(`(() => { const form = document.querySelector(${JSON.stringify(form)}); const field = document.querySelector(${JSON.stringify(field)}); const submit = form ? form.querySelector('[data-assistant-send], [data-coding-send], button[type=submit]') : null; return { field: form?.querySelector('[data-uiv-field-state]')?.textContent || '', send: form?.querySelector('[data-uiv-send-status]')?.textContent || '', value: field?.value || '', disabled: !!field?.disabled, sendDisabled: !!submit?.disabled }; })()`);
  const drafts = () => evaluate<Record<string, string>>(`Object.fromEntries([...Array(localStorage.length)].map((_, index) => localStorage.key(index)).filter(key => key && key.startsWith('molis.uiv.v1:')).map(key => [key, localStorage.getItem(key) || '']))`);
  const joined = (rows: Record<string, string>, surface: string) => Object.entries(rows).filter(([key]) => key.includes(`:${surface}:`)).map(([, value]) => value).join("\n");
  const focus = (selector: string) => evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  const setValue = (selector: string, value: string) => evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)}); field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const ctrlEnter = async () => {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, sessionId);
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await waitFor("document.querySelector('[data-dock] [data-assistant-input]') instanceof HTMLTextAreaElement");
  await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await waitFor("!document.querySelector('[data-coding-workbench]').hidden");
  await waitFor("!!document.querySelector('[data-coding-session]')?.getClientRects().length || !!document.querySelector('[data-coding-new]')?.getClientRects().length");
  if (await evaluate<boolean>("!!document.querySelector('[data-coding-session]')?.getClientRects().length")) await click("[data-coding-session]");
  else await click("[data-coding-new]");
  await waitFor("document.querySelector('[data-coding-task]') instanceof HTMLTextAreaElement && !document.querySelector('[data-coding-task]').disabled");
  await setValue("[data-coding-task]", "编码留着");
  await waitFor("document.querySelector('[data-coding-task]').value === '编码留着'");
  const codingReady = await read("[data-coding-composer]", "[data-coding-task]");
  assert.equal(codingReady.value, "编码留着");
  const codingCouldSend = codingReady.sendDisabled === false;
  await focus("[data-assistant-input]");
  await command("Input.insertText", { text: "助手成功这句" }, sessionId);
  await waitFor("document.querySelector('[data-assistant-input]').value === '助手成功这句'");
  const before = await drafts();
  assert.match(joined(before, "assistant"), /助手成功这句/);
  assert.match(joined(before, "coding"), /编码留着/);
  const assistantArmed = await read("[data-assistant-composer]", "[data-assistant-input]");
  assert.equal(assistantArmed.sendDisabled, false, assistantArmed.send);
  await focus("[data-assistant-input]");
  await ctrlEnter();
  try {
    await waitFor("(() => { const field = document.querySelector('[data-assistant-input]'); const send = document.querySelector('[data-assistant-composer] [data-uiv-send-status]')?.textContent || ''; return !!field && field.value === '' && send.includes('已发送') && !send.includes('正在发送'); })()", 30_000);
  } catch (error) {
    note(`assistant-send-timeout ${JSON.stringify(await read("[data-assistant-composer]", "[data-assistant-input]"))} problem=${await evaluate<string>("document.querySelector('.assistant-problem')?.textContent || ''")}`);
    throw error;
  }
  const assistantSent = await read("[data-assistant-composer]", "[data-assistant-input]");
  const codingKept = await read("[data-coding-composer]", "[data-coding-task]");
  const problem = await evaluate<string>("document.querySelector('.assistant-problem')?.textContent || ''");
  const after = await drafts();
  note(`assistant-cleared value=${JSON.stringify(assistantSent.value)} send=${assistantSent.send} field=${assistantSent.field} problem=${problem.replace(/\s+/g, " ").trim()} coding=${JSON.stringify(codingKept.value)} codingSendDisabled=${codingKept.sendDisabled}`);
  assert.equal(assistantSent.value, "");
  assert.match(assistantSent.send, /已发送/);
  assert.doesNotMatch(assistantSent.send, /正在发送/);
  assert.equal(problem.includes("无法开始工作"), false, problem);
  assert.equal(codingKept.value, "编码留着");
  assert.doesNotMatch(joined(after, "assistant"), /助手成功这句/);
  assert.match(joined(after, "coding"), /编码留着/);
  if (!codingCouldSend) {
    await focus("[data-coding-task]");
    await ctrlEnter();
    await waitFor("(document.querySelector('[data-coding-composer] [data-uiv-send-status]')?.textContent || '').includes('当前入口现在不能发送')");
    const refused = await read("[data-coding-composer]", "[data-coding-task]");
    note(`coding-refused send=${refused.send} value=${JSON.stringify(refused.value)} sendDisabled=${refused.sendDisabled}`);
    assert.match(refused.send, /当前入口现在不能发送。草稿和已转写的文字还在。/);
    assert.equal(refused.value, "编码留着");
    assert.equal((await read("[data-assistant-composer]", "[data-assistant-input]")).value, "");
  } else {
    await focus("[data-coding-task]");
    await ctrlEnter();
    await waitFor("(() => { const field = document.querySelector('[data-coding-task]'); const send = document.querySelector('[data-coding-composer] [data-uiv-send-status]')?.textContent || ''; return !!field && ((field.value === '' && send.includes('已发送')) || send.includes('发送失败') || send.includes('是否送到还不确定') || send.includes('当前入口现在不能发送')); })()", 30_000);
    const codingSent = await read("[data-coding-composer]", "[data-coding-task]");
    note(`coding-send value=${JSON.stringify(codingSent.value)} send=${codingSent.send} sendDisabled=${codingSent.sendDisabled}`);
    assert.equal((await read("[data-assistant-composer]", "[data-assistant-input]")).value, "");
    if (codingSent.send.includes("已发送")) assert.equal(codingSent.value, "");
    else assert.equal(codingSent.value, "编码留着");
  }
  await reloadPage();
  await waitFor("document.querySelector('[data-assistant-input]') instanceof HTMLTextAreaElement");
  await waitFor("document.querySelector('[data-coding-task]') instanceof HTMLTextAreaElement");
  if (!(await evaluate<boolean>("document.querySelector('[data-coding-task]').value.includes('编码留着')"))) {
    if (await evaluate<boolean>("document.querySelector('[data-coding-workbench]')?.hidden !== false")) await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
    await waitFor("!!document.querySelector('[data-coding-session]')?.getClientRects().length || !!document.querySelector('[data-coding-new]')?.getClientRects().length");
    if (await evaluate<boolean>("!!document.querySelector('[data-coding-session]')?.getClientRects().length")) await click("[data-coding-session]");
    await waitFor("document.querySelector('[data-coding-task]').value.includes('编码留着')");
  }
  const restoredAssistant = await read("[data-assistant-composer]", "[data-assistant-input]");
  const restoredCoding = await read("[data-coding-composer]", "[data-coding-task]");
  const restoredDrafts = await drafts();
  note(`reloaded assistant=${JSON.stringify(restoredAssistant.value)} coding=${JSON.stringify(restoredCoding.value)} assistantStored=${JSON.stringify(joined(restoredDrafts, "assistant"))} codingStored=${JSON.stringify(joined(restoredDrafts, "coding"))}`);
  assert.equal(restoredAssistant.value.includes("助手成功这句"), false, restoredAssistant.value);
  assert.doesNotMatch(joined(restoredDrafts, "assistant"), /助手成功这句/);
  assert.match(restoredCoding.value, /编码留着/);
  assert.match(joined(restoredDrafts, "coding"), /编码留着/);
});

test("UIV-03 Coding 发送成功只清空这一份草稿", { timeout: 180_000 }, async t => {
  // The product enables the Coding send button only with a current session, a catalog model, and a verified workspace.
  const { resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => {
    if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND;
    else process.env.MOLIS_WORK_SECRET_BACKEND = prior;
    resetSecretStoreCache();
  });
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  await issueModel(t, browser.homeDirectory, { replyText: "编码这句已收到。" });
  const workspace = join(browser.homeDirectory, "uiv-coding-workspace");
  await mkdir(workspace, { recursive: true });
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId, reloadPage } = browser;
  const note = (line: string) => {
    t.diagnostic(line);
    const dir = process.env.UIV_EVIDENCE_DIR;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "uiv-clear.txt"), `${line}\n`);
  };
  const read = (form: string, field: string) => evaluate<{ field: string; send: string; value: string; disabled: boolean; sendDisabled: boolean; phase: string; status: string }>(`(() => { const form = document.querySelector(${JSON.stringify(form)}); const field = document.querySelector(${JSON.stringify(field)}); const submit = form ? form.querySelector('[data-assistant-send], [data-coding-send], button[type=submit]') : null; return { field: form?.querySelector('[data-uiv-field-state]')?.textContent || '', send: form?.querySelector('[data-uiv-send-status]')?.textContent || '', value: field?.value || '', disabled: !!field?.disabled, sendDisabled: !!submit?.disabled, phase: form?.dataset.uivPhase || '', status: document.querySelector('[data-coding-status]')?.textContent || '' }; })()`);
  const drafts = () => evaluate<Record<string, string>>(`Object.fromEntries([...Array(localStorage.length)].map((_, index) => localStorage.key(index)).filter(key => key && key.startsWith('molis.uiv.v1:')).map(key => [key, localStorage.getItem(key) || '']))`);
  const joined = (rows: Record<string, string>, surface: string) => Object.entries(rows).filter(([key]) => key.includes(`:${surface}:`)).map(([, value]) => value).join("\n");
  const focus = (selector: string) => evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  const fill = (selector: string, value: string) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const ctrlEnter = async () => {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, sessionId);
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await waitFor("document.querySelector('[data-dock] [data-assistant-input]') instanceof HTMLTextAreaElement");
  await click(".navigator-project-settings");
  await waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await waitFor("!!document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
  await fill("[data-project-workspaces-add] [name=path]", workspace);
  await click("[data-project-workspaces-add] [type=submit]");
  await waitFor("document.querySelector('[data-project-workspaces-list]').textContent.includes('uiv-coding-workspace')");
  await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await waitFor("document.querySelector('[data-work-surface=\"coding\"]')?.getBoundingClientRect().width > 100");
  await click("[data-coding-workbench] [data-coding-new]");
  await waitFor("!document.querySelector('[data-coding-task]').disabled && [...document.querySelectorAll('[data-coding-model] option')].some(option => option.value.includes('issue-fixture'))");
  await focus("[data-assistant-input]");
  await command("Input.insertText", { text: "助手草稿留着" }, sessionId);
  await waitFor("document.querySelector('[data-assistant-input]').value === '助手草稿留着'");
  const model = JSON.stringify(["issue-fixture", "fixture"]);
  await fill("[data-coding-model]", model);
  await fill("[data-coding-intent]", "discuss");
  await fill("[data-coding-task]", "编码发出去");
  await waitFor("document.querySelector('[data-coding-task]').value === '编码发出去' && document.querySelector('[data-assistant-input]').value === '助手草稿留着'");
  const before = await drafts();
  assert.match(joined(before, "assistant"), /助手草稿留着/);
  assert.match(joined(before, "coding"), /编码发出去/);
  try {
    await waitFor("!document.querySelector('[data-coding-send]').disabled", 30_000);
  } catch (error) {
    const refused = await read("[data-coding-composer]", "[data-coding-task]");
    note(`coding-still-disabled send=${refused.send} value=${JSON.stringify(refused.value)} sendDisabled=${refused.sendDisabled} phase=${refused.phase} status=${refused.status.replace(/\s+/g, " ").trim()} workspace=${await evaluate<string>("document.querySelector('[data-coding-workspace-label]')?.textContent || ''")} model=${await evaluate<string>("document.querySelector('[data-coding-model]')?.value || ''")}`);
    throw error;
  }
  const armed = await read("[data-coding-composer]", "[data-coding-task]");
  assert.equal(armed.sendDisabled, false, armed.status);
  assert.equal(armed.value, "编码发出去");
  assert.equal((await read("[data-assistant-composer]", "[data-assistant-input]")).value, "助手草稿留着");
  await focus("[data-coding-task]");
  await ctrlEnter();
  try {
    await waitFor("(() => { const field = document.querySelector('[data-coding-task]'); const send = document.querySelector('[data-coding-composer] [data-uiv-send-status]')?.textContent || ''; return !!field && field.value === '' && send.includes('已发送') && !send.includes('正在发送'); })()", 60_000);
  } catch (error) {
    const stuck = await read("[data-coding-composer]", "[data-coding-task]");
    note(`coding-send-timeout value=${JSON.stringify(stuck.value)} send=${stuck.send} field=${stuck.field} phase=${stuck.phase} sendDisabled=${stuck.sendDisabled} status=${stuck.status.replace(/\s+/g, " ").trim()} assistant=${JSON.stringify((await read("[data-assistant-composer]", "[data-assistant-input]")).value)}`);
    throw error;
  }
  const codingSent = await read("[data-coding-composer]", "[data-coding-task]");
  const assistantKept = await read("[data-assistant-composer]", "[data-assistant-input]");
  const after = await drafts();
  note(`coding-cleared value=${JSON.stringify(codingSent.value)} send=${codingSent.send} field=${codingSent.field} phase=${codingSent.phase} status=${codingSent.status.replace(/\s+/g, " ").trim()} assistant=${JSON.stringify(assistantKept.value)}`);
  assert.equal(codingSent.value, "");
  assert.match(codingSent.send, /已发送/);
  assert.doesNotMatch(codingSent.send, /正在发送/);
  assert.equal(assistantKept.value, "助手草稿留着");
  assert.doesNotMatch(joined(after, "coding"), /编码发出去/);
  assert.match(joined(after, "assistant"), /助手草稿留着/);
  await reloadPage();
  await waitFor("document.querySelector('[data-assistant-input]') instanceof HTMLTextAreaElement");
  await waitFor("document.querySelector('[data-coding-task]') instanceof HTMLTextAreaElement");
  if (await evaluate<boolean>("document.querySelector('[data-coding-workbench]')?.hidden !== false")) await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await waitFor("!!document.querySelector('[data-coding-session]')?.getClientRects().length");
  await click("[data-coding-session]");
  await waitFor("document.querySelector('[data-coding-task]') instanceof HTMLTextAreaElement && !document.querySelector('[data-coding-task]').disabled");
  await waitFor("document.querySelector('[data-assistant-input]').value.includes('助手草稿留着')");
  const restoredAssistant = await read("[data-assistant-composer]", "[data-assistant-input]");
  const restoredCoding = await read("[data-coding-composer]", "[data-coding-task]");
  const restoredDrafts = await drafts();
  note(`reloaded assistant=${JSON.stringify(restoredAssistant.value)} coding=${JSON.stringify(restoredCoding.value)} assistantStored=${JSON.stringify(joined(restoredDrafts, "assistant"))} codingStored=${JSON.stringify(joined(restoredDrafts, "coding"))}`);
  assert.equal(restoredAssistant.value.includes("助手草稿留着"), true, restoredAssistant.value);
  assert.match(joined(restoredDrafts, "assistant"), /助手草稿留着/);
  assert.equal(restoredCoding.value.includes("编码发出去"), false, restoredCoding.value);
  assert.doesNotMatch(joined(restoredDrafts, "coding"), /编码发出去/);
});

test("UIV 探测返回前连点两个作曲条只录一路", { timeout: 120_000 }, async t => {
  // Two mic clicks share one live recorder. The probe stays pending so the second click arrives before the first attempt can arm.
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId } = browser;
  const note = async (line: string) => {
    t.diagnostic(line);
    const dir = process.env.UIV_EVIDENCE_DIR;
    if (!dir) return;
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, "uiv-mic-lock.txt"), `${line}\n`);
  };
  const hook = `(() => {
    const tracks = [];
    const recorders = [];
    let release = () => {};
    const gate = new Promise(resolve => { release = resolve; });
    window.__uivMic = { tracks, recorders, mode: "available", release() { release(); } };
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const body = init && typeof init.body === "string" ? init.body : "";
      if (url.includes("/api/local-voice") && body.includes('"op":"probe"')) {
        if (window.__uivMic.mode === "available") await gate;
        const model = window.__uivMic.mode === "available" ? "available" : "missing";
        return new Response(JSON.stringify({ model }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return realFetch(input, init);
    };
    class UivLockRecorder extends EventTarget {
      constructor(stream) { super(); this.stream = stream; this.state = "inactive"; recorders.push(this); }
      static isTypeSupported() { return true; }
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; this.dispatchEvent(new Event("stop")); }
    }
    window.MediaRecorder = UivLockRecorder;
    const allow = async () => {
      const track = { stopped: false, stop() { track.stopped = true; } };
      tracks.push(track);
      return { getTracks() { return [track]; } };
    };
    const devices = navigator.mediaDevices || {};
    try { devices.getUserMedia = allow; } catch { Object.defineProperty(devices, "getUserMedia", { configurable: true, value: allow }); }
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: devices });
  })();`;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: hook }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await waitFor("document.querySelector('[data-assistant-composer] [data-uiv-mic]') instanceof HTMLButtonElement");
  if (!(await evaluate<boolean>("document.querySelector('[data-coding-composer] [data-uiv-mic]') instanceof HTMLButtonElement"))) {
    await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
    await waitFor("document.querySelector('[data-coding-composer] [data-uiv-mic]') instanceof HTMLButtonElement");
  }
  await evaluate("document.querySelector('[data-assistant-composer] [data-uiv-mic]').click(); document.querySelector('[data-coding-composer] [data-uiv-mic]').click();");
  await waitFor("window.__uivMic.tracks.length === 1 && window.__uivMic.recorders.length === 0");
  await new Promise(resolve => setTimeout(resolve, 80));
  const held = await evaluate<{ tracks: number; recorders: number; stopped: boolean }>("({ tracks: window.__uivMic.tracks.length, recorders: window.__uivMic.recorders.length, stopped: window.__uivMic.tracks[0].stopped })");
  await note(`held tracks=${held.tracks} recorders=${held.recorders} stopped=${held.stopped}`);
  assert.equal(held.tracks, 1);
  assert.equal(held.recorders, 0);
  assert.equal(held.stopped, false);
  await evaluate("window.__uivMic.release()");
  await waitFor("window.__uivMic.recorders.length === 1 && (document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '').includes('正在录音')");
  const armed = await evaluate<{ tracks: number; recorders: number; stopped: boolean; voice: string }>("({ tracks: window.__uivMic.tracks.length, recorders: window.__uivMic.recorders.length, stopped: window.__uivMic.tracks[0].stopped, voice: document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '' })");
  await note(`armed tracks=${armed.tracks} recorders=${armed.recorders} stopped=${armed.stopped} voice=${armed.voice}`);
  assert.equal(armed.tracks, 1);
  assert.equal(armed.recorders, 1);
  assert.equal(armed.stopped, false);
  assert.match(armed.voice, /正在录音/);
  await evaluate("document.querySelector('[data-assistant-composer] [data-uiv-cancel-record]').click()");
  await waitFor("window.__uivMic.tracks[0].stopped === true && (document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '').includes('已取消')");
  await evaluate("window.__uivMic.mode = 'missing'; document.querySelector('[data-assistant-composer] [data-uiv-mic]').click();");
  await waitFor("window.__uivMic.tracks.length === 2 && window.__uivMic.tracks[1].stopped === true && window.__uivMic.recorders.length === 1");
  const rejected = await evaluate<{ tracks: number; recorders: number; stopped: boolean; voice: string }>("({ tracks: window.__uivMic.tracks.length, recorders: window.__uivMic.recorders.length, stopped: window.__uivMic.tracks[1].stopped, voice: document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '' })");
  await note(`rejected tracks=${rejected.tracks} recorders=${rejected.recorders} stopped=${rejected.stopped} voice=${rejected.voice}`);
  assert.equal(rejected.tracks, 2);
  assert.equal(rejected.recorders, 1);
  assert.equal(rejected.stopped, true);
  assert.match(rejected.voice, /需要下载模型/);
});

const gapNote = async (line: string) => {
  const dir = process.env.UIV_EVIDENCE_DIR;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, "uiv-gap-04710.txt"), `${line}\n`);
};

test("UIV-04 切换项目后只恢复该项目草稿", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const other = await createProject(browser.web, "统一输入乙");
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  const openProject = async (id: string) => {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${id}/` }, sessionId, 20_000));
    await waitFor("document.querySelector('[data-assistant-input]') instanceof HTMLTextAreaElement");
    await waitFor(`document.body.dataset.projectId === ${JSON.stringify(id)}`);
  };
  const value = () => evaluate<string>("document.querySelector('[data-assistant-input]').value");
  const stored = () => evaluate<string>(`JSON.stringify([...Array(localStorage.length)].map((_, index) => localStorage.key(index)).filter(key => key && key.startsWith('molis.uiv.v1:')).sort().map(key => key + '=' + (localStorage.getItem(key) || '')))`);
  const setAssistant = (text: string) => evaluate(`(() => { const field = document.querySelector('[data-assistant-input]'); field.value = ${JSON.stringify(text)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.__uivErrors=[];addEventListener('error',event=>window.__uivErrors.push(event.message));" }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await openProject(projectId!);
  const seenA = await evaluate<string>("document.body.dataset.projectId || ''");
  assert.equal(seenA, projectId);
  assert.ok(seenA, "the rendered page has a project id");
  await setAssistant("项目甲草稿");
  await waitFor("document.querySelector('[data-assistant-input]').value === '项目甲草稿'");
  const draftA = await stored();
  await gapNote(`uiv-04 project-a id=${seenA} value=${JSON.stringify(await value())} stored=${draftA}`);
  assert.match(draftA, /项目甲草稿/);
  await openProject(other.project_id);
  await waitFor("document.querySelector('[data-assistant-input]').value !== '项目甲草稿'", 5_000);
  const seenB = await evaluate<string>("document.body.dataset.projectId || ''");
  const valueB = await value();
  const draftB = await stored();
  await gapNote(`uiv-04 project-b id=${seenB} value=${JSON.stringify(valueB)} stored=${draftB}`);
  assert.equal(seenB, other.project_id);
  assert.notEqual(seenB, projectId);
  assert.equal(valueB.includes("项目甲草稿"), false, valueB);
  assert.match(draftB, /项目甲草稿/);
  await setAssistant("项目乙草稿");
  await waitFor("document.querySelector('[data-assistant-input]').value === '项目乙草稿'");
  await new Promise(resolve => setTimeout(resolve, 800));
  await openProject(projectId!);
  await waitFor("document.querySelector('[data-assistant-input]').value === '项目甲草稿'", 5_000);
  const backA = await value();
  const storedBackA = await stored();
  await gapNote(`uiv-04 back-a value=${JSON.stringify(backA)} stored=${storedBackA}`);
  assert.equal(backA, "项目甲草稿");
  assert.equal(backA.includes("项目乙草稿"), false);
  await openProject(other.project_id);
  await waitFor("document.querySelector('[data-assistant-input]').value === '项目乙草稿'", 5_000);
  const backB = await value();
  const storedBackB = await stored();
  await gapNote(`uiv-04 back-b value=${JSON.stringify(backB)} stored=${storedBackB}`);
  assert.equal(backB, "项目乙草稿");
  assert.equal(backB.includes("项目甲草稿"), false);
  assert.match(storedBackB, /项目甲草稿/);
  assert.match(storedBackB, /项目乙草稿/);
  assert.deepEqual(await evaluate<string[]>("window.__uivErrors || []"), []);
});

test("UIV-10 注入时长上限、中断说明和切会话归属", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId, reloadPage } = browser;
  const hook = `(() => {
    window.__uivVoiceLog = [];
    const watch = () => {
      document.querySelectorAll("[data-uiv-voice-status]").forEach(node => {
        if (node.dataset.uivWatch === "1") return;
        node.dataset.uivWatch = "1";
        const push = () => window.__uivVoiceLog.push(node.textContent || "");
        push();
        new MutationObserver(push).observe(node, { childList: true, characterData: true, subtree: true });
      });
    };
    addEventListener("DOMContentLoaded", () => { watch(); new MutationObserver(watch).observe(document.documentElement, { childList: true, subtree: true }); });
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const body = init && typeof init.body === "string" ? init.body : "";
      if (url.includes("/api/local-voice") && body.includes('"op":"probe"')) return new Response(JSON.stringify({ model: "available" }), { status: 200, headers: { "content-type": "application/json" } });
      return realFetch(input, init);
    };
    class UivLimitRecorder extends EventTarget {
      constructor(stream) { super(); this.stream = stream; this.state = "inactive"; }
      static isTypeSupported() { return true; }
      start() { this.state = "recording"; }
      stop() { if (this.state === "inactive") return; this.state = "inactive"; const available = new Event("dataavailable"); Object.defineProperty(available, "data", { value: new Blob([new Uint8Array(32)], { type: "audio/webm" }) }); this.dispatchEvent(available); this.dispatchEvent(new Event("stop")); }
    }
    window.MediaRecorder = UivLimitRecorder;
    const allow = async () => ({ getTracks() { return [{ stop() {} }]; } });
    const devices = navigator.mediaDevices || {};
    try { devices.getUserMedia = allow; } catch { Object.defineProperty(devices, "getUserMedia", { configurable: true, value: allow }); }
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: devices });
  })();`;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: hook }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await waitFor("document.querySelector('[data-assistant-composer] [data-uiv-mic]') instanceof HTMLButtonElement");
  await evaluate("(() => { const field = document.querySelector('[data-assistant-input]'); field.value = '留下的字'; field.dispatchEvent(new Event('input', { bubbles: true })); })()");
  assert.equal(await evaluate("document.querySelector('[data-assistant-composer]').hasAttribute('data-uiv-limit-ms')"), false);
  await click("[data-assistant-composer] [data-uiv-mic]");
  await waitFor("(document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '').includes('正在录音')");
  await new Promise(resolve => setTimeout(resolve, 700));
  const unlimited = await evaluate<string>("(window.__uivVoiceLog || []).join('\\n')");
  const openKey = await evaluate<string | null>("localStorage.getItem('molis.uiv.voice-open')");
  await gapNote(`uiv-10 unlimited log=${JSON.stringify(unlimited)} open=${JSON.stringify(openKey)}`);
  assert.equal(unlimited.includes("即将达到时长上限"), false, unlimited);
  assert.equal(openKey, "1");
  await reloadPage();
  await waitFor("(document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '').includes('没能恢复尚未转写的录音')");
  const interrupted = await evaluate<{ value: string; voice: string; open: string | null }>("({ value: document.querySelector('[data-assistant-input]').value, voice: document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '', open: localStorage.getItem('molis.uiv.voice-open') })");
  await gapNote(`uiv-10 interrupt value=${JSON.stringify(interrupted.value)} voice=${interrupted.voice} open=${JSON.stringify(interrupted.open)}`);
  assert.match(interrupted.voice, /没能恢复尚未转写的录音，已保存的文字还在/);
  assert.equal(interrupted.value, "留下的字");
  assert.equal(interrupted.open, null);
  await evaluate("window.__uivVoiceLog = []; document.querySelector('[data-assistant-composer]').setAttribute('data-uiv-limit-ms', '1600');");
  await click("[data-assistant-composer] [data-uiv-mic]");
  await waitFor("(window.__uivVoiceLog || []).some(line => line.includes('即将达到时长上限')) && (window.__uivVoiceLog || []).some(line => line.includes('已到时长上限'))", 8_000);
  const limited = await evaluate<string>("(window.__uivVoiceLog || []).join('\\n')");
  await gapNote(`uiv-10 limit log=${JSON.stringify(limited)}`);
  assert.match(limited, /即将达到时长上限/);
  assert.match(limited, /已到时长上限，正在转写已经录下的内容/);
  await waitFor("document.querySelector('[data-assistant-composer] [data-uiv-mic]') instanceof HTMLButtonElement && !document.querySelector('[data-assistant-composer] [data-uiv-mic]').hidden && !(document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '').includes('正在转写')");
  await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await waitFor("!document.querySelector('[data-coding-workbench]').hidden");
  if (await evaluate<string>("document.querySelector('[data-coding-directory]')?.dataset.codingCurrentFace || ''") !== "sessions") await click("[data-coding-face=sessions]");
  await waitFor("!!document.querySelector('[data-coding-new]')?.getClientRects().length");
  await click("[data-coding-new]");
  await waitFor("document.querySelector('[data-coding-task]') instanceof HTMLTextAreaElement && !document.querySelector('[data-coding-task]').disabled");
  await evaluate("(() => { const field = document.querySelector('[data-coding-task]'); field.value = '甲会话草稿'; field.dispatchEvent(new Event('input', { bubbles: true })); })()");
  const ownerKey = await evaluate<string>("(() => { const form = document.querySelector('[data-coding-composer]'); return 'molis.uiv.v1:coding:' + encodeURIComponent(document.body.dataset.projectId || '') + ':' + encodeURIComponent(form.dataset.uivKey || ''); })()");
  await click("[data-coding-composer] [data-uiv-mic]");
  await waitFor("(document.querySelector('[data-coding-composer] [data-uiv-voice-status]')?.textContent || '').includes('正在录音')");
  // Hold the new session read so the loading interval cannot accidentally show the previous owner's words.
  await evaluate(`(() => {const real=window.fetch.bind(window);window.fetch=async(input,init)=>{const url=typeof input==='string'?input:input.url;if(/\\/sessions\\/[^/?]+$/.test(url) && (!init?.method || init.method==='GET')) await new Promise(resolve=>setTimeout(resolve,800));return real(input,init);};})()`);
  await click("[data-coding-new]");
  await waitFor("(document.querySelector('[data-coding-composer] [data-uiv-voice-status]')?.textContent || '').includes('仍属于开始时的草稿')");
  const switched = await evaluate<{ value: string; voice: string; owned: string | null; key: string }>(`(() => { const field = document.querySelector('[data-coding-task]'); return { value: field ? field.value : '', voice: document.querySelector('[data-coding-composer] [data-uiv-voice-status]')?.textContent || '', owned: localStorage.getItem(${JSON.stringify(ownerKey)}), key: document.querySelector('[data-coding-composer]').dataset.uivKey || '' }; })()`);
  await gapNote(`uiv-10 switch voice=${switched.voice} value=${JSON.stringify(switched.value)} key=${switched.key} owned=${JSON.stringify(switched.owned)} ownerKey=${ownerKey}`);
  assert.match(switched.voice, /录音或转写仍属于开始时的草稿/);
  assert.equal(switched.value.includes("甲会话草稿"), false, switched.value);
  assert.match(switched.owned ?? "", /甲会话草稿/);
});

test("UIV-07 转写进行时改字、清空和切会话不覆盖", {
  timeout: 420_000,
  skip: voiceModelDir() ? false : "prepared local model, sandbox-exec, or a known wav is absent; a skip is not 工程通过",
}, async t => {
  const modelDir = voiceModelDir();
  assert.ok(modelDir);
  const helper = process.env.UIV_JELLY_WHISPER_HELPER
    || fileURLToPath(new URL("../apps/local-host/native/materials/bin/jelly-whisper", import.meta.url));
  accessSync(helper, constants.X_OK);
  const wav = await knownDictationWav();
  const argvLog = join(mkdtempSync(join(tmpdir(), "uiv-argv-")), "argv.log");
  writeFileSync(argvLog, "");
  const wrapped = deniedHelper(helper, argvLog);
  const previous = process.env.MOLIS_JELLY_WHISPER_HELPER;
  process.env.MOLIS_JELLY_WHISPER_HELPER = wrapped;
  try {
    const browser = await openGoalBrowser(t, "seeded");
    if (!browser) return;
    const home = realpathSync(browser.homeDirectory);
    const models = join(home, "lingguang", "models");
    mkdirSync(join(home, "lingguang"), { recursive: true, mode: 0o700 });
    try { await run("/bin/cp", ["-cR", modelDir, models], { timeout: 60_000 }); }
    catch {
      await run("/bin/rm", ["-rf", models], { timeout: 60_000 });
      await run("/bin/cp", ["-R", modelDir, models], { timeout: 180_000 });
    }
    assert.equal(lstatSync(models).isSymbolicLink(), false);
    assert.ok(directoryBytes(models) > 100_000_000);
    const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId } = browser;
    const source = `(() => { const wav = Uint8Array.from(atob(${JSON.stringify(wav.toString("base64"))}), c => c.charCodeAt(0)); class UivKnownRecorder extends EventTarget { constructor(stream, options) { super(); this.stream = stream; this.state = "inactive"; this.mimeType = (options && options.mimeType) || "audio/wav"; } static isTypeSupported() { return true; } start() { this.state = "recording"; } stop() { if (this.state === "inactive") return; this.state = "inactive"; const available = new Event("dataavailable"); Object.defineProperty(available, "data", { value: new Blob([wav], { type: "audio/wav" }) }); this.dispatchEvent(available); this.dispatchEvent(new Event("stop")); } } window.MediaRecorder = UivKnownRecorder; const allow = () => Promise.resolve(new MediaStream()); const devices = navigator.mediaDevices || {}; try { devices.getUserMedia = allow; } catch { Object.defineProperty(devices, "getUserMedia", { configurable: true, value: allow }); } if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: devices }); })();`;
    await command("Page.addScriptToEvaluateOnNewDocument", { source }, sessionId);
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
    await waitFor("document.querySelector('[data-assistant-input]') instanceof HTMLTextAreaElement");
    const assistant = () => evaluate<{ value: string; voice: string }>("(() => { const form = document.querySelector('[data-assistant-composer]'); return { value: document.querySelector('[data-assistant-input]').value, voice: form.querySelector('[data-uiv-voice-status]')?.textContent || '' }; })()");
    const setAssistant = (text: string) => evaluate(`(() => { const field = document.querySelector('[data-assistant-input]'); field.value = ${JSON.stringify(text)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const stopWhenHeard = async (form: string) => {
      await click(`${form} [data-uiv-mic]`);
      await waitFor(`!document.querySelector(${JSON.stringify(form + " [data-uiv-stop-record]")}).hidden`, 30_000);
      await click(`${form} [data-uiv-stop-record]`);
      await waitFor(`(document.querySelector(${JSON.stringify(form + " [data-uiv-voice-status]")})?.textContent || '').includes('正在转写')`, 15_000);
    };
    await setAssistant("原文");
    await stopWhenHeard("[data-assistant-composer]");
    await setAssistant("完全改掉");
    try {
      await waitFor("(() => { const voice = document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || ''; const button = document.querySelector('[data-assistant-composer] [data-uiv-confirm]'); return voice.includes('插入位置已经变了') && document.querySelector('[data-assistant-input]').value === '完全改掉' && !!button && !button.hidden; })()", 150_000);
    } catch (error) {
      const stuck = await assistant();
      const button = await evaluate<string>("(() => { const button = document.querySelector('[data-assistant-composer] [data-uiv-confirm]'); return JSON.stringify({ hidden: button ? button.hidden : null }); })()");
      await gapNote(`uiv-07 edit-timeout value=${JSON.stringify(stuck.value)} voice=${stuck.voice} confirm=${button}`);
      throw error;
    }
    const edited = await assistant();
    await gapNote(`uiv-07 edit value=${JSON.stringify(edited.value)} voice=${edited.voice}`);
    assert.equal(edited.value, "完全改掉");
    assert.equal(edited.value.includes(EXPECTED_DICTATION), false);
    await click("[data-assistant-composer] [data-uiv-confirm]");
    await waitFor(`document.querySelector('[data-assistant-input]').value === ${JSON.stringify(`完全改掉\n${EXPECTED_DICTATION}`)}`);
    const confirmed = await assistant();
    await gapNote(`uiv-07 confirm value=${JSON.stringify(confirmed.value)} voice=${confirmed.voice}`);
    assert.equal(confirmed.value, `完全改掉\n${EXPECTED_DICTATION}`);
    await setAssistant("再录一句");
    await stopWhenHeard("[data-assistant-composer]");
    await setAssistant("");
    try {
      await waitFor("(() => { const form = document.querySelector('[data-assistant-composer]'); const voice = form?.querySelector('[data-uiv-voice-status]')?.textContent || ''; const mic = form?.querySelector('[data-uiv-mic]'); return voice.includes('草稿已清空，转写没有填回') && document.querySelector('[data-assistant-input]').value === '' && !!mic && !mic.hidden; })()", 150_000);
    } catch (error) {
      const stuck = await assistant();
      await gapNote(`uiv-07 clear-timeout value=${JSON.stringify(stuck.value)} voice=${stuck.voice}`);
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 400));
    const cleared = await assistant();
    await gapNote(`uiv-07 clear value=${JSON.stringify(cleared.value)} voice=${cleared.voice}`);
    assert.equal(cleared.value, "");
    assert.match(cleared.voice, /草稿已清空，转写没有填回/);
    assert.equal(cleared.value.includes(EXPECTED_DICTATION), false);
    await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
    await waitFor("!document.querySelector('[data-coding-workbench]').hidden");
    if (await evaluate<string>("document.querySelector('[data-coding-directory]')?.dataset.codingCurrentFace || ''") !== "sessions") await click("[data-coding-face=sessions]");
    await waitFor("!!document.querySelector('[data-coding-new]')?.getClientRects().length");
    await click("[data-coding-new]");
    await waitFor("document.querySelector('[data-coding-task]') instanceof HTMLTextAreaElement && !document.querySelector('[data-coding-task]').disabled");
    await evaluate("(() => { const field = document.querySelector('[data-coding-task]'); field.value = '编码原文'; field.dispatchEvent(new Event('input', { bubbles: true })); })()");
    const ownerKey = await evaluate<string>("(() => 'molis.uiv.v1:coding:' + encodeURIComponent(document.body.dataset.projectId || '') + ':' + encodeURIComponent(document.querySelector('[data-coding-composer]').dataset.uivKey || ''))()");
    await stopWhenHeard("[data-coding-composer]");
    await click("[data-coding-new]");
    try {
      await waitFor(`(() => { const voice = document.querySelector('[data-coding-composer] [data-uiv-voice-status]')?.textContent || ''; const value = document.querySelector('[data-coding-task]').value; const owned = localStorage.getItem(${JSON.stringify(ownerKey)}) || ''; return !voice.includes('正在转写') && !value.includes(${JSON.stringify(EXPECTED_DICTATION)}) && owned.includes(${JSON.stringify(EXPECTED_DICTATION)}); })()`, 150_000);
    } catch (error) {
      const stuck = await evaluate<string>(`JSON.stringify({ voice: document.querySelector('[data-coding-composer] [data-uiv-voice-status]')?.textContent || '', value: document.querySelector('[data-coding-task]').value, owned: localStorage.getItem(${JSON.stringify(ownerKey)}) })`);
      await gapNote(`uiv-07 switch-timeout ${stuck}`);
      throw error;
    }
    const moved = await evaluate<{ value: string; voice: string; owned: string | null }>(`(() => ({ value: document.querySelector('[data-coding-task]').value, voice: document.querySelector('[data-coding-composer] [data-uiv-voice-status]')?.textContent || '', owned: localStorage.getItem(${JSON.stringify(ownerKey)}) }))()`);
    const argv = readFileSync(argvLog, "utf8");
    await gapNote(`uiv-07 switch value=${JSON.stringify(moved.value)} voice=${moved.voice} owned=${JSON.stringify(moved.owned)} argv_denied=${argv.includes('"denied":true')} argv_http=${argv.includes("http")} argv_allow_download=${argv.includes("--allow-model-download")} argv_extract=${argv.includes('"extract"')}`);
    assert.equal(moved.value.includes(EXPECTED_DICTATION), false, moved.value);
    assert.match(moved.owned ?? "", new RegExp(EXPECTED_DICTATION));
    assert.match(moved.voice, /仍属于开始时的草稿/);
    assert.equal(argv.includes('"denied":true'), true);
    assert.equal(argv.includes("http"), false);
    assert.equal(argv.includes("--allow-model-download"), false);
    assert.equal(argv.includes('"extract"'), true);
  } finally {
    if (previous == null) delete process.env.MOLIS_JELLY_WHISPER_HELPER;
    else process.env.MOLIS_JELLY_WHISPER_HELPER = previous;
  }
});

const recoverNote = async (line: string) => {
  const dir = process.env.UIV_EVIDENCE_DIR;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, "uiv-recover.txt"), `${line}\n`);
};

test("UIV-04 切走编码会话再切回只恢复该会话草稿", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.__uivErrors=[];addEventListener('error',event=>window.__uivErrors.push(event.message));" }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await waitFor("!document.querySelector('[data-coding-workbench]').hidden");
  if (await evaluate<string>("document.querySelector('[data-coding-directory]')?.dataset.codingCurrentFace || ''") !== "sessions") await click("[data-coding-face=sessions]");
  await waitFor("!!document.querySelector('[data-coding-new]')?.getClientRects().length");
  await click("[data-coding-new]");
  await waitFor("document.querySelector('[data-coding-task]') instanceof HTMLTextAreaElement && !document.querySelector('[data-coding-task]').disabled");
  await evaluate("(() => { const field = document.querySelector('[data-coding-task]'); field.value = '会话甲草稿'; field.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await waitFor("document.querySelector('[data-coding-task]').value === '会话甲草稿'");
  const idA = await evaluate<string>("document.querySelector('[data-coding-composer]').dataset.uivKey || ''");
  assert.match(idA, /^[A-Za-z0-9_-]+$/);
  await click("[data-coding-new]");
  await waitFor(`document.querySelector('[data-coding-composer]').dataset.uivKey !== ${JSON.stringify(idA)} && !document.querySelector('[data-coding-task]').disabled && document.querySelector('[data-coding-task]').value === ''`);
  await evaluate("(() => { const field = document.querySelector('[data-coding-task]'); field.value = '会话乙草稿'; field.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await waitFor("document.querySelector('[data-coding-task]').value === '会话乙草稿'");
  const idB = await evaluate<string>("document.querySelector('[data-coding-composer]').dataset.uivKey || ''");
  assert.match(idB, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(idA, idB);
  await waitFor(`!!document.querySelector(${JSON.stringify(`[data-coding-session="${idA}"]`)})?.getClientRects().length`);
  await click(`[data-coding-session="${idA}"]`);
  await waitFor("document.querySelector('[data-coding-task]').value === '会话甲草稿'");
  const backA = await evaluate<{ value: string; key: string }>("({ value: document.querySelector('[data-coding-task]').value, key: document.querySelector('[data-coding-composer]').dataset.uivKey || '' })");
  await recoverNote(`uiv-04 session-a idA=${idA} idB=${idB} value=${JSON.stringify(backA.value)} key=${backA.key}`);
  assert.equal(backA.value, "会话甲草稿");
  assert.equal(backA.key, idA);
  assert.equal(backA.value.includes("会话乙草稿"), false);
  await click(`[data-coding-session="${idB}"]`);
  await waitFor("document.querySelector('[data-coding-task]').value === '会话乙草稿'");
  const backB = await evaluate<{ value: string; key: string }>("({ value: document.querySelector('[data-coding-task]').value, key: document.querySelector('[data-coding-composer]').dataset.uivKey || '' })");
  await recoverNote(`uiv-04 session-b value=${JSON.stringify(backB.value)} key=${backB.key}`);
  assert.equal(backB.value, "会话乙草稿");
  assert.equal(backB.key, idB);
  assert.equal(backB.value.includes("会话甲草稿"), false);
  assert.deepEqual(await evaluate<string[]>("window.__uivErrors || []"), []);
});

test("UIV-10 没有麦克风、设备断开和转写失败保留草稿", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId } = browser;
  const hook = `(() => {
    window.__uivMicMode = "missing";
    window.__uivTranscribeMode = "fail";
    window.__uivTranscribeCalls = 0;
    window.__uivTracks = [];
    window.__uivErrors = [];
    addEventListener("error", event => window.__uivErrors.push(event.message));
    class UivFailRecorder extends EventTarget {
      constructor(stream) { super(); this.stream = stream; this.state = "inactive"; }
      static isTypeSupported() { return true; }
      start() { this.state = "recording"; }
      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        const available = new Event("dataavailable");
        Object.defineProperty(available, "data", { value: new Blob([new Uint8Array(16)], { type: "audio/webm" }) });
        this.dispatchEvent(available);
        this.dispatchEvent(new Event("stop"));
      }
    }
    window.MediaRecorder = UivFailRecorder;
    const devices = navigator.mediaDevices || {};
    devices.getUserMedia = async () => {
      if (window.__uivMicMode === "missing") throw new DOMException("no device", "NotFoundError");
      const track = {
        stopped: false,
        listeners: [],
        stop() { if (this.stopped) return; this.stopped = true; for (const fn of this.listeners.slice()) fn(); },
        addEventListener(type, fn) { if (type === "ended") this.listeners.push(fn); },
        end() { for (const fn of this.listeners.slice()) fn(); },
      };
      window.__uivTracks.push(track);
      return { getTracks() { return [track]; } };
    };
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const body = init && typeof init.body === "string" ? init.body : "";
      if (url.includes("/api/local-voice") && body.includes('"op":"probe"')) return new Response(JSON.stringify({ model: "available" }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/api/local-voice") && body.includes('"op":"transcribe"')) {
        window.__uivTranscribeCalls += 1;
        if (window.__uivTranscribeMode === "empty") return new Response(JSON.stringify({ text: "", unclear: true }), { status: 200, headers: { "content-type": "application/json" } });
        return new Response(JSON.stringify({ error: "helper exploded raw" }), { status: 500, headers: { "content-type": "application/json" } });
      }
      return realFetch(input, init);
    };
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: devices });
  })();`;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: hook }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await waitFor("document.querySelector('[data-assistant-composer] [data-uiv-mic]') instanceof HTMLButtonElement");
  const draft = "设备草稿";
  await evaluate(`(() => { const field = document.querySelector('[data-assistant-input]'); field.value = ${JSON.stringify(draft)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const voiceOf = () => evaluate<{ value: string; voice: string; field: string; calls: number; retry: boolean; discard: boolean; mic: boolean }>("(() => { const form = document.querySelector('[data-assistant-composer]'); const retry = form.querySelector('[data-uiv-retry]'); const discard = form.querySelector('[data-uiv-discard]'); const mic = form.querySelector('[data-uiv-mic]'); return { value: document.querySelector('[data-assistant-input]').value, voice: form.querySelector('[data-uiv-voice-status]')?.textContent || '', field: form.querySelector('[data-uiv-field-state]')?.textContent || '', calls: window.__uivTranscribeCalls || 0, retry: !!retry && !retry.hidden, discard: !!discard && !discard.hidden, mic: !!mic && !mic.hidden }; })()");
  await click("[data-assistant-composer] [data-uiv-mic]");
  await waitFor("(document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '').includes('录音不可用或已中断')");
  const missing = await voiceOf();
  await recoverNote(`uiv-10 missing value=${JSON.stringify(missing.value)} voice=${missing.voice} calls=${missing.calls} mic=${missing.mic}`);
  assert.equal(missing.value, draft);
  assert.match(missing.voice, /录音不可用或已中断。草稿还在，可以继续打字。有麦克风后再点「录音」。/);
  assert.doesNotMatch(missing.voice, /系统设置|云端/);
  assert.notEqual(missing.field, missing.voice);
  assert.equal(missing.mic, true);
  assert.equal(missing.calls, 0);
  await evaluate("window.__uivMicMode = 'live';");
  await click("[data-assistant-composer] [data-uiv-mic]");
  await waitFor("(document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '').includes('正在录音')");
  await evaluate("window.__uivTracks.at(-1).end()");
  await waitFor("(document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '').includes('录音不可用或已中断') && !(document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '').includes('正在转写')");
  const ended = await voiceOf();
  await recoverNote(`uiv-10 ended value=${JSON.stringify(ended.value)} voice=${ended.voice} calls=${ended.calls} mic=${ended.mic}`);
  assert.equal(ended.value, draft);
  assert.match(ended.voice, /录音不可用或已中断。草稿还在，可以继续打字。有麦克风后再点「录音」。/);
  assert.equal(ended.mic, true);
  assert.equal(ended.value.includes("今天核对统一输入"), false);
  assert.equal(ended.calls, 0);
  await click("[data-assistant-composer] [data-uiv-mic]");
  await waitFor("(document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '').includes('正在录音')");
  await click("[data-assistant-composer] [data-uiv-cancel-record]");
  await waitFor("(document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '').includes('已取消这次录音')");
  const cancelled = await voiceOf();
  await recoverNote(`uiv-10 cancel value=${JSON.stringify(cancelled.value)} voice=${cancelled.voice} calls=${cancelled.calls}`);
  assert.equal(cancelled.value, draft);
  assert.match(cancelled.voice, /已取消这次录音，草稿还在。/);
  assert.equal(cancelled.voice.includes("录音不可用或已中断"), false);
  assert.equal(cancelled.calls, 0);
  await click("[data-assistant-composer] [data-uiv-mic]");
  await waitFor("!document.querySelector('[data-assistant-composer] [data-uiv-stop-record]').hidden");
  await click("[data-assistant-composer] [data-uiv-stop-record]");
  await waitFor("(() => { const form = document.querySelector('[data-assistant-composer]'); const voice = form.querySelector('[data-uiv-voice-status]')?.textContent || ''; const retry = form.querySelector('[data-uiv-retry]'); const discard = form.querySelector('[data-uiv-discard]'); return voice.includes('转写没有成功') && !!retry && !retry.hidden && !!discard && !discard.hidden; })()");
  const failed = await voiceOf();
  await recoverNote(`uiv-10 fail value=${JSON.stringify(failed.value)} voice=${failed.voice} calls=${failed.calls} retry=${failed.retry} discard=${failed.discard}`);
  assert.equal(failed.value, draft);
  assert.match(failed.voice, /转写没有成功。草稿还在，可以重试或丢弃这段录音。/);
  assert.equal(failed.voice.includes("helper exploded raw"), false);
  assert.equal(failed.retry, true);
  assert.equal(failed.discard, true);
  assert.equal(failed.calls, 1);
  await click("[data-assistant-composer] [data-uiv-retry]");
  await waitFor("window.__uivTranscribeCalls >= 2 && (document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '').includes('转写没有成功') && !document.querySelector('[data-assistant-composer] [data-uiv-discard]').hidden");
  const retried = await voiceOf();
  await recoverNote(`uiv-10 retry value=${JSON.stringify(retried.value)} voice=${retried.voice} calls=${retried.calls}`);
  assert.equal(retried.value, draft);
  assert.match(retried.voice, /转写没有成功/);
  assert.equal(retried.voice.includes("helper exploded raw"), false);
  await click("[data-assistant-composer] [data-uiv-discard]");
  await waitFor("(document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '').includes('已取消这次录音')");
  const discarded = await voiceOf();
  await recoverNote(`uiv-10 discard value=${JSON.stringify(discarded.value)} voice=${discarded.voice} calls=${discarded.calls}`);
  assert.equal(discarded.value, draft);
  assert.match(discarded.voice, /已取消这次录音，草稿还在。/);
  await evaluate("window.__uivTranscribeMode = 'empty';");
  await click("[data-assistant-composer] [data-uiv-mic]");
  await waitFor("!document.querySelector('[data-assistant-composer] [data-uiv-stop-record]').hidden");
  await click("[data-assistant-composer] [data-uiv-stop-record]");
  await waitFor("(document.querySelector('[data-assistant-composer] [data-uiv-voice-status]')?.textContent || '').includes('未听清')");
  const silent = await voiceOf();
  await recoverNote(`uiv-10 silent value=${JSON.stringify(silent.value)} voice=${silent.voice} calls=${silent.calls}`);
  assert.equal(silent.value, draft);
  assert.match(silent.voice, /未听清，可以重新录。/);
  assert.equal(silent.voice.includes("转写没有成功"), false);
  assert.equal(silent.calls > discarded.calls, true);
  assert.deepEqual(await evaluate<string[]>("window.__uivErrors || []"), []);
});
