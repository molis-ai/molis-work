import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { isLoopbackHostname } from "@molis-ai/molis-work-contracts/platform/loopback";
import type { MaterialExtraction } from "@molis-ai/molis-work-contracts/services/materials";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";
import { isHostEndpointPort } from "./host-endpoints.js";
import { MATERIAL_PAGE_LIMITS, assertReadablePageType, extractMaterialPage } from "./material-web.js";
import { isMaterialSourceFailure, readMaterialPublicBody } from "./material-source-reader.js";
import { materialErrors } from "./material-text.js";

/**
 * The local-page reader's own refusals: an address that is not one of this machine's loopback names, and the Host's own endpoint.
 * Reading failures (a timeout, a status, a body too large) are `materialErrors`, the same words a public page gets.
 */
const materialLocalPageErrors = defineErrorCodes("material.local_page", {
  not_local: "invalid",
  own_endpoint: "forbidden",
});

interface LoopbackAddress { readonly address: string; readonly family: number }
interface MaterialLocalPageOptions {
  signal?: AbortSignal;
  /** Rechecks the caller's authority immediately before each connection. */
  beforeDispatch?(): void | Promise<void>;
  /** Test seam for the one name that needs resolving (`localhost`); a numeric address never resolves. */
  lookup?(hostname: string): Promise<readonly LoopbackAddress[]>;
}

/**
 * Plain HTTP to a loopback name, no credentials, and not a port this Host serves or owns. Nothing is resolved or sent before this
 * passes, and every redirect target is held to it again. The loopback judgment itself is the shared module's alone (S-09).
 */
function localPageUrl(value: string, reason: (message: string) => Error = materialErrors.url): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw reason("网页地址无效"); }
  if (url.protocol !== "http:" || url.username || url.password || !isLoopbackHostname(url.hostname)) {
    throw materialLocalPageErrors.not_local("只能读取本机的页面：没有内嵌凭据、地址是 127.0.0.1、[::1] 或 localhost 的 HTTP 链接");
  }
  if (isHostEndpointPort(Number(url.port || 80))) throw materialLocalPageErrors.own_endpoint("不能读取 Molis Work 自己的服务端口");
  return url;
}

/** A numeric loopback address needs no resolver; `localhost` must resolve to loopback addresses only, each of which is then connected to directly. */
async function loopbackAddresses(url: URL, lookup: NonNullable<MaterialLocalPageOptions["lookup"]>): Promise<readonly LoopbackAddress[]> {
  const host = url.hostname.replace(/^\[|\]$/gu, "");
  if (host !== "localhost") return [{ address: host, family: host.includes(":") ? 6 : 4 }];
  let answers: readonly LoopbackAddress[];
  try { answers = await lookup(host); } catch { throw materialLocalPageErrors.not_local("localhost 没有解析到本机地址"); }
  if (!answers.length || answers.some(answer => !isLoopbackHostname(answer.address, { numeric: true }))) {
    throw materialLocalPageErrors.not_local("localhost 没有解析到本机地址");
  }
  return answers;
}

function send(url: URL, address: string, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise<IncomingMessage>((resolve, reject) => {
    // No cookies and no request headers of the person's: the address is connected to directly, the Host header keeps the page's own name.
    const request = httpRequest({ host: address, port: Number(url.port || 80), path: url.pathname + url.search, method: "GET", signal,
      headers: { host: url.host, accept: "text/html,application/xhtml+xml,text/plain", "accept-encoding": "identity", "user-agent": "MolisWork-Material/1.0" } }, resolve);
    request.once("error", error => reject(signal.aborted ? signal.reason : error));
    request.end();
  });
}

/** Tries the validated addresses in order; only "nothing is listening there" moves on to the next. */
async function connectFirst(addresses: readonly LoopbackAddress[], url: URL, signal: AbortSignal): Promise<IncomingMessage> {
  let last: unknown;
  for (const { address } of addresses) {
    try { return await send(url, address, signal); }
    catch (error) {
      if (signal.aborted || (error as NodeJS.ErrnoException).code !== "ECONNREFUSED") throw error;
      last = error;
    }
  }
  throw last;
}

/**
 * Reads one page on this machine as text, for a plugin that declared and holds `materials:fetch_local`. It is the public reader's
 * twin with a different address rule: the same timeout, redirect count, body cap and content types, no cookies, no credentials.
 */
export async function readMaterialLocalPage(input: string, options: MaterialLocalPageOptions = {}): Promise<MaterialExtraction> {
  options.signal?.throwIfAborted();
  const lookup = options.lookup ?? (hostname => dnsLookup(hostname, { all: true, verbatim: true }));
  const lifetime = createExecutionLifetime({ signal: options.signal, timeout: { milliseconds: MATERIAL_PAGE_LIMITS.timeoutMs, reason: materialErrors.timeout("网页读取超过 12 秒") } });
  const { signal } = lifetime;
  let response: IncomingMessage | undefined;
  try {
    let url = localPageUrl(input);
    for (let hop = 0; ; hop++) {
      lifetime.assertActive();
      const addresses = await lifetime.wait(loopbackAddresses(url, lookup));
      await lifetime.wait(Promise.resolve(options.beforeDispatch?.()));
      signal.throwIfAborted();
      response = await lifetime.wait(connectFirst(addresses, url, signal));
      if (![301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) break;
      const location = response.headers.location;
      response.destroy(); response = undefined;
      if (!location || hop >= MATERIAL_PAGE_LIMITS.maxRedirects) throw materialErrors.redirect("网页跳转次数过多或缺少目标地址");
      let target: string;
      try { target = new URL(location, url).href; } catch { throw materialErrors.redirect("网页跳转地址无效"); }
      url = localPageUrl(target, materialErrors.redirect);
    }
    const status = response.statusCode ?? 0;
    if (status < 200 || status > 299) throw materialErrors.http("网页暂时无法读取");
    const type = response.headers["content-type"]?.split(";", 1)[0]!.trim().toLowerCase() ?? "";
    assertReadablePageType(type);
    const bytes = await lifetime.wait(readMaterialPublicBody(response, response.headers["content-encoding"] ?? "", MATERIAL_PAGE_LIMITS.maxBytes)
      .catch(error => { throw isMaterialSourceFailure(error) && error.code === "material.source.too_large" ? materialErrors.too_large("网页正文超过 4 MiB，未保存正文") : error; }));
    return await extractMaterialPage(type, bytes, signal);
  } finally {
    lifetime.dispose();
    response?.destroy();
  }
}
