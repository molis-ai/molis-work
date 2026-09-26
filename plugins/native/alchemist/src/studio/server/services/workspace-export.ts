import type { IdFactory } from "../../domain/kernel/identity.js";
import type { SqliteActivityRepository } from "../db/activity-repository.js";
import type { SqliteDatabase } from "../db/open-database.js";
import { formatSystemLocalCalendarDate } from "../utils/local-calendar.js";
import type { WorkReuseService } from "../../../work-reuse/service.js";
import type { ReuseSnapshot } from "../../../work-reuse/contracts.js";

const exportTables = [
  "workspaces",
  "workspace_actors",
  "directions",
  "exploration_runs",
  "idea_cards",
  "ideas",
  "idea_versions",
  "conversation_messages",
  "mvp_scope_versions",
  "research_plans",
  "lens_runs",
  "evidence",
  "lens_reports",
  "claims",
  "claim_evidence",
  "decisions",
  "source_settings",
  "pulse_runs",
  "source_fetches",
  "supply_signals",
  "pulse_reports",
  "pulse_report_signals",
  "opportunities",
  "opportunity_signals",
  "annotations",
  "action_proposals",
  "taste_rules",
  "research_playbook_rules",
  "memory_rule_applications",
  "activity_events",
] as const;

export interface WorkspaceExportResult {
  filename: string;
  contentType: "application/json; charset=utf-8" | "application/zip";
  body: Uint8Array;
}

export class WorkspaceExportService {
  constructor(
    private readonly options: {
      database: SqliteDatabase;
      workspaceId: string;
      activity: SqliteActivityRepository;
      idFactory: IdFactory;
      now(): string;
      workReuse?: WorkReuseService;
    },
  ) {}

  async create(format: "json" | "zip", signal?: AbortSignal): Promise<WorkspaceExportResult> {
    const generatedAt = this.options.now();
    this.options.activity.create({
      id: this.options.idFactory.next("activity"),
      workspaceId: this.options.workspaceId,
      kind: "workspace.exported",
      targetKind: "workspace",
      targetId: this.options.workspaceId,
      payload: { format },
      createdAt: generatedAt,
    });
    const data = Object.fromEntries(exportTables.map((table) => [table, this.rows(table)]));
    if (this.options.workReuse) {
      for (const row of data.research_plans! as Record<string, unknown>[]) {
        if (row.reuse) row.reuse = await this.options.workReuse.projectSnapshot(row.reuse as ReuseSnapshot, signal);
      }
    }
    const runtime = this.options.database
      .prepare(
        `SELECT provider, model_id, model_policy, market_budget_kind, market_budget_limit,
                cost_budget_kind, cost_budget_limit, updated_at
         FROM runtime_settings WHERE workspace_id = ?`,
      )
      .get(this.options.workspaceId);
    const payload = {
      exportVersion: 1,
      product: "alchemist",
      workspaceId: this.options.workspaceId,
      generatedAt,
      runtimeConfiguration: runtime ? normalizeRow(runtime as Record<string, unknown>) : null,
      data,
    };
    const json = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
    const stamp = formatSystemLocalCalendarDate(generatedAt);
    return format === "zip"
      ? {
          filename: `alchemist-workspace-${stamp}.zip`,
          contentType: "application/zip",
          body: createStoredZip("workspace.json", json, generatedAt),
        }
      : {
          filename: `alchemist-workspace-${stamp}.json`,
          contentType: "application/json; charset=utf-8",
          body: json,
        };
  }

  private rows(table: (typeof exportTables)[number]): unknown[] {
    return (
      this.options.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() as Record<
        string,
        unknown
      >[]
    ).map(normalizeRow);
  }
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (key.endsWith("_json") && typeof value === "string") {
        try {
          return [key.slice(0, -5), JSON.parse(value) as unknown];
        } catch {
          return [key, value];
        }
      }
      return [key, value];
    }),
  );
}

function createStoredZip(name: string, data: Buffer, now: string): Uint8Array {
  const filename = Buffer.from(name, "utf8");
  const crc = crc32(data);
  const { date, time } = dosDateTime(new Date(now));
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(filename.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(date, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(filename.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);

  const centralDirectory = Buffer.concat([central, filename]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(local.length + filename.length + data.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([local, filename, data, centralDirectory, end]);
}

function dosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
