import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { channel } from "node:diagnostics_channel";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { crc32, deflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import type { Socket } from "node:net";
import type { TestContext } from "node:test";

export const IMAGE_DOMAIN = "images.t143.example";
// Independent 1x1 PNG bytes, never produced by the implementation under test.
export const IMAGE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");

/**
 * A real PNG of about `bytes` bytes (BL-918): RGB rows of seeded noise, stored without compression so the size is what was asked for, give or take
 * the headers. Built here, never by the implementation under test.
 */
export function noisePng(bytes: number, seed: number): Buffer {
  const width = 1024, stride = 1 + width * 3, height = Math.max(1, Math.round(bytes / stride));
  const raw = Buffer.alloc(stride * height);
  let state = seed >>> 0 || 1;
  for (let row = 0; row < height; row++) for (let i = 1; i < stride; i++) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; raw[row * stride + i] = state & 0xff; }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, "latin1");
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, tail]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 0 })), chunk("IEND", Buffer.alloc(0))]);
}

/** A decodable 1×1 baseline JPEG (JFIF, one quantisation and one Huffman table), the base `noiseJpeg` grows. */
const TINY_JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");

/**
 * A real JPEG of exactly `bytes` bytes (BL-918 B27-IMG-02): the 1×1 baseline picture above with comment segments (`FF FE`) of seeded noise put in after
 * its start marker, so it still decodes as that picture while its size is what was asked for. Built here, never by the implementation under test.
 */
export function noiseJpeg(bytes: number, seed: number): Buffer {
  const parts = [TINY_JPEG.subarray(0, 2)];
  let size = TINY_JPEG.length, state = seed >>> 0 || 1;
  while (size < bytes) {
    const length = Math.min(65_533, bytes - size - 4);
    if (length < 1) throw new Error(`noiseJpeg cannot make exactly ${bytes} bytes`);
    const segment = Buffer.alloc(4 + length);
    segment[0] = 0xff; segment[1] = 0xfe; segment.writeUInt16BE(length + 2, 2);
    for (let i = 0; i < length; i++) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; segment[4 + i] = state & 0xff; }
    parts.push(segment); size += segment.length;
  }
  return Buffer.concat([...parts, TINY_JPEG.subarray(2)]);
}

/** A real HTTPS image provider: process-local trust and exact DNS only. Fetch, TLS and Prologue remain production code. */
export async function signedImageProvider(t: TestContext, certificate: "trusted" | "untrusted" | "wrong-san") {
  const directory = mkdtempSync(join(tmpdir(), "signed-model-tls-"));
  const priorCAs = getCACertificates("default"), sockets = new Set<Socket>();
  // Covers certificate/setup failure too, before there is a provider or Host to close.
  t.after(() => { setDefaultCACertificates(priorCAs); rmSync(directory, { recursive: true, force: true }); });
  const lookups = { policy: 0, socket: 0 }, tlsErrors: string[] = [];
  const requests: Array<{ method: string | undefined; path: string | undefined; authorized: boolean; body: unknown }> = [];
  const reply = { images: [IMAGE_PNG] as Buffer[] };
  const run = (...args: string[]) => execFileSync("openssl", args, { cwd: directory, stdio: "ignore" });
  run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-days", "1", "-subj", "/CN=T143 isolated CA", "-addext", "basicConstraints=critical,CA:TRUE");
  run("req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=" + IMAGE_DOMAIN);
  writeFileSync(join(directory, "extensions"), `subjectAltName=DNS:${certificate === "wrong-san" ? "wrong.t143.example" : IMAGE_DOMAIN}\nextendedKeyUsage=serverAuth\n`);
  run("x509", "-req", "-in", "server.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "server.pem", "-days", "1", "-extfile", "extensions");
  if (certificate !== "untrusted") setDefaultCACertificates([...priorCAs, readFileSync(join(directory, "ca.pem"), "utf8")]);
  const answer = (host: string, options: number | dns.LookupOptions = {}) => {
    if (![IMAGE_DOMAIN, "127.0.0.1"].includes(host) || (typeof options === "number" ? options : options.family) === 6) throw Object.assign(new Error("fixture DNS refuses this name or family"), { code: "ENOTFOUND" });
    return typeof options === "object" && options.all ? [{ address: "127.0.0.1", family: 4 }] : { address: "127.0.0.1", family: 4 };
  };
  const policy = t.mock.method(dnsPromises, "lookup", async (host: string, options?: number | dns.LookupOptions) => { if (host === IMAGE_DOMAIN) lookups.policy++; return answer(host, options); });
  const socket = t.mock.method(dns, "lookup", (host: string, options: number | dns.LookupOptions | ((...args: unknown[]) => void), callback?: (...args: unknown[]) => void) => {
    if (host === IMAGE_DOMAIN) lookups.socket++; const done = typeof options === "function" ? options : callback!;
    queueMicrotask(() => {
      try { const result = answer(host, typeof options === "function" ? {} : options); if (Array.isArray(result)) done(null, result); else done(null, result.address, result.family); }
      catch (error) { done(error); }
    });
  });
  syncBuiltinESMExports();
  // Observe the real client's TLS error before Prologue gives it its public error code. No request or TLS method is replaced.
  const errors = channel("undici:request:error");
  const observe = (message: unknown) => {
    const item = message as { request?: { origin?: string }; error?: { code?: string; cause?: { code?: string } } };
    if (String(item.request?.origin).startsWith(`https://${IMAGE_DOMAIN}:`)) {
      const code = item.error?.cause?.code ?? item.error?.code;
      if (code) tlsErrors.push(code);
    }
  };
  errors.subscribe(observe);
  const server = createServer({ key: readFileSync(join(directory, "server.key")), cert: readFileSync(join(directory, "server.pem")) });
  server.on("connection", connection => { sockets.add(connection); connection.once("close", () => sockets.delete(connection)); });
  server.on("request", async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    requests.push({ method: request.method, path: request.url, authorized: request.headers.authorization === "Bearer image-fixture", body });
    if (request.method !== "POST" || request.url !== "/v1/images/generations") { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: reply.images.map(image => ({ b64_json: image.toString("base64") })) }));
  });
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    try {
      server.closeAllConnections(); for (const connection of sockets) connection.destroy();
      if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    } finally {
      errors.unsubscribe(observe); policy.mock.restore(); socket.mock.restore(); syncBuiltinESMExports();
      setDefaultCACertificates(priorCAs); rmSync(directory, { recursive: true, force: true });
    }
  };
  t.after(close); // Also restore DNS, diagnostics and sockets when listen/setup fails before returning a provider.
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  return { origin: `https://${IMAGE_DOMAIN}:${address.port}`, lookups, requests, tlsErrors, close, reply };
}
