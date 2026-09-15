import type {
  GoalEventTimelineItem,
  GoalReportWorkEventRecord,
  GoalWorkEventRecord,
} from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalEventFactsRepository, StoredWorkEvent } from "./event-facts-repository.js";
import { configurationPayload } from "./event-facts-config.js";
import { ownStringRecord } from "./event-facts-validation.js";
import { parseGoalEventSystemPayload } from "./event-system-payload.js";

export function mapStoredWorkEvent(records: GoalEventFactsRepository, row: StoredWorkEvent): GoalWorkEventRecord {
  if (row.kind === "configuration") return mapConfigurationEvent(records, row);
  if (row.kind === "system") return mapSystemEvent(records, row);
  return mapReportEvent(records, row);
}

export function mapTimelineItem(records: GoalEventFactsRepository, row: StoredWorkEvent): GoalEventTimelineItem {
  const event = mapStoredWorkEvent(records, row);
  return {
    event_id: event.event_id,
    journal_seq: event.journal_seq,
    received_at: event.received_at,
    title: event.title,
    kind: event.kind,
    type_id: event.kind === "report" ? event.type?.type_id ?? row.type_id : null,
    type_name: event.kind === "report" ? event.type?.name ?? null : event.kind === "configuration" ? "配置" : "系统",
    semantic_family: event.kind === "report" ? event.type?.semantic_family ?? null : null,
    system_operation: event.kind === "system" ? event.payload.operation : null,
    actor_id: event.actor_id,
    actor_kind: event.actor_kind,
  };
}

export function mapReportEvent(records: GoalEventFactsRepository, row: StoredWorkEvent): GoalReportWorkEventRecord {
  const type = row.type_id != null && row.type_version != null
    ? records.getType(row.board_id, row.goal_id, row.type_id, row.type_version)
    : null;
  return {
    ...workEventBase(row),
    kind: "report",
    type,
    payload: ownStringRecord(row.payload),
    judgments: records.listJudgments(row.event_id),
  };
}

function mapSystemEvent(records: GoalEventFactsRepository, row: StoredWorkEvent): Extract<GoalWorkEventRecord, { kind: "system" }> {
  return {
    ...workEventBase(row),
    kind: "system",
    type: null,
    payload: parseGoalEventSystemPayload(row.payload),
    judgments: records.listJudgments(row.event_id),
  };
}

function mapConfigurationEvent(records: GoalEventFactsRepository, row: StoredWorkEvent): GoalWorkEventRecord {
  return {
    ...workEventBase(row),
    kind: "configuration",
    type: null,
    payload: configurationPayload(row.payload),
    judgments: records.listJudgments(row.event_id),
  };
}

function workEventBase(row: StoredWorkEvent) {
  return {
    event_id: row.event_id,
    board_id: row.board_id,
    goal_id: row.goal_id,
    title: row.title,
    actor_id: row.actor_id,
    actor_kind: row.actor_kind,
    received_at: row.received_at,
    journal_seq: row.journal_seq,
    config_version: row.config_version,
  };
}
