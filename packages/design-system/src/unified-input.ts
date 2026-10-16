/** Shared draft, send, and voice ownership for the home, assistant, and Coding composers. */
export const UIV_SURFACES = ["home", "assistant", "coding"] as const;
export type UivSurface = (typeof UIV_SURFACES)[number];
export const UIV_SHARED_CONTROLS = ["mic", "stop-record", "cancel", "send"] as const;
export const UIV_SCENE_ONLY = {
  home: ["context"],
  assistant: ["attach", "target"],
  coding: ["attach", "intent", "model", "effort"],
} as const;
export const UIV_EXCLUDED_FIELDS = ["search", "name", "form", "document-editor"] as const;
/** Placeholders only help someone start. They do not name a session or a send target. */
export const UIV_PLACEHOLDERS = {
  home: "带着这件事说一句",
  assistant: "让助理做点什么…",
  coding: "描述任务，或补充这一轮的要求…（输入 / 查看命令）",
} as const;

export interface UivIdentity { surface: UivSurface; projectId: string; sessionId: string }
export interface UivStore { get(key: string): string | null; set(key: string, value: string | null): void }
export interface UivDraft { text: string; context: string | null }

export function uivStorageKey(id: UivIdentity): string {
  return `molis.uiv.v1:${id.surface}:${encodeURIComponent(id.projectId)}:${encodeURIComponent(id.sessionId)}`;
}
export function uivSameIdentity(left: UivIdentity | null, right: UivIdentity | null): boolean {
  return !!left && !!right && uivStorageKey(left) === uivStorageKey(right);
}

export function uivSaveDraft(store: UivStore, id: UivIdentity, draft: UivDraft): void {
  store.set(uivStorageKey(id), JSON.stringify({ text: draft.text, context: draft.context }));
}
export function uivLoadDraft(store: UivStore, id: UivIdentity): UivDraft {
  const raw = store.get(uivStorageKey(id));
  if (!raw) return { text: "", context: null };
  try {
    const parsed = JSON.parse(raw) as { text?: unknown; context?: unknown };
    if (typeof parsed.text !== "string") return { text: "", context: null };
    return { text: parsed.text, context: typeof parsed.context === "string" ? parsed.context : null };
  } catch {
    return { text: "", context: null };
  }
}

export const UIV_SEND_COPY = {
  sending: "正在发送",
  succeeded: "已发送",
  failed: "发送失败，草稿还在，可以修改后重试",
  uncertain: "是否送到还不确定，先不要再发一次",
  blank: "没有可发送的文字",
  voice: "录音或转写还没结束，先不发送",
} as const;
export type UivSendPhase = "idle" | "sending" | "succeeded" | "failed" | "uncertain";
export interface UivSend { phase: UivSendPhase; token: number; text: string; message: string }
export function uivSendIdle(): UivSend { return { phase: "idle", token: 0, text: "", message: "" }; }

export function uivBeginSend(send: UivSend, text: string, voiceBusy: boolean): { send: UivSend; accepted: boolean } {
  if (voiceBusy) return { send: { ...send, message: UIV_SEND_COPY.voice }, accepted: false };
  if (!text.trim()) return { send: { ...send, message: UIV_SEND_COPY.blank }, accepted: false };
  if (send.phase === "sending" || send.phase === "uncertain") return { send, accepted: false };
  return { send: { phase: "sending", token: send.token + 1, text, message: UIV_SEND_COPY.sending }, accepted: true };
}
export function uivNoteTyping(send: UivSend): UivSend {
  if (send.phase === "sending" || send.phase === "idle") return send;
  return { ...send, phase: "idle", message: "" };
}
/** Empty text means this confirmed send may drop its saved draft. Null means a later edit stays. */
export function uivClearedDraftText(current: string, sent: string): "" | null {
  if (current.trim() !== "" && current.trim() !== sent.trim()) return null;
  return "";
}
export function uivSettleSend(send: UivSend, token: number, outcome: "succeeded" | "failed" | "uncertain"): { send: UivSend; clearDraft: boolean } {
  if (token !== send.token || send.phase !== "sending") return { send, clearDraft: false };
  if (outcome === "succeeded") return { send: { ...send, phase: "succeeded", message: UIV_SEND_COPY.succeeded }, clearDraft: true };
  if (outcome === "uncertain") return { send: { ...send, phase: "uncertain", message: UIV_SEND_COPY.uncertain }, clearDraft: false };
  return { send: { ...send, phase: "failed", message: UIV_SEND_COPY.failed }, clearDraft: false };
}

