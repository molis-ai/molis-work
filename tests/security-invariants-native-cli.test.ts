import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connectorCliActions, connectorManagementActions, installManagedConnectorTool, removeManagedConnectorTool, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { openTestHome } from "./fixtures/test-home.js";

const execute = promisify(execFile), control = { beforeEffect() {} };
const url = "https://github.com/cli/cli/releases/download/v1.2.3/fixture.tar.gz";
const caller: ActionCallContext = { actor_id: "native-installer", audience: "agent", project_id: null, permissions: ["connectors:management:read", "connectors:management:write"] };
const checksum = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function archive(home: string, name: string, contents: (directory: string) => void) {
  const directory = join(home, name); mkdirSync(directory); contents(directory);
  const path = join(home, `${name}.tar.gz`); await execute("/usr/bin/tar", ["-czf", path, "bin"], { cwd: directory });
  return readFileSync(path);
}

test("S-36 ASC-07 ASC-14 ASC-22: official native bytes are checked and only the selected regular executable belongs to the managed installation", async t => {
  const home = await openTestHome(t);
  const bytes = await archive(home.home, "good", directory => {
    mkdirSync(join(directory, "bin"));
    writeFileSync(join(directory, "bin/fixture"), "#!/bin/sh\nprintf 'fixture 1.2.3'\n", { mode: 0o644 });
    writeFileSync(join(directory, "bin/unselected"), "must not be extracted");
  });
  const fetch = globalThis.fetch; t.after(() => { globalThis.fetch = fetch; });
  globalThis.fetch = async input => { assert.equal(String(input), url); return new Response(new Uint8Array(bytes)); };
  const source = { kind: "native" as const, package: "official/fixture", version: "1.2.3", bin: "fixture", url, sha256: checksum(bytes), entry: "bin/fixture" };
  const installed = await installManagedConnectorTool(home.home, source, control);
  assert.equal((await execute(installed.executable, ["--version"], { cwd: installed.directory, env: { PATH: "/usr/bin:/bin" } })).stdout, "fixture 1.2.3");
  assert.equal(existsSync(join(installed.directory, "release/bin/unselected")), false);
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  assert.equal(removeManagedConnectorTool(home.home, installed.id), "removed");
  assert.equal(existsSync(join(home.home, "good/bin/unselected")), true);
  for (const changed of [{ sha256: "0".repeat(64) }, { entry: "../outside" }, { entry: "/tmp/outside" }, { url: "https://untrusted.example/fixture" }, { url: "https://api.hubapi.com/hub/cli/backend/hub-cli/latest/hubspot-darwin-arm64.bin" }]) {
    await assert.rejects(installManagedConnectorTool(home.home, { ...source, ...changed }, control));
    assert.deepEqual(readdirSync(join(home.home, "runtime/connectors/installs")), []);
  }
});

test("S-36 ASC-07 ASC-14 ASC-22: HubSpot cannot prepare a managed install from a mutable release", async t => {
  const home = await openTestHome(t);
  const fetch = globalThis.fetch; t.after(() => { globalThis.fetch = fetch; });
  let reads = 0;
  globalThis.fetch = async () => { reads++; throw new Error("HubSpot preparation must not download mutable release metadata"); };
  await assert.rejects(home.host.homeActionClient().invoke(caller, connectorCliActions.prepare,
    { service_id: "hubspot", display_name: "HubSpot managed", version: "0.16.0" }), { code: "connector.connection.invalid" });
  assert.equal(reads, 0);
  assert.equal(existsSync(join(home.home, "runtime/connectors/installs")), false);
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
});

