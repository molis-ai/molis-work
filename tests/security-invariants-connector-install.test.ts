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
