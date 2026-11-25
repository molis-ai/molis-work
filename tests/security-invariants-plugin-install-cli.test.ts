import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginInstalledView, PluginPublisherPin } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { createDesktopWebHost } from "@molis-ai/molis-work-app-desktop";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { HomeConsentLedger } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { installedAccountAuth } from "./fixtures/installed-account.js";
import { isolatedMcpResident } from "./fixtures/isolated-mcp-resident.js";
import { residentManagement } from "./fixtures/resident-management.js";

// S-84 (ac-trust T2), the command line's side: `molis-work plugin install` is made to the Home's resident Host, which runs the same two
// person-only actions the interface does. The route is behind the resident service's gate; a package that does not verify or is not in the
// format is refused before anything is written; without --confirm nothing is installed; no resident Host means no install in the command's own process.

const ROUTE = "/api/internal/plugin-install";
const mac = { skip: process.platform !== "darwin", timeout: 240_000 };
const launcher = fileURLToPath(new URL("../apps/desktop/launchers/cli/main.ts", import.meta.url));
const run = promisify(execFile);
/** The command prints one JSON line; Node may print warnings before it. */
const json = (text: string) => JSON.parse(text.trim().split("\n").at(-1)!);

function installCli(home: string, origin: string, args: string[]) {
  return run(process.execPath, ["--import", "tsx", launcher, "plugin", "install", ...args],
    { env: { ...process.env, MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin }, timeout: 120_000 }).then(
    ok => ({ code: 0, stdout: ok.stdout, stderr: ok.stderr }), (error: { code: number; stdout: string; stderr: string }) => ({ code: error.code, stdout: error.stdout, stderr: error.stderr }));
}

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
  const cli = (args: string[]) => installCli(env.home, env.origin, args);
  return { ...env, homeId, send, records, nothingWritten, cli };
}

test("RAC-393 S-84 the install route is behind the resident service's gate, takes only POST, and names its Home and project", async t => {
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

test("RAC-382 S-84 through the route an unsigned, altered or not-in-the-format package is refused, and nothing is written", async t => {
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

test("RAC-382 S-84 through the route a preview changes nothing; confirming a publisher that is not pinned needs a name, and then installs", mac, async t => {
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

test("RAC-382 S-84 molis-work plugin install previews without --confirm and installs with it; with no resident Host it stops", mac, async t => {
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

test("QRF-08 QRF-09 S-84 plugin install attaches to the signed-in installation and installs only in its selected project after confirmation", mac, async t => {
  const home = await mkdtemp(join(tmpdir(), "installed-plugin-cli-"));
  const { origin } = await isolatedMcpResident(home);
  const auth = await installedAccountAuth(home, origin);
  const previous = process.env;
  process.env = { ...previous, ...auth.environment };
  const server = createDesktopWebHost({ ptyClientFilePath: () => "/unused" })({ homeDirectory: home });
  t.after(async () => {
    try { await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); }
    finally {
      process.env = previous;
      await auth.close();
      await rm(home, { recursive: true, force: true });
    }
  });
  await new Promise<void>(done => server.listen(Number(new URL(origin).port), "127.0.0.1", done));
  const publisher = newPublisher();
  const file = join(home, "weekly.signed.json");
  await writeFile(file, JSON.stringify(signedPackage(publisher)));
  const confirm = ["--pin-as", "CLI Publisher", "--confirm"];
  const unknownProject = randomUUID();
  const anonymous = await installCli(home, origin, [file, unknownProject, ...confirm]);
  assert.equal(anonymous.code, 1);
  const refusal = json(anonymous.stderr);
  assert.equal(refusal.installed, false);
  assert.match(refusal.message, /登录|sign in|ログイン/i);

  const rootToken = (await readFile(join(home, "config/web-control-token"), "utf8")).trim();
  const account = await auth.login(home, rootToken);
  const created = await account.request("/api/settings/projects", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ display_name: "Author's receiver", user_confirmed: true }) });
  assert.equal(created.status, 201, await created.clone().text());
  const { project } = await created.json() as { project: { project_id: string } };
  const overview = async () => {
    const response = await account.request(`/projects/${encodeURIComponent(project.project_id)}/api/plugin-trust/overview`);
    assert.equal(response.status, 200, await response.clone().text());
    return await response.json() as { plugins: PluginInstalledView[]; publishers: PluginPublisherPin[] };
  };
  const outside = await installCli(home, origin, [file, unknownProject, ...confirm]);
  assert.equal(outside.code, 1);
  assert.equal(json(outside.stderr).code, "actions.scope_mismatch");
  const preview = await installCli(home, origin, [file, project.project_id, "--pin-as", "CLI Publisher"]);
  assert.equal(preview.code, 0, preview.stderr);
  assert.deepEqual([json(preview.stdout).installed, json(preview.stdout).preview.publisher.key_id], [false, publisher.identity]);
  const before = await overview();
  assert.equal(before.plugins.some(row => row.plugin_id === PACKAGE_PLUGIN_ID), false);
  assert.equal(before.publishers.some(row => row.key_id === publisher.identity), false);
  const confirmed = await installCli(home, origin, [file, project.project_id, ...confirm]);
  assert.equal(confirmed.code, 0, confirmed.stderr);
  assert.deepEqual(json(confirmed.stdout).installed, { plugin_id: PACKAGE_PLUGIN_ID, version: "1.0.0", publisher_key_id: publisher.identity });
  const rows = (await overview()).plugins.filter(row => row.plugin_id === PACKAGE_PLUGIN_ID);
  assert.deepEqual(rows.map(row => [row.version, row.trust, row.publisher_signature, row.publisher_label, row.state]),
    [["1.0.0", "pinned", publisher.identity, "CLI Publisher", "running"]]);
});
