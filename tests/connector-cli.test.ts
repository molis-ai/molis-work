import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { connectCli, inspectCliConnection, startCliLogin, cliLoginJob } from "../apps/local-host/src/connector-cli.ts";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.ts";
import { inspectSourceAuthorization } from "../apps/local-host/src/connector-access.ts";

test("official CLI fixed commands bind separate account identities and reject a later account switch", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-cli-"));
  const prior = process.env.PATH;
  const identityFile = join(home, "identity.json"), calls = join(home, "calls.jsonl");
  writeFileSync(join(home, "gh"), `#!${process.execPath}\nconst fs=require('node:fs'); fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(process.argv.slice(2))+'\\n'); process.stdout.write(fs.readFileSync(${JSON.stringify(identityFile)}));`, { mode: 0o755 });
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
    await inspectCliConnection(home, a.connection.connection_id, true);
    const requests = readFileSync(calls, "utf8").trim().split("\n").map(row => JSON.parse(row));
    assert.ok(requests.some(row => JSON.stringify(row) === '["api","notifications"]'));
    assert.ok(requests.every(row => row.length === 2 && row[0] === "api" && ["user", "notifications"].includes(row[1])));
    withConnectorConnections(home, store => store.disconnect(a.connection.connection_id));
    await assert.rejects(inspectCliConnection(home, a.connection.connection_id), /断开/u);
    setIdentity(2, "Alex");
    await inspectCliConnection(home, b.connection.connection_id);
  } finally { process.env.PATH = prior; rmSync(home, { recursive: true, force: true }); }
});

test("material authorization follows the selected connection and source lifecycle without returning credentials", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-source-auth-"));
  try {
    const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "Account", token: "private-token-never-output" }));
    const source = { kind: "github", sync_kind: "github", status: "active", enabled: true,
      config: { connection_id: connection.connection_id }, credential_ref: connection.credential_ref };
    const available = await inspectSourceAuthorization(home, source);
    assert.equal(available.authorized, true); assert.equal(available.connection_id, connection.connection_id);
    assert.equal(JSON.stringify(available).includes("private-token"), false);
    assert.equal((await inspectSourceAuthorization(home, { ...source, status: "paused" })).authorized, false);
    assert.equal((await inspectSourceAuthorization(home, { ...source, kind: "notion" })).authorized, false);
    withConnectorConnections(home, store => store.disconnect(connection.connection_id));
    assert.equal((await inspectSourceAuthorization(home, source)).authorized, false);
    assert.equal((await inspectSourceAuthorization(home, { ...source, sync_kind: "public_source", config: {}, credential_ref: null })).authorized, true);
  } finally { rmSync(home, { recursive: true, force: true }); }
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
