/// <reference lib="dom" />
import {
  UIV_RECOVERY, UIV_SEND_COPY, UIV_VOICE_OPEN_KEY,
  uivApplyTranscript, uivBeginDownload, uivBeginSend, uivBytesLabel, uivCancelVoice, uivCannotSend, uivClampAnchor,
  uivConfirmInsert, uivContextInvalid, uivDiscardAudio, uivDownloadProgress, uivExplainInterrupted, uivFailTranscript,
  uivFieldLabel, uivFieldState, uivFinishDownload, uivInsertTranscript, uivKeyAction, uivLoadDraft, uivNoteEdit,
  uivClearedDraftText, uivNoteSwitch, uivNoteTyping, uivPhaseBusy, uivRequestRecord, uivRetryTranscript, uivSameIdentity, uivSaveDraft,
  uivSettleSend, uivStopRecord, uivStorageKey, uivTickRecord, uivVisibleControls, uivVoiceBusy, uivVoiceIdle,
  type UivIdentity, type UivSend, type UivStore, type UivSurface, type UivVoice,
} from "./unified-input.js";

/** Browser globals the boot passes in, so this module does not read the page itself. */
export interface UivPageHost {
  document: Document;
  navigator: Navigator;
  MediaRecorder?: typeof MediaRecorder;
  AudioContext?: typeof AudioContext;
  crypto: Crypto;
  localStorage: Storage;
  L: (text: string) => string;
  molisWorkControlHeaders: () => Record<string, string>;
  molisWorkRequest?: (url: string, init: { body?: Record<string, unknown>; signal?: AbortSignal; as?: "json" | "response"; accept?: number[] }) => Promise<unknown>;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
  now: () => number;
}
interface UivLive {
  voice: UivVoice;
  sends: Map<string, UivSend>;
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  audio: AudioContext | null;
  chunks: Blob[];
  blob: Blob | null;
  timer: ReturnType<UivPageHost["setInterval"]> | 0;
  started: number;
  drop: boolean;
  releasing: boolean;
  pending: { owner: UivIdentity; text: string } | null;
  download: AbortController | null;
  arming: boolean;
}
type UivField = HTMLTextAreaElement | HTMLInputElement;

export const UIV_STYLE = `
form.uiv-composer .assistant-composer-input,
form.uiv-composer [data-home-talk-form] textarea,
form[data-home-talk-form].uiv-composer textarea,
form[data-assistant-composer].uiv-composer .assistant-composer-input,
form[data-coding-composer].uiv-composer [data-coding-task] {
  box-sizing: border-box !important; width: 100% !important; min-height: 44px !important; height: auto !important;
  font-size: 16px !important; line-height: 1.45 !important; padding: 8px 10px !important;
  border: 1px solid var(--line) !important; border-radius: 10px !important;
  background: var(--paper) !important; color: var(--ink) !important;
}
form.uiv-composer textarea:focus, form.uiv-composer .assistant-composer-input:focus {
  outline: 2px solid var(--ink) !important; outline-offset: 1px;
}
form[data-assistant-composer].uiv-composer { flex-wrap: wrap !important; width: 100%; height: auto !important; min-height: 44px !important; max-height: none !important; }
form[data-home-talk-form].uiv-composer { flex-wrap: wrap; width: 100%; }
form[data-assistant-composer].uiv-composer .assistant-composer-input { flex: 1 1 100% !important; min-width: 100% !important; }
form[data-home-talk-form].uiv-composer textarea { flex: 1 1 100% !important; min-width: 70% !important; }
.uiv-bar { display: inline-flex; gap: 6px; align-items: center; }
.uiv-bar button, form.uiv-composer [data-uiv-send-status], form.uiv-composer [data-uiv-voice-status], form.uiv-composer [data-uiv-meter], form.uiv-composer [data-uiv-field-state] {
  font: inherit; font-size: 13px; line-height: 1.4;
}
form.uiv-composer [data-uiv-voice-status], form.uiv-composer [data-uiv-send-status], form.uiv-composer [data-uiv-meter], form.uiv-composer [data-uiv-field-state] {
  flex: 1 0 100%; margin: 0;
}
@media (max-width: 720px) {
  [data-assistant-island], [data-home-talk], [data-dock], form.uiv-composer,
  form[data-coding-composer].uiv-composer .coding-composer-shell,
  form[data-coding-composer].uiv-composer [data-coding-task] { width: 100% !important; max-width: none !important; }
  .uiv-bar { flex-wrap: wrap; }
}
`.replaceAll("\n", " ");

