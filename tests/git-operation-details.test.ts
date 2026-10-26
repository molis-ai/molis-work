import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareGitOperationCapability, readGitOperationsCapability, workspaceReadActions } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { LocalProjectDatabase, MolisWorkLocalHost, composeAgentHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { callerPlugin, registerProbe, startPlugin } from "./fixtures/plugin-callers.js";

const OPERATION = "review:git-operation";
const NAMES = ["first", "second", "third", "fourth", "fifth", "sixth"];

// What an approved Git operation produced is kept in one Home file beside its review (`git-operation-details.json`), since a receipt
// only says whether it happened. Operations in different workspaces run at the same time when a person approves them together, and
// each keeps its own description: the saves are made one after another, so none overwrites or renames away another's.
test("Git operations approved together in several workspaces each keep what they produced", { timeout: 60_000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "git-operation-details-")));
  const workspaces = [];
  for (const name of NAMES) {
    const repo = join(root, name);
    await mkdir(repo);
    await writeFile(join(repo, "README.md"), "fixture\n");
    execFileSync("git", ["init", "-q", repo]);
    const git = (...args: string[]) => execFileSync("git", ["-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
    git("add", "README.md");
    git("commit", "-q", "-m", "fixture");
    workspaces.push({ workspace_id: name, canonical_path: repo, display_name: name, realpath_verified: true });
  }
  t.mock.method(globalThis, "fetch", async () => { throw new Error("this test sends nothing"); });
  const workspacesFor = async () => workspaces;
  const host = new MolisWorkLocalHost({ completeText: null, workspacesFor, workspaceFor: () => workspaces[0]! });
  const reference = molisWorkHostProjectReference({ databasePath: join(root, "project.sqlite"), projectId: "project" });
  const composition = composeAgentHost({ localHost: host, homeDirectory: root, workspaceFor: () => workspaces[0]!, workspacesFor,
    prologue: { storageRoot: join(root, "runtime"), resolveCredential: () => "fixture-only",
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }) } });
  const store = new LocalProjectDatabase(join(root, "plugins.sqlite"));
  registerProbe(host.actionRegistry(reference), "project");
  t.after(async () => { await composition.dispose(); await host.close(); store.close(); await rm(root, { recursive: true, force: true }); });
  const plugin = callerPlugin("details", "project", { [OPERATION]: false, "workspace:read": true },
    [prepareGitOperationCapability.capability_id, readGitOperationsCapability.capability_id, workspaceReadActions.git.capability_id]);
  await startPlugin(host, reference, store, plugin, { grants: [OPERATION], dependencies: host.client(reference) });
  const actions = plugin.actions("project"), reviews = composition.agentHost.reviews;
  const prepared = [];
  for (const { workspace_id } of workspaces) {
    const summary = await actions.invoke(workspaceReadActions.git, { workspace_id, kind: "summary" });
    assert.ok(summary.outcome === "summary", "the fixture repository reads");
    prepared.push(await actions.invoke(prepareGitOperationCapability, { workspace_id, operation_id: `operation-${workspace_id}`, revision: summary.revision,
      operation: { action: "branch-create", name: "fixture-branch", checkout: false } }));
  }
  // The person approves all of them at once: the operations run, and save what they produced, at the same time.
  const receipts = await Promise.all(prepared.map(({ review_id }) => reviews.respond({ review_id, decision: "approve", actor_id: "web-user" })));
  assert.deepEqual(receipts.map(receipt => [receipt.status, receipt.effect_settled, receipt.effect_error]), NAMES.map(() => ["approved", true, null]));
  for (const { workspace_id } of workspaces) {
    const records = await actions.invoke(readGitOperationsCapability, { workspace_id });
    assert.deepEqual(records.map(record => [record.operation_id, record.outcome, record.detail]), [[`operation-${workspace_id}`, "succeeded", "已新建分支「fixture-branch」"]],
      `${workspace_id} keeps what its operation produced`);
  }
  assert.deepEqual(Object.keys(JSON.parse(await readFile(join(root, "git-operation-details.json"), "utf8"))).sort(), NAMES.map(name => `project:operation-${name}`).sort());
});
