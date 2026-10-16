import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, appendFileSync, chmodSync, mkdtempSync, readFileSync, writeFileSync, accessSync, constants, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  UIV_BOOT_SCRIPT, UIV_EXCLUDED_FIELDS, UIV_PLACEHOLDERS, UIV_RECOVERY, UIV_SCENE_ONLY, UIV_SEND_COPY,
  UIV_SHARED_CONTROLS, UIV_SURFACES, uivApplyTranscript, uivBeginSend, uivCancelVoice, uivCannotSend,
  uivContextInvalid, uivDiscardAudio, uivExplainInterrupted, uivFailTranscript, uivFieldLabel, uivKeyAction,
  uivClearedDraftText, uivLoadDraft, uivNoteEdit, uivNoteSwitch, uivNoteTyping, uivRequestRecord, uivRetryTranscript, uivSaveDraft,
  uivSendIdle, uivSettleSend, uivStopRecord, uivTickRecord, uivVisibleControls, uivVoiceIdle,
  type UivIdentity, type UivStore, type UivVoice,
} from "@molis-ai/molis-work-design-system";
import { extractNativeMaterial, handleLocalVoiceHttp, silentVoiceWav, transcribeLocalVoice } from "@molis-ai/molis-work-app-local-host";

const run = promisify(execFile);
const homeId = (surface: UivIdentity["surface"], sessionId: string): UivIdentity => ({ surface, projectId: "p1", sessionId });
function memory(): UivStore {
  const kept = new Map<string, string>();
  return { get: key => kept.get(key) ?? null, set: (key, value) => { if (value == null) kept.delete(key); else kept.set(key, value); } };
}
function record(owner: UivIdentity, text: string, anchor: number, limitMs: number | null = null): UivVoice {
  return uivRequestRecord(uivVoiceIdle(), { owner, text, anchor, permission: "granted", model: "ready", limitMs });
}
function evidence(name: string, line: string): void {
  const dir = process.env.UIV_EVIDENCE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, name), line.endsWith("\n") ? line : `${line}\n`);
}
function helperPath(): string {
  return process.env.UIV_JELLY_WHISPER_HELPER
    || fileURLToPath(new URL("../apps/local-host/native/materials/bin/jelly-whisper", import.meta.url));
}
function script(body: string): string {
  const file = join(mkdtempSync(join(tmpdir(), "uiv-helper-")), "helper.mjs");
  writeFileSync(file, `#!/usr/bin/env node\n${body}`, { mode: 0o700 });
  chmodSync(file, 0o700);
  return file;
}
function networkDenied(): boolean {
  return process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
}

test("UIV-01 三入口共同控件与场景差异", () => {
  assert.deepEqual(UIV_SURFACES, ["home", "assistant", "coding"]);
  assert.deepEqual(UIV_SHARED_CONTROLS, ["mic", "stop-record", "cancel", "send"]);
  assert.deepEqual(UIV_SCENE_ONLY.home, ["context"]);
  assert.deepEqual(UIV_SCENE_ONLY.assistant, ["attach", "target"]);
  assert.deepEqual(UIV_SCENE_ONLY.coding, ["attach", "intent", "model", "effort"]);
  assert.equal(UIV_EXCLUDED_FIELDS.includes("search") && UIV_EXCLUDED_FIELDS.includes("document-editor"), true);
  for (const surface of UIV_SURFACES) {
    assert.match(UIV_BOOT_SCRIPT, new RegExp(`data-${surface === "home" ? "home-talk-form" : surface === "assistant" ? "assistant-composer" : "coding-composer"}`));
  }
  assert.match(UIV_BOOT_SCRIPT, /data-uiv-mic/);
  assert.match(UIV_BOOT_SCRIPT, /停止录音/);
  assert.match(UIV_BOOT_SCRIPT, /setInterval: \(callback, ms\) => globalThis\.setInterval\(callback, ms\)/);
  assert.match(UIV_BOOT_SCRIPT, /clearInterval: \(id\) => globalThis\.clearInterval\(id\)/);
  assert.doesNotMatch(UIV_BOOT_SCRIPT, /data-coding-stop|data-assistant-control/);
  const recording = uivVisibleControls("recording");
  assert.equal(recording.stop, true);
  assert.equal(recording.mic, false);
  assert.equal(uivVisibleControls("idle").stop, false);
  assert.equal(uivFieldLabel("failed"), "失败");
  assert.notEqual(uivFieldLabel("empty"), uivFieldLabel("busy"));
});

