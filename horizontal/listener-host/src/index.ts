import { createHash } from "node:crypto";

import type { SignalCommands, SignalReceipt } from "@molis-ai/molis-work-contracts/modules/signals";
import type {
  ConnectorHostApi,
  ConnectorRawEvent,
  ConnectorReceipt,
} from "@molis-ai/molis-work-contracts/services/connector-host";
import type {
  ListenerCheckpoint,
  ListenerHostApi,
  ListenerRunReceipt,
  ListenerRunRecord,
  RawEventAdapter,
} from "@molis-ai/molis-work-contracts/services/listener-host";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-service-listener-host",
  packagePath: "horizontal/listener-host",
  kind: "horizontal",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/services/listener-host",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd1"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["listener.host.v1"],
} as const;

type Row = Record<string, unknown>;
type Statement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint };
};
export interface ListenerSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

export { ListenerHostError } from "@molis-ai/molis-work-contracts/services/listener-host";
import { ListenerHostError } from "@molis-ai/molis-work-contracts/services/listener-host";

export function migrateListenerHost(db: ListenerSqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS listener_instances (
      project_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      cursor_json TEXT NOT NULL DEFAULT '{}',
      state TEXT NOT NULL CHECK (state IN ('idle', 'listening', 'retry_wait', 'quarantined')),
      attempt INTEGER NOT NULL DEFAULT 0,
      retry_at TEXT,
      last_error_code TEXT,
      lease_owner TEXT,
      lease_expires_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, source_id)
    );

    CREATE TABLE IF NOT EXISTS listener_deliveries (
      project_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      raw_event_id TEXT NOT NULL,
      provider_dedupe_id TEXT NOT NULL,
      raw_event_json TEXT NOT NULL,
      cursor_after_json TEXT,
      adapter_plugin_id TEXT NOT NULL,
      adapter_version TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pending', 'retry_wait', 'accepted', 'quarantined')),
      attempt INTEGER NOT NULL DEFAULT 0,
      signal_id TEXT,
      last_error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, source_id, raw_event_id)
    );
    CREATE INDEX IF NOT EXISTS listener_deliveries_recovery_idx
      ON listener_deliveries(project_id, source_id, state, updated_at, raw_event_id);

    CREATE TABLE IF NOT EXISTS feed_source_runs (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      run_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      phase TEXT NOT NULL CHECK (phase IN ('running', 'terminal', 'interrupted')),
      outcome TEXT,
      empty INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      receipt_json TEXT,
      created_count INTEGER NOT NULL DEFAULT 0,
      deduped_count INTEGER NOT NULL DEFAULT 0,
      recovery_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, run_id),
      UNIQUE (board_id, operation_id),
      FOREIGN KEY (board_id, source_id) REFERENCES feed_sources(board_id, source_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS feed_source_runs_board_source_idx
      ON feed_source_runs(board_id, source_id, started_at DESC);
  `);

  if (tableExists(db, "feed_sources")) {
    const migratedAt = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO listener_instances (
        project_id, source_id, cursor_json, state, attempt, retry_at,
        last_error_code, lease_owner, lease_expires_at, updated_at
      )
      SELECT board_id, source_id, cursor_json, 'idle', 0, NULL, NULL, NULL, NULL, ?
      FROM feed_sources
    `).run(migratedAt);
  }
}

export function readListenerCheckpoint(
  db: ListenerSqliteDatabase,
  projectId: string,
  sourceId: string,
  at = new Date().toISOString(),
): ListenerCheckpoint {
  ensureCheckpointRow(db, projectId, sourceId, at);
  const row = db.prepare(`
    SELECT * FROM listener_instances WHERE project_id = ? AND source_id = ?
  `).get(projectId, sourceId) as Row;
  return mapCheckpoint(row);
}

export function writeListenerCursor(
  db: ListenerSqliteDatabase,
  projectId: string,
  sourceId: string,
  cursor: unknown,
  at = new Date().toISOString(),
): ListenerCheckpoint {
  ensureCheckpointRow(db, projectId, sourceId, at);
  db.prepare(`
    UPDATE listener_instances SET cursor_json = ?, updated_at = ?
    WHERE project_id = ? AND source_id = ?
  `).run(JSON.stringify(cursor ?? {}), at, projectId, sourceId);
  return readListenerCheckpoint(db, projectId, sourceId, at);
}

