CREATE TABLE runtime_settings_host (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('none', 'prologue')),
  model_id TEXT NOT NULL,
  model_policy TEXT NOT NULL CHECK (model_policy IN ('auto', 'fixed')),
  market_budget_kind TEXT NOT NULL CHECK (market_budget_kind = 'calls'),
  market_budget_limit INTEGER NOT NULL CHECK (market_budget_limit BETWEEN 1 AND 40),
  cost_budget_kind TEXT NOT NULL CHECK (cost_budget_kind = 'calls'),
  cost_budget_limit INTEGER NOT NULL CHECK (cost_budget_limit BETWEEN 1 AND 40),
  updated_at TEXT NOT NULL
);
INSERT INTO runtime_settings_host
SELECT workspace_id, 'none', '', 'auto', 'calls',
  CASE WHEN market_budget_kind = 'calls' THEN MIN(40, MAX(1, CAST(market_budget_limit AS INTEGER))) ELSE 6 END,
  'calls', CASE WHEN cost_budget_kind = 'calls' THEN MIN(40, MAX(1, CAST(cost_budget_limit AS INTEGER))) ELSE 4 END,
  updated_at FROM runtime_settings;
DROP TABLE runtime_settings;
ALTER TABLE runtime_settings_host RENAME TO runtime_settings;
