import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { connectCli, inspectCliConnection, startCliLogin, cliLoginJob } from "../apps/local-host/dist/connector-cli.js";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { withConnectorConnections, connectorRecordActions, connectorCliActions, CONNECTOR_RECORDS_READ, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { openTestHome } from "./fixtures/test-home.js";

test("ASC-03 ASC-04: official CLI fixed commands bind separate account identities and reject a later account switch", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-cli-"));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const prior = process.env.PATH;
  const identityFile = join(home, "identity.json"), recordsFile = join(home, "records.json"), calls = join(home, "calls.jsonl");
  writeFileSync(recordsFile, JSON.stringify(Array.from({ length: 50 }, (_, id) => ({ id, body: "record-body ".repeat(200) }))));
  writeFileSync(join(home, "gh"), `#!${process.execPath}\nconst fs=require('node:fs'); fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(process.argv.slice(2))+'\\n'); process.stdout.write(fs.readFileSync(process.argv.includes('notifications')?${JSON.stringify(recordsFile)}:${JSON.stringify(identityFile)}));`, { mode: 0o755 });
  process.env.PATH = `${home}:${prior}`;
  try {
    const setIdentity = (id: number, name: string) => writeFileSync(identityFile, JSON.stringify({ id, login: name, access_token: "must-stay-private" }));
    setIdentity(1, "Alex");
    const a = await connectCli(home, { serviceId: "github", displayName: "First" });
    assert.equal(JSON.stringify(a.result).includes("must-stay-private"), false);
    setIdentity(2, "Alex");
    const b = await connectCli(home, { serviceId: "github", displayName: "Second" });
    assert.notEqual(a.connection.connection_id, b.connection.connection_id);
    await assert.rejects(inspectCliConnection(home, a.connection.connection_id), /账号已改变/u);
    setIdentity(1, "New display name");
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try {
      const records = await host.homeActionClient().invoke({ actor_id: "assistant:cli", audience: "agent", project_id: null, permissions: [CONNECTOR_RECORDS_READ] },
        connectorRecordActions.read, { connection_id: a.connection.connection_id }) as { result: { record_count: number; result: unknown[] } };
      assert.equal(records.result.record_count, 50, "ASC-30: report the full batch count before large record content");
      assert.equal(records.result.result.length, 50);
      assert.ok(JSON.stringify(records).length > 65_536, "the batch exercises output large enough to be truncated for a model");
      assert.match(JSON.stringify(records).slice(0, 65_536), /"record_count":50/, "the count remains in the visible prefix");
      assert.doesNotMatch(JSON.stringify(records), /must-stay-private/);
      assert.equal("record_count" in await inspectCliConnection(home, a.connection.connection_id), false, "identity is not a record list");
      writeFileSync(recordsFile, "[]");
      assert.equal((await inspectCliConnection(home, a.connection.connection_id, true)).record_count, 0);
      writeFileSync(recordsFile, '{"details":"no list"}');
      assert.equal("record_count" in await inspectCliConnection(home, a.connection.connection_id, true), false);
    } finally { await host.close(); }
    const requests = readFileSync(calls, "utf8").trim().split("\n").map(row => JSON.parse(row));
    assert.ok(requests.some(row => JSON.stringify(row) === '["api","notifications"]'));
    assert.ok(requests.every(row => row.length === 2 && row[0] === "api" && ["user", "notifications"].includes(row[1])));
    withConnectorConnections(home, store => store.disconnect(a.connection.connection_id));
    await assert.rejects(inspectCliConnection(home, a.connection.connection_id), /断开/u);
    setIdentity(2, "Alex");
    await inspectCliConnection(home, b.connection.connection_id);
  } finally { process.env.PATH = prior; rmSync(home, { recursive: true, force: true }); }
});

