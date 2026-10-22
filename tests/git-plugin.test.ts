import assert from "node:assert/strict";
import test from "node:test";

import { HOST_EVENT_SOURCE, HOST_REVIEW_SETTLED_EVENT, type HostReviewSettledPayload, type PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginEventDeliveryContext, PluginEventRecord } from "@molis-ai/molis-work-contracts/platform/plugin-events";
import { CODING_FILE_CHANGED_EVENT } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import {
  EMPTY_DRAFT,
  conflictKey,
  createGitPlugin,
  draftIsEmpty,
  gitManifest,
  headLabel,
  mayHaveChangedFiles,
  parseGitFileChanged,
  parseGitResult,
  parseStoredDrafts,
  projectGit,
  serializeStoredDrafts,
} from "@molis-ai/molis-work-plugin-git";
import { parsePorcelainStatus } from "@molis-ai/molis-work-plugin-sdk";

const NUL = String.fromCharCode(0);

function porcelain(...records: string[]): string {
  return records.join(NUL) + NUL;
}

test("分支名之外，没有提交和游离 HEAD 也各有一句看得懂的标签", () => {
  assert.equal(headLabel(parsePorcelainStatus({ stdout: porcelain("## main...origin/main [ahead 2, behind 1]") }).head), "main");
  assert.match(headLabel(parsePorcelainStatus({ stdout: porcelain("## No commits yet on main") }).head), /还没有提交/);
  assert.match(headLabel({ kind: "detached", commit: "0123456789abcdef" }), /^游离于 01234567$/);
});

test("有冲突时不能提交，干净时也不能", () => {
  const conflicted = projectGit({
    phase: "ready",
    status: parsePorcelainStatus({ stdout: porcelain("## main", "M  a.ts", "UU b.ts") }),
  });
  assert.equal(conflicted.conflicts.length, 1);
  assert.equal(conflicted.committable, false, "冲突没解决就提交，等于记下一次没人做过的合并");

  const clean = projectGit({ phase: "ready", status: parsePorcelainStatus({ stdout: porcelain("## main") }) });
  assert.equal(clean.committable, false);
  assert.match(clean.message, /干净/);

  const staged = projectGit({
    phase: "ready",
    status: parsePorcelainStatus({ stdout: porcelain("## main", "M  a.ts") }),
  });
  assert.equal(staged.committable, true);
});

test("每种起不来的情况各有各的下一步", () => {
  const phases = ["waiting", "not-a-repository", "unavailable", "error"] as const;
  const recoveries = phases.map((phase) => projectGit({ phase, status: null }).recovery);
  assert.equal(new Set(recoveries).size, phases.length, "四种麻烦不该给同一句建议");
  assert.equal(recoveries.every((text) => text !== undefined), true);
});

test("刷新后选中的行没了就不再报告它被选中", () => {
  const status = parsePorcelainStatus({ stdout: porcelain("## main", "M  a.ts") });
  assert.equal(projectGit({ phase: "ready", status, selected: ["a.ts"] }).selected?.label, "a.ts");
  assert.equal(projectGit({ phase: "ready", status, selected: ["gone.ts"] }).selected, undefined);
});

test("草稿坏了就当没有，不会把 Git 挡在外面", () => {
  assert.deepEqual(parseStoredDrafts("not json").drafts.size, 0);
  assert.deepEqual(parseStoredDrafts(null).conflicts.size, 0);
  const stored = {
    drafts: new Map([["ws-1", { ...EMPTY_DRAFT, commit_message: "还没提交的话" }]]),
    conflicts: new Map([[conflictKey("ws-1", ["a.ts"]), "手改的结果"]]),
  };
  const round = parseStoredDrafts(serializeStoredDrafts(stored));
  assert.equal(round.drafts.get("ws-1")?.commit_message, "还没提交的话");
  assert.equal(round.conflicts.get(conflictKey("ws-1", ["a.ts"])), "手改的结果");
  assert.equal(draftIsEmpty(EMPTY_DRAFT), true);
});

test("回执里只有 reconcile / conflict / succeeded 说明文件可能动了", () => {
  assert.equal(mayHaveChangedFiles("succeeded"), true);
  assert.equal(mayHaveChangedFiles("reconcile"), true, "说不清有没有落地，就得当成可能落地了");
  assert.equal(mayHaveChangedFiles("conflict"), true);
  assert.equal(mayHaveChangedFiles("denied"), false);
  assert.equal(mayHaveChangedFiles("expired"), false);
  assert.throws(
    () => parseGitResult({ workspace_id: "ws", operation_id: "op", outcome: "maybe", summary: "x" }),
    /outcome 无效/,
  );
});

test("空 paths 表示“动得太多列不过来”，仍然是合法事件", () => {
  const event = parseGitFileChanged({ workspace_id: "ws-1", operation_id: "op-1", paths: [] });
  assert.deepEqual(event.paths, []);
  assert.throws(
    () => parseGitFileChanged({ workspace_id: "ws-1", operation_id: "op-1", paths: [[".."]] }),
    /无效/,
  );
});

test("Run 变更集是可选输入：没有 Coding 的项目里 Git 照样起得来", () => {
  const runPort = gitManifest.ports?.inputs.find((port) => port.port === "run-changeset");
  assert.equal(runPort?.optional, true);
  const workspacePort = gitManifest.ports?.inputs.find((port) => port.port === "workspace");
  assert.equal(workspacePort, undefined, "工作目录从当前项目设置读取，不使用输入端口");
});

