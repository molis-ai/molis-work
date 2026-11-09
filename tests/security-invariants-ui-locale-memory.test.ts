import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { LOCALE_COOKIE, readUiLocale, UI_LOCALE_RELATIVE_PATH, WebSessions } from "@molis-ai/molis-work-app-local-host";
import { readPluginRuntimeRecords } from "@molis-ai/molis-work-plugin-runtime";
// The production single-Home core: the installation's front door shows sign-in until an account is chosen, then hands each request to the chosen Home's core, so this is where `/locale` runs.
import { createSingleHomeTestWebServer } from "./fixtures/local-web-core.js";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";

async function shellHeaders(origin: string) {
  const shell = await fetch(origin + "/settings/appearance", { headers: { "accept-language": "zh-CN" } });
  assert.equal(shell.status, 200);
  const cookie = shell.headers.getSetCookie().find(value => value.startsWith("molis-work-web-"))?.split(";")[0];
  const proof = /<meta name="molis-work-page-session" content="([^"]+)"/u.exec(await shell.text())?.[1];
  assert.ok(cookie && proof);
  return { cookie, "x-molis-work-page-session": proof, "accept-language": "zh-CN" };
}

async function startHost(t: TestContext) {
  const home = await mkdtemp(join(os.tmpdir(), "security-invariants-ui-locale-"));
  const server = createSingleHomeTestWebServer({ homeDirectory: home, controlToken: "ui-locale-control-token-0123456789" });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  });
  return { home, port: (server.address() as AddressInfo).port };
}

/** A GET with exactly the headers given: a page in a browser would attach `Sec-Fetch-Site` itself, and `fetch` here would not let a test choose it. */
function get(port: number, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; cookie: string }>((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, method: "GET", path, agent: false, headers: { host: `127.0.0.1:${port}`, ...headers } }, response => {
      response.resume();
      response.on("end", () => resolve({ status: response.statusCode ?? 0, cookie: String(response.headers["set-cookie"] ?? "") }));
    });
    request.on("error", reject);
    request.end();
  });
}

test("S-ui-locale-memory a language switch not made by the page itself leaves the Home's record alone: cross-site, same-site, none, no header (FSS-71)", { timeout: 60_000 }, async t => {
  const { home, port } = await startHost(t);
  for (const [what, headers] of [
    ["a foreign page's <img>", { "sec-fetch-site": "cross-site" }],
    ["a sibling site", { "sec-fetch-site": "same-site" }],
    ["a typed address or bookmark", { "sec-fetch-site": "none" }],
    ["a client with no such header", {}],
  ] as const) {
    const answer = await get(port, "/locale?lang=en&next=%2F", headers);
    assert.equal(answer.status, 302, what);
    assert.match(answer.cookie, new RegExp(`${LOCALE_COOKIE}=en`), `${what}: the browser's own Cookie goes as before`);
    assert.equal(readUiLocale(home), null, `${what}: the record is not written`);
    assert.equal(existsSync(join(home, UI_LOCALE_RELATIVE_PATH)), false, `${what}: nor the file`);
  }
});

test("S-ui-locale-memory the page itself moves the record, but only by naming a language: what the switch works out by itself does not count", { timeout: 60_000 }, async t => {
  const { home, port } = await startHost(t);
  const own = { "sec-fetch-site": "same-origin" };
  // No language, or one it does not know: the response picks one from the Cookie and the browser, and the person chose nothing.
  for (const path of ["/locale?next=%2F", "/locale?lang=fr&next=%2F", "/locale?lang=en%0AIgnore&next=%2F"]) {
    assert.equal((await get(port, path, { ...own, "accept-language": "en-US" })).status, 302, path);
    assert.equal(readUiLocale(home), null, `${path}: not written`);
    assert.equal(existsSync(join(home, UI_LOCALE_RELATIVE_PATH)), false, `${path}: nor the file`);
  }
  await get(port, "/locale?lang=en&next=%2F", own);
  assert.equal(readUiLocale(home), "en", "the page's own switch does");
  await get(port, "/locale?lang=zh&next=%2F", { "sec-fetch-site": "cross-site" });
  assert.equal(readUiLocale(home), "en", "and a foreign one afterwards does not undo it");
  // Reading a page, with whatever language it asks for, moves nothing.
  await get(port, "/health", { ...own, cookie: `${LOCALE_COOKIE}=zh` });
  assert.equal(readUiLocale(home), "en");
});

