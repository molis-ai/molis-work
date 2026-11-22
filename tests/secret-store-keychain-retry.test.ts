import {trialAccountConfig} from '../examples/personal-trial-tools/mock-auth.mjs';
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { observationActions } from "@molis-ai/molis-work-contracts/services/observation";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFileSecretStore, createLazyFileSecretStore, openBaselineHomeSqlite, openExistingHomePayload, sealExistingHomePayload, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { CONNECTORS_BASELINE } from "@molis-ai/molis-work-app-local-host";
import { withFunctionsService, withFunctionsServiceAsync } from "../apps/local-host/dist/judgment-rules-host.js";
import { functionsActions } from "@molis-ai/molis-work-module-judgment-rules";
import { createSingleHomeTestWebServer } from "./fixtures/local-web-core.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// All Keychain calls resolve to this test executable. PATH contains no system
// directories, so these tests cannot reach the user's real `security` program.
async function withKeychainFixture(run: (fixture: { home: string; root: string; calls: () => string[]; allow: () => void }) => void | Promise<void>, mode: string, initializeHome = false) {
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
    if (initializeHome) {
      // This scenario creates a current Home before adding locked credentials; it is not an unadopted old Home.
      const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, functions: { env: {} } });
      await host.close();
    }
    runWithMolisWorkHome(home, () => createFileSecretStore().put("fixture", "original credential"));
    const file = join(home, "security", "secrets.json");
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
      const file = join(home, "security", "secrets.json"), before = readFileSync(file);
      for (let i = 0; i < 8; i++) {
        assert.throws(() => runWithMolisWorkHome(home, createFileSecretStore), /Automatic retries are stopped.*restart Molis Work/u);
      }
      assert.deepEqual(calls(), ["find-generic-password"]);
      assert.deepEqual(readFileSync(file), before);
      assert.equal(existsSync(join(home, "security", "secrets.key")), false);
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

test("S-12 RAC-104-B2b-01: an empty Keychain vault keeps its original backend for normal reopening and read-only owner payloads",
  { skip: process.platform !== "darwin" }, () => withKeychainFixture(({ home, root, allow }) => {
    allow();
    runWithMolisWorkHome(home, () => createFileSecretStore().delete("fixture"));
    const file = join(home, "security", "secrets.json"), before = readFileSync(file);
    assert.deepEqual(JSON.parse(before.toString()).entries, {});
    process.env.MOLIS_WORK_SECRET_BACKEND = "file";
    resetSecretStoreCache();
    assert.equal(runWithMolisWorkHome(home, () => createFileSecretStore().backend().kind), "keychain+aes-gcm");
    const sealed = sealExistingHomePayload(home, "original-owner", "private owner contents");
    assert.equal(openExistingHomePayload(home, "original-owner", sealed), "private owner contents");
    assert.equal(sealed.backend, "keychain+aes-gcm");
    assert.deepEqual(readFileSync(file), before); assert.equal(existsSync(join(home, "security", "secrets.key")), false);
    // The only PATH directory now has no security executable: neither a system lookup nor a replacement key is possible.
    rmSync(join(root, "bin", "security")); resetSecretStoreCache();
    // S-12 RAC-104-B2b-07: a fresh environment value cannot replace the vault's recorded Keychain backend.
    process.env.MOLIS_WORK_ENCRYPTION_KEY = Buffer.alloc(32, 31).toString("base64");
    assert.throws(() => runWithMolisWorkHome(home, createFileSecretStore), /Keychain/u);
    assert.throws(() => runWithMolisWorkHome(home, createFileSecretStore), /original Keychain item.*HOME-DATA\.md/u);
    assert.throws(() => openExistingHomePayload(home, "original-owner", sealed), { code: "storage.secrets_snapshot.key_unavailable" });
    assert.deepEqual(readFileSync(file), before); assert.equal(existsSync(join(home, "security", "secrets.key")), false);
  }, "exit 36"));

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
    const file = join(home, "security", "secrets.json"), before = readFileSync(file);
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
    });
    assert.equal(existsSync(join(root, "wrong-home")), false);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).entries.fixture, JSON.parse(before.toString()).entries.fixture);
    assert.deepEqual(calls(), ["find-generic-password"]);
  }, "exit 36"));

