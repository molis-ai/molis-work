import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { lstat, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { basename, join } from "node:path";
import test, { type TestContext } from "node:test";
import { completeApiOAuth, DEMO_PROJECT_ID, startApiOAuth, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { homeSqlitePath, readSecretsFileMeta, resolveHomeSecurityDirectory, runWithMolisWorkHome, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { accountSourceRecord } from "./fixtures/feed-account-source.js";
import { bindLocalFeedSourceAccount, createLocalFeedApplication, createLocalFeedConnectorSync } from "./fixtures/feed-library.js";
import { withIntegrationHome } from "./fixtures/integration-home.js";

type Service = "github" | "gmail";
const HOME_PREFIX = "molis-live-feed-home-";

async function preparedHome(directory: string | undefined): Promise<string> {
  assert.ok(directory, "Set MOLIS_WORK_LIVE_FEED_HOME to the prepared temporary Home");
  const temp = await realpath("/tmp");
  const name = basename(directory);
  const home = join(temp, name);
  assert.ok(/^molis-live-feed-home-[a-zA-Z0-9]{6,}$/u.test(name) && (directory === home || directory === join("/tmp", name)),
    "Use a dedicated Home created with mktemp -d /tmp/molis-live-feed-home-XXXXXXXX");
  const stat = await lstat(home);
  assert.ok(stat.isDirectory() && stat.uid === process.getuid?.() && (stat.mode & 0o777) === 0o700,
    "The prepared Home must be a private directory owned by this user");
  const secrets = runWithMolisWorkHome(home, resolveHomeSecurityDirectory);
  for (const file of [homeSqlitePath(home, "connectors"), join(secrets, "secrets.json"), join(secrets, "secrets.key")]) {
    assert.ok(await realpath(file) === file, "Prepare the OAuth connections with files inside the temporary Home");
  }
  assert.equal(runWithMolisWorkHome(home, readSecretsFileMeta).backend, "aes-gcm-file", "Prepare the Home with the file secret backend");
  return home;
}

async function syncPreparedAccount(kind: Service, directory: string | undefined, db: SqliteDatabase, t: TestContext): Promise<number> {
  const home = await preparedHome(directory);
  const accounts = withConnectorConnections(home, rows => rows.list(kind)
    .filter(row => row.auth_method === "oauth" && rows.state(row) === "connected"));
  assert.equal(accounts.length, 1, `Prepare exactly one connected ${kind} OAuth test account in the temporary Home`);
  const account = accounts[0]!;
  const feed = createLocalFeedApplication(db);
  const source = feed.sources.upsert(accountSourceRecord(kind, { source_id: `${kind}-${randomUUID()}`, status: "active" }));
  bindLocalFeedSourceAccount(home, source, account.connection_id);
  try {
    const result = await createLocalFeedConnectorSync(db, DEMO_PROJECT_ID, home, undefined, feed)
      .sync(source.source_id, { idempotencyKey: "live-account-check", mode: "normal", signal: t.signal });
    t.diagnostic(JSON.stringify({ kind, outcome: result.run.outcome, errorCode: result.run.error_code, created: result.created }));
    assert.equal(result.run.outcome, "completed", result.run.error_code || "Account sync did not complete");
    const current = feed.sources.get(DEMO_PROJECT_ID, source.source_id);
    assert.equal(current.last_outcome, "completed");
    assert.equal(current.credential_ref, null);
    assert.equal(JSON.stringify(current.config).includes(account.connection_id), false);
    return result.created;
  } finally {
    bindLocalFeedSourceAccount(home, source, null);
  }
}

for (const kind of ["github", "gmail"] as const) {
  test(`BFR-04 Live ${kind} account performs read-only production sync`, { skip: process.env.MOLIS_WORK_LIVE_ACCOUNTS !== "1", timeout: 60_000 }, async t => {
    await withIntegrationHome(async ({ store }) => {
      await syncPreparedAccount(kind, process.env.MOLIS_WORK_LIVE_FEED_HOME, store().db, t);
    });
  });

  test(`BFR-04 ${kind} uses the prepared Home's OAuth account for read-only sync`, async t => {
    await withIntegrationHome(async ({ store }) => {
      const home = await mkdtemp(join(await realpath("/tmp"), HOME_PREFIX));
      try {
        const origin = "http://127.0.0.1:49152";
        const started = await startApiOAuth(home, { serviceId: kind, displayName: "Test account", clientId: "fixture-app", clientSecret: "fixture-app-secret", origin });
        const state = new URL(started.authorization_url).searchParams.get("state")!;
        const access = "fixture-feed-oauth-access";
        const tokenUrl = kind === "github" ? "https://github.com/login/oauth/access_token" : "https://oauth2.googleapis.com/token";
        const identityUrl = kind === "github" ? "https://api.github.com/user" : "https://openidconnect.googleapis.com/v1/userinfo";
        const connected = await completeApiOAuth(home, { origin, state, code: "fixture-code" }, async (input, init) => {
          if (String(input) === tokenUrl) return Response.json({ access_token: access, refresh_token: "fixture-feed-refresh", expires_in: 3600 });
          assert.equal(String(input), identityUrl);
          assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${access}`);
          return Response.json(kind === "github" ? { id: 42, login: "fixture" } : { sub: "fixture-person", email: "fixture@example.test" });
        });
        assert.equal(connected.status, "connected");
        const reads: string[] = [];
        t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(String(input));
          assert.equal(url.origin, kind === "github" ? "https://api.github.com" : "https://gmail.googleapis.com");
          assert.equal(init?.method ?? "GET", "GET");
          assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${access}`);
          reads.push(url.pathname);
          switch (url.pathname) {
            case "/user": return Response.json({ login: "fixture" }, { headers: { "x-oauth-scopes": "notifications, read:user" } });
            case "/notifications": return Response.json([{ id: "fixture-notification", reason: "subscribed", unread: true, updated_at: "2026-11-01T12:00:00Z",
              repository: { full_name: "fixture/repo", html_url: "https://github.com/fixture/repo" },
              subject: { title: "Fixture issue", type: "Issue", url: "https://api.github.com/repos/fixture/repo/issues/1" } }]);
            case "/gmail/v1/users/me/profile": return Response.json({ historyId: "42", emailAddress: "fixture@example.test" });
            case "/gmail/v1/users/me/messages": return Response.json({ messages: [{ id: "fixture-message" }] });
            case "/gmail/v1/users/me/messages/fixture-message": return Response.json({ id: "fixture-message", snippet: "Fixture message",
              labelIds: ["INBOX", "UNREAD"], internalDate: "1793534400000", payload: { headers: [{ name: "Subject", value: "Fixture message" }] } });
            default: assert.fail(`Unexpected provider read ${url.pathname}`);
          }
        });
        const path = kind === "github" ? join("/tmp", basename(home)) : home;
        assert.equal(await syncPreparedAccount(kind, path, store().db, t), 1);
        assert.deepEqual(reads, kind === "github" ? ["/user", "/notifications"]
          : ["/gmail/v1/users/me/profile", "/gmail/v1/users/me/messages", "/gmail/v1/users/me/messages/fixture-message"]);
        assert.deepEqual(withConnectorConnections(home, rows => rows.pluginBindings()), []);
      } finally {
        await rm(home, { recursive: true, force: true });
      }
    });
  });
}

test("BFR-04 live account setup rejects a missing path, ordinary Home and symlink alias", async t => {
  const temp = await realpath("/tmp");
  const ordinaryHome = await mkdtemp(join(temp, "molis-ordinary-home-"));
  t.after(() => rm(ordinaryHome, { recursive: true, force: true }));
  const link = join(temp, HOME_PREFIX + randomUUID().replaceAll("-", ""));
  await symlink(ordinaryHome, link, "dir");
  t.after(() => rm(link, { force: true }));
  await assert.rejects(preparedHome(undefined), /Set MOLIS_WORK_LIVE_FEED_HOME/u);
  await assert.rejects(preparedHome(ordinaryHome), /Use a dedicated Home/u);
  await assert.rejects(preparedHome(link), /must be a private directory/u);
});
