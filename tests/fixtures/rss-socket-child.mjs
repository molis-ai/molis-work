import assert from "node:assert/strict";
import dns from "node:dns";
import tls from "node:tls";
import { getEventListeners } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { createAllowlistedRssTransport } from "@molis-ai/molis-work-integration-rss/host";

const config = JSON.parse(process.argv[2]);
const hostname = "rss-socket.example", controller = new AbortController(), sockets = new Set();
const observed = { policyLookups: 0, socketLookups: 0, pinned: [], connections: 0, fallbackFetch: 0, rejectUnauthorized: [], servernames: [], responseBodyObserved: false };
const originalLookup = dns.lookup, originalConnect = tls.connect;
let releaseDns;
let result;
let error;
// An unpinned connector sees a loopback answer after the policy check.
dns.lookup = (host, options, callback) => {
  assert.equal(host, hostname);
  observed.socketLookups++;
  const done = typeof options === "function" ? options : callback;
  queueMicrotask(() => typeof options === "object" && options.all
    ? done(null, [{ address: "127.0.0.1", family: 4 }]) : done(null, "127.0.0.1", 4));
};
tls.connect = function(options, ...args) {
  assert.ok(options && typeof options === "object", "unexpected TLS overload");
  assert.equal(options.host ?? options.hostname, hostname);
  assert.equal(Number(options.port), 443);
  observed.connections++; observed.rejectUnauthorized.push(options.rejectUnauthorized); observed.servernames.push(options.servername);
  let pinned;
  if (options.lookup) options.lookup(hostname, {}, (failure, address, family) => {
    assert.equal(failure, null); pinned = { address, family };
  });
  observed.pinned.push(pinned ?? null);
  const approved = pinned?.family === 4 && ["8.8.8.8", "198.18.0.1"].includes(pinned.address);
  // Wire mapping only: the production lookup still chooses the destination and is called again by the connector.
  const lookup = options.lookup ? (host, opts, done) => options.lookup(host, opts, (failure, address, family) => {
    assert.equal(failure, null);
    if (Array.isArray(address)) { assert.deepEqual(address, [pinned]); done(null, [{ address: "127.0.0.1", family: 4 }]); }
    else { assert.equal(address, pinned.address); assert.equal(family, pinned.family); done(null, "127.0.0.1", 4); }
  }) : undefined;
  const socket = originalConnect.call(this, { ...options, port: approved ? config.publicPort : config.privatePort, ...(lookup ? { lookup } : {}) }, ...args);
  socket.on("data", bytes => {
    if (config.mode === "response-cancel" && !observed.responseBodyObserved && bytes.includes(Buffer.from("<rss>"))) {
      observed.responseBodyObserved = true;
      // This is decrypted response data from the real server. Let its HTTP parser/reader process this turn, then cancel.
      setImmediate(() => controller.abort(new Error("fixture response cancelled")));
    }
  });
  sockets.add(socket); socket.once("close", () => sockets.delete(socket));
  return socket;
};
syncBuiltinESMExports();
const lookup = async host => {
  assert.equal(host, hostname); observed.policyLookups++;
  if (config.mode === "dns-cancel") {
    setTimeout(() => controller.abort(new Error("fixture DNS cancelled")), 10);
    return new Promise(resolve => { releaseDns = resolve; });
  }
  return config.answers ?? ["8.8.8.8"];
};
const transport = createAllowlistedRssTransport(config.mode === "catalog" ? [`https://${hostname}/rss`] : [], async () => {
  observed.fallbackFetch++;
  return new Response('<rss><channel><title>Catalog fixture</title></channel></rss>', { headers: { "content-type": "application/rss+xml" } });
}, { userAgent: "molis-rss-socket-test", allowCustomPublicFeeds: true, lookup,
  isPublicChannelFeed: config.mode === "youtube" ? url => url === `https://${hostname}/rss` : undefined,
  conditional: { etag: '"rss-v1"', lastModified: "Tue, 13 Oct 2026 00:00:00 GMT" },
  onReceipt(receipt) { observed.receipt = receipt; },
});
const path = config.path ?? "/rss";
const pending = transport.execute({ appId: "rss-socket-test", binding: { providerId: "rss", transportProfileId: "fixture" },
  request: { providerId: "rss", operation: "ingest", body: { feedUrl: `https://${hostname}${path}` } }, signal: controller.signal });
try { result = await pending; }
catch (failure) { error = { code: failure?.code, message: String(failure?.message ?? failure) }; }
finally {
  observed.abortListeners = getEventListeners(controller.signal, "abort").length;
  if (releaseDns) { releaseDns(["127.0.0.1"]); await new Promise(resolve => setImmediate(resolve)); }
  observed.openSockets = sockets.size;
  for (const socket of sockets) socket.destroy();
  dns.lookup = originalLookup; tls.connect = originalConnect; syncBuiltinESMExports();
}
process.stdout.write(JSON.stringify({ result, error, observed }) + "\n");
