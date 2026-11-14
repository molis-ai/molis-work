import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { accountEnvironment } from "../scripts/account-environments.mjs";
import { carrierIssues, connectorApplicationReferences, misplacedValues, missingProfileValues, nodeVersion } from "../tooling/release/profile.mjs";
import { packBundledReleasePackages } from "../tooling/release/pack-bundled.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("26-9 C-1: development keeps its Tauri, Node, ad-hoc and local Auth settings", async () => {
  assert.deepEqual(carrierIssues("dev"), []);
  assert.deepEqual(missingProfileValues("dev"), []);
  assert.equal(nodeVersion({}), (await readFile(join(root, ".nvmrc"), "utf8")).trim());
  assert.deepEqual(accountEnvironment("dev"), {
    environmentId: "unified-local",
    environmentKind: "LOCAL",
    authOrigin: "http://127.0.0.1:8787",
    applicationId: "molis-work-unified-local-app",
    clientId: "molis-work-unified-local",
    providerMode: "MOCK",
    deliveryMode: "MOCK",
    productOrigin: "http://127.0.0.1:4207",
    policyProfile: "unified-account-v2",
    redirectAllowlist: ["http://127.0.0.1:4207/account/callback"],
  });
  assert.throws(() => accountEnvironment("constructor"), /Choose dev, test or prod/u);
  assert.deepEqual(connectorApplicationReferences("dev", "github"), { primary: "OAUTH_APP_GITHUB", fallback: "OAUTH_APPS" });
  assert.deepEqual(connectorApplicationReferences("test", "google-calendar"), { primary: "OAUTH_APP_GOOGLE_CALENDAR", fallback: "OAUTH_APPS" });
  assert.deepEqual(connectorApplicationReferences("release", "github"), { primary: undefined, fallback: undefined });
});

test("26-9 C-1: report identifies the unfilled production fields and a mismatched carrier", () => {
  assert.deepEqual(missingProfileValues("release"), [
    "accountEnvironment", "signingIdentity", "notarization", "publisherKeyRef", "entitlements",
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