export function deleteListenerSourceState(
  db: ListenerSqliteDatabase,
  projectId: string,
  sourceId: string,
): void {
  db.prepare("DELETE FROM listener_deliveries WHERE project_id = ? AND source_id = ?")
    .run(projectId, sourceId);
  db.prepare("DELETE FROM feed_source_runs WHERE board_id = ? AND source_id = ?")
    .run(projectId, sourceId);
  db.prepare("DELETE FROM listener_instances WHERE project_id = ? AND source_id = ?")
    .run(projectId, sourceId);
}

export function getListenerRunByOperationId(
  db: ListenerSqliteDatabase,
  projectId: string,
  operationId: string,
): ListenerRunRecord | null {
  const row = db.prepare(`
    SELECT * FROM feed_source_runs WHERE board_id = ? AND operation_id = ?
  `).get(projectId, operationId) as Row | undefined;
  return row ? mapRun(row) : null;
}

export function listListenerRuns(
  db: ListenerSqliteDatabase,
  projectId: string,
): ListenerRunRecord[] {
  return (db.prepare(`
    SELECT * FROM feed_source_runs WHERE board_id = ? ORDER BY started_at DESC, run_id
  `).all(projectId) as Row[]).map(mapRun);
}

export function saveListenerRun(
  db: ListenerSqliteDatabase,
  run: ListenerRunRecord,
): ListenerRunRecord {
  const current = getListenerRunByOperationId(db, run.project_id, run.operation_id);
  if (current) assertRunTransition(current.phase, run.phase);
  db.prepare(`
    INSERT INTO feed_source_runs (
      board_id, run_id, operation_id, source_id, phase, outcome, empty,
      error_code, receipt_json, created_count, deduped_count, recovery_count,
      started_at, completed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(board_id, run_id) DO UPDATE SET
      phase = excluded.phase,
      outcome = excluded.outcome,
      empty = excluded.empty,
      error_code = excluded.error_code,
      receipt_json = excluded.receipt_json,
      created_count = excluded.created_count,
      deduped_count = excluded.deduped_count,
      recovery_count = excluded.recovery_count,
      completed_at = excluded.completed_at,
      updated_at = excluded.updated_at
  `).run(
    run.project_id,
    run.run_id,
    run.operation_id,
    run.source_id,
    run.phase,
    run.outcome,
    run.empty ? 1 : 0,
    run.error_code,
    run.connector_receipt == null ? null : JSON.stringify(run.connector_receipt),
    run.created_count,
    run.deduped_count,
    run.recovery_count,
    run.started_at,
    run.completed_at,
    run.updated_at,
  );
  return getListenerRunByOperationId(db, run.project_id, run.operation_id)!;
}

export function recoverInterruptedListenerRuns(
  db: ListenerSqliteDatabase,
  projectId: string,
  at = new Date().toISOString(),
): number {
  const result = db.prepare(`
    UPDATE feed_source_runs
    SET phase = 'interrupted', error_code = 'process_interrupted', updated_at = ?
    WHERE board_id = ? AND phase = 'running'
  `).run(at, projectId);
  db.prepare(`
    UPDATE listener_instances
    SET state = 'retry_wait', attempt = attempt + 1,
        last_error_code = 'process_interrupted', lease_owner = NULL,
        lease_expires_at = NULL, updated_at = ?
    WHERE project_id = ? AND state = 'listening'
  `).run(at, projectId);
  return Number(result.changes);
}

export class ListenerHost implements ListenerHostApi {
  constructor(
    private readonly db: ListenerSqliteDatabase,
    readonly connector: ConnectorHostApi,
    private readonly signals: SignalCommands,
    private readonly options: {
      now?: () => Date;
      leaseMs?: number;
      maxDeliveryAttempts?: number;
      afterSignalAccepted?: (
        event: ConnectorRawEvent,
        receipt: SignalReceipt,
      ) => void | Promise<void>;
    } = {},
  ) {
    migrateListenerHost(db);
  }

  checkpoint(projectId: string, sourceId: string): ListenerCheckpoint {
    return readListenerCheckpoint(this.db, projectId, sourceId, this.now().toISOString());
  }

  getRunByOperationId(projectId: string, operationId: string): ListenerRunRecord | null {
    return getListenerRunByOperationId(this.db, projectId, operationId);
  }

