import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { writerDirectoryCapabilities, writerIntegrationCapabilities as integration } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { PLUGIN_REVIEW_KINDS } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { gitManifest } from "@molis-ai/molis-work-plugin-git";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { MolisWorkLocalHost, composeAgentHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { reviewPlugins } from "./fixtures/review-plugins.js";

// S-50 (PG-009, specs/coding-migration C5): a person-reviewed Host operation is started only by the installation that declared
// and was granted `review:<kind>`, and is approved and run only while that same activation still holds it. The worktree entry
// stands for all four kinds: each Host entry builds its authority from the issued caller the same way (`reviewAuthority`), and
// the Git review adapter and the review queue check it for every kind.

const REVIEW = "review:git-worktree";
const refused = { code: "agent.review_not_permitted" };
const declared: PluginManifest["permissions"] = [{ permission: REVIEW, required: false, reason: "Creates a worktree a person reviews first" }];
const pluginId = (name: string) => `io.molis.work.example.${name}`;

/** A Manifest that asks the Host for a new worktree, declaring the permissions given. */
function worktreeManifest(name: string, permissions: PluginManifest["permissions"]): PluginManifest {
  return { schema_version: 2, host_api_version: 2, plugin_id: pluginId(name), version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `example-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions, capabilities: { provides: [], consumes: [writerDirectoryCapabilities.prepare.capability_id] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } };
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
  const plugins = reviewPlugins(host, reference, join(root, "plugins.sqlite"));
  return {
    runtime: plugins.runtime,
    reviews: composition.agentHost.reviews,
    authorized,
    start(name: string, permissions: PluginManifest["permissions"], grants: string[], consumes: readonly string[] = [writerDirectoryCapabilities.prepare.capability_id]) {
      return plugins.start(pluginId(name), permissions, grants, consumes);
    },
    /** What `name`'s current session calls the Host with, as its SDK does. */
    asPlugin: (name: string) => plugins.capabilities(pluginId(name)),
    /** A call into the project that no plugin made: it carries no plugin caller. */
    noPlugin: host.client(reference),
    /** A session in the project's workspace, recorded as owned by `owner`; the model is never asked. */
    async session(owner: { project_id: string; plugin_id: string; install_id: string; actor_id: string }) {
      await composition.ready;
      return composition.agentHost.adapter("prologue").createSession({ ...owner, directory: { canonical_path: repo, realpath_verified: true }, title: "owned session" });
    },
    prepare(name: string, operation_id: string) {
      return plugins.capabilities(pluginId(name)).invoke(writerDirectoryCapabilities.prepare, { workspace_id: "main", operation_id });
    },
    /** Runs `action` inside the `after`-th read of the project's workspace grants from now. */
    duringRead(after: number, action: () => Promise<unknown>) {
      revokeAt = reads + after;
      revoke = async () => { await action(); };
    },
    worktrees: () => git("worktree", "list", "--porcelain").split("\n").filter(line => line.startsWith("worktree ")).length,
    async close() {
      await plugins.close();
      await composition.dispose();
      await host.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("S-50 PG-009 a review kind outside the platform's list is refused when the Manifest is read and when it is installed", () => {
  // W5-01-CODING-40: the kinds are the platform's; a plugin cannot name one of its own.
  const unknown = worktreeManifest("unknown-kind", [{ permission: "review:git-reset", required: false, reason: "Not a platform review" }]);
  assert.throws(() => parsePluginManifest(unknown), { code: "plugin.permission_invalid" });
  assert.throws(() => parsePluginManifest(worktreeManifest("bare", [{ permission: "review:", required: false, reason: "No kind" }])), { code: "plugin.permission_invalid" });
  assert.throws(() => new PluginRuntime().install({ definition: { manifest: unknown, async start() { return { kind: "app" }; } }, deployment: "local", grants: ["review:git-reset"] }),
    { code: "plugin.manifest_invalid" });
  for (const kind of ["git-index", "git-operation", "git-worktree", "git-integration"]) {
    parsePluginManifest(worktreeManifest(kind, [{ permission: `review:${kind}`, required: true, reason: "A platform review" }]));
  }
});

test("S-50 PG-009 Git declares exactly review:git-index and review:git-operation, Coding exactly review:git-worktree and review:git-integration, all required", () => {
  // W5-01-CODING-47: the built-in plugins are declared like any other; the Host no longer knows them by name. Together the two
  // declare every kind on the platform's list, and each is a required permission so an existing installation is brought up to it.
  const reviews = (manifest: PluginManifest) => manifest.permissions.filter(declared => declared.permission.startsWith("review:"));
  const git = reviews(gitManifest), coding = reviews(codingManifest);
  assert.deepEqual(git.map(declared => declared.permission).sort(), ["review:git-index", "review:git-operation"]);
  assert.deepEqual(coding.map(declared => declared.permission).sort(), ["review:git-integration", "review:git-worktree"]);
  assert.ok([...git, ...coding].every(declared => declared.required && declared.reason.trim() !== ""), "required, each with a reason");
  assert.deepEqual([...git, ...coding].map(declared => declared.permission.slice("review:".length)).sort(), [...PLUGIN_REVIEW_KINDS].sort());
  parsePluginManifest(gitManifest);
  parsePluginManifest(codingManifest);
});

test("S-50 PG-009 W5-01-CODING-46 the integration entry refuses a session another installation or another plugin owns, and a call no plugin made", { timeout: 60_000 }, async t => {
  // The entry (read and prepare) answers for whose session this is before it reads any run, so no repository or child task is needed:
  // it is the plugin and the installation the Host recorded as the session's owner that may integrate it, never a plugin's name.
  const integrate: PluginManifest["permissions"] = [{ permission: "review:git-integration", required: true, reason: "Brings a child's result back once a person approves" }];
  const consumes = [integration.read.capability_id, integration.prepare.capability_id];
  const host = await openHost(t);
  try {
    const install_id = await host.start("integrator", integrate, ["review:git-integration"], consumes);
    await host.start("neighbour", integrate, ["review:git-integration"], consumes);
    const owner = { project_id: "project", plugin_id: pluginId("integrator"), actor_id: "user" };
    const mine = await host.session({ ...owner, install_id });
    const another = await host.session({ ...owner, install_id: "another-installation-of-integrator" });
    // Each call is started only when it is awaited, so a refusal is never left waiting for its handler.
    const asks = (caller: ReturnType<typeof host.asPlugin> | typeof host.noPlugin, session_id: string) => {
      const source = { session_id, run_id: "no-such-run", subagent_id: "no-such-child" };
      return [() => caller.invoke(integration.read, source), () => caller.invoke(integration.prepare, { ...source, files: [{ path: "note.txt", revision: "fixture" }], operation_id: randomUUID() })];
    };
    const notYours = /不属于发起整合的这份插件安装/;
    // The control: the installation that owns the session gets past the owner check, so it is the next check (the run) that stops it.
    for (const ask of asks(host.asPlugin("integrator"), mine.session_id)) await assert.rejects(ask(), /此轮执行不属于原会话/);
    // (a) Another installation of the same plugin: the session records the installation that opened it.
    for (const ask of asks(host.asPlugin("integrator"), another.session_id)) await assert.rejects(ask(), notYours);
    // (b) Another plugin that was declared and granted review:git-integration too: holding the kind is not owning the session.
    for (const ask of asks(host.asPlugin("neighbour"), mine.session_id)) await assert.rejects(ask(), notYours);
    // (c) A call into the project that no plugin made has no caller to compare with.
    for (const ask of asks(host.noPlugin, mine.session_id)) await assert.rejects(ask(), { code: "host.plugin_caller_invalid" });
    assert.deepEqual(host.reviews.list("project"), [], "none of those refusals left a review");
  } finally {
    await host.close();
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
    assert.equal(host.reviews.get(prepared.review_id)?.plugin_id, pluginId("holder"), "the review names the installation that asked");
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
