import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { observationActions } from "@molis-ai/molis-work-contracts/services/observation";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { todoActions } from "@molis-ai/molis-work-plugin-todo";
import {
  ObservationLayer,
  observationKeys,
  readCoverageGaps,
  readRecords,
  RETENTION_KEY, retentionActions,
  withObservationSource,
  type ExitAction,
  type ExitObservation,
  type ObservationEnvironment,
} from "@molis-ai/molis-work-service-observation";
import { openTestHome } from "./fixtures/test-home.js";

function memorySecrets() {
  const values = new Map<string, string>();
  return {
    values,
    get: (key: string) => values.get(key) ?? null,
    createIfAbsent: (key: string, value: string) => {
      if (values.has(key)) return false;
      values.set(key, value);
      return true;
    },
  };
}

function createFixture(t: test.TestContext, options: { now?: () => Date; platformVersion?: string; demoProjects?: readonly string[] } = {}) {
  const home = mkdtempSync(join(tmpdir(), "observation-mgmt-"));
  const secrets = memorySecrets();
  let currentNow = options.now ?? (() => new Date("2026-11-14T12:00:00.000Z"));
  let currentVersion = options.platformVersion ?? "0.29.0";
  const projects = new Set(["p1", "p2"]);
  const demoProjects = new Set(options.demoProjects ?? []);
  const env: ObservationEnvironment = {
    get platformVersion() { return currentVersion; },
    now: () => currentNow(),
    projectClass: id => (demoProjects.has(id) ? "regenerable_demo" : projects.has(id) ? "user" : undefined),
    readableProjects: async () => [...projects, ...demoProjects],
  } as ObservationEnvironment;

  let layer: ObservationLayer | undefined;
  let service = new ActionService(undefined, { observed: (caller, action, value) => layer?.observed(caller, action, value) });
  const mount = () => {
    layer = new ObservationLayer({ home, env, keys: has => observationKeys(secrets, has), flushDelayMs: 5 });
    const bound = layer.actions(() => {});
    service = new ActionService(undefined, { observed: (caller, action, value) => layer?.observed(caller, action, value) });
    service.registerProvider({
      provider: { provider_id: "system.observation", title: "工作记录", kind: "system" },
      definitions: bound.definitions,
      handlers: bound.handlers,
    });
    return layer;
  };
  mount();
  t.after(() => {
    layer?.close();
    rmSync(home, { recursive: true, force: true });
  });

  return {
    home,
    secrets,
    projects,
    get layer() { return layer!; },
    get service() { return service; },
    setNow: (fn: () => Date) => { currentNow = fn; },
    setVersion: (version: string) => { currentVersion = version; },
    reopen: () => {
      layer?.close();
      return mount();
    },
    db: () => layer!.writer.database()!.db,
  };
}

const person = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({
  actor_id: LOCAL_PERSON_ACTOR_ID,
  actor_kind: "user",
  audience: "user",
  project_id: "p1",
  permissions: [],
  ...extra,
});

const agent = (extra: Partial<ActionCallContext> = {}): ActionCallContext => person({
  actor_id: "agent:worker",
  actor_kind: "runtime",
  audience: "agent",
  ...extra,
});

const pluginCaller = (plugin_id: string, install_id: string, extra: Partial<ActionCallContext> = {}): ActionCallContext => person({
  actor_id: `plugin:${plugin_id}`,
  actor_kind: "runtime",
  audience: "plugin",
  host_plugin: { plugin_id, install_id, actor_id: `plugin:${plugin_id}`, project_id: "p1", declaration: { manifest: {} as never }, assertActive: () => {} },
  ...extra,
});

const writeAction: ExitAction = { capability_id: "notes.save", version: 1, provider_id: "notes-install", operation: "command" };
const systemWriteAction: ExitAction = { capability_id: "mcp.grant", version: 1, provider_id: "system.mcp", operation: "command" };
const readAction: ExitAction = { capability_id: "notes.list", version: 1, provider_id: "notes-install", operation: "query" };
const exitDone = (startedAt: number, endedAt: number, input: unknown, result: unknown, extra: Partial<ExitObservation> = {}): ExitObservation => ({
  invocation_id: `inv-${Math.random().toString(36).slice(2)}`,
  started_at: startedAt,
  ended_at: endedAt,
  handler_started: true,
  input,
  result,
  outcome: { ok: true },
  aborted: false,
  ...extra,
});