test("UIV-02 Enter 换行、Command/Ctrl+Enter 发送、输入法不发送、空白不发送", () => {
  const idle = uivSendIdle();
  const key = (extra: Partial<Parameters<typeof uivKeyAction>[0]>) => uivKeyAction({ key: "Enter", metaKey: false, ctrlKey: false, isComposing: false, keyCode: 13, ...extra }, "idle", idle, "你好");
  assert.equal(key({}), "newline");
  assert.equal(key({ metaKey: true }), "send");
  assert.equal(key({ ctrlKey: true }), "send");
  assert.equal(key({ isComposing: true, metaKey: true }), "ignore");
  assert.equal(key({ keyCode: 229, ctrlKey: true }), "ignore");
  assert.equal(uivKeyAction({ key: "Enter", metaKey: true, ctrlKey: false, isComposing: false, keyCode: 13 }, "idle", idle, "   "), "hold");
  assert.equal(uivBeginSend(idle, "   ", false).accepted, false);
  const start = UIV_BOOT_SCRIPT.indexOf("function uivOnKey");
  const slice = UIV_BOOT_SCRIPT.slice(start, UIV_BOOT_SCRIPT.indexOf("function uivReadPhase", start));
  assert.ok(slice.indexOf('decision === "ignore" || decision === "newline"') < slice.indexOf("preventDefault"));
  const pasted = "第一行\n".repeat(40) + "末行";
  const store = memory();
  uivSaveDraft(store, homeId("coding", "s"), { text: pasted, context: "implement" });
  assert.equal(uivLoadDraft(store, homeId("coding", "s")).text, pasted);
});

test("UIV-03 成功、失败、不确定与不重复提交", () => {
  const idle = uivSendIdle();
  const first = uivBeginSend(idle, "发出去", false);
  assert.equal(first.accepted, true);
  assert.equal(first.send.message, UIV_SEND_COPY.sending);
  const again = uivBeginSend(first.send, "发出去", false);
  assert.equal(again.accepted, false);
  assert.equal(again.send.token, first.send.token);
  const failed = uivSettleSend(first.send, first.send.token, "failed");
  assert.equal(failed.clearDraft, false);
  assert.equal(failed.send.message, UIV_SEND_COPY.failed);
  const uncertain = uivSettleSend(first.send, first.send.token, "uncertain");
  assert.equal(uncertain.clearDraft, false);
  assert.equal(uivBeginSend(uncertain.send, "发出去", false).accepted, false);
  const typed = uivNoteTyping(uncertain.send);
  assert.equal(uivBeginSend(typed, "改过再发", false).accepted, true);
  const done = uivSettleSend(first.send, first.send.token, "succeeded");
  assert.equal(done.clearDraft, true);
  assert.equal(done.send.message, UIV_SEND_COPY.succeeded);
  assert.equal(uivClearedDraftText("发出去", "发出去"), "");
  assert.equal(uivClearedDraftText("", "发出去"), "");
  assert.equal(uivClearedDraftText("后来改的", "发出去"), null);
  const phaseFn = UIV_BOOT_SCRIPT.slice(UIV_BOOT_SCRIPT.indexOf("function uivReadPhase"), UIV_BOOT_SCRIPT.indexOf("function uivReadHome"));
  assert.match(phaseFn, /uivClearedDraftText/);
  assert.match(phaseFn, /queueMicrotask/);
  const homeFn = UIV_BOOT_SCRIPT.slice(UIV_BOOT_SCRIPT.indexOf("function uivReadHome"), UIV_BOOT_SCRIPT.indexOf("function uivBind"));
  assert.match(homeFn, /uivClearedDraftText/);
  assert.match(homeFn, /!settled\.clearDraft/);
  assert.ok(homeFn.indexOf("uivClearedDraftText") > homeFn.indexOf("!settled.clearDraft"));
  assert.match(homeFn, /queueMicrotask/);
  assert.equal(uivSettleSend(first.send, first.send.token + 9, "succeeded").clearDraft, false);
  const home = uivBeginSend(uivSendIdle(), "首页", false);
  assert.equal(uivBeginSend(home.send, "助理", false).accepted, false);
  const other = uivBeginSend(uivSendIdle(), "助理", false);
  assert.equal(other.accepted, true);
});

