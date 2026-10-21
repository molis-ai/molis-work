import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { writerDirectoryCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { PluginDefinition, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { LocalProjectDatabase, MolisWorkLocalHost, PluginHostExecutor, composeAgentHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";

// S-50 (PG-009, specs/coding-migration C5): a person-reviewed Host operation is started only by the installation that declared
// and was granted `review:<kind>`, and is approved and run only while that same activation still holds it. The worktree entry
// stands for all four kinds: each Host entry builds its authority from the issued caller the same way (`reviewAuthority`), and
// the Git review adapter and the review queue check it for every kind.

const REVIEW = "review:git-worktree";
const refused = { code: "agent.review_not_permitted" };
const declared: PluginManifest["permissions"] = [{ permission: REVIEW, required: false, reason: "Creates a worktree a person reviews first" }];

/** A plugin that asks the Host for a new worktree, declaring the permissions given. */
function worktreePlugin(name: string, permissions: PluginManifest["permissions"], started: Map<string, PluginStartContext>): PluginDefinition {
  return {
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: `io.molis.work.example.${name}`, version: "1.0.0", name, kind: "app",
      publisher: { publisher_id: "example", signature: `example-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions, capabilities: { provides: [], consumes: [writerDirectoryCapabilities.prepare.capability_id] },
      artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } },
    async start(context) { started.set(name, context); return { kind: "app" }; },
  };
}

/** A Host with the Agent service, one clean repository as the project's workspace, and plugins started the way the Host starts them. */
async function openHost(t: TestContext) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "review-kinds-")));
  const repo = join(root, "repo");
  await mkdir(repo);
  await writeFile(join(repo, "README.md"), "fixture\n");
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
  execFileSync("git", ["init", "-q", repo]);
  git("add", "README.md");
  git("commit", "-q", "-m", "fixture");
  t.mock.method(globalThis, "fetch", async () => { throw new Error("this test sends nothing"); });
  const workspace = { workspace_id: "main", canonical_path: repo, display_name: "Fixture", realpath_verified: true };
  const authorized: string[] = [];
  let reads = 0, revokeAt = 0, revoke = async () => {};
  const host = new MolisWorkLocalHost({ completeText: null });
  const reference = molisWorkHostProjectReference({ databasePath: join(root, "project.sqlite"), projectId: "project" });
  const composition = composeAgentHost({ localHost: host, homeDirectory: root, workspaceFor: () => workspace,
    workspacesFor: async () => { if (++reads === revokeAt) await revoke(); return [workspace]; },
    authorizeWriterDirectory: async (_project, canonicalPath) => { authorized.push(canonicalPath); },
    prologue: { storageRoot: join(root, "runtime"), resolveCredential: () => "fixture-only",
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }) } });
  const store = new LocalProjectDatabase(join(root, "plugins.sqlite"));
  const service = new ActionService();
  const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions: { registry: service, client: service, project_id: "project" }, project_id: "project", actor_id: "web-user",
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) }), processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event) }),
    ui: new UiHost(), capabilities: host.client(reference), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) }));
  const started = new Map<string, PluginStartContext>(), installs: string[] = [];
  return {
    runtime,
    reviews: composition.agentHost.reviews,
    authorized,
    async start(name: string, permissions: PluginManifest["permissions"], grants: string[]) {
      const install = runtime.install({ definition: worktreePlugin(name, permissions, started), deployment: "local", grants }).install;
      installs.push(install.install_id);
      await runtime.start(install.install_id);
      return install.install_id;
    },
    prepare(name: string, operation_id: string) {
      return started.get(name)!.services!.capabilities!.invoke(writerDirectoryCapabilities.prepare, { workspace_id: "main", operation_id });
    },
    /** Runs `action` inside the `after`-th read of the project's workspace grants from now. */
    duringRead(after: number, action: () => Promise<unknown>) {
      revokeAt = reads + after;
      revoke = async () => { await action(); };
    },
    worktrees: () => git("worktree", "list", "--porcelain").split("\n").filter(line => line.startsWith("worktree ")).length,
    async close() {
      for (const install of installs) await runtime.stop(install).catch(() => {});
      await composition.dispose();
      await host.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("S-50 PG-009 a review kind outside the platform's list is refused when the Manifest is read and when it is installed", () => {
  // W5-01-CODING-40: the kinds are the platform's; a plugin cannot name one of its own.
  const started = new Map<string, PluginStartContext>();
  const unknown = worktreePlugin("unknown-kind", [{ permission: "review:git-reset", required: false, reason: "Not a platform review" }], started);
  assert.throws(() => parsePluginManifest(unknown.manifest), { code: "plugin.permission_invalid" });
  assert.throws(() => parsePluginManifest(worktreePlugin("bare", [{ permission: "review:", required: false, reason: "No kind" }], started).manifest), { code: "plugin.permission_invalid" });
  assert.throws(() => new PluginRuntime().install({ definition: unknown, deployment: "local", grants: ["review:git-reset"] }), { code: "plugin.manifest_invalid" });
  for (const kind of ["git-index", "git-operation", "git-worktree", "git-integration"]) {
    parsePluginManifest(worktreePlugin(kind, [{ permission: `review:${kind}`, required: true, reason: "A platform review" }], started).manifest);
  }
});

test("S-50 PG-009 an installation that did not declare, was not granted or stopped holding review:git-worktree cannot start one: no review appears and no worktree is made", { timeout: 60_000 }, async t => {
  const host = await openHost(t);
  try {
    // W5-01-CODING-41: not declared in the Manifest.
    await host.start("undeclared", [], []);
    await assert.rejects(host.prepare("undeclared", "operation-undeclared"), refused);
    // W5-01-CODING-42: declared, and the person did not grant it.
    await host.start("ungranted", declared, []);
    await assert.rejects(host.prepare("ungranted", "operation-ungranted"), refused);
    assert.deepEqual(host.reviews.list("project"), []);
    // W5-01-CODING-43: held when it asked, stopped while the Host prepared the review. The entry reads the grants once; the
    // second read is the review's own check, after the installation was first found holding its kind.
    const holder = await host.start("holder", declared, [REVIEW]);
    host.duringRead(2, () => host.runtime.stop(holder, { preserve_enabled: true }));
    await assert.rejects(host.prepare("holder", "operation-revoked"), refused);
    assert.deepEqual(host.reviews.list("project"), [], "no review is published for an installation that stopped holding its kind");
    assert.equal(host.worktrees(), 1);
    assert.deepEqual(host.authorized, []);
    // The same path runs for an installation holding its kind once a person approves: the refusals above are the check, not the fixture.
    await host.runtime.start(holder);
    const prepared = await host.prepare("holder", "operation-held");
    assert.equal(host.reviews.get(prepared.review_id)?.plugin_id, "io.molis.work.example.holder", "the review names the installation that asked");
    assert.equal(host.worktrees(), 1, "nothing is created before a person approves");
    const receipt = await host.reviews.respond({ review_id: prepared.review_id, decision: "approve", actor_id: "web-user" });
    assert.equal(receipt.status, "approved");
    assert.equal(receipt.effect_error, null);
    assert.equal(host.worktrees(), 2);
    assert.deepEqual(host.authorized, [prepared.directory.canonical_path]);
  } finally {
    await host.close();
  }
});

test("S-50 PG-009 a review whose installation stopped, restarted or lost review:git-worktree cannot be approved, only rejected, and nothing runs without a person's approval", { timeout: 60_000 }, async t => {
  const host = await openHost(t);
  try {
    const holder = await host.start("holder", declared, [REVIEW]);
    const first = await host.prepare("holder", "operation-stopped");
    // W5-01-CODING-45: a review waiting for a person is not an approval, and the operation has not run.
    assert.throws(() => host.reviews.consumeApproval(first.review_id), { code: "agent.review_not_approved" });
    assert.equal(host.worktrees(), 1);
    // W5-01-CODING-44: the installation stops; what it asked for can no longer be approved, not even once it runs again,
    // since the new activation is not the one that asked. The person can still reject it.
    await host.runtime.stop(holder, { preserve_enabled: true });
    await assert.rejects(host.reviews.respond({ review_id: first.review_id, decision: "approve", actor_id: "web-user" }), refused);
    await host.runtime.start(holder);
    await assert.rejects(host.reviews.respond({ review_id: first.review_id, decision: "approve", actor_id: "web-user" }), refused);
    assert.equal(host.reviews.receipt(first.review_id)?.status, "pending");
    assert.equal((await host.reviews.respond({ review_id: first.review_id, decision: "reject", actor_id: "web-user" })).status, "rejected");
    // The grant taken back: the person stops the plugin, withdraws review:git-worktree and starts it again.
    const second = await host.prepare("holder", "operation-withdrawn");
    await host.runtime.stop(holder, { preserve_enabled: true });
    host.runtime.grant(holder, []);
    await host.runtime.start(holder);
    await assert.rejects(host.reviews.respond({ review_id: second.review_id, decision: "approve", actor_id: "web-user" }), refused);
    await assert.rejects(host.prepare("holder", "operation-after-withdrawal"), refused);
    assert.equal((await host.reviews.respond({ review_id: second.review_id, decision: "reject", actor_id: "web-user" })).status, "rejected");
    assert.equal(host.worktrees(), 1, "no worktree was created");
    assert.deepEqual(host.authorized, [], "no directory was authorized");
  } finally {
    await host.close();
  }
});
