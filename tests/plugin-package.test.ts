import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { PluginManifest, PluginPackageBundle, PluginPackageSigner } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parsePluginPackage, signPluginPackage, verifyPluginPackage } from "@molis-ai/molis-work-plugin-runtime";

function packageFixture() {
  const keys = generateKeyPairSync("ed25519");
  const spki = keys.publicKey.export({ type: "spki", format: "der" });
  const identity = `ed25519:sha256:${createHash("sha256").update(spki).digest("hex")}`;
  const manifest: PluginManifest = {
    schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.package-trust", version: "1.0.0", name: "Package trust fixture", kind: "app",
    publisher: { publisher_id: "developer", signature: identity }, entrypoints: [{ deployment: "local", entrypoint: "./index.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
  };
  const bundle: PluginPackageBundle = {
    payload: { schema_version: 1, manifest, files: [
      { path: "index.mjs", content_base64: Buffer.from("export default {};").toString("base64") },
      { path: "manifest.json", content_base64: Buffer.from(JSON.stringify(manifest)).toString("base64") },
    ] }, signature: null, publisher_key: null,
  };
  const signer: PluginPackageSigner = { publisher_identity: identity, public_key_spki_base64: spki.toString("base64"), sign: bytes => sign(null, bytes, keys.privateKey) };
  return { bundle, signer, publicKey: keys.publicKey };
}

const invalidPackage = (expected: string) => (error: unknown) => error instanceof ActionError && error.kind === "invalid" && error.code === expected;

test("RAC-382-T1 parsePluginPackage refuses a publisher key on an unsigned envelope", () => {
  const { bundle, signer } = packageFixture();
  assert.deepEqual(parsePluginPackage(bundle), bundle, "a legal unsigned envelope still parses");
  assert.throws(() => parsePluginPackage({ ...bundle, publisher_key: { algorithm: "ed25519", spki_base64: signer.public_key_spki_base64 } }),
    invalidPackage("plugin.package_invalid"));
});

test("RAC-382-T1 parsePluginPackage refuses a signed envelope with a missing or invalid Ed25519 SPKI", () => {
  const { bundle, signer, publicKey } = packageFixture(), signed = signPluginPackage(bundle, signer);
  assert.deepEqual(verifyPluginPackage(signed, publicKey), signed, "a real Ed25519 signature with its own SPKI verifies");
  const missing: Record<string, unknown> = { ...signed }; delete missing.publisher_key;
  assert.throws(() => parsePluginPackage(missing), invalidPackage("plugin.package_invalid"));
  const otherAlgorithm = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey.export({ type: "spki", format: "der" }).toString("base64");
  for (const publisher_key of [null, { algorithm: "ed25519", spki_base64: "not-base64!" },
    { algorithm: "ed25519", spki_base64: Buffer.from("not an SPKI").toString("base64") }, { algorithm: "ed25519", spki_base64: otherAlgorithm }]) {
    assert.throws(() => parsePluginPackage({ ...signed, publisher_key }), invalidPackage("plugin.package_invalid"));
  }
});

test("RAC-382-T1 parsePluginPackage refuses an envelope whose real public key fingerprint differs from its Manifest publisher", () => {
  const { bundle, signer, publicKey } = packageFixture(), signed = signPluginPackage(bundle, signer), other = packageFixture();
  assert.deepEqual(parsePluginPackage(signed), signed);
  assert.deepEqual(verifyPluginPackage(signed, publicKey), signed);
  assert.throws(() => parsePluginPackage({ ...signed, publisher_key: { algorithm: "ed25519", spki_base64: other.signer.public_key_spki_base64 } }),
    invalidPackage("plugin.signer_mismatch"));
});

test("RAC-382-T1 signPluginPackage refuses a signer identity that does not name the public key it supplies", () => {
  const { bundle, signer, publicKey } = packageFixture(), other = packageFixture();
  assert.deepEqual(verifyPluginPackage(signPluginPackage(bundle, signer), publicKey).payload, bundle.payload);
  assert.throws(() => signPluginPackage(bundle, { ...signer, public_key_spki_base64: other.signer.public_key_spki_base64 }),
    invalidPackage("plugin.signer_mismatch"));
});

test("real CLI creates, packs, signs and verifies a Plugin while rejecting tampering, wrong identity and unsafe files", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-package-"));
  try {
    const keys = generateKeyPairSync("ed25519");
    const publicFile = join(directory, "public.pem");
    const privateFile = join(directory, "private.pem");
    writeFileSync(publicFile, keys.publicKey.export({ type: "spki", format: "pem" }));
    writeFileSync(privateFile, keys.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    const cli = fileURLToPath(new URL("../tooling/plugin-cli/dist/main.js", import.meta.url));
    const invoke = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: directory, encoding: "utf8" });
    const identity = JSON.parse(invoke("identity", publicFile).stdout).publisher_identity as string;
    const project = join(directory, "plugin");
    assert.equal(invoke("create", project, "io.molis.work.example.signed", "developer", identity).status, 0);
    const unsigned = join(directory, "unsigned.json");
    const signed = join(directory, "signed.json");
    const code = readFileSync(join(project, "index.mjs"), "utf8");
    assert.equal(invoke("pack", project, unsigned).status, 0);
    assert.equal(invoke("verify", unsigned, publicFile).status, 1, "unsigned development code is not verified distribution");
    const signResult = invoke("sign", unsigned, privateFile, signed);
    assert.equal(signResult.status, 0, signResult.stderr);
    assert.equal(signResult.stdout.includes("PRIVATE KEY"), false);
    const check = invoke("verify", signed, publicFile);
    assert.equal(check.status, 0, check.stderr);
    assert.equal(JSON.parse(check.stdout).verified, true);
    const data = JSON.parse(readFileSync(signed, "utf8"));
    const verified = verifyPluginPackage(data, keys.publicKey);
    assert.equal(Buffer.from(verified.payload.files.find(file => file.path === "index.mjs")!.content_base64, "base64").toString("utf8"), code);
    const untouched = readFileSync(signed, "utf8");
    assert.equal(invoke("sign", unsigned, privateFile, signed).status, 1, "existing output is not overwritten");
    assert.equal(readFileSync(signed, "utf8"), untouched);
    const wrong = generateKeyPairSync("ed25519");
    assert.throws(() => verifyPluginPackage(data, wrong.publicKey), (error: unknown) => (error instanceof ActionError && error.kind === "invalid")
      && error.code === "plugin.signer_mismatch");

    const tampered = structuredClone(data);
    tampered.payload.files.find((file: { path: string }) => file.path === "index.mjs").content_base64 = Buffer.from("throw new Error('changed')").toString("base64");
    assert.throws(() => verifyPluginPackage(tampered, keys.publicKey), (error: unknown) => (error instanceof ActionError && error.kind === "invalid")
      && error.code === "plugin.signature_invalid");
    const changedManifest = structuredClone(data);
    changedManifest.payload.manifest.name = "Changed outer manifest";
    assert.throws(() => parsePluginPackage(changedManifest), (error: unknown) => (error instanceof ActionError && ["plugin.package_invalid","plugin.signature_invalid","plugin.signer_mismatch"].includes(error.code) && error.kind === "invalid"), "outer Manifest cannot differ from imported manifest.json");
    const traversing = structuredClone(data);
    traversing.payload.files[0].path = "../outside";
    assert.throws(() => parsePluginPackage(traversing), (error: unknown) => (error instanceof ActionError && ["plugin.package_invalid","plugin.signature_invalid","plugin.signer_mismatch"].includes(error.code) && error.kind === "invalid"));

    const manifestPath = join(project, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.publisher.signature = "another-binding";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const other = join(directory, "other.json");
    assert.equal(invoke("pack", project, other).status, 0);
    assert.equal(invoke("sign", other, privateFile, join(directory, "bad-signed.json")).status, 1);
    assert.equal(existsSync(join(directory, "bad-signed.json")), false);
    const packagePath = join(project, "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    packageJson.files.push("stolen-key.pem");
    writeFileSync(packagePath, JSON.stringify(packageJson));
    symlinkSync(privateFile, join(project, "stolen-key.pem"));
    const leaked = join(directory, "leaked.json");
    assert.equal(invoke("pack", project, leaked).status, 1);
    assert.equal(existsSync(leaked), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