test("ONB-22/30 OCL-12: adopting retention commits cleanup and receipt together, and undo preserves the actual remaining records", async t => {
  const f = createFixture(t);
  const read = async () => (await f.service.invoke(person(), retentionActions.read, { keys: [RETENTION_KEY] })).values[0]!;
  await f.service.invoke(person(), observationActions.settingsSet, { space_reminder_bytes: 1000 });
  const initial = await read();
  assert.ok(initial.state === "ok" && initial.source === "provider_default");
  await f.service.invoke(pluginCaller("notes", "notes-install"), observationActions.report, {
    facts: [{ fact: "notes.older", outcome: "succeeded", occurred_at: "2026-10-01T12:00:00.000Z" }],
  });
  f.layer.flush();
  const write = { key: RETENTION_KEY, layer: "personal" as const, expected_revision: initial.revision, request_id: "scene-retention", change: { set: "30" } };
  f.db().exec("CREATE TRIGGER refuse_retention_receipt BEFORE INSERT ON writer_state WHEN NEW.key LIKE 'settings.receipt:%' BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END");
  await assert.rejects(f.service.invoke(person(), retentionActions.write, write));
  assert.deepEqual(await read(), initial);
  assert.ok(readRecords(f.db()).some(r => r.fact === "notes.older"), "cleanup rolled back with the unsuccessful receipt");
  f.db().exec("DROP TRIGGER refuse_retention_receipt");
  const saved = await f.service.invoke(person(), retentionActions.write, write);
  assert.equal(readRecords(f.db()).some(r => r.fact === "notes.older"), false);
  f.reopen();
  assert.deepEqual(await f.service.invoke(person({ project_id: null }), retentionActions.write, write), saved);
  const restored = (await f.service.invoke(person(), retentionActions.write, { ...write, request_id: "undo-retention",
    expected_revision: saved.values[0]!.revision, change: { inherit: true } })).values[0]!;
  assert.ok(restored.state === "ok" && restored.source === "provider_default" && restored.value === "keep");
  assert.equal(readRecords(f.db()).some(r => r.fact === "notes.older"), false);
});

test("OCL-01 OCL-02 OCL-04 OCL-06 OCL-14: records.query filters by work, subject+version, platform_version, kinds and window, paginates cleanly and marks late, coalesced and clock_adjusted", async t => {
  let clockMs = Date.parse("2026-11-14T10:00:00.000Z");
  const f = createFixture(t, { now: () => new Date(clockMs), platformVersion: "0.28.0" });

  // Coalesced reads under 0.28.0.
  f.layer.observed(agent({ call_id: "call-read" }), readAction, exitDone(clockMs - 10, clockMs, { q: "weekly" }, { items: [1] }));
  f.layer.observed(agent({ call_id: "call-read" }), readAction, exitDone(clockMs - 5, clockMs, { q: "weekly" }, { items: [1] }));
  f.layer.flush();

  // Switch platform version to 0.29.0 and write subject-versioned & AI records.
  f.setVersion("0.29.0");
  clockMs = Date.parse("2026-11-14T10:05:00.000Z");
  await f.service.invoke(
    pluginCaller("notes", "notes-install"),
    observationActions.report,
    {
      facts: [
        {
          fact: "notes.edited",
          outcome: "succeeded",
          occurred_at: "2026-11-14T10:05:00.000Z",
          work: { work_ref: "work-doc-1" },
          subjects: [{ kind: "page", id: "doc-1", version: 3 }],
          evidence: [{ role: "diff", ref: { kind: "owner", owner: "notes", id: "doc-1", version: 3 } }],
        },
        // Out-of-order / delayed arrival (>5s lag and earlier occurred_at than previous seq) + future-skewed clock adjusted by Host.
        {
          fact: "notes.synced",
          outcome: "succeeded",
          occurred_at: "2026-11-14T10:01:00.000Z",
          work: { work_ref: "work-doc-1" },
          subjects: [{ kind: "page", id: "doc-1", version: 4 }],
        },
        {
          fact: "notes.future_clock",
          outcome: "succeeded",
          occurred_at: "2099-01-01T00:00:00.000Z",
          work: { work_ref: "work-clock" },
        },
      ],
    },
  );
  const aiSink = f.layer.sink("agent").bind({ kind: "background", entry: "agent", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "p1", call_id: "call-ai-1" });
  aiSink.record({ fact: "agent.run", stage: "started", outcome: "succeeded", work: { run_id: "run-99" }, subjects: [{ kind: "agent_session", id: "sess-99" }] });

  // Filter by subject + version.
  const v3 = await f.service.invoke(person(), observationActions.recordsQuery, {
    use: "lookback",
    subject: { kind: "page", id: "doc-1", version: 3 },
  });
  assert.deepEqual(v3.records.map(r => r.fact), ["notes.edited"]);

  // Filter by work_ref and check `late` flag on the delayed / out-of-order record.
  const byWork = await f.service.invoke(person(), observationActions.recordsQuery, { use: "lookback", work_ref: "work-doc-1" });
  assert.deepEqual(byWork.records.map(r => [r.fact, r.late]), [
    ["notes.edited", false],
    ["notes.synced", true],
  ]);

  // Check `clock_adjusted` when reporter clock is far in the future.
  const clockAdjusted = await f.service.invoke(person(), observationActions.recordsQuery, { use: "lookback", work_ref: "work-clock" });
  assert.equal(clockAdjusted.records[0]?.clock_adjusted, true);

  // Filter by `kinds: ["ai"]` and `run_id`.
  const aiOnly = await f.service.invoke(person(), observationActions.recordsQuery, { use: "lookback", kinds: ["ai"], run_id: "run-99" });
  assert.deepEqual(aiOnly.records.map(r => [r.fact, r.kind]), [["agent.run", "ai"]]);

  // Filter by `platform_version` and check `coalesced`.
  const oldVer = await f.service.invoke(person(), observationActions.recordsQuery, { use: "lookback", platform_version: "0.28.0" });
  assert.equal(oldVer.records.length, 1);
  assert.equal(oldVer.records[0]?.coalesced?.count, 2);

  // Cursor pagination (`limit: 2`, `after_seq`) walks every matching record without duplicates or gaps.
  const allOnce = await f.service.invoke(person(), observationActions.recordsQuery, { use: "lookback", limit: 100 });
  const pagedIds: string[] = [];
  let afterSeq: number | undefined;
  for (let guard = 0; guard < 20; guard++) {
    const page = await f.service.invoke(person(), observationActions.recordsQuery, {
      use: "lookback",
      limit: 2,
      ...(afterSeq !== undefined ? { after_seq: afterSeq } : {}),
    });
    pagedIds.push(...page.records.map(r => r.record_id));
    if (!page.has_more) break;
    assert.equal(typeof page.next_seq, "number");
    afterSeq = page.next_seq ?? undefined;
  }
  assert.deepEqual(pagedIds, allOnce.records.map(r => r.record_id));
});

