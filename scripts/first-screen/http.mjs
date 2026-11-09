import { get } from "node:http";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { LOCALE_COOKIE } from "./host.mjs";

const isHtml = headers => /^text\/html(?:;|$)/i.test(headers["content-type"] ?? "");
const ok = status => status >= 200 && status < 300;

function decode(body, encoding) {
  if (encoding === "gzip") return gunzipSync(body);
  if (encoding === "br") return brotliDecompressSync(body);
  if (encoding === "deflate") return inflateSync(body);
  if (!encoding || encoding === "identity") return body;
  throw new Error(`unsupported Content-Encoding ${encoding}`);
}

function request(origin, entry, locale, signal, { etag, inspect } = {}) {
  // Each request gets a dedicated socket. Count the actual response octets before Node's HTTP parser
  // consumes them (status line, headers, transfer framing, encoded payload), including on a real 304.
  return new Promise((resolve, reject) => {
    let wire = 0;
    const headers = { cookie: `${LOCALE_COOKIE}=${locale}`, "accept-encoding": "gzip, br", connection: "close",
      ...(etag ? { "if-none-match": etag } : {}) };
    const client = get(origin + entry, {
      agent: false, headers, signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    }, response => {
      const chunks = [];
      if (ok(response.statusCode) && (inspect || isHtml(response.headers))) response.on("data", chunk => chunks.push(chunk));
      else response.resume();
      response.on("error", reject);
      response.on("end", () => {
        if (!response.complete || wire === 0) { reject(new Error("incomplete HTTP response")); return; }
        try {
          const body = chunks.length ? decode(Buffer.concat(chunks), response.headers["content-encoding"]) : Buffer.alloc(0);
          resolve({ status: response.statusCode, headers: response.headers, wire, body });
        } catch (error) { reject(error); }
      });
    });
    client.on("socket", socket => socket.prependListener("data", chunk => { wire += chunk.length; }));
    client.on("error", reject);
  });
}

function linkedPaths(html, url) {
  const links = new Set();
  // Only actual link/script attributes, skipping inline JavaScript and comments.
  for (const tag of html.matchAll(/<!--[\s\S]*?-->|<script\b([^>]*)>[\s\S]*?<\/script\s*>|<link\b([^>]*)>/gi)) {
    const attributes = tag[1] ?? tag[2];
    if (!attributes) continue;
    const name = tag[1] === undefined ? "href" : "src";
    for (const attribute of attributes.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/g)) {
      if (attribute[1].toLowerCase() !== name) continue;
      const value = (attribute[2] ?? attribute[3] ?? attribute[4]).replaceAll("&amp;", "&");
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
  async function ask(entry, options) {
    try {
      const result = await request(origin, entry, locale, signal, options);
      if (!ok(result.status) && !(options?.etag && result.status === 304)) throw new Error(`HTTP ${result.status}`);
      return result;
    } catch (error) {
      signal.throwIfAborted();
      throw new Error(`${label} GET ${entry}: ${error.message}`, { cause: error });
    }
  }

  async function read(entry) {
    if (samples.has(entry)) return;
    const cold = await ask(entry, { inspect });
    const sample = { cold };
    samples.set(entry, sample);
    if (entry === page.path && !isHtml(cold.headers)) throw new Error(`${label}: expected an HTML document at ${entry}`);
    if (isHtml(cold.headers)) {
      sample.links = linkedPaths(cold.body.toString("utf8"), new URL(origin + entry));
      for (const path of sample.links) await read(path);
    }
  }

  await read(page.path);
  for (const entry of registered) await read(entry);
  for (const [entry, sample] of samples) {
    const noStore = /(?:^|,)\s*no-store\s*(?:,|$)/i.test(sample.cold.headers["cache-control"] ?? "");
    sample.warm = await ask(entry, { etag: noStore ? undefined : sample.cold.headers.etag });
  }
  return samples;
}
