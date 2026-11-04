import { execFileSync } from "node:child_process";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { urlToHttpOptions } from "node:url";
import type { TestContext } from "node:test";

/** Real TLS transport for a registered service and a material page. Only DNS/socket routing changes, never the broker or service. */
export async function signedResourceHttps(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "t397-tls-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "key.pem", "-out", "cert.pem", "-days", "1",
    "-subj", "/CN=api.github.com", "-addext", "subjectAltName=DNS:api.github.com,DNS:docs.t397.example"], { cwd: directory, stdio: "ignore" });
  const cert = readFileSync(join(directory, "cert.pem"));
  const seen: Array<{ path: string; method: string; authorized: boolean }> = [];
  const article = "A real article served through TLS. Its words are long enough to exercise the production material reader and its extraction of a complete paragraph.";
  const server = https.createServer({ key: readFileSync(join(directory, "key.pem")), cert }, (request, response) => {
    seen.push({ path: request.url!, method: request.method!, authorized: request.headers.authorization === "Bearer dummy-t397-resource-credential" });
    if (request.url === "/redirect") { response.writeHead(302, { location: "https://outside.t397.example/page" }); response.end(); return; }
    if (request.url === "/large") { response.writeHead(200, { "content-type": "text/plain" }); response.end("x".repeat(1_100_000)); return; }
    if (request.headers.host?.startsWith("api.github.com")) {
      response.writeHead(200, { "content-type": "application/json", "set-cookie": "hidden=1" }); response.end('{"login":"resource-user"}');
    } else { response.writeHead(200, { "content-type": "text/html" }); response.end(`<article><p>${article}</p></article>`); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("TLS fixture did not listen");
  const hosts = new Set(["api.github.com", "docs.t397.example"]);
  const originalLookup = dns.lookup;
  t.mock.method(dns, "lookup", (hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
    if (!hosts.has(hostname)) return Reflect.apply(originalLookup, dns, [hostname, options, callback]);
    queueMicrotask(() => options?.all ? callback(null, [{ address: "93.184.216.34", family: 4 }]) : callback(null, "93.184.216.34", 4));
  });
  const originalPromises = dnsPromises.lookup;
  t.mock.method(dnsPromises, "lookup", async (hostname: string, options: dns.LookupOptions) => hosts.has(hostname)
    ? options?.all ? [{ address: "93.184.216.34", family: 4 }] : { address: "93.184.216.34", family: 4 }
    : Reflect.apply(originalPromises, dnsPromises, [hostname, options]));
  const request = https.request;
  t.mock.method(https, "request", (first: URL | https.RequestOptions, second: unknown, third?: unknown) => {
    const options = first instanceof URL ? { ...urlToHttpOptions(first), ...second as https.RequestOptions } : { ...first };
    const callback = first instanceof URL ? third : second;
    if (!hosts.has(String(options.hostname))) throw new Error("isolated TLS transport refuses an unexpected host");
    const lookup = options.lookup;
    // Retain production's pinned lookup and its final authority check, changing only the actual test socket's destination.
    const routedLookup = (_hostname: string, opts: dns.LookupOptions, done: (...args: unknown[]) => void) => {
      if (!lookup) throw new Error("production request has no pinned lookup");
      Reflect.apply(lookup, undefined, [_hostname, opts, (error: Error | null) => opts?.all
        ? done(error, [{ address: "127.0.0.1", family: 4 }]) : done(error, "127.0.0.1", 4)]);
    };
    return Reflect.apply(request, https, [{ ...options, port: address.port, ca: cert, lookup: routedLookup }, callback]);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  return { seen, article, server };
}
