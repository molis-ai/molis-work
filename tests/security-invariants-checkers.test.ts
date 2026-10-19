// S-41 (docs/system/SECURITY-INVARIANTS.md): the command an after-write check runs comes only from what the person saved,
// the written path is one argument that is never an option, nothing runs without the person's approval, an approval
// remembered for one command does not carry over to a changed checker (specs/prologue-adoption §6.0p.6, PA-39), and the
// executor asks again, before it answers, whether the round's authorization and the workspace's still stand.
import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentWriteCheckerActions, type AgentWriteChecker } from "@molis-ai/molis-work-contracts/services/agent-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { afterWriteRound, say, write } from "./fixtures/after-write-round.ts";

const NODE: AgentWriteChecker = { checker_id: "node-check", display_name: "Node 语法", executable: "node", args: ["--check", "{file}"], applies_to: [".js"] };
/** A checker that leaves a mark when it runs, so a check that never ran is seen not to have run. */
const MARK: AgentWriteChecker = { checker_id: "mark", display_name: "留痕", executable: "node", args: ["-e", "require('node:fs').writeFileSync('ran.txt', process.argv[1])", "{file}"], applies_to: [".js"] };
const exists = (path: string) => access(path).then(() => true, () => false);

test("S-41 only the person saves a checker: a model's tool, an MCP client, a workflow or a plugin is refused and the list stays", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "s41-checkers-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "S-41", actor_id: "web-user" });
  catalog.close();
  const workspace = { workspace_id: "app", canonical_path: await realpath(home), realpath_verified: true, display_name: "app" };
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, workspaceFor: async () => workspace, workspacesFor: async () => [workspace] });
  try {
    const client = host.actionClient(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }));
    const person: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["projects:settings"] };
    const { list, save } = agentWriteCheckerActions;
    await client.invoke(person, save, { workspace_id: "app", expected_version: 0, checkers: [NODE] });
    const foreign = { ...NODE, checker_id: "evil", executable: "touch", args: ["pwned", "{file}"] };
    for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
      await assert.rejects(client.invoke({ ...person, audience }, save, { workspace_id: "app", expected_version: 1, checkers: [foreign] }),
        (error: { code?: string }) => error.code === "actions.forbidden", audience);
    }
    const { lists } = await client.invoke(person, list, {}) as { lists: Array<{ version: number; checkers: AgentWriteChecker[] }> };
    assert.deepEqual(lists.map(row => [row.version, row.checkers.map(checker => checker.checker_id)]), [[1, ["node-check"]]]);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("S-41 a written path that starts with `-` reaches the checker as `./…`, one argument, never an option", { timeout: 60_000 }, async t => {
  const round = await afterWriteRound(t, { checkers: [NODE], turns: [write("-rf.js", "1;\n", "w1"), say("done")] });
  const handle = await round.start();
  await round.approve(await round.pending("text-edit"));
  const card = await round.pending("command");
  assert.deepEqual(card.document.kind === "command" && [card.document.command, ...card.document.args], ["node", "--check", "./-rf.js"]);
  await round.approve(card);
  await round.ended(handle.ref);
  assert.match(round.result("w1") ?? "", /command: node --check \.\/-rf\.js\nexit 0/);
});

test("S-41 a check the person refused starts no process", { timeout: 60_000 }, async t => {
  const round = await afterWriteRound(t, { checkers: [MARK], turns: [write("src/a.js", "1;\n", "w1"), say("done")] });
  const handle = await round.start();
  await round.approve(await round.pending("text-edit"));
  await round.reject(await round.pending("command"));
  await round.ended(handle.ref);
  assert.equal(await exists(join(round.project, "ran.txt")), false, "the checker never ran");
  assert.match(round.result("w1") ?? "", /\nnot checked: /);
  assert.equal(await readFile(join(round.project, "src/a.js"), "utf8"), "1;\n", "the write itself stands");
});

