/// <reference lib="dom" />
import { icon } from "./icons.js";
import {
  UIV_RECOVERY, UIV_SEND_COPY, UIV_VOICE_OPEN_KEY,
  uivApplyTranscript, uivBeginDownload, uivBeginSend, uivBytesLabel, uivCancelVoice, uivCannotSend, uivClampAnchor,
  uivConfirmInsert, uivContextInvalid, uivDiscardAudio, uivDownloadProgress, uivDownloadRejected, uivExplainInterrupted, uivFailTranscript,
  uivFieldLabel, uivFieldState, uivFinishDownload, uivInsertTranscript, uivKeyAction, uivLoadDraft, uivLoseDevice, uivNoteEdit,
  uivClearedDraftText, uivNoteSwitch, uivNoteTyping, uivPhaseBusy, uivRequestRecord, uivRetryTranscript, uivSameIdentity, uivSaveDraft,
  uivSettleSend, uivStopRecord, uivStorageKey, uivTickRecord, uivVisibleControls, uivVoiceBusy, uivVoiceIdle, uivVoiceStatusText,
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
  editedSends: Set<string>;
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  audio: AudioContext | null;
  analyser: AnalyserNode | null;
  source: MediaStreamAudioSourceNode | null;
  chunks: Blob[];
  blob: Blob | null;
  timer: ReturnType<UivPageHost["setInterval"]> | 0;
  started: number;
  releasing: boolean;
  pending: Map<string, UivIdentity>;
  request: AbortController | null;
  target: string;
}
type UivField = HTMLTextAreaElement | HTMLInputElement;