test("OCL-05: real Host resolves live, rewritten and deleted subjects on records.query and owner refs on evidence.get without copying plugin tables", { timeout: 120_000 }, async t => {
  const served = await openTestHome(t, { catalogPolicy: false });
  const project = await served.createProject("Subject resolution", ["todo"]);
  const client = served.host.actionClient(project.reference);
  const personCaller: ActionCallContext = {
    actor_id: LOCAL_PERSON_ACTOR_ID,
    actor_kind: "user",
    audience: "user",
    project_id: project.project_id,
    permissions: ["todo:read", "todo:write"],
  };
  const created = await client.invoke(personCaller, todoActions.create, { title: "核对工作记录对象引用" });
  const todoId = created.item.id;

  // Report a record carrying both a Todo subject (`todo_item`) and an `owner` evidence ref to that Todo (`owner: "todo_item"`).
  const layer = served.host.observation!.layer;
  layer.sink("assistant").bind({ kind: "background", entry: "background", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id }).record({
    fact: "assistant.todo_linked",
    outcome: "succeeded",
    subjects: [{ kind: "todo_item", id: todoId, version: created.item.revision }],
    evidence: [{ role: "target", ref: { kind: "owner", owner: "todo_item", id: todoId, version: created.item.revision } }],
  });
  layer.flush();

  const resolvedBefore = await client.invoke(personCaller, observationActions.recordsQuery, {
    use: "lookback",
    subject: { kind: "todo_item", id: todoId },
    resolve_subjects: true,
  });
  assert.equal(resolvedBefore.records.length, 1);
  const ownerRecord = resolvedBefore.records[0]!;
  assert.equal(ownerRecord.subject_status?.find(item => item.kind === "todo_item" && item.id === todoId)?.status, "resolved");

  // An Agent caller without `todo:read` permission gets `unverified` (never fabricated `resolved` or `missing`).
  const unprivilegedAgent: ActionCallContext = {
    actor_id: "agent:no-todo-read",
    actor_kind: "runtime",
    audience: "agent",
    project_id: project.project_id,
    permissions: [],
  };
  const unverified = await client.invoke(unprivilegedAgent, observationActions.recordsQuery, {
    use: "assistant",
    subject: { kind: "todo_item", id: todoId },
    resolve_subjects: true,
  });
  assert.equal(unverified.records[0]?.subject_status?.find(item => item.kind === "todo_item" && item.id === todoId)?.status, "unverified");

  // `evidence.get` on the `owner` ref resolves `"resolved"` while the Todo exists.
  const ownerBefore = await client.invoke(personCaller, observationActions.evidenceGet, {
    use: "lookback",
    record_id: ownerRecord.record_id,
  });
  assert.equal(ownerBefore.items[0]?.status, "owner_ref");
  if (ownerBefore.items[0]?.status === "owner_ref") assert.equal(ownerBefore.items[0].owner_resolvable, "resolved");

  // Rewrite the Todo item: the recorded version is no longer the current revision. The owner reader cannot read the old version,
  // so neither call may report the current object as `"resolved"`; it must say it cannot verify it.
  const updated = await client.invoke(personCaller, todoActions.update, { id: todoId, expected_revision: created.item.revision, title: "改写后的标题" });
  assert.ok(updated.item.revision > created.item.revision, "the business object was rewritten");
  const resolvedAfterRewrite = await client.invoke(personCaller, observationActions.recordsQuery, {
    use: "lookback",
    subject: { kind: "todo_item", id: todoId },
    resolve_subjects: true,
  });
  assert.equal(resolvedAfterRewrite.records.length, 1, "rewriting the business object keeps the historical record");
  assert.equal(resolvedAfterRewrite.records[0]?.subject_status?.find(item => item.kind === "todo_item" && item.id === todoId)?.status, "unverified",
    "a rewritten object is not reported as the recorded version");

  const ownerAfterRewrite = await client.invoke(personCaller, observationActions.evidenceGet, {
    use: "lookback",
    record_id: ownerRecord.record_id,
  });
  assert.equal(ownerAfterRewrite.items[0]?.status, "owner_ref");
  if (ownerAfterRewrite.items[0]?.status === "owner_ref") assert.equal(ownerAfterRewrite.items[0].owner_resolvable, "unverified",
    "the recorded owner version is not replaced by the current revision");

  // Delete the Todo item; subsequent resolution reports `"missing"` on both `records.query` and `evidence.get`, while the history record itself remains!
  await client.invoke(personCaller, todoActions.remove, { id: todoId, expected_revision: updated.item.revision });
  const resolvedAfter = await client.invoke(personCaller, observationActions.recordsQuery, {
    use: "lookback",
    subject: { kind: "todo_item", id: todoId },
    resolve_subjects: true,
  });
  assert.equal(resolvedAfter.records.length, 1, "deleting the business object keeps the historical record");
  assert.equal(resolvedAfter.records[0]?.subject_status?.find(item => item.kind === "todo_item" && item.id === todoId)?.status, "missing");

  const ownerAfter = await client.invoke(personCaller, observationActions.evidenceGet, {
    use: "lookback",
    record_id: ownerRecord.record_id,
  });
  assert.equal(ownerAfter.items[0]?.status, "owner_ref");
  if (ownerAfter.items[0]?.status === "owner_ref") assert.equal(ownerAfter.items[0].owner_resolvable, "missing");
});

