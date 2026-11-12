import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { homeHostUrl, readHostEndpoint, removeHostEndpoint, residentHostAddress, runtimeContextHostFromEnvironment, writeHostEndpoint } from "@molis-ai/molis-work-app-local-host";
import { createDesktopWebHost } from "@molis-ai/molis-work-app-desktop";

/** RES-07: the Home's address file — written once the Host listens, removed when it stops, no token in it, read before the default. */

async function home(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "molis-endpoint-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("RES-07 the installation's server writes the address file once it listens and removes it on close; the file names no token", async t => {
  const directory = await home(t), token = "endpoint-control-token-0123456789abcdef";
  const server: Server = createDesktopWebHost({ ptyClientFilePath: () => "/unused-for-http-test" })({ homeDirectory: directory, controlToken: token });
  assert.equal(readHostEndpoint(directory), null, "nothing before it listens");
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const written = readFileSync(join(directory, "run", "endpoint.json"), "utf8");
  assert.deepEqual(Object.keys(JSON.parse(written)).sort(), ["port", "process_id", "schema_version", "started_at"]);
  assert.doesNotMatch(written, new RegExp(token, "u"));
  assert.equal(readHostEndpoint(directory)?.port, address.port);
  assert.equal(homeHostUrl(directory), `http://127.0.0.1:${address.port}`);
  assert.ok(existsSync(join(directory, "run", "presence.json")), "the presence record starts with it");
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  assert.equal(existsSync(join(directory, "run", "endpoint.json")), false, "removed on a clean close");
  assert.notEqual(JSON.parse(readFileSync(join(directory, "run", "presence.json"), "utf8")).stopped_at, null, "and the stop is written");
});

test("RES-07 the address is MOLIS_WORK_WEB_URL, then the address file, then 4173; a file whose process is gone or that is not this version's is none", async t => {
  const directory = await home(t);
  assert.equal(homeHostUrl(directory), "http://127.0.0.1:4173");
  assert.equal(homeHostUrl(undefined), "http://127.0.0.1:4173");
  writeHostEndpoint(directory, 4190);
  assert.equal(homeHostUrl(directory), "http://127.0.0.1:4190");
  assert.equal(readHostEndpoint(directory, () => false), null, "a process that is gone");
  const previous = process.env.MOLIS_WORK_WEB_URL;
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_WEB_URL; else process.env.MOLIS_WORK_WEB_URL = previous; });
  delete process.env.MOLIS_WORK_WEB_URL;
  assert.equal(residentHostAddress(directory), "http://127.0.0.1:4190");
  process.env.MOLIS_WORK_WEB_URL = "http://127.0.0.1:4555";
  assert.equal(residentHostAddress(directory), "http://127.0.0.1:4555", "the variable comes first");
  const runtime = (environment: NodeJS.ProcessEnv) => runtimeContextHostFromEnvironment({ MOLIS_WORK_RUNTIME_ID: "codex", CODEX_THREAD_ID: "thread", ...environment }, "/");
  assert.equal(runtime({ MOLIS_WORK_HOME: directory })?.webBaseUrl, "http://127.0.0.1:4190", "the Runtime launcher reads the file of its Home");
  assert.equal(runtime({ MOLIS_WORK_HOME: directory, MOLIS_WORK_WEB_URL: "http://127.0.0.1:4555" })?.webBaseUrl, "http://127.0.0.1:4555");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(directory, "run", "endpoint.json"), JSON.stringify({ schema_version: 2, port: 4191, process_id: process.pid, started_at: "now" }));
  assert.equal(homeHostUrl(directory), "http://127.0.0.1:4173", "a shape this version did not write is not used");
  writeHostEndpoint(directory, 4192);
  removeHostEndpoint(directory);
  assert.equal(existsSync(join(directory, "run", "endpoint.json")), false);
});