/** What a check turned away leaves: the write stands, the observation says why it was not checked, and no command was reviewed or run. */
async function assertTurnedAway(round: Awaited<ReturnType<typeof afterWriteRound>>, reason: string) {
  assert.match(round.result("w1") ?? "", new RegExp(`^wrote src/a\\.js[\\s\\S]*\\nnot checked: ${reason}$`));
  assert.equal(round.queue.list("board").filter(row => row.document.kind === "command").length, 0, "no command was put up for review");
  assert.equal(await exists(join(round.project, "ran.txt")), false, "the checker never ran");
  assert.equal(await readFile(join(round.project, "src/a.js"), "utf8"), "1;\n", "the write itself stands");
}

// The note of which checker answered is kept after both checks, on the same path (prologue-after-write.ts), so the exact reason
// in the observation is also what shows that none was kept: the index it would go to is not on the package's surface to read back.
test("S-41 a workspace taken back by the time the check is asked for is not checked: nothing is reviewed, run or kept", { timeout: 60_000 }, async t => {
  const round = await afterWriteRound(t, { checkers: [MARK], turns: [write("src/a.js", "1;\n", "w1"), say("done")] });
  const handle = await round.start();
  const edit = await round.pending("text-edit");
  round.authorize(false);
  await round.approve(edit);
  await round.ended(handle.ref);
  await assertTurnedAway(round, "工作区授权已撤回");
});

test("S-41 a round whose authorization was taken back (its check before dispatch throws) is not checked: nothing is reviewed, run or kept", { timeout: 60_000 }, async t => {
  let armed = false, thrown = false, project = "";
  // Throws once, for the first ask after the write has landed: the executor's, before it reads the workspace or the settings.
  // The model's next request is not stopped, so the observation that says so is read back.
  const round = await afterWriteRound(t, { checkers: [MARK], turns: [write("src/a.js", "1;\n", "w1"), say("done")], beforeDispatch: async () => {
    if (!armed || thrown || !(await exists(join(project, "src/a.js")))) return;
    thrown = true;
    throw new Error("the plugin instance was stopped");
  } });
  project = round.project;
  const handle = await round.start();
  const edit = await round.pending("text-edit");
  armed = true;
  await round.approve(edit);
  await round.ended(handle.ref);
  assert.equal(thrown, true, "the executor asked the round's own check");
  await assertTurnedAway(round, "这一轮的授权已收回");
});

test("S-41 “本会话不再询问” for one command does not approve the changed checker's command for the same file", { timeout: 90_000 }, async t => {
  const read = { tool: "read", input: { path: "a.js" } };
  const round = await afterWriteRound(t, { checkers: [NODE], turns: [write("a.js", "1;\n", "w1"), read, write("a.js", "2;\n", "w2"), say("done"), read, write("a.js", "3;\n", "w3"), say("done")] });
  const seen = new Set<string>();
  const edit = async () => { const row = await round.pending("text-edit", seen); seen.add(row.review_id); await round.approve(row); };
  const commands = () => round.queue.list("board").filter(row => row.document.kind === "command");
  let handle = await round.start();
  await edit();
  const first = await round.pending("command");
  seen.add(first.review_id);
  await round.approve(first, "session");
  await edit();
  await round.ended(handle.ref);
  // The rule holds for the command it was given: the same file's check is approved by it.
  assert.equal(commands().length, 2);
  assert.match(round.queue.receipt(commands()[1]!.review_id)?.note ?? "", /按本会话规则批准/);
  for (const row of commands()) seen.add(row.review_id);
  // The same checker, changed by the person: the same file's command is another command, and the person is asked.
  await round.adapter.writeCheckers.save("board", "app", 1, [{ ...NODE, cwd: ".", timeout_ms: 30_000, args: ["--check", "--no-warnings", "{file}"] }]);
  handle = await round.start();
  await edit();
  const changed = await round.pending("command", seen);
  assert.deepEqual(changed.document.kind === "command" && changed.document.args, ["--check", "--no-warnings", "a.js"]);
  assert.equal(round.queue.receipt(changed.review_id)?.status, "pending", "not approved by the old rule");
  await round.reject(changed);
  await round.ended(handle.ref);
});