test("OCL-13: simulated, demo and replay records are excluded by default from assistant, evaluation and export, while lookback keeps them with their source class", async t => {
  const f = createFixture(t, { demoProjects: ["demo-p1"] });
  const at = Date.parse("2026-11-14T12:00:00.000Z");
  for (const sourceClass of ["trial", "replay", "system_check"] as const) {
    await withObservationSource(sourceClass, () => f.layer.observed(agent({ call_id: `call-${sourceClass}` }), writeAction, exitDone(at - 5, at, { body: sourceClass }, { ok: true })));
  }
  f.layer.observed(agent({ call_id: "call-real" }), writeAction, exitDone(at - 5, at, { body: "real" }, { ok: true }));
  f.layer.observed(agent({ call_id: "call-demo", project_id: "demo-p1" }), writeAction, exitDone(at - 5, at, { body: "demo" }, { ok: true }));
  f.layer.flush();
  await f.service.invoke(person(), observationActions.settingsSet, { uses: { export: true } });

  const assistant = await f.service.invoke(agent(), observationActions.recordsQuery, { use: "assistant" });
  assert.deepEqual(assistant.records.map(record => record.source_class), ["real"], "assistant sees only real work by default");

  const evaluation = await f.service.invoke(person(), observationActions.recordsQuery, { use: "evaluation" });
  assert.deepEqual(evaluation.records.map(record => record.source_class), ["real"], "evaluation sees only real work by default");

  const comparison = await f.service.invoke(person(), observationActions.recordsQuery, { use: "evaluation", source_classes: ["replay"] });
  assert.deepEqual(comparison.records.map(record => record.source_class), ["replay"], "an explicit source class still allows a replay comparison");

  const included = await f.service.invoke(person(), observationActions.recordsQuery, { use: "evaluation", include_simulated: true });
  assert.equal(included.records.length, 4, "an explicit include_simulated keeps every stored class");

  const exported = await f.service.invoke(person(), observationActions.recordsQuery, { use: "export" });
  assert.deepEqual(exported.records.map(record => record.source_class), ["real"], "export sees only real work by default");

  const lookback = await f.service.invoke(person(), observationActions.recordsQuery, { use: "lookback" });
  assert.deepEqual(lookback.records.map(record => record.source_class).sort(), ["real", "replay", "system_check", "trial"],
    "the person's lookback keeps simulated records and their source class");

  const demoAssistant = await f.service.invoke(person({ project_id: "demo-p1" }), observationActions.recordsQuery, { use: "assistant", project_id: "demo-p1" });
  assert.deepEqual(demoAssistant.records, [], "a demo project's records are not assistant work by default");
  const demoLookback = await f.service.invoke(person({ project_id: "demo-p1" }), observationActions.recordsQuery, { use: "lookback", project_id: "demo-p1" });
  assert.deepEqual(demoLookback.records.map(record => record.source_class), ["demo"], "lookback keeps the demo class visible");
});

