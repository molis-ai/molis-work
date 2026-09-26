import type { ImageApiFormat, GeneratedImage } from "@molis-ai/molis-work-contracts/modules/images";
import { ImagesError } from "./error.js";

export interface ProviderImage { bytes: Buffer; mime: GeneratedImage["mime_type"] }
export interface ImageProviderRequest {
  api_format: ImageApiFormat;
  base_url: string;
  model: string;
  credential_ref: string;
  resolveCredential(reference: string): string | null;
  prompt: string;
  size: string;
  aspect_ratio: string;
}
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export function isLocalImageEndpoint(url: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
}

export function normalizeImageBaseUrl(value: string): string {
  const url = safeUrl(value);
  if (url.search || url.hash) throw new ImagesError("images.invalid", "API 基址不能包含查询参数、密钥或片段。请在 API Key 字段填写凭据。");
  return url.href.replace(/\/+$/u, "");
}

function safeUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new ImagesError("images.invalid_url", "服务或图片地址无效。"); }
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalImageEndpoint(url.href)))) {
    throw new ImagesError("images.invalid_url", "地址必须使用 HTTPS；只有 localhost、127.0.0.1 或 [::1] 可使用 HTTP，且地址不能内嵌凭据。");
  }
  return url;
}

/** Only the Host may provide model execution. This plugin validates returned assets. */
export type ImageGeneration = (input: ImageProviderRequest, signal: AbortSignal) => Promise<readonly { bytes: Uint8Array; mime?: string }[]>;

export async function generateProviderImages(input: ImageProviderRequest, signal: AbortSignal, generate: ImageGeneration): Promise<ProviderImage[]> {
  signal.throwIfAborted();
  normalizeImageBaseUrl(input.base_url);
  const outputs = await abortable(generate(input, signal), signal);
  signal.throwIfAborted();
  if (!outputs.length) throw new ImagesError("images.no_image", "厂商已响应，但没有返回图片。请检查模型是否支持生图、提示词限制及所选 API 协议。", 502);
  return outputs.slice(0, 4).map(image => checkedImage(Buffer.from(image.bytes), image.mime));
}

function checkedImage(bytes: Buffer, advertisedMime?: string): ProviderImage {
  if (bytes.length > MAX_IMAGE_BYTES) throw tooLarge();
  let mime: GeneratedImage["mime_type"];
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString("ascii", 12, 16) === "IHDR") mime = "image/png";
  else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = "image/jpeg";
  else if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") mime = "image/webp";
  else throw new ImagesError("images.invalid_image", "仅接受真实的 PNG、JPEG 或 WebP 图片；厂商返回的文件格式不受支持。", 502);
  if (advertisedMime && advertisedMime !== "application/octet-stream" && advertisedMime.toLowerCase() !== mime) {
    throw new ImagesError("images.invalid_image", "厂商返回的图片类型与文件内容不一致。", 502);
  }
  return { bytes, mime };
}

function tooLarge(): ImagesError {
  return new ImagesError("images.response_too_large", "厂商响应超出本机限制（JSON 40 MB、单图 20 MB），请调低图片尺寸。", 502);
}

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => undefined);
    return Promise.reject(abortReason(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortReason(signal));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function abortReason(signal: AbortSignal): ImagesError {
  return signal.reason instanceof ImagesError ? signal.reason : new ImagesError("images.cancelled", "已停止本机等待；厂商可能仍在生成或计费。", 409);
}