test("UIV-04 按入口和会话恢复草稿，刷新不串写", () => {
  const store = memory();
  const home = homeId("home", "subject-a");
  const other = homeId("home", "subject-b");
  const assistant = homeId("assistant", "subject-a");
  uivSaveDraft(store, home, { text: "首页这一条", context: "session-1" });
  uivSaveDraft(store, other, { text: "首页另一条", context: null });
  uivSaveDraft(store, assistant, { text: "助理这一条", context: "工作甲" });
  assert.equal(uivLoadDraft(store, home).text, "首页这一条");
  assert.equal(uivLoadDraft(store, other).text, "首页另一条");
  assert.equal(uivLoadDraft(store, assistant).text, "助理这一条");
  assert.equal(uivLoadDraft(store, homeId("coding", "subject-a")).text, "");
  assert.match(uivContextInvalid("session-1"), /没有改用别的上下文/);
  assert.equal(uivLoadDraft(store, home).context, "session-1");
});

test("UIV-06 取消保留草稿，转写插入原光标且不覆盖", () => {
  const owner = homeId("assistant", "w1");
  const draft = "已有前半和后半";
  const voice = record(owner, draft, 4);
  const cancelled = uivCancelVoice(voice);
  assert.equal(cancelled.phase, "idle");
  assert.match(cancelled.message, /草稿还在/);
  const transcribing = uivStopRecord(record(owner, draft, 4));
  const inserted = uivApplyTranscript(transcribing, transcribing.generation, owner, draft, "中间", false);
  assert.equal(inserted.text, "已有前半中间和后半");
  const second = uivStopRecord(record(owner, inserted.text, inserted.text.length));
  const again = uivApplyTranscript(second, second.generation, owner, inserted.text, "再补一句", false);
  assert.equal(again.text, "已有前半中间和后半再补一句");
});

test("UIV-07 转写中编辑、清空、切会话不覆盖不误填", () => {
  const owner = homeId("coding", "old");
  const next = homeId("coding", "new");
  const started = uivStopRecord(record(owner, "原文", 2));
  const edited = uivNoteEdit(started, "我改过了");
  const confirm = uivApplyTranscript(edited, edited.generation, owner, "我改过了", "转写", false);
  assert.equal(confirm.text, "我改过了");
  assert.equal(confirm.voice.phase, "confirm-insert");
  const cleared = uivApplyTranscript(uivNoteEdit(started, ""), started.generation, owner, "", "转写", false);
  assert.equal(cleared.text, "");
  assert.match(cleared.voice.message, /没有填回/);
  const switched = uivApplyTranscript(uivNoteSwitch(started, next), started.generation, next, "", "转写", false);
  assert.equal(switched.text, "");
  assert.equal(switched.stored?.owner.sessionId, "old");
  assert.match(switched.stored?.text ?? "", /转写/);
  const late = uivApplyTranscript(uivCancelVoice(started), started.generation, owner, "", "迟到", false);
  assert.equal(late.text, "");
  assert.equal(late.stored, null);
});