test("OCL-08: coverage.get merges declared plan with measured counts, scopes versions to project and distinguishes quiet windows from gaps", async t => {
  let clockMs = Date.parse("2026-11-14T08:00:00.000Z");
  const f = createFixture(t, { now: () => new Date(clockMs), platformVersion: "0.28.0" });
  f.layer.observed(agent({ project_id: "p1" }), writeAction, exitDone(clockMs - 5, clockMs, { body: "p1-v28" }, { ok: true }));
  f.layer.flush();

  f.setVersion("0.29.0");
  clockMs = Date.parse("2026-11-14T09:00:00.000Z");
  f.layer.observed(agent({ project_id: "p2" }), writeAction, exitDone(clockMs - 5, clockMs, { body: "p2-v29" }, { ok: true }));
  await f.service.invoke(
    pluginCaller("pages", "pages-install", {
      project_id: "p2",
      host_plugin: { plugin_id: "pages", install_id: "pages-install", actor_id: "plugin:pages", project_id: "p2", declaration: { manifest: {} as never }, assertActive: () => {} },
    }),
    observationActions.report,
    { facts: [{ fact: "pages.saved", outcome: "succeeded" }] },
  );
  f.layer.flush();

  const p1Coverage = await f.service.invoke(person({ project_id: "p1" }), observationActions.coverageGet, {
    use: "lookback",
    since: "2026-11-14T07:30:00.000Z",
    until: "2026-11-14T08:30:00.000Z",
  });
  assert.ok(p1Coverage.entries.some(entry => entry.fact === "action.call" && entry.state === "complete"));
  assert.deepEqual(p1Coverage.versions, ["0.28.0"], "project-scoped versions include only versions seen in p1");
  assert.equal(p1Coverage.activity_summary.has_records, true);
  assert.equal(p1Coverage.activity_summary.total_records >= 1, true);
  assert.equal(p1Coverage.activity_summary.has_gaps, false);

  // Quiet window with zero activity and zero gaps is distinguished cleanly.
  const quiet = await f.service.invoke(person({ project_id: "p1" }), observationActions.coverageGet, {
    use: "lookback",
    since: "2026-11-10T00:00:00.000Z",
    until: "2026-11-10T01:00:00.000Z",
  });
  assert.deepEqual(quiet.activity_summary, { has_records: false, total_records: 0, has_gaps: false });

  // `scope_filter` separates entry, plugin and flow groups, and plan entries carry complete / unavailable / not_applicable / by_rule states.
  const allCov = await f.service.invoke(person(), observationActions.coverageGet, { use: "lookback", all_projects: true });
  assert.ok(allCov.entries.some(entry => entry.state === "unavailable"), "declared unavailable entries included");
  assert.ok(allCov.entries.some(entry => entry.state === "not_applicable"), "declared not_applicable entries included");
  assert.ok(allCov.entries.some(entry => entry.state === "by_rule"), "declared by_rule entries included");
  assert.deepEqual([...allCov.versions].sort(), ["0.28.0", "0.29.0"], "all_projects includes both versions");

  for (const group of ["entry", "plugin", "flow"] as const) {
    const filtered = await f.service.invoke(person(), observationActions.coverageGet, { use: "lookback", all_projects: true, scope_filter: group });
    assert.ok(filtered.entries.length > 0 && filtered.entries.every(entry => entry.scope_group === group), `scope_filter=${group}`);
  }
});

test("OCL-09: pausing flushes prior records, drops new records without consuming report quota or counting lost gaps, and resuming records a by_rule gap", async t => {
  let clockMs = Date.parse("2026-11-14T12:00:00.000Z");
  const f = createFixture(t, { now: () => new Date(clockMs) });

  // Enqueue a record without manual flush right before pausing: pause must flush it first!
  f.layer.observed(agent(), writeAction, exitDone(clockMs - 5, clockMs, { step: "before-pause" }, { ok: true }));
  const pausedState = await f.service.invoke(person(), observationActions.settingsSet, { paused: true });
  assert.equal(pausedState.recording.state, "paused");
  assert.equal(pausedState.recording.paused_at, "2026-11-14T12:00:00.000Z");

  // Prior record survived; `recording.paused_at` is visible on `records.query` and `coverage.get`.
  const duringPauseQuery = await f.service.invoke(person(), observationActions.recordsQuery, { use: "lookback" });
  assert.equal(duringPauseQuery.recording.state, "paused");
  assert.equal(duringPauseQuery.recording.paused_at, "2026-11-14T12:00:00.000Z");
  assert.ok(duringPauseQuery.records.some(r => r.fact === "action.call" && r.detail.action === "notes.save@1"));
  const duringPauseCov = await f.service.invoke(person(), observationActions.coverageGet, { use: "lookback" });
  assert.equal(duringPauseCov.recording.paused_at, "2026-11-14T12:00:00.000Z");

  // While paused: exit calls, service sink writes, AND plugin `observation.report@1` calls drop cleanly without consuming `report_quota` or recording `lost` gaps.
  clockMs = Date.parse("2026-11-14T12:10:00.000Z");
  f.layer.observed(agent(), writeAction, exitDone(clockMs - 5, clockMs, { step: "while-paused" }, { ok: true }));
  f.layer.sink("agent").bind({ kind: "background", entry: "agent", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "p1" })
    .record({ fact: "agent.run", stage: "started", outcome: "succeeded" });
  const reportWhilePaused = await f.service.invoke(pluginCaller("notes", "notes-install"), observationActions.report, {
    facts: [{ fact: "notes.while_paused", outcome: "succeeded" }],
  });
  assert.deepEqual(reportWhilePaused, { accepted: 0, rejected: [] });
  f.layer.flush();

  const quotaRows = f.db().prepare("SELECT COUNT(*) AS n FROM report_quota WHERE reporter = ?").get("install:notes-install") as { n: number };
  assert.equal(quotaRows.n, 0, "short-circuited before admit(): report_quota untouched while paused");
  assert.ok(!readRecords(f.db(), { include_synthetic: true }).some(r => r.fact === "notes.while_paused" || r.fact === "agent.run"));
  assert.ok(!readCoverageGaps(f.db()).some(gap => gap.state === "lost"), "paused period never counts as lost");

  // Resume 30 minutes later: writes a single `by_rule` (`recording_paused`) gap and re-opens recording.
  clockMs = Date.parse("2026-11-14T12:30:00.000Z");
  const resumed = await f.service.invoke(person(), observationActions.settingsSet, { paused: false });
  assert.equal(resumed.recording.state, "recording");
  assert.equal(resumed.recording.paused_at, undefined);

  const gaps = readCoverageGaps(f.db()).filter(gap => gap.reason === "recording_paused");
  assert.equal(gaps.length, 1);
  assert.deepEqual([gaps[0]!.state, gaps[0]!.started_at, gaps[0]!.ended_at], ["by_rule", "2026-11-14T12:00:00.000Z", "2026-11-14T12:30:00.000Z"]);

  // Subsequent report works immediately.
  const afterResume = await f.service.invoke(pluginCaller("notes", "notes-install"), observationActions.report, {
    facts: [{ fact: "notes.after_resume", outcome: "succeeded" }],
  });
  assert.deepEqual(afterResume, { accepted: 1, rejected: [] });
  f.layer.flush();
  assert.ok(readRecords(f.db()).some(r => r.fact === "notes.after_resume"));
});

