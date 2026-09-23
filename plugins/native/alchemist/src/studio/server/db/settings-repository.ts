import type { ResearchBudget } from "../../domain/research/budget.js";
import { assertValidRuntimeSettings, type RuntimeSettings } from "../../domain/settings/runtime-settings.js";
import type { SqliteDatabase } from "./open-database.js";

interface RuntimeSettingsRow {
  workspace_id: string;
  provider: RuntimeSettings["provider"];
  model_id: string;
  model_policy: RuntimeSettings["modelPolicy"];
  market_budget_kind: ResearchBudget["kind"];
  market_budget_limit: number;
  cost_budget_kind: ResearchBudget["kind"];
  cost_budget_limit: number;
  updated_at: string;
}

export class SqliteSettingsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  ensureDefaults(workspaceId: string, now: string): RuntimeSettings {
    this.database
      .prepare(
        `INSERT OR IGNORE INTO runtime_settings
         (workspace_id, provider, model_id, model_policy,
          market_budget_kind, market_budget_limit, cost_budget_kind, cost_budget_limit, updated_at)
         VALUES (?, 'none', '', 'auto', 'calls', 6, 'calls', 4, ?)`,
      )
      .run(workspaceId, now);
    return this.require(workspaceId);
  }

  get(workspaceId: string): RuntimeSettings | undefined {
    const row = this.database
      .prepare("SELECT * FROM runtime_settings WHERE workspace_id = ?")
      .get(workspaceId) as RuntimeSettingsRow | undefined;
    return row ? mapSettings(row) : undefined;
  }

  update(settings: RuntimeSettings): RuntimeSettings {
    assertValidRuntimeSettings(settings);
    const market = settings.defaultBudgets.marketSpace;
    const cost = settings.defaultBudgets.buildCost;
    const result = this.database
      .prepare(
        `UPDATE runtime_settings SET
          provider = ?, model_id = ?, model_policy = ?,
          market_budget_kind = ?, market_budget_limit = ?, cost_budget_kind = ?,
          cost_budget_limit = ?, updated_at = ? WHERE workspace_id = ?`,
      )
      .run(
        settings.provider,
        settings.modelId,
        settings.modelPolicy,
        market.kind,
        market.limit,
        cost.kind,
        cost.limit,
        settings.updatedAt,
        settings.workspaceId,
      );
    if (result.changes !== 1) throw new Error("RUNTIME_SETTINGS_NOT_FOUND");
    return this.require(settings.workspaceId);
  }

  private require(workspaceId: string): RuntimeSettings {
    const settings = this.get(workspaceId);
    if (!settings) throw new Error("RUNTIME_SETTINGS_NOT_FOUND");
    return settings;
  }
}

function mapSettings(row: RuntimeSettingsRow): RuntimeSettings {
  return {
    workspaceId: row.workspace_id,
    provider: row.provider,
    modelId: row.model_id,
    modelPolicy: row.model_policy,
    defaultBudgets: {
      marketSpace: { kind: row.market_budget_kind, limit: row.market_budget_limit } as ResearchBudget,
      buildCost: { kind: row.cost_budget_kind, limit: row.cost_budget_limit } as ResearchBudget,
    },
    updatedAt: row.updated_at,
  };
}
