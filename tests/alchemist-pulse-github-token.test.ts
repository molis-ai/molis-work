import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { alchemistActions as a, ALCHEMIST_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.js";
import { alchemistPulseGithubToken } from "../apps/local-host/src/alchemist-pulse-token.js";
import { controlledAlchemistAi } from "./fixtures/alchemist-actions.js";

// W2-18 decision 7: the market pulse's GitHub source uses the Settings GitHub connection's secret reference and searches
// anonymously when none is bound; it never reads the process environment.

async function home(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "alchemist-pulse-token-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function environment(t: test.TestContext, values: Record<string, string>) {
  const previous = Object.fromEntries(Object.keys(values).map(name => [name, process.env[name]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
}

test("the pulse token is the Settings GitHub connection's secret, read fresh each time", async t => {
  const directory = await home(t);
  environment(t, { GITHUB_TOKEN: "environment-token", MOLIS_WORK_GITHUB_TOKEN: "other-environment-token" });
  assert.equal(alchemistPulseGithubToken(directory), undefined, "no connection bound: anonymous, whatever the environment says");
  const connection = withConnectorConnections(directory, store => store.createToken({ serviceId: "github", displayName: "GitHub · octo", token: "connection-token", accountLabel: "octo", authMethod: "token" }));
  assert.equal(alchemistPulseGithubToken(directory), "connection-token");
  withConnectorConnections(directory, store => store.replaceToken(connection.connection_id, "renewed-token"));
  assert.equal(alchemistPulseGithubToken(directory), "renewed-token", "a renewed token is used by the next request");
  withConnectorConnections(directory, store => store.disconnect(connection.connection_id));
  assert.equal(alchemistPulseGithubToken(directory), undefined, "a disconnected connection lends nothing");
});

test("only a GitHub account connection with a stored secret lends its token", async t => {
  const directory = await home(t);
  withConnectorConnections(directory, store => {
    store.createToken({ serviceId: "notion", displayName: "Notion", token: "notion-token", authMethod: "token" });
    store.saveCli({ serviceId: "github", displayName: "gh", externalId: "gh-cli", accountLabel: "octo" });
  });
  assert.equal(alchemistPulseGithubToken(directory), undefined, "another service's token and a CLI login (no stored secret) are not GitHub account tokens");
  withConnectorConnections(directory, store => store.createToken({ serviceId: "github", displayName: "GitHub · device", token: "device-token", accountLabel: "octo", authMethod: "oauth" }));
  assert.equal(alchemistPulseGithubToken(directory), "device-token");
});

test("a live market pulse sends the bound connection's token to api.github.com, and nothing when none is bound", { timeout: 60_000 }, async t => {
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

  const anonymous = await pulse();
  assert.match(anonymous.url, /^https:\/\/api\.github\.com\/search\/repositories\?/u);
  assert.equal(anonymous.authorization, null, "no connection bound: no credential is sent, and GITHUB_TOKEN is not used");

  withConnectorConnections(directory, store => store.createToken({ serviceId: "github", displayName: "GitHub · octo", token: "connection-token", accountLabel: "octo", authMethod: "token" }));
  const authorized = await pulse();
  assert.equal(authorized.authorization, "Bearer connection-token", "the bound connection's token is picked up without restarting the studio");
});
