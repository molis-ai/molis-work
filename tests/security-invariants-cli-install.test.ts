import assert from "node:assert/strict";
import test from "node:test";
import { writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { connectorCliActions, connectorManagementActions, connectorRecordActions, CONNECTOR_RECORDS_READ, withConnectorConnections, MolisWorkLocalHost, connectorSetupIntentAction, holdConnectorAuthorizationsForSession } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createCliPackageFixture } from "./fixtures/connector-cli-package.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

const caller: ActionCallContext = { actor_id: "cli-installer", runtime_session_id: "cli-install-session", audience: "agent", project_id: null,
  permissions: ["connectors:management:read", "connectors:management:write", CONNECTOR_RECORDS_READ] };
type Setup = { authorization_id: string; url: string; setup: { cli_setup: { package: string } } };
type Status = { status: string; installation_ready?: boolean; connection_id: string; completion_ready?: boolean };

async function eventually(run: () => Promise<boolean>, message: string) {
  const deadline = Date.now() + 10_000;
  while (!await run()) { assert.ok(Date.now() < deadline, message); await new Promise(resolve => setTimeout(resolve, 20)); }
}
const installations = (home: string) => join(home, "runtime", "connectors", "installs");


test("S-36 ASC-07 ASC-14 ASC-19 ASC-22: an installed CLI keeps its own login, connects after the page leaves, survives restart and reads through the shared owner", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), source = await createCliPackageFixture(t, home.home), actions = home.host.homeActionClient();
  writeFileSync(join(home.home, ".env"), "ASC_PRIVATE_HOST_VALUE=fixture-config-must-not-load");
  const request = await actions.invoke(caller, connectorCliActions.prepare, source.input) as Setup;
  assert.equal(request.setup.cli_setup.package, "vercel");
  const denied = await fetch(home.origin + "/api/settings/connectors/methods/cli/install", { method: "POST", body: JSON.stringify({ setup_id: request.authorization_id }), headers: { "content-type": "application/json" } });
  assert.equal(denied.status, 403); assert.equal(source.downloads(), 0);
  const previous = process.env.ASC_PRIVATE_HOST_VALUE; process.env.ASC_PRIVATE_HOST_VALUE = "private-host-marker";
  try {
    const installed = await actions.invoke(caller, connectorCliActions.install, { authorization_id: request.authorization_id }) as { status: string };
    assert.equal(installed.status, "needs_person"); assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
    const id = readdirSync(installations(home.home))[0]!, directory = join(installations(home.home), id);
    const downloads = source.downloads();
    await actions.invoke(caller, connectorCliActions.install, { authorization_id: request.authorization_id }); assert.equal(source.downloads(), downloads);
    const state = () => actions.invoke(caller, connectorManagementActions.authorization, { authorization_id: request.authorization_id }) as Promise<Status>;
    assert.equal((await state()).status, "prepared"); assert.equal((await state()).installation_ready, true);
    await assert.rejects(actions.invoke(caller, connectorCliActions.connect, { authorization_id: request.authorization_id }), /登录/);
    assert.equal((await state()).status, "failed"); assert.equal(existsSync(directory), true);
    const page = await (await fetch(home.origin + request.url)).text(); assert.match(page, /检查已安装客户端/); assert.match(page, /登录并连接/);
    await assert.rejects(home.web.post("/api/settings/connectors/methods/cli/login", { service_id: "github", setup_id: request.authorization_id }));
    const job = await home.web.post<{ job_id: string }>("/api/settings/connectors/methods/cli/login", { service_id: "vercel", setup_id: request.authorization_id });
    await eventually(async () => (await home.web.post<{ output: string }>("/api/settings/connectors/methods/cli/job", { job_id: job.job_id })).output.includes("Enter fixture login:"), "login must reach its real PTY prompt");
    const resumed = await (await fetch(home.origin + request.url)).text(); assert.match(resumed, new RegExp(`data-cli-job="${job.job_id}"`));
    assert.doesNotMatch(JSON.stringify(await state()), /cli_job|Enter fixture login/);
    const secret = "cli-private-login-input";
    const echo = await home.web.post("/api/settings/connectors/methods/cli/job", { job_id: job.job_id, input: secret }); assert.doesNotMatch(JSON.stringify(echo), /cli-private-login-input/);
    // No page/client submits cli/connect; the Host must finish the original request on process exit.
    await eventually(async () => (await state()).status === "connected", "successful CLI login must complete its original request without an open page");
    const connected = await state(); assert.equal(source.downloads(), downloads);
    assert.equal(withConnectorConnections(home.home, store => store.list()).length, 1);
    await actions.invoke(caller, connectorCliActions.connect, { authorization_id: request.authorization_id });
    assert.equal(withConnectorConnections(home.home, store => store.list()).length, 1, "duplicate completion only reads its prior result");
    await home.close(); await home.host.close();
    const restored = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null }), served = await serveTestHost(null, { home: home.home, host: restored });
    try {
      const result = await restored.homeActionClient().invoke(caller, connectorRecordActions.read, { connection_id: connected.connection_id });
      assert.match(JSON.stringify(result), /managed-client-project/); assert.doesNotMatch(JSON.stringify(result), /cli-private-login-input|private-host-marker/);
      const history = readFileSync(join(directory, ".home/calls.jsonl"), "utf8").trim().split("\n").map(row => JSON.parse(row));
      assert.equal(history.filter(args => args[0] === "project").length, 1);
      writeFileSync(join(home.home, "business-result.txt"), "keep");
      const revision = withConnectorConnections(home.home, store => store.require(connected.connection_id).updated_at);
      await restored.homeActionClient().invoke(caller, connectorManagementActions.control, { connection_id: connected.connection_id, expected_revision: revision, action: "remove" });
      assert.equal(existsSync(directory), false); assert.equal(readFileSync(join(home.home, "business-result.txt"), "utf8"), "keep");
    } finally { await served.close(); await restored.close(); }
  } finally { if (previous === undefined) delete process.env.ASC_PRIVATE_HOST_VALUE; else process.env.ASC_PRIVATE_HOST_VALUE = previous; }
});

