import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { runV1Cli } from "@molis-ai/molis-work-app-local-host";
import { storageOwnerProcesses } from "./fixtures/home-storage-owner.js";

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

test("RAC-105-S-08: an owned CLI Host uses its explicit Home for standalone init and reopen, including a new path inside Home", async t => {
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
