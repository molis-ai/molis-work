import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import { isHostEndpointPort, readMaterialLocalPage, trackHostChildEndpoint, trackHostPort } from "@molis-ai/molis-work-app-local-host";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { grantLocalOriginal, localOriginalProbe } from "./fixtures/materials-local-original.js";

const PAGE = `<html><head><title>本机页面</title></head><body><article><p>${"这是一个只在本机提供的页面，正文足够长，用来检查读取。".repeat(6)}</p></article></body></html>`;

/** A page server on this machine's loopback that counts every request it receives. */
async function listen(t: TestContext, route: (path: string) => { status?: number; headers?: Record<string, string>; body?: string } = () => ({})) {
  const hits: string[] = [];
  const server = createServer((request, response) => {
    hits.push(request.url ?? "");
    const answer = route(request.url ?? "/");
    response.writeHead(answer.status ?? 200, answer.headers ?? { "content-type": "text/html; charset=utf-8" });
    response.end(answer.body ?? PAGE);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return { hits, port: (server.address() as AddressInfo).port };
}

test("S-45 a plugin that did not declare materials:fetch_local has no local-page method, and one that declared only materials:fetch still reads public addresses only", { timeout: 60_000 }, async t => {
  const none = localOriginalProbe("localnone", { permissions: [] }), fetchOnly = localOriginalProbe("localfetchonly", { permissions: ["materials:fetch"] });
  const { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [none.definition, fetchOnly.definition] } });
  await grantLocalOriginal(host, none); await grantLocalOriginal(host, fetchOnly);
  const page = await listen(t);
  assert.equal(none.contexts.at(-1)!.services!.materials, undefined);
  const service = fetchOnly.contexts.at(-1)!.services!.materials!;
  assert.equal(service.readLocalPage, undefined);
  assert.deepEqual(Object.keys(service), ["readSource"]);
  // The public reader, which the plugin did declare, is as before: this machine's address is not public.
  for (const [url, code] of [["http://127.0.0.1/", "material.source.private_address"], [`http://127.0.0.1:${page.port}/page`, "material.source.invalid_url"], [`http://localhost:${page.port}/page`, "material.source.invalid_url"]] as const) {
    await assert.rejects(host.homeActionClient().invoke(person(fetchOnly.permissions), fetchOnly.source, { url }), { code }, url);
  }
  assert.deepEqual(page.hits, [], "nothing reached the local server");
});

test("S-45 a plugin that declared materials:fetch_local but was not granted it is refused before any request", { timeout: 60_000 }, async t => {
  const probe = localOriginalProbe("localungranted"), { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const { platform, install } = await grantLocalOriginal(host, probe), page = await listen(t);
  const url = `http://127.0.0.1:${page.port}/page`;
  assert.equal(((await host.homeActionClient().invoke(person(probe.permissions), probe.local, { url })) as { text: string }).text.includes("只在本机提供"), true, "granted: the page is read");
  assert.equal(page.hits.length, 1);
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, ["storage:private", "materials:fetch"]);
  await platform.supervisor.restart(probe.id);
  await assert.rejects(host.homeActionClient().invoke(person(probe.permissions), probe.local, { url }), { code: "actions.plugin_permission" });
  assert.equal(page.hits.length, 1, "revoked: no second request");
});

