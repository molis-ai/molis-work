import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { EVALUATION_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/evaluation";
import { observationActions } from "@molis-ai/molis-work-contracts/services/observation";
import { ActionService } from "@molis-ai/molis-work-kernel";
import {
  RETENTION_KEY,
  retentionActions,
  ObservationLayer,
  observationKeys,
  readCoverageGaps,
  readRecords,
  type ObservationEnvironment,
} from "@molis-ai/molis-work-service-observation";

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

const person = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({
  actor_id: LOCAL_PERSON_ACTOR_ID,
  actor_kind: "user",
  audience: "user",
  project_id: "p1",
  permissions: [],
  ...extra,
});

function createFixture(t: test.TestContext, initialNow = "2026-11-15T12:00:00.000Z", readableProjects?: () => Promise<string[]>) {
  const home = mkdtempSync(join(tmpdir(), "observation-eval-holds-"));
  const secrets = memorySecrets();
  let currentNow = new Date(initialNow);
  const projects = new Set(["p1", "p2"]);
  const env: ObservationEnvironment = {
    platformVersion: "0.30.0",
    now: () => currentNow,
    projectClass: id => (projects.has(id) ? "user" : undefined),
    readableProjects: readableProjects ?? (async () => [...projects]),
  };

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
    setNow: (iso: string) => { currentNow = new Date(iso); },
    reopen: () => {
      layer?.close();
      return mount();
    },
    db: () => layer!.writer.database()!.db,
  };
}

test("OCL-12 EC-16: evaluation holds exempt records and encrypted snapshots from manual and automatic retention clean-up until released or expired", async t => {
  const fx = createFixture(t, "2026-11-15T12:00:00.000Z");

  const writeWorkRecord = (occurredAt: string, workRef: string, payloadText: string) => {
    fx.layer.sink("assistant")
      .bind({ kind: "background", entry: "workbench", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "p1" })
      .record({
        fact: "assistant.work",
        outcome: "succeeded",
        occurred_at: occurredAt,
        work: { work_ref: workRef },
        subjects: [{ kind: "goal", id: `goal-${workRef}` }],
        detail: { step: "deliver" },
        evidence: [{ role: "output", ref: { kind: "content", media_type: "text/plain", text: payloadText } }],
      });
  };

  // Three records 60 days old: one held indefinitely, one held with short expiry, one unheld (plus shared snapshot text on held + unheld)
  writeWorkRecord("2026-09-10T10:00:00.000Z", "w-held-regression", "regression-evidence-body");
  writeWorkRecord("2026-09-10T10:05:00.000Z", "w-held-expiring", "shared-evidence-body");
  writeWorkRecord("2026-09-10T10:10:00.000Z", "w-unheld", "shared-evidence-body");
  fx.layer.flush();

  const allBefore = await fx.service.invoke(person(), observationActions.recordsQuery, { use: "evaluation" });
  const recRegression = allBefore.records.find(r => r.work.work_ref === "w-held-regression")!;
  const recExpiring = allBefore.records.find(r => r.work.work_ref === "w-held-expiring")!;
  const recUnheld = allBefore.records.find(r => r.work.work_ref === "w-unheld")!;
  assert.ok(recRegression && recExpiring && recUnheld);

  await fx.service.invoke(person(), observationActions.holdsPut, {
    hold_id: "hold-reg",
    sample_id: "sample-regression-1",
    project_id: "p1",
    record_ids: [recRegression.record_id, "obs-missing-id"],
    expires_at: null,
    note: "Canonical regression sample",
  });
  await fx.service.invoke(person(), observationActions.holdsPut, {
    hold_id: "hold-exp",
    sample_id: "sample-expiring-2",
    project_id: "p1",
    record_ids: [recExpiring.record_id],
    expires_at: "2026-11-20T00:00:00.000Z",
  });

  const listed = await fx.service.invoke(person(), observationActions.holdsList, { project_id: "p1" });
  assert.equal(listed.holds.length, 2);
  assert.equal(listed.summary.count, 2);

  // Preview manual clean-up before_30d: only `recUnheld` is deletable, 2 samples preserved, 0 snapshots unreferenced (shared with recExpiring!)
  const preview = await fx.service.invoke(person(), observationActions.cleanupPreview, { time_range: "before_30d", project_id: "p1" });
  assert.equal(preview.matching_records, 1);
  assert.equal(preview.unreferenced_snapshots, 0);
  assert.equal(preview.preserved.evaluation_samples_count, 2);

  const cleaned = await fx.service.invoke(person(), observationActions.cleanupApply, { time_range: "before_30d", project_id: "p1" });
  assert.equal(cleaned.deleted_records, 1);
  assert.equal(cleaned.deleted_snapshots, 0);
  assert.equal(cleaned.gap_recorded, true);

  // Automatic retention sweep at 30d also leaves both held records and their snapshots untouched
  const { values: [retention] } = await fx.service.invoke(person(), retentionActions.read, { keys: [RETENTION_KEY] });
  assert.ok(retention);
  await fx.service.invoke(person(), retentionActions.write, { key: RETENTION_KEY, layer: "personal", expected_revision: retention.revision,
    request_id: "set-retention-30", change: { set: "30" } });
  assert.equal(fx.layer.sweepRetention(), null);

  const afterClean = await fx.service.invoke(person(), observationActions.recordsQuery, { use: "evaluation" });
  assert.deepEqual(afterClean.records.map(r => r.record_id).sort(), [recRegression.record_id, recExpiring.record_id].sort());

  const regEvidence = await fx.service.invoke(person(), observationActions.evidenceGet, { use: "evaluation", record_id: recRegression.record_id, role: "output" });
  assert.equal(regEvidence.items[0]!.text, "regression-evidence-body");
  const expEvidence = await fx.service.invoke(person(), observationActions.evidenceGet, { use: "evaluation", record_id: recExpiring.record_id, role: "output" });
  assert.equal(expEvidence.items[0]!.text, "shared-evidence-body");

  // Advance clock past `hold-exp`'s expiry: automatic retention sweep now deletes `recExpiring` and its snapshot, keeping `recRegression`
  fx.setNow("2026-11-25T00:00:00.000Z");
  const activeOnly = await fx.service.invoke(person(), observationActions.holdsList, {});
  assert.deepEqual(activeOnly.holds.map(h => h.hold_id), ["hold-reg"]);
  const withExpired = await fx.service.invoke(person(), observationActions.holdsList, { include_expired: true });
  assert.equal(withExpired.holds.find(h => h.hold_id === "hold-exp")?.expired, true);

  const sweptExpiredHold = fx.layer.sweepRetention();
  assert.ok(sweptExpiredHold);
  assert.equal(sweptExpiredHold.deleted_records, 1);
  assert.equal(sweptExpiredHold.deleted_snapshots, 1);

  // Release `hold-reg`: now `recRegression` returns to normal 30d retention and is swept too
  const released = await fx.service.invoke(person(), observationActions.holdsRelease, { sample_id: "sample-regression-1" });
  assert.deepEqual(released.released_hold_ids, ["hold-reg"]);
  const sweptReleased = fx.layer.sweepRetention();
  assert.ok(sweptReleased);
  assert.equal(sweptReleased.deleted_records, 1);
  assert.equal(sweptReleased.deleted_snapshots, 1);
  assert.equal(readRecords(fx.db()).length, 0);
  assert.ok(readCoverageGaps(fx.db()).some(gap => gap.state === "expired"));
});

