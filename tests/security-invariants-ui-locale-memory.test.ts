import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { LOCALE_COOKIE, readUiLocale, UI_LOCALE_RELATIVE_PATH } from "@molis-ai/molis-work-app-local-host";
// The production single-Home core: the installation's front door shows sign-in until an account is chosen, then hands each request to the chosen Home's core, so this is where `/locale` runs.
import { createSingleHomeTestWebServer } from "./fixtures/local-web-core.js";

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
