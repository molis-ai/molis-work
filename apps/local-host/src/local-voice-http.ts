import type { IncomingMessage, ServerResponse } from "node:http";
import { probeLocalVoice, silentVoiceWav, transcribeLocalVoice } from "./local-voice.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";

const bodyLimit = 22_000_000;
const audioLimit = 15_000_000;

function localVoicePath(pathname: string): boolean {
  return pathname.replace(/^\/projects\/[^/]+/u, "") === "/api/local-voice";
}
function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "本地识别没有完成";
}
function audioName(mime: unknown): string {
  const type = typeof mime === "string" ? mime : "";
  if (type.includes("mp4") || type.includes("m4a")) return "dictation.m4a";
  if (type.includes("wav")) return "dictation.wav";
  return "dictation.webm";
}
function decodeAudio(value: unknown, mime: unknown): { bytes: Buffer; fileName: string } {
  if (typeof value !== "string" || !value || value.length > bodyLimit) throw new Error("音频无效或超过 15 MB");
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length > audioLimit || bytes.toString("base64").replace(/=+$/u, "") !== value.replace(/=+$/u, "")) throw new Error("音频无效或超过 15 MB");
  return { bytes, fileName: audioName(mime) };
}

/** Composer dictation. Returns false when the path is not this route. Audio is transcribed only on this machine. */
export async function handleLocalVoiceHttp(request: IncomingMessage, response: ServerResponse, url: URL, home: string | undefined): Promise<boolean> {
  if (!localVoicePath(url.pathname)) return false;
  if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "只接受 POST" }); return true; }
  if (!home) { sendLocalWebJson(response, 503, { error: "本机 Home 还没准备好，暂时不能本地识别" }); return true; }
  const controller = new AbortController();
  const disconnected = () => { if (!response.writableEnded) controller.abort(); };
  request.once("aborted", disconnected); response.once("close", disconnected);
  try {
    return await dispatchLocalVoice(request, response, home, controller.signal);
  } finally { request.off("aborted", disconnected); response.off("close", disconnected); }
}

async function dispatchLocalVoice(request: IncomingMessage, response: ServerResponse, home: string, signal: AbortSignal): Promise<boolean> {
  let body: Record<string, unknown>;
  try { body = await readLocalWebBody(request, bodyLimit); }
  catch (error) { if (!signal.aborted && !response.destroyed) sendLocalWebJson(response, 400, { error: messageOf(error) }); return true; }
  try {
    signal.throwIfAborted();
    if (body.op === "probe") {
      const probe = await probeLocalVoice(home, { signal });
      sendLocalWebJson(response, 200, { model: probe.model, approximate_bytes: probe.approximateBytes, variant: probe.variant, message: probe.message });
      return true;
    }
    if (body.op === "prepare") return await prepareModel(response, home, body.confirm_download === true, signal);
    if (body.op === "transcribe") return await transcribe(response, home, body, signal);
  } catch (error) {
    if (signal.aborted || response.destroyed) return true;
    if (!response.headersSent) sendLocalWebJson(response, 500, { error: messageOf(error) });
    else response.end(`${JSON.stringify({ ok: false, message: messageOf(error) })}\n`);
    return true;
  }
  sendLocalWebJson(response, 400, { error: "不认识的本地语音操作" });
  return true;
}

async function prepareModel(response: ServerResponse, home: string, confirmed: boolean, signal: AbortSignal): Promise<boolean> {
  if (!confirmed) { sendLocalWebJson(response, 400, { error: "需要你明确同意后才下载本地识别模型" }); return true; }
  response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" });
  try {
    const result = await transcribeLocalVoice(home, silentVoiceWav(), "silence.wav", {
      signal, allowModelDownload: true,
      onProgress: progress => { if (!signal.aborted && !response.destroyed) response.write(`${JSON.stringify(progress)}\n`); },
    });
    signal.throwIfAborted();
    response.end(`${JSON.stringify(result.modelRequired ? { ok: false, message: result.message } : { ok: true })}\n`);
  } catch (error) {
    if (signal.aborted || response.destroyed) return true;
    response.end(`${JSON.stringify({ ok: false, message: messageOf(error) })}\n`);
  }
  return true;
}

async function transcribe(response: ServerResponse, home: string, body: Record<string, unknown>, signal: AbortSignal): Promise<boolean> {
  const audio = decodeAudio(body.audio_base64, body.mime);
  const result = await transcribeLocalVoice(home, audio.bytes, audio.fileName, { signal, allowModelDownload: false });
  sendLocalWebJson(response, result.modelRequired ? 409 : 200, {
    text: result.text, unclear: result.unclear, model_required: result.modelRequired, message: result.message, approximate_bytes: result.approximateBytes,
  });
  return true;
}