test("QEA-88 Functions local reads work with locked Keychain across Host, HTTP and fresh MCP processes; invocation still requires credentials",
  { skip: process.platform !== "darwin" }, () => withKeychainFixture(async ({ home, calls }) => {
    const file = join(home, "security", "secrets.json");
    const sealed = JSON.parse(readFileSync(file, "utf8"));
    // A TypeSafe connection bound for Functions, written without unlocking anything: its key is the sealed fixture.
    const typeSafe = { id: "22222222-2222-4222-8222-222222222222", ref: "connector-connection:22222222-2222-4222-8222-222222222222:token" };
    sealed.entries[typeSafe.ref] = sealed.entries.fixture;
    sealed.entries["model:text:api_key"] = sealed.entries.fixture;
    writeFileSync(file, JSON.stringify(sealed));
    const connectors = openBaselineHomeSqlite(home, "connectors", CONNECTORS_BASELINE);
    try {
      const at = new Date().toISOString();
      connectors.prepare(`INSERT INTO connector_connections (connection_id,service_id,display_name,account_label,auth_method,credential_ref,
        refresh_ref,expires_ref,source,disconnected_at,created_at,updated_at) VALUES (?,'typesafe','TypeSafe',NULL,'token',?,NULL,NULL,'managed',NULL,?,?)`)
        .run(typeSafe.id, typeSafe.ref, at, at);
      connectors.prepare("INSERT INTO connector_bindings (scope_id,plugin_id,slot_id,connection_id,updated_at) VALUES ('home','functions','typesafe',?,?)")
        .run(typeSafe.id, at);
    } finally { connectors.close(); }
    const before = readFileSync(file);
    const setup = { env: { TYPESAFE_API_KEY: "synthetic-env-credential" }, provider: {
      async evaluate() { return { primitive: "choice" as const, choice: "yes", noul: null, score: null,
        legend: null, probabilities: { yes: 1 }, confidence: 1, model: "fixture" }; },
    } };
    assert.deepEqual(calls(), [], "fixture has not used Keychain");
    const live = await withFunctionsServiceAsync(home, async (service) => {
      const draft = service.createChoice({ name: "无需凭据浏览的函数", function_key: "lazy_keychain" });
      service.updateDraft(draft.id, { instructions: "Choose yes", criteria: [{ key: "yes", description: "yes" }, { key: "no", description: "no" }] }, service.get(draft.id).updated_at);
      await service.preview(draft.id, "publish fixture", service.get(draft.id).updated_at);
      return service.publish(draft.id, service.get(draft.id).updated_at);
    }, setup);
    assert.deepEqual(calls(), [], "environment-authenticated preview must not use Keychain");
    assert.equal(withFunctionsService(home, service => service.listPublished()).some(row => row.function_key === live.function_key), true);
    assert.deepEqual(calls(), [], "listing published rules must not use Keychain");
    assert.ok(withFunctionsService(home, service => service.list().length > 0));
    assert.deepEqual(calls(), [], "construction and environment credentials never unlock the unrelated Keychain");

    const hostUrl = new URL("../apps/local-host/src/project-host.ts", import.meta.url).href;
    const script = `import { functionsActions } from '@molis-ai/molis-work-module-judgment-rules';
      import { MolisWorkLocalHost } from ${JSON.stringify(hostUrl)};
      import { bindActionClient } from '@molis-ai/molis-work-contracts/platform/actions';
      const host = new MolisWorkLocalHost({homeDirectory:${JSON.stringify(home)},functions:{env:{}}});
      const actions = bindActionClient(host.homeActionClient(),
        () => ({actor_id:'keychain-child-test',project_id:null,audience:'mcp',permissions:['functions:invoke']}));
      const listed = await actions.invoke(functionsActions.list, {});
      const described = await actions.invoke(functionsActions.describe, {function_key:'lazy_keychain'});
      console.log(JSON.stringify({listed:listed.functions.some(row=>row.function_key==='lazy_keychain'),name:described.function.name}));
      await host.close();`;

    for (let i = 0; i < 3; i++) {
      const result = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script],
        { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "pipe"] });
      assert.deepEqual(JSON.parse(result), { listed: true, name: live.name });
    }
    // W2-10: the served Home and credential-refusal action share one execution Host.
    let providerCalls = 0;
    const actionHost = new MolisWorkLocalHost({ homeDirectory: home, functions: {
      env: {}, provider: { async evaluate() { providerCalls++; throw new Error("must not reach provider"); } },
    } });
    // This already-selected Home owns the fixture credentials; the same production business core must reach its actual Keychain refusal.
    const server = createSingleHomeTestWebServer({ homeDirectory: home, localHost: actionHost, controlToken: "keychain-fixture-control-0123456789" });
    try {
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const origin = `http://127.0.0.1:${address.port}`;
      for (const route of ["/api/functions", "/api/functions/published"]) {
        const response = await fetch(origin + route);
        assert.equal(response.status, 200, route);
        assert.match(await response.text(), /lazy_keychain/u);
      }
      const actions = bindActionClient(actionHost.homeActionClient(),
        () => ({ actor_id: "test", project_id: null, audience: "mcp", permissions: ["functions:invoke"] }));
      // BL-081 ②: the by-key HTTP describe was deleted; the same read goes through the Functions action.
      assert.match(JSON.stringify(await actions.invoke(functionsActions.describe, { function_key: live.function_key })), /lazy_keychain/u);
      assert.deepEqual(calls(), [], "HTTP and all independent MCP reads, including child Host close, must leave Keychain untouched");
      const observation = bindActionClient(actionHost.homeActionClient(),
        () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", project_id: null, audience: "user", permissions: [] }));
      const recorded = await observation.invoke(observationActions.recordsQuery, { project_id: null, entry: "mcp", actor_id: "keychain-child-test" });
      const childReads = recorded.records.filter(row => [functionsActions.list.capability_id + "@1", functionsActions.describe.capability_id + "@1"].includes(String(row.detail.action)));
      assert.equal(childReads.length, 6, "all six calls from the closed children retain their own metadata");
      assert.ok(childReads.every(row => row.evidence.length === 2 && row.evidence.every(item => item.ref.kind === "missing" && item.ref.reason === "not_obtained")));
      const coverage = await observation.invoke(observationActions.coverageGet, { project_id: null });
      assert.ok(coverage.gaps.some(gap => gap.state === "unavailable" && gap.reason === "evidence_key"));
      assert.deepEqual(calls(), [], "reading metadata and gaps does not ask to unlock evidence");
      for (let i = 0; i < 3; i++) await assert.rejects(() => actions.invoke(functionsActions.invoke, { function_key: live.function_key, input: "needs actual credential" }), /Keychain/u);
      assert.equal(providerCalls, 0);
      assert.deepEqual(calls(), ["find-generic-password"]);
      assert.match(JSON.stringify(await actions.invoke(functionsActions.describe, { function_key: live.function_key })), /lazy_keychain/u);
      assert.equal((await fetch(origin + "/api/functions")).status, 200, "local work remains available after authentication fails");
      assert.deepEqual(readFileSync(file), before);
      assert.equal(existsSync(join(home, "security", "secrets.key")), false);
    } finally {
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
      await actionHost.close();
      assert.deepEqual(calls(), ["find-generic-password"], "automatic flush does not add an unlock attempt after the real invocation refused");
    }
  }, "exit 36", true));