test("OCL-12 OCL-17: project deletion and plugin purge override evaluation holds, and evaluation service calls skip exit recording", async t => {
  const fx = createFixture(t, "2026-11-15T12:00:00.000Z");

  // Plugin-owned record in p1 + assistant record in p2
  await fx.service.invoke(
    {
      actor_id: "plugin:io.molis.work.notes",
      actor_kind: "runtime",
      audience: "plugin",
      project_id: "p1",
      permissions: [],
      host_plugin: {
        plugin_id: "io.molis.work.notes",
        install_id: "notes-install-1",
        actor_id: "plugin:io.molis.work.notes",
        project_id: "p1",
        declaration: { manifest: {} as never },
        assertActive: () => {},
      },
    },
    observationActions.report,
    {
      facts: [{
        fact: "io.molis.work.notes.saved",
        outcome: "succeeded",
        subjects: [{ kind: "note", id: "n-1" }],
        evidence: [{ role: "body", ref: { kind: "content", media_type: "text/plain", text: "secret-note-body" } }],
      }],
    },
  );
  fx.layer.sink("assistant")
    .bind({ kind: "background", entry: "workbench", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "p2" })
    .record({
      fact: "assistant.work",
      outcome: "succeeded",
      subjects: [{ kind: "goal", id: "g-p2" }],
      evidence: [{ role: "output", ref: { kind: "content", media_type: "text/plain", text: "p2-held-output" } }],
    });

  // Meta-call answered by `system.evaluation` must be skipped by `observed` (OCL-17)
  fx.layer.observed(
    person(),
    { capability_id: "evaluation.runs.execute", version: 1, provider_id: EVALUATION_PROVIDER_ID, operation: "command" },
    {
      invocation_id: "inv-eval-1",
      started_at: Date.parse("2026-11-15T12:00:00.000Z"),
      ended_at: Date.parse("2026-11-15T12:00:00.050Z"),
      handler_started: true,
      input: { suite_id: "canonical" },
      result: { ok: true },
      outcome: { ok: true },
      aborted: false,
    },
  );
  fx.layer.flush();

  const recordsBefore = readRecords(fx.db());
  assert.equal(recordsBefore.some(r => r.detail.action === "evaluation.runs.execute@1"), false, "system.evaluation meta-call not recorded as real work");
  const noteRec = recordsBefore.find(r => r.fact === "io.molis.work.notes.saved")!;
  const p2Rec = recordsBefore.find(r => r.project_id === "p2")!;
  assert.ok(noteRec && p2Rec);

  await fx.service.invoke(person(), observationActions.holdsPut, {
    hold_id: "hold-note",
    sample_id: "sample-note",
    project_id: "p1",
    record_ids: [noteRec.record_id],
    expires_at: null,
  });
  await fx.service.invoke(person(), observationActions.holdsPut, {
    hold_id: "hold-p2",
    sample_id: "sample-p2",
    project_id: "p2",
    record_ids: [p2Rec.record_id],
    expires_at: null,
  });
  assert.equal((fx.db().prepare("SELECT COUNT(*) AS n FROM evidence_blobs").get() as { n: number }).n, 2);

  // Plugin data purge overrides hold on `noteRec` and collects its encrypted blob
  fx.layer.purgePlugin({
    plugin_id: "io.molis.work.notes",
    install_ids: ["notes-install-1"],
    provider_ids: ["io.molis.work.notes"],
    project_id: "p1",
  });
  assert.equal(readRecords(fx.db()).some(r => r.record_id === noteRec.record_id), false);
  assert.equal((fx.db().prepare("SELECT COUNT(*) AS n FROM evidence_blobs").get() as { n: number }).n, 1);
  const holdNoteAfterPurge = (await fx.service.invoke(person(), observationActions.holdsList, { sample_id: "sample-note" })).holds[0]!;
  assert.equal(holdNoteAfterPurge.active_record_count, 0);

  // Project deletion overrides hold on `p2` and removes project holds + records + encrypted blobs
  fx.projects.delete("p2");
  fx.layer.clearProject("p2");
  assert.equal(readRecords(fx.db()).length, 0);
  assert.equal((fx.db().prepare("SELECT COUNT(*) AS n FROM evidence_blobs").get() as { n: number }).n, 0);
  assert.equal((fx.db().prepare("SELECT COUNT(*) AS n FROM evaluation_holds WHERE project_id = 'p2'").get() as { n: number }).n, 0);
});

