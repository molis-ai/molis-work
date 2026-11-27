import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { workEnvironment, workSettings } from "../scripts/account-environments.mjs";
import { carrierIssues, connectorApplicationReferences, misplacedValues, missingProfileValues, nodeVersion, tauriSettings } from "../tooling/release/profile.mjs";
import { createMolisWorkRuntimePayload, installMolisWorkHome, releaseProfile } from "@molis-ai/molis-work-app-local-host";
import { packBundledReleasePackages } from "../tooling/release/pack-bundled.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("26-9 C-1: development keeps its Tauri, Node, ad-hoc and local Auth settings", async () => {
  assert.deepEqual(carrierIssues("dev"), []);
  assert.deepEqual(missingProfileValues("dev"), []);
  assert.equal(nodeVersion({}), (await readFile(join(root, ".nvmrc"), "utf8")).trim());
  assert.deepEqual(workEnvironment("dev", undefined, { publicOnly: true }), {
    environmentId: "unified-local",
    environmentKind: "LOCAL",
    authOrigin: "http://127.0.0.1:8787",
    applicationId: "molis-work-unified-local-app",
    clientId: "molis-work-unified-local",
    providerMode: "LIVE",
    deliveryMode: "LIVE",
    productOrigin: "http://127.0.0.1:4207",
    policyProfile: "unified-account-v2",
    redirectAllowlist: ["http://127.0.0.1:4207/account/callback"],
  });
  assert.throws(() => workEnvironment("constructor", undefined, { publicOnly: true }), /Choose dev, test or prod/u);
  assert.deepEqual(connectorApplicationReferences("dev", "github"), { primary: "OAUTH_APP_GITHUB", fallback: "OAUTH_APPS" });
  assert.deepEqual(connectorApplicationReferences("test", "google-calendar"), { primary: "OAUTH_APP_GOOGLE_CALENDAR", fallback: "OAUTH_APPS" });
  assert.deepEqual(connectorApplicationReferences("release", "github"), { primary: undefined, fallback: undefined });
});