  listRuns(projectId: string): ListenerRunRecord[] {
    return listListenerRuns(this.db, projectId);
  }

  saveRun(run: ListenerRunRecord): ListenerRunRecord {
    return saveListenerRun(this.db, run);
  }

  recoverInterruptedRuns(projectId: string): number {
    return recoverInterruptedListenerRuns(this.db, projectId, this.now().toISOString());
  }

  async run(input: {
    project_id: string;
    source_id: string;
    connection_id: string;
    operation_id: string;
    adapter: RawEventAdapter;
    intent?: Record<string, unknown>;
  }): Promise<ListenerRunReceipt> {
    const prior = this.getRunByOperationId(input.project_id, input.operation_id);
    if (prior?.phase === "terminal") return { ...prior, replayed: true, accepted: [] };

    this.acquireLease(input.project_id, input.source_id, input.operation_id);
    const startedAt = prior?.started_at ?? this.now().toISOString();
    let run: ListenerRunRecord = {
      run_id: prior?.run_id ?? `listener-run-${sha256(`${input.project_id}\u0000${input.operation_id}`).slice(0, 32)}`,
      operation_id: input.operation_id,
      project_id: input.project_id,
      source_id: input.source_id,
      phase: "running",
      outcome: null,
      created_count: prior?.created_count ?? 0,
      deduped_count: prior?.deduped_count ?? 0,
      recovery_count: prior ? prior.recovery_count + 1 : 0,
      empty: false,
      error_code: null,
      connector_receipt: prior?.connector_receipt ?? null,
      started_at: startedAt,
      completed_at: null,
      updated_at: this.now().toISOString(),
    };
    run = this.saveRun(run);
    const accepted: ListenerRunReceipt["accepted"] = [];

    try {
      const pending = this.pendingDeliveries(input.project_id, input.source_id, input.operation_id);
      for (const delivery of pending) {
        const processed = await this.acceptDelivery(delivery, input.adapter);
        accepted.push(processed);
        if (processed.receipt.created) run.created_count += 1;
        else run.deduped_count += 1;
      }
      if (this.hasQuarantinedDelivery(input.project_id, input.source_id, input.operation_id)) {
        throw new ListenerHostError(
          "listener_delivery_quarantined",
          "Raw Event 已隔离，必须先处理或替换 Adapter，不能继续拉取 Provider",
        );
      }

      const checkpoint = this.checkpoint(input.project_id, input.source_id);
      const connectorReceipt = await this.connector.invoke({
        connection_id: input.connection_id,
        cursor: checkpoint.cursor,
        intent: input.intent,
      });
      run.connector_receipt = summarizeConnectorReceipt(connectorReceipt);
      if (!connectorReceipt.result.ok) {
        const failure = connectorReceipt.result;
        const completedAt = this.now().toISOString();
        const failed = this.saveRun({
          ...run,
          phase: "terminal",
          outcome: "failed",
          error_code: `connector_${failure.failure}`,
          connector_receipt: summarizeConnectorReceipt(connectorReceipt),
          completed_at: completedAt,
          updated_at: completedAt,
        });
        this.updateCheckpointFailure(
          input.project_id,
          input.source_id,
          failed.error_code!,
          failure.retry_after_at ?? null,
          failure.failure === "rate_limited" ? "retry_wait" : "idle",
        );
        return { ...failed, replayed: false, accepted };
      }

      this.persistDeliveries(input, connectorReceipt.result.events);
      for (const event of connectorReceipt.result.events) {
        const delivery = this.delivery(input.project_id, input.source_id, event.raw_event_id);
        if (delivery.state === "accepted") {
          run.deduped_count += 1;
          if (event.cursor_after !== undefined) this.advanceCursor(input.project_id, input.source_id, event.cursor_after);
          continue;
        }
        if (delivery.state === "quarantined") {
          throw new ListenerHostError(
            "listener_delivery_quarantined",
            "Raw Event 已隔离，必须先处理或替换 Adapter，cursor 不会推进",
          );
        }
        const processed = await this.acceptDelivery(delivery, input.adapter);
        accepted.push(processed);
        if (processed.receipt.created) run.created_count += 1;
        else run.deduped_count += 1;
      }
      this.advanceCursor(input.project_id, input.source_id, connectorReceipt.result.cursor_after);
      const completedAt = this.now().toISOString();
      const completed = this.saveRun({
        ...run,
        phase: "terminal",
        outcome: "completed",
        empty: connectorReceipt.result.events.length === 0,
        connector_receipt: summarizeConnectorReceipt(connectorReceipt),
        completed_at: completedAt,
        updated_at: completedAt,
      });
      this.resetCheckpoint(input.project_id, input.source_id, completedAt);
      return { ...completed, replayed: false, accepted };
    } catch (error) {
      const code = error instanceof ListenerHostError ? error.code : "listener_connector_failed";
      const interruptedAt = this.now().toISOString();
      this.saveRun({
        ...run,
        phase: "interrupted",
        outcome: null,
        error_code: code,
        updated_at: interruptedAt,
      });
      this.updateCheckpointFailure(
        input.project_id,
        input.source_id,
        code,
        null,
        code === "listener_delivery_quarantined" ? "quarantined" : "retry_wait",
      );
      throw new ListenerHostError(
        code === "listener_delivery_quarantined" ? code : code === "listener_delivery_failed" ? code : "listener_connector_failed",
        code === "listener_delivery_quarantined"
          ? "Raw Event 多次转换失败，已隔离等待处理"
          : "Listener 没有取得可信终态，可使用同一 operation_id 安全重试",
      );
    } finally {
      this.releaseLease(input.project_id, input.source_id, input.operation_id);
    }
  }