test("S-36 ASC-07 ASC-25 ASC-34: cancelling a CLI login kills its PTY and clears its candidate; a held completion waits for the latest intent", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), source = await createCliPackageFixture(t, home.home), actions = home.host.homeActionClient();
  const prepare = () => actions.invoke(caller, connectorCliActions.prepare, source.input) as Promise<Setup>;
  const install = (id: string) => actions.invoke(caller, connectorCliActions.install, { authorization_id: id });
  const status = (id: string) => actions.invoke(caller, connectorManagementActions.authorization, { authorization_id: id }) as Promise<Status>;
  const start = async (id: string) => {
    const job = await home.web.post<{ job_id: string }>("/api/settings/connectors/methods/cli/login", { service_id: "vercel", setup_id: id });
    await eventually(async () => (await home.web.post<{ output: string }>("/api/settings/connectors/methods/cli/job", { job_id: job.job_id })).output.includes("Enter fixture login:"), "login prompt"); return job;
  };
  const first = await prepare(); await install(first.authorization_id); const job = await start(first.authorization_id);
  const id = readdirSync(installations(home.home))[0]!, pid = Number(readFileSync(join(installations(home.home), id, ".home/login.pid"), "utf8"));
  await actions.invoke(caller, connectorManagementActions.cancel, { authorization_id: first.authorization_id });
  await eventually(async () => { try { process.kill(pid, 0); return false; } catch { return true; } }, "cancel must terminate its CLI login process");
  assert.deepEqual(readdirSync(installations(home.home)), []); assert.equal((await status(first.authorization_id)).status, "cancelled");
  assert.equal((await home.web.post<{ status: string }>("/api/settings/connectors/methods/cli/job", { job_id: job.job_id })).status, "failed");
  const held = await prepare(); await install(held.authorization_id); const waiting = await start(held.authorization_id);
  holdConnectorAuthorizationsForSession(home.home, caller.runtime_session_id!, caller.actor_id, "latest-cli-intent");
  await home.web.post("/api/settings/connectors/methods/cli/job", { job_id: waiting.job_id, input: "fixture-input" });
  await eventually(async () => (await status(held.authorization_id)).completion_ready === true, "login completion must be retained behind the current intent");
  assert.equal(withConnectorConnections(home.home, store => store.list()).length, 0);
  await actions.invoke(caller, connectorSetupIntentAction, { authorization_id: held.authorization_id, intent_revision: "latest-cli-intent", decision: "retain" });
  assert.equal((await status(held.authorization_id)).status, "connected"); assert.equal(readdirSync(installations(home.home)).length, 1);
});

test("S-36 ASC-19 ASC-22: Host shutdown terminates its CLI login; restart keeps the installation and permits a fresh login", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), source = await createCliPackageFixture(t, home.home), actions = home.host.homeActionClient();
  const prepared = await actions.invoke(caller, connectorCliActions.prepare, source.input) as Setup;
  await actions.invoke(caller, connectorCliActions.install, { authorization_id: prepared.authorization_id });
  const start = (web: typeof home.web) => web.post<{ job_id: string }>("/api/settings/connectors/methods/cli/login", { service_id: "vercel", setup_id: prepared.authorization_id });
  const job = await start(home.web);
  await eventually(async () => (await home.web.post<{ output: string }>("/api/settings/connectors/methods/cli/job", { job_id: job.job_id })).output.includes("Enter fixture login:"), "first prompt");
  const id = readdirSync(installations(home.home))[0]!, directory = join(installations(home.home), id);
  const pid = Number(readFileSync(join(directory, ".home/login.pid"), "utf8")), downloads = source.downloads();
  await home.close(); await home.host.close();
  assert.throws(() => process.kill(pid, 0)); assert.equal(existsSync(directory), true);
  const restored = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null }), served = await serveTestHost(null, { home: home.home, host: restored });
  try {
    const fresh = await start(served.web); assert.notEqual(fresh.job_id, job.job_id);
    await eventually(async () => (await served.web.post<{ output: string }>("/api/settings/connectors/methods/cli/job", { job_id: fresh.job_id })).output.includes("Enter fixture login:"), "restarted prompt");
    await served.web.post("/api/settings/connectors/methods/cli/job", { job_id: fresh.job_id, input: "after-restart" });
    await eventually(async () => (await restored.homeActionClient().invoke(caller, connectorManagementActions.authorization, { authorization_id: prepared.authorization_id }) as Status).status === "connected", "fresh login completes the original request");
    assert.equal(source.downloads(), downloads); assert.equal(withConnectorConnections(home.home, store => store.list()).length, 1);
  } finally { await served.close(); await restored.close(); }
});
