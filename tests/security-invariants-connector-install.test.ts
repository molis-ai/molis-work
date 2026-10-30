import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, readdirSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { installManagedConnectorTool, removeManagedConnectorTool } from "@molis-ai/molis-work-app-local-host";
import { openTestHome } from "./fixtures/test-home.js";

const input = { kind: "npm" as const, package: "fixture-package", version: "1.2.3", bin: "fixture-command", node_version: "24.99.99" };
const control = { beforeEffect() {} };

test("S-36 ASC-14: mutable package sources and credential-bearing registries are refused before any install effect", async t => {
  const home = await openTestHome(t); let effects = 0;
  for (const changed of [{ version: "latest" }, { version: "^1.2.3" }, { package: "https://example.com/pkg.tgz" }, { bin: "../escape" }, { entrypoint: "../escape" }, { entrypoint: "/tmp/escape" }, { registry: "https://person:fixture-secret@example.com/" }]) {
    await assert.rejects(installManagedConnectorTool(home.home, { ...input, ...changed }, { beforeEffect() { effects++; } }));
  }
  assert.equal(effects, 0); assert.equal(existsSync(join(home.home, "runtime/connectors")), false);
});

test("S-36 ASC-14: runtime checksum mismatch and foreign redirect are refused before archive execution", async t => {
  for (const mode of ["checksum", "redirect"] as const) {
    const home = await openTestHome(t); const requested: string[] = [];
    const archive = `node-v24.99.99-${process.platform}-${process.arch}.tar.gz`;
    const fetch = t.mock.method(globalThis, "fetch", async (url: URL | string | Request) => {
      requested.push(String(url));
      if (mode === "redirect") return new Response(null, { status: 302, headers: { location: "https://untrusted.example/runtime" } });
      return String(url).endsWith("SHASUMS256.txt") ? new Response(`${"0".repeat(64)}  ${archive}\n`) : new Response("not an authorized runtime archive");
    });
    try {
      await assert.rejects(installManagedConnectorTool(home.home, input, control), mode === "checksum" ? /校验失败/ : /官方发布源/);
      assert.equal(requested.length, mode === "checksum" ? 2 : 1);
      assert.deepEqual(readdirSync(join(home.home, "runtime/connectors/installs")), []);
      assert.deepEqual(readdirSync(join(home.home, "runtime/connectors/runtimes")).filter(name => name.startsWith("node-") || name.startsWith(".node-")), []);
    } finally { fetch.mock.restore(); }
  }
});

test("S-36 ASC-25: cancellation during a runtime download cannot unpack, execute or retain a candidate", async t => {
  const home = await openTestHome(t), controller = new AbortController();
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; entered.resolve(); await release.promise; return new Response("unneeded checksum"); });
  const pending = installManagedConnectorTool(home.home, input, { ...control, signal: controller.signal });
  const rejected = assert.rejects(pending, error => error === controller.signal.reason); await entered.promise; controller.abort(); release.resolve(); await rejected;
  assert.equal(requests, 1);
  assert.deepEqual(readdirSync(join(home.home, "runtime/connectors/installs")), []);
  assert.deepEqual(readdirSync(join(home.home, "runtime/connectors/runtimes")).filter(name => name.startsWith("node-") || name.startsWith(".node-")), []);
});

test("S-36 ASC-17: installation and cleanup refuse symlinks or a directory without matching ownership", async t => {
  const home = await openTestHome(t), outside = join(home.home, "person-owned"), marker = join(outside, "keep.txt");
  mkdirSync(outside); writeFileSync(marker, "business file"); mkdirSync(join(home.home, "runtime"), { recursive: true });
  symlinkSync(outside, join(home.home, "runtime/connectors"));
  await assert.rejects(installManagedConnectorTool(home.home, input, control), /链接/);
  assert.equal(existsSync(marker), true);
  const another = await openTestHome(t), id = "8fe2d9f4-f9a8-4cd0-bd86-4c96a73d0abc", directory = join(another.home, "runtime/connectors/installs", id);
  mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, "installation.json"), JSON.stringify({ id: "a different owner" }));
  writeFileSync(join(directory, "keep.txt"), "not ours");
  assert.throws(() => removeManagedConnectorTool(another.home, id), /所有权记录不符/);
  assert.equal(existsSync(join(directory, "keep.txt")), true);
});

// RAC-1493: a directory that exists without its ownership record is not an installation we can remove, and the refusal is
// the same declared invalid refusal every other "not our install" answer is — not the raw ENOENT the record read throws.
test("S-36 ASC-17 RAC-1493: a managed install directory without its ownership record is refused as a declared invalid install and left untouched", async t => {
  const home = await openTestHome(t), id = "0e3b1d6a-4b5f-4c47-9a58-2f0f9d6b9f11", directory = join(home.home, "runtime/connectors/installs", id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "keep.txt"), "not ours");
  assert.throws(() => removeManagedConnectorTool(home.home, id), { code: "connector.install.invalid", kind: "invalid" });
  assert.equal(existsSync(join(directory, "keep.txt")), true, "nothing in a directory we cannot own is removed");
});