test("S-ui-locale-memory FSS-20 only an outer shell can preview or commit a language choice", { timeout: 60_000 }, async t => {
  const f = await serveHomeRuntime(t);
  const headers = await shellHeaders(f.origin), { cookie } = headers;
  const present = (more: Record<string, string>) => f.request("/settings/appearance", { authorized: false, headers: { ...more, "x-molis-work-ui-locale": "en" } });
  const unproven = await present({});
  assert.equal(unproven.status, 403);
  assert.deepEqual(unproven.headers.getSetCookie(), [], "a refused preview cannot issue a page session either");
  assert.equal((await present({ cookie })).status, 403);
  assert.equal((await present({ ...headers, "x-molis-context-page": "forged" })).status, 403);
  const display = await present(headers);
  assert.equal(display.status, 200);
  assert.match(await display.text(), /<html lang="en"/u);
  assert.deepEqual(display.headers.getSetCookie(), []);
  assert.equal(readUiLocale(f.home), null, "previewing an English document writes neither preference nor remembered language");
  const commit = (extra: Record<string, string> = {}) => f.request("/api/ui/locale", { authorized: false, method: "POST", headers: { ...headers, ...extra }, body: { preference: "en" } });
  assert.equal((await commit({ origin: "https://elsewhere.invalid" })).status, 403);
  assert.equal((await commit({ "x-molis-plugin-page": "forged" })).status, 403);
  assert.equal(readUiLocale(f.home), null);
  const saved = await commit({ "x-molis-work-idempotency-key": "once-language-selection" });
  assert.equal(saved.status, 200);
  assert.equal(readUiLocale(f.home), "en");
  const preference = saved.headers.getSetCookie().find(value => value.startsWith(LOCALE_COOKIE + "="))?.split(";")[0];
  assert.ok(preference);
  assert.equal((await commit({ "x-molis-work-idempotency-key": "once-language-selection" })).status, 409);
  const read = await f.request("/api/ui/locale", { authorized: false, headers: { ...headers, cookie: cookie + "; " + preference } });
  assert.deepEqual(await read.json(), { preference: "en", tag: "en", source: "explicit" });
});

test("S-ui-locale-memory FSS-20 project preview cannot initialize unopened plugin owners in a ready runtime", { timeout: 60_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("A project with no started plugins");
  const headers = await shellHeaders(f.origin), route = `/projects/${encodeURIComponent(project.project_id)}/`;
  // The actual Host runtime, without Molis Work's project-action or installed-plugin preparation.
  await f.host.client(project.reference).withScope(() => undefined);
  assert.equal(f.host.projects().find(row => row.project_id === project.project_id)?.state, "ready");
  const db = new DatabaseSync(project.database_path, { readOnly: true });
  t.after(() => db.close());
  const version = () => db.prepare("PRAGMA data_version").get()?.data_version;
  const before = version();
  assert.deepEqual(readPluginRuntimeRecords(db), []);
  const present = () => f.request(route, { authorized: false, headers: { ...headers, "x-molis-work-ui-locale": "en" } });
  const denied = await present();
  assert.equal(denied.status, 503, await denied.text());
  assert.deepEqual(denied.headers.getSetCookie(), []);
  assert.equal(version(), before, "no project writes, including installation/authoring initialization");
  assert.deepEqual(readPluginRuntimeRecords(db), [], "the preview did not start Goals or any other plugin");
  assert.equal(readUiLocale(f.home), null);
  const opened = await f.request(route, { authorized: false, headers });
  assert.equal(opened.status, 200, await opened.text());
  assert.ok(readPluginRuntimeRecords(db).some(row => row.state === "running"));
  const afterOpening = version(), prepared = await present();
  assert.equal(prepared.status, 200, await prepared.clone().text());
  assert.match(await prepared.text(), /<html lang="en"/u);
  assert.equal(version(), afterOpening, "the same production page can be drawn from the already prepared owners without a write");
});

test("S-ui-locale-memory FSS-20 a commit waiting for its body cannot survive revocation of that page session", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(os.tmpdir(), "security-invariants-ui-locale-revoke-"));
  const sessions = new WebSessions(home), bodyRead = deferred();
  const bind = sessions.bind.bind(sessions);
  t.mock.method(sessions, "bind", (...args: Parameters<typeof bind>) => {
    bind(...args);
    const request = args[0];
    if (request.method === "POST" && request.url === "/api/ui/locale") request.once("resume", bodyRead.resolve);
  });
  const f = await serveHomeRuntime(t, { homeDirectory: home }, { webSessions: sessions });
  const headers = await shellHeaders(f.origin);
  const request = http.request(f.origin + "/api/ui/locale", { method: "POST", headers: { ...headers, origin: f.origin, "content-type": "application/json", "x-molis-work-idempotency-key": "language-body-waiting" } });
  t.after(() => request.destroy());
  const finished = new Promise<number>(resolve => {
    request.once("response", response => { response.resume(); resolve(response.statusCode ?? 0); });
    request.once("error", () => resolve(0));
  });
  request.write('{"preference":');
  await bodyRead.promise;
  sessions.revokeScope(f.token);
  request.end('"en"}');
  assert.ok([0, 403].includes(await finished), "the revoked transport must close or refuse");
  assert.equal(readUiLocale(f.home), null);
  assert.equal(existsSync(join(f.home, UI_LOCALE_RELATIVE_PATH)), false);
});
