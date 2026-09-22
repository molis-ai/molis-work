import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFileSecretStore, createLazyFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { FUNCTIONS_CREDENTIAL_REF } from "@molis-ai/molis-work-contracts/modules/functions";
import { readFunctionScenesView, withFunctionsService, withFunctionsServiceAsync } from "../apps/local-host/src/functions-host.ts";
import { createFunctionsMcpAdapter } from "../apps/local-host/src/mcp-functions-tools.ts";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// All Keychain calls resolve to this test executable. PATH contains no system
// directories, so these tests cannot reach the user's real `security` program.
async function withKeychainFixture(run: (fixture: { home: string; root: string; calls: () => string[]; allow: () => void }) => void | Promise<void>, mode: string) {
  const root = mkdtempSync(join(tmpdir(), "molis-keychain-retry-"));
  const home = join(root, "home"), bin = join(root, "bin"), calls = join(root, "calls");
  const old = { PATH: process.env.PATH, MOLIS_WORK_SECRET_BACKEND: process.env.MOLIS_WORK_SECRET_BACKEND,
    MOLIS_WORK_ENCRYPTION_KEY: process.env.MOLIS_WORK_ENCRYPTION_KEY };
  const fixtureKey = Buffer.alloc(32, 19).toString("base64");
  const installFake = (behavior: string) => writeFileSync(join(bin, "security"),
    `#!/bin/sh\nprintf '%s\\n' "$1" >> '${calls}'\n${behavior}\n`, { mode: 0o700 });
  mkdirSync(bin);
  try {
    process.env.PATH = bin;
    process.env.MOLIS_WORK_SECRET_BACKEND = "env";
    process.env.MOLIS_WORK_ENCRYPTION_KEY = fixtureKey;
    resetSecretStoreCache();
    runWithMolisWorkHome(home, () => createFileSecretStore().put("fixture", "original credential"));
    const file = join(home, "feed", "secrets.json");
    const persisted = JSON.parse(readFileSync(file, "utf8"));
    persisted.backend = "keychain+aes-gcm";
    writeFileSync(file, JSON.stringify(persisted));
    resetSecretStoreCache();
    process.env.MOLIS_WORK_ENCRYPTION_KEY = "";
    process.env.MOLIS_WORK_SECRET_BACKEND = "keychain";
    installFake(mode);
    await run({ root, home, calls: () => existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [],
      allow: () => installFake(`printf '%s\\n' '${fixtureKey}'`) });
  } finally {
    resetSecretStoreCache();
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

for (const [reason, behavior] of [
  ["denied", "exit 36"],
  ["timed out", "exec /bin/sleep 10"],
  ["invalid key", "printf '%s\\n' 'not-a-master-key'"],
] as const) {
  test(`Keychain ${reason} stops repeated access without modifying credentials and recovers in a fresh process`,
    { skip: process.platform !== "darwin" }, () => withKeychainFixture(({ home, calls, allow }) => {
      const file = join(home, "feed", "secrets.json"), before = readFileSync(file);
      for (let i = 0; i < 8; i++) {
        assert.throws(() => runWithMolisWorkHome(home, createFileSecretStore), /Automatic retries are stopped.*restart Molis Work/u);
      }
      assert.deepEqual(calls(), ["find-generic-password"]);
      assert.deepEqual(readFileSync(file), before);
      assert.equal(existsSync(join(home, "feed", "secrets.key")), false);
      allow();
      assert.throws(() => runWithMolisWorkHome(home, createFileSecretStore), /Automatic retries are stopped/u,
        "even later requests do not silently reopen an authorization dialog");
      assert.equal(calls().length, 1);
      const storage = new URL("../packages/storage/dist/index.js", import.meta.url).href;
      const output = execFileSync(process.execPath, ["--input-type=module", "-e",
        `import { createFileSecretStore, runWithMolisWorkHome } from ${JSON.stringify(storage)};
         const store = runWithMolisWorkHome(${JSON.stringify(home)}, createFileSecretStore);
         console.log(JSON.stringify({backend:store.backend().kind, readable:store.get('fixture') === 'original credential'}));`],
      { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
      assert.deepEqual(JSON.parse(output), { backend: "keychain+aes-gcm", readable: true });
      assert.deepEqual(calls(), ["find-generic-password", "find-generic-password"]);
      assert.deepEqual(readFileSync(file), before);
    }, behavior));
}

test("Keychain failure does not block another Home or cache ordinary environment-key failures", { skip: process.platform !== "darwin" }, async () => {
  await withKeychainFixture(({ root, home, calls }) => {
    assert.throws(() => runWithMolisWorkHome(home, createFileSecretStore), /Keychain/u);
    const otherHome = join(root, "other-home");
    process.env.MOLIS_WORK_SECRET_BACKEND = "file";
    const store = runWithMolisWorkHome(otherHome, createFileSecretStore);
    store.put("other", "other credential");
    assert.equal(store.get("other"), "other credential");
    assert.equal(store.backend().kind, "aes-gcm-file");
    assert.deepEqual(calls(), ["find-generic-password"]);
    const envHome = join(root, "env-home"), key = Buffer.alloc(32, 27).toString("base64");
    process.env.MOLIS_WORK_ENCRYPTION_KEY = key;
    runWithMolisWorkHome(envHome, createFileSecretStore).put("env", "env credential");
    resetSecretStoreCache();
    process.env.MOLIS_WORK_ENCRYPTION_KEY = "";
    assert.throws(() => runWithMolisWorkHome(envHome, createFileSecretStore), /encryption key is unavailable/u);
    process.env.MOLIS_WORK_ENCRYPTION_KEY = key;
    assert.equal(runWithMolisWorkHome(envHome, createFileSecretStore).get("env"), "env credential");
    assert.deepEqual(calls(), ["find-generic-password"]);
  }, "exit 36");
});

test("lazy credentials preserve their Home and only unlock an existing credential", { skip: process.platform !== "darwin" }, () =>
  withKeychainFixture(({ home, root, calls, allow }) => {
    const lazy = runWithMolisWorkHome(home, createLazyFileSecretStore);
    const file = join(home, "feed", "secrets.json"), before = readFileSync(file);
    assert.equal(lazy.get("not-configured"), null);
    assert.deepEqual(calls(), []);
    allow();
    runWithMolisWorkHome(join(root, "wrong-home"), () => {
      assert.equal(lazy.get("fixture"), "original credential");
      assert.equal(lazy.createIfAbsent("new", "new credential"), true);
      assert.equal(lazy.createIfAbsent("new", "must not replace"), false);
      assert.equal(lazy.get("new"), "new credential");
      lazy.put("new", "updated");
      assert.equal(lazy.get("new"), "updated");
      assert.equal(lazy.deleteIfPresent("new"), true);
      assert.equal(lazy.deleteIfPresent("new"), false);
      lazy.put("delete-me", "temporary");
      lazy.delete("delete-me");
      assert.equal(lazy.get("delete-me"), null);
      assert.equal(lazy.backend().kind, "keychain+aes-gcm");
      assert.equal(lazy.migrateIfNeeded().migrated, 0);
    });
    assert.equal(existsSync(join(root, "wrong-home")), false);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).entries.fixture, JSON.parse(before.toString()).entries.fixture);
    assert.deepEqual(calls(), ["find-generic-password"]);
  }, "exit 36"));

test("Functions local reads work with locked Keychain across Host, HTTP and fresh MCP processes; invocation still requires credentials",
  { skip: process.platform !== "darwin" }, () => withKeychainFixture(async ({ home, calls }) => {
    const file = join(home, "feed", "secrets.json");
    const sealed = JSON.parse(readFileSync(file, "utf8"));
    sealed.entries[FUNCTIONS_CREDENTIAL_REF] = sealed.entries.fixture;
    writeFileSync(file, JSON.stringify(sealed));
    const before = readFileSync(file);
    const setup = { env: { TYPESAFE_API_KEY: "synthetic-env-credential" }, provider: {
      async evaluate() { return { primitive: "choice" as const, choice: "yes", noul: null, score: null,
        legend: null, probabilities: { yes: 1 }, confidence: 1, model: "fixture" }; },
    } };
    const live = await withFunctionsServiceAsync(home, async (service) => {
      const draft = service.createChoice({ name: "无需凭据浏览的函数", function_key: "lazy_keychain" });
      service.updateDraft(draft.id, { instructions: "Choose yes", criteria: [{ key: "yes", description: "yes" }, { key: "no", description: "no" }] });
      await service.preview(draft.id, "publish fixture");
      return service.publish(draft.id);
    }, setup);
    assert.equal(withFunctionsService(home, service => service.listPublished()).some(row => row.function_key === live.function_key), true);
    assert.ok(readFunctionScenesView(home, "fixture-board").home_dock_functions);
    assert.deepEqual(calls(), [], "construction and environment credentials never unlock the unrelated Keychain");

    const adapterUrl = new URL("../apps/local-host/src/mcp-functions-tools.ts", import.meta.url).href;
    const script = `import { createFunctionsMcpAdapter } from ${JSON.stringify(adapterUrl)};
      const adapter = createFunctionsMcpAdapter({requireHost: () => ({homeDirectory:${JSON.stringify(home)},
        runtimeContext:{runtime_id:'codex',stable_work_context_id:'fixture',host_declares_stable:true}}),env:{}});
      const context = {runtimeSessionId:null,runtimeSessionIdSource:null};
      const listed = JSON.parse(await adapter.handle({tool_id:'list',arguments:{}},context));
      const described = JSON.parse(await adapter.handle({tool_id:'describe',arguments:{function_key:'lazy_keychain'}},context));
      console.log(JSON.stringify({listed:listed.functions.some(row=>row.function_key==='lazy_keychain'),name:described.function.name}));`;
    for (let i = 0; i < 3; i++) {
      const result = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script],
        { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "pipe"] });
      assert.deepEqual(JSON.parse(result), { listed: true, name: live.name });
    }
    const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: "keychain-fixture-control-0123456789" });
    try {
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const origin = `http://127.0.0.1:${address.port}`;
      for (const route of ["/api/functions", "/api/functions/published", "/api/functions/by-key/lazy_keychain"]) {
        const response = await fetch(origin + route);
        assert.equal(response.status, 200, route);
        assert.match(await response.text(), /lazy_keychain/u);
      }
      assert.deepEqual(calls(), [], "HTTP and all independent MCP reads must leave Keychain untouched");
      let providerCalls = 0;
      const adapter = createFunctionsMcpAdapter({ requireHost: () => ({ homeDirectory: home,
        runtimeContext: { runtime_id: "codex", stable_work_context_id: "fixture", host_declares_stable: true } }),
        env: {}, provider: { async evaluate() { providerCalls++; throw new Error("must not reach provider"); } } });
      const context = { runtimeSessionId: null, runtimeSessionIdSource: null };
      for (let i = 0; i < 3; i++) await assert.rejects(() => adapter.handle({ tool_id: "invoke",
        arguments: { function_key: live.function_key, input: "needs actual credential" } }, context), /Keychain/u);
      assert.equal(providerCalls, 0);
      assert.deepEqual(calls(), ["find-generic-password"]);
      assert.match(await adapter.handle({ tool_id: "describe", arguments: { function_key: live.function_key } }, context), /lazy_keychain/u);
      assert.equal((await fetch(origin + "/api/functions")).status, 200, "local work remains available after authentication fails");
      assert.deepEqual(readFileSync(file), before);
      assert.equal(existsSync(join(home, "feed", "secrets.key")), false);
    } finally {
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }, "exit 36"));