test("F-horiz-runtime-22: holds.put and holds.release honor beforeEffect and revocation before mutating evaluation_holds", async t => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let gate = false;
  const fx = createFixture(t, "2026-11-15T12:00:00.000Z", async () => {
    if (gate) {
      entered.resolve();
      await release.promise;
    }
    return ["p1", "p2"];
  });

  fx.layer.sink("assistant")
    .bind({ kind: "background", entry: "workbench", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "p1" })
    .record({ fact: "assistant.work", outcome: "succeeded", subjects: [{ kind: "goal", id: "g-hold" }] });
  fx.layer.flush();
  const [rec] = readRecords(fx.db());
  assert.ok(rec);

  gate = true;
  let revoked = false;
  const putPending = fx.service.invoke(
    person({ validate_authority: () => { if (revoked) throw new Error("hold put revoked"); } }),
    observationActions.holdsPut,
    { hold_id: "hold-aborted", sample_id: "sample-aborted", project_id: "p1", record_ids: [rec.record_id], expires_at: null },
  );
  await entered.promise;
  revoked = true;
  release.resolve();
  await assert.rejects(putPending, /hold put revoked/);
  assert.equal((fx.db().prepare("SELECT COUNT(*) AS n FROM evaluation_holds").get() as { n: number }).n, 0);

  gate = false;
  await fx.service.invoke(person(), observationActions.holdsPut, {
    hold_id: "hold-kept", sample_id: "sample-kept", project_id: "p1", record_ids: [rec.record_id], expires_at: null,
  });
  assert.equal((fx.db().prepare("SELECT COUNT(*) AS n FROM evaluation_holds").get() as { n: number }).n, 1);

  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    fx.service.invoke(person(), observationActions.holdsRelease, { hold_id: "hold-kept" }, { signal: ac.signal }),
  );
  assert.equal((fx.db().prepare("SELECT COUNT(*) AS n FROM evaluation_holds WHERE hold_id = 'hold-kept'").get() as { n: number }).n, 1);
});
