import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";

import { fromBetterSqlite, SignalsModule } from "@molis-ai/molis-work-plugin-feed/store";
import { SourcesModule } from "@molis-ai/molis-work-plugin-feed/store";
import { ConnectorHost } from "@molis-ai/molis-work-service-connector-host";
import { ListenerHost } from "@molis-ai/molis-work-plugin-feed/store";
import type {
  ConnectorDriver,
  ConnectorFailureKind,
  ConnectorPollResult,
  ConnectorRawEvent,
} from "@molis-ai/molis-work-contracts/services/connector-host";
import type { RawEventAdapter } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";

import { DEMO_PROJECT_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

function rawEvent(id: string, cursorAfter?: unknown): ConnectorRawEvent {
  return {
    raw_event_id: `raw-${id}`,
    provider_dedupe_id: id,
    occurred_at: "2026-09-02T08:00:00.000Z",
    observed_at: "2026-09-02T08:00:01.000Z",
    payload: { title: `Event ${id}`, summary: `Summary ${id}` },
    ...(cursorAfter === undefined ? {} : { cursor_after: cursorAfter }),
  };
}

function adapter(failOnceFor?: string): RawEventAdapter {
  let failed = false;
  return {
    adapter: { plugin_id: "io.molis.work.integration.fixture", version: "1.0.0" },
    toSignalDraft(event) {
      if (!failed && event.provider_dedupe_id === failOnceFor) {
        failed = true;
        throw new Error("fixture adapter interruption");
      }
      return {
        kind: "update",
        occurred_at: event.occurred_at,
        observed_at: event.observed_at,
        payload: structuredClone(event.payload),
        content_refs: [],
        provenance: { fixture: true },
      };
    },
  };
}

function createSource(store: LocalProjectDatabase): string {
  const now = "2026-09-02T08:00:00.000Z";
  const sourceId = "source-fd1-fixture";
  new SourcesModule(fromBetterSqlite(store.db)).commands.save({
    project_id: DEMO_PROJECT_ID,
    source_id: sourceId,
    kind: "fixture",
    definition_id: "fixture",
    sync_kind: "manual",
    name: "FD1 Fixture",
    description: "Provider-neutral receive-chain fixture",
    status: "active",
    enabled: true,
    origin: "molis_work",
    config: {},
    schedule: { mode: "manual" },
    connection_ref: "fixture-connection",
    account_label: null,
    last_sync_at: null,
    last_outcome: null,
    last_error_code: null,
    imported_at: now,
    updated_at: now,
  });
  return sourceId;
}

function connectorWith(driver: ConnectorDriver): ConnectorHost {
  const connector = new ConnectorHost({ timeoutMs: 2_000 });
  connector.registerDriver(driver);
  connector.connect({ connection_id: "fixture-connection", driver_id: driver.driver_id });
  return connector;
}

test("FAS-01: rejected Signal drafts leave records, revisions and events unchanged", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-signal-refusal-"));
  const databasePath = join(directory, "molis-work.sqlite");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  try {
    const signals = new SignalsModule(fromBetterSqlite(store.db));
    const draft = { project_id: DEMO_PROJECT_ID, source_id: "fas-source", provider_dedupe_id: "fas-event", kind: "update",
      occurred_at: "2026-09-02T08:00:00.000Z", observed_at: "2026-09-02T08:00:01.000Z", payload: { title: "Accepted event" },
      raw_event_id: "fas-raw-event", adapter: { plugin_id: "io.molis.work.integration.fixture", version: "1.0.0" }, provenance: {} };
    const accepted = signals.commands.submitDraft(draft);
    const records = signals.query.list(DEMO_PROJECT_ID), events = signals.events.list(DEMO_PROJECT_ID);
    const revisions = store.db.prepare("SELECT * FROM signal_revisions ORDER BY signal_id, revision").all();
    assert.throws(() => signals.query.get(DEMO_PROJECT_ID, "missing-fas-signal"), (error: unknown) => error instanceof ActionError
      && error.code === "signals.not_found" && error.message === "找不到这个 Signal" && actionHttpStatus(error) === 400);
    assert.throws(() => signals.commands.submitDraft({ ...draft, kind: "" }), (error: unknown) => error instanceof ActionError
      && error.code === "signals.invalid_draft" && error.message === "Signal Draft 缺少可信身份、时间或结构化内容" && actionHttpStatus(error) === 400);
    assert.deepEqual(signals.query.list(DEMO_PROJECT_ID), records);
    assert.deepEqual(signals.events.list(DEMO_PROJECT_ID), events);
    assert.deepEqual(store.db.prepare("SELECT * FROM signal_revisions ORDER BY signal_id, revision").all(), revisions);
    assert.deepEqual(signals.query.get(DEMO_PROJECT_ID, accepted.signal.signal_id), accepted.signal);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

// CONERR-01: real Connector wiring rejects invalid provider input and a revoked connection without another poll.
test("J2A-01: the connector owner refuses missing, duplicate and revoked wiring, and rejects an invalid provider event", async () => {
  const connector = new ConnectorHost();
  let polls = 0;
  const driver: ConnectorDriver = { driver_id: "refusal-driver", async health() { return { ok: true, status: "connected", message: "ready" }; },
    async poll() { polls++; return { ok: true, mode: "live", events: [{ ...rawEvent("invalid"), occurred_at: "not-a-date" }], cursor_after: null }; } };
  assert.throws(() => connector.connect({ connection_id: "refusal-connection", driver_id: driver.driver_id }), { code: "connector.driver_missing" });
  assert.equal(polls, 0);
  connector.registerDriver(driver);
  connector.registerDriver(driver);
  assert.throws(() => connector.registerDriver({ ...driver }), { code: "connector.driver_duplicate" });
  connector.connect({ connection_id: "refusal-connection", driver_id: driver.driver_id });
  await assert.rejects(connector.invoke({ connection_id: "refusal-connection", cursor: null }, connectorControl()), { code: "connector.invocation_failed" });
  assert.equal(polls, 1);
  connector.revoke("refusal-connection");
  await assert.rejects(connector.invoke({ connection_id: "refusal-connection", cursor: null }, connectorControl()), { code: "connector.connection_missing" });
  assert.equal(polls, 1, "a revoked connection cannot invoke its driver again");
});

test("J3A-01: Sources owner refusals leave both the source and its durable events unchanged", () => {
  const directory = mkdtempSync(join(tmpdir(), "sources-owner-refusal-")), databasePath = join(directory, "project.sqlite");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  try {
    const sourceId = createSource(store), sources = new SourcesModule(fromBetterSqlite(store.db));
    const before = sources.query.get(DEMO_PROJECT_ID, sourceId), events = sources.events.list(DEMO_PROJECT_ID, sourceId);
    assert.throws(() => sources.query.get(DEMO_PROJECT_ID, "missing-source"), { code: "sources.not_found", message: /找不到/ });
    assert.throws(() => sources.commands.save({ ...before, schedule: { mode: "interval", enabled: true, interval_minutes: 1, next_pull_at: null } }), { code: "sources.invalid_schedule", message: /来源计划/ });
    assert.deepEqual(sources.query.get(DEMO_PROJECT_ID, sourceId), before);
    assert.deepEqual(sources.events.list(DEMO_PROJECT_ID, sourceId), events);
    sources.commands.retire(DEMO_PROJECT_ID, sourceId, "retain_history");
    const retired = sources.query.get(DEMO_PROJECT_ID, sourceId), history = sources.events.list(DEMO_PROJECT_ID, sourceId);
    assert.throws(() => sources.commands.setEnabled(DEMO_PROJECT_ID, sourceId, true), { code: "sources.not_found" });
    assert.deepEqual(sources.query.get(DEMO_PROJECT_ID, sourceId), retired);
    assert.deepEqual(sources.events.list(DEMO_PROJECT_ID, sourceId), history);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

// J3C-01/J3C-02: dynamic provider failures are persisted with the current owner, not inferred by the test.
test("Listener persists a failed provider pull, retains the cursor and replays without polling", async () => {
  const directory = mkdtempSync(join(tmpdir(), "listener-provider-owner-")), databasePath = join(directory, "project.sqlite");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  try {
    const sourceId = createSource(store), signals = new SignalsModule(fromBetterSqlite(store.db));
    let polls = 0, failure: ConnectorFailureKind = "needs_auth";
    const driver: ConnectorDriver = { driver_id: "failure-owner-driver", async health() { return { ok: true, status: "connected", message: "ready" }; },
      async poll() { polls += 1; return { ok: false, mode: "live", failure, message: "Provider refused", retry_after_at: "2026-09-02T08:10:00.000Z" }; } };
    const listener = new ListenerHost(fromBetterSqlite(store.db), connectorWith(driver), signals.commands);
    const cases: ReadonlyArray<readonly [ConnectorFailureKind, string]> = [["needs_auth", "connector.needs_auth"], ["configuration", "connector.configuration"],
      ["network", "connector.network"], ["provider", "connector.provider"], ["rate_limited", "connector.rate_limited"], ["stale_history", "connector.stale_history"]];
    for (const [reason, code] of cases) {
      failure = reason;
      const input = { project_id: DEMO_PROJECT_ID, source_id: sourceId, connection_id: "fixture-connection", operation_id: "provider-failure-" + reason, adapter: adapter() };
      const receipt = await listener.run(input);
      assert.equal(receipt.error_code, code);
      assert.deepEqual([receipt.phase, receipt.outcome, receipt.created_count, receipt.deduped_count], ["terminal", "failed", 0, 0]);
      assert.equal(listener.getRunByOperationId(DEMO_PROJECT_ID, input.operation_id)?.error_code, code);
      const checkpoint = listener.checkpoint(DEMO_PROJECT_ID, sourceId);
      assert.deepEqual(checkpoint.cursor, {}); assert.equal(checkpoint.last_error_code, code);
      assert.equal(checkpoint.state, reason === "rate_limited" ? "retry_wait" : "idle");
      if (reason === "rate_limited") assert.equal(checkpoint.retry_at, "2026-09-02T08:10:00.000Z");
      const beforeReplay = polls;
      assert.equal((await listener.run(input)).replayed, true); assert.equal(polls, beforeReplay);
      assert.deepEqual(signals.query.list(DEMO_PROJECT_ID, sourceId), []);
    }
    const run = listener.listRuns(DEMO_PROJECT_ID)[0]!;
    const interrupted = { ...run, run_id: "interrupted-owner-run", operation_id: "interrupted-owner-operation", phase: "running" as const, outcome: null, error_code: null, completed_at: null };
    listener.saveRun(interrupted);
    store.db.prepare("UPDATE listener_instances SET state = 'listening', lease_owner = ?, lease_expires_at = ? WHERE project_id = ? AND source_id = ?")
      .run("old-process", "2026-09-02T08:10:00.000Z", DEMO_PROJECT_ID, sourceId);
    const restarted = new ListenerHost(fromBetterSqlite(store.db), connectorWith(driver), new SignalsModule(fromBetterSqlite(store.db)).commands);
    assert.equal(restarted.recoverInterruptedRuns(DEMO_PROJECT_ID), 1);
    assert.equal(restarted.getRunByOperationId(DEMO_PROJECT_ID, interrupted.operation_id)?.error_code, "listener.process_interrupted");
    assert.equal(restarted.checkpoint(DEMO_PROJECT_ID, sourceId).last_error_code, "listener.process_interrupted");
    assert.equal(restarted.checkpoint(DEMO_PROJECT_ID, sourceId).state, "retry_wait");
    assert.equal(restarted.recoverInterruptedRuns(DEMO_PROJECT_ID), 0);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("RAC-129-LISTENER: refusal after accepting a Signal preserves the receipt and options receivers; restart dedupes without premature cursor or failure writes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "listener-effect-authority-")), databasePath = join(directory, "project.sqlite");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  try {
    const sourceId = createSource(store), signals = new SignalsModule(fromBetterSqlite(store.db));
    const event = rawEvent("accepted-before-revocation", { page: 1 });
    let allowed = true;
    const driver: ConnectorDriver = { driver_id: "authority-driver", async health() { return { ok: true, status: "connected", message: "ready" }; },
      async poll() { return { ok: true, mode: "live", events: [event], cursor_after: { page: 1 } }; } };
    const controls = {
      accepted: 0,
      now(): Date { assert.equal(this, controls); return new Date(); },
      async afterSignalAccepted(): Promise<void> { assert.equal(this, controls); this.accepted += 1; entered.resolve(); await release.promise; },
    };
    const listener = new ListenerHost(fromBetterSqlite(store.db), connectorWith(driver), signals.commands, controls);
    const input = { project_id: DEMO_PROJECT_ID, source_id: sourceId, connection_id: "fixture-connection", operation_id: "listener-authority-1", adapter: adapter(),
      beforeEffect: async () => { if (!allowed) throw new ActionError("actions.revoked", "Revoked"); } };
    const pending = listener.run(input), rejected = assert.rejects(pending, { code: "actions.revoked" });
    await entered.promise;
    assert.equal(controls.accepted, 1);
    const state = () => ({ signals: signals.query.list(DEMO_PROJECT_ID, sourceId), run: listener.getRunByOperationId(DEMO_PROJECT_ID, input.operation_id),
      deliveries: store.db.prepare("SELECT * FROM listener_deliveries WHERE source_id = ?").all(sourceId),
      checkpoint: store.db.prepare("SELECT cursor_json, state, attempt, retry_at, last_error_code, updated_at FROM listener_instances WHERE source_id = ?").get(sourceId) });
    const before = state(); assert.equal(before.signals.length, 1);
    allowed = false; release.resolve(); await rejected;
    assert.deepEqual(state(), before);
    allowed = true;
    const restarted = new ListenerHost(fromBetterSqlite(store.db), connectorWith(driver), new SignalsModule(fromBetterSqlite(store.db)).commands);
    assert.equal((await restarted.run(input)).outcome, "completed");
    assert.equal(signals.query.list(DEMO_PROJECT_ID, sourceId).length, 1);
    assert.deepEqual(restarted.checkpoint(DEMO_PROJECT_ID, sourceId).cursor, { page: 1 });
    assert.equal((await restarted.run(input)).replayed, true);
  } finally { release.resolve(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("Raw Event becomes one durable Signal and resumes after adapter failure without advancing cursor", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-fd1-recovery-"));
  try {
    const databasePath = join(directory, "molis-work.sqlite");
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const sourceId = createSource(store);
      assert.equal(new SourcesModule(fromBetterSqlite(store.db)).events.list(DEMO_PROJECT_ID, sourceId).at(-1)?.type, "source.created");
      let polls = 0;
      const driver: ConnectorDriver = {
        driver_id: "fixture-driver",
        async health() { return { ok: true, status: "connected", message: "ready" }; },
        async poll(): Promise<ConnectorPollResult> {
          polls += 1;
          if (polls > 1) return { ok: true, mode: "live", events: [], cursor_after: { page: 2 } };
          return {
            ok: true,
            mode: "live",
            events: [rawEvent("one"), rawEvent("two", { page: 2 })],
            cursor_after: { page: 2 },
          };
        },
      };
      const firstSignals = new SignalsModule(fromBetterSqlite(store.db));
      const firstListener = new ListenerHost(
        fromBetterSqlite(store.db),
        connectorWith(driver),
        firstSignals.commands,
      );
      await assert.rejects(
        firstListener.run({
          project_id: DEMO_PROJECT_ID,
          source_id: sourceId,
          connection_id: "fixture-connection",
          operation_id: "fd1-operation-recovery",
          adapter: adapter("two"),
        }),
        (error: unknown) => error instanceof ActionError
          && error.code === "listener.delivery_failed",
      );
      assert.deepEqual(firstListener.checkpoint(DEMO_PROJECT_ID, sourceId).cursor, {});
      assert.equal(firstSignals.query.list(DEMO_PROJECT_ID, sourceId).length, 1);
      assert.equal(firstListener.getRunByOperationId(DEMO_PROJECT_ID, "fd1-operation-recovery")?.phase, "interrupted");

      const restartedSignals = new SignalsModule(fromBetterSqlite(store.db));
      const restartedListener = new ListenerHost(
        fromBetterSqlite(store.db),
        connectorWith(driver),
        restartedSignals.commands,
      );
      const recovered = await restartedListener.run({
        project_id: DEMO_PROJECT_ID,
        source_id: sourceId,
        connection_id: "fixture-connection",
        operation_id: "fd1-operation-recovery",
        adapter: adapter(),
      });
      assert.equal(recovered.phase, "terminal");
      assert.equal(recovered.recovery_count, 1);
      assert.equal(recovered.created_count, 2);
      assert.deepEqual(restartedListener.checkpoint(DEMO_PROJECT_ID, sourceId).cursor, { page: 2 });
      assert.equal(restartedSignals.query.list(DEMO_PROJECT_ID, sourceId).length, 2);

      const replay = await restartedListener.run({
        project_id: DEMO_PROJECT_ID,
        source_id: sourceId,
        connection_id: "fixture-connection",
        operation_id: "fd1-operation-recovery",
        adapter: adapter(),
      });
      assert.equal(replay.replayed, true);
      assert.equal(polls, 2, "terminal replay must not invoke the Provider");

      const changed = rawEvent("two", { page: 3 });
      changed.raw_event_id = "raw-two-revision-2";
      changed.payload = { title: "Event two updated", summary: "changed provider content" };
      const revisionDriver: ConnectorDriver = {
        driver_id: "fixture-revision-driver",
        async health() { return { ok: true, status: "connected", message: "ready" }; },
        async poll() {
          return { ok: true as const, mode: "live" as const, events: [changed], cursor_after: { page: 3 } };
        },
      };
      const revisionListener = new ListenerHost(
        fromBetterSqlite(store.db),
        connectorWith(revisionDriver),
        restartedSignals.commands,
      );
      await revisionListener.run({
        project_id: DEMO_PROJECT_ID,
        source_id: sourceId,
        connection_id: "fixture-connection",
        operation_id: "fd1-operation-revision",
        adapter: adapter(),
      });
      const revised = restartedSignals.query.list(DEMO_PROJECT_ID, sourceId)
        .find((signal) => signal.provider_dedupe_id === "two");
      assert.equal(revised?.revision, 2);
      assert.equal(restartedSignals.query.list(DEMO_PROJECT_ID, sourceId).length, 2);
      assert.deepEqual(
        restartedSignals.events.list(DEMO_PROJECT_ID, sourceId).map((event) => event.type),
        ["signal.accepted", "signal.accepted", "signal.changed"],
      );
      assert.deepEqual(revisionListener.checkpoint(DEMO_PROJECT_ID, sourceId).cursor, { page: 3 });

      const sourceColumns = (store.db.pragma("table_info(feed_sources)") as Array<{ name: string }>).map((column) => column.name);
      assert.equal(sourceColumns.includes("cursor_json"), false, "the Source table holds no cursor; Listener Host owns it");
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// J3B-01/J3B-02: the real lease refusal retains its current owner code.
test("Listener lease prevents two callers from consuming one Source concurrently", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-fd1-lease-"));
  try {
    const databasePath = join(directory, "molis-work.sqlite");
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    let releasePoll: (() => void) | undefined;
    try {
      const sourceId = createSource(store);
      let pollStarted!: () => void;
      const started = new Promise<void>((resolve) => { pollStarted = resolve; });
      const blocked = new Promise<void>((resolve) => { releasePoll = resolve; });
      const driver: ConnectorDriver = {
        driver_id: "blocking-driver",
        async health() { return { ok: true, status: "connected", message: "ready" }; },
        async poll() {
          pollStarted();
          await blocked;
          return { ok: true as const, mode: "live" as const, events: [], cursor_after: { page: 1 } };
        },
      };
      const listener = new ListenerHost(
        fromBetterSqlite(store.db),
        connectorWith(driver),
        new SignalsModule(fromBetterSqlite(store.db)).commands,
      );
      const first = listener.run({
        project_id: DEMO_PROJECT_ID,
        source_id: sourceId,
        connection_id: "fixture-connection",
        operation_id: "fd1-lease-first",
        adapter: adapter(),
      });
      await started;
      await assert.rejects(
        listener.run({
          project_id: DEMO_PROJECT_ID,
          source_id: sourceId,
          connection_id: "fixture-connection",
          operation_id: "fd1-lease-second",
          adapter: adapter(),
        }),
        (error: unknown) => {
          // SOURCE-01: the second real poll cannot take an existing Listener lease.
          assert.ok(error instanceof ActionError);
          assert.equal(error.code, "listener.lease_busy");
          assert.equal(error.message, "这个 Source 已有 Listener 正在处理");
          assert.equal(error.kind, "invalid");
          assert.equal(actionHttpStatus(error), 400);
          return true;
        },
      );
      releasePoll?.();
      assert.equal((await first).outcome, "completed");
    } finally {
      releasePoll?.();
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// J3B-01/J3B-03: repeated delivery failure preserves the cursor and blocks further polling.
test("repeated Adapter failure quarantines the Raw Event without polling past it", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-fd1-quarantine-"));
  try {
    const databasePath = join(directory, "molis-work.sqlite");
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const sourceId = createSource(store);
      let polls = 0;
      const driver: ConnectorDriver = {
        driver_id: "quarantine-driver",
        async health() { return { ok: true, status: "connected", message: "ready" }; },
        async poll() {
          polls += 1;
          return {
            ok: true as const,
            mode: "live" as const,
            events: [rawEvent("poison", { page: 2 })],
            cursor_after: { page: 2 },
          };
        },
      };
      const listener = new ListenerHost(
        fromBetterSqlite(store.db),
        connectorWith(driver),
        new SignalsModule(fromBetterSqlite(store.db)).commands,
        { maxDeliveryAttempts: 2 },
      );
      const failingAdapter: RawEventAdapter = {
        adapter: { plugin_id: "io.molis.work.integration.broken", version: "1.0.0" },
        toSignalDraft() { throw new Error("poison event"); },
      };
      const run = () => listener.run({
        project_id: DEMO_PROJECT_ID,
        source_id: sourceId,
        connection_id: "fixture-connection",
        operation_id: "fd1-operation-quarantine",
        adapter: failingAdapter,
      });

      await assert.rejects(run(), (error: unknown) => error instanceof ActionError
        && error.code === "listener.delivery_failed");
      await assert.rejects(run(), (error: unknown) => error instanceof ActionError
        && error.code === "listener.delivery_quarantined");
      assert.equal(listener.checkpoint(DEMO_PROJECT_ID, sourceId).state, "quarantined");
      assert.deepEqual(listener.checkpoint(DEMO_PROJECT_ID, sourceId).cursor, {});
      await assert.rejects(run(), (error: unknown) => error instanceof ActionError
        && error.code === "listener.delivery_quarantined");
      assert.equal(polls, 1, "quarantined delivery must block further Provider polling");
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const fail of [false, true]) test(`Listener revocation during a provider ${fail ? "failure" : "response"} prevents durable delivery and failure bookkeeping`, async () => {
  const directory = mkdtempSync(join(tmpdir(), "listener-revocation-"));
  const databasePath = join(directory, "project.sqlite"); seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let allowed = true, pause = true;
  try {
    const source = createSource(store), signals = new SignalsModule(fromBetterSqlite(store.db));
    const driver: ConnectorDriver = { driver_id: "guarded", async health() { return { ok: true, status: "connected", message: "ready" }; },
      async poll() {
        if (pause) { entered.resolve(); await release.promise; }
        if (fail && pause) throw new Error("provider failed");
        return { ok: true, mode: "live", events: [rawEvent("guarded", { page: 1 })], cursor_after: { page: 1 } };
      } };
    const listener = new ListenerHost(fromBetterSqlite(store.db), connectorWith(driver), signals.commands);
    const input = { project_id: DEMO_PROJECT_ID, source_id: source, connection_id: "fixture-connection", operation_id: "guarded-operation", adapter: adapter(),
      beforeEffect: async () => { if (!allowed) throw Object.assign(new Error("Revoked"), { code: "fixture.revoked" }); } };
    const pending = listener.run(input), rejected = assert.rejects(pending, { code: "fixture.revoked" });
    await entered.promise;
    const before = listener.getRunByOperationId(DEMO_PROJECT_ID, input.operation_id);
    allowed = false; release.resolve(); await rejected;
    assert.deepEqual(listener.getRunByOperationId(DEMO_PROJECT_ID, input.operation_id), before);
    assert.equal((store.db.prepare("SELECT count(*) AS n FROM listener_deliveries WHERE source_id = ?").get(source) as { n: number }).n, 0);
    assert.deepEqual(listener.checkpoint(DEMO_PROJECT_ID, source).cursor, {});
    allowed = true; pause = false;
    const recovery = await listener.run(input);
    assert.equal(recovery.outcome, "completed");
    assert.equal(recovery.created_count, 1);
  } finally { release.resolve(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

// One owner per table (repository-anti-corruption §9.5 #2): Listener Host's run ledger names its Source by id and keeps no
// foreign key into the Sources module's table; a Source's runs go when Listener Host forgets the Source. Its one foreign key is the
// project's own row (PG-020 L1b: the library's root is project_root, no longer Goals' board).
test("Listener Host's run ledger keeps no foreign key into the Sources table", () => {
  const directory = mkdtempSync(join(tmpdir(), "listener-runs-owner-"));
  const store = new LocalProjectDatabase(join(directory, "project.sqlite"));
  try {
    const references = (store.db.prepare("SELECT \"table\" FROM pragma_foreign_key_list('feed_source_runs')").all() as Array<{ table: string }>).map(row => row.table);
    assert.deepEqual([...new Set(references)], ["project_root"]);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
