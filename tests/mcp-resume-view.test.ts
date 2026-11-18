import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import {
  createMolisWorkLocalHost,
  LocalProjectDatabase,
  molisWorkHostProjectReference,
} from "@molis-ai/molis-work-app-local-host";
import { objectLink } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { goalsActions, goalsResumeSummary } from "@molis-ai/molis-work-plugin-goals";
import { serveTestHost, type TestHostServer } from "./fixtures/test-home.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

type DirectoryItem = Parameters<typeof goalsResumeSummary>[0][number];
function directoryFor(entries: Array<[string, DirectoryItem["work_status"], boolean]>): DirectoryItem[] {
  return entries.map(([id, work_status, can_record], index) => ({
    goal_id: id,
    title: `目标 ${id}`,
    work_status,
    completion_effect: work_status === "completed",
    can_record,
    next_hint: work_status === "completed" ? "已完成，明确继续后开启新一轮" : "可记录",
    unmet_requirement_count: 0,
    pending_decision_count: id === "attention" ? 1 : 0,
    blocking_concern_count: 0,
    updated_at: `2026-09-0${9 - (index % 8)}T00:00:00Z`,
  }));
}
const none = () => null;

// Batch 44 C7: the ordering MCP's `buildMcpResumeView` did is Goals' own resume summary now (`goals.resume.summary@1`).
test("C7 Goals' resume summary keeps the host's focus when it is a Goal, and leaves the directory it was given unchanged", () => {
  const directory = directoryFor([["active", "open", true], ["other", "open", true], ["host", "open", true]]);
  const before = structuredClone(directory);
  const focused = goalsResumeSummary(directory, { kind: "goal", id: "host" }, none);
  assert.deepEqual(focused.focus?.subject, { kind: "goal", id: "host" });
  assert.deepEqual(focused.focus?.open, { surface: "goals", id: "host" });
  const ownPick = goalsResumeSummary(directory, undefined, none).focus?.subject.id;
  assert.equal(goalsResumeSummary(directory, { kind: "goal", id: "missing-host-goal" }, none).focus?.subject.id, ownPick, "a focus Goals cannot read falls back to its own pick");
  assert.equal(goalsResumeSummary(directory, { kind: "note", id: "host" }, none).focus?.subject.id, ownPick, "a focus of another kind is not a Goal, whatever its id");
  assert.deepEqual(directory, before, "building the summary does not change the directory");
});

test("C7 Goals' resume summary keeps the recovery order and leaves completed Goals out of what comes next", () => {
  const directory = directoryFor([
    ["done", "completed", true], ["blocked", "open", true],
    ["waiting", "open", true], ["ready-b", "open", true],
    ["ready-a", "open", true], ["recorded", "open", true],
    ["attention", "open", true], ["active", "open", true],
  ]);
  const summary = goalsResumeSummary(directory, undefined, none);
  assert.equal(summary.focus?.subject.id, "attention");
  assert.equal(summary.focus?.status_label, "进行中");
  assert.equal(summary.next.some(item => item.subject.id === "done"), false);
  assert.ok(summary.next.length <= 5);
  assert.deepEqual(goalsResumeSummary([], undefined, none), { title: "目标", focus: null, next: [] });
  // A focused Goal the first page left out is read on its own.
  const read = (id: string) => id === "beyond" ? directoryFor([["beyond", "open", true]])[0]! : null;
  assert.equal(goalsResumeSummary(directory, { kind: "goal", id: "beyond" }, read).focus?.subject.id, "beyond");
});

