import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectDirectoryActions as a, type ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { initializeBoard } from "./fixtures/goals-board.js";
import { directoriesOf } from "./fixtures/catalog-host.js";

// Batch 05 (#1979): a Host bound to no project catalog may be handed the folders it reads (`directoriesFor`). It then answers
// `projects.directories.get@1` from them, for its own project only, and changes none of them: the six changes stay unavailable
// until a catalog is bound. Without `directoriesFor` it answers nothing.

const output: ProjectWorkspaceRef = { workspace_id: "w-out", canonical_path: "/tmp/read-only-output", realpath_verified: true, display_name: "output" };
const input: ProjectWorkspaceRef = { workspace_id: "w-in", canonical_path: "/tmp/read-only-input", realpath_verified: true, display_name: "input" };

async function hostWith(t: test.TestContext, directoriesFor?: ConstructorParameters<typeof MolisWorkLocalHost>[0]["directoriesFor"]) {
  const home = await mkdtemp(join(tmpdir(), "directories-read-only-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, directoriesFor });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "a" });
  await initializeBoard(host, reference, { actor_id: "owner", idempotency_key: "init" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: ["projects:settings"] };
  return { client: host.actionClient(reference), caller };
}

test("a Host without a catalog answers the directories it was handed, read-only, for its own project", { timeout: 60_000 }, async t => {
  const { client, caller } = await hostWith(t, directoriesOf([output, input]));
  const answer = await client.invoke(caller, a.get, {});
  assert.deepEqual(answer.directories.map(item => [item.workspace_id, item.roles]), [["w-out", ["input", "output"]], ["w-in", ["input"]]]);
  assert.equal(answer.project_id, "a", "the project comes from the caller's context");
  await assert.rejects(client.invoke({ ...caller, project_id: "b" }, a.get, {}), { code: "actions.scope_mismatch" });
  for (const [change, value] of [
    [a.addInput, { workspace_path: "/tmp/elsewhere", expected_revision: answer.revision }],
    [a.setOutput, { workspace_id: "w-in", expected_revision: answer.revision }],
    [a.removeInput, { workspace_id: "w-in", expected_revision: answer.revision }],
  ] as const) await assert.rejects(client.invoke(caller, change as typeof a.addInput, value as never), { code: "actions.service_unavailable" }, `${change.capability_id} needs the catalog`);
  assert.deepEqual((await client.invoke(caller, a.get, {})).directories.map(item => item.workspace_id), ["w-out", "w-in"], "nothing changed");
});

test("a Host without a catalog and without directoriesFor answers no directories", { timeout: 60_000 }, async t => {
  const { client, caller } = await hostWith(t);
  await assert.rejects(client.invoke(caller, a.get, {}), { code: "actions.service_unavailable" });
});
