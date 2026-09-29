import type { MaterialWebsiteReader } from "@molis-ai/molis-work-contracts/services/materials";
import { createExecutionLifetime } from "@molis-ai/molis-work-kernel";
import { extractMaterial } from "./material-extraction.js";
import { MaterialExtractionError } from "./material-text.js";

const MAX_BYTES = 4 * 1024 * 1024, TIMEOUT_MS = 12_000, MAX_REDIRECTS = 5;
function address(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new MaterialExtractionError("url", "网页地址必须是没有内嵌凭据的 HTTP(S) 链接");
  return url;
}

/** Explicit page capture, including local pages; no cookies, connector credentials or incoming request headers. */
export const readMaterialWebsite: MaterialWebsiteReader = async (input, options = {}) => {
  options.signal?.throwIfAborted();
  const lifetime = createExecutionLifetime({ signal: options.signal, timeout: { milliseconds: TIMEOUT_MS, reason: new MaterialExtractionError("timeout", "网页读取超过 12 秒") } });
  const { signal } = lifetime;
  let response: Response | undefined;
  try {
    let url = address(input);
    for (let hop = 0; ; hop++) {
      lifetime.assertActive();
      await lifetime.wait(Promise.resolve(options.beforeDispatch?.()));
      signal.throwIfAborted();
      response = await fetch(url, { redirect: "manual", signal, headers: { accept: "text/html,application/xhtml+xml,text/plain" } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || hop >= MAX_REDIRECTS) throw new MaterialExtractionError("redirect", "网页跳转次数过多或缺少目标地址");
      url = address(new URL(location, url).href);
    }
    if (!response.ok) throw new MaterialExtractionError("http", "网页暂时无法读取");
    const type = response.headers.get("content-type")?.split(";", 1)[0]!.trim().toLowerCase() ?? "";
    if (type && !["text/html", "application/xhtml+xml", "application/xml", "text/xml", "text/plain"].includes(type)) throw new MaterialExtractionError("unsupported", "链接没有返回可读取的网页正文");
    const reader = response.body?.getReader();
    if (!reader) throw new MaterialExtractionError("empty", "网页没有正文");
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read(); signal.throwIfAborted();
        if (chunk.done) break;
        bytes += chunk.value.length;
        if (bytes > MAX_BYTES) throw new MaterialExtractionError("too_large", "网页正文超过 4 MiB，未保存正文");
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const result = await extractMaterial({ file_name: type === "text/plain" ? "page.txt" : "page.html", bytes: Buffer.concat(chunks, bytes) },
      { signal, textFormat: "markdown", limits: { maxBytes: MAX_BYTES, maxCharacters: 2_000_000, maxTextBytes: 4 * 1024 * 1024 } });
    signal.throwIfAborted();
    return result;
  } finally {
    lifetime.dispose();
    await response?.body?.cancel().catch(() => {});
  }
};
