import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { alchemistActions as a, ALCHEMIST_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { MolisWorkLocalHost, alchemistPulseGithub, molisWorkHostProjectReference, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { alchemistFixture, controlledAlchemistAi } from "./fixtures/alchemist-actions.js";

// W2-18 decision 7: the market pulse's GitHub source uses a Settings GitHub connection the person bound to it, and
// searches anonymously when none is bound. The plugin never receives the token: the Host adds the header.

async function home(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "alchemist-pulse-github-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function environment(t: test.TestContext, values: Record<string, string>) {
  const previous = Object.fromEntries(Object.keys(values).map(name => [name, process.env[name]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
}
const connect = (directory: string, label: string, token: string, authMethod: "token" | "oauth" = "token") =>
  withConnectorConnections(directory, store => store.createToken({ serviceId: "github", displayName: `GitHub · ${label}`, token, accountLabel: label, authMethod }));

/** Every request the port sends to the network, with the credential the Host added. */
function recordNetwork(t: test.TestContext) {
  const sent: Array<{ url: string; authorization: string | null }> = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    sent.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") });
    return Response.json({ items: [] });
  });
  return sent;
}
const GITHUB_SEARCH = "https://api.github.com/search/repositories?q=AI";

test("nothing is bound: the pulse sends no credential, whatever GitHub accounts the Home has and whatever the environment says", async t => {
  const directory = await home(t);
  environment(t, { GITHUB_TOKEN: "environment-token", MOLIS_WORK_GITHUB_TOKEN: "other-environment-token" });
  connect(directory, "for-coding-or-feed", "coding-feed-token");
  withConnectorConnections(directory, store => store.createToken({ serviceId: "github", displayName: "GitHub · device", token: "device-token", accountLabel: "device", authMethod: "oauth" }));
  const sent = recordNetwork(t);
  const port = alchemistPulseGithub(directory);
  await port.fetch(GITHUB_SEARCH, {});
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.authorization, null, "a GitHub account connected for Coding or Feed is not used by the pulse until it is bound here");
  assert.equal(port.read().selectedConnectionId, null);
  assert.equal(port.read().accounts.length, 2, "both are offered as choices");
});

test("a bound account lends its token to api.github.com and to nothing else, and a renewed, replaced or disconnected token applies to the next request", async t => {
  const directory = await home(t);
  const first = connect(directory, "first", "first-token");
  const second = connect(directory, "second", "second-token", "oauth");
  const sent = recordNetwork(t);
  const port = alchemistPulseGithub(directory);

  port.select(second.connection_id);
  await port.fetch(GITHUB_SEARCH, { headers: { accept: "application/json", "x-extra": "kept" } });
  assert.equal(sent.at(-1)!.authorization, "Bearer second-token");
  for (const elsewhere of ["https://api.github.com.example.test/search", "https://example.com/?next=https://api.github.com/", "https://api.github.com:8443/search", "http://api.github.com/search", "https://uploads.github.com/x", "https://api.github.com@example.test/"]) {
    await port.fetch(elsewhere, {});
    assert.equal(sent.at(-1)!.authorization, null, `${elsewhere} never gets the token`);
  }

  withConnectorConnections(directory, store => store.replaceToken(second.connection_id, "renewed-token"));
  await port.fetch(GITHUB_SEARCH, {});
  assert.equal(sent.at(-1)!.authorization, "Bearer renewed-token", "a renewed token is used by the next request");

  port.select(first.connection_id);
  await port.fetch(GITHUB_SEARCH, {});
  assert.equal(sent.at(-1)!.authorization, "Bearer first-token", "choosing another account switches to it");

  // The bound account's secret cannot be read: anonymous, not the other account's token.
  runWithMolisWorkHome(directory, () => createFileSecretStore().delete(first.credential_ref!));
  await port.fetch(GITHUB_SEARCH, {});
  assert.equal(sent.at(-1)!.authorization, null, "an unreadable secret does not move the pulse on to another account");

  withConnectorConnections(directory, store => store.disconnect(second.connection_id));
  port.select(null);
  await port.fetch(GITHUB_SEARCH, {});
  assert.equal(sent.at(-1)!.authorization, null, "no account bound: anonymous");
  assert.equal(port.read().selectedConnectionId, null);
});

test("the picker lists only token and OAuth GitHub accounts with their state, never a credential, and refuses anything the Host cannot send a token for", async t => {
  const directory = await home(t);
  const usable = connect(directory, "usable", "usable-token-value");
  const gone = connect(directory, "gone", "gone-token-value", "oauth");
  const other = withConnectorConnections(directory, store => {
    const notion = store.createToken({ serviceId: "notion", displayName: "Notion", token: "notion-token-value", authMethod: "token" });
    const cli = store.saveCli({ serviceId: "github", displayName: "gh", externalId: "gh-cli", accountLabel: "octo" });
    store.disconnect(gone.connection_id);
    return { notion, cli };
  });
  const port = alchemistPulseGithub(directory);
  const view = port.read();
  assert.deepEqual(view.accounts.map(account => [account.displayName, account.state]), [["GitHub · usable", "connected"], ["GitHub · gone", "disconnected"]],
    "another service's connection and a CLI login (no secret the Host can send) are not offered");
  assert.equal(JSON.stringify(view).includes("token-value"), false, "the view names accounts, never credentials");

  for (const [connectionId, why] of [[other.notion.connection_id, "another service's connection"], [other.cli.connection_id, "a CLI login"], [gone.connection_id, "a disconnected account"],
    ["00000000-0000-4000-8000-000000000000", "an unknown id"]] as const) {
    assert.throws(() => port.select(connectionId), { code: "alchemist.pulse_github_unusable" }, why);
    assert.equal(port.read().selectedConnectionId, null, `${why} binds nothing`);
  }
  port.select(usable.connection_id);
  assert.equal(port.read().selectedConnectionId, usable.connection_id);
  // A failed selection leaves the current choice alone.
  assert.throws(() => port.select(other.cli.connection_id), { code: "alchemist.pulse_github_unusable" });
  assert.equal(port.read().selectedConnectionId, usable.connection_id);
  // Disconnecting the bound account keeps the choice visible (as unavailable) and sends nothing.
  withConnectorConnections(directory, store => store.disconnect(usable.connection_id));
  assert.equal(port.read().selectedConnectionId, usable.connection_id);
  assert.equal(port.read().accounts.find(account => account.connectionId === usable.connection_id)?.state, "disconnected");
});

test("choosing the account is the person's: an agent or MCP caller cannot, and the plugin alone (no Host port) has no accounts to choose", async t => {
  const directory = await home(t);
  const f = alchemistFixture(directory);
  t.after(() => f.close());
  assert.deepEqual(await f.bound.invoke(a.pulseGithub, {}), { accounts: [], selectedConnectionId: null });
  await assert.rejects(f.bound.invoke(a.pulseGithubSelect, { connectionId: null }), { code: "PULSE_GITHUB_UNAVAILABLE" });
  for (const audience of ["agent", "mcp", "workflow"] as const) {
    await assert.rejects(f.service.invoke({ ...f.caller, audience }, a.pulseGithub, {}), { code: "actions.forbidden" }, `${audience} cannot read the account list`);
    await assert.rejects(f.service.invoke({ ...f.caller, audience }, a.pulseGithubSelect, { connectionId: null }), { code: "actions.forbidden" }, `${audience} cannot choose the account`);
  }
  await assert.rejects(f.service.invoke({ ...f.caller, permissions: ["alchemist:read"] }, a.pulseGithubSelect, { connectionId: null }), { code: "actions.forbidden" });
});

test("a live market pulse: the person picks the account through the actions, the Host adds its token on the way to api.github.com, and the plugin never sees it", { timeout: 90_000 }, async t => {
  const directory = await home(t);
  environment(t, { GITHUB_TOKEN: "environment-token" });
  const { ai } = controlledAlchemistAi();
  const ref = molisWorkHostProjectReference({ databasePath: join(directory, "project.sqlite"), projectId: "project-a" });
  const host = new MolisWorkLocalHost({ homeDirectory: directory, alchemist: { ai: () => ai } });
  t.after(() => host.close());
  await host.withProject(ref, r => r.coordinator.initializeBoard({ project_id: ref.project_id, title: "Pulse token", actor_id: "setup", idempotency_key: "init" }));
  const caller: ActionCallContext = { actor_id: "alice", project_id: ref.project_id, audience: "user", permissions: ALCHEMIST_ACTION_PERMISSIONS };
  const bound = bindActionClient(host.actionClient(ref), () => caller);

  const requests: Array<{ url: string; authorization: string | null }> = [];
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://api.github.com/")) return realFetch(input, init);
    requests.push({ url, authorization: new Headers(init?.headers).get("authorization") });
    return Response.json({ items: [] });
  });
  const pulse = async () => {
    const before = requests.length;
    const { run } = await bound.invoke(a.pulseStart, { sourceIds: ["github"] });
    for (let n = 0; n < 200 && requests.length === before; n++) await new Promise(resolve => setTimeout(resolve, 20));
    for (let n = 0; n < 200; n++) {
      const latest = (await bound.invoke(a.pulseReports, {})).latestRun;
      if (latest?.id === run.id && !["queued", "running"].includes(latest.status)) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(requests.length, before + 1);
    return requests.at(-1)!;
  };

  // A GitHub account exists (connected for Coding or Feed, say) but is not bound to the pulse.
  const account = connect(directory, "octo", "connection-token-value");
  const anonymous = await pulse();
  assert.match(anonymous.url, /^https:\/\/api\.github\.com\/search\/repositories\?/u);
  assert.equal(anonymous.authorization, null, "unbound: no credential is sent, GITHUB_TOKEN is not used, and the connected account is not used either");

  const listed = await bound.invoke(a.pulseGithub, {});
  assert.deepEqual(listed, { accounts: [{ connectionId: account.connection_id, displayName: "GitHub · octo", accountLabel: "octo", state: "connected" }], selectedConnectionId: null });
  assert.deepEqual(await bound.invoke(a.pulseGithubSelect, { connectionId: account.connection_id }), { selectedConnectionId: account.connection_id });
  const authorized = await pulse();
  assert.equal(authorized.authorization, "Bearer connection-token-value", "the bound account's token is picked up without restarting the studio");

  // The token reached api.github.com and nowhere on the plugin's side: not in the studio database, not in any action result.
  const results = JSON.stringify([listed, await bound.invoke(a.pulseGithub, {}), await bound.invoke(a.pulseSources, {}), await bound.invoke(a.pulseReports, {})]);
  assert.equal(results.includes("connection-token-value"), false, "no action result carries the token");
  const projectDirectories = (await readdir(join(directory, "alchemist"), { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name));
  assert.ok(projectDirectories.some(file => file.endsWith("studio.sqlite")), "the studio database was found");
  for (const file of projectDirectories) assert.equal((await readFile(file)).includes("connection-token-value"), false, `${file.split("/alchemist/")[1]} does not contain the token`);

  assert.deepEqual(await bound.invoke(a.pulseGithubSelect, { connectionId: null }), { selectedConnectionId: null });
  const again = await pulse();
  assert.equal(again.authorization, null, "choosing anonymous stops the token at once");
});