test("ASC-19 ASC-20: an explicit CLI reconnect restores its own account, but late identity checks cannot undo removal", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-cli-reconnect-")), prior = process.env.PATH;
  const gate = join(home, "hold"), entered = join(home, "entered");
  writeFileSync(join(home, "gh"), `#!${process.execPath}\nconst fs=require('node:fs');const gate=${JSON.stringify(gate)};
const finish=()=>process.stdout.write(JSON.stringify({id:1,login:'work-account'}));
if(fs.existsSync(gate)){fs.writeFileSync(${JSON.stringify(entered)},'entered');const timer=setInterval(()=>{if(!fs.existsSync(gate)){clearInterval(timer);finish();}},20);}else finish();`, { mode: 0o755 });
  process.env.PATH = `${home}:${prior}`;
  try {
    const input = { serviceId: "github", displayName: "Work" };
    const connected = await connectCli(home, input), id = connected.connection.connection_id;
    writeFileSync(gate, "hold");
    const pending = connectCli(home, input), rejected = assert.rejects(pending, /检查期间连接已变化/);
    const deadline = Date.now() + 5000;
    while (!existsSync(entered)) { assert.ok(Date.now() < deadline, "CLI identity request must reach the barrier"); await new Promise(resolve => setTimeout(resolve, 20)); }
    withConnectorConnections(home, store => store.remove(id));
    rmSync(gate); await rejected;
    assert.deepEqual(withConnectorConnections(home, store => store.list()), []);
    const restored = await connectCli(home, input);
    assert.equal(restored.connection.connection_id, id);
    assert.equal(restored.connection.state, "connected");
    await inspectCliConnection(home, id);
  } finally { process.env.PATH = prior; rmSync(home, { recursive: true, force: true }); }
});


test("ASC-16 ASC-25: cancelling or toggling a connection aborts an active CLI check before the business read", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-cli-cancel-")), prior = process.env.PATH;
  const hold = join(home, "hold"), entered = join(home, "entered"), stopped = join(home, "stopped"), reads = join(home, "reads");
  writeFileSync(join(home, "gh"), `#!${process.execPath}
const fs=require('node:fs');
if(process.argv.includes('notifications')) fs.appendFileSync(${JSON.stringify(reads)},'read');
if(fs.existsSync(${JSON.stringify(hold)})) {
  fs.writeFileSync(${JSON.stringify(entered)},'waiting');
  process.on('SIGTERM',()=>{fs.writeFileSync(${JSON.stringify(stopped)},'stopped');process.exit(0);});
  setInterval(()=>{},1000);
} else process.stdout.write(JSON.stringify({id:1,login:'same-account'}));`, { mode: 0o755 });
  process.env.PATH = `${home}:${prior}`;
  const waitFor = async (path: string) => {
    const deadline = Date.now() + 5000;
    while (!existsSync(path)) { assert.ok(Date.now() < deadline, `CLI must reach ${path}`); await new Promise(resolve => setTimeout(resolve, 20)); }
  };
  try {
    const saved = await connectCli(home, { serviceId: "github", displayName: "Work" }), id = saved.connection.connection_id;
    writeFileSync(hold, "hold");
    for (const mode of ["caller", "connection"] as const) {
      const controller = new AbortController();
      const pending = inspectCliConnection(home, id, true, controller.signal);
      const rejected = assert.rejects(pending, /stop-check|连接已改变/);
      await waitFor(entered);
      if (mode === "caller") controller.abort(new Error("stop-check"));
      else withConnectorConnections(home, store => { store.setEnabled(id, false); store.setEnabled(id, true); });
      await rejected; await waitFor(stopped);
      assert.equal(existsSync(reads), false, "cancelled checks never dispatch the next business read");
      rmSync(entered); rmSync(stopped);
    }
    rmSync(hold);
    await inspectCliConnection(home, id, true);
    assert.equal(readFileSync(reads, "utf8"), "read");
  } finally { process.env.PATH = prior; rmSync(home, { recursive: true, force: true }); }
});