test("OCL-12 PWA-111 PWA-112: retention shortfalls are reported without silent extension, and manual/automatic cleanup deletes snapshots, records expired gap and keeps business objects", { timeout: 120_000 }, async t => {
  const clockMs = Date.parse("2026-11-14T12:00:00.000Z");
  const f = createFixture(t, { now: () => new Date(clockMs) });

  const initial = await f.service.invoke(person(), observationActions.settingsGet, {});
  assert.equal(initial.retention.mode, "keep");
  assert.equal(initial.retention.shortfall, false);
  assert.deepEqual(initial.retention.requirements.map(r => [r.consumer, r.need_days, r.kept]), [
    ["weekly_report", 7, true],
    ["cross_period_compare", 60, true],
    ["evaluation_samples", 120, true],
  ]);

  // Setting 30 days reports shortfalls (`kept: false`) for 60d and 120d without silently extending retention!
  const set30 = await f.service.invoke(person(), observationActions.settingsSet, { retention_mode: "30" });
  assert.equal(set30.retention.mode, "30", "user's choice is kept verbatim, never silently lengthened");
  assert.equal(set30.retention.shortfall, true);
  assert.deepEqual(set30.retention.requirements.map(r => [r.consumer, r.kept]), [
    ["weekly_report", true],
    ["cross_period_compare", false],
    ["evaluation_samples", false],
  ]);
  const set90 = await f.service.invoke(person(), observationActions.settingsSet, { retention_mode: "90" });
  assert.equal(set90.retention.shortfall, true);
  assert.deepEqual(set90.retention.requirements.map(r => [r.consumer, r.kept]), [
    ["weekly_report", true],
    ["cross_period_compare", true],
    ["evaluation_samples", false],
  ]);
  await f.service.invoke(person(), observationActions.settingsSet, { retention_mode: "keep" });

  // Seed old (45 days ago) and recent (2 days ago) records, sharing one common snapshot and holding one old-only snapshot.
  const oldIso = "2026-09-30T12:00:00.000Z";
  const recentIso = "2026-11-12T12:00:00.000Z";
  await f.service.invoke(pluginCaller("notes", "notes-install"), observationActions.report, {
    facts: [
      {
        fact: "notes.old_entry",
        outcome: "succeeded",
        occurred_at: oldIso,
        evidence: [
          { role: "unique_old", ref: { kind: "content", media_type: "text/plain", text: "ONLY_IN_OLD_RECORD" } },
          { role: "shared", ref: { kind: "content", media_type: "text/plain", text: "SHARED_ACROSS_RECORDS" } },
        ],
      },
      {
        fact: "notes.recent_entry",
        outcome: "succeeded",
        occurred_at: recentIso,
        evidence: [
          { role: "shared", ref: { kind: "content", media_type: "text/plain", text: "SHARED_ACROSS_RECORDS" } },
        ],
      },
    ],
  });
  f.layer.flush();
  const blobsBefore = (f.db().prepare("SELECT COUNT(*) AS n FROM evidence_blobs").get() as { n: number }).n;
  assert.equal(blobsBefore, 2, "unique_old + shared");

  // Preview manual cleanup before 2026-10-15.
  const cutoff = "2026-10-15T00:00:00.000Z";
  const preview = await f.service.invoke(person({ project_id: null }), observationActions.cleanupPreview, { time_range: "custom", before: cutoff });
  assert.ok(preview.matching_records >= 1);
  assert.equal(preview.unreferenced_snapshots, 1, "only the unreferenced unique_old blob will be freed; shared blob stays");
  assert.deepEqual([preview.preserved.business_objects, preview.preserved.pages_versions, preview.preserved.saved_briefs], [true, true, true]);
  assert.equal(preview.impacts.some(item => item.impact === "timeline_expired_gap" && item.affected), true);

  // Apply manual cleanup.
  const applied = await f.service.invoke(person({ project_id: null }), observationActions.cleanupApply, { time_range: "custom", before: cutoff });
  assert.equal(applied.deleted_records, preview.matching_records);
  assert.equal(applied.deleted_snapshots, 1);
  assert.equal(applied.gap_recorded, true);

  const blobsAfter = (f.db().prepare("SELECT COUNT(*) AS n FROM evidence_blobs").get() as { n: number }).n;
  assert.equal(blobsAfter, 1, "unique_old blob deleted, shared blob preserved");
  assert.ok(!readRecords(f.db()).some(r => r.fact === "notes.old_entry"));
  assert.ok(readRecords(f.db()).some(r => r.fact === "notes.recent_entry"));
  const expiredGaps = readCoverageGaps(f.db()).filter(g => g.state === "expired");
  assert.equal(expiredGaps.length, 1);

  // Automatic retention sweep: setting `retention_mode: "30"` sweeps any record older than 30 days automatically!
  await f.service.invoke(pluginCaller("notes", "notes-install"), observationActions.report, {
    facts: [{ fact: "notes.auto_swept", outcome: "succeeded", occurred_at: "2026-10-01T12:00:00.000Z" }],
  });
  f.layer.flush();
  assert.ok(readRecords(f.db()).some(r => r.fact === "notes.auto_swept"));
  const sweptSettings = await f.service.invoke(person(), observationActions.settingsSet, { retention_mode: "30" });
  assert.ok(!readRecords(f.db()).some(r => r.fact === "notes.auto_swept"), "automatic retention sweep removes records past cutoff");
  assert.equal(typeof sweptSettings.retention.last_cleanup_at, "string");

  // Real Host verification: cleaning up all work records in a project leaves the Todo business item intact!
  const served = await openTestHome(t, { catalogPolicy: false });
  const project = await served.createProject("Cleanup keeps business", ["todo"]);
  const client = served.host.actionClient(project.reference);
  const caller: ActionCallContext = {
    actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user",
    project_id: project.project_id, permissions: ["todo:read", "todo:write"],
  };
  const todo = await client.invoke(caller, todoActions.create, { title: "不能被清掉的业务待办" });
  served.host.observation!.layer.flush();
  const wiped = await client.invoke(caller, observationActions.cleanupApply, {
    time_range: "custom",
    before: new Date(Date.now() + 60_000).toISOString(),
    project_id: project.project_id,
  });
  assert.ok(wiped.deleted_records >= 1);
  const stillThere = await client.invoke(caller, todoActions.get, { id: todo.item.id });
  assert.equal(stillThere.item.title, "不能被清掉的业务待办", "cleaning work records never touches business data");
});