test("S-36 ASC-14: native archive links and off-provider redirects cannot execute or overwrite files", async t => {
  const home = await openTestHome(t), outside = join(home.home, "business-result"); writeFileSync(outside, "keep");
  const bytes = await archive(home.home, "linked", directory => { mkdirSync(join(directory, "bin")); symlinkSync(outside, join(directory, "bin/fixture")); });
  const fetch = globalThis.fetch; t.after(() => { globalThis.fetch = fetch; });
  const source = { kind: "native" as const, package: "official/fixture", version: "1.2.3", bin: "fixture", url, sha256: checksum(bytes), entry: "bin/fixture" };
  globalThis.fetch = async () => new Response(new Uint8Array(bytes));
  await assert.rejects(installManagedConnectorTool(home.home, source, control), /普通文件/);
  assert.equal(readFileSync(outside, "utf8"), "keep");
  const visited: string[] = [];
  globalThis.fetch = async input => { visited.push(String(input)); return new Response(null, { status: 302, headers: { location: "https://untrusted.example/code" } }); };
  await assert.rejects(installManagedConnectorTool(home.home, source, control), /官方发布源/);
  assert.deepEqual(visited, [url]); assert.deepEqual(readdirSync(join(home.home, "runtime/connectors/installs")), []);
});

test("S-36 ASC-07 ASC-14: native CLI preparation fixes official version, asset and checksum before install and refuses malformed release metadata", async t => {
  const home = await openTestHome(t), actions = home.host.homeActionClient();
  const fetch = globalThis.fetch; t.after(() => { globalThis.fetch = fetch; });
  const platform = process.platform === "linux" ? "linux" : "macOS", arch = process.arch === "x64" ? "amd64" : "arm64";
  const file = `gh_1.2.3_${platform}_${arch}.${process.platform === "linux" ? "tar.gz" : "zip"}`;
  let reads = 0, valid = true;
  globalThis.fetch = async input => {
    reads++; assert.equal(String(input), "https://api.github.com/repos/cli/cli/releases/tags/v1.2.3");
    return Response.json({ tag_name: "v1.2.3", assets: valid ? [{ name: file, browser_download_url: `https://github.com/cli/cli/releases/download/v1.2.3/${file}`, digest: `sha256:${"a".repeat(64)}` }] : [null] });
  };
  const input = { service_id: "github", display_name: "GitHub managed", version: "1.2.3" };
  await assert.rejects(actions.invoke(caller, connectorCliActions.prepare, { ...input, version: "latest" })); assert.equal(reads, 0);
  const prepared = await actions.invoke(caller, connectorCliActions.prepare, input) as { authorization_id: string; setup: { cli_setup: { sha256: string; entry: string; url: string } } };
  assert.equal(prepared.setup.cli_setup.sha256, "a".repeat(64));
  assert.equal(prepared.setup.cli_setup.entry, `gh_1.2.3_${platform}_${arch}/bin/gh`);
  assert.equal(prepared.setup.cli_setup.url, `https://github.com/cli/cli/releases/download/v1.2.3/${file}`);
  assert.equal(existsSync(join(home.home, "runtime/connectors/installs")), false);
  await actions.invoke(caller, connectorManagementActions.cancel, { authorization_id: prepared.authorization_id });
  valid = false; await assert.rejects(actions.invoke(caller, connectorCliActions.prepare, input), /元数据/);
});

// T-056: the official release endpoints can hand back a login page, an empty body or a truncated document. Each of those used to reach
// the caller as a raw JSON.parse failure; now the prepare action refuses it with the owner's declared install code and a Chinese sentence.
const REFUSED_AS_UNREADABLE = { code: "connector.install.failed", kind: "unavailable", message: "官方发布元数据读不出来，请检查网络后重试" } as const;
const UNREADABLE_BODIES = ["<!DOCTYPE html><html><body>Sign in</body></html>", "", "{\"tag_name\":\"v1.2.3\",\"assets\":["];