test("UIV-10 权限、无麦克风、未听清、过久、失败、切换、中断、时长、不能发送", () => {
  const owner = homeId("home", "s");
  const denied = uivRequestRecord(uivVoiceIdle(), { owner, text: "草稿", anchor: 0, permission: "denied", model: "ready", limitMs: null });
  assert.match(denied.message, /麦克风权限/);
  const missing = uivRequestRecord(uivVoiceIdle(), { owner, text: "草稿", anchor: 0, permission: "granted", model: "unavailable", limitMs: null });
  assert.match(missing.message, /没有可用的麦克风/);
  const heard = uivApplyTranscript(uivStopRecord(record(owner, "草稿", 2)), 1, owner, "草稿", "", true);
  assert.equal(heard.text, "草稿");
  assert.match(heard.voice.message, /未听清/);
  const slow = uivStopRecord(record(owner, "草稿", 0));
  assert.match(slow.message, /正在转写/);
  assert.match(slow.message, /没有剩余时间/);
  assert.doesNotMatch(slow.message, /还剩|预计/);
  const failed = uivFailTranscript(slow);
  assert.equal(failed.keepAudio, true);
  assert.equal(uivRetryTranscript(failed).phase, "transcribing");
  assert.equal(uivDiscardAudio(failed).keepAudio, false);
  assert.match(uivNoteSwitch(slow, homeId("home", "other")).message, /仍属于开始时的草稿/);
  assert.match(uivExplainInterrupted(), /没能恢复尚未转写的录音/);
  const limited = record(owner, "草稿", 0, 1_000);
  assert.match(uivTickRecord(limited, 800, 0.5).message, /即将达到时长上限/);
  assert.equal(uivTickRecord(limited, 1_000, 0.2).phase, "transcribing");
  assert.equal(uivTickRecord(record(owner, "草稿", 0, null), 60_000, 0.2).phase, "recording");
  const switchedVoice = uivNoteSwitch(record(owner, "草稿", 0, null), homeId("home", "other"));
  assert.equal(uivTickRecord(switchedVoice, 2_000, 0).phase, "recording");
  assert.match(uivTickRecord(switchedVoice, 2_000, 0).message, /仍属于开始时的草稿/);
  assert.match(uivCannotSend(""), /现在不能发送/);
  assert.match(UIV_RECOVERY.modelReady, /不表示离线/);
});

test("UIV-11 占位只帮助开口，排除搜索、名称、表单和正文编辑器", () => {
  for (const placeholder of Object.values(UIV_PLACEHOLDERS)) {
    assert.doesNotMatch(placeholder, /发送到|会话编号|session id/i);
    assert.ok(placeholder.length > 0);
  }
  assert.equal(UIV_PLACEHOLDERS.coding.includes("描述任务"), true);
  assert.deepEqual([...UIV_EXCLUDED_FIELDS], ["search", "name", "form", "document-editor"]);
  assert.equal(UIV_SURFACES.some(surface => (UIV_EXCLUDED_FIELDS as readonly string[]).includes(surface)), false);
});

test("UIV-05 本机转写在没有模型时返回 model_required，参数不上传、不下载", { timeout: 60_000 }, async () => {
  const helper = helperPath();
  const home = mkdtempSync(join(tmpdir(), "uiv-voice-home-"));
  const argvLog = join(mkdtempSync(join(tmpdir(), "uiv-argv-")), "argv.log");
  let note = "";
  try { accessSync(helper, constants.X_OK); }
  catch (error) {
    note = `jelly-whisper unavailable: ${error instanceof Error ? error.message : String(error)}`;
    evidence("uiv-offline.log", note);
    throw new Error(note);
  }
  const wrapped = script(`
import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
appendFileSync(process.env.UIV_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
const denied = process.env.UIV_DENY_NETWORK === "1";
const command = denied ? "/usr/bin/sandbox-exec" : process.env.UIV_REAL_HELPER;
const args = denied ? ["-p", "(version 1)(allow default)(deny network*)", process.env.UIV_REAL_HELPER, ...process.argv.slice(2)] : process.argv.slice(2);
const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.on("exit", code => process.exit(code ?? 1));
`);
  const previous = process.env.MOLIS_JELLY_WHISPER_HELPER;
  process.env.UIV_ARGV_LOG = argvLog;
  process.env.UIV_REAL_HELPER = helper;
  process.env.UIV_DENY_NETWORK = networkDenied() ? "1" : "0";
  process.env.MOLIS_JELLY_WHISPER_HELPER = wrapped;
  try {
    const fixture = silentVoiceWav();
    evidence("uiv-offline.log", `fixture silence.wav bytes=${fixture.length} sha256=${createHash("sha256").update(fixture).digest("hex")} network_denied=${process.env.UIV_DENY_NETWORK} allow_model_download=false`);
    const direct = await run(networkDenied() ? "/usr/bin/sandbox-exec" : helper, networkDenied() ? ["-p", "(version 1)(allow default)(deny network*)", helper, "capabilities", join(home, "missing-model")] : ["capabilities", join(home, "missing-model")], { timeout: 30_000, encoding: "utf8" }).catch((error: { stdout?: string; stderr?: string; message: string }) => error);
    evidence("uiv-offline.log", `capabilities stdout: ${"stdout" in direct ? direct.stdout : ""}`);
    evidence("uiv-offline.log", `capabilities stderr: ${"stderr" in direct ? direct.stderr : ""}`);
    const result = await transcribeLocalVoice(home, silentVoiceWav(), "silence.wav", { helperPath: wrapped, allowModelDownload: false });
    const args = readFileSync(argvLog, "utf8");
    evidence("uiv-offline.log", `extract argv: ${args}`);
    evidence("uiv-offline.log", `transcribe result: ${JSON.stringify(result)}`);
    assert.equal(args.includes("http"), false);
    assert.equal(args.includes("--allow-model-download"), false);
    assert.equal(result.text, "");
    assert.equal(result.modelRequired, true, "no local model is prepared; UIV-05 工程通过 is not claimed");
    evidence("uiv-offline.log", "UIV-05 工程通过 is not claimed: the real helper returned model_required and no fixture transcript was produced.");
  } finally {
    if (previous == null) delete process.env.MOLIS_JELLY_WHISPER_HELPER;
    else process.env.MOLIS_JELLY_WHISPER_HELPER = previous;
    delete process.env.UIV_ARGV_LOG;
    delete process.env.UIV_REAL_HELPER;
    delete process.env.UIV_DENY_NETWORK;
  }
});

