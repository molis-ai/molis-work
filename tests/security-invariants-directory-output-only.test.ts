import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareGitIndexCapability, prepareGitOperationCapability, workspaceReadActions } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { LocalProjectDatabase, MolisWorkLocalHost, composeAgentHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { callerPlugin, registerProbe, startPlugin } from "./fixtures/plugin-callers.js";

// S-directory-output-only (specs/shared-sources-and-surfaces §3, SSC-15, user 2026-11-08): a folder that is only an input of its project is
// read and never written, by anyone. Git stages, commits, branches and pushes only in the project's output: a review is not even prepared
// in an input-only folder, and one prepared in the output is refused when it runs if that folder stopped being the output in between.

const INDEX = "review:git-index", OPERATION = "review:git-operation";
const INPUT_ONLY = { code: "projects.directory_input_only" };

/** A Host with Git reviews wired and two repositories in the project, each with a changed file: `output` is the output, `input` only an input. */
async function openHost(t: TestContext) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "directory-output-only-")));
  const repos: Record<string, string> = {};
  for (const name of ["output", "input"]) {
    const repo = repos[name] = join(root, name);
    await mkdir(repo);
    await writeFile(join(repo, "README.md"), "fixture\n");
    execFileSync("git", ["init", "-q", repo]);
    gitIn(repo, "add", "README.md");
    gitIn(repo, "commit", "-q", "-m", "fixture");
    await writeFile(join(repo, "README.md"), "changed\n");
  }
  t.mock.method(globalThis, "fetch", async () => { throw new Error("this test sends nothing"); });
  const folders = Object.entries(repos).map(([name, repo]) => ({ workspace_id: name, canonical_path: repo, display_name: name, realpath_verified: true }));
  const state = { output: "output" };
  const workspacesFor = async () => folders;
  const workspaceFor = () => folders.find(folder => folder.workspace_id === state.output)!;
  const host = new MolisWorkLocalHost({ completeText: null, workspacesFor, workspaceFor });
  const reference = molisWorkHostProjectReference({ databasePath: join(root, "project.sqlite"), projectId: "project" });
  const composition = composeAgentHost({ localHost: host, homeDirectory: root, workspaceFor, workspacesFor,
    prologue: { storageRoot: join(root, "runtime"), resolveCredential: () => "fixture-only",
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }) } });
  const store = new LocalProjectDatabase(join(root, "plugins.sqlite"));
  registerProbe(host.actionRegistry(reference), "project");
  t.after(async () => { await composition.dispose(); await host.close(); store.close(); await rm(root, { recursive: true, force: true }); });
  const plugin = callerPlugin("git-writer", "project", { [INDEX]: false, [OPERATION]: false, "workspace:read": true },
    [prepareGitIndexCapability.capability_id, prepareGitOperationCapability.capability_id, workspaceReadActions.git.capability_id]);
  await startPlugin(host, reference, store, plugin, { grants: [INDEX, OPERATION], dependencies: host.client(reference) });
  const actions = plugin.actions("project");
  return {
    state, actions, reviews: composition.agentHost.reviews,
    git: (name: string, ...args: string[]) => gitIn(repos[name]!, ...args),
    /** What staging in `name` is prepared against: its changed file's diff, read in an input-only folder too. */
    async diff(name: string) {
      const diff = await actions.invoke(workspaceReadActions.git, { workspace_id: name, kind: "diff", path: ["README.md"], side: "worktree" });
      assert.ok(diff.outcome === "diff", "the fixture repository reads, an input-only one too");
      return diff.revision;
    },
    /** What a Git operation in `name` is prepared against: its summary. */
    async summary(name: string) {
      const summary = await actions.invoke(workspaceReadActions.git, { workspace_id: name, kind: "summary" });
      assert.ok(summary.outcome === "summary", "the fixture repository reads, an input-only one too");
      return summary.revision;
    },
  };
}
const gitIn = (repo: string, ...args: string[]) => execFileSync("git", ["-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
const stage = (workspace_id: string, revision: string, operation_id: string) => ({ workspace_id, path: ["README.md"], action: "stage" as const, revision, operation_id });
const commit = (workspace_id: string, revision: string, operation_id: string) => ({ workspace_id, operation_id, revision, operation: { action: "commit" as const, message: "from an input" } });

test("S-directory-output-only SSC-15 Git does not stage in a folder that is only an input: no review, nothing staged", { timeout: 60_000 }, async t => {
  const h = await openHost(t);
  await assert.rejects(h.actions.invoke(prepareGitIndexCapability, stage("input", await h.diff("input"), "stage-input")), INPUT_ONLY);
  assert.deepEqual(h.reviews.list("project"), [], "no review was prepared");
  assert.equal(h.git("input", "show", ":README.md"), "fixture\n", "nothing is staged");
  // The same call in the output prepares its review: the refusal is the folder's role, not the fixture.
  const staged = await h.actions.invoke(prepareGitIndexCapability, stage("output", await h.diff("output"), "stage-output"));
  assert.equal(h.reviews.receipt(staged.review_id)?.status, "pending");
});

test("S-directory-output-only SSC-15 Git does not commit in a folder that is only an input: no review, no commit", { timeout: 60_000 }, async t => {
  const h = await openHost(t);
  h.git("input", "add", "README.md");
  const head = h.git("input", "rev-parse", "HEAD");
  await assert.rejects(h.actions.invoke(prepareGitOperationCapability, commit("input", await h.summary("input"), "commit-input-1")), INPUT_ONLY);
  assert.deepEqual(h.reviews.list("project"), [], "no review was prepared");
  assert.equal(h.git("input", "rev-parse", "HEAD"), head, "nothing is committed");
  h.git("output", "add", "README.md");
  const prepared = await h.actions.invoke(prepareGitOperationCapability, commit("output", await h.summary("output"), "commit-output-1"));
  assert.equal(h.reviews.receipt(prepared.review_id)?.status, "pending");
});

test("S-directory-output-only SSC-15 a review prepared in the output is refused when it runs if the folder became only an input", { timeout: 60_000 }, async t => {
  const h = await openHost(t);
  const staged = await h.actions.invoke(prepareGitIndexCapability, stage("output", await h.diff("output"), "stage-then-input"));
  // The person makes the other folder the output; this one stays in the project as an input only. Then they approve.
  h.state.output = "input";
  const receipt = await h.reviews.respond({ review_id: staged.review_id, decision: "approve", actor_id: "web-user" });
  assert.equal(receipt.status, "approved");
  assert.equal(receipt.effect_settled, false, "the approved staging did not run");
  assert.match(receipt.effect_error ?? "", /只作输入/u);
  assert.equal(h.git("output", "show", ":README.md"), "fixture\n", "nothing is staged");
});
