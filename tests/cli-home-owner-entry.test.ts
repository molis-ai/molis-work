import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, runV1Cli } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { storageOwnerProcesses } from "./fixtures/home-storage-owner.js";
import { managementGoals } from "./goal-management-caller.js";

test("RAC-105-S-08: CLI Home init is refused by an actual offline owner before creating the target directory", async t => {
  const peers = storageOwnerProcesses(t), root = await mkdtemp(join(tmpdir(), "cli-owner-entry-")), home = join(root, "home");
  t.after(() => rm(root, { recursive: true, force: true }));
  const owner = await peers.start(join(home, "agent-runtime"));
  try {
    assert.equal((await owner.request("acquire")).state, "held");
    const database = join(home, "projects", "new-project", "board.sqlite");
    await assert.rejects(runV1Cli(["init", "--db", database, "--json", JSON.stringify({ project_id: "new-project", idempotency_key: "busy-init" })],
      { homeDirectory: home }), { code: "storage.owner.busy" });
    await assert.rejects(stat(dirname(database)), { code: "ENOENT" });
    assert.deepEqual(await owner.request("borrow"), { state: "borrowed" }); await owner.request("release-borrow");
  } finally { await owner.stop(); }
});

test("RAC-105-S-08: external CLI init keeps the existing malformed-JSON parent-directory order without opening a database or Home", async t => {
  const root = await mkdtemp(join(tmpdir(), "cli-external-entry-")), home = join(root, "home"), database = join(root, "external", "board.sqlite");
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(runV1Cli(["init", "--db", database, "--json", "{broken-json"], { homeDirectory: home }), SyntaxError);
  assert.equal((await stat(dirname(database))).isDirectory(), true);
  await assert.rejects(stat(database), { code: "ENOENT" }); await assert.rejects(stat(home), { code: "ENOENT" });
});

test("RAC-105-S-08 PG094-CLI-01: owned CLI Hosts initialize and reopen external and Home-contained standalone databases", async t => {
  const root = await mkdtemp(join(tmpdir(), "cli-owned-home-")), home = join(root, "home");
  t.after(() => rm(root, { recursive: true, force: true }));
  const output: string[] = []; t.mock.method(console, "log", (value: string) => output.push(value));
  for (const [id, database] of [["external", join(root, "external", "project.db")], ["inside", join(home, "projects", "standalone", "project.db")]]) {
    const input = JSON.stringify({ project_id: id, idempotency_key: "initialize" });
    assert.equal(await runV1Cli(["init", "--db", database, "--json", input], { homeDirectory: home }), 0);
    assert.equal(JSON.parse(output.at(-1)!).project_id, id);
    assert.equal(await runV1Cli(["snapshot", "--db", database, "--json", JSON.stringify({ project_id: id })], { homeDirectory: home }), 0);
    assert.equal(JSON.parse(output.at(-1)!).board.project_id, id);
  }
});

test("PG094-CLI-02 PG094-CLI-03 a Home-free project runs Goals, refuses actual personal-method adoption without partial facts, and remains usable", async t => {
  const root = await mkdtemp(join(tmpdir(), "cli-personal-unavailable-")), home = join(root, "unused-home"), database = join(root, "standalone", "project.db");
  const host = createMolisWorkLocalHost({ completeText: null }), projectId = "no-home-personal";
  t.after(async () => { await host.close(); await rm(root, { recursive: true, force: true }); });
  t.mock.method(console, "log", () => {});
  await runV1Cli(["init", "--db", database, "--json", JSON.stringify({ project_id: projectId, idempotency_key: "initialize" })], { homeDirectory: home });
  const reference = molisWorkHostProjectReference({ databasePath: database, projectId });
  const actions = managementGoals(host.actionClient(reference), projectId);
  await actions.invoke(goalsActions.create, { goal_id: "retained", title: "Keep this project fact", idempotency_key: "retained" });
  const facts = () => host.withProject(reference, runtime => Object.fromEntries(
    ["boards", "goals", "planning_method_packs", "events", "idempotency_records"].map(table => [table, runtime.store.db.prepare(`SELECT * FROM ${table}`).all()])));
  const before = await facts();
  await assert.rejects(actions.invoke(goalsActions.planningApply, { method_id: "domain-software-development", user_confirmed: true }),
    { code: "goals.planning.personal_unavailable" });
  assert.deepEqual(await facts(), before, "a failed production planning command saved no method, Goal, event or idempotency fact");
  assert.ok((await actions.invoke(goalsActions.snapshot, {})).goals.some(goal => goal.goal_id === "retained"));
  await assert.rejects(stat(home), { code: "ENOENT" }, "no substitute Home was created");
});
