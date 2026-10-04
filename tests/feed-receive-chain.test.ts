import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

import { SignalsModule } from "@molis-ai/molis-work-module-signals";
import { SourcesModule } from "@molis-ai/molis-work-module-sources";
import { ConnectorHost } from "@molis-ai/molis-work-service-connector-host";
import { ListenerHost, ListenerHostError } from "@molis-ai/molis-work-service-listener-host";
import type {
  ConnectorDriver,
  ConnectorPollResult,
  ConnectorRawEvent,
} from "@molis-ai/molis-work-contracts/services/connector-host";
import type { RawEventAdapter } from "@molis-ai/molis-work-contracts/services/listener-host";

import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
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
  new SourcesModule(store.db).commands.save({
    project_id: DEMO_BOARD_ID,
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

test("Listener refusal after accepting a Signal preserves that receipt but cannot mark delivery, advance cursor or write a failure; restart dedupes it", async () => {
  const directory = mkdtempSync(join(tmpdir(), "listener-effect-authority-")), databasePath = join(directory, "project.sqlite");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  try {
    const sourceId = createSource(store), signals = new SignalsModule(store.db);
    const event = rawEvent("accepted-before-revocation", { page: 1 });
    let allowed = true;
    const driver: ConnectorDriver = { driver_id: "authority-driver", async health() { return { ok: true, status: "connected", message: "ready" }; },
      async poll() { return { ok: true, mode: "live", events: [event], cursor_after: { page: 1 } }; } };
    const listener = new ListenerHost(store.db, connectorWith(driver), signals.commands, {
      afterSignalAccepted: async () => { entered.resolve(); await release.promise; },
    });
    const input = { project_id: DEMO_BOARD_ID, source_id: sourceId, connection_id: "fixture-connection", operation_id: "listener-authority-1", adapter: adapter(),
      beforeEffect: async () => { if (!allowed) throw new ActionError("actions.revoked", "Revoked"); } };
    const pending = listener.run(input), rejected = assert.rejects(pending, { code: "actions.revoked" });
    await entered.promise;
    const state = () => ({ signals: signals.query.list(DEMO_BOARD_ID, sourceId), run: listener.getRunByOperationId(DEMO_BOARD_ID, input.operation_id),
      deliveries: store.db.prepare("SELECT * FROM listener_deliveries WHERE source_id = ?").all(sourceId),
      checkpoint: store.db.prepare("SELECT cursor_json, state, attempt, retry_at, last_error_code, updated_at FROM listener_instances WHERE source_id = ?").get(sourceId) });
    const before = state(); assert.equal(before.signals.length, 1);
    allowed = false; release.resolve(); await rejected;
    assert.deepEqual(state(), before);
    allowed = true;
    const restarted = new ListenerHost(store.db, connectorWith(driver), new SignalsModule(store.db).commands);
    assert.equal((await restarted.run(input)).outcome, "completed");
    assert.equal(signals.query.list(DEMO_BOARD_ID, sourceId).length, 1);
    assert.deepEqual(restarted.checkpoint(DEMO_BOARD_ID, sourceId).cursor, { page: 1 });
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
      assert.equal(new SourcesModule(store.db).events.list(DEMO_BOARD_ID, sourceId).at(-1)?.type, "source.created");
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
      const firstSignals = new SignalsModule(store.db);
      const firstListener = new ListenerHost(
        store.db,
        connectorWith(driver),
        firstSignals.commands,
      );
      await assert.rejects(
        firstListener.run({
          project_id: DEMO_BOARD_ID,
          source_id: sourceId,
          connection_id: "fixture-connection",
          operation_id: "fd1-operation-recovery",
          adapter: adapter("two"),
        }),
        (error: unknown) => error instanceof ListenerHostError
          && error.code === "listener_delivery_failed",
      );
      assert.deepEqual(firstListener.checkpoint(DEMO_BOARD_ID, sourceId).cursor, {});
      assert.equal(firstSignals.query.list(DEMO_BOARD_ID, sourceId).length, 1);
      assert.equal(firstListener.getRunByOperationId(DEMO_BOARD_ID, "fd1-operation-recovery")?.phase, "interrupted");

      const restartedSignals = new SignalsModule(store.db);
      const restartedListener = new ListenerHost(
        store.db,
        connectorWith(driver),
        restartedSignals.commands,
      );
      const recovered = await restartedListener.run({
        project_id: DEMO_BOARD_ID,
        source_id: sourceId,
        connection_id: "fixture-connection",
        operation_id: "fd1-operation-recovery",
        adapter: adapter(),
      });
      assert.equal(recovered.phase, "terminal");
      assert.equal(recovered.recovery_count, 1);
      assert.equal(recovered.created_count, 2);
      assert.deepEqual(restartedListener.checkpoint(DEMO_BOARD_ID, sourceId).cursor, { page: 2 });
      assert.equal(restartedSignals.query.list(DEMO_BOARD_ID, sourceId).length, 2);

      const replay = await restartedListener.run({
        project_id: DEMO_BOARD_ID,
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
        store.db,
        connectorWith(revisionDriver),
        restartedSignals.commands,
      );
      await revisionListener.run({
        project_id: DEMO_BOARD_ID,
        source_id: sourceId,
        connection_id: "fixture-connection",
        operation_id: "fd1-operation-revision",
        adapter: adapter(),
      });
      const revised = restartedSignals.query.list(DEMO_BOARD_ID, sourceId)
        .find((signal) => signal.provider_dedupe_id === "two");
      assert.equal(revised?.revision, 2);
      assert.equal(restartedSignals.query.list(DEMO_BOARD_ID, sourceId).length, 2);
      assert.deepEqual(
        restartedSignals.events.list(DEMO_BOARD_ID, sourceId).map((event) => event.type),
        ["signal.accepted", "signal.accepted", "signal.changed"],
      );
      assert.deepEqual(revisionListener.checkpoint(DEMO_BOARD_ID, sourceId).cursor, { page: 3 });

      const sourceColumns = (store.db.pragma("table_info(feed_sources)") as Array<{ name: string }>).map((column) => column.name);
      assert.equal(sourceColumns.includes("cursor_json"), false, "the Source table holds no cursor; Listener Host owns it");
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

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
        store.db,
        connectorWith(driver),
        new SignalsModule(store.db).commands,
      );
      const first = listener.run({
        project_id: DEMO_BOARD_ID,
        source_id: sourceId,
        connection_id: "fixture-connection",
        operation_id: "fd1-lease-first",
        adapter: adapter(),
      });
      await started;
      await assert.rejects(
        listener.run({
          project_id: DEMO_BOARD_ID,
          source_id: sourceId,
          connection_id: "fixture-connection",
          operation_id: "fd1-lease-second",
          adapter: adapter(),
        }),
        (error: unknown) => error instanceof ListenerHostError && error.code === "listener_lease_busy",
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
        store.db,
        connectorWith(driver),
        new SignalsModule(store.db).commands,
        { maxDeliveryAttempts: 2 },
      );
      const failingAdapter: RawEventAdapter = {
        adapter: { plugin_id: "io.molis.work.integration.broken", version: "1.0.0" },
        toSignalDraft() { throw new Error("poison event"); },
      };
      const run = () => listener.run({
        project_id: DEMO_BOARD_ID,
        source_id: sourceId,
        connection_id: "fixture-connection",
        operation_id: "fd1-operation-quarantine",
        adapter: failingAdapter,
      });

      await assert.rejects(run(), (error: unknown) => error instanceof ListenerHostError
        && error.code === "listener_delivery_failed");
      await assert.rejects(run(), (error: unknown) => error instanceof ListenerHostError
        && error.code === "listener_delivery_quarantined");
      assert.equal(listener.checkpoint(DEMO_BOARD_ID, sourceId).state, "quarantined");
      assert.deepEqual(listener.checkpoint(DEMO_BOARD_ID, sourceId).cursor, {});
      await assert.rejects(run(), (error: unknown) => error instanceof ListenerHostError
        && error.code === "listener_delivery_quarantined");
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
    const source = createSource(store), signals = new SignalsModule(store.db);
    const driver: ConnectorDriver = { driver_id: "guarded", async health() { return { ok: true, status: "connected", message: "ready" }; },
      async poll() {
        if (pause) { entered.resolve(); await release.promise; }
        if (fail && pause) throw new Error("provider failed");
        return { ok: true, mode: "live", events: [rawEvent("guarded", { page: 1 })], cursor_after: { page: 1 } };
      } };
    const listener = new ListenerHost(store.db, connectorWith(driver), signals.commands);
    const input = { project_id: DEMO_BOARD_ID, source_id: source, connection_id: "fixture-connection", operation_id: "guarded-operation", adapter: adapter(),
      beforeEffect: async () => { if (!allowed) throw Object.assign(new Error("Revoked"), { code: "fixture.revoked" }); } };
    const pending = listener.run(input), rejected = assert.rejects(pending, { code: "fixture.revoked" });
    await entered.promise;
    const before = listener.getRunByOperationId(DEMO_BOARD_ID, input.operation_id);
    allowed = false; release.resolve(); await rejected;
    assert.deepEqual(listener.getRunByOperationId(DEMO_BOARD_ID, input.operation_id), before);
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM listener_deliveries WHERE source_id = ?").get(source)!.n, 0);
    assert.deepEqual(listener.checkpoint(DEMO_BOARD_ID, source).cursor, {});
    allowed = true; pause = false;
    const recovery = await listener.run(input);
    assert.equal(recovery.outcome, "completed");
    assert.equal(recovery.created_count, 1);
  } finally { release.resolve(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

// One owner per table (repository-anti-corruption §9.5 #2): Listener Host's run ledger names its Source by id and keeps no
// foreign key into the Sources module's table; a Source's runs go when Listener Host forgets the Source.
test("Listener Host's run ledger keeps no foreign key into the Sources table", () => {
  const directory = mkdtempSync(join(tmpdir(), "listener-runs-owner-"));
  const store = new LocalProjectDatabase(join(directory, "project.sqlite"));
  try {
    const references = (store.db.prepare("SELECT \"table\" FROM pragma_foreign_key_list('feed_source_runs')").all() as Array<{ table: string }>).map(row => row.table);
    assert.deepEqual([...new Set(references)], ["boards"]);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