test("V2-03: source and installed Work use distinct loopback clients and validate sync targets", async t => {
  assert.equal(tauriSettings(releaseProfile("test")).identifier, "com.molis.work.test");
  assert.equal(tauriSettings(releaseProfile("test")).productName, "Molis Work Test");
  assert.equal(releaseProfile("test").desktopApplication.home, ".molis-work-environments/installed-test");
  assert.equal(tauriSettings(releaseProfile("release")).identifier, "com.molis.work");
  const directory = await mkdtemp(join(tmpdir(), "molis-release-sync-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(join(root, "config"), join(directory, "config"), { recursive: true });
  const configRoot = pathToFileURL(directory + "/");
  const select = (name, installed = false) => workSettings(name, configRoot, { publicOnly: true, installed });
  const testConfig = join(directory, "config", "test.properties");
  const contents = await readFile(testConfig, "utf8");
  const configureSync = origin => writeFile(testConfig, contents.replace(/^syncOrigin=.*$/mu, "syncOrigin=" + origin));
  const testOrigin = "https://work.test.molis.ai";
  const source = select("test");
  const desktop = select("test", true);
  assert.equal(source.syncOrigin, testOrigin);
  assert.equal(desktop.syncOrigin, testOrigin);
  assert.equal(source.account.clientId, "molis-work-test");
  assert.equal(desktop.account.clientId, "molis-work-test-desktop");
  assert.deepEqual(source.account.redirectAllowlist, ["http://127.0.0.1:4207/account/callback"]);
  assert.deepEqual(desktop.account.redirectAllowlist, ["http://127.0.0.1:4173/account/callback"]);
  assert.deepEqual(select("prod", true).account.redirectAllowlist, ["http://127.0.0.1:4173/account/callback"]);
  for (const origin of ["https://work.molis.ai", "https://auth.test.molis.ai", "http://127.0.0.1:8788", testOrigin + "/api"]) {
    await configureSync(origin);
    assert.throws(() => select("test"), /invalid field syncOrigin/u);
  }
  const devConfig = join(directory, "config", "dev.properties");
  const dev = await readFile(devConfig, "utf8");
  await writeFile(devConfig, dev.replace(/^syncOrigin=.*$/mu, "syncOrigin=http://127.0.0.1:8788"));
  assert.equal(select("dev").syncOrigin, "http://127.0.0.1:8788");
});

test("26-9 C-1: report identifies the unfilled production fields and a mismatched carrier", () => {
  assert.deepEqual(missingProfileValues("release"), [
    "signingIdentity", "notarization", "publisherKeyRef", "entitlements",
    "connectors.brokerOrigin", "connectors.applicationRefs", "connectors.applications",
    "updateChannel", "symbolUploadTarget",
  ]);
  assert.deepEqual(carrierIssues("dev", path => {
    if (path.endsWith(".yml")) return "          node-version: 24.0.0\n";
    return JSON.stringify(path.endsWith("tauri.conf.json") ? {
      identifier: "ai.example.work", productName: "Molis Work", bundle: { macOS: { minimumSystemVersion: "13.0" } },
    } : { bundle: { macOS: { signingIdentity: "-", entitlements: "custom.plist" } } });
  }), [
    "apps/desktop/src-tauri/tauri.conf.json identifier differs from the developer profile (checking dev)",
    "apps/desktop/src-tauri/tauri.macos.conf.json bundle.macOS.entitlements differs from the developer profile (checking dev)",
    ".github/workflows/release-macos.yml node-version-file differs from the developer profile (checking dev)",
  ]);
});

test("26-9 C-1: report finds duplicate application selectors and Mach-O paths outside the configuration", async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-release-report-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  await cp(join(root, "config"), join(directory, "config"), { recursive: true });
  const config = "apps/local-host/src/release-profiles.json";
  await mkdir(join(directory, "apps/local-host/src"), { recursive: true });
  const configuration = JSON.parse(await readFile(join(root, config), "utf8"));
  configuration.profiles.release.updateChannel = "fixture-channel";
  await writeFile(join(directory, config), JSON.stringify(configuration));
  await writeFile(join(directory, "apps/local-host/src/duplicate.ts"), 'const selector = "OAUTH_APP_TEST";\nconst path = "Contents/MacOS/*";\nconst channel = "fixture-channel";\n');
  assert.deepEqual(misplacedValues(pathToFileURL(directory + "/")), [
    "apps/local-host/src/duplicate.ts:1 contains a release configuration value",
    "apps/local-host/src/duplicate.ts:2 contains a release configuration value",
    "apps/local-host/src/duplicate.ts:3 contains a release configuration value",
  ]);
});

test("26-9 S-bundled-packages: the build uses the dev key reference to produce only signed packages", async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-release-profile-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, "bundled"), keyPath = join(directory, "fixture-key");
  await assert.rejects(packBundledReleasePackages(root, output, "dev", {}), /MOLIS_WORK_DEV_PUBLISHER_KEY_FILE/u);
  await assert.rejects(readdir(output), { code: "ENOENT" });
  const { privateKey } = generateKeyPairSync("ed25519");
  await writeFile(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  await packBundledReleasePackages(root, output, "dev", { MOLIS_WORK_DEV_PUBLISHER_KEY_FILE: keyPath });
  const files = await readdir(output);
  assert.ok(files.length > 0);
  for (const file of files) {
    const { bundle } = verifyPluginPackageSignature(JSON.parse(await readFile(join(output, file), "utf8")));
    assert.equal(file, bundle.payload.manifest.plugin_id + ".json");
  }
});