test("ASR-02 installation first login refuses locked Keychain without anonymous fallback or repeated unlock prompts",
  { skip: process.platform !== "darwin" }, () => withKeychainFixture(async ({ home, calls }) => {
    const file=join(home,"security","secrets.json"),before=readFileSync(file),token="keychain-first-login-control-0123456789";
    const config={MOLIS_WORK_ACCOUNT_CONFIG:JSON.stringify({...trialAccountConfig("https://auth.example.test","http://127.0.0.1:4173"),environmentKind:"TEST"})};
    const previous=Object.fromEntries(Object.keys(config).map(key=>[key,process.env[key]]));Object.assign(process.env,config);
    const server=createMolisWorkWebServer({homeDirectory:home,controlToken:token});
    try{
      await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();assert.ok(address&&typeof address==="object");const origin=`http://127.0.0.1:${address.port}`;
      for(let attempt=0;attempt<3;attempt++){
        const response=await fetch(origin+"/api/personal/login",{method:"POST",headers:{Origin:origin,"content-type":"application/json","x-molis-work-control-token":token,"x-molis-work-idempotency-key":"locked-first-login-"+attempt},body:"{}"});
        assert.equal(response.status,503,"credential failure remains a failed real installation login");assert.match((await response.json()).error,/登录会话暂时不可用/);
      }
      assert.equal((await fetch(origin+"/api/functions")).status,401,"credential failure never selects an anonymous editable Home");
      assert.deepEqual(calls(),["find-generic-password"]);assert.deepEqual(readFileSync(file),before);assert.equal(existsSync(join(home,"security","secrets.key")),false);
    }finally{
      if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));for(const[key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  },"exit 36",true));

// The Keychain item is shared by every Home on this machine, so a Home without Keychain ciphertext never deletes
// or replaces it: another Home's secrets may depend on the key it holds.
async function withFreshHomeKeychain(behavior: string, run: (fixture: { home: string; calls: () => string[] }) => void | Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "molis-keychain-fresh-"));
  const home = join(root, "home"), bin = join(root, "bin"), calls = join(root, "calls");
  const old = { PATH: process.env.PATH, MOLIS_WORK_SECRET_BACKEND: process.env.MOLIS_WORK_SECRET_BACKEND,
    MOLIS_WORK_ENCRYPTION_KEY: process.env.MOLIS_WORK_ENCRYPTION_KEY };
  mkdirSync(bin);
  writeFileSync(join(bin, "security"), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\n${behavior}\n`, { mode: 0o700 });
  try {
    process.env.PATH = bin;
    process.env.MOLIS_WORK_SECRET_BACKEND = "keychain";
    process.env.MOLIS_WORK_ENCRYPTION_KEY = "";
    resetSecretStoreCache();
    await run({ home, calls: () => existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [] });
  } finally {
    resetSecretStoreCache();
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

test("a fresh Home never deletes or replaces an existing Keychain item it cannot read and uses its own key file",
  { skip: process.platform !== "darwin" }, () => withFreshHomeKeychain(
    `case "$*" in *" -w") exit 36;; find-generic-password*) exit 0;; *) exit 1;; esac`, ({ home, calls }) => {
      const store = runWithMolisWorkHome(home, createFileSecretStore);
      assert.equal(store.backend().kind, "aes-gcm-file");
      store.put("fixture", "fresh credential");
      assert.equal(store.get("fixture"), "fresh credential");
      assert.equal(existsSync(join(home, "security", "secrets.key")), true);
      assert.deepEqual(calls().map(line => line.split(" ")[0]), ["find-generic-password", "find-generic-password"]);
    }));

test("a fresh Home creates the missing Keychain item add-only and trusted for the security CLI",
  { skip: process.platform !== "darwin" }, () => withFreshHomeKeychain(
    `case "$1" in add-generic-password) exit 0;; *) exit 44;; esac`, ({ home, calls }) => {
      const store = runWithMolisWorkHome(home, createFileSecretStore);
      assert.equal(store.backend().kind, "keychain+aes-gcm");
      const added = calls().filter(line => line.startsWith("add-generic-password"));
      assert.equal(added.length, 1);
      assert.match(added[0]!, / -T \/usr\/bin\/security$/);
      assert.doesNotMatch(added[0]!, / -U\b/, "an existing item is never overwritten");
      assert.equal(calls().some(line => line.startsWith("delete-generic-password")), false);
      assert.equal(existsSync(join(home, "security", "secrets.key")), false);
    }));

test("QEA-89 passive Keychain access uses the original cache and does not poison a later explicit unlock", { skip: process.platform !== "darwin" }, () => withKeychainFixture(({ home, root, calls, allow }) => {
  const file = join(home, "security", "secrets.json"), before = readFileSync(file);
  const passive = createLazyFileSecretStore(home, { keychain: "cached" }), explicit = createLazyFileSecretStore(home);
  assert.throws(() => passive.get("fixture"), /explicit credential operation/u);
  assert.throws(() => passive.createIfAbsent("observation-test", "automatic record"), /explicit credential operation/u);
  assert.deepEqual(calls(), []); assert.deepEqual(readFileSync(file), before);
  assert.equal(existsSync(join(home, "security", "secrets.key")), false);
  const fresh = join(root, "fresh-passive-home"), freshStore = createLazyFileSecretStore(fresh, { keychain: "cached" });
  assert.throws(() => freshStore.createIfAbsent("automatic", "body"), /explicit credential operation/u);
  assert.equal(existsSync(join(fresh, "security", "secrets.json")), false);
  assert.equal(existsSync(join(fresh, "security", "secrets.key")), false, "passive access never changes a new Home's backend selection");
  assert.deepEqual(calls(), []);
  allow();
  assert.equal(explicit.get("fixture"), "original credential", "the passive refusal did not populate keychainFailures");
  assert.deepEqual(calls(), ["find-generic-password"]);
  assert.equal(passive.get("fixture"), "original credential");
  assert.equal(passive.createIfAbsent("observation-test", "automatic record"), true);
  assert.equal(passive.get("observation-test"), "automatic record");
  assert.deepEqual(calls(), ["find-generic-password"], "the automatic service uses that same unlocked Home cache");
  assert.equal(JSON.parse(readFileSync(file, "utf8")).backend, "keychain+aes-gcm");
}, "exit 36"));

test("QEA-89 Host evidence.get unlocks the original key and subsequent automatic capture resumes", { skip: process.platform !== "darwin" }, () => withKeychainFixture(async ({ home, calls, allow }) => {
  allow();
  runWithMolisWorkHome(home, () => assert.equal(createFileSecretStore().get("fixture"), "original credential"));
  const openHost = () => new MolisWorkLocalHost({ homeDirectory: home, completeText: null, functions: { env: {} } });
  const bind = (host: MolisWorkLocalHost) => bindActionClient(host.homeActionClient(),
    () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", project_id: null, audience: "user", permissions: [] }));
  // A person's own page result is intentionally digest-only (OCL-11); use the real MCP read path for sealed result evidence.
  const read = (host: MolisWorkLocalHost) => bindActionClient(host.homeActionClient(),
    () => ({ actor_id: "evidence-mcp", project_id: null, audience: "mcp", permissions: ["functions:invoke"] })).invoke(functionsActions.list, {});
  const first = openHost(), initial = bind(first);
  let sealedId: string;
  let initialResult: unknown;
  try {
    initialResult = await read(first);
    const rows = await initial.invoke(observationActions.recordsQuery, { project_id: null });
    const record = rows.records.find(row => row.detail.action === "functions.list@1");
    assert.ok(record && record.evidence.every(item => item.ref.kind === "snapshot"));
    sealedId = record.record_id;
  } finally { await first.close(); }
  assert.deepEqual(calls(), ["find-generic-password"]);
  resetSecretStoreCache();
  const second = openHost(), actions = bind(second);
  try {
    await read(second);
    const before = await actions.invoke(observationActions.recordsQuery, { project_id: null });
    const missing = before.records.find(row => row.detail.action === "functions.list@1" && row.record_id !== sealedId);
    assert.ok(missing && missing.evidence.every(item => item.ref.kind === "missing" && item.ref.reason === "not_obtained"));
    assert.deepEqual(calls(), ["find-generic-password"], "a reopened Host's metadata query never initiates unlocking");
    const evidence = await actions.invoke(observationActions.evidenceGet, { record_id: sealedId, role: "result", use: "lookback" });
    assert.equal(evidence.items.length, 1);
    const item = evidence.items[0]!;
    assert.ok(item.status === "available");
    assert.deepEqual(JSON.parse(item.text), initialResult, "the public action actually decrypts the original evidence");
    assert.deepEqual(calls(), ["find-generic-password", "find-generic-password"]);
    await read(second);
    const after = await actions.invoke(observationActions.recordsQuery, { project_id: null });
    const resumed = after.records.find(row => row.detail.action === "functions.list@1" && ![sealedId, missing.record_id].includes(row.record_id));
    assert.ok(resumed && resumed.evidence.every(item => item.ref.kind === "snapshot"));
    const restored = await actions.invoke(observationActions.evidenceGet, { record_id: resumed.record_id, role: "result", use: "lookback" });
    assert.ok(restored.items[0]?.status === "available");
    assert.deepEqual(JSON.parse(restored.items[0].text), initialResult);
    assert.deepEqual(after.records.find(row => row.record_id === missing.record_id), missing, "unlocking does not rewrite old missing evidence");
  } finally { await second.close(); }
  assert.deepEqual(calls(), ["find-generic-password", "find-generic-password"], "subsequent capture and shutdown use the existing unlocked cache");
}, "exit 36", true));

for (const backend of ["env", "file"] as const) test(`QEA-89 passive credential access retains the original ${backend} backend across cache reset`, async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-passive-"));
  const previous = { MOLIS_WORK_SECRET_BACKEND: process.env.MOLIS_WORK_SECRET_BACKEND, MOLIS_WORK_ENCRYPTION_KEY: process.env.MOLIS_WORK_ENCRYPTION_KEY };
  try {
    process.env.MOLIS_WORK_SECRET_BACKEND = backend;
    process.env.MOLIS_WORK_ENCRYPTION_KEY = backend === "env" ? Buffer.alloc(32, 41).toString("base64") : "";
    resetSecretStoreCache();
    const store = createLazyFileSecretStore(home, { keychain: "cached" });
    assert.equal(store.createIfAbsent("sample", "original value"), true);
    const bytes = readFileSync(join(home, "security", "secrets.json"));
    resetSecretStoreCache();
    assert.equal(store.get("sample"), "original value");
    assert.equal(store.backend().kind, backend === "env" ? "env-key+aes-gcm" : "aes-gcm-file");
    assert.deepEqual(readFileSync(join(home, "security", "secrets.json")), bytes);
  } finally {
    resetSecretStoreCache();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    rmSync(home, { recursive: true, force: true });
  }
});
