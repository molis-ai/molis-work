import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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

      const legacyCursor = store.db.prepare(
        "SELECT cursor_json FROM feed_sources WHERE board_id = ? AND source_id = ?",
      ).get(DEMO_BOARD_ID, sourceId) as { cursor_json: string };
      assert.deepEqual(JSON.parse(legacyCursor.cursor_json), {}, "legacy Source row is no longer cursor authority");
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
