import { get } from "node:http";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { LOCALE_COOKIE } from "./host.mjs";
import { requestKey, SSE_FIRST_EVENT } from "./manifest.mjs";

const isHtml = headers => /^text\/html(?:;|$)/i.test(headers["content-type"] ?? "");
const ok = status => status >= 200 && status < 300;

function decode(body, encoding) {
  if (encoding === "gzip") return gunzipSync(body);
  if (encoding === "br") return brotliDecompressSync(body);
  if (encoding === "deflate") return inflateSync(body);
  if (!encoding || encoding === "identity") return body;
  throw new Error(`unsupported Content-Encoding ${encoding}`);
}

function firstDataEvent() {
  let line = "", data = false, skipLf = false, starting = true;
  return chunk => {
    if (starting && chunk.length) { chunk = chunk.replace(/^\uFEFF/u, ""); starting = false; }
    for (const char of chunk) {
      if (skipLf) { skipLf = false; if (char === "\n") continue; }
      if (char !== "\n" && char !== "\r") {
        // Only the field name and whether the line was empty matter.
        if (line.length < 5) line += char;
        continue;
      }
      if (!line && data) return true;
      data ||= line === "data" || line === "data:";
      line = "";
      skipLf = char === "\r";
    }
    return false;
  };
}

function request(origin, entry, cookie, signal, { etag, inspect, scoped } = {}) {
  const url = new URL(entry, origin);
  if (url.origin !== origin) throw new Error("cross-origin request");
  const stream = scoped?.response === SSE_FIRST_EVENT;
  // Each request gets a dedicated socket. Count the actual response octets before Node's HTTP parser
  // consumes them (headers, framing, encoded payload), up to the first data event for a stream.
  return new Promise((resolve, reject) => {
    let wire = 0;
    const headers = { cookie, "accept-encoding": stream ? "identity" : "gzip, br", connection: "close" };
    if (stream) headers.accept = "text/event-stream";
    else if (etag) headers["if-none-match"] = etag;
    if (scoped) {
      headers["x-molis-work-page-session"] = scoped.proof;
      headers["sec-fetch-site"] = "same-origin";
      headers["sec-fetch-dest"] = "empty";
      headers.referer = new URL(scoped.document, origin).href;
    }
    const timeout = AbortSignal.timeout(10_000);
    const fail = error => reject(timeout.aborted && !signal.aborted ? new Error("HTTP response timed out") : error);
    const client = get(url, {
      agent: false, headers, signal: AbortSignal.any([signal, timeout]),
    }, response => {
      const { statusCode: status, headers } = response;
      response.on("error", fail);
      if (stream) {
        const type = /^text\/event-stream(?:\s*;|\s*$)/i.test(headers["content-type"] ?? "");
        const encoding = headers["content-encoding"];
        if (status !== 200 || !type || encoding && encoding !== "identity") {
          fail(new Error(status !== 200 ? `HTTP ${status}` : "expected an uncompressed event stream"));
          client.destroy();
          return;
        }
        const complete = firstDataEvent();
        response.setEncoding("utf8");
        response.on("data", chunk => {
          if (!complete(chunk)) return;
          resolve({ status, headers, wire, body: Buffer.alloc(0) });
          client.destroy();
        });
        response.once("end", () => fail(new Error("event stream ended before its first complete data event")));
        return;
      }
      const chunks = [];
      if (ok(status) && (inspect || isHtml(headers))) response.on("data", chunk => chunks.push(chunk));
      else response.resume();
      response.on("end", () => {
        if (!response.complete || wire === 0) { reject(new Error("incomplete HTTP response")); return; }
        try {
          const body = chunks.length ? decode(Buffer.concat(chunks), headers["content-encoding"]) : Buffer.alloc(0);
          resolve({ status, headers, wire, body });
        } catch (error) { reject(error); }
      });
    });
    client.on("socket", socket => socket.prependListener("data", chunk => { wire += chunk.length; }));
    client.on("error", fail);
  });
}

function attributes(text) {
  return [...text.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/g)]
    .map(([, name, doubleQuoted, singleQuoted, unquoted]) => [name.toLowerCase(), doubleQuoted ?? singleQuoted ?? unquoted]);
}

function pageSessionProofs(html) {
  const proofs = [];
  for (const tag of html.matchAll(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<meta\b([^>]*)>/gi)) {
    if (!tag[2]) continue;
    const values = new Map(attributes(tag[2]));
    if (values.get("name") === "molis-work-page-session") proofs.push(values.get("content") ?? "");
  }
  return proofs;
}

export function pageSessionRedactor(html) {
  const proofs = pageSessionProofs(html).filter(Boolean);
  return text => proofs.reduce((safe, proof) => safe.replaceAll(proof, "[redacted]"), text);
}