function uivStoreOf(host: UivPageHost): UivStore {
  return {
    get(key) { try { return host.localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { if (value == null) host.localStorage.removeItem(key); else host.localStorage.setItem(key, value); } catch { return; } },
  };
}
function uivSurface(form: HTMLFormElement): UivSurface | null {
  if (form.matches("[data-home-talk-form]")) return "home";
  if (form.matches("[data-assistant-composer]")) return "assistant";
  if (form.matches("[data-coding-composer]")) return "coding";
  return null;
}
function uivField(form: HTMLFormElement): UivField | null {
  const field = form.querySelector("[data-assistant-input], [data-coding-task], textarea");
  return field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement ? field : null;
}
function uivIdentity(form: HTMLFormElement, host: UivPageHost): UivIdentity {
  const surface = uivSurface(form) ?? "home";
  const projectId = host.document.body?.dataset.projectId ?? "";
  let sessionId = form.dataset.uivKey ?? "";
  if (surface === "assistant" && !sessionId) {
    try { sessionId = host.localStorage.getItem("molis.assistant.current") ?? ""; } catch { sessionId = ""; }
  }
  return { surface, projectId, sessionId };
}
function uivContext(form: HTMLFormElement): string | null {
  if (form.matches("[data-coding-composer]")) return form.querySelector<HTMLSelectElement>("[data-coding-intent]")?.value ?? null;
  if (form.matches("[data-home-talk-form]")) return form.ownerDocument.querySelector<HTMLInputElement>("[name=talk-session]:checked")?.value ?? null;
  const label = form.querySelector("[data-assistant-target-label]")?.textContent?.trim();
  return label || null;
}
function uivObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
function uivMeter(level: number): string {
  const filled = Math.round(Math.max(0, Math.min(1, level)) * 8);
  return `${"▮".repeat(filled)}${"▯".repeat(8 - filled)} ${filled}/8`;
}
function uivForms(host: UivPageHost): HTMLFormElement[] {
  return [...host.document.querySelectorAll("form")].filter((form): form is HTMLFormElement => form instanceof HTMLFormElement && form.dataset.uivBound === "1");
}
function uivButton(host: UivPageHost, attr: string, label: string): HTMLButtonElement {
  const button = host.document.createElement("button");
  button.type = "button";
  button.setAttribute(attr, "");
  button.textContent = host.L(label);
  button.setAttribute("aria-label", host.L(label));
  button.hidden = true;
  return button;
}
function uivEnsure(form: HTMLFormElement, host: UivPageHost): void {
  form.classList.add("uiv-composer");
  const field = uivField(form);
  field?.setAttribute("data-uiv-input", "");
  if (form.querySelector("[data-uiv-bar]")) return;
  const bar = host.document.createElement("span");
  bar.className = "uiv-bar";
  bar.setAttribute("data-uiv-bar", "");
  bar.append(uivButton(host, "data-uiv-mic", "录音"), uivButton(host, "data-uiv-stop-record", "停止录音"), uivButton(host, "data-uiv-cancel-record", "取消录音"), uivButton(host, "data-uiv-download", "下载"), uivButton(host, "data-uiv-retry", "重试转写"), uivButton(host, "data-uiv-discard", "丢弃录音"), uivButton(host, "data-uiv-confirm", "确认插入"), uivButton(host, "data-uiv-decline", "不插入"));
  const submit = form.querySelector<HTMLElement>("[data-assistant-send], [data-coding-send], button[type=submit]");
  if (submit?.parentElement) submit.parentElement.insertBefore(bar, submit);
  else form.append(bar);
  for (const [attr, role] of [["data-uiv-field-state", "status"], ["data-uiv-voice-status", "status"], ["data-uiv-meter", "status"], ["data-uiv-send-status", "status"]] as const) {
    const node = host.document.createElement("p");
    node.setAttribute(attr, "");
    node.setAttribute("role", role);
    form.append(node);
  }
}
function uivShow(form: HTMLFormElement, attr: string, on: boolean): void {
  const button = form.querySelector<HTMLButtonElement>(`[${attr}]`);
  if (button) button.hidden = !on;
}
function uivText(form: HTMLFormElement, attr: string, text: string): void {
  const node = form.querySelector(`[${attr}]`);
  if (node) node.textContent = text;
}
function uivPaint(live: UivLive, host: UivPageHost): void {
  const controls = uivVisibleControls(live.voice.phase);
  const voiceText = live.voice.message ? host.L(live.voice.message) : "";
  const meter = live.voice.phase === "recording" ? `${host.L("声音")} ${uivMeter(live.voice.level)}` : "";
  for (const form of uivForms(host)) {
    const field = uivField(form);
    if (!field) continue;
    const id = uivIdentity(form, host);
    const send = live.sends.get(uivStorageKey(id)) ?? uivSendIdle();
    const owned = uivSameIdentity(live.voice.owner, id);
    const state = uivFieldState({ text: field.value, focused: host.document.activeElement === field, unavailable: field.disabled, busy: uivVoiceBusy(live.voice) || send.phase === "sending", failed: send.phase === "failed" || (owned && live.voice.phase === "failed") });
    form.dataset.uivState = state;
    uivText(form, "data-uiv-field-state", host.L(uivFieldLabel(state)));
    uivShow(form, "data-uiv-mic", controls.mic);
    uivShow(form, "data-uiv-stop-record", controls.stop);
    uivShow(form, "data-uiv-cancel-record", controls.cancel);
    uivShow(form, "data-uiv-download", controls.download);
    uivShow(form, "data-uiv-retry", controls.retry && owned);
    uivShow(form, "data-uiv-discard", controls.discard && owned);
    uivShow(form, "data-uiv-confirm", controls.confirm && owned);
    uivShow(form, "data-uiv-decline", controls.decline && owned);
    uivText(form, "data-uiv-voice-status", voiceText);
    uivText(form, "data-uiv-meter", meter);
    uivText(form, "data-uiv-send-status", send.message ? host.L(send.message) : "");
  }
  uivMarkOpen(live, host);
}
function uivMarkOpen(live: UivLive, host: UivPageHost): void {
  try {
    if (uivVoiceBusy(live.voice)) host.localStorage.setItem(UIV_VOICE_OPEN_KEY, "1");
    else host.localStorage.removeItem(UIV_VOICE_OPEN_KEY);
  } catch { return; }
}
function uivSendIdle(): UivSend { return { phase: "idle", token: 0, text: "", message: "" }; }
function uivRemember(form: HTMLFormElement, host: UivPageHost): void {
  const field = uivField(form);
  if (!field) return;
  uivSaveDraft(uivStoreOf(host), uivIdentity(form, host), { text: field.value, context: uivContext(form) });
}
function uivRestoreContext(form: HTMLFormElement, context: string | null): string {
  if (!context) return "";
  if (form.matches("[data-coding-composer]")) {
    const select = form.querySelector<HTMLSelectElement>("[data-coding-intent]");
    if (!select || ![...select.options].some(option => option.value === context)) return uivContextInvalid(context);
    if (!select.value) select.value = context;
    return "";
  }
  if (form.matches("[data-home-talk-form]")) {
    const radio = form.ownerDocument.querySelector<HTMLInputElement>(`[name="talk-session"][value="${CSS.escape(context)}"]`);
    if (!radio) return uivContextInvalid(context);
    if (!form.ownerDocument.querySelector("[name=talk-session]:checked")) radio.checked = true;
  }
  return "";
}
function uivLimitMs(form: HTMLFormElement): number | null {
  const parsed = Number(form.dataset.uivLimitMs);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function uivForeignDraft(host: UivPageHost, id: UivIdentity, text: string): boolean {
  if (!text) return false;
  const ownKey = uivStorageKey(id);
  let keys: string[] = [];
  try {
    keys = [...Array(host.localStorage.length)].map((_, index) => host.localStorage.key(index) ?? "").filter(key => key.startsWith("molis.uiv.v1:") && key !== ownKey);
  } catch { return false; }
  for (const key of keys) {
    let raw: string | null = null;
    try { raw = host.localStorage.getItem(key); } catch { raw = null; }
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { text?: unknown };
      if (parsed.text !== text) continue;
    } catch { continue; }
    if (decodeURIComponent(key.split(":")[2] ?? "") !== id.projectId) return true;
  }
  return false;
}
function uivRestore(form: HTMLFormElement, host: UivPageHost): void {
  const field = uivField(form);
  if (!field) return;
  const id = uivIdentity(form, host);
  const draft = uivLoadDraft(uivStoreOf(host), id);
  const foreign = field.value !== draft.text && uivForeignDraft(host, id, field.value);
  if (field.value !== draft.text && (foreign || !field.value)) {
    field.value = draft.text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const invalid = uivRestoreContext(form, draft.context);
  if (invalid) uivText(form, "data-uiv-send-status", host.L(invalid));
}
function uivApplyPending(form: HTMLFormElement, live: UivLive, host: UivPageHost): void {
  const pending = live.pending;
  const field = uivField(form);
  if (!pending || !field || !uivSameIdentity(pending.owner, uivIdentity(form, host))) return;
  field.value = pending.text;
  live.pending = null;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  uivRemember(form, host);
}
function uivRelease(live: UivLive, host: UivPageHost): void {
  live.releasing = true;
  host.clearInterval(live.timer);
  live.timer = 0;
  live.stream?.getTracks().forEach(track => track.stop());
  live.stream = null;
  live.recorder = null;
  void live.audio?.close();
  live.audio = null;
  live.releasing = false;
}
function uivCancel(live: UivLive, host: UivPageHost): void {
  live.drop = true;
  live.download?.abort();
  live.download = null;
  if (live.recorder && live.recorder.state !== "inactive") live.recorder.stop();
  live.blob = null;
  live.chunks = [];
  uivRelease(live, host);
  live.voice = uivCancelVoice(live.voice);
  uivPaint(live, host);
}
function uivLevel(live: UivLive): number {
  const context = live.audio;
  const stream = live.stream;
  if (!context || !stream) return live.voice.level;
  let source: MediaStreamAudioSourceNode | null = null;
  try {
    const analyser = context.createAnalyser();
    source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) { const centered = sample / 128 - 1; sum += centered * centered; }
    return Math.min(1, Math.sqrt(sum / samples.length) * 4);
  } catch { return live.voice.level; }
  finally { source?.disconnect(); }
}
function uivTick(live: UivLive, host: UivPageHost): void {
  if (live.voice.phase !== "recording") return;
  const next = uivTickRecord(live.voice, host.now() - live.started, uivLevel(live));
  const limited = next.phase === "transcribing";
  live.voice = next;
  if (limited && live.recorder && live.recorder.state === "recording") live.recorder.stop();
  uivPaint(live, host);
}
function uivWriteTranscript(live: UivLive, host: UivPageHost, generation: number, transcript: string, unclear: boolean): void {
  const owner = live.voice.owner;
  const form = uivForms(host).find(candidate => owner && uivSameIdentity(uivIdentity(candidate, host), owner)) ?? uivForms(host)[0];
  const field = form ? uivField(form) : null;
  const current = form ? uivIdentity(form, host) : owner;
  if (!current) return;
  const applied = uivApplyTranscript(live.voice, generation, current, field?.value ?? "", transcript, unclear);
  live.voice = applied.voice;
  if (applied.stored) { live.pending = applied.stored; uivSaveDraft(uivStoreOf(host), applied.stored.owner, { text: applied.stored.text, context: null }); }
  else if (field && applied.text !== field.value) { field.value = applied.text; field.dispatchEvent(new Event("input", { bubbles: true })); }
  if (!unclear && transcript.trim() && live.voice.phase === "idle") live.blob = null;
  uivPaint(live, host);
}
async function uivEncode(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
async function uivTranscribe(live: UivLive, host: UivPageHost, generation: number): Promise<void> {
  const blob = live.blob;
  if (!blob) { live.voice = uivFailTranscript(live.voice); uivPaint(live, host); return; }
  const posted = await uivFetch(host, { op: "transcribe", audio_base64: await uivEncode(blob), mime: blob.type }, undefined);
  const body = posted.json ?? {};
  if (generation !== live.voice.generation) return;
  if (body.model_required === true) {
    live.voice = { ...live.voice, phase: "need-model", message: typeof body.message === "string" ? body.message : UIV_RECOVERY.needModel, bytesTotal: typeof body.approximate_bytes === "number" ? body.approximate_bytes : live.voice.bytesTotal };
    uivPaint(live, host);
    return;
  }
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim() && body.unclear !== true && typeof body.error === "string" && body.error.trim()) {
    live.voice = uivFailTranscript({ ...live.voice, phase: "transcribing" });
    uivPaint(live, host);
    return;
  }
  uivWriteTranscript(live, host, generation, text, body.unclear === true || !text.trim());
}
function uivTranscribeOrFail(live: UivLive, host: UivPageHost, generation: number): void {
  void uivTranscribe(live, host, generation).catch(() => {
    if (generation !== live.voice.generation) return;
    live.voice = uivFailTranscript({ ...live.voice, phase: "transcribing" });
    uivPaint(live, host);
  });
}
async function uivFetch(host: UivPageHost, body: Record<string, unknown>, signal: AbortSignal | undefined, stream = false): Promise<{ response: Response | null; json: Record<string, unknown> | null }> {
  const request = host.molisWorkRequest;
  if (!request) throw new Error(UIV_RECOVERY.failed);
  const prefix = host.document.body?.dataset.routePrefix ?? "";
  const url = `${prefix}/api/local-voice`;
  if (stream) {
    const response = await request(url, { body, signal, as: "response" });
    if (!(response instanceof Response)) throw new Error(UIV_RECOVERY.failed);
    return { response, json: null };
  }
  return { response: null, json: uivObject(await request(url, { body, signal, accept: [409] })) };
}
async function uivReadLines(response: Response, onLine: (value: Record<string, unknown>) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    buffer += decoder.decode(step.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) { const parsed = line.trim() ? uivObject(JSON.parse(line) as unknown) : null; if (parsed) onLine(parsed); }
  }
  const last = buffer.trim() ? uivObject(JSON.parse(buffer) as unknown) : null;
  if (last) onLine(last);
}
function uivOnStop(live: UivLive, host: UivPageHost): void {
  const generation = live.voice.generation;
  const blob = new Blob(live.chunks, { type: live.chunks[0]?.type || "audio/webm" });
  live.chunks = [];
  uivRelease(live, host);
  if (live.drop) { live.drop = false; live.blob = null; return; }
  live.blob = blob;
  if (live.voice.phase === "recording") live.voice = uivStopRecord(live.voice);
  uivPaint(live, host);
  uivTranscribeOrFail(live, host, generation);
}
function uivDeviceLost(live: UivLive, host: UivPageHost, stream: MediaStream): void {
  if (live.releasing || live.drop || live.voice.phase !== "recording" || live.stream !== stream) return;
  live.drop = true;
  live.voice = { ...uivVoiceIdle(), generation: live.voice.generation + 1, phase: "unavailable", message: UIV_RECOVERY.noMic };
  uivPaint(live, host);
  if (live.recorder && live.recorder.state !== "inactive") live.recorder.stop();
  else uivRelease(live, host);
}
function uivArm(form: HTMLFormElement, stream: MediaStream, live: UivLive, host: UivPageHost): void {
  live.releasing = false;
  const field = uivField(form);
  const Recorder = host.MediaRecorder;
  if (!field || !Recorder) { stream.getTracks().forEach(track => track.stop()); return; }
  const mime = Recorder.isTypeSupported?.("audio/webm") ? "audio/webm" : Recorder.isTypeSupported?.("audio/mp4") ? "audio/mp4" : "";
  const recorder = new Recorder(stream, mime ? { mimeType: mime } : undefined);
  live.stream = stream;
  live.recorder = recorder;
  live.chunks = [];
  live.drop = false;
  live.blob = null;
  live.started = host.now();
  stream.getTracks().forEach(track => {
    if (typeof track.addEventListener === "function") track.addEventListener("ended", () => uivDeviceLost(live, host, stream));
  });
  try { live.audio = host.AudioContext ? new host.AudioContext() : null; } catch { live.audio = null; }
  recorder.addEventListener("dataavailable", event => { if (event.data.size) live.chunks.push(event.data); });
  recorder.addEventListener("stop", () => uivOnStop(live, host));
  recorder.start(200);
  live.timer = host.setInterval(() => uivTick(live, host), 200);
  uivPaint(live, host);
}
async function uivClickMic(form: HTMLFormElement, live: UivLive, host: UivPageHost): Promise<void> {
  if (live.arming || uivVoiceBusy(live.voice)) return;
  live.arming = true;
  const field = uivField(form);
  if (!field) { live.arming = false; return; }
  const owner = uivIdentity(form, host);
  const text = field.value;
  const anchor = uivClampAnchor(text, field.selectionStart ?? text.length);
  const devices = host.navigator.mediaDevices;
  if (!devices || !host.MediaRecorder) {
    live.voice = uivRequestRecord(live.voice, { owner, text, anchor, permission: "granted", model: "unavailable", limitMs: null });
    uivPaint(live, host);
    live.arming = false;
    return;
  }
  let stream: MediaStream | null = null;
  const stopStream = (): void => {
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
  };
  try {
    try { stream = await devices.getUserMedia({ audio: true }); }
    catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      const denied = name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError";
      live.voice = uivRequestRecord(live.voice, { owner, text, anchor, permission: denied ? "denied" : "granted", model: denied ? "ready" : "unavailable", limitMs: null });
      uivPaint(live, host);
      return;
    }
    let probe: Record<string, unknown> | null = null;
    try { probe = (await uivFetch(host, { op: "probe" }, undefined)).json; }
    catch (error) {
      stopStream();
      live.voice = uivRequestRecord(live.voice, { owner, text, anchor, permission: "granted", model: "unavailable", limitMs: null });
      live.voice = { ...live.voice, message: error instanceof Error && error.message ? error.message : UIV_RECOVERY.noMic };
      uivPaint(live, host);
      return;
    }
    if (probe?.model !== "available") {
      stopStream();
      const bytes = typeof probe?.approximate_bytes === "number" ? probe.approximate_bytes : Number(probe?.approximate_bytes);
      live.voice = uivRequestRecord(live.voice, { owner, text, anchor, permission: "granted", model: "missing", approximateBytes: Number.isFinite(bytes) ? bytes : undefined, limitMs: null });
      if (typeof probe?.message === "string" && probe.message) live.voice = { ...live.voice, message: probe.message };
      uivPaint(live, host);
      return;
    }
    const next = uivRequestRecord(live.voice, { owner, text, anchor, permission: "granted", model: "ready", limitMs: uivLimitMs(form) });
    if (next.phase !== "recording" || next.generation === live.voice.generation) {
      stopStream();
      return;
    }
    live.voice = next;
    const armed = stream;
    stream = null;
    if (armed) uivArm(form, armed, live, host);
  } finally {
    stopStream();
    live.arming = false;
  }
}
async function uivDownload(live: UivLive, host: UivPageHost): Promise<void> {
  live.voice = uivBeginDownload(live.voice, true);
  const generation = live.voice.generation;
  uivPaint(live, host);
  const controller = new AbortController();
  live.download = controller;
  let ok = true;
  let note = "";
  const posted = await uivFetch(host, { op: "prepare", confirm_download: true }, controller.signal, true);
  if (!posted.response) throw new Error(UIV_RECOVERY.downloadFailed);
  await uivReadLines(posted.response, line => {
    if (typeof line.progress === "number") {
      const total = live.voice.bytesTotal || 626_000_000;
      live.voice = uivDownloadProgress(live.voice, Math.round(line.progress * total), total);
      uivPaint(live, host);
    }
    if (line.ok === false) { ok = false; note = typeof line.message === "string" ? line.message : UIV_RECOVERY.downloadFailed; }
  });
  if (generation !== live.voice.generation || live.voice.phase !== "downloading") return;
  live.voice = uivFinishDownload(live.voice, ok);
  if (!ok && note) live.voice = { ...live.voice, message: note };
  live.download = null;
  uivPaint(live, host);
}
function uivAct(button: HTMLButtonElement, form: HTMLFormElement, live: UivLive, host: UivPageHost): void {
  if (button.hasAttribute("data-uiv-mic")) { void uivClickMic(form, live, host).catch(error => { live.voice = { ...uivVoiceIdle(), generation: live.voice.generation, phase: "unavailable", message: error instanceof Error ? error.message : UIV_RECOVERY.noMic }; uivPaint(live, host); }); return; }
  if (button.hasAttribute("data-uiv-stop-record")) { live.drop = false; if (live.voice.phase === "recording") live.voice = uivStopRecord(live.voice); live.recorder?.stop(); uivPaint(live, host); return; }
  if (button.hasAttribute("data-uiv-cancel-record")) { uivCancel(live, host); return; }
  if (button.hasAttribute("data-uiv-download")) { void uivDownload(live, host).catch(error => { live.voice = uivFinishDownload({ ...live.voice, phase: "downloading" }, false); live.voice = { ...live.voice, message: error instanceof Error && error.message ? error.message : UIV_RECOVERY.downloadFailed }; uivPaint(live, host); }); return; }
  if (button.hasAttribute("data-uiv-retry")) { live.voice = uivRetryTranscript(live.voice); uivPaint(live, host); uivTranscribeOrFail(live, host, live.voice.generation); return; }
  if (button.hasAttribute("data-uiv-discard")) { live.blob = null; live.voice = uivDiscardAudio(live.voice); uivPaint(live, host); return; }
  const field = uivField(form);
  if (!field) return;
  if (button.hasAttribute("data-uiv-confirm") || button.hasAttribute("data-uiv-decline")) {
    const decided = uivConfirmInsert(live.voice, field.value, button.hasAttribute("data-uiv-confirm"));
    live.voice = decided.voice;
    if (decided.text !== field.value) { field.value = decided.text; field.dispatchEvent(new Event("input", { bubbles: true })); }
    live.blob = null;
    uivPaint(live, host);
  }
}
function uivOnInput(form: HTMLFormElement, live: UivLive, host: UivPageHost): void {
  const field = uivField(form);
  if (!field) return;
  const id = uivIdentity(form, host);
  uivRemember(form, host);
  if (uivSameIdentity(live.voice.owner, id)) live.voice = uivNoteEdit(live.voice, field.value);
  const key = uivStorageKey(id);
  const send = uivNoteTyping(live.sends.get(key) ?? uivSendIdle());
  live.sends.set(key, send);
  if (form.dataset.uivPhase && form.dataset.uivPhase !== "sending") delete form.dataset.uivPhase;
  uivPaint(live, host);
}
function uivRefuse(form: HTMLFormElement, live: UivLive, host: UivPageHost): void {
  const field = uivField(form);
  const key = uivStorageKey(uivIdentity(form, host));
  const send = live.sends.get(key) ?? uivSendIdle();
  live.sends.set(key, field?.value.trim() ? { ...send, message: uivCannotSend("") } : { ...send, message: UIV_SEND_COPY.blank });
  uivPaint(live, host);
}
function uivOnSubmit(event: Event, live: UivLive, host: UivPageHost): void {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.dataset.uivBound !== "1") return;
  const field = uivField(form);
  if (!field) return;
  const key = uivStorageKey(uivIdentity(form, host));
  const begun = uivBeginSend(live.sends.get(key) ?? uivSendIdle(), field.value, uivVoiceBusy(live.voice));
  live.sends.set(key, begun.send);
  if (begun.accepted) { form.dataset.uivPhase = "sending"; form.dataset.uivSendKey = key; }
  if (!begun.accepted) { event.preventDefault(); event.stopImmediatePropagation(); }
  uivPaint(live, host);
}
function uivKeyForm(event: Event): HTMLFormElement | null {
  if (!(event.target instanceof Element)) return null;
  const form = event.target.closest("form");
  return form instanceof HTMLFormElement && form.dataset.uivBound === "1" ? form : null;
}
function uivOnKey(event: KeyboardEvent, live: UivLive, host: UivPageHost): void {
  const form = uivKeyForm(event);
  const field = form ? uivField(form) : null;
  if (!form || !field || event.target !== field) return;
  const key = uivStorageKey(uivIdentity(form, host));
  const send = live.sends.get(key) ?? uivSendIdle();
  const decision = uivKeyAction({ key: event.key, metaKey: event.metaKey, ctrlKey: event.ctrlKey, isComposing: event.isComposing, keyCode: event.keyCode }, live.voice.phase, send, field.value);
  if (decision === "ignore" || decision === "newline") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (decision === "cancel-voice") { uivCancel(live, host); return; }
  if (decision === "hold") { live.sends.set(key, uivBeginSend(send, field.value, uivVoiceBusy(live.voice)).send); uivPaint(live, host); return; }
  const submit = form.querySelector<HTMLButtonElement>("[data-assistant-send], [data-coding-send], button[type=submit]");
  if (submit?.disabled) { uivRefuse(form, live, host); return; }
  form.requestSubmit();
}
function uivReadPhase(form: HTMLFormElement, live: UivLive, host: UivPageHost): void {
  const phase = form.dataset.uivPhase;
  const key = uivStorageKey(uivIdentity(form, host));
  const remembered = form.dataset.uivSendKey || key;
  const send = live.sends.get(remembered) ?? uivSendIdle();
  const move = (next: UivSend): void => {
    live.sends.set(key, next);
    if (remembered !== key) live.sends.delete(remembered);
    delete form.dataset.uivSendKey;
  };
  if (phase === "idle" && send.phase === "sending") { move({ ...send, phase: "idle", message: "" }); return; }
  if (phase !== "succeeded" && phase !== "failed" && phase !== "uncertain") return;
  if (send.phase !== "sending") return;
  const settled = uivSettleSend(send, send.token, phase);
  const sent = send.text;
  const savedKey = remembered;
  move(settled.send);
  if (!settled.clearDraft) return;
  queueMicrotask(() => {
    const field = uivField(form);
    if (!field || uivClearedDraftText(field.value, sent) !== "") return;
    if (field.value) field.value = "";
    const store = uivStoreOf(host);
    const empty = JSON.stringify({ text: "", context: uivContext(form) });
    store.set(savedKey, empty);
    const currentKey = uivStorageKey(uivIdentity(form, host));
    if (currentKey !== savedKey) store.set(currentKey, empty);
  });
}
function uivReadHome(live: UivLive, host: UivPageHost): void {
  const form = host.document.querySelector<HTMLFormElement>("[data-home-talk-form]");
  const text = host.document.querySelector(".home-talk-status")?.textContent ?? "";
  if (!form) return;
  const key = uivStorageKey(uivIdentity(form, host));
  const send = live.sends.get(key) ?? uivSendIdle();
  const outcome = text.includes("已被会话接收") || text.includes("session received the message") ? "succeeded" : text.includes("明确未接收") || text.includes("did not receive") ? "failed" : text.includes("尚未确认") || text.includes("isn't confirmed") ? "uncertain" : null;
  if ((text.includes("正在发送") || text.includes("Sending to the selected")) && send.phase !== "sending") live.sends.set(key, { ...send, phase: "sending", token: send.token, text: uivField(form)?.value ?? "", message: UIV_SEND_COPY.sending });
  if (!outcome || send.phase !== "sending") return;
  const settled = uivSettleSend(send, send.token, outcome);
  const sent = send.text;
  live.sends.set(key, settled.send);
  if (!settled.clearDraft) return;
  queueMicrotask(() => {
    const field = uivField(form);
    if (!field || uivClearedDraftText(field.value, sent) !== "") return;
    if (field.value) field.value = "";
    const store = uivStoreOf(host);
    const empty = JSON.stringify({ text: "", context: uivContext(form) });
    store.set(key, empty);
    const currentKey = uivStorageKey(uivIdentity(form, host));
    if (currentKey !== key) store.set(currentKey, empty);
  });
}
function uivBind(form: HTMLFormElement, live: UivLive, host: UivPageHost): void {
  if (form.dataset.uivBound === "1" || !uivSurface(form) || !uivField(form)) return;
  form.dataset.uivBound = "1";
  uivEnsure(form, host);
  const field = uivField(form);
  field?.addEventListener("input", () => uivOnInput(form, live, host));
  field?.addEventListener("focus", () => uivPaint(live, host));
  field?.addEventListener("blur", () => uivPaint(live, host));
  uivRestore(form, host);
}
function uivInterrupted(live: UivLive, host: UivPageHost): void {
  let open: string | null = null;
  try { open = host.localStorage.getItem(UIV_VOICE_OPEN_KEY); } catch { return; }
  if (!open) return;
  try { host.localStorage.removeItem(UIV_VOICE_OPEN_KEY); } catch { return; }
  live.voice = { ...uivVoiceIdle(), phase: "interrupted", message: uivExplainInterrupted() };
}
/** Attach the shared composer behavior to the home, assistant, and Coding forms that are already on the page. */
export function uivMount(host: UivPageHost): void {
  const live: UivLive = { voice: uivVoiceIdle(), sends: new Map(), recorder: null, stream: null, audio: null, chunks: [], blob: null, timer: 0, started: 0, drop: false, releasing: false, pending: null, download: null, arming: false };
  uivInterrupted(live, host);
  const scan = () => { for (const form of host.document.querySelectorAll("form")) if (form instanceof HTMLFormElement) uivBind(form, live, host); uivPaint(live, host); };
  scan();
  host.document.addEventListener("keydown", event => uivOnKey(event, live, host), true);
  host.document.addEventListener("submit", event => uivOnSubmit(event, live, host), true);
  host.document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("button");
    const form = button?.closest("form");
    if (!(button instanceof HTMLButtonElement) || !(form instanceof HTMLFormElement) || form.dataset.uivBound !== "1") return;
    if (!button.hasAttribute("data-uiv-mic") && !button.closest("[data-uiv-bar]")) return;
    event.preventDefault();
    uivAct(button, form, live, host);
  }, true);
  const observer = new MutationObserver(records => {
    const structural = records.some(record => record.type === "childList" && [...record.addedNodes].some(node => node instanceof Element && (node.matches("form") || node.querySelector("form"))));
    const keyed = records.some(record => record.type === "attributes");
    if (!structural && !keyed) return;
    if (structural) scan();
    for (const form of uivForms(host)) { uivReadPhase(form, live, host); uivApplyPending(form, live, host); }
    const ownerHere = uivForms(host).some(form => live.voice.owner && uivSameIdentity(uivIdentity(form, host), live.voice.owner));
    const visible = uivForms(host).find(form => !form.hidden) ?? uivForms(host)[0];
    if (live.voice.owner && visible && !ownerHere && uivVoiceBusy(live.voice)) live.voice = uivNoteSwitch(live.voice, uivIdentity(visible, host));
    uivReadHome(live, host);
    uivPaint(live, host);
  });
  observer.observe(host.document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-uiv-key", "data-uiv-phase"] });
  const home = host.document.querySelector("[data-home-talk-body]");
  if (home) new MutationObserver(() => { uivReadHome(live, host); uivPaint(live, host); }).observe(home, { childList: true, subtree: true, characterData: true });
  const pull = () => { for (const form of uivForms(host)) uivRestore(form, host); };
  globalThis.setTimeout(pull, 1200);
}