export { UIV_STYLE } from "./unified-input-style.js";
const UIV_MIC_ICON = icon("mic");

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
  const projectId = form.dataset.uivProjectId ?? host.document.body?.dataset.projectId ?? "";
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
  if (attr === "data-uiv-mic") button.innerHTML = UIV_MIC_ICON;
  else button.textContent = host.L(label);
  button.title = host.L(label);
  button.setAttribute("aria-label", host.L(label));
  button.hidden = true;
  return button;
}
function uivEnsure(form: HTMLFormElement, host: UivPageHost): void {
  form.classList.add("uiv-composer");
  const field = uivField(form);
  field?.setAttribute("data-uiv-input", "");
  (field?.closest(".coding-composer-shell") ?? form).classList.add("uiv-writing-surface");
  if (form.querySelector("[data-uiv-bar]")) return;
  const bar = host.document.createElement("span");
  bar.className = "uiv-bar";
  bar.setAttribute("data-uiv-bar", "");
  bar.append(uivButton(host, "data-uiv-mic", "录音"), uivButton(host, "data-uiv-stop-record", "停止录音"), uivButton(host, "data-uiv-cancel-record", "取消录音"), uivButton(host, "data-uiv-download", "下载"), uivButton(host, "data-uiv-retry", "重试转写"), uivButton(host, "data-uiv-discard", "丢弃录音"), uivButton(host, "data-uiv-confirm", "确认插入"), uivButton(host, "data-uiv-decline", "不插入"));
  const submit = form.querySelector<HTMLElement>("[data-assistant-send], [data-coding-send], button[type=submit]");
  if (submit?.parentElement) submit.parentElement.insertBefore(bar, submit);
  else form.append(bar);
  const stack = host.document.createElement("div");
  stack.className = "uiv-status";
  for (const [attr, role] of [["data-uiv-voice-status", "status"], ["data-uiv-meter", "status"], ["data-uiv-send-status", "status"], ["data-uiv-field-state", "status"]] as const) {
    const node = host.document.createElement("p");
    node.setAttribute(attr, "");
    node.setAttribute("role", role);
    stack.append(node);
  }
  form.append(stack);
}
function uivShow(form: HTMLFormElement, attr: string, on: boolean): void {
  const button = form.querySelector<HTMLButtonElement>(`[${attr}]`);
  if (button) button.hidden = !on;
}
function uivText(form: HTMLFormElement, attr: string, text: string): void {
  const node = form.querySelector(`[${attr}]`);
  if (node && node.textContent !== text) node.textContent = text;
}
function uivPaint(live: UivLive, host: UivPageHost): void {
  const controls = uivVisibleControls(live.voice.phase);
  const message = uivVoiceStatusText({ ...live.voice, message: live.voice.message ? host.L(live.voice.message) : "" });
  const voiceText = [live.voice.owner && message ? live.target : "", message, live.voice.pending ?? ""].filter(Boolean).join(" · ");
  const meter = live.voice.phase === "recording" ? `${host.L("声音")} ${uivMeter(live.voice.level)}` : "";
  for (const form of uivForms(host)) {
    const field = uivField(form);
    if (!field) continue;
    const id = uivIdentity(form, host);
    const send = live.sends.get(uivStorageKey(id)) ?? uivSendIdle();
    const owned = uivSameIdentity(live.voice.owner, id);
    const state = uivFieldState({ text: field.value, focused: host.document.activeElement === field, unavailable: field.disabled, busy: (owned && uivVoiceBusy(live.voice)) || send.phase === "sending", failed: send.phase === "failed" || (owned && live.voice.phase === "failed") });
    form.dataset.uivState = state;
    uivText(form, "data-uiv-field-state", host.L(uivFieldLabel(state)));
    uivShow(form, "data-uiv-mic", controls.mic);
    uivShow(form, "data-uiv-stop-record", controls.stop);
    uivShow(form, "data-uiv-cancel-record", controls.cancel);
    uivShow(form, "data-uiv-download", controls.download);
    uivShow(form, "data-uiv-retry", controls.retry);
    uivShow(form, "data-uiv-discard", controls.discard);
    uivShow(form, "data-uiv-confirm", controls.confirm);
    uivShow(form, "data-uiv-decline", controls.decline);
    uivText(form, "data-uiv-voice-status", voiceText);
    uivText(form, "data-uiv-meter", meter);
    uivText(form, "data-uiv-send-status", (form.dataset.uivContextInvalid === "1" ? "" : form.dataset.uivContextInvalid) || (send.message ? host.L(send.message) : ""));
    // Empty, focus and draft are already conveyed by the field itself. Keep actionable feedback visible.
    const fieldStatus = form.querySelector<HTMLElement>("[data-uiv-field-state]");
    if (fieldStatus) fieldStatus.hidden = state !== "unavailable" || Boolean(voiceText || send.message || form.dataset.uivContextInvalid);
    const stack = form.querySelector<HTMLElement>(".uiv-status");
    if (stack) stack.hidden = ![...stack.children].some(node => node instanceof HTMLElement && !node.hidden && node.textContent?.trim());
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
    select.value = context;
    // Coding restores model, workspace and intent together; restoration must not emit a user configuration change.
    return "";
  }
  if (form.matches("[data-home-talk-form]")) {
    const radio = form.ownerDocument.querySelector<HTMLInputElement>(`[name="talk-session"][value="${CSS.escape(context)}"]`);
    if (!radio) return uivContextInvalid(context);
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return "";
}
function uivLimitMs(form: HTMLFormElement): number | null {
  const parsed = Number(form.dataset.uivLimitMs);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function uivRestore(form: HTMLFormElement, host: UivPageHost): void {
  const field = uivField(form);
  if (!field) return;
  const id = uivIdentity(form, host);
  const key = uivStorageKey(id);
  if (form.dataset.uivRestoredKey === key) return;
  form.dataset.uivRestoredKey = key;
  const store = uivStoreOf(host);
  if (store.get(key) == null) return;
  const draft = uivLoadDraft(store, id);
  if (field.value !== draft.text) {
    field.value = draft.text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const invalid = uivRestoreContext(form, draft.context);
  form.dataset.uivContextInvalid = invalid;
}
function uivApplyPending(form: HTMLFormElement, live: UivLive, host: UivPageHost): void {
  const id = uivIdentity(form, host);
  const key = uivStorageKey(id);
  const field = uivField(form);
  if (!field || !live.pending.has(key)) return;
  field.value = uivLoadDraft(uivStoreOf(host), id).text;
  live.pending.delete(key);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
function uivResize(field: UivField): void {
  if (!(field instanceof HTMLTextAreaElement) || !field.getClientRects().length) return;
  const form = field.closest("form[data-assistant-composer]");
  form?.removeAttribute("data-uiv-expanded");
  const style = getComputedStyle(field);
  field.style.height = "0px";
  if (form && field.value && field.scrollHeight > 44) {
    form.setAttribute("data-uiv-expanded", "");
    field.style.height = "0px";
  }
  field.style.height = `${field.scrollHeight + parseFloat(style.borderTopWidth || "0") + parseFloat(style.borderBottomWidth || "0")}px`;
  if (form) uivMeasureDock(field.ownerDocument);
}
/** Measure the upward extension only to keep the Assistant panel within the viewport. */
function uivMeasureDock(document: Document): void {
  const bar = document.querySelector(".workbench-bar");
  if (!(bar instanceof HTMLElement)) return;
  const rect = bar.getBoundingClientRect(), center = bar.querySelector(".bar-center");
  const height = `${Math.max(rect.height, rect.bottom - (center?.getBoundingClientRect().top ?? rect.top) + 6)}px`;
  if (document.body.style.getPropertyValue("--uiv-dock-height") !== height) document.body.style.setProperty("--uiv-dock-height", height);
}
/** Observe changes to context and controls without changing the fixed dock or its side entrances. */
function uivWatchDock(host: UivPageHost): void {
  const bar = host.document.querySelector(".workbench-bar");
  if (!(bar instanceof HTMLElement)) return;
  const center = bar.querySelector(".bar-center");
  const measure = () => uivMeasureDock(host.document);
  let frame = 0;
  const observer = new ResizeObserver(() => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); }); });
  observer.observe(bar);
  if (center) observer.observe(center);
  measure();
}
function uivRelease(live: UivLive, host: UivPageHost): void {
  live.releasing = true;
  host.clearInterval(live.timer);
  live.timer = 0;
  live.source?.disconnect();
  live.source = null;
  live.analyser = null;
  live.stream?.getTracks().forEach(track => track.stop());
  live.stream = null;
  live.recorder = null;
  void live.audio?.close().catch(() => undefined);
  live.audio = null;
  live.releasing = false;
}
function uivCancel(live: UivLive, host: UivPageHost): void {
  live.voice = uivCancelVoice(live.voice);
  live.request?.abort();
  live.request = null;
  const recorder = live.recorder;
  live.recorder = null;
  if (recorder && recorder.state !== "inactive") recorder.stop();
  live.blob = null;
  live.chunks = [];
  uivRelease(live, host);
  uivPaint(live, host);
}
function uivLevel(live: UivLive): number {
  if (!live.analyser) return 0;
  const samples = new Uint8Array(live.analyser.fftSize);
  live.analyser.getByteTimeDomainData(samples);
  let sum = 0;
  for (const sample of samples) { const centered = sample / 128 - 1; sum += centered * centered; }
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
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
  if (!owner || generation !== live.voice.generation) return;
  const form = uivForms(host).find(candidate => uivSameIdentity(uivIdentity(candidate, host), owner));
  const field = form ? uivField(form) : null;
  const store = uivStoreOf(host);
  const saved = uivLoadDraft(store, owner);
  const current = field?.value ?? saved.text;
  const applied = uivApplyTranscript(live.voice, generation, owner, current, transcript, unclear);
  live.voice = applied.voice;
  if (applied.text !== current) {
    uivSaveDraft(store, owner, { text: applied.text, context: saved.context });
    if (field) { field.value = applied.text; field.dispatchEvent(new Event("input", { bubbles: true })); }
    else { live.pending.set(uivStorageKey(owner), owner); live.voice = { ...live.voice, owner, message: UIV_RECOVERY.switched }; }
  }
  if (!live.voice.keepAudio) live.blob = null;
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
  const controller = new AbortController();
  live.request = controller;
  const audio = await uivEncode(blob);
  if (controller.signal.aborted || generation !== live.voice.generation) return;
  const posted = await uivFetch(host, { op: "transcribe", audio_base64: audio, mime: blob.type }, controller.signal);
  const body = posted.json ?? {};
  if (generation !== live.voice.generation) return;
  if (body.model_required === true) {
    const reported = typeof body.approximate_bytes === "number" ? body.approximate_bytes : Number(body.approximate_bytes);
    const bytesTotal = Number.isFinite(reported) && reported > 0 ? reported : (live.voice.bytesTotal || 626_000_000);
    live.voice = { ...live.voice, phase: "need-model", message: UIV_RECOVERY.needModel, bytesTotal };
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
function uivOnStop(live: UivLive, host: UivPageHost, recorder: MediaRecorder, generation: number): void {
  if (live.recorder !== recorder || generation !== live.voice.generation) return;
  const blob = new Blob(live.chunks, { type: live.chunks[0]?.type || "audio/webm" });
  live.chunks = [];
  uivRelease(live, host);
  live.blob = blob;
  if (live.voice.phase === "recording") live.voice = uivStopRecord(live.voice);
  uivPaint(live, host);
  uivTranscribeOrFail(live, host, generation);
}
function uivDeviceLost(live: UivLive, host: UivPageHost, stream: MediaStream): void {
  if (live.releasing || live.voice.phase !== "recording" || live.stream !== stream) return;
  live.voice = uivLoseDevice(live.voice);
  const recorder = live.recorder;
  live.recorder = null;
  if (recorder && recorder.state !== "inactive") recorder.stop();
  live.blob = null;
  live.chunks = [];
  uivRelease(live, host);
  uivPaint(live, host);
}
function uivArm(form: HTMLFormElement, stream: MediaStream, live: UivLive, host: UivPageHost): void {
  live.releasing = false;
  const field = uivField(form);
  const Recorder = host.MediaRecorder;
  if (!field || !Recorder) { stream.getTracks().forEach(track => track.stop()); return; }
  const mime = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4"].find(candidate => Recorder.isTypeSupported?.(candidate));
  if (!mime) throw new Error(UIV_RECOVERY.localUnavailable);
  const recorder = new Recorder(stream, { mimeType: mime });
  live.stream = stream;
  live.recorder = recorder;
  live.chunks = [];
  live.blob = null;
  live.started = host.now();
  stream.getTracks().forEach(track => {
    if (typeof track.addEventListener === "function") track.addEventListener("ended", () => uivDeviceLost(live, host, stream));
  });
  try {
    live.audio = host.AudioContext ? new host.AudioContext() : null;
    if (live.audio) {
      live.analyser = live.audio.createAnalyser();
      live.source = live.audio.createMediaStreamSource(stream);
      live.source.connect(live.analyser);
      void live.audio.resume().catch(() => undefined);
    }
  } catch { live.analyser = null; }
  const generation = live.voice.generation;
  recorder.addEventListener("dataavailable", event => { if (live.recorder === recorder && generation === live.voice.generation && event.data.size) live.chunks.push(event.data); });
  recorder.addEventListener("stop", () => uivOnStop(live, host, recorder, generation));
  recorder.addEventListener("error", () => uivDeviceLost(live, host, stream));
  recorder.start(200);
  live.timer = host.setInterval(() => uivTick(live, host), 200);
  uivPaint(live, host);
}
async function uivClickMic(form: HTMLFormElement, live: UivLive, host: UivPageHost): Promise<void> {
  if (uivVoiceBusy(live.voice)) return;
  const field = uivField(form);
  if (!field || field.disabled) return;
  const owner = uivIdentity(form, host);
  const text = field.value;
  const anchor = uivClampAnchor(text, field.selectionStart ?? text.length);
  uivRemember(form, host);
  const generation = live.voice.generation + 1;
  live.voice = { ...uivVoiceIdle(), generation, owner, snapshot: text, anchor, phase: "preparing", message: UIV_RECOVERY.preparing };
  live.target = form.querySelector("[data-assistant-target-label]")?.textContent?.trim() || form.getAttribute("aria-label") || owner.surface;
  const controller = new AbortController();
  live.request = controller;
  uivPaint(live, host);
  let stream: MediaStream | null = null;
  let probed = false;
  try {
    if (!host.navigator.mediaDevices || !host.MediaRecorder) throw new Error(UIV_RECOVERY.noMic);
    stream = await host.navigator.mediaDevices.getUserMedia({ audio: true });
    if (generation !== live.voice.generation) return;
    live.stream = stream;
    probed = true;
    const probe = (await uivFetch(host, { op: "probe" }, controller.signal)).json;
    if (generation !== live.voice.generation) return;
    if (probe?.model !== "available") {
      const reported = Number(probe?.approximate_bytes);
      live.voice = { ...live.voice, phase: "need-model", bytesTotal: Number.isFinite(reported) && reported > 0 ? reported : 626_000_000, message: UIV_RECOVERY.needModel };
      return;
    }
    live.voice = { ...live.voice, phase: "recording", message: UIV_RECOVERY.recording, limitMs: uivLimitMs(form), keepAudio: true };
    uivArm(form, stream, live, host);
    stream = null;
  } catch (error) {
    if (generation !== live.voice.generation) return;
    const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
    live.voice = { ...uivVoiceIdle(), generation, phase: denied ? "need-permission" : "unavailable", message: denied ? UIV_RECOVERY.permission : probed ? UIV_RECOVERY.localUnavailable : UIV_RECOVERY.noMic };
    uivRelease(live, host);
  } finally {
    stream?.getTracks().forEach(track => track.stop());
    if (stream && live.stream === stream) live.stream = null;
    if (live.request === controller) live.request = null;
    uivPaint(live, host);
  }
}
async function uivDownload(live: UivLive, host: UivPageHost): Promise<void> {
  if (live.voice.phase !== "need-model") return;
  live.voice = uivBeginDownload(live.voice, true);
  const generation = live.voice.generation;
  const controller = new AbortController();
  live.request = controller;
  uivPaint(live, host);
  let ok = false;
  try {
    const posted = await uivFetch(host, { op: "prepare", confirm_download: true }, controller.signal, true);
    if (!posted.response?.ok) throw new Error(UIV_RECOVERY.downloadFailed);
    await uivReadLines(posted.response, line => {
      if (generation !== live.voice.generation || controller.signal.aborted) return;
      if (line.stage === "model_download" && typeof line.progress === "number") {
        const total = live.voice.bytesTotal || 626_000_000;
        live.voice = uivDownloadProgress(live.voice, Math.round(line.progress * total), total);
        uivPaint(live, host);
      }
      if (line.stage === "model_loading") {
        live.voice = { ...live.voice, message: "正在完成本机识别准备，首次使用可能稍久，可以取消。" };
        uivPaint(live, host);
      }
      if (typeof line.ok === "boolean") ok = line.ok;
    });
    if (generation !== live.voice.generation) return;
    live.voice = uivFinishDownload(live.voice, ok);
  } catch {
    if (generation !== live.voice.generation || controller.signal.aborted) return;
    live.voice = uivDownloadRejected(live.voice, { name: "Error" });
  } finally {
    if (live.request === controller) live.request = null;
    uivPaint(live, host);
  }
}
function uivAct(button: HTMLButtonElement, form: HTMLFormElement, live: UivLive, host: UivPageHost): void {
  if (button.hasAttribute("data-uiv-mic")) { void uivClickMic(form, live, host).catch(() => { live.voice = { ...uivVoiceIdle(), generation: live.voice.generation, phase: "unavailable", message: UIV_RECOVERY.noMic }; uivPaint(live, host); }); return; }
  if (button.hasAttribute("data-uiv-stop-record")) { if (live.voice.phase === "recording") live.voice = uivStopRecord(live.voice); live.recorder?.stop(); uivPaint(live, host); return; }
  if (button.hasAttribute("data-uiv-cancel-record")) { uivCancel(live, host); return; }
  if (button.hasAttribute("data-uiv-download")) { void uivDownload(live, host); return; }
  if (button.hasAttribute("data-uiv-retry")) { live.voice = uivRetryTranscript(live.voice); uivPaint(live, host); uivTranscribeOrFail(live, host, live.voice.generation); return; }
  if (button.hasAttribute("data-uiv-discard")) { live.blob = null; live.voice = uivDiscardAudio(live.voice); uivPaint(live, host); return; }
  if (!button.hasAttribute("data-uiv-confirm") && !button.hasAttribute("data-uiv-decline")) return;
  const owner = live.voice.owner;
  if (!owner) return;
  const target = uivForms(host).find(candidate => uivSameIdentity(uivIdentity(candidate, host), owner));
  const field = target ? uivField(target) : null;
  const store = uivStoreOf(host);
  const saved = uivLoadDraft(store, owner);
  const decided = uivConfirmInsert(live.voice, field?.value ?? saved.text, button.hasAttribute("data-uiv-confirm"));
  live.voice = decided.voice;
  uivSaveDraft(store, owner, { ...saved, text: decided.text });
  if (field && decided.text !== field.value) { field.value = decided.text; field.dispatchEvent(new Event("input", { bubbles: true })); }
  else if (!field) live.pending.set(uivStorageKey(owner), owner);
  live.blob = null;
  uivPaint(live, host);
}

function uivOnInput(form: HTMLFormElement, live: UivLive, host: UivPageHost): void {
  const field = uivField(form);
  if (!field) return;
  const id = uivIdentity(form, host);
  uivRemember(form, host);
  uivResize(field);
  if (uivSameIdentity(live.voice.owner, id)) live.voice = uivNoteEdit(live.voice, field.value);
  const key = uivStorageKey(id);
  const send = uivNoteTyping(live.sends.get(key) ?? uivSendIdle());
  if (send.phase === "sending" && field.value !== send.text) live.editedSends.add(key);
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
  const submit = form.querySelector<HTMLButtonElement>("[data-assistant-send], [data-coding-send], button[type=submit]");
  if (field.disabled || submit?.disabled || form.dataset.uivContextInvalid) {
    event.preventDefault(); event.stopImmediatePropagation(); uivRefuse(form, live, host); return;
  }
  const key = uivStorageKey(uivIdentity(form, host));
  const begun = uivBeginSend(live.sends.get(key) ?? uivSendIdle(), field.value, uivSameIdentity(live.voice.owner, uivIdentity(form, host)) && uivVoiceBusy(live.voice));
  live.sends.set(key, begun.send);
  if (begun.accepted) { live.editedSends.delete(key); form.dataset.uivPhase = "sending"; form.dataset.uivSendKey = key; }
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
  const decision = uivKeyAction({ key: event.key, metaKey: event.metaKey, ctrlKey: event.ctrlKey, isComposing: event.isComposing, keyCode: event.keyCode }, uivSameIdentity(live.voice.owner, uivIdentity(form, host)) ? live.voice.phase : "idle", send, field.value);
  if (decision === "ignore" || decision === "newline") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (decision === "cancel-voice") { uivCancel(live, host); return; }
  if (decision === "hold") { live.sends.set(key, uivBeginSend(send, field.value, uivSameIdentity(live.voice.owner, uivIdentity(form, host)) && uivVoiceBusy(live.voice)).send); uivPaint(live, host); return; }
  const submit = form.querySelector<HTMLButtonElement>("[data-assistant-send], [data-coding-send], button[type=submit]");
  if (submit?.disabled) { uivRefuse(form, live, host); return; }
  form.requestSubmit();
}
function uivClearSaved(store: UivStore, key: string, sent: string): void {
  const raw = store.get(key);
  if (!raw) return;
  try {
    const draft = JSON.parse(raw) as { text?: unknown; context?: unknown };
    if (typeof draft.text === "string" && uivClearedDraftText(draft.text, sent) === "") store.set(key, JSON.stringify({ ...draft, text: "" }));
  } catch { return; }
}
function uivReadPhase(form: HTMLFormElement, live: UivLive, host: UivPageHost): void {
  const phase = form.dataset.uivPhase;
  const key = uivStorageKey(uivIdentity(form, host));
  const remembered = form.dataset.uivResultKey || form.dataset.uivSendKey || key;
  const targetKey = form.dataset.uivResultNextKey || remembered;
  const send = live.sends.get(remembered) ?? uivSendIdle();
  if (phase === "sending" && send.phase !== "sending") {
    const text = form.dataset.uivResultText ?? (remembered === key ? uivField(form)?.value ?? "" : "");
    live.editedSends.delete(remembered);
    live.sends.set(remembered, { phase: "sending", token: send.token + 1, text, message: UIV_SEND_COPY.sending });
    return;
  }
  if (phase === "idle" && send.phase === "sending") { live.sends.set(remembered, { ...send, phase: "idle", message: "" }); return; }
  if (phase !== "succeeded" && phase !== "failed" && phase !== "uncertain") return;
  if (send.phase !== "sending") return;
  const settled = uivSettleSend(send, send.token, phase);
  live.sends.set(remembered, settled.send);
  if (targetKey !== remembered) live.sends.set(targetKey, settled.send);
  delete form.dataset.uivResultKey;
  delete form.dataset.uivResultNextKey;
  delete form.dataset.uivResultText;
  if (form.dataset.uivSendKey === remembered) delete form.dataset.uivSendKey;
  if (!settled.clearDraft || live.editedSends.has(remembered)) return;
  const store = uivStoreOf(host);
  uivClearSaved(store, remembered, send.text);
  if (targetKey !== remembered) uivClearSaved(store, targetKey, send.text);
  queueMicrotask(() => {
    const current = uivStorageKey(uivIdentity(form, host));
    const field = uivField(form);
    if (!field || (current !== remembered && current !== targetKey) || uivClearedDraftText(field.value, send.text) !== "") return;
    if (field.value) field.value = "";
    uivResize(field);
    uivPaint(live, host);
  });
}
function uivBind(form: HTMLFormElement, live: UivLive, host: UivPageHost): void {
  if (form.dataset.uivBound === "1" || !uivSurface(form) || !uivField(form)) return;
  form.dataset.uivBound = "1";
  uivEnsure(form, host);
  const field = uivField(form);
  field?.addEventListener("input", () => uivOnInput(form, live, host));
  form.addEventListener("change", () => { delete form.dataset.uivContextInvalid; uivRemember(form, host); uivPaint(live, host); });
  field?.addEventListener("focus", () => uivPaint(live, host));
  field?.addEventListener("blur", () => uivPaint(live, host));
  uivRestore(form, host);
  if (field) {
    new MutationObserver(() => uivPaint(live, host)).observe(field, { attributes: true, attributeFilter: ["disabled"] });
    uivResize(field);
    let width = field.getBoundingClientRect().width;
    new ResizeObserver(() => { const next = field.getBoundingClientRect().width; if (next !== width) { width = next; requestAnimationFrame(() => uivResize(field)); } }).observe(field);
  }
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
  const live: UivLive = { voice: uivVoiceIdle(), sends: new Map(), editedSends: new Set(), recorder: null, stream: null, audio: null, analyser: null, source: null, chunks: [], blob: null, timer: 0, started: 0, releasing: false, pending: new Map(), request: null, target: "" };
  uivInterrupted(live, host);
  const scan = () => { for (const form of host.document.querySelectorAll("form")) if (form instanceof HTMLFormElement) uivBind(form, live, host); uivPaint(live, host); };
  scan();
  uivWatchDock(host);
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
    for (const form of uivForms(host)) { uivReadPhase(form, live, host); uivRestore(form, host); uivApplyPending(form, live, host); const field = uivField(form); if (field) uivResize(field); }
    const ownerHere = uivForms(host).some(form => live.voice.owner && uivSameIdentity(uivIdentity(form, host), live.voice.owner));
    const visible = uivForms(host).find(form => !form.hidden) ?? uivForms(host)[0];
    if (live.voice.owner && visible && !ownerHere && uivVoiceBusy(live.voice)) live.voice = uivNoteSwitch(live.voice, uivIdentity(visible, host));

    uivPaint(live, host);
  });
  observer.observe(host.document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-uiv-project-id", "data-uiv-key", "data-uiv-phase", "data-uiv-result-key", "data-uiv-result-next-key"] });
  const pull = () => { for (const form of uivForms(host)) uivRestore(form, host); };
  globalThis.setTimeout(pull, 1200);
  host.document.defaultView?.addEventListener("resize", () => { for (const form of uivForms(host)) { const field = uivField(form); if (field) uivResize(field); } });
}

const uivBootFns = [
  uivStorageKey, uivSameIdentity, uivSaveDraft, uivLoadDraft, uivBeginSend, uivNoteTyping, uivSettleSend, uivClearedDraftText, uivPhaseBusy, uivKeyAction,
  uivVoiceIdle, uivVoiceBusy, uivClampAnchor, uivRequestRecord, uivBeginDownload, uivDownloadProgress, uivBytesLabel, uivFinishDownload, uivDownloadRejected,
  uivStopRecord, uivTickRecord, uivCancelVoice, uivNoteEdit, uivNoteSwitch, uivInsertTranscript, uivApplyTranscript, uivConfirmInsert,
  uivFailTranscript, uivRetryTranscript, uivDiscardAudio, uivExplainInterrupted, uivContextInvalid, uivCannotSend, uivLoseDevice, uivVoiceStatusText, uivVisibleControls,
  uivFieldState, uivFieldLabel, uivStoreOf, uivSurface, uivField, uivIdentity, uivContext, uivObject, uivMeter, uivForms, uivButton,
  uivEnsure, uivShow, uivText, uivPaint, uivMarkOpen, uivSendIdle, uivRemember, uivRestoreContext, uivLimitMs, uivRestore, uivApplyPending, uivResize, uivMeasureDock, uivWatchDock, uivRelease,
  uivCancel, uivLevel, uivTick, uivWriteTranscript, uivEncode, uivTranscribe, uivTranscribeOrFail, uivFetch, uivReadLines, uivOnStop, uivDeviceLost, uivArm,
  uivClickMic, uivDownload, uivAct, uivOnInput, uivRefuse, uivOnSubmit, uivKeyForm, uivOnKey, uivClearSaved, uivReadPhase, uivBind,
  uivInterrupted, uivMount,
];
/** The page runs these same functions. The string is inlined into the document, not into the measured workbench script. */
export const UIV_BOOT_SCRIPT = `(() => {
const UIV_MIC_ICON = ${JSON.stringify(UIV_MIC_ICON)};
const UIV_SEND_COPY = ${JSON.stringify(UIV_SEND_COPY)};
const UIV_RECOVERY = ${JSON.stringify(UIV_RECOVERY)};
const UIV_VOICE_OPEN_KEY = ${JSON.stringify(UIV_VOICE_OPEN_KEY)};
${uivBootFns.map(fn => fn.toString()).join("\n")}
uivMount({ document, navigator, MediaRecorder: typeof MediaRecorder === "function" ? MediaRecorder : undefined, AudioContext: typeof AudioContext === "function" ? AudioContext : undefined, crypto, localStorage, L: typeof L === "function" ? L : (text) => text, molisWorkControlHeaders: typeof molisWorkControlHeaders === "function" ? molisWorkControlHeaders : () => ({}), molisWorkRequest: typeof molisWorkRequest === "function" ? molisWorkRequest : undefined, setInterval: (callback, ms) => globalThis.setInterval(callback, ms), clearInterval: (id) => globalThis.clearInterval(id), now: () => performance.now() });
})();`.replaceAll("</script", "<\\/script").replaceAll("</style", "<\\/style");
