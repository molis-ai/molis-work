import {
  ATTENTION_CONTENT_REPLICA_ID,
  attentionErrors,
  isAttentionName,
  type AttentionEntryRecord,
} from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type {
  ProjectReplicaDefinition,
  ProjectReplicaRows,
} from "@molis-ai/molis-work-contracts/platform/sync-transport";
import {
  ATTENTION_DETAIL_MAX_BYTES,
  assertAttentionDetail,
  assertAttentionEntryShape,
  isAttentionId,
} from "./entry-shape.js";

const statuses = ["open", "in_progress", "done", "dismissed"];
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));

/** References and saved dispositions only. Receiving never invokes the subject or judgment services. */
export function attentionContentReplicationDefinition(
  portable?: (value: unknown, maximumBytes: number) => void,
): ProjectReplicaDefinition {
  return {
    id: ATTENTION_CONTENT_REPLICA_ID,
    assetKind: "project_attention",
    tables: [
      {
        name: "attention_entries",
        columns:
          "project_id entry_id owner_plugin_id subject_type subject_id reason status detail_json revision created_at updated_at completed_at".split(
            " ",
          ),
        keys: ["project_id", "entry_id"],
      },
      {
        name: "attention_events",
        columns: "event_id project_id entry_id owner_plugin_id type subject_type subject_id at".split(" "),
        keys: ["event_id"],
      },
    ],
    journalTypes: [],
    receiptOperations: [],
    sequenceFields: [],
    validate: (rows, projectId) => validate(rows, projectId, portable),
    restore(rows, local) {
      const previous = new Map(local.attention_entries!.map((row) => [row.entry_id, row]));
      return {
        ...rows,
        attention_entries: rows.attention_entries!.map((row) => {
          const old = previous.get(row.entry_id);
          if (!old) return row;
          const revision = Math.max(Number(row.revision), Number(old.revision) + 1);
          if (!Number.isSafeInteger(revision)) invalid();
          return { ...row, revision };
        }),
      };
    },
  };
}

function parseDetailJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > ATTENTION_DETAIL_MAX_BYTES) {
    invalid();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalid();
  }
  assertAttentionDetail(parsed);
  return parsed;
}

function validate(
  rows: ProjectReplicaRows,
  projectId: string,
  portable?: (value: unknown, maximumBytes: number) => void,
): void {
  portable?.(rows, 512 * 1024);
  const unique = new Set<string>();
  for (const row of rows.attention_entries!) {
    if (
      row.project_id !== projectId
      || !isAttentionId(row.entry_id)
      || !isAttentionId(row.subject_id)
      || !isAttentionName(row.subject_type)
      || !statuses.includes(String(row.status))
      || !Number.isSafeInteger(row.revision)
      || Number(row.revision) < 1
      || !date(row.created_at)
      || !date(row.updated_at)
      || (row.completed_at !== null && !date(row.completed_at))
    ) {
      invalid();
    }
    if (["done", "dismissed"].includes(String(row.status)) ? row.completed_at === null : row.completed_at !== null) {
      invalid();
    }
    if (!isAttentionName(row.reason)) {
      invalid();
    }
    const key = JSON.stringify([row.owner_plugin_id, row.subject_type, row.subject_id, row.reason]);
    if (unique.has(key)) {
      invalid();
    }
    unique.add(key);
    const detail = parseDetailJson(row.detail_json);
    portable?.(detail, ATTENTION_DETAIL_MAX_BYTES);
    assertAttentionEntryShape({
      project_id: projectId,
      entry_id: String(row.entry_id),
      owner_plugin_id: row.owner_plugin_id as string | null,
      subject_type: row.subject_type as AttentionEntryRecord["subject_type"],
      subject_id: String(row.subject_id),
      reason: row.reason as AttentionEntryRecord["reason"],
      status: row.status as AttentionEntryRecord["status"],
      detail,
      revision: Number(row.revision),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      completed_at: row.completed_at as string | null,
    });
  }
  const events = ["created", ...statuses, "deleted"].map((status) => `attention_entry.${status}`);
  for (const row of rows.attention_events!) {
    if (
      row.project_id !== projectId
      || !isAttentionId(row.event_id)
      || !isAttentionId(row.entry_id)
      || !(row.owner_plugin_id === null || isAttentionId(row.owner_plugin_id))
      || !isAttentionName(row.subject_type)
      || !isAttentionId(row.subject_id)
      || !events.includes(String(row.type))
      || !date(row.at)
    ) {
      invalid();
    }
  }
}

function invalid(): never {
  throw attentionErrors.invalid_reference("注意事项同步的身份、状态、引用或历史无效");
}