test("context_resolve restores Host focus outside the discovery window and writes no Session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-02-focus-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  let store: LocalProjectDatabase | undefined;
  let runtime: MolisWorkServer | undefined;
  let served: TestHostServer | undefined;
  let host: ReturnType<typeof createMolisWorkLocalHost> | undefined;
  try {
    const project = await catalog.createProject({ display_name: "Host 焦点恢复", actor_id: "focus-user" });
    store = new LocalProjectDatabase(project.database_path);
    let tick = Date.parse("2026-09-10T00:00:00.000Z");
    const app = new GoalProjectApplication(store, () => new Date(tick++));
    app.projectOpened(project.project_id); // S8b: a new project's board is made by Goals when the project is first opened, as the Host does
    const create = (goal_id: string, title: string) => app.goalEvents.createIntent({
      project_id: project.project_id, goal_id, title, actor_id: "focus-user", actor_kind: "user",
      idempotency_key: `focus-create-${goal_id}`, source_kind: "web",
    });
    create("FOCUS-HOST", "明确的 Host 目标");
    for (let i = 0; i < 105; i++) create(`FOCUS-RECENT-${String(i).padStart(3, "0")}`, `后续记录目标 ${i + 1}`);
    assert.equal(
      app.goalEvents.listGoals({ project_id: project.project_id, limit: 100 }).goals
        .some((item) => item.goal_id === "FOCUS-HOST"),
      false,
    );
    const runtimeHost: {
      homeDirectory: string;
      runtimeContext: { runtime_id: string; stable_work_context_id: string; host_declares_stable: boolean };
      focus?: { kind: string; id: string };
    } = {
      homeDirectory: directory,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: "focus-session", host_declares_stable: true },
      focus: { kind: "goal", id: "FOCUS-HOST" },
    };
    catalog.bindRuntimeContext({
      context: runtimeHost.runtimeContext, project_id: project.project_id,
      actor_id: "focus-user", user_confirmed: true,
    });
    catalog.close();
    host = createMolisWorkLocalHost({ homeDirectory: directory });
    const connection = {
      databasePath: project.database_path, projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    };
    runtime = new MolisWorkServer("runtime", connection, runtimeHost, host);
    // The MCP server binds this Host to the Home, so this Host serves the access settings the grants go through.
    served = await serveTestHost(null, { home: directory, host });
    const views = await host.inspectActions({ actor_id: "runtime:codex", audience: "mcp", project_id: project.project_id, permissions: [] }, molisWorkHostProjectReference(connection));
    const viewOf = (definition: { capability_id: string }) => views.find(view => view.capability_id === definition.capability_id)!;
    await served.grant("runtime:codex", project.project_id, [goalsActions.guidanceRead, goalsActions.list].map(viewOf));
    const resolve = async () => JSON.parse(await runtime!.callTool("molis_work_v1_context_resolve", {}));
    const goals = (value: { resume: { sections: Array<{ plugin_id: string; focus: { subject: { id: string }; source: string; url: string } }> } }) =>
      value.resume.sections.find(section => section.plugin_id === "io.molis.work.goals")!;
    let result = await resolve();
    assert.deepEqual(result.resume, { sections: [] }, "C7: a resume summary the Runtime was not granted is not in its directory, so nothing is summarised");
    assert.equal(Object.hasOwn(result.connection, "goal_url_template"), false, "C7: no Goal address template; each item carries its own address");
    await served.grant("runtime:codex", project.project_id, [viewOf(goalsActions.resumeSummary)]);
    result = await resolve();
    assert.equal(goals(result).focus.subject.id, "FOCUS-HOST", "the focus outside the directory window is read by Goals itself");
    assert.equal(goals(result).focus.source, "host_focus");
    assert.equal(goals(result).focus.url, new URL(objectLink(project.project_id, { surface: "goals", id: "FOCUS-HOST", title: "明确的 Host 目标" }), connection.webBaseUrl).toString());
    // Sessions are retired (BL-177): the context no longer reads or reports a Session.
    assert.equal(Object.hasOwn(result, "session_registry"), false);
    runtimeHost.focus = undefined;
    assert.deepEqual(runtime.runtimeContextHost?.focus, { kind: "goal", id: "FOCUS-HOST" }, "mutating a constructor input cannot change live transport metadata");
    runtime.runtimeContextHost = { ...runtimeHost };
    result = await resolve();
    assert.equal(goals(result).focus.source, "owner_order");
    runtimeHost.focus = { kind: "goal", id: "DOES-NOT-EXIST" };
    runtime.runtimeContextHost = { ...runtimeHost };
    result = await resolve();
    assert.equal(goals(result).focus.source, "owner_order");
    await runtime.close();
    await served.close();
    await host?.close();
    host = createMolisWorkLocalHost({ homeDirectory: directory });
    runtimeHost.focus = { kind: "goal", id: "FOCUS-HOST" };
    runtime = new MolisWorkServer("runtime", connection, runtimeHost, host);
    result = await resolve();
    assert.equal(goals(result).focus.subject.id, "FOCUS-HOST");
    assert.equal(goals(result).focus.source, "host_focus");
    assert.equal(existsSync(join(directory, "sessions")), false, "resolving context records no Session: nothing opens the retired store");
  } finally {
    await runtime?.close();
    await served?.close();
    await host?.close();
    store?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