test("UIV-08 未听清不发明文字，助手原文原样进入草稿；真机路径尚未转写出正文", async () => {
  const home = mkdtempSync(join(tmpdir(), "uiv-voice-stub-"));
  const spoken = "你好 hello [00:01.20] 不改写";
  const faithful = script(`
process.stdout.write(JSON.stringify({
  text: ${JSON.stringify(spoken)}, extractor: "jelly-whisper",
  pages: [{ number: 1, text: ${JSON.stringify(spoken)}, method: "whisper" }],
  coverage: { status: "sufficient", processed_pages: 1, total_pages: 1, issues: [] },
  segments: [{ text: ${JSON.stringify(spoken)}, start_seconds: 1.2, end_seconds: 2 }]
}));
`);
  const passed = await transcribeLocalVoice(home, silentVoiceWav(), "dictation.wav", { helperPath: faithful, allowModelDownload: false });
  assert.equal(passed.text, spoken);
  assert.equal(passed.unclear, false);
  const quiet = script(`process.stdout.write(JSON.stringify({ error: "insufficient_content", message: "no speech" })); process.exit(1);`);
  const silence = await transcribeLocalVoice(home, silentVoiceWav(), "dictation.wav", { helperPath: quiet, allowModelDownload: false });
  assert.equal(silence.unclear, true);
  assert.equal(silence.text, "");
  assert.match(silence.message, /未听清/);
  evidence("uiv-offline.log", "UIV-08 stub mapped insufficient_content to 未听清 and passed helper text through. This stub is not 工程通过. The real helper did not transcribe a fixture.");
});