// Building the whole runtime payload alone takes about 45 s on a developer Mac (2026-11-22); with the probes the whole test takes 60–100 s
// there and on CI, so 60 s timed out every run. The limit leaves room for a loaded machine; nothing it checks is loosened.
test("ENV-13: packaged test runtime isolates MCP, CLI, and Host home resolution from ~/.molis-work", { timeout: 180_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-test-env-isolation-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const testSettings = workSettings("test", pathToFileURL(root), { publicOnly: true, installed: true });
  // Reject invalid release configuration before walking or fingerprinting the runtime source.
  for (const badSyncOrigin of ["https://work.molis.ai", "https://auth.test.molis.ai", "http://127.0.0.1:8788", "https://work.test.molis.ai/api"]) {
    await assert.rejects(
      createMolisWorkRuntimePayload({
        sourceDirectory: join(directory, "unread-source"),
        destinationDirectory: join(directory, "bad-payload"),
        nodeExecutablePath: process.execPath,
        desktopDistribution: { profile: "test", account: testSettings.account, syncOrigin: badSyncOrigin },
      }),
      /sync origin/u,
    );
  }
  const payload = join(directory, "payload");
  await createMolisWorkRuntimePayload({
    sourceDirectory: root,
    destinationDirectory: payload,
    nodeExecutablePath: process.execPath,
    desktopDistribution: { profile: "test", account: testSettings.account, syncOrigin: testSettings.syncOrigin },
  });
  const fakeHome = join(directory, "fake-user-home");
  await mkdir(fakeHome, { recursive: true });
  const expectedTestHome = join(fakeHome, ".molis-work-environments", "installed-test");
  const wrongProdHome = join(fakeHome, ".molis-work");
  const cleanEnv = { ...process.env, HOME: fakeHome, MOLIS_WORK_HOME: wrongProdHome, MOLIS_WORK_RUNTIME_ID: "codex", MOLIS_WORK_ACCOUNT_CONFIG: '{"forged":true}' };
  delete cleanEnv.NODE_TEST_CONTEXT;
  delete cleanEnv.MOLIS_WORK_WEB_URL;
  const probe = execFileSync(process.execPath, [
    "--input-type=module",
    "-e",
    `
      const host = await import(${JSON.stringify(pathToFileURL(join(payload, "node_modules", "@molis-ai", "molis-work-app-local-host", "dist", "index.js")).href)});
      const profile = await import(${JSON.stringify(pathToFileURL(join(payload, "node_modules", "@molis-ai", "molis-work-app-local-host", "dist", "active-release-profile.js")).href)});
      const runtimeHost = host.runtimeContextHostFromEnvironment();
      console.log(JSON.stringify({
        configuredHome: host.resolveConfiguredHome(),
        runtimeHome: runtimeHost?.homeDirectory ?? null,
        accountEnv: JSON.parse(profile.configuredAccountEnvironment() ?? "null"),
        syncOrigin: profile.configuredSyncOrigin() ?? null,
      }));
    `,
  ], { env: cleanEnv, encoding: "utf8" });
  const result = JSON.parse(probe);
  assert.equal(result.configuredHome.endsWith("/.molis-work-environments/installed-test"), true, result.configuredHome);
  assert.equal(result.runtimeHome.endsWith("/.molis-work-environments/installed-test"), true, result.runtimeHome);
  assert.equal(result.configuredHome.includes("/.molis-work/"), false);
  assert.equal(result.accountEnv.clientId, testSettings.account.clientId, "packaged account config ignores poisoned MOLIS_WORK_ACCOUNT_CONFIG");
  assert.equal(result.syncOrigin, testSettings.syncOrigin);
  // Installing the packaged test payload pins MOLIS_WORK_HOME in generated bin/molis-work, bin/molis-work-mcp, and bin/molis-work-web.
  const installed = await installMolisWorkHome({ homeDirectory: expectedTestHome, sourceDirectory: payload });
  for (const launcher of [installed.launchers.cli, installed.launchers.mcp, installed.launchers.web]) {
    const text = await readFile(launcher, "utf8");
    assert.ok(text.includes("MOLIS_WORK_HOME="), launcher);
    assert.ok(text.includes("installed-test"), launcher);
  }
});

test("F-btd-01 F-btd-07: profile.mjs runs without prebuilt local-host dist and release-macos.yml pins Rust 1.96.0", async () => {
  const profileSource = await readFile(join(root, "tooling/release/profile.mjs"), "utf8");
  assert.equal(profileSource.includes("@molis-ai/molis-work-app-local-host"), false, "profile.mjs must read release-profiles.json directly so clean checkouts work before pnpm build");
  const outputs = execFileSync(process.execPath, [join(root, "tooling/release/profile.mjs"), "--profile", "dev", "--ci-outputs"], { encoding: "utf8" });
  assert.match(outputs, /^profile=dev$/mu);
  assert.match(outputs, /^publisherKey=MOLIS_WORK_DEV_PUBLISHER_KEY_FILE$/mu);
  const workflow = await readFile(join(root, ".github/workflows/release-macos.yml"), "utf8");
  assert.equal(workflow.includes("dtolnay/rust-toolchain@stable"), false);
  assert.match(workflow, /RUSTUP_TOOLCHAIN:\s*1\.96\.0/u);
  assert.match(workflow, /rustup toolchain install 1\.96\.0/u);
  assert.equal(workflow.includes("profile.mjs --profile dev --ci-outputs"), false);
  assert.equal(workflow.includes("configured development publisher key Secret"), false);
});