test("OCL-12 OCL-15: space.get breaks down 5 record kinds, files and projects, and space_reminder_bytes warns without blocking writes", async t => {
  const f = createFixture(t);

  // Seed records across all 5 display kinds + snapshots across p1 and p2:
  // 1) `user`: system command (`system.mcp`)
  f.layer.observed(person({ project_id: "p1" }), systemWriteAction, exitDone(90, 95, { grant: "mcp-1" }, { ok: true }));
  // 2) `content`: plugin write command (`notes.save`) + plugin fact (`pages.saved`)
  f.layer.observed(person({ project_id: "p1" }), writeAction, exitDone(100, 110, { text: "content-write-payload" }, { ok: true }));
  await f.service.invoke(pluginCaller("pages", "pages-install", { project_id: "p1" }), observationActions.report, {
    facts: [{ fact: "pages.saved", outcome: "succeeded" }],
  });
  // 3) `ai`: Agent round fact
  f.layer.sink("agent").bind({ kind: "background", entry: "agent", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "p1" })
    .record({ fact: "agent.run", stage: "started", outcome: "succeeded" });
  // 4) `flow`: workflow step fact
  await f.service.invoke(pluginCaller("io.molis.work.native.workflows", "wf-install", { project_id: "p2" }), observationActions.report, {
    facts: [{ fact: "io.molis.work.native.workflows.step", outcome: "succeeded" }],
  });
  // 5) `present`: assistant feedback fact
  f.layer.sink("assistant").bind({ kind: "background", entry: "host", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "p1" })
    .record({ fact: "assistant.feedback", outcome: "succeeded" });
  f.layer.flush();

  const spaceNone = await f.service.invoke(person(), observationActions.spaceGet, {});
  assert.equal(spaceNone.reminder_status, "none");
  assert.deepEqual(spaceNone.by_kind.map(row => row.kind), ["user", "ai", "content", "flow", "present", "files"]);
  for (const kind of ["user", "ai", "content", "flow", "present", "files"] as const) {
    const row = spaceNone.by_kind.find(item => item.kind === kind)!;
    assert.ok(row.count >= 1, `${kind} has count >= 1`);
  }
  assert.ok(spaceNone.by_project.some(row => row.project_id === "p1") && spaceNone.by_project.some(row => row.project_id === "p2"));

  // Configure `space_reminder_bytes` above, near, and below `total_bytes`, and confirm reopen + writes still work when exceeded!
  await f.service.invoke(person(), observationActions.settingsSet, { space_reminder_bytes: spaceNone.total_bytes * 10 });
  assert.equal((await f.service.invoke(person(), observationActions.spaceGet, {})).reminder_status, "ok");

  await f.service.invoke(person(), observationActions.settingsSet, { space_reminder_bytes: Math.ceil(spaceNone.total_bytes * 1.1) });
  assert.equal((await f.service.invoke(person(), observationActions.spaceGet, {})).reminder_status, "near");

  await f.service.invoke(person(), observationActions.settingsSet, { space_reminder_bytes: Math.max(1, Math.floor(spaceNone.total_bytes / 2)) });
  f.reopen();
  const spaceExceeded = await f.service.invoke(person(), observationActions.spaceGet, {});
  assert.equal(spaceExceeded.reminder_status, "exceeded");

  // Even when `exceeded`, new records continue to write without deletion or refusal!
  f.layer.observed(person({ project_id: "p1" }), systemWriteAction, exitDone(200, 210, { text: "still-writes-past-reminder" }, { ok: true }));
  const afterExceeded = await f.service.invoke(person({ project_id: "p1" }), observationActions.recordsQuery, { use: "lookback" });
  assert.ok(afterExceeded.records.length >= 6, "space reminder never deletes records or blocks new writes");
});

