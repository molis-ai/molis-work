import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readSandboxPackage } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { newPublisher, packageContract, packageFiles } from "./fixtures/sandbox-package.js";

const cli = fileURLToPath(new URL("../tooling/plugin-cli/dist/main.js", import.meta.url));

test("SCS-15 a signed sandbox operation's external flag survives pack, signature verification and Host validation", t => {
  const directory = mkdtempSync(join(tmpdir(), "sandbox-presentation-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const publisher = newPublisher();
  const root = join(directory, "source");
  mkdirSync(root);
  const contract = packageContract();
  contract.operations[1]!.external = true;
  const { files } = packageFiles(publisher.identity, files => { files["contract.json"] = JSON.stringify(contract); });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content!);
  const key = join(directory, "key.pem");
  writeFileSync(key, publisher.keys.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  const unsigned = join(directory, "unsigned.json"), signed = join(directory, "signed.json");
  const invoke = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  const args = ["--name", "Authored notes", "--version", "1.0.0", "--publisher-id", "author", "--publisher-key-id", publisher.identity];
  const packed = invoke("pack-sandbox", root, unsigned, ...args);
  assert.equal(packed.status, 0, packed.stderr);
  const signing = invoke("sign", unsigned, key, signed);
  assert.equal(signing.status, 0, signing.stderr);
  const { payload } = verifyPluginPackageSignature(JSON.parse(readFileSync(signed, "utf8"))).bundle;
  const kept = readSandboxPackage(payload);
  assert.equal(kept.contract.operations[1]?.external, true);
  assert.equal(kept.manifest.actions?.find(action => action.action.local_id === "notes.add")?.action.external, true);
  assert.equal(kept.manifest.actions?.find(action => action.action.local_id === "notes.list")?.action.external, undefined);

  const invalid = { ...contract, operations: [contract.operations[0], { ...contract.operations[1], external: false }] };
  writeFileSync(join(root, "contract.json"), JSON.stringify(invalid));
  const bad = join(directory, "bad.json");
  assert.equal(invoke("pack-sandbox", root, bad, ...args).status, 1);
  assert.equal(existsSync(bad), false);
  const badPayload = structuredClone(payload);
  badPayload.files.find(file => file.path === "contract.json")!.content_base64 = Buffer.from(JSON.stringify(invalid)).toString("base64");
  assert.throws(() => readSandboxPackage(badPayload), error => error instanceof ActionError && error.code === "plugin.declaration_invalid" && /external/u.test(error.message));
});