export interface UivKeyEvent { key: string; metaKey: boolean; ctrlKey: boolean; isComposing: boolean; keyCode: number }
export type UivKeyDecision = "ignore" | "newline" | "send" | "cancel-voice" | "hold";
export function uivPhaseBusy(phase: string): boolean {
  return phase === "recording" || phase === "transcribing" || phase === "downloading";
}
export function uivKeyAction(event: UivKeyEvent, voicePhase: string, send: UivSend, text: string): UivKeyDecision {
  if (event.isComposing || event.keyCode === 229) return "ignore";
  if (event.key === "Escape" && uivPhaseBusy(voicePhase)) return "cancel-voice";
  if (event.key !== "Enter") return "ignore";
  if (!(event.metaKey || event.ctrlKey)) return "newline";
  return uivBeginSend(send, text, uivPhaseBusy(voicePhase)).accepted ? "send" : "hold";
}

export const UIV_RECOVERY = {
  permission: "麦克风权限没开。请在系统设置里允许本页使用麦克风，然后重新点录音。",
  noMic: "没有可用的麦克风，或麦克风已断开。草稿还在，可以继续打字。",
  noSpeech: "未听清，可以重新录。",
  slow: "正在转写，可以取消。没有剩余时间的估计。",
  failed: "转写没有成功。草稿还在，可以重试或丢弃这段录音。",
  switched: "录音或转写仍属于开始时的草稿。",
  interrupted: "没能恢复尚未转写的录音，已保存的文字还在。",
  limitSoon: "这次录音即将达到时长上限，到点会转写已经录下的内容。",
  limitHit: "已到时长上限，正在转写已经录下的内容。",
  cannotSend: "当前入口现在不能发送。草稿和已转写的文字还在。",
  cancelled: "已取消这次录音，草稿还在。",
  cleared: "草稿已清空，转写没有填回。",
  confirm: "插入位置已经变了。确认后把转写接在草稿末尾，不会覆盖你改过的文字。",
  downloadCancelled: "已取消下载，可以继续打字。",
  downloadFailed: "下载没有完成，可以重试，也可以取消后继续打字。",
  modelReady: "本地识别已准备好，再点一次开始录音。发给助理仍是下一步，不表示离线。",
  needModel: "本地识别需要下载模型后才能用。音频只留在这台电脑，不会因此上传。",
  recording: "正在录音",
  downloading: "正在下载本地识别",
} as const;

export type UivVoicePhase = "idle" | "need-permission" | "need-model" | "downloading" | "recording" | "transcribing" | "confirm-insert" | "no-speech" | "failed" | "interrupted" | "unavailable";
export interface UivVoice {
  phase: UivVoicePhase; generation: number; owner: UivIdentity | null; anchor: number; snapshot: string;
  pending: string | null; cleared: boolean; unclear: boolean; message: string; elapsedMs: number; level: number;
  bytesDone: number; bytesTotal: number; limitMs: number | null; warned: boolean; keepAudio: boolean;
}
export function uivVoiceIdle(): UivVoice {
  return { phase: "idle", generation: 0, owner: null, anchor: 0, snapshot: "", pending: null, cleared: false, unclear: false,
    message: "", elapsedMs: 0, level: 0, bytesDone: 0, bytesTotal: 0, limitMs: null, warned: false, keepAudio: false };
}
export function uivVoiceBusy(voice: UivVoice): boolean { return uivPhaseBusy(voice.phase); }
export function uivClampAnchor(text: string, anchor: number): number {
  if (!Number.isFinite(anchor) || anchor < 0) return 0;
  return Math.min(text.length, Math.floor(anchor));
}

export interface UivRecordRequest {
  owner: UivIdentity; text: string; anchor: number; permission: "granted" | "denied" | "prompt";
  model: "ready" | "missing" | "unavailable"; approximateBytes?: number; limitMs: number | null;
}
export function uivRequestRecord(voice: UivVoice, input: UivRecordRequest): UivVoice {
  if (uivVoiceBusy(voice)) return voice;
  const generation = voice.generation + 1;
  const base = { ...uivVoiceIdle(), generation };
  if (input.permission === "denied") return { ...base, phase: "need-permission", message: UIV_RECOVERY.permission };
  if (input.model === "unavailable") return { ...base, phase: "unavailable", message: UIV_RECOVERY.noMic };
  if (input.model === "missing") return { ...base, phase: "need-model", bytesTotal: input.approximateBytes ?? 626_000_000, message: UIV_RECOVERY.needModel, owner: input.owner, anchor: uivClampAnchor(input.text, input.anchor), snapshot: input.text };
  return { ...base, phase: "recording", owner: input.owner, anchor: uivClampAnchor(input.text, input.anchor), snapshot: input.text, limitMs: input.limitMs, message: UIV_RECOVERY.recording, keepAudio: true };
}