function assertNoCandidate(home: string): void {
  assert.deepEqual(readdirSync(join(home, "runtime/connectors/installs")), [], "the candidate install directory is removed");
  assert.deepEqual(readdirSync(join(home, "runtime/connectors/runtimes")).filter(name => name.startsWith("node-") || name.startsWith(".node-")), [], "no runtime stage or half-unpacked runtime stays");
}

// RAC-1691: a download whose request cannot complete (offline, refused, the 120 s limit) is the declared install failure the response check
// beside it already raises, not the raw TypeError or TimeoutError fetch rejects with, and nothing of the candidate stays.
test("S-36 ASC-14 RAC-1691: a runtime download whose request fails or times out is refused as a declared install failure and retains nothing", async t => {
  for (const failure of [new TypeError("fetch failed"), new DOMException("The operation was aborted due to timeout", "TimeoutError")]) {
    const home = await openTestHome(t); let requests = 0;
    const fetch = t.mock.method(globalThis, "fetch", async () => { requests++; throw failure; });
    try {
      await assert.rejects(installManagedConnectorTool(home.home, input, control), { code: "connector.install.failed", kind: "unavailable", message: "运行时下载失败，请检查官方发布源与网络" });
      assert.equal(requests, 1, `${failure.name}: the first request is the only one`);
      assertNoCandidate(home.home);
    } finally { fetch.mock.restore(); }
  }
});

// RAC-1692: a body that breaks after the response began (undici rejects the read with "terminated") ends in the same declared failure.
test("S-36 ASC-14 RAC-1692: a runtime download whose body breaks mid-read is refused as a declared install failure and retains nothing", async t => {
  const home = await openTestHome(t); let requests = 0, pulls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Response(new ReadableStream<Uint8Array>({ pull(body) { if (pulls++ === 0) body.enqueue(Buffer.from("first part of the checksum list")); else body.error(new TypeError("terminated")); } }));
  });
  await assert.rejects(installManagedConnectorTool(home.home, input, control), { code: "connector.install.failed", kind: "unavailable", message: "运行时下载失败，请检查官方发布源与网络" });
  assert.equal(requests, 1);
  assert.equal(pulls, 2, "the body broke on the read after its first chunk");
  assertNoCandidate(home.home);
});

// RAC-1692: the size refusal sits in the same read loop. Only the read is wrapped, so a body over the limit keeps its own sentence.
test("S-36 ASC-14 RAC-1692: a runtime download over its size limit keeps its own refusal and retains nothing", async t => {
  const home = await openTestHome(t); let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return new Response(new Uint8Array(1024 * 1024 + 1)); });
  await assert.rejects(installManagedConnectorTool(home.home, input, control), { code: "connector.install.failed", kind: "unavailable", message: "运行时下载超过允许的大小" });
  assert.equal(requests, 1);
  assertNoCandidate(home.home);
});

// RAC-1693: the caller's own cancellation is not a download failure. Whichever moment it lands in, the request still pending or the body
// being read, the install rejects with the caller's reason itself. It passes before the change too; it keeps the two catches honest.
test("S-36 ASC-25 RAC-1693: cancellation while a runtime download is pending or being read rejects with the caller's reason, not a declared install failure", async t => {
  for (const moment of ["request", "body"] as const) {
    const home = await openTestHome(t), controller = new AbortController(), entered = Promise.withResolvers<void>(); let requests = 0;
    const fetch = t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
      requests++; const stop = init.signal!;
      if (moment === "request") return new Promise<Response>((_resolve, reject) => { stop.addEventListener("abort", () => reject(stop.reason), { once: true }); entered.resolve(); });
      return new Response(new ReadableStream<Uint8Array>({
        pull(body) { entered.resolve(); return new Promise<void>(done => stop.addEventListener("abort", () => { body.error(stop.reason); done(); }, { once: true })); },
      }, { highWaterMark: 0 }));
    });
    try {
      const pending = installManagedConnectorTool(home.home, input, { ...control, signal: controller.signal });
      const rejected = assert.rejects(pending, (error: unknown) => { assert.equal(error, controller.signal.reason, `${moment}: the caller's own reason, not a declared install failure`); return true; });
      await entered.promise; controller.abort(); await rejected;
      assert.equal(requests, 1);
      assertNoCandidate(home.home);
    } finally { fetch.mock.restore(); }
  }
});
