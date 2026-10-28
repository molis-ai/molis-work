import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SourceRecord } from "@molis-ai/molis-work-contracts/modules/sources";
import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedSourceRunRecord, FeedSourceRecord, SourceHistoryDecision } from "./projection.js";
import { assertSourceHistoryDecision } from "./application-errors.js";
import { sourceRunRecord } from "./application-projection.js";
import type { FeedApplicationPorts } from "./application-ports.js";
import { retireFeedSource } from "./source-history.js";

/** Feed's sources and their pull runs: what a source is (Sources) and what its listener did (Listener), read and written as Feed's records. */
export class FeedSources {
  constructor(private readonly ports: FeedApplicationPorts) {}

  get(projectId: string, sourceId: string): FeedSourceRecord {
    try {
      return this.record(this.ports.sources.query.get(projectId, sourceId));
    } catch (error) {
      if (error instanceof ActionError && error.code === "sources.not_found") {
        throw feedErrors.source_not_found("找不到这个来源");
      }
      throw error;
    }
  }

  find(
    projectId: string,
    syncKind: FeedSourceRecord["sync_kind"],
    definitionId: string | null,
    configFingerprint?: string,
  ): FeedSourceRecord | null {
    const source = this.ports.sources.query.find(projectId, syncKind, definitionId, configFingerprint);
    return source ? this.record(source) : null;
  }

  upsert(source: FeedSourceRecord): FeedSourceRecord {
    const saved = this.ports.sources.commands.save({
      project_id: source.project_id,
      source_id: source.source_id,
      kind: source.kind,
      definition_id: source.definition_id,
      sync_kind: source.sync_kind,
      name: source.name,
      description: source.description,
      status: source.status,
      enabled: source.enabled,
      origin: source.origin,
      config: source.config,
      schedule: source.schedule,
      connection_ref: source.credential_ref,
      account_label: source.account_label,
      last_sync_at: source.last_sync_at,
      last_outcome: source.last_outcome,
      last_error_code: source.last_error_code,
      imported_at: source.imported_at,
      updated_at: source.updated_at,
    });
    this.ports.listener.writeCursor(source.project_id, source.source_id, source.cursor, source.updated_at);
    return this.record(saved);
  }

  setEnabled(projectId: string, sourceId: string, enabled: boolean): FeedSourceRecord {
    try {
      return this.record(this.ports.sources.commands.setEnabled(projectId, sourceId, enabled));
    } catch (error) {
      if (error instanceof ActionError && error.code === "sources.not_found") {
        throw feedErrors.source_not_found("找不到这个来源");
      }
      throw error;
    }
  }

  retire(
    projectId: string,
    sourceId: string,
    historyDecision: SourceHistoryDecision,
  ): FeedSourceRecord {
    assertSourceHistoryDecision(historyDecision);
    return retireFeedSource(this.ports, projectId, sourceId, historyDecision, (source) => this.record(source));
  }

  runByOperationId(projectId: string, operationId: string): FeedSourceRunRecord | null {
    const run = this.ports.listener.getRunByOperationId(projectId, operationId);
    return run ? sourceRunRecord(run) : null;
  }

  upsertRun(run: FeedSourceRunRecord): FeedSourceRunRecord {
    return sourceRunRecord(this.ports.listener.saveRun({
      project_id: run.project_id,
      run_id: run.run_id,
      operation_id: run.operation_id,
      source_id: run.source_id,
      phase: run.phase,
      outcome: run.outcome,
      empty: run.empty,
      error_code: run.error_code,
      connector_receipt: run.receipt,
      created_count: run.created_count,
      deduped_count: run.deduped_count,
      recovery_count: run.recovery_count,
      started_at: run.started_at,
      completed_at: run.completed_at,
      updated_at: run.updated_at,
    }));
  }

  record(source: SourceRecord): FeedSourceRecord {
    const checkpoint = this.ports.listener.checkpoint(source.project_id, source.source_id, source.updated_at);
    return {
      project_id: source.project_id,
      source_id: source.source_id,
      kind: source.kind,
      definition_id: source.definition_id,
      sync_kind: source.sync_kind,
      name: source.name,
      description: source.description,
      status: source.status,
      enabled: source.enabled,
      item_count: this.ports.feed.query.countBySource(source.project_id, source.source_id),
      origin: source.origin,
      config: source.config,
      schedule: source.schedule,
      cursor: checkpoint.cursor,
      credential_ref: source.connection_ref,
      account_label: source.account_label,
      last_sync_at: source.last_sync_at,
      last_outcome: source.last_outcome,
      last_error_code: source.last_error_code,
      imported_at: source.imported_at,
      updated_at: source.updated_at,
    };
  }
}