export function uivBeginDownload(voice: UivVoice, confirmed: boolean): UivVoice {
  if (voice.phase !== "need-model" || !confirmed) return voice;
  return { ...voice, phase: "downloading", bytesDone: 0, message: UIV_RECOVERY.downloading };
}
export function uivDownloadProgress(voice: UivVoice, done: number, total: number): UivVoice {
  if (voice.phase !== "downloading") return voice;
  const bytesTotal = total > 0 ? total : voice.bytesTotal;
  const bytesDone = Math.max(0, Math.min(bytesTotal, done));
  return { ...voice, bytesDone, bytesTotal, message: `${UIV_RECOVERY.downloading} ${uivBytesLabel(bytesDone)} / ${uivBytesLabel(bytesTotal)}` };
}
export function uivBytesLabel(bytes: number): string { return `${Math.max(0, Math.round(bytes / 1_000_000))} MB`; }
export function uivFinishDownload(voice: UivVoice, ok: boolean): UivVoice {
  if (voice.phase !== "downloading") return voice;
  if (!ok) return { ...voice, phase: "need-model", message: UIV_RECOVERY.downloadFailed, keepAudio: false };
  return { ...uivVoiceIdle(), generation: voice.generation, message: UIV_RECOVERY.modelReady };
}

export function uivStopRecord(voice: UivVoice): UivVoice {
  if (voice.phase !== "recording") return voice;
  return { ...voice, phase: "transcribing", message: UIV_RECOVERY.slow, keepAudio: true };
}
export function uivTickRecord(voice: UivVoice, elapsedMs: number, level: number): UivVoice {
  if (voice.phase !== "recording") return voice;
  const elapsed = Math.max(0, elapsedMs);
  const next = { ...voice, elapsedMs: elapsed, level: Math.max(0, Math.min(1, level)) };
  if (voice.limitMs != null && elapsed >= voice.limitMs) return { ...next, phase: "transcribing", message: UIV_RECOVERY.limitHit, keepAudio: true };
  if (voice.limitMs != null && elapsed >= voice.limitMs * 0.8) return { ...next, warned: true, message: `${UIV_RECOVERY.limitSoon} ${Math.floor(elapsed / 1000)} 秒` };
  if (voice.message === UIV_RECOVERY.switched) return { ...next, message: UIV_RECOVERY.switched };
  return { ...next, message: `${UIV_RECOVERY.recording} ${Math.floor(elapsed / 1000)} 秒` };
}
export function uivCancelVoice(voice: UivVoice): UivVoice {
  if (!uivVoiceBusy(voice) && voice.phase !== "confirm-insert" && voice.phase !== "failed" && voice.phase !== "need-model") return voice;
  return { ...uivVoiceIdle(), generation: voice.generation + 1, message: voice.phase === "downloading" || voice.phase === "need-model" ? UIV_RECOVERY.downloadCancelled : UIV_RECOVERY.cancelled };
}
export function uivNoteEdit(voice: UivVoice, text: string): UivVoice {
  if (voice.phase !== "transcribing" && voice.phase !== "confirm-insert") return voice;
  if (!text) return { ...voice, cleared: true, unclear: true, message: UIV_RECOVERY.cleared };
  const prefix = voice.snapshot.slice(0, voice.anchor);
  const suffix = voice.snapshot.slice(voice.anchor);
  const unclear = !text.startsWith(prefix) || (suffix.length > 0 && !text.endsWith(suffix));
  return { ...voice, cleared: false, unclear, message: unclear ? UIV_RECOVERY.confirm : voice.message };
}
export function uivNoteSwitch(voice: UivVoice, current: UivIdentity): UivVoice {
  if (!voice.owner || uivSameIdentity(voice.owner, current) || !uivVoiceBusy(voice)) return voice;
  return { ...voice, message: UIV_RECOVERY.switched };
}