function rememberSessionCookies(jar, headers) {
  // The selected local Host issues host-only, root-path web session cookies. The jar never leaves this sample.
  for (const header of headers["set-cookie"] ?? []) {
    const [pair, ...attrs] = header.split(";").map(value => value.trim());
    const cookie = /^(molis-work-web-[\w-]+)=([\w-]*)$/.exec(pair);
    if (!cookie || !attrs.some(value => /^path=\/$/i.test(value)) || attrs.some(value => /^(?:domain=|secure$)/i.test(value))) continue;
    const [, name, value] = cookie;
    if (!value || attrs.some(value => /^max-age=(?:0|-\d+)$/i.test(value))) jar.delete(name);
    else jar.set(name, value);
  }
}

function linkedPaths(html, url) {
  const links = new Set();
  // Only actual link/script attributes, skipping inline JavaScript and comments.
  for (const tag of html.matchAll(/<!--[\s\S]*?-->|<script\b([^>]*)>[\s\S]*?<\/script\s*>|<link\b([^>]*)>/gi)) {
    const text = tag[1] ?? tag[2];
    if (!text) continue;
    const name = tag[1] === undefined ? "href" : "src";
    for (const [key, attribute] of attributes(text)) {
      if (key !== name) continue;
      const value = attribute.replaceAll("&amp;", "&");
      if (!value || value.startsWith("#")) break;
      const target = new URL(value, url);
      if (target.origin === url.origin) links.add(target.pathname + target.search);
      break;
    }
  }
  return links;
}

export async function sampleFirstScreen(origin, page, locale, registered, { signal, inspect = false }) {
  const samples = new Map();
  const label = `${page.id}/${locale}`;
  const scoped = registered.filter(entry => typeof entry !== "string");
  const documents = new Set(scoped.map(entry => entry.document));
  const jar = new Map([[LOCALE_COOKIE, locale]]);
  const proofs = new Map();
  async function ask(entry, options) {
    const key = requestKey(entry, options?.scoped?.document, options?.scoped?.response);
    try {
      const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
      const result = await request(origin, entry, cookie, signal, options);
      if (!ok(result.status) && !(options?.etag && result.status === 304)) throw new Error(`HTTP ${result.status}`);
      rememberSessionCookies(jar, result.headers);
      return result;
    } catch (error) {
      signal.throwIfAborted();
      throw new Error(`${label} GET ${key}: ${error.message}`, { cause: error });
    }
  }

  function rememberDocument(entry, result) {
    if (!documents.has(entry)) return;
    const tokens = isHtml(result.headers) ? pageSessionProofs(result.body.toString("utf8")) : [];
    if (result.status !== 200 || tokens.length !== 1 || !/^[\w-]+\.[\w-]+$/.test(tokens[0])) {
      throw new Error(`${label}: expected a single page-session proof from ${entry}`);
    }
    proofs.set(entry, tokens[0]);
  }

  async function read(entry) {
    if (samples.has(entry)) return;
    const cold = await ask(entry, { inspect });
    const sample = { cold };
    samples.set(entry, sample);
    if (entry === page.path && !isHtml(cold.headers)) throw new Error(`${label}: expected an HTML document at ${entry}`);
    rememberDocument(entry, cold);
    if (isHtml(cold.headers)) {
      sample.links = linkedPaths(cold.body.toString("utf8"), new URL(origin + entry));
      for (const path of sample.links) await read(path);
    }
  }

  const validator = cold => /(?:^|,)\s*no-store\s*(?:,|$)/i.test(cold.headers["cache-control"] ?? "") ? undefined : cold.headers.etag;
  async function readScoped(visit) {
    for (const { path, document, response } of scoped) {
      const key = requestKey(path, document, response);
      const proof = proofs.get(document);
      if (!proof) throw new Error(`${label}: missing source document ${document} for ${path}`);
      if (jar.size === 1) throw new Error(`${label}: missing web session cookie for ${path}`);
      const sample = samples.get(key) ?? { path, document, response };
      const etag = visit === "warm" && response !== SSE_FIRST_EVENT ? validator(sample.cold) : undefined;
      sample[visit] = await ask(path, { inspect: visit === "cold" && inspect, etag, scoped: { document, response, proof } });
      samples.set(key, sample);
    }
  }

  await read(page.path);
  for (const entry of registered) if (typeof entry === "string") await read(entry);
  await readScoped("cold");
  proofs.clear();
  for (const [entry, sample] of samples) {
    if (sample.document) continue;
    const etag = documents.has(entry) ? undefined : validator(sample.cold);
    sample.warm = await ask(entry, { etag });
    rememberDocument(entry, sample.warm);
  }
  await readScoped("warm");
  return samples;
}