test("CLI adapters consume the official identity shapes, reject ambiguous tenants, and pin Sentry host", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-cli-schema-")), prior = process.env.PATH;
  const response = join(home, "response.json");
  const fixtures = [
    ["hubspot", "hubspot", "  User: jane@example.com\n  Portal: 12345678\nScopes: crm.objects.contacts.read"],
    ["jira", "acli", "✓ Authenticated\n  Site: example.atlassian.net\n  Email: jane@example.com\n  Authentication Type: oauth"],
    ["salesforce", "sf", { status: 0, result: { statusCode: 200, body: { organization_id: "00D1", user_id: "0051", preferred_username: "jane@example.com" } } }],
    ["supabase", "supabase", { id: "user-uuid", email: "jane@example.com", username: "jane" }],
    ["feishu", "lark-cli", { brand: "feishu", appId: "cli_a", identities: { user: { available: true, verified: true, openId: "ou_a", userName: "Jane" } } }],
    ["sentry", "sentry", { id: "123", email: "jane@example.com" }],
    ["cloudflare", "wrangler", { loggedIn: true, authType: "Account API Token", accounts: [{ id: "account-1", name: "Account" }] }],
  ] as const;
  try {
    process.env.PATH = `${home}:${prior}`;
    for (const [serviceId, binary, payload] of fixtures) {
      writeFileSync(response, typeof payload === "string" ? payload : JSON.stringify(payload));
      writeFileSync(join(home, binary), `#!${process.execPath}\nif(${JSON.stringify(serviceId)}==='sentry'&&(process.env.SENTRY_HOST!=='https://sentry.io'||process.env.SENTRY_URL!=='https://sentry.io'))process.exit(2); process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(response)}));`, { mode: 0o755 });
      const connected = await connectCli(home, { serviceId, displayName: serviceId });
      assert.equal(connected.connection.state, "connected", serviceId);
      await inspectCliConnection(home, connected.connection.connection_id);
    }
    writeFileSync(response, JSON.stringify({ loggedIn: true, authType: "API Token", accounts: [{ id: "account-1", name: "Account" }] }));
    await assert.rejects(connectCli(home, { serviceId: "cloudflare", displayName: "Ambiguous" }), /账号身份/u);
  } finally { process.env.PATH = prior; rmSync(home, { recursive: true, force: true }); }
});

test("CLI login uses a real PTY and never returns echoed interactive credentials", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-cli-pty-")), prior = process.env.PATH;
  writeFileSync(join(home, "gh"), `#!${process.execPath}\nprocess.stdin.setRawMode(true); process.stdout.write('Enter value:'); process.stdin.on('data', data=>{ process.stdout.write(data); if(data.includes(13)||data.includes(10))process.exit(0); });`, { mode: 0o755 });
  process.env.PATH = `${home}:${prior}`;
  let jobId: string | undefined;
  try {
    jobId = (await startCliLogin(home, "github")).job_id;
    const submitted = "interactive-secret-for-test";
    for (let attempt = 0; attempt < 100 && !cliLoginJob(home, jobId).output.includes("Enter value:"); attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.match(cliLoginJob(home, jobId).output, /Enter value:/u);
    cliLoginJob(home, jobId, submitted);
    let result = cliLoginJob(home, jobId);
    for (let attempt = 0; attempt < 50 && result.status === "running"; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20)); result = cliLoginJob(home, jobId);
      assert.equal(result.output.includes(submitted), false);
    }
    assert.equal(result.status, "succeeded");
  } finally { if (jobId) cliLoginJob(home, jobId, undefined, true); process.env.PATH = prior; rmSync(home, { recursive: true, force: true }); }
});

// RAC-2415: a package may declare the service id `constructor` (SDK SERVICE_ID allows it); a prototype member is not a CLI this Host
// knows. Through the public prepare action the refusal is the same one an unregistered service gets, not what the prototype answered.
test("RAC-2415 a service id that names a prototype member is no CLI this Host knows", async t => {
  const f = await openTestHome(t), actions = f.host.homeActionClient();
  const caller: ActionCallContext = { actor_id: "user-1", audience: "user", project_id: null, permissions: ["connectors:management:write"] };
  const refusal = async (service_id: string) => {
    const error = await actions.invoke(caller, connectorCliActions.prepare, { service_id, display_name: "Prototype", version: "1.2.3" })
      .then(() => null, (failure: unknown) => failure);
    assert.ok(error instanceof ActionError, `a refusal, not ${String(error)}`);
    return { code: error.code, message: error.message };
  };
  const missing = await refusal("no-such-service");
  assert.deepEqual(await refusal("constructor"), missing);
  assert.deepEqual(await refusal("__proto__"), missing);
});
