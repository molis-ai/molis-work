import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { MaterialLimits } from "@molis-ai/molis-work-contracts/services/materials";
import { jellyModelCacheDirectory } from "./jelly-native-material.js";
import { extractNativeMaterial } from "./material-native.js";
import { isMaterialFailure } from "./material-text.js";

const run = promisify(execFile);
const outputLimits: MaterialLimits = { maxBytes: 15_000_000, maxCharacters: 100_000, maxTextBytes: 400_000, maxPages: 4 };
export interface LocalVoiceOptions {
  helperPath?: string;
  allowModelDownload?: boolean;
  onProgress?: (progress: { stage: string; progress: number }) => void;
}
export interface LocalVoiceProbe {
  model: "available" | "model_required";
  approximateBytes: number;
  variant: string;
  message: string;
}
export interface LocalVoiceTranscript {
  text: string;
  unclear: boolean;
  modelRequired: boolean;
  message: string;
  approximateBytes?: number;
}

/** The same jelly-whisper the material reader uses. A caller may point at a built binary; nothing here picks a cloud model. */
export function localVoiceHelper(override?: string): string {
  if (override?.trim()) return override;
  const fromEnv = process.env.MOLIS_JELLY_WHISPER_HELPER;
  if (fromEnv?.trim()) return fromEnv;
  return path.resolve(path.dirname(fileURLToPath(import.meta.resolve("@molis-ai/molis-work-app-local-host"))), "../native/materials/bin/jelly-whisper");
}

function bytesOf(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number > 0 ? number : 626_000_000;
}
function stdoutOf(error: unknown): string {
  return error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
}
function readProbe(raw: unknown): LocalVoiceProbe {
  const value = raw && typeof raw === "object" ? raw as { model?: unknown; approximate_bytes?: unknown; variant?: unknown; message?: unknown } : {};
  const model = value.model === "available" ? "available" : "model_required";
  return {
    model,
    approximateBytes: bytesOf(value.approximate_bytes),
    variant: typeof value.variant === "string" ? value.variant : "",
    message: model === "available" ? "" : typeof value.message === "string" && value.message ? value.message : "本地识别需要下载模型后才能用。音频只留在这台电脑，不会因此上传。",
  };
}

/** Ask the local helper whether its model is on disk. This does not download and does not send audio anywhere. */
export async function probeLocalVoice(home: string, options: LocalVoiceOptions = {}): Promise<LocalVoiceProbe> {
  const helper = localVoiceHelper(options.helperPath);
  const modelDirectory = await jellyModelCacheDirectory(home);
  try {
    const { stdout } = await run(helper, ["capabilities", modelDirectory], { timeout: 30_000, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 });
    return readProbe(JSON.parse(stdout));
  } catch (error) {
    const stdout = stdoutOf(error);
    if (stdout.trim().startsWith("{")) return readProbe(JSON.parse(stdout));
    const message = error instanceof Error ? error.message : "本地识别组件不可用";
    throw new Error(stdout ? `${message}\n${stdout}` : message);
  }
}

/** A short valid silent clip. A zero-length file never reaches the model check. */
export function silentVoiceWav(seconds = 0.2, sampleRate = 16_000): Buffer {
  const samples = Math.max(1, Math.floor(seconds * sampleRate));
  const dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

function failureBytes(error: { details?: Readonly<Record<string, unknown>> }): number | undefined {
  const value = error.details?.approximate_bytes;
  return value == null ? undefined : bytesOf(value);
}

const materialStamp = /^(?:\[\d+\.\d{2}\u2013\d+\.\d{2} 秒\] |\[画面 \d+\.\d{2} 秒\] )/u;

/** Spoken segments for the draft. Material extraction keeps its timestamped lines; this path does not copy those prefixes. */
function spokenText(result: { text: string; segments?: { text: string }[] }): string {
  const segments = result.segments?.map(segment => segment.text.trim()).filter(segment => segment.length > 0);
  if (segments && segments.length > 0) return segments.join("\n");
  return result.text.split("\n").map(line => line.replace(materialStamp, "")).join("\n").trim();
}

/**
 * Transcribe with jelly-whisper. `allowModelDownload` is forwarded only when the caller already confirmed it.
 * The draft receives the helper's spoken segments, not the timestamped material lines.
 */
export async function transcribeLocalVoice(home: string, audio: Uint8Array, fileName: string, options: LocalVoiceOptions = {}): Promise<LocalVoiceTranscript> {
  const modelDirectory = await jellyModelCacheDirectory(home);
  try {
    const result = await extractNativeMaterial(
      { file_name: fileName, bytes: audio },
      { allowModelDownload: options.allowModelDownload === true, onProgress: options.onProgress, timeoutMs: 30 * 60_000 },
      outputLimits,
      { whisperHelperPath: localVoiceHelper(options.helperPath), modelDirectory, platform: process.platform },
    );
    const text = spokenText(result);
    if (!text) return { text: "", unclear: true, modelRequired: false, message: "未听清，可以重新录。" };
    return { text, unclear: false, modelRequired: false, message: "" };
  } catch (error) {
    if (isMaterialFailure(error) && (error.code === "material.insufficient_content" || error.code === "material.empty")) {
      return { text: "", unclear: true, modelRequired: false, message: "未听清，可以重新录。" };
    }
    if (isMaterialFailure(error) && error.code === "material.model_required") {
      return { text: "", unclear: false, modelRequired: true, message: error.message, approximateBytes: failureBytes(error) };
    }
    throw error;
  }
}