  private async acceptDelivery(
    delivery: Delivery,
    adapter: RawEventAdapter,
  ): Promise<{ event: ConnectorRawEvent; receipt: SignalReceipt }> {
    try {
      const partial = adapter.toSignalDraft(delivery.event, {
        project_id: delivery.project_id,
        source_id: delivery.source_id,
      });
      const receipt = this.signals.submitDraft({
        ...partial,
        project_id: delivery.project_id,
        source_id: delivery.source_id,
        provider_dedupe_id: delivery.event.provider_dedupe_id,
        raw_event_id: delivery.event.raw_event_id,
        adapter: adapter.adapter,
        provenance: {
          ...partial.provenance,
          listener_operation_id: delivery.operation_id,
          raw_event_id: delivery.event.raw_event_id,
        },
      });
      await this.options.afterSignalAccepted?.(delivery.event, receipt);
      const at = this.now().toISOString();
      this.db.prepare(`
        UPDATE listener_deliveries
        SET state = 'accepted', attempt = attempt + 1, signal_id = ?,
            last_error_code = NULL, updated_at = ?
        WHERE project_id = ? AND source_id = ? AND raw_event_id = ?
      `).run(receipt.signal.signal_id, at, delivery.project_id, delivery.source_id, delivery.event.raw_event_id);
      if (delivery.event.cursor_after !== undefined) {
        this.advanceCursor(delivery.project_id, delivery.source_id, delivery.event.cursor_after);
      }
      return { event: delivery.event, receipt };
    } catch (error) {
      const nextAttempt = delivery.attempt + 1;
      const quarantined = nextAttempt >= (this.options.maxDeliveryAttempts ?? 5);
      const at = this.now().toISOString();
      this.db.prepare(`
        UPDATE listener_deliveries
        SET state = ?, attempt = ?, last_error_code = ?, updated_at = ?
        WHERE project_id = ? AND source_id = ? AND raw_event_id = ?
      `).run(
        quarantined ? "quarantined" : "retry_wait",
        nextAttempt,
        quarantined ? "listener_delivery_quarantined" : "listener_delivery_failed",
        at,
        delivery.project_id,
        delivery.source_id,
        delivery.event.raw_event_id,
      );
      throw new ListenerHostError(
        quarantined ? "listener_delivery_quarantined" : "listener_delivery_failed",
        "Raw Event 尚未得到 Signal Receipt，cursor 不会推进",
      );
    }
  }