export interface UivTranscriptResult { voice: UivVoice; text: string; stored: { owner: UivIdentity; text: string } | null }
/** Insert the spoken words at the original cursor without dropping text the user added around it. */
export function uivInsertTranscript(snapshot: string, anchor: number, current: string, transcript: string): string | null {
  const prefix = snapshot.slice(0, uivClampAnchor(snapshot, anchor));
  const suffix = snapshot.slice(uivClampAnchor(snapshot, anchor));
  if (!current.startsWith(prefix) || (suffix.length > 0 && !current.endsWith(suffix))) return null;
  const middle = current.slice(prefix.length, current.length - suffix.length);
  return prefix + transcript + middle + suffix;
}
export function uivApplyTranscript(voice: UivVoice, generation: number, current: UivIdentity, text: string, transcript: string, unclear: boolean): UivTranscriptResult {
  if (generation !== voice.generation || (voice.phase !== "transcribing" && voice.phase !== "recording")) return { voice, text, stored: null };
  if (unclear || !transcript.trim()) return { voice: { ...voice, phase: "no-speech", pending: null, keepAudio: false, message: UIV_RECOVERY.noSpeech }, text, stored: null };
  const spoken = transcript.trim();
  if (voice.cleared) return { voice: { ...voice, phase: "idle", pending: null, keepAudio: false, owner: null, message: UIV_RECOVERY.cleared }, text, stored: null };
  if (!uivSameIdentity(voice.owner, current)) {
    const owned = uivInsertTranscript(voice.snapshot, voice.anchor, voice.snapshot, spoken) ?? `${voice.snapshot}${voice.snapshot ? "\n" : ""}${spoken}`;
    return { voice: { ...voice, phase: "idle", pending: null, keepAudio: false, message: UIV_RECOVERY.switched }, text, stored: voice.owner ? { owner: voice.owner, text: owned } : null };
  }
  if (!text && voice.snapshot) return { voice: { ...voice, phase: "idle", pending: null, keepAudio: false, owner: null, cleared: true, message: UIV_RECOVERY.cleared }, text, stored: null };
  const inserted = voice.unclear ? null : uivInsertTranscript(voice.snapshot, voice.anchor, text, spoken);
  if (inserted == null) return { voice: { ...voice, phase: "confirm-insert", pending: spoken, unclear: true, keepAudio: true, message: UIV_RECOVERY.confirm }, text, stored: null };
  return { voice: { ...uivVoiceIdle(), generation: voice.generation }, text: inserted, stored: null };
}

export function uivConfirmInsert(voice: UivVoice, text: string, accept: boolean): { voice: UivVoice; text: string } {
  if (voice.phase !== "confirm-insert" || !voice.pending) return { voice, text };
  const spoken = voice.pending;
  const next = !accept || text.endsWith(spoken) ? text : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${spoken}`;
  return { voice: { ...uivVoiceIdle(), generation: voice.generation + 1, message: accept ? "" : UIV_RECOVERY.cancelled }, text: next };
}
export function uivFailTranscript(voice: UivVoice): UivVoice {
  if (voice.phase !== "transcribing" && voice.phase !== "recording") return voice;
  return { ...voice, phase: "failed", keepAudio: true, message: UIV_RECOVERY.failed };
}
export function uivRetryTranscript(voice: UivVoice): UivVoice {
  if (voice.phase !== "failed" || !voice.keepAudio) return voice;
  return { ...voice, phase: "transcribing", message: UIV_RECOVERY.slow };
}
export function uivDiscardAudio(voice: UivVoice): UivVoice {
  return { ...uivVoiceIdle(), generation: voice.generation + 1, message: UIV_RECOVERY.cancelled };
}
export const UIV_VOICE_OPEN_KEY = "molis.uiv.voice-open";
export function uivExplainInterrupted(): string { return UIV_RECOVERY.interrupted; }
export function uivContextInvalid(label: string): string {
  return `所选上下文不可用：${label}。没有改用别的上下文发送。`;
}
export function uivCannotSend(reason: string): string {
  const lead = reason.trim();
  return lead ? `${lead} ${UIV_RECOVERY.cannotSend}` : UIV_RECOVERY.cannotSend;
}
export interface UivControlVisibility {
  mic: boolean; stop: boolean; cancel: boolean; download: boolean; retry: boolean; discard: boolean; confirm: boolean; decline: boolean;
}
/** Which voice controls are on screen. Stop-recording is not the control that stops an AI task. */
export function uivVisibleControls(phase: string): UivControlVisibility {
  const recording = phase === "recording";
  const busy = phase === "recording" || phase === "transcribing" || phase === "downloading";
  return {
    mic: !busy && phase !== "confirm-insert",
    stop: recording,
    cancel: busy || phase === "need-model",
    download: phase === "need-model",
    retry: phase === "failed",
    discard: phase === "failed",
    confirm: phase === "confirm-insert",
    decline: phase === "confirm-insert",
  };
}
export type UivFieldState = "empty" | "focus" | "draft" | "unavailable" | "busy" | "failed";
export function uivFieldLabel(state: UivFieldState): string {
  if (state === "focus") return "正在输入";
  if (state === "draft") return "已有草稿";
  if (state === "unavailable") return "现在不可用";
  if (state === "busy") return "处理中";
  if (state === "failed") return "失败";
  return "空白";
}
export function uivFieldState(input: { text: string; focused: boolean; unavailable: boolean; busy: boolean; failed: boolean }): UivFieldState {
  if (input.unavailable) return "unavailable";
  if (input.failed) return "failed";
  if (input.busy) return "busy";
  if (input.focused && !input.text) return "focus";
  if (input.text.trim()) return "draft";
  return "empty";
}
