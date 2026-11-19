import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { workspaceReadActions } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

for (const failure of ["binary-template", "large-package", "broken-git-index"] as const) {
  test(`QEA-54 · real ${failure} remains unavailable in Coding until the actual file is repaired`, { timeout: 60_000 }, async t => {
    const { host, project, directory, workspaceId, call, requests } = await codingProductHost(t, () => cogniaModelResponse("must not run"));
    const client = host.actionClient(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }));
    const caller: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["workspace:read"] };
    const git = (...args: string[]) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
    git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test");
    await writeFile(join(directory, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: "node --test" } }));
    await writeFile(join(directory, ".env.example"), "LOCAL_URL=\n");
    await mkdir(join(directory, "node_modules"));
    await writeFile(join(directory, ".env"), "LOCAL_URL=fixture-private-value\n");
    git("add", "."); git("commit", "-m", "fixture");
    const path = join(directory, failure === "binary-template" ? ".env.example" : failure === "large-package" ? "package.json" : ".git/index");
    const original = await readFile(path);
    await writeFile(path, failure === "binary-template" ? "LOCAL_URL=\0binary" : failure === "large-package"
      ? JSON.stringify({ name: "fixture", description: "x".repeat(300_000), scripts: { test: "node --test" } }) : "invalid index");
    const publicRead = failure === "broken-git-index"
      ? await client.invoke(caller, workspaceReadActions.git, { workspace_id: workspaceId, kind: "summary" })
      : await client.invoke(caller, workspaceReadActions.file, { workspace_id: workspaceId, path: [failure === "binary-template" ? ".env.example" : "package.json"], kind: "text" });
    assert.equal(publicRead.outcome, failure === "binary-template" ? "binary" : failure === "large-package" ? "too-large" : "error");
    type State = { sessions: unknown[]; environment_readiness: { workspace_id: string; status: string; [field: string]: unknown } };
    const state = await call<State>(project.project_id, "/api/plugins/io.molis.work.coding/state");
    assert.equal(state.status, 200); assert.ok(Array.isArray(state.body.sessions));
    assert.equal(JSON.stringify(state.body).includes("fixture-private-value"), false);
    const unavailable = state.body.environment_readiness;
    assert.equal(unavailable.workspace_id, workspaceId); assert.equal(unavailable.status, "unavailable");
    for (const invented of ["is_git_repo", "deps_manager", "env_keys", "worktrees"]) assert.equal(Object.hasOwn(unavailable, invented), false);
    await writeFile(path, original);
    const recovered = await call<State>(project.project_id, "/api/plugins/io.molis.work.coding/state");
    assert.equal(recovered.status, 200); assert.equal(recovered.body.environment_readiness.is_git_repo, true);
    assert.deepEqual(recovered.body.environment_readiness.env_keys, ["LOCAL_URL"]);
    assert.deepEqual(recovered.body.environment_readiness.script_names, ["test"]);
    assert.equal(requests.length, 0, "inspection and repair never execute a model or a command");
  });
}