test("PG061-GIT-01 Git's own pages read again after a delivery or a settled operation; a refused one moves nothing, and nothing calls Git after stop", async () => {
  // G2a: the Host's `onWorkingTreeChanged` port is gone; Git moves its own revision through `services.ui.invalidate()` (PG-061).
  // G2b: so is the Host's settlement port; a settled operation arrives as the host event `host.review.settled@1` (PG-044, S-54).
  let invalidated = 0, refusal: Error | null = null;
  const published: unknown[] = [];
  const context: PluginStartContext = { install_id: "git-invalidate", plugin_id: gitManifest.plugin_id, version: gitManifest.version,
    deployment: "local", grants: gitManifest.permissions.map(item => item.permission), project_id: "project", actor_id: "web-user",
    requireGrant: () => {}, services: {
      ui: { register: () => {}, unregister: () => {}, invalidate: () => { if (refusal) throw refusal; invalidated++; } },
      events: { publish: input => { published.push(input); return { accepted: true, ref: { event_id: `event-${published.length}`, project_id: "project", sequence: published.length,
        event_type_id: input.event_type_id, type_version: input.type_version, source_plugin_id: gitManifest.plugin_id, source_install_id: "git-invalidate" } }; } },
    } };
  const plugin = createGitPlugin();
  assert.ok(gitManifest.events?.subscribes.some(item => item.event_type_id === HOST_REVIEW_SETTLED_EVENT && item.type_version === 1 && item.from_plugin_ids === undefined),
    "Git subscribes to the Host's settlement by type and version only");
  const contribution = await plugin.start(context);
  const record: PluginEventRecord = { event_id: "event-1", project_id: "project", sequence: 1, event_type_id: CODING_FILE_CHANGED_EVENT, type_version: 1,
    source_plugin_id: "io.molis.work.coding", source_install_id: "coding", payload: {}, correlation_id: null, occurred_at: new Date(0).toISOString() };
  const delivery = (beforeEffect: () => void): PluginEventDeliveryContext => ({ project_id: "project", plugin_id: gitManifest.plugin_id,
    install_id: context.install_id, installation_generation: "1", actor_id: `plugin:${gitManifest.plugin_id}`, signal: new AbortController().signal, beforeEffect });
  const stale = new Error("the subscriber's installation is no longer current");
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(invalidated, 0, "starting and idling move nothing: Git keeps no timer that calls it (BL-411)");

  await contribution.onEvent!(record, delivery(() => {}));
  assert.equal(invalidated, 1, "a Coding event makes Git's own pages read again");
  await assert.rejects(async () => contribution.onEvent!(record, delivery(() => { throw stale; })), error => error === stale);
  await contribution.onUpstreamReady!({}, { signal: new AbortController().signal, beforeEffect: () => {} });
  await assert.rejects(async () => contribution.onUpstreamReady!({}, { signal: new AbortController().signal, beforeEffect: () => { throw stale; } }), error => error === stale);
  await contribution.onUpstreamUnavailable!({ binding_id: "binding", code: "binding_removed", message: "the Run's change set is gone" });
  assert.equal(invalidated, 3, "a new or withdrawn Run change set reads again; a delivery no longer current is refused before it moves anything");

  assert.equal(published.length, 0, "only a settled operation is published");

  const settled = (payload: HostReviewSettledPayload): PluginEventRecord => ({ event_id: `host-${payload.review_id}`, project_id: "project", sequence: 0,
    event_type_id: HOST_REVIEW_SETTLED_EVENT, type_version: 1, source_plugin_id: HOST_EVENT_SOURCE, source_install_id: HOST_EVENT_SOURCE, payload,
    correlation_id: payload.review_id, occurred_at: new Date(0).toISOString() });
  await contribution.onEvent!(settled({ review_id: "review-1", kind: "git-operation", workspace_id: "ws-1", operation_id: "op-1", outcome: "unknown" }), delivery(() => {}));
  assert.deepEqual(published, [{ event_type_id: "io.molis.work.git.operation-updated", type_version: 1, payload: { workspace_id: "ws-1", operation_id: "op-1", outcome: "unknown" } }],
    "a settled operation is published in Git's own shape, outcome as the Host recorded it, and nothing else of the review");
  assert.equal(invalidated, 4, "then Git's pages read again");
  await assert.rejects(async () => contribution.onEvent!(settled({ review_id: "review-2", kind: "git-index", workspace_id: "ws-1", operation_id: "op-2", outcome: "succeeded" }),
    delivery(() => { throw stale; })), error => error === stale);
  assert.deepEqual([published.length, invalidated], [1, 4], "a settlement no longer current for this activation publishes nothing and reads nothing again");
  refusal = new Error("Plugin 已停止，不能再让页面重新读取");
  await assert.rejects(async () => contribution.onEvent!(settled({ review_id: "review-3", kind: "git-index", workspace_id: "ws-1", operation_id: "op-3", outcome: "succeeded" }),
    delivery(() => {})), error => error === refusal, "a refusal reaches the Host's delivery, which reports it once and does not retry (S-54)");

  refusal = null;
  await plugin.stop!(context);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(invalidated, 4, "after stop nothing is left to call it (BL-411)");
});