test("RAC-1515 release metadata that is not JSON is a declared install refusal for the GitHub client, and reads the release once", { timeout: 30_000 }, async t => {
  const home = await openTestHome(t), actions = home.host.homeActionClient();
  const fetch = globalThis.fetch; t.after(() => { globalThis.fetch = fetch; });
  const address = "https://api.github.com/repos/cli/cli/releases/tags/v1.2.3";
  let body = "", reads = 0;
  globalThis.fetch = async input => { reads += 1; assert.equal(String(input), address); return new Response(body, { status: 200 }); };
  const input = { service_id: "github", display_name: "GitHub managed", version: "1.2.3" };
  for (const [index, text] of UNREADABLE_BODIES.entries()) {
    body = text;
    const before = reads;
    await assert.rejects(actions.invoke(caller, connectorCliActions.prepare, input), (error: unknown) => {
      assert.ok(error instanceof ActionError, String(error));
      assert.equal(error.code, "connector.install.failed", `body ${index}`);
      assert.equal(error.kind, "unavailable", `body ${index}`);
      assert.equal(error.message, "官方发布元数据读不出来，请检查网络后重试", `body ${index}`);
      return true;
    });
    assert.equal(reads, before + 1, "one release read per attempt");
    assert.equal(existsSync(join(home.home, "runtime/connectors/installs")), false);
    assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  }
});

test("RAC-1516 the same unreadable release metadata is refused for the GitLab client, without asking for its checksum file", { timeout: 30_000 }, async t => {
  const home = await openTestHome(t), actions = home.host.homeActionClient();
  const fetch = globalThis.fetch; t.after(() => { globalThis.fetch = fetch; });
  const address = "https://gitlab.com/api/v4/projects/gitlab-org%2Fcli/releases/v1.2.3";
  let body = "", reads = 0;
  globalThis.fetch = async input => { reads += 1; assert.equal(String(input), address); assert.doesNotMatch(String(input), /checksums/); return new Response(body, { status: 200 }); };
  const input = { service_id: "gitlab", display_name: "GitLab managed", version: "1.2.3" };
  for (const [index, text] of UNREADABLE_BODIES.entries()) {
    body = text;
    const before = reads;
    await assert.rejects(actions.invoke(caller, connectorCliActions.prepare, input), (error: unknown) => {
      assert.ok(error instanceof ActionError, String(error));
      assert.equal(error.code, "connector.install.failed", `body ${index}`);
      assert.equal(error.kind, "unavailable", `body ${index}`);
      assert.equal(error.message, "官方发布元数据读不出来，请检查网络后重试", `body ${index}`);
      return true;
    });
    assert.equal(reads, before + 1, "only the release endpoint is read");
    assert.equal(existsSync(join(home.home, "runtime/connectors/installs")), false);
    assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  }
});

test("RAC-1517 legal JSON that is not an object, and an unavailable release source, keep their own declared refusals", { timeout: 30_000 }, async t => {
  const home = await openTestHome(t), actions = home.host.homeActionClient();
  const fetch = globalThis.fetch; t.after(() => { globalThis.fetch = fetch; });
  const address = "https://api.github.com/repos/cli/cli/releases/tags/v1.2.3";
  let body = "", status = 200;
  globalThis.fetch = async input => { assert.equal(String(input), address); return new Response(status === 200 ? body : null, { status }); };
  const input = { service_id: "github", display_name: "GitHub managed", version: "1.2.3" };
  for (const text of ["[]", "null", "\"text\"", "42"]) {
    body = text; status = 200;
    await assert.rejects(actions.invoke(caller, connectorCliActions.prepare, input), (error: unknown) => {
      assert.ok(error instanceof ActionError, String(error));
      assert.equal(error.code, "connector.install.failed");
      assert.equal(error.kind, "unavailable");
      assert.equal(error.message, "官方发布元数据格式无效");
      return true;
    });
  }
  status = 503;
  await assert.rejects(actions.invoke(caller, connectorCliActions.prepare, input), (error: unknown) => {
    assert.ok(error instanceof ActionError, String(error));
    assert.equal(error.code, "connector.install.failed");
    assert.equal(error.kind, "unavailable");
    assert.equal(error.message, "运行时下载失败，请检查官方发布源与网络");
    return true;
  });
});
