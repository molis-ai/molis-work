import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { CodingChangeSet } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { codingToolResponse } from "./fixtures/coding-sdk-runtime.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

// W2-18-ALL-03 / S6: actual SDK edit -> its human approval -> real Git approval/index -> fixed Coding/Git Diff reads.
test("S6 Coding writes the actual workspace through the installed SDK, Git stages only its approved revision, and Diff reads the same fixed bytes", { timeout: 60_000 }, async t => {
  const before = "Original tracked line\n", after = "SDK authored line 🌲\nKeep this exact final line\n";
  const f = await codingProductHost(t, (_request, turn) => turn === 1 ? codingToolResponse("read", { path: "note" })
    : turn === 2 ? codingToolResponse("write", { path: "note", text: after }) : cogniaModelResponse("The reviewed edit is complete."));
  const git = async (...args: string[]) => (await promisify(execFile)("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], {
    cwd: f.directory, env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined },
  })).stdout;
  await git("init", "-b", "main"); await writeFile(join(f.directory, "note"), before); await git("add", "note"); await git("commit", "-m", "base");
  const project = f.project.project_id, coding = "/api/plugins/io.molis.work.coding", gitApi = "/api/plugins/io.molis.work.git", diff = "/api/plugins/io.molis.work.diff/state";
  const session = await f.call<{ session: { session_id: string } }>(project, coding + "/sessions", {}); assert.equal(session.status, 200);
  const started = await f.call<{ run: { ref: AgentRunRef } }>(project, coding + `/sessions/${session.body.session.session_id}/runs`, {
    task: "Change note to the specified text. Do not run commands or stage files.", intent: "edit", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model",
  });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const deadline = Date.now() + 15_000;
  let reviewId = "";
  while (!reviewId) {
    const reviews = await f.call<{ reviews: Array<{ request: { review_id: string; kind: string } }> }>(project, "/api/agent/reviews?status=pending");
    reviewId = reviews.body.reviews.find(row => row.request.kind === "text-edit")?.request.review_id ?? "";
    if (Date.now() > deadline) {
      const state = await f.call(project, coding + `/sessions/${session.body.session.session_id}`);
      assert.fail("the actual SDK write did not request its human review: " + JSON.stringify({ state, reviews: reviews.body, providerRequests: f.requests.length }));
    }
    if (!reviewId) await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(await readFile(join(f.directory, "note"), "utf8"), before, "SDK preparation cannot write before approval");
  assert.equal(await git("show", ":note"), before);
  const approved = await f.call<{ receipt: { status: string } }>(project, "/api/agent/reviews/decide", { review_id: reviewId, decision: "approve" });
  assert.equal(approved.status, 200, JSON.stringify(approved.body)); assert.equal(approved.body.receipt.status, "approved");
  const run = await f.ended(started.body.run.ref); assert.equal(run.phase, "completed", run.stop_reason);
  const settled = await f.call<{ reviews: Array<{ request: { review_id: string }; receipt: { effect_settled: boolean; effect_error: string | null } }> }>(project, "/api/agent/reviews");
  const receipt = settled.body.reviews.find(row => row.request.review_id === reviewId)?.receipt;
  assert.deepEqual([receipt?.effect_settled, receipt?.effect_error], [true, null]);
  assert.equal(f.requests.length, 3); assert.equal(await readFile(join(f.directory, "note"), "utf8"), after);
  assert.equal(await git("show", ":note"), before, "the SDK writer did not stage its file");
  const fixedCoding = await f.call<{ reference: ArtifactReference; change: CodingChangeSet }>(project, coding + `/sessions/${session.body.session.session_id}/runs/${run.ref.run_id}/changeset`, {});
  assert.equal(fixedCoding.status, 200, JSON.stringify(fixedCoding.body)); assert.ok(fixedCoding.body.reference);
  assert.equal(fixedCoding.body.change.applied, true); assert.equal(fixedCoding.body.change.files.length, 1);
  const file = fixedCoding.body.change.files[0]!;
  assert.equal(file.path.split("/").at(-1), "note");
  assert.ok(file.review);
  assert.deepEqual([file.review.before_text, file.review.after_text, file.review.execution], [before, after, "applied"]);
  const fixedPath = (ref: ArtifactReference) => diff + "?artifact_id=" + encodeURIComponent(ref.artifact_id) + "&version=" + ref.version;
  const codingView = await f.call<{ html: string }>(project, fixedPath(fixedCoding.body.reference)); assert.equal(codingView.status, 200); assert.match(codingView.body.html, /SDK authored line/); assert.match(codingView.body.html, /Keep this exact final line/);
  const selected = await f.call<{ result: { before: string; after: string; revision: string }; selected: { reference: ArtifactReference } }>(project, gitApi + "/diff", { workspace_id: f.workspaceId, path: ["note"], side: "worktree" });
  assert.equal(selected.status, 200, JSON.stringify(selected.body)); assert.deepEqual([selected.body.result.before, selected.body.result.after], [before, after]);
  const prepared = await f.call<{ review_id: string }>(project, gitApi + "/prepare-index", { workspace_id: f.workspaceId, path: ["note"], action: "stage", revision: selected.body.result.revision, operation_id: randomUUID() });
  assert.equal(prepared.status, 200, JSON.stringify(prepared.body)); assert.equal(await git("show", ":note"), before);
  const staged = await f.call<{ receipt: { effect_settled: boolean } }>(project, "/api/agent/reviews/decide", { review_id: prepared.body.review_id, decision: "approve" });
  assert.equal(staged.status, 200, JSON.stringify(staged.body)); assert.equal(staged.body.receipt.effect_settled, true);
  assert.equal(await git("show", ":note"), after);
  const gitView = await f.call<{ html: string }>(project, fixedPath(selected.body.selected.reference)); assert.equal(gitView.status, 200); assert.match(gitView.body.html, /SDK authored line/); assert.match(gitView.body.html, /Keep this exact final line/);
  assert.deepEqual((await f.call(project, fixedPath(fixedCoding.body.reference))).body, codingView.body, "staging cannot rewrite Coding's frozen original change set");
});
