import type { ImageApiFormat, GeneratedImage } from "@molis-ai/molis-work-contracts/modules/images";
import { isIP } from "node:net";
import { ImagesError } from "./error.js";

export type ImageFetch = typeof globalThis.fetch;
export interface ProviderImage { bytes: Buffer; mime: GeneratedImage["mime_type"] }
export interface ImageProviderRequest {
  api_format: ImageApiFormat;
  base_url: string;
  model: string;
  api_key: string;
  prompt: string;
  size: string;
  aspect_ratio: string;
}
const MAX_JSON_BYTES = 40 * 1024 * 1024;
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

export async function generateProviderImages(input: ImageProviderRequest, signal: AbortSignal, fetchImpl: ImageFetch = globalThis.fetch): Promise<ProviderImage[]> {
  const base = normalizeImageBaseUrl(input.base_url);
  const headers: Record<string, string> = { "content-type": "application/json" };
  let url: string;
  let body: Record<string, unknown>;
  if (input.api_format === "openai-images") {
    url = `${base}/images/generations`;
    if (input.api_key) headers.authorization = `Bearer ${input.api_key}`;
    // GPT Image and several compatible vendors have different optional fields.
    // Leaving n/response_format unset preserves their shared default behavior.
    body = { model: input.model, prompt: input.prompt, ...(input.size ? { size: input.size } : {}) };
  } else if (input.api_format === "gemini") {
    url = `${base}/models/${encodeURIComponent(input.model)}:generateContent`;
    if (input.api_key) headers["x-goog-api-key"] = input.api_key;
    body = {
      contents: [{ parts: [{ text: input.prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], ...(input.aspect_ratio ? { imageConfig: { aspectRatio: input.aspect_ratio } } : {}) },
    };
  } else {
    throw new ImagesError("images.invalid", "请选择受支持的图片 API 协议。");
  }
  const response = await abortable(fetchImpl(url, {
    method: "POST", headers, body: JSON.stringify(body), signal, redirect: "error", credentials: "omit",
  }), signal);
  await assertSuccessful(response);
  const bytes = await readLimited(response, MAX_JSON_BYTES, signal);
  let payload: unknown;
  try { payload = JSON.parse(bytes.toString("utf8")); } catch { throw new ImagesError("images.invalid_response", "厂商返回的内容不是有效 JSON。请检查 API 基址和所选协议。", 502); }
  const data = record(payload);
  const result: ProviderImage[] = [];
  if (input.api_format === "openai-images") {
    for (const item of array(data.data)) {
      const entry = record(item);
      if (typeof entry.b64_json === "string" && entry.b64_json) result.push(decodeImage(entry.b64_json));
      else if (typeof entry.url === "string" && entry.url) result.push(await downloadImage(entry.url, base, signal, fetchImpl));
      if (result.length === 4) break;
    }
  } else {
    for (const candidate of array(data.candidates)) {
      for (const part of array(record(record(candidate).content).parts)) {
        const entry = record(part);
        if (entry.thought === true) continue;
        const inline = record(entry.inlineData ?? entry.inline_data);
        if (typeof inline.data === "string" && inline.data) {
          result.push(decodeImage(inline.data, inline.mimeType ?? inline.mime_type));
        }
        if (result.length === 4) break;
      }
      if (result.length === 4) break;
    }
  }
  if (!result.length) throw new ImagesError("images.no_image", "厂商已响应，但没有返回图片。请检查模型是否支持生图、提示词限制及所选 API 协议。", 502);
  return result;
}

async function downloadImage(value: string, sourceBase: string, signal: AbortSignal, fetchImpl: ImageFetch): Promise<ProviderImage> {
  const url = safeUrl(value);
  const source = new URL(sourceBase);
  const sameLocalOrigin = isLocalImageEndpoint(sourceBase) && source.origin === url.origin;
  if (!sameLocalOrigin && (url.protocol !== "https:" || isPrivateHostname(url.hostname))) {
    throw new ImagesError("images.invalid_url", "厂商返回的图片地址必须是公共 HTTPS 地址；本地服务只允许下载同一服务地址的本地图片。", 502);
  }
  // Signed image URLs may use another host. Never forward provider credentials.
  const response = await abortable(fetchImpl(url.href, { signal, redirect: "error", credentials: "omit" }), signal);
  await assertSuccessful(response);
  return checkedImage(await readLimited(response, MAX_IMAGE_BYTES, signal), response.headers.get("content-type")?.split(";")[0]?.trim());
}

function decodeImage(value: string, mime?: unknown): ProviderImage {
  if (value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw tooLarge();
  const padding = value.indexOf("=");
  // A repeated-group regex can overflow V8's stack on normal multi-MB images.
  const validPadding = padding === -1 || (padding >= value.length - 2 && value.slice(padding) === "=".repeat(value.length - padding));
  if (value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/u.test(value) || !validPadding) {
    throw new ImagesError("images.invalid_image", "厂商返回了无效的 Base64 图片。", 502);
  }
  return checkedImage(Buffer.from(value, "base64"), typeof mime === "string" ? mime : undefined);
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

async function assertSuccessful(response: Response): Promise<void> {
  if (response.ok) return;
  await response.body?.cancel().catch(() => undefined);
  const explanations: Record<number, string> = {
    400: "厂商拒绝了生成参数，请检查模型、尺寸和提示词。",
    401: "API Key 无效或已过期，请更新服务密钥。",
    403: "此密钥没有所选模型的权限，或请求被厂商策略拒绝。",
    404: "找不到接口或模型，请检查 API 基址、模型名称与协议。",
    413: "厂商拒绝了过大的请求，请缩短提示词。",
    429: "厂商限流或额度不足，请检查用量与余额，稍后再手动重试。",
  };
  throw new ImagesError("images.provider_http", `HTTP ${response.status}：${explanations[response.status] ?? "厂商服务暂时不可用，请稍后再手动重试。"}`, 502);
}

async function readLimited(response: Response, limit: number, signal: AbortSignal): Promise<Buffer> {
  const announced = Number(response.headers.get("content-length"));
  if (announced > limit) { await response.body?.cancel().catch(() => undefined); throw tooLarge(); }
  if (!response.body) throw new ImagesError("images.invalid_response", "厂商返回了空响应。", 502);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await abortable(reader.read(), signal);
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) throw tooLarge();
      chunks.push(next.value);
    }
    return Buffer.concat(chunks, length);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
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
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

function isPrivateHostname(value: string): boolean {
  const hostname = value.replace(/^\[|\]$/gu, "").replace(/\.$/u, "").toLowerCase();
  const version = isIP(hostname);
  if (version === 4) {
    const [first = 0, second = 0] = hostname.split(".").map(Number);
    return first === 0 || first === 10 || first === 127 || first >= 224
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && (second === 168 || second === 0))
      || (first === 198 && (second === 18 || second === 19));
  }
  // Global-unicast IPv6 is 2000::/3. This excludes loopback, mapped IPv4,
  // link-local, unique-local and multicast forms without DNS lookups.
  if (version === 6) return !/^[23]/u.test(hostname);
  return !hostname.includes(".") || /\.(?:localhost|local|internal|lan)$/u.test(hostname);
}