test("S-45 only plain http to 127.0.0.1, [::1] or localhost without credentials is a local page; every other address is refused before anything is sent", { timeout: 60_000 }, async t => {
  const probe = localOriginalProbe("localrange"), { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantLocalOriginal(host, probe);
  const page = await listen(t), caller = person(probe.permissions);
  const refused = [
    "http://192.168.1.10/", "http://10.0.0.5/", "http://172.16.0.1/", "http://169.254.169.254/latest/meta-data/", "http://100.64.0.1/",
    `http://127.0.0.2:${page.port}/page`, `http://127.1.2.3:${page.port}/page`, `http://0.0.0.0:${page.port}/page`,
    `http://[::ffff:127.0.0.1]:${page.port}/page`, "http://[fe80::1]/", "http://[fd00::1]/", "http://[::]/",
    `http://foo.localhost:${page.port}/page`, `http://localhost.example.com:${page.port}/page`, "http://example.com/", "http://93.184.216.34/",
    `https://127.0.0.1:${page.port}/page`, `http://user:secret@127.0.0.1:${page.port}/page`, `http://user@localhost:${page.port}/page`,
    "ftp://127.0.0.1/", "file:///etc/hosts", "javascript:void(0)",
  ];
  for (const url of refused) await assert.rejects(host.homeActionClient().invoke(caller, probe.local, { url }), { code: "material.local_page.not_local" }, url);
  await assert.rejects(host.homeActionClient().invoke(caller, probe.local, { url: "not a url" }), { code: "material.url" });
  assert.deepEqual(page.hits, [], "not one of them reached the local server");
  for (const url of [`http://127.0.0.1:${page.port}/page`, `http://localhost:${page.port}/page`]) {
    const read = await host.homeActionClient().invoke(caller, probe.local, { url }) as { text: string };
    assert.ok(read.text.includes("只在本机提供"), url);
  }
  assert.equal(page.hits.length, 2);
});

test("S-45 the Host's own port is refused under every loopback spelling, while another local port is read", { timeout: 60_000 }, async t => {
  const probe = localOriginalProbe("localown"), { host, origin } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantLocalOriginal(host, probe);
  const own = new URL(origin).port, page = await listen(t), caller = person(probe.permissions);
  assert.equal(isHostEndpointPort(Number(own)), true, "the Host's web entry is recorded while it listens");
  assert.equal(isHostEndpointPort(page.port), false);
  for (const spelling of ["127.0.0.1", "localhost", "[::1]"]) {
    for (const path of ["/", "/api/projects", "/assets/workbench.js"]) {
      await assert.rejects(host.homeActionClient().invoke(caller, probe.local, { url: `http://${spelling}:${own}${path}` }), { code: "material.local_page.own_endpoint" }, `${spelling}${path}`);
    }
  }
  assert.equal(((await host.homeActionClient().invoke(caller, probe.local, { url: `http://127.0.0.1:${page.port}/page` })) as { text: string }).text.includes("只在本机提供"), true);
});

test("S-45 a Host port stops being the Host's when its server closes, and a port two owners hold is kept until both release", () => {
  const port = 61_234 + (process.pid % 1000);
  assert.equal(isHostEndpointPort(port), false);
  const first = trackHostPort(port), second = trackHostPort(port);
  assert.equal(isHostEndpointPort(port), true);
  first(); first();
  assert.equal(isHostEndpointPort(port), true, "releasing twice does not drop the other owner's entry");
  second();
  assert.equal(isHostEndpointPort(port), false);
  for (const bad of [0, -1, 70_000, 1.5, Number.NaN]) { trackHostPort(bad)(); assert.equal(isHostEndpointPort(bad), false); }
});

test("S-45 the debugging port of a browser the Host started is the Host's own until that process exits", { timeout: 30_000 }, async t => {
  const port = 62_345 + (process.pid % 1000);
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  trackHostChildEndpoint(`ws://127.0.0.1:${port}/devtools/browser/${randomUUID()}`, child);
  assert.equal(isHostEndpointPort(port), true);
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill(); await exited;
  assert.equal(isHostEndpointPort(port), false);
  trackHostChildEndpoint("not an endpoint", child); trackHostChildEndpoint(`ws://127.0.0.1:${port}/x`, child);
  assert.equal(isHostEndpointPort(port), false, "a process that already exited holds no port");
});

test("S-45 a redirect from a local page is held to the same rules, so a page cannot lead the reader anywhere else", { timeout: 60_000 }, async t => {
  const probe = localOriginalProbe("localredirect"), { host, origin } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantLocalOriginal(host, probe);
  const target = await listen(t), own = new URL(origin).port;
  const to = (location: string) => ({ status: 302, headers: { location, "content-type": "text/html" }, body: "" });
  const start = await listen(t, path => ({
    "/to-other": to(`http://127.0.0.1:${target.port}/landed`), "/to-public": to("http://example.com/"), "/to-https": to(`https://127.0.0.1:${target.port}/landed`),
    "/to-127-2": to(`http://127.0.0.2:${target.port}/landed`), "/to-own": to(`http://127.0.0.1:${own}/api/projects`), "/to-credentials": to(`http://user:pw@127.0.0.1:${target.port}/landed`),
    "/to-private": to("http://192.168.1.10/"), "/loop": to("/loop"),
  } as Record<string, ReturnType<typeof to>>)[path] ?? {});
  const caller = person(probe.permissions), read = (path: string) => host.homeActionClient().invoke(caller, probe.local, { url: `http://127.0.0.1:${start.port}${path}` });
  const followed = await read("/to-other") as { text: string };
  assert.ok(followed.text.includes("只在本机提供")); assert.deepEqual(target.hits, ["/landed"]);
  target.hits.length = 0;
  for (const path of ["/to-public", "/to-https", "/to-127-2", "/to-credentials", "/to-private"]) await assert.rejects(read(path), { code: "material.local_page.not_local" }, path);
  await assert.rejects(read("/to-own"), { code: "material.local_page.own_endpoint" });
  await assert.rejects(read("/loop"), { code: "material.redirect" });
  assert.deepEqual(target.hits, [], "no redirect reached a server the rules refuse");
});

test("S-45 localhost is connected only at loopback addresses its resolver returns, and any other answer refuses the page", async t => {
  const page = await listen(t), url = `http://localhost:${page.port}/page`;
  for (const answers of [[{ address: "192.168.1.9", family: 4 }], [{ address: "127.0.0.1", family: 4 }, { address: "10.1.2.3", family: 4 }], [{ address: "::ffff:127.0.0.1", family: 6 }], [{ address: "localhost", family: 4 }], []]) {
    await assert.rejects(readMaterialLocalPage(url, { lookup: async () => answers }), { code: "material.local_page.not_local" }, JSON.stringify(answers));
  }
  await assert.rejects(readMaterialLocalPage(url, { lookup: async () => { throw new Error("no such host"); } }), { code: "material.local_page.not_local" });
  assert.deepEqual(page.hits, []);
  const read = await readMaterialLocalPage(url, { lookup: async () => [{ address: "127.0.0.1", family: 4 }] });
  assert.ok(read.text.includes("只在本机提供")); assert.equal(page.hits.length, 1);
});

test("S-45 a cancelled call, or one the Runtime stops at the last check, sends nothing to the local server", async t => {
  const page = await listen(t), url = `http://127.0.0.1:${page.port}/page`, aborted = new AbortController();
  aborted.abort();
  await assert.rejects(readMaterialLocalPage(url, { signal: aborted.signal }), { name: "AbortError" });
  await assert.rejects(readMaterialLocalPage(url, { beforeDispatch: () => { throw Object.assign(new Error("revoked"), { code: "actions.forbidden" }); } }), { code: "actions.forbidden" });
  assert.deepEqual(page.hits, []);
});
