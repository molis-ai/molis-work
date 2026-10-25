import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { HomeConsentLedger } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { residentManagement } from "./fixtures/resident-management.js";

// S-81 (ac-trust T2), the command line's side: `molis-work plugin install` is made to the Home's resident Host, which runs the same two
// person-only actions the interface does. The route is behind the resident service's gate; a package that does not verify or is not in the
// format is refused before anything is written; without --confirm nothing is installed; no resident Host means no install in the command's own process.

const ROUTE = "/api/internal/plugin-install";
const mac = { skip: process.platform !== "darwin", timeout: 90_000 };
const launcher = fileURLToPath(new URL("../apps/desktop/launchers/cli/main.ts", import.meta.url));
const run = promisify(execFile);
/** The command prints one JSON line; Node may print warnings before it. */
const json = (text: string) => JSON.parse(text.trim().split("\n").at(-1)!);

async function setup(t: Parameters<typeof residentManagement>[0]) {
  const env = await residentManagement(t, { completeText: null });
  const homeId = createHash("sha256").update(resolve(env.home)).digest("hex");
  const send = async (body: Record<string, unknown>, overrides: Record<string, string | undefined> = {}) => {
    const response = await fetch(env.origin + ROUTE, { method: "POST", headers: env.headers(overrides), body: JSON.stringify({ home_id: homeId, project_id: env.project.project_id, ...body }) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  const records = () => env.host.withProject(env.reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).list().filter((item: PluginInstanceRecord) => item.plugin_id === PACKAGE_PLUGIN_ID));
  const nothingWritten = async () => {
    assert.deepEqual(new HomeConsentLedger(env.home).publishers(), [], "no publisher was pinned");
    assert.deepEqual(await records(), [], "nothing was installed");
  };
  const cli = (args: string[], url = env.origin) => run(process.execPath, ["--import", "tsx", launcher, "plugin", "install", ...args],
    { env: { ...process.env, MOLIS_WORK_HOME: env.home, MOLIS_WORK_WEB_URL: url }, timeout: 60_000 }).then(
    ok => ({ code: 0, stdout: ok.stdout, stderr: ok.stderr }), (error: { code: number; stdout: string; stderr: string }) => ({ code: error.code, stdout: error.stdout, stderr: error.stderr }));
  return { ...env, homeId, send, records, nothingWritten, cli };
}

test("RAC-393 S-81 the install route is behind the resident service's gate, takes only POST, and names its Home and project", async t => {
  const env = await setup(t);
  const bundle = signedPackage(newPublisher());
  assert.equal((await env.send({ bundle }, { "x-molis-work-control-token": undefined })).status >= 400, true, "no control token");
  assert.equal((await env.send({ bundle }, { origin: "http://127.0.0.1:1" })).status >= 400, true, "another origin");
  assert.equal((await fetch(env.origin + ROUTE, { method: "GET", headers: env.headers() })).status, 405);
  assert.equal((await env.send({ bundle, home_id: createHash("sha256").update("another-home").digest("hex") })).body.code, "actions.home_mismatch");
  assert.equal((await env.send({ bundle, project_id: randomUUID() })).body.code, "actions.scope_mismatch");
  assert.equal((await env.send({ bundle, extra: true })).body.code, "actions.input_invalid");
  assert.equal((await env.send({ bundle: "text" })).body.code, "actions.input_invalid");
  await env.nothingWritten();
});

test("RAC-382 S-81 through the route an unsigned, altered or not-in-the-format package is refused, and nothing is written", async t => {
  const env = await setup(t);
  const unsigned = { ...signedPackage(newPublisher()), signature: null, publisher_key: null };
  const altered = signedPackage(newPublisher());
  altered.payload.files[0]!.content_base64 = Buffer.from("changed after signing").toString("base64");
  const notInTheFormat = signedPackage(newPublisher(), files => { files["extra.txt"] = "not part of the format"; });
  for (const [bundle, code] of [[unsigned, "plugin.signature_invalid"], [altered, "plugin.signature_invalid"], [notInTheFormat, "plugin.declaration_invalid"]] as const) {
    for (const confirm of [false, true]) assert.equal((await env.send({ bundle, confirm, pin_label: "Example" })).body.code, code);
  }
  await env.nothingWritten();
});

test("RAC-382 S-81 through the route a preview changes nothing; confirming a publisher that is not pinned needs a name, and then installs", mac, async t => {
  const env = await setup(t);
  const publisher = newPublisher(), bundle = signedPackage(publisher);
  const preview = await env.send({ bundle });
  assert.equal(preview.status, 200);
  assert.deepEqual([preview.body.installed, (preview.body.preview as { publisher: { key_id: string } }).publisher.key_id], [undefined, publisher.identity]);
  await env.nothingWritten();
  assert.equal((await env.send({ bundle, confirm: true })).body.code, "plugin.publisher_untrusted");
  await env.nothingWritten();
  const installed = await env.send({ bundle, confirm: true, pin_label: "Example" });
  assert.equal(installed.status, 200, JSON.stringify(installed.body));
  assert.deepEqual(installed.body.installed, { plugin_id: PACKAGE_PLUGIN_ID, version: "1.0.0", publisher_key_id: publisher.identity });
  assert.deepEqual((await env.records()).map(item => [item.publisher_trust, item.publisher_signature, item.state]), [["pinned", publisher.identity, "running"]]);
  assert.deepEqual(new HomeConsentLedger(env.home).publishers().map(pin => [pin.key_id, pin.label]), [[publisher.identity, "Example"]]);
});

test("RAC-382 S-81 molis-work plugin install previews without --confirm and installs with it; with no resident Host it stops", mac, async t => {
  const env = await setup(t);
  const publisher = newPublisher(), file = join(env.home, "package.json");
  await writeFile(file, JSON.stringify(signedPackage(publisher)));
  const preview = await env.cli([file, env.project.project_id]);
  assert.equal(preview.code, 0, preview.stderr);
  assert.equal(json(preview.stdout).installed, false);
  await env.nothingWritten();
  const refused = await env.cli([file, env.project.project_id, "--confirm"]);
  assert.equal(refused.code, 1);
  assert.equal(json(refused.stderr).code, "plugin.publisher_untrusted");
  await env.nothingWritten();
  const installed = await env.cli([file, env.project.project_id, "--confirm", "--pin-as", "Example"]);
  assert.equal(installed.code, 0, installed.stderr);
  assert.equal(json(installed.stdout).installed.plugin_id, PACKAGE_PLUGIN_ID);
  assert.equal((await env.records()).length, 1);

  await env.stop();
  const alone = await env.cli([file, env.project.project_id, "--confirm", "--pin-as", "Example"]);
  assert.equal(alone.code, 1);
  assert.equal(json(alone.stderr).code, "actions.service_unavailable");
});