  private persistDeliveries(
    input: {
      project_id: string;
      source_id: string;
      operation_id: string;
      adapter: RawEventAdapter;
    },
    events: ConnectorRawEvent[],
  ): void {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO listener_deliveries (
        project_id, source_id, operation_id, raw_event_id, provider_dedupe_id,
        raw_event_json, cursor_after_json, adapter_plugin_id, adapter_version,
        state, attempt, signal_id, last_error_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, ?, ?)
    `);
    const at = this.now().toISOString();
    this.db.transaction(() => {
      for (const event of events) {
        insert.run(
          input.project_id,
          input.source_id,
          input.operation_id,
          event.raw_event_id,
          event.provider_dedupe_id,
          JSON.stringify(event),
          event.cursor_after === undefined ? null : JSON.stringify(event.cursor_after),
          input.adapter.adapter.plugin_id,
          input.adapter.adapter.version,
          at,
          at,
        );
      }
    }).immediate();
  }

  private pendingDeliveries(projectId: string, sourceId: string, operationId: string): Delivery[] {
    return (this.db.prepare(`
      SELECT * FROM listener_deliveries
      WHERE project_id = ? AND source_id = ? AND operation_id = ?
        AND state IN ('pending', 'retry_wait')
      ORDER BY created_at, raw_event_id
    `).all(projectId, sourceId, operationId) as Row[]).map(mapDelivery);
  }

  private hasQuarantinedDelivery(projectId: string, sourceId: string, operationId: string): boolean {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM listener_deliveries
      WHERE project_id = ? AND source_id = ? AND operation_id = ? AND state = 'quarantined'
      LIMIT 1
    `).get(projectId, sourceId, operationId));
  }

  private delivery(projectId: string, sourceId: string, rawEventId: string): Delivery {
    const row = this.db.prepare(`
      SELECT * FROM listener_deliveries
      WHERE project_id = ? AND source_id = ? AND raw_event_id = ?
    `).get(projectId, sourceId, rawEventId) as Row | undefined;
    if (!row) throw new ListenerHostError("listener_delivery_failed", "Raw Event 没有先持久化");
    return mapDelivery(row);
  }

  private ensureCheckpoint(projectId: string, sourceId: string): void {
    ensureCheckpointRow(this.db, projectId, sourceId, this.now().toISOString());
  }

  private acquireLease(projectId: string, sourceId: string, operationId: string): void {
    this.ensureCheckpoint(projectId, sourceId);
    const at = this.now();
    const expiresAt = new Date(at.getTime() + (this.options.leaseMs ?? 60_000)).toISOString();
    const result = this.db.prepare(`
      UPDATE listener_instances
      SET state = 'listening', lease_owner = ?, lease_expires_at = ?, updated_at = ?
      WHERE project_id = ? AND source_id = ?
        AND (lease_owner IS NULL OR lease_owner = ? OR lease_expires_at <= ?)
    `).run(operationId, expiresAt, at.toISOString(), projectId, sourceId, operationId, at.toISOString());
    if (Number(result.changes) !== 1) {
      throw new ListenerHostError("listener_lease_busy", "这个 Source 已有 Listener 正在处理");
    }
  }

  private releaseLease(projectId: string, sourceId: string, operationId: string): void {
    this.db.prepare(`
      UPDATE listener_instances
      SET lease_owner = NULL, lease_expires_at = NULL
      WHERE project_id = ? AND source_id = ? AND lease_owner = ?
    `).run(projectId, sourceId, operationId);
  }

  private advanceCursor(projectId: string, sourceId: string, cursor: unknown): void {
    this.ensureCheckpoint(projectId, sourceId);
    this.db.prepare(`
      UPDATE listener_instances SET cursor_json = ?, updated_at = ?
      WHERE project_id = ? AND source_id = ?
    `).run(JSON.stringify(cursor ?? {}), this.now().toISOString(), projectId, sourceId);
  }

  private resetCheckpoint(projectId: string, sourceId: string, at: string): void {
    this.db.prepare(`
      UPDATE listener_instances
      SET state = 'idle', attempt = 0, retry_at = NULL, last_error_code = NULL, updated_at = ?
      WHERE project_id = ? AND source_id = ?
    `).run(at, projectId, sourceId);
  }

  private updateCheckpointFailure(
    projectId: string,
    sourceId: string,
    errorCode: string,
    retryAt: string | null,
    state: ListenerCheckpoint["state"],
  ): void {
    this.ensureCheckpoint(projectId, sourceId);
    const checkpoint = this.checkpoint(projectId, sourceId);
    const computedRetry = retryAt ?? new Date(
      this.now().getTime() + Math.min(300_000, 1_000 * (2 ** Math.min(checkpoint.attempt, 8))),
    ).toISOString();
    this.db.prepare(`
      UPDATE listener_instances
      SET state = ?, attempt = attempt + 1, retry_at = ?, last_error_code = ?, updated_at = ?
      WHERE project_id = ? AND source_id = ?
    `).run(state, state === "retry_wait" ? computedRetry : null, errorCode, this.now().toISOString(), projectId, sourceId);
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

interface Delivery {
  project_id: string;
  source_id: string;
  operation_id: string;
  event: ConnectorRawEvent;
  state: "pending" | "retry_wait" | "accepted" | "quarantined";
  attempt: number;
}

function mapDelivery(row: Row): Delivery {
  return {
    project_id: text(row.project_id),
    source_id: text(row.source_id),
    operation_id: text(row.operation_id),
    event: json<ConnectorRawEvent>(row.raw_event_json, {
      raw_event_id: text(row.raw_event_id),
      provider_dedupe_id: text(row.provider_dedupe_id),
      occurred_at: "",
      observed_at: "",
      payload: {},
    }),
    state: text(row.state) as Delivery["state"],
    attempt: Number(row.attempt ?? 0),
  };
}

function mapCheckpoint(row: Row): ListenerCheckpoint {
  return {
    project_id: text(row.project_id),
    source_id: text(row.source_id),
    cursor: json<unknown>(row.cursor_json, {}),
    state: text(row.state) as ListenerCheckpoint["state"],
    attempt: Number(row.attempt ?? 0),
    retry_at: optionalText(row.retry_at),
    last_error_code: optionalText(row.last_error_code),
    updated_at: text(row.updated_at),
  };
}

function mapRun(row: Row): ListenerRunRecord {
  return {
    run_id: text(row.run_id),
    operation_id: text(row.operation_id),
    project_id: text(row.board_id),
    source_id: text(row.source_id),
    phase: text(row.phase) as ListenerRunRecord["phase"],
    outcome: optionalText(row.outcome) as ListenerRunRecord["outcome"],
    created_count: Number(row.created_count ?? 0),
    deduped_count: Number(row.deduped_count ?? 0),
    recovery_count: Number(row.recovery_count ?? 0),
    empty: Number(row.empty ?? 0) === 1,
    error_code: optionalText(row.error_code),
    connector_receipt: row.receipt_json == null
      ? null
      : json<Record<string, unknown>>(row.receipt_json, {}),
    started_at: text(row.started_at),
    completed_at: optionalText(row.completed_at),
    updated_at: text(row.updated_at),
  };
}

function summarizeConnectorReceipt(receipt: ConnectorReceipt): Record<string, unknown> {
  const common = {
    schema: "molis-work-connector-receipt-v1",
    receipt_id: receipt.receipt_id,
    connection_id: receipt.connection_id,
    driver_id: receipt.driver_id,
    started_at: receipt.started_at,
    completed_at: receipt.completed_at,
    mode: receipt.result.mode,
  };
  if (receipt.result.ok) {
    return { ...common, event_count: receipt.result.events.length };
  }
  return {
    ...common,
    failure: receipt.result.failure,
    message: receipt.result.message,
    ...(receipt.result.action ? { recovery_action: receipt.result.action } : {}),
    ...(receipt.result.http_status == null ? {} : { http_status: receipt.result.http_status }),
    ...(receipt.result.retry_after_at ? { retry_after_at: receipt.result.retry_after_at } : {}),
  };
}

function assertRunTransition(
  current: ListenerRunRecord["phase"],
  next: ListenerRunRecord["phase"],
): void {
  if (current === next) return;
  const allowed: Record<ListenerRunRecord["phase"], readonly ListenerRunRecord["phase"][]> = {
    running: ["terminal", "interrupted"],
    interrupted: ["running", "terminal"],
    terminal: [],
  };
  if (!allowed[current].includes(next)) {
    throw new ListenerHostError("listener_delivery_failed", `Listener Run 不能从 ${current} 变成 ${next}`);
  }
}

function tableExists(db: ListenerSqliteDatabase, table: string): boolean {
  return Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(table));
}

function ensureCheckpointRow(
  db: ListenerSqliteDatabase,
  projectId: string,
  sourceId: string,
  at: string,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO listener_instances (
      project_id, source_id, cursor_json, state, attempt, retry_at,
      last_error_code, lease_owner, lease_expires_at, updated_at
    ) VALUES (?, ?, '{}', 'idle', 0, NULL, NULL, NULL, NULL, ?)
  `).run(projectId, sourceId, at);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  const result = text(value);
  return result || null;
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;
