import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { accountEnvironment } from "../scripts/account-environments.mjs";
import { carrierIssues, missingProfileValues, nodeVersion } from "../tooling/release/profile.mjs";
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
});

test("26-9 C-1: report identifies the unfilled production fields and a mismatched carrier", () => {
  assert.deepEqual(missingProfileValues("release"), [
    "accountEnvironment", "signingIdentity", "notarization", "publisherKeyRef", "entitlements",
    "connectors.brokerOrigin", "connectors.services", "connectors.applications", "connectors.applicationSecretPrefix",
    "updateChannel", "symbolUploadTarget",
  ]);
  assert.deepEqual(carrierIssues("dev", path => JSON.stringify(path.endsWith("tauri.conf.json") ? {
    identifier: "ai.example.work", productName: "Molis Work", bundle: { macOS: { minimumSystemVersion: "13.0" } },
  } : { bundle: { macOS: { signingIdentity: "-" } } })), [
    "apps/desktop/src-tauri/tauri.conf.json identifier differs from the developer profile (checking dev)",
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
