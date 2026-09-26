import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parsePluginPackage, verifyPluginPackage, PluginPackageError } from "@molis-ai/molis-work-plugin-runtime";

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
    assert.throws(() => verifyPluginPackage(data, wrong.publicKey), (error: unknown) => error instanceof PluginPackageError
      && error.code === "plugin_signer_mismatch");

    const tampered = structuredClone(data);
    tampered.payload.files.find((file: { path: string }) => file.path === "index.mjs").content_base64 = Buffer.from("throw new Error('changed')").toString("base64");
    assert.throws(() => verifyPluginPackage(tampered, keys.publicKey), (error: unknown) => error instanceof PluginPackageError
      && error.code === "plugin_signature_invalid");
    const changedManifest = structuredClone(data);
    changedManifest.payload.manifest.name = "Changed outer manifest";
    assert.throws(() => parsePluginPackage(changedManifest), PluginPackageError, "outer Manifest cannot differ from imported manifest.json");
    const traversing = structuredClone(data);
    traversing.payload.files[0].path = "../outside";
    assert.throws(() => parsePluginPackage(traversing), PluginPackageError);

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