const uivBootFns = [
  uivStorageKey, uivSameIdentity, uivSaveDraft, uivLoadDraft, uivBeginSend, uivNoteTyping, uivSettleSend, uivClearedDraftText, uivPhaseBusy, uivKeyAction,
  uivVoiceIdle, uivVoiceBusy, uivClampAnchor, uivRequestRecord, uivBeginDownload, uivDownloadProgress, uivBytesLabel, uivFinishDownload,
  uivStopRecord, uivTickRecord, uivCancelVoice, uivNoteEdit, uivNoteSwitch, uivInsertTranscript, uivApplyTranscript, uivConfirmInsert,
  uivFailTranscript, uivRetryTranscript, uivDiscardAudio, uivExplainInterrupted, uivContextInvalid, uivCannotSend, uivVisibleControls,
  uivFieldState, uivFieldLabel, uivStoreOf, uivSurface, uivField, uivIdentity, uivContext, uivObject, uivMeter, uivForms, uivButton,
  uivEnsure, uivShow, uivText, uivPaint, uivMarkOpen, uivSendIdle, uivRemember, uivRestoreContext, uivLimitMs, uivForeignDraft, uivRestore, uivApplyPending, uivRelease,
  uivCancel, uivLevel, uivTick, uivWriteTranscript, uivEncode, uivTranscribe, uivTranscribeOrFail, uivFetch, uivReadLines, uivOnStop, uivDeviceLost, uivArm,
  uivClickMic, uivDownload, uivAct, uivOnInput, uivRefuse, uivOnSubmit, uivKeyForm, uivOnKey, uivReadPhase, uivReadHome, uivBind,
  uivInterrupted, uivMount,
];
/** The page runs these same functions. The string is inlined into the document, not into the measured workbench script. */
export const UIV_BOOT_SCRIPT = `(() => {
const UIV_SEND_COPY = ${JSON.stringify(UIV_SEND_COPY)};
const UIV_RECOVERY = ${JSON.stringify(UIV_RECOVERY)};
const UIV_VOICE_OPEN_KEY = ${JSON.stringify(UIV_VOICE_OPEN_KEY)};
${uivBootFns.map(fn => fn.toString()).join("\n")}
uivMount({ document, navigator, MediaRecorder: typeof MediaRecorder === "function" ? MediaRecorder : undefined, AudioContext: typeof AudioContext === "function" ? AudioContext : undefined, crypto, localStorage, L: typeof L === "function" ? L : (text) => text, molisWorkControlHeaders: typeof molisWorkControlHeaders === "function" ? molisWorkControlHeaders : () => ({}), molisWorkRequest: typeof molisWorkRequest === "function" ? molisWorkRequest : undefined, setInterval: (callback, ms) => globalThis.setInterval(callback, ms), clearInterval: (id) => globalThis.clearInterval(id), now: () => performance.now() });
})();`.replaceAll("</script", "<\\/script").replaceAll("</style", "<\\/style");