test("UIV-08 草稿正文去掉素材时间戳，材料提取仍保留时间戳行", async () => {
  const sentence = "今天核对统一输入";
  const second = "再看一句";
  const stamped = `[0.00–1.84 秒] ${sentence}\n[1.84–3.20 秒] ${second}`;
  const helper = script(`process.stdout.write(${JSON.stringify(JSON.stringify({
    text: stamped,
    extractor: "macos-whisper-audio",
    pages: [{ number: 1, text: stamped, method: "whisper-transcript" }],
    coverage: { status: "sufficient", processed_pages: 1, total_pages: 1, issues: [] },
    segments: [
      { text: sentence, start_seconds: 0, end_seconds: 1.84 },
      { text: second, start_seconds: 1.84, end_seconds: 3.2 },
    ],
  }))});`);
  const home = mkdtempSync(join(tmpdir(), "uiv-voice-stamp-"));
  const limits = { maxBytes: 15_000_000, maxCharacters: 100_000, maxTextBytes: 400_000, maxPages: 4 };
  const material = await extractNativeMaterial(
    { file_name: "dictation.wav", bytes: silentVoiceWav() },
    { allowModelDownload: false },
    limits,
    { whisperHelperPath: helper, modelDirectory: home, platform: process.platform },
  );
  assert.equal(material.text, stamped);
  const draft = await transcribeLocalVoice(home, silentVoiceWav(), "dictation.wav", { helperPath: helper, allowModelDownload: false });
  assert.equal(draft.text, `${sentence}\n${second}`);
  assert.equal(draft.unclear, false);
  const bare = script(`process.stdout.write(${JSON.stringify(JSON.stringify({
    text: `[0.00–1.84 秒] ${sentence}`,
    extractor: "macos-whisper-audio",
    pages: [{ number: 1, text: `[0.00–1.84 秒] ${sentence}`, method: "whisper-transcript" }],
    coverage: { status: "sufficient", processed_pages: 1, total_pages: 1, issues: [] },
  }))});`);
  const stripped = await transcribeLocalVoice(home, silentVoiceWav(), "dictation.wav", { helperPath: bare, allowModelDownload: false });
  assert.equal(stripped.text, sentence);
  const previous = process.env.MOLIS_JELLY_WHISPER_HELPER;
  process.env.MOLIS_JELLY_WHISPER_HELPER = helper;
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    void handleLocalVoiceHttp(request, response, url, home);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("voice test server has no port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/projects/p1/api/local-voice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "transcribe", mime: "audio/wav", audio_base64: silentVoiceWav().toString("base64") }),
    });
    const body = await response.json() as { text?: string };
    assert.equal(response.status, 200);
    assert.equal(body.text, `${sentence}\n${second}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (previous == null) delete process.env.MOLIS_JELLY_WHISPER_HELPER;
    else process.env.MOLIS_JELLY_WHISPER_HELPER = previous;
  }
});

test("UIV-05 本地语音路由只在本机转写，模型未就绪时不下载", { timeout: 60_000 }, async () => {
  const helper = helperPath();
  accessSync(helper, constants.X_OK);
  const home = mkdtempSync(join(tmpdir(), "uiv-voice-http-"));
  const wrapped = script(`
import { spawn } from "node:child_process";
const denied = process.env.UIV_DENY_NETWORK === "1";
const command = denied ? "/usr/bin/sandbox-exec" : process.env.UIV_REAL_HELPER;
const args = denied ? ["-p", "(version 1)(allow default)(deny network*)", process.env.UIV_REAL_HELPER, ...process.argv.slice(2)] : process.argv.slice(2);
const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.on("exit", code => process.exit(code ?? 1));
`);
  const previousHelper = process.env.MOLIS_JELLY_WHISPER_HELPER;
  process.env.UIV_REAL_HELPER = helper;
  process.env.UIV_DENY_NETWORK = networkDenied() ? "1" : "0";
  process.env.MOLIS_JELLY_WHISPER_HELPER = wrapped;
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    void handleLocalVoiceHttp(request, response, url, home);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("voice test server has no port");
  try {
    const fixture = silentVoiceWav();
    evidence("uiv-offline.log", `http fixture silence.wav bytes=${fixture.length} sha256=${createHash("sha256").update(fixture).digest("hex")} network_denied=${process.env.UIV_DENY_NETWORK} confirm_download=false`);
    const response = await fetch(`http://127.0.0.1:${address.port}/projects/p1/api/local-voice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "transcribe", mime: "audio/wav", audio_base64: fixture.toString("base64") }),
    });
    const raw = await response.text();
    evidence("uiv-offline.log", `http transcribe status=${response.status} raw=${raw}`);
    const body = JSON.parse(raw) as { model_required?: boolean; text?: string };
    assert.equal(response.status, 409);
    assert.equal(body.model_required, true);
    assert.equal(body.text, "");
    const refused = await fetch(`http://127.0.0.1:${address.port}/projects/p1/api/local-voice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "prepare", confirm_download: false }),
    });
    const refusedRaw = await refused.text();
    evidence("uiv-offline.log", `http prepare confirm_download=false status=${refused.status} raw=${refusedRaw}`);
    assert.equal(refused.status, 400);
    evidence("uiv-offline.log", "UIV-05 and UIV-08 工程通过 are not claimed. The delivered path returned model_required. No model was downloaded.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (previousHelper == null) delete process.env.MOLIS_JELLY_WHISPER_HELPER;
    else process.env.MOLIS_JELLY_WHISPER_HELPER = previousHelper;
    delete process.env.UIV_REAL_HELPER;
    delete process.env.UIV_DENY_NETWORK;
  }
});