test("OCL-03 EC-09: interleaved concurrent tasks stay separated by work_ref, call_id and run_id, and distinguish person-initiated stop from failure", async t => {
  const f = createFixture(t);

  // Interleave events from Task A (stopped mid-way by person) and Task B (succeeds cleanly) on the same project.
  const sinkA = f.layer.sink("agent").bind({ kind: "background", entry: "agent", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "p1", call_id: "call-task-A" });
  const sinkB = f.layer.sink("agent").bind({ kind: "background", entry: "agent", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "p1", call_id: "call-task-B" });

  sinkA.record({ fact: "agent.run", stage: "started", outcome: "succeeded", work: { work_ref: "task-A", run_id: "run-A" }, subjects: [{ kind: "agent_session", id: "sess-A" }] });
  sinkB.record({ fact: "agent.run", stage: "started", outcome: "succeeded", work: { work_ref: "task-B", run_id: "run-B" }, subjects: [{ kind: "agent_session", id: "sess-B" }] });
  f.layer.observed(agent({ call_id: "call-task-B", runtime_session_id: "sess-B" }), writeAction, exitDone(10, 20, { note: "B-step" }, { ok: true }));
  // Person cancels Task A (`aborted: true` -> `outcome: "cancelled"`), while an independent call C fails (`outcome: "failed"`).
  f.layer.observed(person({ call_id: "call-task-A" }), writeAction, exitDone(15, 25, { note: "A-aborted" }, undefined, { outcome: { ok: false, code: "agent.cancelled" }, aborted: true }));
  sinkA.record({ fact: "agent.run", stage: "ended", outcome: "cancelled", work: { work_ref: "task-A", run_id: "run-A" }, detail: { stopped_by: LOCAL_PERSON_ACTOR_ID }, subjects: [{ kind: "agent_session", id: "sess-A" }] });
  f.layer.observed(agent({ call_id: "call-task-C" }), writeAction, exitDone(30, 40, { note: "C-boom" }, undefined, { outcome: { ok: false, code: "notes.broken" }, aborted: false }));
  sinkB.record({ fact: "agent.run", stage: "ended", outcome: "succeeded", work: { work_ref: "task-B", run_id: "run-B" }, subjects: [{ kind: "agent_session", id: "sess-B" }] });

  const chainA = await f.service.invoke(person(), observationActions.recordsQuery, { use: "lookback", call_id: "call-task-A" });
  const chainB = await f.service.invoke(person(), observationActions.recordsQuery, { use: "lookback", call_id: "call-task-B" });
  const chainC = await f.service.invoke(person(), observationActions.recordsQuery, { use: "lookback", call_id: "call-task-C" });

  assert.ok(chainA.records.every(r => r.work.call_id === "call-task-A"), "Task A chain contains no records from B or C");
  assert.ok(chainB.records.every(r => r.work.call_id === "call-task-B"), "Task B chain contains no records from A or C");
  assert.deepEqual(chainA.records.map(r => [r.fact, r.outcome, r.actor.actor_id]), [
    ["agent.run", "succeeded", LOCAL_PERSON_ACTOR_ID],
    ["action.call", "cancelled", LOCAL_PERSON_ACTOR_ID],
    ["agent.run", "cancelled", LOCAL_PERSON_ACTOR_ID],
  ]);
  assert.equal(chainC.records[0]?.outcome, "failed", "system failure is failed, distinct from person-initiated cancelled");
  assert.deepEqual(chainB.records.map(r => [r.fact, r.outcome]), [
    ["agent.run", "succeeded"],
    ["action.call", "succeeded"],
    ["agent.run", "succeeded"],
  ]);
});
