import { applySqliteBaseline, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import type { SqliteDatabase } from "./open-database.js";

/**
 * The studio database as one current schema (repository-anti-corruption §4.1): what the ten former migrations added up
 * to. A new database gets it with the version; one at another version is refused, never upgraded in place.
 */
export const ALCHEMIST_STUDIO_BASELINE: SqliteBaseline = { version: 1, schema: `
  CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE workspace_actors (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('local_user', 'system')),
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE directions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('user_input', 'pulse_opportunity')),
    source_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE exploration_runs (
    id TEXT PRIMARY KEY,
    direction_id TEXT NOT NULL REFERENCES directions(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled', 'interrupted')),
    runtime_label TEXT NOT NULL,
    understanding_json TEXT,
    error_code TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE ideas (
    id TEXT PRIMARY KEY,
    direction_id TEXT NOT NULL REFERENCES directions(id) ON DELETE RESTRICT,
    lifecycle TEXT NOT NULL CHECK (lifecycle IN ('exploring', 'build', 'hold', 'drop', 'archived')),
    current_version INTEGER NOT NULL CHECK (current_version >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE idea_cards (
    id TEXT PRIMARY KEY,
    exploration_run_id TEXT NOT NULL REFERENCES exploration_runs(id) ON DELETE CASCADE,
    direction_id TEXT NOT NULL REFERENCES directions(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('candidate', 'discarded', 'kept')),
    title TEXT NOT NULL,
    highlight TEXT NOT NULL,
    target_user TEXT NOT NULL,
    scenario TEXT NOT NULL,
    problem TEXT NOT NULL,
    mechanism TEXT NOT NULL,
    value_proposition TEXT NOT NULL,
    why_it_may_work TEXT NOT NULL,
    unknowns_json TEXT NOT NULL,
    mvp_json TEXT NOT NULL,
    discarded_at TEXT,
    kept_at TEXT,
    kept_idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  , assumptions_json TEXT NOT NULL DEFAULT '[]', position INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE idea_versions (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version >= 1),
    parent_version INTEGER,
    actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    source_card_id TEXT NOT NULL REFERENCES idea_cards(id) ON DELETE RESTRICT,
    source_exploration_run_id TEXT NOT NULL REFERENCES exploration_runs(id) ON DELETE RESTRICT,
    content_json TEXT NOT NULL,
    UNIQUE (idea_id, version)
  );
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled', 'interrupted')),
    input_json TEXT NOT NULL,
    lease_owner TEXT,
    lease_expires_at TEXT,
    attempt INTEGER NOT NULL DEFAULT 0,
    checkpoint_json TEXT,
    error_code TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE job_events (
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (job_id, sequence)
  );
  CREATE TABLE ui_context (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    surface TEXT NOT NULL CHECK (surface IN ('ideas', 'pulse', 'decisions')),
    direction_id TEXT REFERENCES directions(id) ON DELETE SET NULL,
    idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
    idea_version INTEGER,
    panel TEXT CHECK (panel IN ('brief', 'market', 'cost', 'decision')),
    hand_focus INTEGER,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE activity_events (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE mvp_scope_versions (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version >= 1),
    idea_version INTEGER NOT NULL CHECK (idea_version >= 1),
    actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
    in_scope_json TEXT NOT NULL,
    out_of_scope_json TEXT NOT NULL,
    platform_assumptions_json TEXT NOT NULL,
    integration_assumptions_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (idea_id, version),
    UNIQUE (idea_id, idea_version)
  );
  CREATE TABLE research_plans (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    idea_version INTEGER NOT NULL CHECK (idea_version >= 1),
    mvp_scope_version INTEGER,
    lens TEXT NOT NULL CHECK (lens IN ('market_space', 'build_cost')),
    scope_summary TEXT NOT NULL,
    model_policy TEXT NOT NULL CHECK (model_policy IN ('auto', 'fixed')),
    model_id TEXT NOT NULL,
    runtime_label TEXT NOT NULL,
    estimated_min_minutes INTEGER NOT NULL CHECK (estimated_min_minutes >= 0),
    estimated_max_minutes INTEGER NOT NULL CHECK (estimated_max_minutes >= estimated_min_minutes),
    budget_kind TEXT NOT NULL CHECK (budget_kind IN ('calls', 'tokens', 'money')),
    budget_limit REAL NOT NULL CHECK (budget_limit > 0),
    budget_currency TEXT,
    created_at TEXT NOT NULL, applied_playbook_rule_ids_json TEXT NOT NULL DEFAULT '[]', reuse_json TEXT,
    CHECK (
      (lens = 'market_space' AND mvp_scope_version IS NULL) OR
      (lens = 'build_cost' AND mvp_scope_version IS NOT NULL)
    )
  );
  CREATE TABLE lens_runs (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES research_plans(id) ON DELETE RESTRICT,
    idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    idea_version INTEGER NOT NULL CHECK (idea_version >= 1),
    mvp_scope_version INTEGER,
    lens TEXT NOT NULL CHECK (lens IN ('market_space', 'build_cost')),
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled', 'interrupted')),
    stage TEXT NOT NULL CHECK (stage IN ('planning', 'collecting', 'cross_checking', 'synthesizing')),
    runtime_label TEXT NOT NULL,
    job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE RESTRICT,
    error_code TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (
      (lens = 'market_space' AND mvp_scope_version IS NULL) OR
      (lens = 'build_cost' AND mvp_scope_version IS NOT NULL)
    )
  );
  CREATE TABLE evidence (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES lens_runs(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('official', 'user_signal', 'independent_analysis', 'repository')),
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    content_hash TEXT NOT NULL
  );
  CREATE TABLE lens_reports (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES lens_runs(id) ON DELETE RESTRICT,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    idea_version INTEGER NOT NULL CHECK (idea_version >= 1),
    mvp_scope_version INTEGER,
    lens TEXT NOT NULL CHECK (lens IN ('market_space', 'build_cost')),
    status TEXT NOT NULL CHECK (status IN ('completed', 'partial')),
    runtime_label TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (run_id, revision),
    UNIQUE (id, revision)
  );
  CREATE TABLE claims (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL REFERENCES lens_reports(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    label TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('supported', 'tentative', 'disputed', 'unknown')),
    conclusion TEXT NOT NULL,
    rationale TEXT NOT NULL,
    unknowns_json TEXT NOT NULL,
    change_conditions_json TEXT NOT NULL,
    UNIQUE (report_id, position)
  );
  CREATE TABLE claim_evidence (
    claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    relation TEXT NOT NULL CHECK (relation IN ('support', 'counter')),
    PRIMARY KEY (claim_id, evidence_id, relation)
  );
  CREATE TABLE decisions (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    idea_version INTEGER NOT NULL CHECK (idea_version >= 1),
    mvp_scope_version INTEGER NOT NULL CHECK (mvp_scope_version >= 1),
    outcome TEXT NOT NULL CHECK (outcome IN ('build', 'hold', 'drop')),
    reason TEXT NOT NULL,
    market_report_id TEXT NOT NULL,
    market_report_revision INTEGER NOT NULL,
    cost_report_id TEXT NOT NULL,
    cost_report_revision INTEGER NOT NULL,
    actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL, revisit_condition TEXT NOT NULL DEFAULT '', source_kind TEXT NOT NULL DEFAULT 'direct'
    CHECK (source_kind IN ('direct', 'annotation', 'conversation')),
    UNIQUE (idea_id, idea_version),
    FOREIGN KEY (market_report_id, market_report_revision) REFERENCES lens_reports(id, revision) ON DELETE RESTRICT,
    FOREIGN KEY (cost_report_id, cost_report_revision) REFERENCES lens_reports(id, revision) ON DELETE RESTRICT
  );
  CREATE TABLE source_settings (
    source_id TEXT PRIMARY KEY CHECK (source_id IN ('toolify', 'watcha', 'github')),
    label TEXT NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    homepage_url TEXT NOT NULL,
    capability TEXT NOT NULL,
    limitation TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE pulse_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled', 'interrupted')),
    stage TEXT NOT NULL CHECK (stage IN ('planning', 'collecting', 'cross_checking', 'synthesizing')),
    source_ids_json TEXT NOT NULL,
    runtime_label TEXT NOT NULL,
    job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE RESTRICT,
    error_code TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE source_fetches (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES pulse_runs(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL CHECK (source_id IN ('toolify', 'watcha', 'github')),
    request_url TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('completed', 'error')),
    http_status INTEGER,
    fetched_at TEXT NOT NULL,
    content_hash TEXT,
    error_code TEXT,
    rate_limit_remaining INTEGER,
    rate_limit_reset TEXT,
    UNIQUE (run_id, source_id)
  );
  CREATE TABLE supply_signals (
    id TEXT PRIMARY KEY,
    fetch_id TEXT NOT NULL REFERENCES source_fetches(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL CHECK (source_id IN ('toolify', 'watcha', 'github')),
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    summary TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    published_at TEXT,
    categories_json TEXT NOT NULL,
    native_metrics_json TEXT NOT NULL,
    supports_json TEXT NOT NULL,
    cannot_prove_json TEXT NOT NULL
  );
  CREATE TABLE pulse_reports (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES pulse_runs(id) ON DELETE RESTRICT,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    status TEXT NOT NULL CHECK (status IN ('completed', 'partial')),
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    runtime_label TEXT NOT NULL,
    successful_source_ids_json TEXT NOT NULL,
    failed_source_ids_json TEXT NOT NULL,
    coverage_gaps_json TEXT NOT NULL,
    findings_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (run_id, revision)
  );
  CREATE TABLE pulse_report_signals (
    report_id TEXT NOT NULL REFERENCES pulse_reports(id) ON DELETE CASCADE,
    signal_id TEXT NOT NULL REFERENCES supply_signals(id) ON DELETE RESTRICT,
    PRIMARY KEY (report_id, signal_id)
  );
  CREATE TABLE opportunities (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL REFERENCES pulse_reports(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    title TEXT NOT NULL,
    highlight TEXT NOT NULL,
    rationale TEXT NOT NULL,
    demand_inference TEXT NOT NULL,
    counter_signals_json TEXT NOT NULL,
    unknowns_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('new', 'saved_for_later', 'converted_to_direction', 'dismissed')),
    saved_at TEXT,
    dismissed_at TEXT,
    converted_at TEXT,
    converted_direction_id TEXT REFERENCES directions(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL,
    UNIQUE (report_id, position)
  );
  CREATE TABLE opportunity_signals (
    opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    signal_id TEXT NOT NULL REFERENCES supply_signals(id) ON DELETE RESTRICT,
    PRIMARY KEY (opportunity_id, signal_id)
  );
  CREATE TABLE annotations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
    target_kind TEXT NOT NULL CHECK (target_kind IN ('idea_brief', 'lens_report', 'pulse_report')),
    object_id TEXT NOT NULL,
    target_revision INTEGER NOT NULL CHECK (target_revision >= 1),
    block_id TEXT NOT NULL,
    quoted_snapshot TEXT NOT NULL CHECK (length(trim(quoted_snapshot)) > 0),
    comment TEXT NOT NULL CHECK (length(trim(comment)) > 0),
    status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE TABLE action_proposals (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('annotation', 'conversation', 'direct')),
    source_id TEXT NOT NULL,
    action_kind TEXT NOT NULL CHECK (action_kind IN ('create_playbook_rule', 'create_taste_rule', 'revise_idea')),
    target_json TEXT NOT NULL,
    summary TEXT NOT NULL,
    diff_json TEXT NOT NULL,
    version_impact TEXT NOT NULL,
    cost_impact TEXT NOT NULL,
    memory_impact TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'rejected')),
    created_at TEXT NOT NULL,
    applied_at TEXT,
    rejected_at TEXT
  );
  CREATE TABLE taste_rules (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL CHECK (version >= 1),
    title TEXT NOT NULL,
    statement TEXT NOT NULL,
    applies_to TEXT NOT NULL,
    exceptions_json TEXT NOT NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('annotation', 'conversation', 'direct')),
    source_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'deleted')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE research_playbook_rules (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL CHECK (version >= 1),
    original_feedback TEXT NOT NULL,
    method_change TEXT NOT NULL,
    positive_examples_json TEXT NOT NULL,
    negative_examples_json TEXT NOT NULL,
    scope_kind TEXT NOT NULL CHECK (scope_kind IN ('report', 'direction', 'global_market_space')),
    report_id TEXT,
    direction_id TEXT REFERENCES directions(id) ON DELETE CASCADE,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('annotation', 'conversation', 'direct')),
    source_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (
      (scope_kind = 'report' AND report_id IS NOT NULL AND direction_id IS NULL) OR
      (scope_kind = 'direction' AND direction_id IS NOT NULL AND report_id IS NULL) OR
      (scope_kind = 'global_market_space' AND report_id IS NULL AND direction_id IS NULL)
    )
  );
  CREATE TABLE memory_rule_applications (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL REFERENCES research_playbook_rules(id) ON DELETE RESTRICT,
    plan_id TEXT NOT NULL REFERENCES research_plans(id) ON DELETE CASCADE,
    run_id TEXT REFERENCES lens_runs(id) ON DELETE SET NULL,
    applied_at TEXT NOT NULL, rule_version INTEGER, method_snapshot_json TEXT,
    UNIQUE (rule_id, plan_id)
  );
  CREATE TABLE "conversation_messages" (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
    author TEXT NOT NULL CHECK (author IN ('user', 'assistant')),
    body TEXT NOT NULL,
    context_json TEXT NOT NULL,
    response_state TEXT NOT NULL CHECK (response_state IN ('complete', 'runtime_unavailable', 'failed')),
    parent_message_id TEXT REFERENCES "conversation_messages"(id) ON DELETE SET NULL,
    runtime_label TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE "runtime_settings" (
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
  CREATE TABLE research_playbook_revisions (
    rule_id TEXT NOT NULL REFERENCES research_playbook_rules(id),
    version INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    PRIMARY KEY (rule_id, version)
  );
  CREATE TABLE work_reuse_receipts (
    plan_id TEXT PRIMARY KEY REFERENCES research_plans(id),
    run_id TEXT NOT NULL REFERENCES lens_runs(id),
    actor_id TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    consumed_at TEXT NOT NULL,
    relation_state TEXT NOT NULL CHECK (relation_state IN ('pending','recorded','not_needed')),
    feedback_json TEXT
  );
  CREATE INDEX directions_workspace_updated_idx ON directions(workspace_id, updated_at DESC);
  CREATE INDEX exploration_runs_direction_idx ON exploration_runs(direction_id, created_at DESC);
  CREATE INDEX idea_cards_exploration_idx ON idea_cards(exploration_run_id, created_at, id);
  CREATE INDEX jobs_claim_idx ON jobs(status, lease_expires_at, created_at);
  CREATE INDEX activity_events_workspace_idx ON activity_events(workspace_id, created_at DESC);
  CREATE INDEX idea_cards_exploration_position_idx
    ON idea_cards(exploration_run_id, position, id);
  CREATE INDEX research_plans_key_idx
    ON research_plans(idea_id, idea_version, lens, mvp_scope_version, created_at DESC);
  CREATE INDEX lens_runs_key_idx
    ON lens_runs(idea_id, idea_version, lens, mvp_scope_version, created_at DESC);
  CREATE INDEX lens_reports_key_idx
    ON lens_reports(idea_id, idea_version, lens, mvp_scope_version, created_at DESC);
  CREATE INDEX decisions_created_idx ON decisions(created_at DESC);
  CREATE INDEX pulse_runs_workspace_idx ON pulse_runs(workspace_id, created_at DESC);
  CREATE INDEX supply_signals_source_idx ON supply_signals(source_id, observed_at DESC);
  CREATE INDEX opportunities_status_idx ON opportunities(status, created_at DESC);
  CREATE INDEX annotations_target_idx
    ON annotations(target_kind, object_id, target_revision, created_at);
  CREATE INDEX action_proposals_workspace_idx
    ON action_proposals(workspace_id, status, created_at DESC);
  CREATE INDEX taste_rules_workspace_idx ON taste_rules(workspace_id, status, updated_at DESC);
  CREATE INDEX research_playbook_rules_workspace_idx
    ON research_playbook_rules(workspace_id, status, updated_at DESC);
  CREATE INDEX conversation_messages_workspace_created_idx
    ON conversation_messages(workspace_id, created_at, id);
` };

/** Give a studio database its current schema, or refuse it when it is at another version. */
export function applyStudioBaseline(database: SqliteDatabase, path: string): void {
  applySqliteBaseline(database, path, ALCHEMIST_STUDIO_BASELINE);
}
