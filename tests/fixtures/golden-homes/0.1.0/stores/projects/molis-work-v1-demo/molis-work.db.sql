PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE acceptance_checks (
    seq INTEGER PRIMARY KEY,
    check_id TEXT NOT NULL UNIQUE,
    subject_no INTEGER NOT NULL REFERENCES acceptance_subjects(subject_no),
    clock INTEGER NOT NULL,
    requirement_id TEXT NOT NULL,
    requirement_version INTEGER NOT NULL,
    round INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('engineering', 'hands_on')),
    verdict TEXT NOT NULL CHECK (verdict IN ('supports', 'contradicts')),
    tier TEXT NOT NULL CHECK (tier IN ('self_reported', 'peer_reviewed', 'machine_checked')),
    gap TEXT CHECK (gap IS NULL OR gap IN ('evidence_missing', 'evidence_stale', 'wrong_object', 'evidence_unreadable', 'check_failed')),
    checked_version TEXT NOT NULL,
    method TEXT NOT NULL,
    observed TEXT NOT NULL,
    evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json) AND json_type(evidence_json) = 'array'),
    reporter_session TEXT,
    actor_id TEXT NOT NULL,
    reported_at TEXT NOT NULL,
    CHECK (tier = 'self_reported' OR (gap IS NULL AND json_array_length(evidence_json) > 0 AND reporter_session IS NOT NULL AND length(trim(reporter_session)) > 0))
  );
CREATE TABLE acceptance_criteria (
    criterion_id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    decision_method TEXT NOT NULL,
    pass_condition TEXT NOT NULL,
    target_json TEXT,
    required_evidence_json TEXT NOT NULL DEFAULT '[]'
  );
CREATE TABLE acceptance_decisions (
    seq INTEGER PRIMARY KEY,
    decision_id TEXT NOT NULL,
    subject_no INTEGER NOT NULL REFERENCES acceptance_subjects(subject_no),
    clock INTEGER NOT NULL,
    requirement_id TEXT NOT NULL,
    requirement_version INTEGER NOT NULL,
    stands_round INTEGER NOT NULL,
    version TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('accepted', 'returned')),
    note TEXT,
    origin TEXT NOT NULL CHECK (origin IN ('trusted_decision')),
    origin_ref TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    decided_at TEXT NOT NULL,
    UNIQUE (decision_id, requirement_id),
    CHECK (decision = 'accepted' OR (note IS NOT NULL AND length(trim(note)) > 0))
  );
CREATE TABLE acceptance_deliveries (
    seq INTEGER PRIMARY KEY,
    subject_no INTEGER NOT NULL REFERENCES acceptance_subjects(subject_no),
    round INTEGER NOT NULL,
    version TEXT NOT NULL,
    summary TEXT,
    touches_json TEXT CHECK (touches_json IS NULL OR (json_valid(touches_json) AND json_type(touches_json) = 'array')),
    made_in_session TEXT,
    made_in_run TEXT,
    actor_id TEXT NOT NULL,
    delivered_at TEXT NOT NULL,
    UNIQUE (subject_no, round),
    UNIQUE (subject_no, version)
  );
CREATE TABLE acceptance_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE acceptance_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE acceptance_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE acceptance_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE acceptance_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE acceptance_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE acceptance_requirements (
    seq INTEGER PRIMARY KEY,
    subject_no INTEGER NOT NULL REFERENCES acceptance_subjects(subject_no),
    requirement_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    statement TEXT NOT NULL,
    expected TEXT,
    part TEXT,
    requires_person INTEGER NOT NULL,
    withdrawn INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL,
    by_person INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (subject_no, requirement_id, version)
  );
CREATE TABLE acceptance_subjects (
    subject_no INTEGER PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (project_id, provider_id, subject_kind, subject_id)
  );
CREATE TABLE acceptance_sync_resolving (marker INTEGER PRIMARY KEY CHECK (marker = 1));
CREATE TABLE artifacts_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE artifacts_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE artifacts_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE artifacts_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE artifacts_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE artifacts_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE attention_entries (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      owner_plugin_id TEXT,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'dismissed')),
      detail_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      PRIMARY KEY (project_id, entry_id)
);
CREATE TABLE attention_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      owner_plugin_id TEXT,
      type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      at TEXT NOT NULL
    );
CREATE TABLE attention_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE attention_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE attention_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE attention_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE attention_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE attention_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE boards (
          project_id TEXT PRIMARY KEY REFERENCES project_root(project_id) ON DELETE CASCADE,
          active_goal_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
CREATE TABLE builder_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE builder_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE builder_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE builder_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE builder_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE builder_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE coding_input_versions (
  project_id TEXT NOT NULL, session_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0), PRIMARY KEY(project_id,session_id)
 );
CREATE TABLE coding_inputs (
  project_id TEXT NOT NULL, session_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
  draft TEXT NOT NULL, questions_json TEXT NOT NULL,
  PRIMARY KEY(project_id,session_id),
  FOREIGN KEY(project_id,session_id) REFERENCES coding_sessions(project_id,session_id) ON DELETE CASCADE
 );
CREATE TABLE coding_plan_drafts (
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      draft_json TEXT NOT NULL,
      PRIMARY KEY (project_id, session_id),
      FOREIGN KEY (project_id, session_id) REFERENCES coding_sessions(project_id, session_id) ON DELETE CASCADE
    );
CREATE TABLE coding_plan_versions (
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      PRIMARY KEY (project_id, session_id)
    );
CREATE TABLE coding_saved_history (
 project_id TEXT NOT NULL,session_id TEXT NOT NULL,source_id TEXT NOT NULL,archive_json TEXT NOT NULL,
 PRIMARY KEY(project_id,session_id,source_id),FOREIGN KEY(project_id,session_id) REFERENCES coding_sessions(project_id,session_id) ON DELETE CASCADE);
CREATE TABLE coding_sessions (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      state TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      goal_id TEXT,
      runtime_id TEXT NOT NULL,
      runtime_session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      -- Who holds the unfinished plan steps, as last read: lets a list across projects show what waits on the person.
      steps_json TEXT,
      -- Background commands the session left running, as last read: lets the list across projects show and stop them.
      background_json TEXT,
      PRIMARY KEY (project_id, session_id)
    );
CREATE TABLE context_edges (
    scope_kind TEXT NOT NULL CHECK (scope_kind IN ('personal', 'team_project')),
    scope_id TEXT NOT NULL,
    edge_key TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    relation_type TEXT NOT NULL,
    source_json TEXT NOT NULL,
    target_json TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    cause TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active', 'removed')),
    PRIMARY KEY (scope_kind, scope_id, edge_key, revision)
  );
CREATE TABLE events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL UNIQUE,
          project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
          actor_id TEXT NOT NULL,
          type TEXT NOT NULL,
          object_type TEXT NOT NULL,
          object_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          at TEXT NOT NULL
        );
CREATE TABLE feed_item_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      at TEXT NOT NULL
    );
CREATE TABLE feed_items (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      source_id TEXT,
      signal_id TEXT,
      signal_revision INTEGER,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      body TEXT,
      source_kind TEXT NOT NULL,
      source_label TEXT NOT NULL,
      external_id TEXT,
      url TEXT,
      origin_status TEXT NOT NULL,
      priority TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      author TEXT,
      disposition TEXT NOT NULL CHECK (disposition IN ('inbox', 'saved', 'promoted', 'archived')),
      read_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      source_created_at TEXT NOT NULL,
      source_updated_at TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, item_id)
    );
CREATE TABLE feed_materials (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      material_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      canonical_url TEXT,
      title TEXT NOT NULL,
      source_name TEXT NOT NULL,
      published_at TEXT,
      preview TEXT NOT NULL DEFAULT '',
      content_hash TEXT,
      content_ref TEXT,
      content_available INTEGER NOT NULL DEFAULT 0,
      content_type TEXT,
      character_count INTEGER,
      captured_at TEXT,
      provenance_json TEXT NOT NULL DEFAULT '{}',
      selected_for_context INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, material_id),
      FOREIGN KEY (project_id, item_id) REFERENCES feed_items(project_id, item_id) ON DELETE CASCADE
    );
CREATE TABLE feed_missed_pulls (
      project_id TEXT NOT NULL, run_id TEXT NOT NULL, source_id TEXT NOT NULL, title TEXT NOT NULL, due_at TEXT NOT NULL, missed_at TEXT NOT NULL,
      decision TEXT CHECK (decision IN ('run_now', 'skip')), decided_at TEXT,
      PRIMARY KEY (project_id, run_id)
    );
CREATE TABLE feed_out_rules (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      match_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      admission TEXT NOT NULL,
      judgment_json TEXT,
      revision TEXT NOT NULL,
      PRIMARY KEY (project_id, rule_id)
    );
CREATE TABLE feed_source_runs (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
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
      PRIMARY KEY (project_id, run_id),
      UNIQUE (project_id, operation_id)
    );
CREATE TABLE feed_sources (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      definition_id TEXT,
      sync_kind TEXT NOT NULL DEFAULT 'manual' CHECK (sync_kind IN ('public_source', 'github', 'gmail', 'connector', 'manual')),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      item_count INTEGER NOT NULL DEFAULT 0,
      origin TEXT NOT NULL CHECK (origin = 'molis_work'),
      config_json TEXT NOT NULL DEFAULT '{}',
      schedule_json TEXT NOT NULL DEFAULT '{"mode":"manual"}',
      credential_ref TEXT,
      account_label TEXT,
      last_sync_at TEXT,
      last_outcome TEXT,
      last_error_code TEXT,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, source_id)
);
CREATE TABLE goal_event_agreements (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    outcome TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    event_id TEXT,
    PRIMARY KEY (project_id, goal_id, version)
  );
CREATE TABLE goal_event_applied_decisions (
    decision_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    governance_decision_id TEXT NOT NULL,
    request_id TEXT,
    event_id TEXT NOT NULL,
    selected_option_id TEXT,
    conclusion TEXT NOT NULL,
    accepts_requirements INTEGER NOT NULL CHECK (accepts_requirements IN (0, 1)),
    effects_json TEXT NOT NULL DEFAULT '[]',
    scope_json TEXT NOT NULL,
    commitment_json TEXT NOT NULL DEFAULT '{"outcome":"","requirements":[]}',
    authorized_change_json TEXT,
    config_version INTEGER,
    agreement_version INTEGER,
    actor_id TEXT NOT NULL,
    authority_source TEXT NOT NULL CHECK (authority_source IN ('web', 'management')),
    recorded_at TEXT NOT NULL
  );
CREATE TABLE goal_event_closures (
    closure_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('complete', 'cancel')),
    result TEXT,
    reason TEXT NOT NULL,
    completion_applied INTEGER NOT NULL CHECK (completion_applied IN (0, 1)),
    expected_config_version INTEGER NOT NULL,
    expected_agreement_version INTEGER NOT NULL DEFAULT 0,
    config_version INTEGER,
    agreement_version INTEGER,
    unmet_reasons_json TEXT NOT NULL DEFAULT '[]',
    superseded INTEGER NOT NULL CHECK (superseded IN (0, 1)),
    superseded_reason TEXT,
    recorded_at TEXT NOT NULL,
    acceptance_round INTEGER
  );
CREATE TABLE goal_event_concerns (
    concern_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    title TEXT NOT NULL,
    statement TEXT NOT NULL,
    scope_json TEXT NOT NULL,
    blocks_closure INTEGER NOT NULL CHECK (blocks_closure IN (0, 1)),
    status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'accepted', 'overturned')),
    resolution_reason TEXT,
    resolution_event_id TEXT,
    cited_decision_id TEXT,
    previous_status TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    cited_subjects_json TEXT NOT NULL DEFAULT '[]'
  );
CREATE TABLE goal_event_config_versions (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    config_event_id TEXT NOT NULL,
    PRIMARY KEY (project_id, goal_id, version)
  );
CREATE TABLE goal_event_configs (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    current_version INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    PRIMARY KEY (project_id, goal_id)
  );
CREATE TABLE goal_event_decision_requests (
    request_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    question TEXT NOT NULL,
    options_json TEXT NOT NULL,
    scope_json TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'suggestion' CHECK (purpose IN ('suggestion', 'requirement_acceptance', 'action', 'agreement_change')),
    proposed_change_json TEXT,
    commitment_json TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'decided')),
    created_at TEXT NOT NULL
  );
CREATE TABLE goal_event_progress_summaries (
    summary_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    summary_text TEXT NOT NULL,
    based_on_cursor INTEGER NOT NULL,
    next_step TEXT,
    next_actor TEXT,
    actor_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );
CREATE TABLE goal_event_requirement_bindings (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    type_id TEXT NOT NULL,
    requirement_id TEXT NOT NULL,
    created_in_config_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (project_id, goal_id, type_id, requirement_id)
  );
CREATE TABLE goal_event_state_owners (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    owner TEXT NOT NULL CHECK (owner = 'event_work'),
    source TEXT NOT NULL CHECK (source IN ('intent', 'configuration', 'continue')),
    adopted_at TEXT NOT NULL,
    adopted_by TEXT NOT NULL,
    PRIMARY KEY (goal_id)
  );
CREATE TABLE goal_event_types (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    type_id TEXT NOT NULL,
    type_version INTEGER NOT NULL,
    name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    semantic_family TEXT,
    source_json TEXT NOT NULL,
    fields_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_in_config_version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    PRIMARY KEY (project_id, goal_id, type_id, type_version)
  );
CREATE TABLE goal_event_work_status (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    work_status TEXT NOT NULL CHECK (work_status IN ('open', 'completed', 'cancelled')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (goal_id)
  );
CREATE TABLE goal_relations (
    relation_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    from_goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    to_goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    type TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('proposed', 'active', 'inactive')),
    reason TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deactivated_at TEXT
  );
CREATE TABLE goal_requirement_links (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    requirement_id TEXT NOT NULL,
    origin_json TEXT,
    created_in_config_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (project_id, goal_id, requirement_id)
  );
CREATE TABLE goal_trash_records (
    trash_record_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    trashed_at TEXT NOT NULL,
    trashed_by TEXT NOT NULL,
    trash_reason TEXT NOT NULL,
    restored_at TEXT,
    restored_by TEXT,
    restore_reason TEXT
  );
CREATE TABLE goal_trash_relation_records (
    trash_record_id TEXT NOT NULL REFERENCES goal_trash_records(trash_record_id) ON DELETE CASCADE,
    relation_id TEXT NOT NULL REFERENCES goal_relations(relation_id) ON DELETE CASCADE,
    prior_state TEXT NOT NULL CHECK (prior_state = 'active'),
    deactivated_at TEXT NOT NULL,
    restored_at TEXT,
    PRIMARY KEY (trash_record_id, relation_id)
  );
CREATE TABLE goal_tree_item_effects (
    effect_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    proposal_id TEXT NOT NULL REFERENCES goal_tree_proposals(proposal_id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES goal_tree_proposal_items(item_id) ON DELETE CASCADE,
    approval_id TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('confirmed', 'rejected', 'revised', 'conflict')),
    runtime_actor_id TEXT,
    reason TEXT NOT NULL,
    revision_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
    materialized_objects_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
CREATE TABLE goal_tree_proposal_items (
    item_id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL REFERENCES goal_tree_proposals(proposal_id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('goal', 'relation')),
    operation TEXT NOT NULL CHECK (operation IN ('create', 'deactivate')),
    payload_json TEXT NOT NULL,
    source_refs_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    explanation_json TEXT,
    confidence REAL NOT NULL,
    affected_objects_json TEXT NOT NULL,
    baseline_versions_json TEXT NOT NULL,
    requires_user_confirmation INTEGER NOT NULL DEFAULT 1,
    state TEXT NOT NULL CHECK (state IN ('pending', 'conflict', 'superseded', 'approved', 'applied', 'rejected', 'dismissed')),
    conflict_json TEXT,
    materialized_objects_json TEXT NOT NULL DEFAULT '[]',
    revision_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
    supersedes_item_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(proposal_id, ordinal)
  );
CREATE TABLE goal_tree_proposals (
    proposal_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    root_goal_id TEXT REFERENCES goals(goal_id) ON DELETE SET NULL,
    submitted_by TEXT NOT NULL,
    submitted_session_id TEXT,
    state TEXT NOT NULL CHECK (state IN ('pending', 'superseded', 'approved', 'partially_applied', 'rejected', 'dismissed', 'closed')),
    version INTEGER NOT NULL,
    supersedes_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
    base_event_cursor INTEGER NOT NULL,
    summary TEXT NOT NULL,
    narrative_json TEXT,
    decision_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    decided_at TEXT
  );
CREATE TABLE goal_work_events (
    event_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('configuration', 'report', 'system')),
    type_id TEXT,
    type_version INTEGER,
    title TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_kind TEXT,
    received_at TEXT NOT NULL,
    journal_seq INTEGER NOT NULL,
    config_version INTEGER
  );
CREATE TABLE goals (
    goal_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    outcome TEXT NOT NULL,
    why TEXT NOT NULL,
    business_logic TEXT NOT NULL,
    in_scope_json TEXT NOT NULL DEFAULT '[]',
    out_of_scope_json TEXT NOT NULL DEFAULT '[]',
    constraints_json TEXT NOT NULL DEFAULT '[]',
    required_inputs_json TEXT NOT NULL DEFAULT '[]',
    promised_outputs_json TEXT NOT NULL DEFAULT '[]',
    decomposition_review_json TEXT,
    definition_state TEXT NOT NULL CHECK (definition_state IN ('draft', 'accepted')),
    decomposition_state TEXT NOT NULL CHECK (decomposition_state IN ('abstract', 'frontier_open', 'closed_leaf', 'closed_compound')),
    validity_state TEXT NOT NULL CHECK (validity_state IN ('valid', 'needs_revalidation', 'invalidated')),
    fulfillment_state TEXT NOT NULL CHECK (fulfillment_state IN ('unmet', 'satisfied')),
    trashed_at TEXT,
    trashed_by TEXT,
    archived_at TEXT,
    archived_by TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    accepted_by TEXT,
    accepted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE guidance_entries (
  guidance_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  kind TEXT NOT NULL CHECK (kind IN ('context', 'requirement', 'constraint', 'convention', 'workflow', 'quality_bar')),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  confirmation_summary TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, position),
  UNIQUE(project_id, kind, content_hash)
);
CREATE TABLE guidance_revisions (
  revision_id TEXT PRIMARY KEY,
  guidance_id TEXT NOT NULL REFERENCES guidance_entries(guidance_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('context', 'requirement', 'constraint', 'convention', 'workflow', 'quality_bar')),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  changed_by TEXT NOT NULL,
  change_kind TEXT NOT NULL CHECK (change_kind IN ('created', 'edited', 'deactivated', 'restored')),
  confirmation_summary TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(guidance_id, revision)
);
CREATE TABLE idempotency_records (
          project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
          actor_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          outcome_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (project_id, actor_id, operation, idempotency_key)
        );
CREATE TABLE inbox_scene_bindings (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      scene_id TEXT NOT NULL,
      action_binding_json TEXT NOT NULL,
      binding_revision TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, scene_id)
    );
CREATE TABLE input_bindings (
    binding_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    input_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    source_edge_key TEXT,
    snapshot_digest TEXT,
    state TEXT NOT NULL CHECK (state IN ('proposed', 'confirmed', 'inactive')),
    reason TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
CREATE TABLE library_artifact_versions (
    artifact_id TEXT NOT NULL REFERENCES library_artifacts(artifact_id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    artifact_type_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    producer_plugin_version TEXT NOT NULL,
    content_kind TEXT NOT NULL CHECK (content_kind IN ('inline', 'reference')),
    payload_json TEXT,
    content_ref TEXT,
    content_digest TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    metadata_json TEXT NOT NULL DEFAULT '{}',
    scope TEXT NOT NULL CHECK (scope IN ('personal', 'team_project')),
    availability TEXT NOT NULL CHECK (availability IN ('available', 'unavailable')),
    unavailable_reason TEXT,
    lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('active', 'archived')),
    supersedes_version INTEGER,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    archived_at TEXT,
    archived_by TEXT,
    origin_json TEXT NOT NULL,
    title TEXT NOT NULL CHECK (length(title) > 0),
    media_type TEXT NOT NULL,
    trace_json TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (artifact_id, version),
    FOREIGN KEY (artifact_id, supersedes_version)
      REFERENCES library_artifact_versions(artifact_id, version),
    CHECK (
      (content_kind = 'inline' AND payload_json IS NOT NULL AND content_ref IS NULL)
      OR (content_kind = 'reference' AND payload_json IS NULL AND content_ref IS NOT NULL)
    )
  );
CREATE TABLE library_artifacts (
    artifact_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
    owner_actor_id TEXT NOT NULL,
    producer_plugin_id TEXT NOT NULL,
    producer_binding_signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (artifact_id, project_id)
  );
CREATE TABLE listener_deliveries (
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
CREATE TABLE listener_instances (
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
CREATE TABLE material_recent_uses (
  caller_kind TEXT NOT NULL CHECK (caller_kind IN ('user', 'plugin')),
  caller_id TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  ref_json TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  used_at TEXT NOT NULL,
  PRIMARY KEY (caller_kind, caller_id, subject_kind, subject_id)
);
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE opaque_blobs (
    namespace TEXT NOT NULL, key TEXT NOT NULL, opaque TEXT NOT NULL, cas_token TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
  );
CREATE TABLE plugin_event_cursors (
      project_id TEXT NOT NULL,
      subscriber_plugin_id TEXT NOT NULL,
      subscriber_install_id TEXT NOT NULL,
      subscriber_generation TEXT NOT NULL,
      revision TEXT NOT NULL DEFAULT '',
      source_plugin_id TEXT NOT NULL,
      event_type_id TEXT NOT NULL,
      type_version INTEGER NOT NULL,
      delivered_sequence INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL,
      retry_at TEXT,
      last_error_code TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, subscriber_plugin_id, subscriber_install_id, subscriber_generation, source_plugin_id, event_type_id, type_version)
    );
CREATE TABLE plugin_event_resolutions (
      resolution_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, subscriber_plugin_id TEXT NOT NULL, record_json TEXT NOT NULL
    );
CREATE TABLE plugin_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      event_type_id TEXT NOT NULL,
      type_version INTEGER NOT NULL,
      source_plugin_id TEXT NOT NULL,
      source_install_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      correlation_id TEXT,
      occurred_at TEXT NOT NULL
    );
CREATE TABLE plugin_input_groups (
      project_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id)
    );
CREATE TABLE plugin_notifications (
      notification_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      sender_plugin_id TEXT NOT NULL,
      sender_install_id TEXT NOT NULL,
      sender_generation TEXT NOT NULL,
      key TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      body TEXT NOT NULL,
      open_plugin_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      delivered_at TEXT,
      item_id TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT,
      UNIQUE (sender_install_id, sender_generation, key)
    );
CREATE TABLE plugin_port_artifact_bindings (
      project_id TEXT NOT NULL,
      target_plugin_id TEXT NOT NULL,
      target_port TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, target_plugin_id, target_port)
    );
CREATE TABLE plugin_port_bindings (
      project_id TEXT NOT NULL,
      target_plugin_id TEXT NOT NULL,
      target_port TEXT NOT NULL,
      source_plugin_id TEXT NOT NULL,
      source_port TEXT NOT NULL,
      origin TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, target_plugin_id, target_port)
    );
CREATE TABLE plugin_port_outputs (
      project_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      port TEXT NOT NULL,
      artifact_id TEXT,
      version INTEGER,
      invalidated_reason TEXT,
      scope_key TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id, port)
    );
CREATE TABLE plugin_private_values (
      install_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      item_value TEXT NOT NULL,
      PRIMARY KEY (install_id, item_key)
    );
CREATE TABLE plugin_project_databases (
      plugin_id TEXT PRIMARY KEY,
      publisher_signature TEXT NOT NULL,
      store_name TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL CHECK (version >= 1),
      tables_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
CREATE TABLE plugin_runtime_installs (install_id TEXT PRIMARY KEY, record_json TEXT NOT NULL,
      publisher_trust TEXT NOT NULL CHECK (publisher_trust IN ('host', 'pinned', 'unsigned')));
CREATE TABLE plugin_runtime_release_artifacts (
      plugin_id TEXT NOT NULL,
      publisher_signature TEXT NOT NULL,
      version TEXT NOT NULL,
      manifest_digest TEXT NOT NULL,
      artifact_json TEXT NOT NULL,
      PRIMARY KEY (plugin_id, publisher_signature, version, manifest_digest)
    );
CREATE TABLE process_item_versions (
    artifact_id TEXT NOT NULL REFERENCES process_items(artifact_id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    artifact_type_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    producer_plugin_version TEXT NOT NULL,
    content_kind TEXT NOT NULL CHECK (content_kind IN ('inline', 'reference')),
    payload_json TEXT,
    content_ref TEXT,
    content_digest TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    metadata_json TEXT NOT NULL DEFAULT '{}',
    scope TEXT NOT NULL CHECK (scope IN ('personal', 'team_project')),
    availability TEXT NOT NULL CHECK (availability IN ('available', 'unavailable')),
    unavailable_reason TEXT,
    lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('active', 'archived')),
    supersedes_version INTEGER,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    archived_at TEXT,
    archived_by TEXT,
    PRIMARY KEY (artifact_id, version),
    FOREIGN KEY (artifact_id, supersedes_version)
      REFERENCES process_item_versions(artifact_id, version),
    CHECK (
      (content_kind = 'inline' AND payload_json IS NOT NULL AND content_ref IS NULL)
      OR (content_kind = 'reference' AND payload_json IS NULL AND content_ref IS NOT NULL)
    )
  );
CREATE TABLE process_items (
    artifact_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
    owner_actor_id TEXT NOT NULL,
    producer_plugin_id TEXT NOT NULL,
    producer_binding_signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (artifact_id, project_id)
  );
CREATE TABLE process_items_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE process_items_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE process_items_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE process_items_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE process_items_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE process_items_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE project_approval_rules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
  scope_json TEXT NOT NULL CHECK (json_valid(scope_json)),
  rule_order INTEGER NOT NULL CHECK (rule_order > 0),
  requires_person INTEGER CHECK (requires_person IN (0, 1)),
  revision INTEGER NOT NULL CHECK (revision > 0),
  state TEXT NOT NULL CHECK (state IN ('active', 'replaced', 'withdrawn')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  changed_by TEXT,
  changed_at TEXT,
  change_reason TEXT,
  CHECK ((changed_by IS NULL) = (changed_at IS NULL)),
  CHECK ((changed_at IS NULL) = (change_reason IS NULL))
);
CREATE TABLE project_approvals_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE project_approvals_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE project_approvals_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE project_approvals_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE project_approvals_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE project_approvals_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE project_guidance_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE project_guidance_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE project_guidance_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE project_guidance_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE project_guidance_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE project_guidance_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE project_review_decisions (
  decision_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
  request_id TEXT,
  request_key TEXT,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  recorded_at TEXT NOT NULL,
  CHECK ((request_id IS NULL) = (request_key IS NULL)),
  UNIQUE(project_id, request_id),
  UNIQUE(project_id, request_key)
);
CREATE TABLE project_root (
      project_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
CREATE TABLE project_runtime_setting_receipts (
    project_id TEXT NOT NULL, actor_id TEXT NOT NULL, request_id TEXT NOT NULL,
    request_json TEXT NOT NULL, result_json TEXT NOT NULL,
    PRIMARY KEY (project_id, actor_id, request_id)
  );
CREATE TABLE project_runtime_settings (project_id TEXT PRIMARY KEY, runtime_id TEXT, revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE risk_editor_versions (risk_id TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE risk_events (
      event_id TEXT PRIMARY KEY,
      risk_id TEXT NOT NULL REFERENCES risk_items(risk_id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('created', 'updated', 'status', 'note', 'linked', 'unlinked')),
      detail_json TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      at TEXT NOT NULL
    );
CREATE TABLE risk_items (
      risk_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      statement TEXT NOT NULL,
      impact TEXT NOT NULL CHECK (impact IN ('high', 'medium', 'low')),
      likelihood TEXT NOT NULL CHECK (likelihood IN ('high', 'medium', 'low')),
      treatment TEXT NOT NULL,
      owner_name TEXT,
      status TEXT NOT NULL CHECK (status IN ('open', 'mitigating', 'accepted', 'closed')),
      revision INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT
    );
CREATE TABLE risk_links (
      risk_id TEXT NOT NULL REFERENCES risk_items(risk_id) ON DELETE CASCADE,
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      added_by TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (risk_id, subject_kind, subject_id)
    );
CREATE TABLE schedule_action_bindings (
  job_id TEXT PRIMARY KEY REFERENCES schedule_jobs(job_id) ON DELETE CASCADE,
  install_id TEXT NOT NULL,
  installation_generation TEXT NOT NULL,
  action_version INTEGER NOT NULL CHECK (action_version > 0)
);
CREATE TABLE schedule_conversation_tasks (
      task_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL,
      hour INTEGER NOT NULL,
      minute INTEGER NOT NULL,
      notify_important INTEGER NOT NULL CHECK (notify_important IN (0, 1)),
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      unread INTEGER NOT NULL CHECK (unread IN (0, 1)),
      job_id TEXT,
      last_run_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      repeat TEXT NOT NULL DEFAULT 'daily',
      run_at TEXT,
      subject_kind TEXT,
      subject_id TEXT
    );
CREATE TABLE schedule_conversation_turns (
      turn_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('user', 'assistant', 'system')),
      text TEXT NOT NULL,
      important INTEGER NOT NULL CHECK (important IN (0, 1)),
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES schedule_conversation_tasks(task_id)
    );
CREATE TABLE schedule_jobs (
      job_id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      object_ref TEXT NOT NULL,
      title TEXT NOT NULL,
      recurrence_kind TEXT NOT NULL CHECK (recurrence_kind IN ('once', 'interval')),
      interval_ms INTEGER,
      next_due_at TEXT NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      lease_until TEXT,
      lease_token TEXT,
      last_wakeup_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (plugin_id, capability_id, object_ref)
    );
CREATE TABLE schedule_missed_runs (
    project_id TEXT NOT NULL, run_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('task', 'operation', 'reminder')),
    ref TEXT NOT NULL, title TEXT NOT NULL, due_at TEXT NOT NULL, missed_at TEXT NOT NULL,
    decision TEXT CHECK (decision IN ('run_now', 'skip')), decided_at TEXT,
    PRIMARY KEY (project_id, run_id)
  );
CREATE TABLE schedule_operation_occurrences (
    project_id TEXT NOT NULL, operation_id TEXT NOT NULL, due_at TEXT NOT NULL, record_json TEXT NOT NULL,
    PRIMARY KEY (project_id, operation_id, due_at)
  );
CREATE TABLE schedule_operations (
    project_id TEXT NOT NULL, id TEXT NOT NULL, job_id TEXT NOT NULL UNIQUE, record_json TEXT NOT NULL,
    PRIMARY KEY (project_id, id)
  );
CREATE TABLE schedule_plugin_reminders (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, plugin_id TEXT NOT NULL, installation_id TEXT,
    record_json TEXT NOT NULL
  );
CREATE TABLE schedule_wakeups (
      wakeup_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      due_at TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('ok', 'failed', 'plugin_unavailable')),
      detail TEXT,
      FOREIGN KEY (job_id) REFERENCES schedule_jobs(job_id)
    );
CREATE TABLE signal_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('signal.accepted', 'signal.changed')),
      revision INTEGER NOT NULL,
      at TEXT NOT NULL
    );
CREATE TABLE signal_revisions (
      project_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      draft_json TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      PRIMARY KEY (project_id, signal_id, revision)
    );
CREATE TABLE signals (
      project_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      provider_dedupe_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      content_refs_json TEXT NOT NULL DEFAULT '[]',
      raw_event_id TEXT NOT NULL,
      adapter_plugin_id TEXT NOT NULL,
      adapter_version TEXT NOT NULL,
      provenance_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      validation TEXT NOT NULL CHECK (validation = 'accepted'),
      superseded_by TEXT,
      withdrawn_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, signal_id),
      UNIQUE (project_id, source_id, provider_dedupe_id)
    );
CREATE TABLE source_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('source.created', 'source.updated', 'source.status_changed', 'source.retired')),
      payload_json TEXT NOT NULL,
      at TEXT NOT NULL
    );
CREATE TABLE surface_corrections (
    actor_id TEXT NOT NULL,
    slot_key TEXT NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    correction TEXT NOT NULL,
    form TEXT,
    position INTEGER,
    revision INTEGER NOT NULL,
    recorded_at TEXT NOT NULL,
    PRIMARY KEY (actor_id, slot_key, subject_kind, subject_id, correction)
  );
CREATE TABLE surface_corrections_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE surface_corrections_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE surface_corrections_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE surface_corrections_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE surface_corrections_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE surface_corrections_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_57fe6903aad21582fd1bfbdd6011_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_57fe6903aad21582fd1bfbdd6011_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_57fe6903aad21582fd1bfbdd6011_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_57fe6903aad21582fd1bfbdd6011_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_57fe6903aad21582fd1bfbdd6011_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_57fe6903aad21582fd1bfbdd6011_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_57fe6903aad21582fd1bfbdd6011_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_57fe6903aad21582fd1bfbdd6011_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
INSERT INTO "acceptance_decisions"("seq","decision_id","subject_no","clock","requirement_id","requirement_version","stands_round","version","decision","note","origin","origin_ref","actor_id","decided_at") VALUES(1,'1f6e6ab9-fef3-4956-81ca-75792130bec7',5,1,'CORE-C1',1,1,'demo-core-delivery','accepted',NULL,'trusted_decision','1f6e6ab9-fef3-4956-81ca-75792130bec7','demo-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_decisions"("seq","decision_id","subject_no","clock","requirement_id","requirement_version","stands_round","version","decision","note","origin","origin_ref","actor_id","decided_at") VALUES(2,'ecb2a990-35d0-4fc4-b118-e14292442840',9,1,'GRAPH-C1',1,1,'demo-graph-delivery','accepted',NULL,'trusted_decision','ecb2a990-35d0-4fc4-b118-e14292442840','demo-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_deliveries"("seq","subject_no","round","version","summary","touches_json","made_in_session","made_in_run","actor_id","delivered_at") VALUES(1,5,1,'demo-core-delivery','可用的生命周期记录',NULL,NULL,NULL,'demo-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_deliveries"("seq","subject_no","round","version","summary","touches_json","made_in_session","made_in_run","actor_id","delivered_at") VALUES(2,9,1,'demo-graph-delivery','画布关系已经可扫',NULL,NULL,NULL,'demo-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(1,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","V1"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(2,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","PLATFORM"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(3,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","WORKSPACE"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(4,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","ADOPTION"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(5,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","CORE"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(6,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","INTERFACES"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(7,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","RISK"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(8,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","WEB"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(9,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","GRAPH"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(10,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","DESKTOP"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(11,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","DECIDE"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(12,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","RELEASE"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(13,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","ONBOARDING"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(14,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","DOCS"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(15,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","DROPPED"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(16,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","WEB-SCAN"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(17,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","WEB-SCAN-ROW"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(18,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","WEB-SCAN-NEST"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(19,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","AUTO-CONNECT"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(20,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","CORE"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(21,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","CORE"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(22,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","GRAPH"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(23,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","GRAPH"]');
INSERT INTO "acceptance_replica_state"("id","device","cursor","applying") VALUES(1,'3bd9f353d27206ded90df8c604470811',0,0);
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(1,1,'V1-C1',1,'第一次使用的人能从首屏看懂目标、下一步和阻塞',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(2,2,'PLATFORM-C1',1,'不同 Runtime 读取到一致的 Goal 状态与完成依据',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(3,3,'WORKSPACE-C1',1,'用户不切窗口即可从 Goal 进入对应 Runtime',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(4,4,'ADOPTION-C1',1,'首次用户能独立完成一次从安装到推进的闭环',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(5,5,'CORE-C1',1,'工作从约定、报告到收尾形成完整记录',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(6,6,'INTERFACES-C1',1,'不同入口读取到一致的 Goal 状态和下一步',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(7,7,'RISK-C1',1,'公开步骤与当前产品入口一致',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(8,8,'WEB-C1',1,'桌面和移动端关键信息清楚可用',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(9,9,'GRAPH-C1',1,'复杂网络中的关系方向和阻塞节点可以直接辨认',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(10,10,'DESKTOP-C1',1,'桌面端三栏在宽屏下形成完整工作闭环',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(11,11,'DECIDE-C1',1,'首次打开有唯一默认落点',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(12,12,'RELEASE-C1',1,'安装、接入和重启提示可以按公开步骤重复完成',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(13,13,'ONBOARDING-C1',1,'首次用户无需外部讲解即可推进第一条 Goal',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(14,14,'DOCS-C1',1,'README 清楚表达痛点、边界、闭环与多种使用方式',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(15,15,'DROPPED-C1',1,'当前会话立即出现 Molis Work 工具',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(16,16,'WEB-SCAN-C1',1,'首屏列表能同时看到当前目标、状态和阻塞',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(17,17,'WEB-SCAN-ROW-C1',1,'子标题随深度右移，状态列不随深度移动',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(18,18,'WEB-SCAN-NEST-C1',1,'第五层标题比第四层更靠右',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_requirements"("seq","subject_no","requirement_id","version","statement","expected","part","requires_person","withdrawn","position","by_person","actor_id","created_at") VALUES(19,19,'AUTO-CONNECT-C1',1,'新对话无需确认就进入历史项目',NULL,NULL,0,0,0,0,'web-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(1,'molis-work-v1-demo','io.molis.work.goals','goal','V1','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(2,'molis-work-v1-demo','io.molis.work.goals','goal','PLATFORM','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(3,'molis-work-v1-demo','io.molis.work.goals','goal','WORKSPACE','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(4,'molis-work-v1-demo','io.molis.work.goals','goal','ADOPTION','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(5,'molis-work-v1-demo','io.molis.work.goals','goal','CORE','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(6,'molis-work-v1-demo','io.molis.work.goals','goal','INTERFACES','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(7,'molis-work-v1-demo','io.molis.work.goals','goal','RISK','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(8,'molis-work-v1-demo','io.molis.work.goals','goal','WEB','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(9,'molis-work-v1-demo','io.molis.work.goals','goal','GRAPH','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(10,'molis-work-v1-demo','io.molis.work.goals','goal','DESKTOP','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(11,'molis-work-v1-demo','io.molis.work.goals','goal','DECIDE','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(12,'molis-work-v1-demo','io.molis.work.goals','goal','RELEASE','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(13,'molis-work-v1-demo','io.molis.work.goals','goal','ONBOARDING','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(14,'molis-work-v1-demo','io.molis.work.goals','goal','DOCS','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(15,'molis-work-v1-demo','io.molis.work.goals','goal','DROPPED','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(16,'molis-work-v1-demo','io.molis.work.goals','goal','WEB-SCAN','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(17,'molis-work-v1-demo','io.molis.work.goals','goal','WEB-SCAN-ROW','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(18,'molis-work-v1-demo','io.molis.work.goals','goal','WEB-SCAN-NEST','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_subjects"("subject_no","project_id","provider_id","subject_kind","subject_id","created_at") VALUES(19,'molis-work-v1-demo','io.molis.work.goals','goal','AUTO-CONNECT','2026-01-15T09:00:00.000Z');
INSERT INTO "artifacts_replica_changes"("seq","key") VALUES(1,'["molis-work-v1-demo","artifact","demo/core-lifecycle-record"]');
INSERT INTO "artifacts_replica_changes"("seq","key") VALUES(2,'["molis-work-v1-demo","artifact","demo/core-lifecycle-record"]');
INSERT INTO "artifacts_replica_changes"("seq","key") VALUES(3,'["molis-work-v1-demo","artifact","demo/core-lifecycle-record"]');
INSERT INTO "artifacts_replica_changes"("seq","key") VALUES(4,'["molis-work-v1-demo","artifact","feed-capture:feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1:feedoutrule-4a10e769-0757-416b-80c3-13dc5debce20"]');
INSERT INTO "artifacts_replica_changes"("seq","key") VALUES(5,'["molis-work-v1-demo","artifact","feed-capture:feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1:feedoutrule-4a10e769-0757-416b-80c3-13dc5debce20"]');
INSERT INTO "artifacts_replica_state"("id","device","cursor","applying") VALUES(1,'e06f0f28f286226e0bf7c130daa5c634',0,0);
INSERT INTO "attention_entries"("project_id","entry_id","owner_plugin_id","subject_type","subject_id","reason","status","detail_json","revision","created_at","updated_at","completed_at") VALUES('molis-work-v1-demo','inboxentry-001e446d-537b-4f9f-b492-c316da26da0e','io.molis.work.feed','source_fault','demo-gmail','source_fault','open','{"error_code":"feed.auth_required","user_action":"连接 Gmail 后重新同步。未授权前只保留这条故障引用。"}',1,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "attention_entries"("project_id","entry_id","owner_plugin_id","subject_type","subject_id","reason","status","detail_json","revision","created_at","updated_at","completed_at") VALUES('molis-work-v1-demo','inboxentry-29ed4a11-62f0-45c4-8bde-12ca4ed919b9','io.molis.work.feed','feed_item','feeditem-c495e9ec-4969-49ec-8776-0cb00c4c29c3','source_rule','open','{"source_id":"demo-github"}',1,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "attention_entries"("project_id","entry_id","owner_plugin_id","subject_type","subject_id","reason","status","detail_json","revision","created_at","updated_at","completed_at") VALUES('molis-work-v1-demo','inboxentry-30acabe0-041e-4956-969d-b5f0c97518e9','io.molis.work.feed','feed_item','feeditem-d1a7e891-f364-4dca-b7a9-9db59edeb5cf','manual','dismissed','{}',2,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_entries"("project_id","entry_id","owner_plugin_id","subject_type","subject_id","reason","status","detail_json","revision","created_at","updated_at","completed_at") VALUES('molis-work-v1-demo','inboxentry-d31789fd-6997-4899-9116-d0625bc7d051','io.molis.work.feed','feed_item','feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1','manual','open','{"added_by":"web_user"}',1,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "attention_entries"("project_id","entry_id","owner_plugin_id","subject_type","subject_id","reason","status","detail_json","revision","created_at","updated_at","completed_at") VALUES('molis-work-v1-demo','inboxentry-f6ba5a18-e2b2-482d-848f-a6f2d207cf3b','io.molis.work.feed','feed_item','feeditem-a65d6e25-ac10-4f25-a10f-ffea94720077','manual','done','{}',2,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_events"("event_id","project_id","entry_id","owner_plugin_id","type","subject_type","subject_id","at") VALUES('attention-event-2a28924e-e1db-4d66-ab77-dc6c85e7bf0f','molis-work-v1-demo','inboxentry-f6ba5a18-e2b2-482d-848f-a6f2d207cf3b','io.molis.work.feed','attention_entry.done','feed_item','feeditem-a65d6e25-ac10-4f25-a10f-ffea94720077','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_events"("event_id","project_id","entry_id","owner_plugin_id","type","subject_type","subject_id","at") VALUES('attention-event-2d2bdca9-f5a9-4bc2-9005-4c2c025b8462','molis-work-v1-demo','inboxentry-30acabe0-041e-4956-969d-b5f0c97518e9','io.molis.work.feed','attention_entry.dismissed','feed_item','feeditem-d1a7e891-f364-4dca-b7a9-9db59edeb5cf','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_events"("event_id","project_id","entry_id","owner_plugin_id","type","subject_type","subject_id","at") VALUES('attention-event-346ab569-02c4-4998-9086-5782c8e68ebf','molis-work-v1-demo','inboxentry-d31789fd-6997-4899-9116-d0625bc7d051','io.molis.work.feed','attention_entry.created','feed_item','feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_events"("event_id","project_id","entry_id","owner_plugin_id","type","subject_type","subject_id","at") VALUES('attention-event-56362a8a-24a0-44a8-a5f3-02aafa146390','molis-work-v1-demo','inboxentry-30acabe0-041e-4956-969d-b5f0c97518e9','io.molis.work.feed','attention_entry.created','feed_item','feeditem-d1a7e891-f364-4dca-b7a9-9db59edeb5cf','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_events"("event_id","project_id","entry_id","owner_plugin_id","type","subject_type","subject_id","at") VALUES('attention-event-65d85016-594a-4ede-8f90-ad982276526f','molis-work-v1-demo','inboxentry-f6ba5a18-e2b2-482d-848f-a6f2d207cf3b','io.molis.work.feed','attention_entry.created','feed_item','feeditem-a65d6e25-ac10-4f25-a10f-ffea94720077','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_events"("event_id","project_id","entry_id","owner_plugin_id","type","subject_type","subject_id","at") VALUES('attention-event-ae6ae366-8595-43b7-bf1c-289d27c6fda5','molis-work-v1-demo','inboxentry-001e446d-537b-4f9f-b492-c316da26da0e','io.molis.work.feed','attention_entry.created','source_fault','demo-gmail','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_events"("event_id","project_id","entry_id","owner_plugin_id","type","subject_type","subject_id","at") VALUES('attention-event-c3800b97-cb7c-4667-8e63-f2ac2ff8bcdd','molis-work-v1-demo','inboxentry-29ed4a11-62f0-45c4-8bde-12ca4ed919b9','io.molis.work.feed','attention_entry.created','feed_item','feeditem-c495e9ec-4969-49ec-8776-0cb00c4c29c3','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_replica_changes"("seq","key") VALUES(1,'["molis-work-v1-demo","project_attention","molis-work-v1-demo"]');
INSERT INTO "attention_replica_state"("id","device","cursor","applying") VALUES(1,'d4e559e5ea8e3d2990fef8433b731eed',0,0);
INSERT INTO "boards"("project_id","active_goal_id","created_at","updated_at") VALUES('molis-work-v1-demo','V1','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "builder_replica_state"("id","device","cursor","applying") VALUES(1,'6e0ffb686e314e9d9273e7b514aac0f8',0,0);
INSERT INTO "context_edges"("scope_kind","scope_id","edge_key","revision","relation_type","source_json","target_json","actor_id","cause","recorded_at","state") VALUES('personal','molis-work-v1-demo','io.molis.work.goals:goal.output:CORE:["demo/core-lifecycle-record",2]',1,'goal.output','{"module":"plugins","plugin_id":"io.molis.work.goals","object_type":"goal","id":"CORE","version":null,"scope":{"kind":"personal","id":"molis-work-v1-demo"}}','{"module":"artifacts","id":"demo/core-lifecycle-record","version":2,"scope":{"kind":"personal","id":"molis-work-v1-demo"}}','demo-user','goals.deliverable','2026-01-15T09:00:00.000Z','active');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(1,'event:artifact:demo/core-lifecycle-record:1:registered','molis-work-v1-demo','demo-user','artifact.published','artifact','demo/core-lifecycle-record@1','Plugin 发布了成果','{"artifact_id":"demo/core-lifecycle-record","version":1,"artifact_type_id":"io.molis.work.document","schema_version":2,"scope":"personal","content_digest":"sha256:ed13d996053ecdf96834908c38ab3f29bb5fcb025d78a8c6637c89ad369a25b9"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(2,'event:artifact:demo/core-lifecycle-record:2:registered','molis-work-v1-demo','demo-user','artifact.version_registered','artifact','demo/core-lifecycle-record@2','Plugin 注册了新的成果版本','{"artifact_id":"demo/core-lifecycle-record","version":2,"artifact_type_id":"io.molis.work.document","schema_version":2,"scope":"personal","content_digest":"sha256:fa22a2ebab3f7427680667dd56516e60bff3ec43c66514cb29e4b1dc784c2846"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(3,'7a424923-8a95-4611-8a7c-19f842641326','molis-work-v1-demo','web-user','io.molis.work.goals:board.created','io.molis.work.goals:board','molis-work-v1-demo','创建 Molis Work 真相源','{}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(4,'730c414d-642f-487f-b9bc-01ff09d7bd7e','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','V1','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(5,'gevt-b17097e5-e994-4152-afdb-f7c079fafd09','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-b17097e5-e994-4152-afdb-f7c079fafd09','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(6,'e9bfb814-92ec-4fc7-9195-9e4ccb81b8d2','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','PLATFORM','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(7,'gevt-959dab8c-3baf-45da-8b2f-92ac1e44476b','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-959dab8c-3baf-45da-8b2f-92ac1e44476b','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(8,'1b3a55d5-bc7e-4e2f-9de1-ddb8d875abc6','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-591512e4-512f-4b37-92a0-1fa3ff79f91f','创建 Goal 时指定上级 Goal','{"from_goal_id":"PLATFORM","to_goal_id":"V1","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(9,'bd978d75-75cd-45e2-8dab-86e5e9df3ccb','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','WORKSPACE','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(10,'gevt-c98dec1a-c2e2-4bce-8055-e6239a80345c','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-c98dec1a-c2e2-4bce-8055-e6239a80345c','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(11,'bc22e0cc-d862-49d9-ada7-cd846d71035b','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-8588994e-4a0c-4b34-83dd-1835312b7598','创建 Goal 时指定上级 Goal','{"from_goal_id":"WORKSPACE","to_goal_id":"V1","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(12,'6a36cd14-b17f-466c-a2d0-3808d1d8ca34','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','ADOPTION','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(13,'gevt-1cefb09f-88f6-44a7-be61-c9788dab8c23','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-1cefb09f-88f6-44a7-be61-c9788dab8c23','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(14,'1d4b7c26-767c-45ad-a997-bc63c0839f90','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-9b1f993a-b73e-4221-bd76-5b8180a154e9','创建 Goal 时指定上级 Goal','{"from_goal_id":"ADOPTION","to_goal_id":"V1","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(15,'c7b2de8a-e1fd-4979-a1a4-cbfe7d699496','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','CORE','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(16,'gevt-01b82b4d-4c47-47f9-aee7-cd47c51dade3','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-01b82b4d-4c47-47f9-aee7-cd47c51dade3','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(17,'7f260919-c3de-4367-bd48-ed1c7f8df05b','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-154659ed-b0a7-40a4-85ee-e2dd1c502fde','创建 Goal 时指定上级 Goal','{"from_goal_id":"CORE","to_goal_id":"PLATFORM","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(18,'214fed0c-9697-49df-a29e-d41f96d4a98c','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','INTERFACES','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(19,'gevt-e9f219af-5ae6-497c-ac31-c9c6786fd276','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-e9f219af-5ae6-497c-ac31-c9c6786fd276','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(20,'0496ec7b-f7bf-47d9-8eee-3aafa27ba2b1','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-979ed680-2b58-4096-8304-45f5db94d978','创建 Goal 时指定上级 Goal','{"from_goal_id":"INTERFACES","to_goal_id":"PLATFORM","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(21,'2cddb044-1ade-43ea-be2f-6d4fc80617b3','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-48959c7e-fdf4-464a-8a4c-187f88d8743e','创建 Goal 时指定上游依赖','{"from_goal_id":"INTERFACES","to_goal_id":"CORE","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(22,'909e5f80-90f8-4263-b1c5-b0ad8557f754','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','RISK','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(23,'gevt-5e9f70e8-25cc-4ce3-9651-68960ebdfe5d','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-5e9f70e8-25cc-4ce3-9651-68960ebdfe5d','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(24,'1bac7abf-45d9-43fe-bc3d-8c183ae78be3','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-1e8000c8-517b-4cf1-8dea-15168e23a80b','创建 Goal 时指定上级 Goal','{"from_goal_id":"RISK","to_goal_id":"PLATFORM","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(25,'c57033cf-43b9-4b19-9033-163900fc7068','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-69962227-d655-4eec-8304-91516ab6f9d4','创建 Goal 时指定上游依赖','{"from_goal_id":"RISK","to_goal_id":"INTERFACES","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(26,'f8c31e87-76a4-4156-b9ce-7ee56ff19e15','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','WEB','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(27,'gevt-1020c368-8ac6-40ff-91bc-ab332cef5627','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-1020c368-8ac6-40ff-91bc-ab332cef5627','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(28,'add069ce-2516-43fb-bbe7-f01a90f4c5c5','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-af85d178-92be-4804-a8e5-888eda9ee12f','创建 Goal 时指定上级 Goal','{"from_goal_id":"WEB","to_goal_id":"WORKSPACE","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(29,'48eafba6-ca99-4f70-a299-2937bcc54e17','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-787cf33b-945d-4f26-bdaf-6744275cf75a','创建 Goal 时指定上游依赖','{"from_goal_id":"WEB","to_goal_id":"INTERFACES","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(30,'c11a33f0-6f43-4792-919c-02e4cd2200f6','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','GRAPH','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(31,'gevt-0effcce4-7849-465a-b8b7-91087b092e64','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-0effcce4-7849-465a-b8b7-91087b092e64','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(32,'c3e8cf49-93d7-4ac6-a7fc-3ed1c26bae1e','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-0768608b-50b3-4261-9497-835e6c1bef14','创建 Goal 时指定上级 Goal','{"from_goal_id":"GRAPH","to_goal_id":"WORKSPACE","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(33,'98c07db2-0980-4553-8985-5ea8ffc88173','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-ba1e269d-18b3-4e04-b25d-3a23d0d16cfa','创建 Goal 时指定上游依赖','{"from_goal_id":"GRAPH","to_goal_id":"CORE","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(34,'736982c3-873c-4699-a45f-d5089e707366','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','DESKTOP','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(35,'gevt-7fa14ca5-791b-4165-ab2a-0f3e27cd7f75','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-7fa14ca5-791b-4165-ab2a-0f3e27cd7f75','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(36,'f8cf3343-2115-486c-ba64-8199635b0e4f','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-b987903a-159f-4124-a601-38f7162d08ab','创建 Goal 时指定上级 Goal','{"from_goal_id":"DESKTOP","to_goal_id":"WORKSPACE","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(37,'a85679e7-16c8-4f11-869b-ae12e04ba7bf','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-079a08ff-ab7a-4db9-b126-e72cf5465f09','创建 Goal 时指定上游依赖','{"from_goal_id":"DESKTOP","to_goal_id":"CORE","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(38,'b15b4555-6cea-40af-9067-da5a7a35e880','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','DECIDE','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(39,'gevt-9d1f24a1-e02f-4461-be2f-d93bdcb61775','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-9d1f24a1-e02f-4461-be2f-d93bdcb61775','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(40,'372edf89-b3f5-4395-aa94-9e17659f01ec','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-4db9ca93-63cd-4e3f-8a38-8570323a41fc','创建 Goal 时指定上级 Goal','{"from_goal_id":"DECIDE","to_goal_id":"WORKSPACE","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(41,'eacceefb-fb80-4a05-b21a-84ad93bc7409','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-9fe341f0-cb19-47c4-987b-f5bf700f59a9','创建 Goal 时指定上游依赖','{"from_goal_id":"DECIDE","to_goal_id":"DESKTOP","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(42,'c7ea5c32-9b51-405c-b318-3748db444dbb','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','RELEASE','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(43,'gevt-82db81e8-e18d-44b7-b01b-43d4d04ba87f','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-82db81e8-e18d-44b7-b01b-43d4d04ba87f','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(44,'13ff59cb-9eff-4616-9b0c-7629933d3d83','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-be3bb064-a8a0-4b59-9e37-576ad4394467','创建 Goal 时指定上级 Goal','{"from_goal_id":"RELEASE","to_goal_id":"ADOPTION","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(45,'b3cd4cfc-8afc-42ce-a644-82d52a3a6440','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','ONBOARDING','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(46,'gevt-a3c0c41b-480f-4221-b1f9-9b29bb207521','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-a3c0c41b-480f-4221-b1f9-9b29bb207521','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(47,'c7d7c7b8-8e1e-4d0c-a5fe-a354dc1409e3','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-7dfb5206-8e27-46a6-8bbd-b4d0755882d8','创建 Goal 时指定上级 Goal','{"from_goal_id":"ONBOARDING","to_goal_id":"ADOPTION","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(48,'5b74e22a-6b96-455f-b761-893fec5ff850','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-2702625d-407c-427f-82e2-8c83708e0ec6','创建 Goal 时指定上游依赖','{"from_goal_id":"ONBOARDING","to_goal_id":"RELEASE","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(49,'4908f046-f16d-450c-9cc3-1e693afa089b','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','DOCS','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(50,'gevt-dc8a197d-3309-4fb3-a8db-20be76216867','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-dc8a197d-3309-4fb3-a8db-20be76216867','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(51,'c8e10896-67fe-44d2-91ab-ee95eb0f0138','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-9145cfbe-cdd4-413c-b409-d41891579308','创建 Goal 时指定上级 Goal','{"from_goal_id":"DOCS","to_goal_id":"ADOPTION","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(52,'0ce4bda0-8883-4888-acaf-fe3eb9815d37','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-0208ba4c-102b-45bf-b185-b78aa6e8e912','创建 Goal 时指定上游依赖','{"from_goal_id":"DOCS","to_goal_id":"ONBOARDING","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(53,'5ee3ee3c-4399-430f-b869-cc422ac8337b','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','DROPPED','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(54,'gevt-ed48dd22-43cc-4385-b24b-672a1afbb03b','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-ed48dd22-43cc-4385-b24b-672a1afbb03b','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(55,'db0ae465-671c-4e12-89e0-a8872487054c','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-8c653cea-a34c-4108-86a6-6496d1a92909','创建 Goal 时指定上级 Goal','{"from_goal_id":"DROPPED","to_goal_id":"ADOPTION","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(56,'3e67f2bb-0ef8-41ba-b005-66f5bb1d580f','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','WEB-SCAN','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(57,'gevt-ab60d9e8-4b4d-4235-951d-8b96a61424c1','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-ab60d9e8-4b4d-4235-951d-8b96a61424c1','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(58,'f192cbff-c44a-4b3c-aeaf-b22bf2a1def6','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-d4ad0701-4fb1-4cf7-8988-1cf4bcb741fe','创建 Goal 时指定上级 Goal','{"from_goal_id":"WEB-SCAN","to_goal_id":"WEB","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(59,'4740641a-aa40-475d-84bb-d0b0cdd2873b','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','WEB-SCAN-ROW','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(60,'gevt-5690ffd0-1595-439b-ad56-92ac6f48c580','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-5690ffd0-1595-439b-ad56-92ac6f48c580','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(61,'5f1f38c1-8cf5-463a-9b91-93fbc01bf305','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-8b657f4d-13c4-44e6-9d2a-81f929bd6825','创建 Goal 时指定上级 Goal','{"from_goal_id":"WEB-SCAN-ROW","to_goal_id":"WEB-SCAN","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(62,'de519501-482c-417f-9d3c-ab13d55a9eae','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','WEB-SCAN-NEST','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(63,'gevt-c827b5df-f85b-4686-98dc-1ba4b9420350','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-c827b5df-f85b-4686-98dc-1ba4b9420350','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(64,'89b42c5d-6cab-4399-be02-99cce9dd91fa','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-d696bb2e-8d88-4a2a-bee5-97e28faf9690','创建 Goal 时指定上级 Goal','{"from_goal_id":"WEB-SCAN-NEST","to_goal_id":"WEB-SCAN-ROW","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(65,'bb8d4933-c906-4c3b-a006-6808614575e1','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','AUTO-CONNECT','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(66,'gevt-207a5bc6-49ee-4f46-8dfb-6f548cfc1267','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-207a5bc6-49ee-4f46-8dfb-6f548cfc1267','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(67,'gevt-9a7f6109-86b0-40f9-92f2-17ceeb09f4c5','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.observation_note','io.molis.work.goals:goal_work_event','gevt-9a7f6109-86b0-40f9-92f2-17ceeb09f4c5','接入 Runtime 后必须新开会话；继续使用接入前的会话会让人误以为安装失败。','{"operation":"observation_note","body":"接入 Runtime 后必须新开会话；继续使用接入前的会话会让人误以为安装失败。"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(68,'d4628502-1f85-43e7-a65c-b9ccac8cdc5f','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.trashed','io.molis.work.goals:goal','AUTO-CONNECT','这会替用户猜项目；当前方案只展示历史候选，并再次询问用户','{"trash_record_id":"trash-cfaa6b4d-040e-49a0-9eb1-44a134f60514","deactivated_relation_ids":[],"active_goal_cleared":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(69,'gevt-79d15b8c-e224-47ee-9858-5651aef0ca91','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_config.updated','io.molis.work.goals:goal_event_config','CORE','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[{"type_id":"lifecycle","requirement_id":"CORE-C1"}]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(70,'gevt-2e834d72-e9ce-4ae2-bd89-c037815a21d7','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.work_event.recorded','io.molis.work.goals:goal_work_event','gevt-2e834d72-e9ce-4ae2-bd89-c037815a21d7','生命周期记录已接通','{"type_id":"lifecycle","type_version":1,"fields":{"result":"从约定、报告到收尾形成完整记录"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(71,'gevt-93d52b30-0202-4e86-babf-42657eccaa37','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.progress_summary','io.molis.work.goals:goal_work_event','gevt-93d52b30-0202-4e86-babf-42657eccaa37','记录当前进展和下一步','{"operation":"progress_summary","summary":"完成依据已经写进当前事件记录。","based_on_cursor":70,"next_step":"明确收尾","next_actor":"当前用户"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(72,'gevt-2179e86c-bd76-4c0a-a826-65a37bf0f0ae','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.observation_note','io.molis.work.goals:goal_work_event','gevt-2179e86c-bd76-4c0a-a826-65a37bf0f0ae','演示项目用当前事件记录说明这项工作为什么可以算完成。','{"operation":"observation_note","body":"演示项目用当前事件记录说明这项工作为什么可以算完成。"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(73,'gevt-7861ede3-4b2c-4e08-ba49-099f2b7f1f5d','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.closure_submitted','io.molis.work.goals:goal_work_event','gevt-7861ede3-4b2c-4e08-ba49-099f2b7f1f5d','显式完成当前 Goal','{"operation":"closure_submitted","kind":"complete","result":"可用的生命周期记录","reason":"约定要求已有支持事实，演示收尾","completion_applied":true,"unmet_reasons":[],"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(74,'gevt-c8fa86d9-786a-4e6f-9305-e8e702eeb239','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.observation_note','io.molis.work.goals:goal_work_event','gevt-c8fa86d9-786a-4e6f-9305-e8e702eeb239','升级前应先看到安全说明：能保留的旧数据明确列出，不能可靠迁移的内容提示重新整理。','{"operation":"observation_note","body":"升级前应先看到安全说明：能保留的旧数据明确列出，不能可靠迁移的内容提示重新整理。"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(75,'gevt-f6e45caa-0d74-4196-8745-113c1b3a5bd6','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_config.updated','io.molis.work.goals:goal_event_config','V1','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(76,'gevt-46020f47-4c57-4540-8112-8ab4208622d5','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.work_event.recorded','io.molis.work.goals:goal_work_event','gevt-46020f47-4c57-4540-8112-8ab4208622d5','目标树已经能看出下一步','{"type_id":"lifecycle","type_version":1,"fields":{"result":"列表、画布和看板都有真实内容可扫。"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(77,'gevt-7839fa66-d518-41a4-94d1-a08b676c64ad','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.progress_summary','io.molis.work.goals:goal_work_event','gevt-7839fa66-d518-41a4-94d1-a08b676c64ad','记录当前进展和下一步','{"operation":"progress_summary","summary":"列表、画布和看板都有真实内容可扫。","based_on_cursor":76,"next_step":"先处理需要决定和受阻的 Goal","next_actor":"当前用户"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(78,'gevt-8d9132a6-4c6c-4332-ad45-1538920c1332','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_config.updated','io.molis.work.goals:goal_event_config','DESKTOP','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(79,'gevt-49707344-2ce1-4b08-9744-aa4dafba63e1','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.work_event.recorded','io.molis.work.goals:goal_work_event','gevt-49707344-2ce1-4b08-9744-aa4dafba63e1','工作台主栏已经对齐','{"type_id":"lifecycle","type_version":1,"fields":{"result":"目录、舞台和标签已经能在同一窗口里切换。"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(80,'gevt-188cdd02-c7e7-49c5-a885-922bd6a810b2','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.progress_summary','io.molis.work.goals:goal_work_event','gevt-188cdd02-c7e7-49c5-a885-922bd6a810b2','记录当前进展和下一步','{"operation":"progress_summary","summary":"目录、舞台和标签已经能在同一窗口里切换。","based_on_cursor":79,"next_step":"核对分屏后 Goal 绑定仍保持","next_actor":"当前用户"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(81,'gevt-6cbd9091-0b8d-4d53-a929-6ed4a0533e4c','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_config.updated','io.molis.work.goals:goal_event_config','DECIDE','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(82,'gevt-c99dabf0-ddf4-4a29-8ede-b5066f413983','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.decision_requested','io.molis.work.goals:goal_work_event','gevt-c99dabf0-ddf4-4a29-8ede-b5066f413983','请求决定：第一次打开项目时，默认落在 Goal 列表还是默认打开一条 Session？','{"operation":"decision_requested","request_id":"gdec-req-655c5da7-3a53-4a63-8f74-3f8dafffb376","question":"第一次打开项目时，默认落在 Goal 列表还是默认打开一条 Session？","options":[{"option_id":"goals","label":"先看目标树","impact":"用户先理解现在做什么，再决定开哪条会话"},{"option_id":"session","label":"先开 Session","impact":"用户立刻回到对话，但可能还没看清目标"}],"scope":{"requirement_ids":["DECIDE-C1"],"event_ids":[],"concern_ids":[],"action":null},"purpose":"suggestion","proposed_change":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(83,'gevt-380837f0-b074-4b1b-9b41-c1d3c3c8391a','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_config.updated','io.molis.work.goals:goal_event_config','RISK','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(84,'gevt-22e97eed-190a-4af9-8c49-32b1f042fef8','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.concern_opened','io.molis.work.goals:goal_work_event','gevt-22e97eed-190a-4af9-8c49-32b1f042fef8','提出 Concern：README 仍指向已撤掉的启动命令','{"operation":"concern_opened","concern_id":"gcon-e1ddd7c3-95a4-4f9d-9710-755699e104f1","title":"README 仍指向已撤掉的启动命令","statement":"按文档复制的命令会启动旧入口，用户会以为安装失败。","scope":{"requirement_ids":["RISK-C1"],"event_ids":[],"concern_ids":[],"action":null},"blocks_closure":true,"cited_subjects":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(85,'gevt-419ef40e-4b67-4b75-9977-92a6bfbec1b2','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_config.updated','io.molis.work.goals:goal_event_config','GRAPH','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(86,'gevt-687682e6-0596-49f1-b3d1-efa8890d7d2e','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.work_event.recorded','io.molis.work.goals:goal_work_event','gevt-687682e6-0596-49f1-b3d1-efa8890d7d2e','画布已能读出依赖方向','{"type_id":"lifecycle","type_version":1,"fields":{"result":"父子和前置关系都来自真实记录。"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(87,'gevt-0ddd0c80-8da3-4036-8f9e-1780a31c6325','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.progress_summary','io.molis.work.goals:goal_work_event','gevt-0ddd0c80-8da3-4036-8f9e-1780a31c6325','记录当前进展和下一步','{"operation":"progress_summary","summary":"父子和前置关系都来自真实记录。","based_on_cursor":86,"next_step":"退出日常列表，需要时再打开归档","next_actor":"当前用户"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(88,'gevt-a0b5df41-cf50-46d5-b6d3-f80fcd2c2d9e','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.closure_submitted','io.molis.work.goals:goal_work_event','gevt-a0b5df41-cf50-46d5-b6d3-f80fcd2c2d9e','显式完成当前 Goal','{"operation":"closure_submitted","kind":"complete","result":"画布关系已经可扫","reason":"演示收尾，把已完成关系图移出日常列表","completion_applied":true,"unmet_reasons":[],"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(89,'959b26e2-1972-480e-9e9d-544e9e61547b','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.archived','io.molis.work.goals:goal','GRAPH','画布关系已经可扫，退出日常工作列表','{"active_goal_cleared":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(90,'gevt-94ca00a3-019b-4bd6-a0f5-ba1aeb067677','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_config.updated','io.molis.work.goals:goal_event_config','DROPPED','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(91,'gevt-5df54cc7-3987-4926-86a0-c950c51db87d','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.closure_submitted','io.molis.work.goals:goal_work_event','gevt-5df54cc7-3987-4926-86a0-c950c51db87d','取消当前 Goal','{"operation":"closure_submitted","kind":"cancel","result":null,"reason":"旧会话读不到新接入，会让人误以为安装失败","completion_applied":false,"unmet_reasons":[],"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(92,'a4b378df-660f-4042-b0c9-f3fa130f563e','molis-work-v1-demo','demo-user','io.molis.work.goals:board.active_goal_changed','io.molis.work.goals:goal','V1','演示项目从第一个目标开始','{}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(93,'event-644fd50f-aa9c-4f57-a9c7-00d3c3d4d894','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.registered','io.molis.work.feed:feed_source','feed-source-f34498b13c742f0d0f851765e48fe4d6','已注册 Feed 来源；尚未联网读取','{}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(94,'event-3b9ab1f8-16de-482e-9e85-4c6c50159c6c','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.registered','io.molis.work.feed:feed_source','feed-source-a12054cbb831b279742fac4cfe340b2b','已注册 Feed 来源；尚未联网读取','{}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(95,'event-9a72905b-b020-4f3e-bed2-dd43238b6fec','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.registered','io.molis.work.feed:feed_source','feed-source-5496d064f90938a458c4b1eec79d4a4b','已注册 Feed 来源；尚未联网读取','{}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(96,'event-57089440-d008-459f-8452-1036528f5158','molis-work-v1-demo','web-user','attention_entry.created','inbox_entry','inboxentry-29ed4a11-62f0-45c4-8bde-12ca4ed919b9','对象已加入 Inbox','{"owner_plugin_id":"io.molis.work.feed","subject_type":"feed_item","subject_id":"feeditem-c495e9ec-4969-49ec-8776-0cb00c4c29c3","reason":"source_rule"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(97,'event-72aac65a-627b-48b7-849d-fc3740f757d2','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.item_ingested','io.molis.work.feed:feed_item','feeditem-c495e9ec-4969-49ec-8776-0cb00c4c29c3','从 GitHub · molis-work 导入 Feed Item','{"source_id":"demo-github","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(98,'event-f7cac722-bbe9-47ea-9a8a-b9cf008f4248','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.item_ingested','io.molis.work.feed:feed_item','feeditem-10fd1d1f-76b7-4a9f-91dc-474571d8bdab','从 GitHub · molis-work 导入 Feed Item','{"source_id":"demo-github","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(99,'event-4946a9ed-41ad-4032-a67d-e88eb809c2c3','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.item_ingested','io.molis.work.feed:feed_item','feeditem-b37fdd3c-7cf4-4f3c-9731-366e30a4f429','从 Gmail · 产品反馈 导入 Feed Item','{"source_id":"demo-gmail","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(100,'event-c756606d-6349-40bc-92c8-fd611dcd8812','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.item_ingested','io.molis.work.feed:feed_item','feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1','从 Solidot 导入 Feed Item','{"source_id":"feed-source-f34498b13c742f0d0f851765e48fe4d6","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(101,'event:artifact:feed-capture:feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1:feedoutrule-4a10e769-0757-416b-80c3-13dc5debce20:1:registered','molis-work-v1-demo','web-user','artifact.published','artifact','feed-capture:feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1:feedoutrule-4a10e769-0757-416b-80c3-13dc5debce20@1','Plugin 发布了成果','{"artifact_id":"feed-capture:feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1:feedoutrule-4a10e769-0757-416b-80c3-13dc5debce20","version":1,"artifact_type_id":"io.molis.work.feed.capture","schema_version":1,"scope":"personal","content_digest":"sha256:361ce27361a114a6ccfabf31b04c3c14b595ff6e7c1b9ba30bf40dfc86e68727"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(102,'event-2e575c6e-2a88-4db0-ae2b-529339813693','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.item_ingested','io.molis.work.feed:feed_item','feeditem-d1a7e891-f364-4dca-b7a9-9db59edeb5cf','从 公开频道 · 工作台演示 导入 Feed Item','{"source_id":"feed-source-a12054cbb831b279742fac4cfe340b2b","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(103,'event-2ca4f74c-fc5a-41aa-8a00-d7d1c0ffcbc2','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.item_ingested','io.molis.work.feed:feed_item','feeditem-a65d6e25-ac10-4f25-a10f-ffea94720077','从 共同进度怎么被记住 导入 Feed Item','{"source_id":"feed-source-5496d064f90938a458c4b1eec79d4a4b","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(104,'event-51c99ee8-ab3c-4617-ac6e-7976677b6d08','molis-work-v1-demo','web-user','attention_entry.created','inbox_entry','inboxentry-d31789fd-6997-4899-9116-d0625bc7d051','对象已加入 Inbox','{"owner_plugin_id":"io.molis.work.feed","subject_type":"feed_item","subject_id":"feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1","reason":"manual"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(105,'event-11efe9bd-60a3-4fb4-85db-9151cd008367','molis-work-v1-demo','web-user','attention_entry.created','inbox_entry','inboxentry-30acabe0-041e-4956-969d-b5f0c97518e9','对象已加入 Inbox','{"owner_plugin_id":"io.molis.work.feed","subject_type":"feed_item","subject_id":"feeditem-d1a7e891-f364-4dca-b7a9-9db59edeb5cf","reason":"manual"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(106,'event-fdaf5252-bd57-413e-80ac-57ba53d0ee91','molis-work-v1-demo','web-user','attention_entry.dismissed','inbox_entry','inboxentry-30acabe0-041e-4956-969d-b5f0c97518e9','Inbox Entry 已标记为 dismissed','{"owner_plugin_id":"io.molis.work.feed","subject_type":"feed_item","subject_id":"feeditem-d1a7e891-f364-4dca-b7a9-9db59edeb5cf","reason":"manual"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(107,'event-2876cb90-bbab-4fe9-a870-369966b27b62','molis-work-v1-demo','web-user','attention_entry.created','inbox_entry','inboxentry-f6ba5a18-e2b2-482d-848f-a6f2d207cf3b','对象已加入 Inbox','{"owner_plugin_id":"io.molis.work.feed","subject_type":"feed_item","subject_id":"feeditem-a65d6e25-ac10-4f25-a10f-ffea94720077","reason":"manual"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(108,'event-b6971694-4dfc-4d87-83c3-8ba9ad406f93','molis-work-v1-demo','web-user','attention_entry.done','inbox_entry','inboxentry-f6ba5a18-e2b2-482d-848f-a6f2d207cf3b','Inbox Entry 已标记为 done','{"owner_plugin_id":"io.molis.work.feed","subject_type":"feed_item","subject_id":"feeditem-a65d6e25-ac10-4f25-a10f-ffea94720077","reason":"manual"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(109,'event-a04fd6c1-8990-47f7-abf9-a3567fbddc91','molis-work-v1-demo','web-user','attention_entry.created','inbox_entry','inboxentry-001e446d-537b-4f9f-b492-c316da26da0e','对象已加入 Inbox','{"owner_plugin_id":"io.molis.work.feed","subject_type":"source_fault","subject_id":"demo-gmail","reason":"source_fault"}','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_item_events"("event_id","project_id","item_id","type","payload_json","at") VALUES('feed-event-115dde1c-e51e-405c-b12f-2b89bbb7ed9e','molis-work-v1-demo','feeditem-a65d6e25-ac10-4f25-a10f-ffea94720077','feed_item.created','{"source_id":"feed-source-5496d064f90938a458c4b1eec79d4a4b","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_item_events"("event_id","project_id","item_id","type","payload_json","at") VALUES('feed-event-19d89e7f-11f7-4b8e-9211-26ecbb43947b','molis-work-v1-demo','feeditem-b37fdd3c-7cf4-4f3c-9731-366e30a4f429','feed_item.created','{"source_id":"demo-gmail","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_item_events"("event_id","project_id","item_id","type","payload_json","at") VALUES('feed-event-6299baca-b9e7-41f7-b1f5-25b80800e279','molis-work-v1-demo','feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1','feed_item.created','{"source_id":"feed-source-f34498b13c742f0d0f851765e48fe4d6","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_item_events"("event_id","project_id","item_id","type","payload_json","at") VALUES('feed-event-970d4e4f-7901-4692-a8fa-65c22af0673c','molis-work-v1-demo','feeditem-10fd1d1f-76b7-4a9f-91dc-474571d8bdab','feed_item.created','{"source_id":"demo-github","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_item_events"("event_id","project_id","item_id","type","payload_json","at") VALUES('feed-event-9817ddcf-3b18-4cd2-938c-863d885be047','molis-work-v1-demo','feeditem-c495e9ec-4969-49ec-8776-0cb00c4c29c3','feed_item.created','{"source_id":"demo-github","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_item_events"("event_id","project_id","item_id","type","payload_json","at") VALUES('feed-event-fb97f38e-3600-42cc-8f07-2fef12ab3bcb','molis-work-v1-demo','feeditem-d1a7e891-f364-4dca-b7a9-9db59edeb5cf','feed_item.created','{"source_id":"feed-source-a12054cbb831b279742fac4cfe340b2b","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_items"("project_id","item_id","source_id","signal_id","signal_revision","kind","title","summary","body","source_kind","source_label","external_id","url","origin_status","priority","tags_json","author","disposition","read_at","revision","source_created_at","source_updated_at","imported_at","updated_at") VALUES('molis-work-v1-demo','feeditem-10fd1d1f-76b7-4a9f-91dc-474571d8bdab','demo-github',NULL,NULL,'github_notification','CI：生命周期自动化检查已通过','与 CORE-C1 对应的检查已经变绿。','这条通知只作记录，不需要立刻介入。','github','GitHub · molis-work','demo-github-ci',NULL,'inbox','medium','["GitHub","CI"]','github-actions','inbox',NULL,1,'2026-09-16T03:10:00.000Z','2026-09-16T03:10:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_items"("project_id","item_id","source_id","signal_id","signal_revision","kind","title","summary","body","source_kind","source_label","external_id","url","origin_status","priority","tags_json","author","disposition","read_at","revision","source_created_at","source_updated_at","imported_at","updated_at") VALUES('molis-work-v1-demo','feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1','feed-source-f34498b13c742f0d0f851765e48fe4d6',NULL,NULL,'rss_entry','第一次把模糊想法收成目标树','用户要能从列表看出下一步、阻塞和完成依据。','长程任务最容易在换对话后丢失共同进度。先把模糊想法收成目标树，再决定谁做下一步。这篇文章和当前示例项目的主 Goal 直接相关。','rss','Solidot','https://example.com/posts/goal-tree-first-run','https://www.solidot.org/','inbox','medium','["RSS","产品设计"]','Solidot','inbox',NULL,1,'2026-09-16T04:25:00.000Z','2026-09-16T04:25:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_items"("project_id","item_id","source_id","signal_id","signal_revision","kind","title","summary","body","source_kind","source_label","external_id","url","origin_status","priority","tags_json","author","disposition","read_at","revision","source_created_at","source_updated_at","imported_at","updated_at") VALUES('molis-work-v1-demo','feeditem-a65d6e25-ac10-4f25-a10f-ffea94720077','feed-source-5496d064f90938a458c4b1eec79d4a4b',NULL,NULL,'web_query_result','不同 Runtime 怎样读同一份项目进度','查询「AI 工作台如何保存共同进度」的本地示例结果。','如果每个入口各自记状态，换一次对话就要重新解释整个项目。共同底座应保存 Goal、关系、决定和完成依据。','web_query','共同进度怎么被记住','query:shared-progress-1',NULL,'inbox','medium','["网页查询"]',NULL,'inbox',NULL,1,'2026-09-15T10:00:00.000Z','2026-09-15T10:00:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_items"("project_id","item_id","source_id","signal_id","signal_revision","kind","title","summary","body","source_kind","source_label","external_id","url","origin_status","priority","tags_json","author","disposition","read_at","revision","source_created_at","source_updated_at","imported_at","updated_at") VALUES('molis-work-v1-demo','feeditem-b37fdd3c-7cf4-4f3c-9731-366e30a4f429','demo-gmail',NULL,NULL,'gmail_message','第一次打开项目时，默认该先看目标还是先开会话？','合作方问首页落点。决定仍在 Goals 的 DECIDE，这里只保留邮件事实。','如果两个入口同时强调，新用户会停在选择上。请产品给一个默认落点，另一个入口仍可从同一工作台到达。','gmail','Gmail · 产品反馈','demo-gmail-landing',NULL,'inbox','medium','["Gmail","产品"]','Mina <partner@example.com>','inbox',NULL,1,'2026-09-16T05:42:00.000Z','2026-09-16T05:42:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_items"("project_id","item_id","source_id","signal_id","signal_revision","kind","title","summary","body","source_kind","source_label","external_id","url","origin_status","priority","tags_json","author","disposition","read_at","revision","source_created_at","source_updated_at","imported_at","updated_at") VALUES('molis-work-v1-demo','feeditem-c495e9ec-4969-49ec-8776-0cb00c4c29c3','demo-github',NULL,NULL,'github_notification','PR #418 请确认完成依据是否写进事件记录','Review 要求核对：工作何时开始、提交了什么、为什么可以算完成。','请对照 CORE 的约定：从约定、报告到收尾要形成完整记录。这条通知需要人决定是否并入当前 Goal。','github','GitHub · molis-work','demo-github-pr-418','https://github.com/example/molis-work/pull/418','inbox','medium','["GitHub","Review"]','octocat','inbox',NULL,1,'2026-09-16T06:18:00.000Z','2026-09-16T06:18:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_items"("project_id","item_id","source_id","signal_id","signal_revision","kind","title","summary","body","source_kind","source_label","external_id","url","origin_status","priority","tags_json","author","disposition","read_at","revision","source_created_at","source_updated_at","imported_at","updated_at") VALUES('molis-work-v1-demo','feeditem-d1a7e891-f364-4dca-b7a9-9db59edeb5cf','feed-source-a12054cbb831b279742fac4cfe340b2b',NULL,NULL,'youtube_video','不切窗口推进 Goal 的工作台演示','目录、舞台和会话如何留在同一个窗口。','演示里桌面端把 Goal 导航、当前工作和 Runtime 组合成连续工作面。本条是本地示例，不是当场拉取的频道更新。','youtube_channel','公开频道 · 工作台演示','yt:demo-workbench-tour','https://www.youtube.com/watch?v=dQw4w9wg','inbox','medium','["YouTube"]','工作台演示','inbox',NULL,1,'2026-09-15T12:00:00.000Z','2026-09-15T12:00:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_out_rules"("project_id","rule_id","name","enabled","match_json","created_at","updated_at","admission","judgment_json","revision") VALUES('molis-work-v1-demo','feedoutrule-4a10e769-0757-416b-80c3-13dc5debce20','捕捉首次协作文章',1,'{"contains":"目标树","source_id":"feed-source-f34498b13c742f0d0f851765e48fe4d6"}','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','suggest',NULL,'63105fdc-acf5-4c2d-af62-79016a229455');
INSERT INTO "feed_sources"("project_id","source_id","kind","definition_id","sync_kind","name","description","status","enabled","item_count","origin","config_json","schedule_json","credential_ref","account_label","last_sync_at","last_outcome","last_error_code","imported_at","updated_at") VALUES('molis-work-v1-demo','demo-github','github','github','github','GitHub · molis-work','示例通知。未连接账号，不会拉取真实仓库。','disconnected',0,0,'molis_work','{}','{"mode":"manual"}',NULL,'demo-user','2026-09-16T06:18:00.000Z','completed',NULL,'2026-09-16T06:18:00.000Z','2026-09-16T06:18:00.000Z');
INSERT INTO "feed_sources"("project_id","source_id","kind","definition_id","sync_kind","name","description","status","enabled","item_count","origin","config_json","schedule_json","credential_ref","account_label","last_sync_at","last_outcome","last_error_code","imported_at","updated_at") VALUES('molis-work-v1-demo','demo-gmail','gmail','gmail','gmail','Gmail · 产品反馈','示例邮件。未授权，打开来源后需要真实连接。','disconnected',0,0,'molis_work','{"scope":"in:inbox"}','{"mode":"manual"}',NULL,'demo@molis.work','2026-09-16T05:42:00.000Z','failed','feed.auth_required','2026-09-16T05:42:00.000Z','2026-09-16T05:42:00.000Z');
INSERT INTO "feed_sources"("project_id","source_id","kind","definition_id","sync_kind","name","description","status","enabled","item_count","origin","config_json","schedule_json","credential_ref","account_label","last_sync_at","last_outcome","last_error_code","imported_at","updated_at") VALUES('molis-work-v1-demo','feed-source-5496d064f90938a458c4b1eec79d4a4b','web_query','anysearch','public_source','共同进度怎么被记住','固定公开网页查询；每次手动同步重新搜索，失败时不回退 Mock。','active',1,0,'molis_work','{"query":"AI 工作台如何保存共同进度","config_fingerprint":"faaf77463dfe2a9664aa60e4e0d7d70abe57d17424d5f7ba7e6ec4a33cc91c51"}','{"mode":"manual"}',NULL,NULL,NULL,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_sources"("project_id","source_id","kind","definition_id","sync_kind","name","description","status","enabled","item_count","origin","config_json","schedule_json","credential_ref","account_label","last_sync_at","last_outcome","last_error_code","imported_at","updated_at") VALUES('molis-work-v1-demo','feed-source-a12054cbb831b279742fac4cfe340b2b','youtube_channel','youtube-channel','public_source','公开频道 · 工作台演示','YouTube 官方公开频道最近视频；不读取评论、字幕或账号数据。','active',1,0,'molis_work','{"channel_id":"UCmwDemoPublicChannel001","config_fingerprint":"d2fbfb70a0bbdfd34b3cca841df4acac3acc95af24353eba4d56d74ec539211f"}','{"mode":"manual"}',NULL,NULL,NULL,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_sources"("project_id","source_id","kind","definition_id","sync_kind","name","description","status","enabled","item_count","origin","config_json","schedule_json","credential_ref","account_label","last_sync_at","last_outcome","last_error_code","imported_at","updated_at") VALUES('molis-work-v1-demo','feed-source-f34498b13c742f0d0f851765e48fe4d6','rss','solidot','public_source','Solidot','公开 RSS 来源；注册不联网，只在手动同步时读取。','active',1,0,'molis_work','{"feed_url":"https://www.solidot.org/index.rss","config_fingerprint":"1c8ab1d14559ef58a2fbb4d23dcea95e558df2d27e76dd5e7a79617a5f0568d9"}','{"mode":"manual"}',NULL,NULL,NULL,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','ADOPTION',1,'新用户从 README、安装和首次打开一路走到推进第一条 Goal','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','AUTO-CONNECT',1,'新对话少做一次项目确认','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','CORE',1,'用户能看到一项工作何时开始、做出了什么，以及为什么可以算完成','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','DECIDE',1,'首次打开项目时，用户知道自己该先看目标树还是先开一条会话','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','DESKTOP',1,'用户在桌面端同时看到 Goal、下一步、完成要求和强绑定的 Runtime','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','DOCS',1,'用户先理解长程任务为何会跑偏，再看到 Molis Work 的闭环、桌面端和 Runtime 伴随方式','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','DROPPED',1,'接入后不必新开对话也能立刻调用工具','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','GRAPH',1,'父子层级、前置依赖和当前焦点在复杂网络中仍有清楚的方向与落点','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','INTERFACES',1,'用户换一个 Runtime 或新开对话后，仍能找到同一个项目的目标、进度和未完成工作','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','ONBOARDING',1,'用户首次进入后能选择项目、找到可做 Goal，并理解 Runtime 为什么绑定到它','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','PLATFORM',1,'不同 AI、会话和插件按各自所有者读到同一份项目事实','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','RELEASE',1,'用户完成安装后知道如何启动页面、连接正在使用的 Runtime，以及为什么需要新开会话','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','RISK',1,'接入说明与当前产品步骤一致，用户不会按过期文档操作','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','V1',1,'用户能把一个模糊想法变成清楚的目标树，并知道下一步、阻塞和完成依据','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','WEB',1,'用户不用理解内部协议，也能看出项目要解决什么、当前进展、谁该做什么和为什么被阻塞','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','WEB-SCAN',1,'用户不用点进详情，也能从列表看出现在该看哪条 Goal、它卡在哪里','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','WEB-SCAN-NEST',1,'五层树里最深的一行仍然明显属于上一层，不和旁边的叶子抢位置','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','WEB-SCAN-ROW',1,'四层 Goal 树扫一眼就能分清父子，状态列仍在同一条竖线上','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_agreements"("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES('molis-work-v1-demo','WORKSPACE',1,'用户在一个窗口里查看 Goal Tree、Focus、Graph 和 Goal-bound Runtime','demo-user','2026-01-15T09:00:00.000Z','');
INSERT INTO "goal_event_closures"("closure_id","project_id","goal_id","event_id","kind","result","reason","completion_applied","expected_config_version","expected_agreement_version","config_version","agreement_version","unmet_reasons_json","superseded","superseded_reason","recorded_at","acceptance_round") VALUES('gclo-030d8ad5-3e71-4c88-8cd6-807f3702908e','molis-work-v1-demo','DROPPED','gevt-5df54cc7-3987-4926-86a0-c950c51db87d','cancel',NULL,'旧会话读不到新接入，会让人误以为安装失败',0,1,1,1,1,'[]',0,NULL,'2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_event_closures"("closure_id","project_id","goal_id","event_id","kind","result","reason","completion_applied","expected_config_version","expected_agreement_version","config_version","agreement_version","unmet_reasons_json","superseded","superseded_reason","recorded_at","acceptance_round") VALUES('gclo-953f27aa-8021-4140-b2dc-cb24c553d12e','molis-work-v1-demo','CORE','gevt-7861ede3-4b2c-4e08-ba49-099f2b7f1f5d','complete','可用的生命周期记录','约定要求已有支持事实，演示收尾',1,1,1,1,1,'[]',0,NULL,'2026-01-15T09:00:00.000Z',1);
INSERT INTO "goal_event_closures"("closure_id","project_id","goal_id","event_id","kind","result","reason","completion_applied","expected_config_version","expected_agreement_version","config_version","agreement_version","unmet_reasons_json","superseded","superseded_reason","recorded_at","acceptance_round") VALUES('gclo-c676361a-5a76-4471-a473-ffd5f8655c09','molis-work-v1-demo','GRAPH','gevt-a0b5df41-cf50-46d5-b6d3-f80fcd2c2d9e','complete','画布关系已经可扫','演示收尾，把已完成关系图移出日常列表',1,1,1,1,1,'[]',0,NULL,'2026-01-15T09:00:00.000Z',1);
INSERT INTO "goal_event_concerns"("concern_id","project_id","goal_id","event_id","title","statement","scope_json","blocks_closure","status","resolution_reason","resolution_event_id","cited_decision_id","previous_status","created_at","updated_at","cited_subjects_json") VALUES('gcon-e1ddd7c3-95a4-4f9d-9710-755699e104f1','molis-work-v1-demo','RISK','gevt-22e97eed-190a-4af9-8c49-32b1f042fef8','README 仍指向已撤掉的启动命令','按文档复制的命令会启动旧入口，用户会以为安装失败。','{"requirement_ids":["RISK-C1"],"event_ids":[],"concern_ids":[],"action":null}',1,'open',NULL,NULL,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','[]');
INSERT INTO "goal_event_config_versions"("project_id","goal_id","version","actor_id","created_at","config_event_id") VALUES('molis-work-v1-demo','CORE',1,'demo-user','2026-01-15T09:00:00.000Z','gevt-79d15b8c-e224-47ee-9858-5651aef0ca91');
INSERT INTO "goal_event_config_versions"("project_id","goal_id","version","actor_id","created_at","config_event_id") VALUES('molis-work-v1-demo','DECIDE',1,'demo-user','2026-01-15T09:00:00.000Z','gevt-6cbd9091-0b8d-4d53-a929-6ed4a0533e4c');
INSERT INTO "goal_event_config_versions"("project_id","goal_id","version","actor_id","created_at","config_event_id") VALUES('molis-work-v1-demo','DESKTOP',1,'demo-user','2026-01-15T09:00:00.000Z','gevt-8d9132a6-4c6c-4332-ad45-1538920c1332');
INSERT INTO "goal_event_config_versions"("project_id","goal_id","version","actor_id","created_at","config_event_id") VALUES('molis-work-v1-demo','DROPPED',1,'demo-user','2026-01-15T09:00:00.000Z','gevt-94ca00a3-019b-4bd6-a0f5-ba1aeb067677');
INSERT INTO "goal_event_config_versions"("project_id","goal_id","version","actor_id","created_at","config_event_id") VALUES('molis-work-v1-demo','GRAPH',1,'demo-user','2026-01-15T09:00:00.000Z','gevt-419ef40e-4b67-4b75-9977-92a6bfbec1b2');
INSERT INTO "goal_event_config_versions"("project_id","goal_id","version","actor_id","created_at","config_event_id") VALUES('molis-work-v1-demo','RISK',1,'demo-user','2026-01-15T09:00:00.000Z','gevt-380837f0-b074-4b1b-9b41-c1d3c3c8391a');
INSERT INTO "goal_event_config_versions"("project_id","goal_id","version","actor_id","created_at","config_event_id") VALUES('molis-work-v1-demo','V1',1,'demo-user','2026-01-15T09:00:00.000Z','gevt-f6e45caa-0d74-4196-8745-113c1b3a5bd6');
INSERT INTO "goal_event_configs"("project_id","goal_id","current_version","updated_at","updated_by") VALUES('molis-work-v1-demo','CORE',1,'2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_configs"("project_id","goal_id","current_version","updated_at","updated_by") VALUES('molis-work-v1-demo','DECIDE',1,'2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_configs"("project_id","goal_id","current_version","updated_at","updated_by") VALUES('molis-work-v1-demo','DESKTOP',1,'2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_configs"("project_id","goal_id","current_version","updated_at","updated_by") VALUES('molis-work-v1-demo','DROPPED',1,'2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_configs"("project_id","goal_id","current_version","updated_at","updated_by") VALUES('molis-work-v1-demo','GRAPH',1,'2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_configs"("project_id","goal_id","current_version","updated_at","updated_by") VALUES('molis-work-v1-demo','RISK',1,'2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_configs"("project_id","goal_id","current_version","updated_at","updated_by") VALUES('molis-work-v1-demo','V1',1,'2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_decision_requests"("request_id","project_id","goal_id","event_id","question","options_json","scope_json","purpose","proposed_change_json","commitment_json","status","created_at") VALUES('gdec-req-655c5da7-3a53-4a63-8f74-3f8dafffb376','molis-work-v1-demo','DECIDE','gevt-c99dabf0-ddf4-4a29-8ede-b5066f413983','第一次打开项目时，默认落在 Goal 列表还是默认打开一条 Session？','[{"option_id":"goals","label":"先看目标树","impact":"用户先理解现在做什么，再决定开哪条会话"},{"option_id":"session","label":"先开 Session","impact":"用户立刻回到对话，但可能还没看清目标"}]','{"requirement_ids":["DECIDE-C1"],"event_ids":[],"concern_ids":[],"action":null}','suggestion',NULL,NULL,'pending','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_progress_summaries"("summary_id","project_id","goal_id","event_id","summary_text","based_on_cursor","next_step","next_actor","actor_id","recorded_at") VALUES('gsum-2f4ff0a9-f3ef-47e9-9e63-472b3791b796','molis-work-v1-demo','GRAPH','gevt-0ddd0c80-8da3-4036-8f9e-1780a31c6325','父子和前置关系都来自真实记录。',86,'退出日常列表，需要时再打开归档','当前用户','demo-user','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_progress_summaries"("summary_id","project_id","goal_id","event_id","summary_text","based_on_cursor","next_step","next_actor","actor_id","recorded_at") VALUES('gsum-4672a699-6818-4d6c-8a44-d4de454b3cb9','molis-work-v1-demo','CORE','gevt-93d52b30-0202-4e86-babf-42657eccaa37','完成依据已经写进当前事件记录。',70,'明确收尾','当前用户','demo-user','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_progress_summaries"("summary_id","project_id","goal_id","event_id","summary_text","based_on_cursor","next_step","next_actor","actor_id","recorded_at") VALUES('gsum-7672140f-0229-4d61-9f09-0519c990e8bd','molis-work-v1-demo','V1','gevt-7839fa66-d518-41a4-94d1-a08b676c64ad','列表、画布和看板都有真实内容可扫。',76,'先处理需要决定和受阻的 Goal','当前用户','demo-user','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_progress_summaries"("summary_id","project_id","goal_id","event_id","summary_text","based_on_cursor","next_step","next_actor","actor_id","recorded_at") VALUES('gsum-adf63bc5-4e73-4d29-bf6e-c59b8df580bf','molis-work-v1-demo','DESKTOP','gevt-188cdd02-c7e7-49c5-a885-922bd6a810b2','目录、舞台和标签已经能在同一窗口里切换。',79,'核对分屏后 Goal 绑定仍保持','当前用户','demo-user','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_requirement_bindings"("project_id","goal_id","type_id","requirement_id","created_in_config_version","created_at") VALUES('molis-work-v1-demo','CORE','lifecycle','CORE-C1',1,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','ADOPTION','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','AUTO-CONNECT','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','CORE','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','DECIDE','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','DESKTOP','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','DOCS','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','DROPPED','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','GRAPH','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','INTERFACES','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','ONBOARDING','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','PLATFORM','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','RELEASE','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','RISK','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','V1','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','WEB','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','WEB-SCAN','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','WEB-SCAN-NEST','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','WEB-SCAN-ROW','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_state_owners"("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES('molis-work-v1-demo','WORKSPACE','event_work','intent','2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_types"("project_id","goal_id","type_id","type_version","name","purpose","semantic_family","source_json","fields_json","created_at","created_in_config_version","actor_id") VALUES('molis-work-v1-demo','CORE','lifecycle',1,'生命周期交付','可核对的工作结果','delivery','{"kind":"local","label":"演示项目"}','[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]','2026-01-15T09:00:00.000Z',1,'demo-user');
INSERT INTO "goal_event_types"("project_id","goal_id","type_id","type_version","name","purpose","semantic_family","source_json","fields_json","created_at","created_in_config_version","actor_id") VALUES('molis-work-v1-demo','DECIDE','lifecycle',1,'生命周期交付','可核对的工作结果','delivery','{"kind":"local","label":"演示项目"}','[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]','2026-01-15T09:00:00.000Z',1,'demo-user');
INSERT INTO "goal_event_types"("project_id","goal_id","type_id","type_version","name","purpose","semantic_family","source_json","fields_json","created_at","created_in_config_version","actor_id") VALUES('molis-work-v1-demo','DESKTOP','lifecycle',1,'生命周期交付','可核对的工作结果','delivery','{"kind":"local","label":"演示项目"}','[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]','2026-01-15T09:00:00.000Z',1,'demo-user');
INSERT INTO "goal_event_types"("project_id","goal_id","type_id","type_version","name","purpose","semantic_family","source_json","fields_json","created_at","created_in_config_version","actor_id") VALUES('molis-work-v1-demo','DROPPED','lifecycle',1,'生命周期交付','可核对的工作结果','delivery','{"kind":"local","label":"演示项目"}','[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]','2026-01-15T09:00:00.000Z',1,'demo-user');
INSERT INTO "goal_event_types"("project_id","goal_id","type_id","type_version","name","purpose","semantic_family","source_json","fields_json","created_at","created_in_config_version","actor_id") VALUES('molis-work-v1-demo','GRAPH','lifecycle',1,'生命周期交付','可核对的工作结果','delivery','{"kind":"local","label":"演示项目"}','[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]','2026-01-15T09:00:00.000Z',1,'demo-user');
INSERT INTO "goal_event_types"("project_id","goal_id","type_id","type_version","name","purpose","semantic_family","source_json","fields_json","created_at","created_in_config_version","actor_id") VALUES('molis-work-v1-demo','RISK','lifecycle',1,'生命周期交付','可核对的工作结果','delivery','{"kind":"local","label":"演示项目"}','[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]','2026-01-15T09:00:00.000Z',1,'demo-user');
INSERT INTO "goal_event_types"("project_id","goal_id","type_id","type_version","name","purpose","semantic_family","source_json","fields_json","created_at","created_in_config_version","actor_id") VALUES('molis-work-v1-demo','V1','lifecycle',1,'生命周期交付','可核对的工作结果','delivery','{"kind":"local","label":"演示项目"}','[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]','2026-01-15T09:00:00.000Z',1,'demo-user');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','ADOPTION','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','AUTO-CONNECT','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','CORE','completed','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','DECIDE','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','DESKTOP','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','DOCS','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','DROPPED','cancelled','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','GRAPH','completed','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','INTERFACES','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','ONBOARDING','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','PLATFORM','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','RELEASE','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','RISK','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','V1','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','WEB','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','WEB-SCAN','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','WEB-SCAN-NEST','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','WEB-SCAN-ROW','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_work_status"("project_id","goal_id","work_status","updated_at") VALUES('molis-work-v1-demo','WORKSPACE','open','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-0208ba4c-102b-45bf-b185-b78aa6e8e912','molis-work-v1-demo','DOCS','ONBOARDING','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-0768608b-50b3-4261-9497-835e6c1bef14','molis-work-v1-demo','GRAPH','WORKSPACE','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-079a08ff-ab7a-4db9-b126-e72cf5465f09','molis-work-v1-demo','DESKTOP','CORE','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-154659ed-b0a7-40a4-85ee-e2dd1c502fde','molis-work-v1-demo','CORE','PLATFORM','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-1e8000c8-517b-4cf1-8dea-15168e23a80b','molis-work-v1-demo','RISK','PLATFORM','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-2702625d-407c-427f-82e2-8c83708e0ec6','molis-work-v1-demo','ONBOARDING','RELEASE','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-48959c7e-fdf4-464a-8a4c-187f88d8743e','molis-work-v1-demo','INTERFACES','CORE','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-4db9ca93-63cd-4e3f-8a38-8570323a41fc','molis-work-v1-demo','DECIDE','WORKSPACE','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-591512e4-512f-4b37-92a0-1fa3ff79f91f','molis-work-v1-demo','PLATFORM','V1','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-69962227-d655-4eec-8304-91516ab6f9d4','molis-work-v1-demo','RISK','INTERFACES','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-787cf33b-945d-4f26-bdaf-6744275cf75a','molis-work-v1-demo','WEB','INTERFACES','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-7dfb5206-8e27-46a6-8bbd-b4d0755882d8','molis-work-v1-demo','ONBOARDING','ADOPTION','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-8588994e-4a0c-4b34-83dd-1835312b7598','molis-work-v1-demo','WORKSPACE','V1','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-8b657f4d-13c4-44e6-9d2a-81f929bd6825','molis-work-v1-demo','WEB-SCAN-ROW','WEB-SCAN','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-8c653cea-a34c-4108-86a6-6496d1a92909','molis-work-v1-demo','DROPPED','ADOPTION','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-9145cfbe-cdd4-413c-b409-d41891579308','molis-work-v1-demo','DOCS','ADOPTION','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-979ed680-2b58-4096-8304-45f5db94d978','molis-work-v1-demo','INTERFACES','PLATFORM','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-9b1f993a-b73e-4221-bd76-5b8180a154e9','molis-work-v1-demo','ADOPTION','V1','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-9fe341f0-cb19-47c4-987b-f5bf700f59a9','molis-work-v1-demo','DECIDE','DESKTOP','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-af85d178-92be-4804-a8e5-888eda9ee12f','molis-work-v1-demo','WEB','WORKSPACE','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-b987903a-159f-4124-a601-38f7162d08ab','molis-work-v1-demo','DESKTOP','WORKSPACE','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-ba1e269d-18b3-4e04-b25d-3a23d0d16cfa','molis-work-v1-demo','GRAPH','CORE','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-be3bb064-a8a0-4b59-9e37-576ad4394467','molis-work-v1-demo','RELEASE','ADOPTION','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-d4ad0701-4fb1-4cf7-8988-1cf4bcb741fe','molis-work-v1-demo','WEB-SCAN','WEB','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-d696bb2e-8d88-4a2a-bee5-97e28faf9690','molis-work-v1-demo','WEB-SCAN-NEST','WEB-SCAN-ROW','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','ADOPTION','ADOPTION-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','AUTO-CONNECT','AUTO-CONNECT-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','CORE','CORE-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','DECIDE','DECIDE-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','DESKTOP','DESKTOP-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','DOCS','DOCS-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','DROPPED','DROPPED-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','GRAPH','GRAPH-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','INTERFACES','INTERFACES-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','ONBOARDING','ONBOARDING-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','PLATFORM','PLATFORM-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','RELEASE','RELEASE-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','RISK','RISK-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','V1','V1-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','WEB','WEB-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','WEB-SCAN','WEB-SCAN-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','WEB-SCAN-NEST','WEB-SCAN-NEST-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','WEB-SCAN-ROW','WEB-SCAN-ROW-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_requirement_links"("project_id","goal_id","requirement_id","origin_json","created_in_config_version","created_at") VALUES('molis-work-v1-demo','WORKSPACE','WORKSPACE-C1','{"kind":"create_input"}',0,'2026-01-15T09:00:00.000Z');
INSERT INTO "goal_trash_records"("trash_record_id","project_id","goal_id","trashed_at","trashed_by","trash_reason","restored_at","restored_by","restore_reason") VALUES('trash-cfaa6b4d-040e-49a0-9eb1-44a134f60514','molis-work-v1-demo','AUTO-CONNECT','2026-01-15T09:00:00.000Z','demo-user','这会替用户猜项目；当前方案只展示历史候选，并再次询问用户',NULL,NULL,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-01b82b4d-4c47-47f9-aee7-cd47c51dade3','molis-work-v1-demo','CORE','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',16,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-0ddd0c80-8da3-4036-8f9e-1780a31c6325','molis-work-v1-demo','GRAPH','system',NULL,NULL,'记录当前进展和下一步','{"operation":"progress_summary","summary":"父子和前置关系都来自真实记录。","based_on_cursor":86,"next_step":"退出日常列表，需要时再打开归档","next_actor":"当前用户"}','demo-user','user','2026-01-15T09:00:00.000Z',87,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-0effcce4-7849-465a-b8b7-91087b092e64','molis-work-v1-demo','GRAPH','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',31,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-1020c368-8ac6-40ff-91bc-ab332cef5627','molis-work-v1-demo','WEB','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',27,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-188cdd02-c7e7-49c5-a885-922bd6a810b2','molis-work-v1-demo','DESKTOP','system',NULL,NULL,'记录当前进展和下一步','{"operation":"progress_summary","summary":"目录、舞台和标签已经能在同一窗口里切换。","based_on_cursor":79,"next_step":"核对分屏后 Goal 绑定仍保持","next_actor":"当前用户"}','demo-user','user','2026-01-15T09:00:00.000Z',80,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-1cefb09f-88f6-44a7-be61-c9788dab8c23','molis-work-v1-demo','ADOPTION','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',13,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-207a5bc6-49ee-4f46-8dfb-6f548cfc1267','molis-work-v1-demo','AUTO-CONNECT','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',66,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-2179e86c-bd76-4c0a-a826-65a37bf0f0ae','molis-work-v1-demo','CORE','system',NULL,NULL,'演示项目用当前事件记录说明这项工作为什么可以算完成。','{"operation":"observation_note","body":"演示项目用当前事件记录说明这项工作为什么可以算完成。"}','demo-user','user','2026-01-15T09:00:00.000Z',72,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-22e97eed-190a-4af9-8c49-32b1f042fef8','molis-work-v1-demo','RISK','system',NULL,NULL,'提出 Concern：README 仍指向已撤掉的启动命令','{"operation":"concern_opened","concern_id":"gcon-e1ddd7c3-95a4-4f9d-9710-755699e104f1","title":"README 仍指向已撤掉的启动命令","statement":"按文档复制的命令会启动旧入口，用户会以为安装失败。","scope":{"requirement_ids":["RISK-C1"],"event_ids":[],"concern_ids":[],"action":null},"blocks_closure":true,"cited_subjects":[]}','demo-user','user','2026-01-15T09:00:00.000Z',84,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-2e834d72-e9ce-4ae2-bd89-c037815a21d7','molis-work-v1-demo','CORE','report','lifecycle',1,'生命周期记录已接通','{"result":"从约定、报告到收尾形成完整记录"}','demo-user','user','2026-01-15T09:00:00.000Z',70,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-380837f0-b074-4b1b-9b41-c1d3c3c8391a','molis-work-v1-demo','RISK','configuration',NULL,NULL,'新增记录方式：生命周期交付','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','demo-user','user','2026-01-15T09:00:00.000Z',83,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-419ef40e-4b67-4b75-9977-92a6bfbec1b2','molis-work-v1-demo','GRAPH','configuration',NULL,NULL,'新增记录方式：生命周期交付','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','demo-user','user','2026-01-15T09:00:00.000Z',85,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-46020f47-4c57-4540-8112-8ab4208622d5','molis-work-v1-demo','V1','report','lifecycle',1,'目标树已经能看出下一步','{"result":"列表、画布和看板都有真实内容可扫。"}','demo-user','user','2026-01-15T09:00:00.000Z',76,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-49707344-2ce1-4b08-9744-aa4dafba63e1','molis-work-v1-demo','DESKTOP','report','lifecycle',1,'工作台主栏已经对齐','{"result":"目录、舞台和标签已经能在同一窗口里切换。"}','demo-user','user','2026-01-15T09:00:00.000Z',79,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-5690ffd0-1595-439b-ad56-92ac6f48c580','molis-work-v1-demo','WEB-SCAN-ROW','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',60,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-5df54cc7-3987-4926-86a0-c950c51db87d','molis-work-v1-demo','DROPPED','system',NULL,NULL,'取消当前 Goal','{"operation":"closure_submitted","kind":"cancel","result":null,"reason":"旧会话读不到新接入，会让人误以为安装失败","completion_applied":false,"unmet_reasons":[],"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1}','demo-user','user','2026-01-15T09:00:00.000Z',91,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-5e9f70e8-25cc-4ce3-9651-68960ebdfe5d','molis-work-v1-demo','RISK','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',23,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-687682e6-0596-49f1-b3d1-efa8890d7d2e','molis-work-v1-demo','GRAPH','report','lifecycle',1,'画布已能读出依赖方向','{"result":"父子和前置关系都来自真实记录。"}','demo-user','user','2026-01-15T09:00:00.000Z',86,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-6cbd9091-0b8d-4d53-a929-6ed4a0533e4c','molis-work-v1-demo','DECIDE','configuration',NULL,NULL,'新增记录方式：生命周期交付','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','demo-user','user','2026-01-15T09:00:00.000Z',81,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-7839fa66-d518-41a4-94d1-a08b676c64ad','molis-work-v1-demo','V1','system',NULL,NULL,'记录当前进展和下一步','{"operation":"progress_summary","summary":"列表、画布和看板都有真实内容可扫。","based_on_cursor":76,"next_step":"先处理需要决定和受阻的 Goal","next_actor":"当前用户"}','demo-user','user','2026-01-15T09:00:00.000Z',77,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-7861ede3-4b2c-4e08-ba49-099f2b7f1f5d','molis-work-v1-demo','CORE','system',NULL,NULL,'显式完成当前 Goal','{"operation":"closure_submitted","kind":"complete","result":"可用的生命周期记录","reason":"约定要求已有支持事实，演示收尾","completion_applied":true,"unmet_reasons":[],"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1}','demo-user','user','2026-01-15T09:00:00.000Z',73,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-79d15b8c-e224-47ee-9858-5651aef0ca91','molis-work-v1-demo','CORE','configuration',NULL,NULL,'新增记录方式：生命周期交付','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[{"type_id":"lifecycle","requirement_id":"CORE-C1"}]}','demo-user','user','2026-01-15T09:00:00.000Z',69,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-7fa14ca5-791b-4165-ab2a-0f3e27cd7f75','molis-work-v1-demo','DESKTOP','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',35,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-82db81e8-e18d-44b7-b01b-43d4d04ba87f','molis-work-v1-demo','RELEASE','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',43,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-8d9132a6-4c6c-4332-ad45-1538920c1332','molis-work-v1-demo','DESKTOP','configuration',NULL,NULL,'新增记录方式：生命周期交付','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','demo-user','user','2026-01-15T09:00:00.000Z',78,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-93d52b30-0202-4e86-babf-42657eccaa37','molis-work-v1-demo','CORE','system',NULL,NULL,'记录当前进展和下一步','{"operation":"progress_summary","summary":"完成依据已经写进当前事件记录。","based_on_cursor":70,"next_step":"明确收尾","next_actor":"当前用户"}','demo-user','user','2026-01-15T09:00:00.000Z',71,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-94ca00a3-019b-4bd6-a0f5-ba1aeb067677','molis-work-v1-demo','DROPPED','configuration',NULL,NULL,'新增记录方式：生命周期交付','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','demo-user','user','2026-01-15T09:00:00.000Z',90,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-959dab8c-3baf-45da-8b2f-92ac1e44476b','molis-work-v1-demo','PLATFORM','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',7,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-9a7f6109-86b0-40f9-92f2-17ceeb09f4c5','molis-work-v1-demo','RELEASE','system',NULL,NULL,'接入 Runtime 后必须新开会话；继续使用接入前的会话会让人误以为安装失败。','{"operation":"observation_note","body":"接入 Runtime 后必须新开会话；继续使用接入前的会话会让人误以为安装失败。"}','demo-user','user','2026-01-15T09:00:00.000Z',67,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-9d1f24a1-e02f-4461-be2f-d93bdcb61775','molis-work-v1-demo','DECIDE','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',39,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-a0b5df41-cf50-46d5-b6d3-f80fcd2c2d9e','molis-work-v1-demo','GRAPH','system',NULL,NULL,'显式完成当前 Goal','{"operation":"closure_submitted","kind":"complete","result":"画布关系已经可扫","reason":"演示收尾，把已完成关系图移出日常列表","completion_applied":true,"unmet_reasons":[],"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1}','demo-user','user','2026-01-15T09:00:00.000Z',88,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-a3c0c41b-480f-4221-b1f9-9b29bb207521','molis-work-v1-demo','ONBOARDING','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',46,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-ab60d9e8-4b4d-4235-951d-8b96a61424c1','molis-work-v1-demo','WEB-SCAN','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',57,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-b17097e5-e994-4152-afdb-f7c079fafd09','molis-work-v1-demo','V1','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',5,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-c827b5df-f85b-4686-98dc-1ba4b9420350','molis-work-v1-demo','WEB-SCAN-NEST','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',63,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-c8fa86d9-786a-4e6f-9305-e8e702eeb239','molis-work-v1-demo','INTERFACES','system',NULL,NULL,'升级前应先看到安全说明：能保留的旧数据明确列出，不能可靠迁移的内容提示重新整理。','{"operation":"observation_note","body":"升级前应先看到安全说明：能保留的旧数据明确列出，不能可靠迁移的内容提示重新整理。"}','demo-user','user','2026-01-15T09:00:00.000Z',74,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-c98dec1a-c2e2-4bce-8055-e6239a80345c','molis-work-v1-demo','WORKSPACE','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',10,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-c99dabf0-ddf4-4a29-8ede-b5066f413983','molis-work-v1-demo','DECIDE','system',NULL,NULL,'请求决定：第一次打开项目时，默认落在 Goal 列表还是默认打开一条 Session？','{"operation":"decision_requested","request_id":"gdec-req-655c5da7-3a53-4a63-8f74-3f8dafffb376","question":"第一次打开项目时，默认落在 Goal 列表还是默认打开一条 Session？","options":[{"option_id":"goals","label":"先看目标树","impact":"用户先理解现在做什么，再决定开哪条会话"},{"option_id":"session","label":"先开 Session","impact":"用户立刻回到对话，但可能还没看清目标"}],"scope":{"requirement_ids":["DECIDE-C1"],"event_ids":[],"concern_ids":[],"action":null},"purpose":"suggestion","proposed_change":null}','demo-user','user','2026-01-15T09:00:00.000Z',82,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-dc8a197d-3309-4fb3-a8db-20be76216867','molis-work-v1-demo','DOCS','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',50,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-e9f219af-5ae6-497c-ac31-c9c6786fd276','molis-work-v1-demo','INTERFACES','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',19,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-ed48dd22-43cc-4385-b24b-672a1afbb03b','molis-work-v1-demo','DROPPED','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',54,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-f6e45caa-0d74-4196-8745-113c1b3a5bd6','molis-work-v1-demo','V1','configuration',NULL,NULL,'新增记录方式：生命周期交付','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','demo-user','user','2026-01-15T09:00:00.000Z',75,1);
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('ADOPTION','molis-work-v1-demo','让第一次接入从安装走到真实推进','新用户从 README、安装和首次打开一路走到推进第一条 Goal','只把程序装上不等于用户已经理解产品，更不等于完成第一次有效使用','公开文档先解释适用场景，再引导安装、连接 Runtime、选择项目并推进一条可执行 Goal。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,92,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('AUTO-CONNECT','molis-work-v1-demo','自动替用户选择最近使用的项目','新对话少做一次项目确认','早期方案希望用历史目录记录缩短首次连接步骤','新对话进入一个以前使用过的目录时，系统直接连接最近的项目，不再询问用户。这个方案可能选错项目，因此已经移入回收站，当前产品只展示候选并让用户决定。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet','2026-01-15T09:00:00.000Z','demo-user',NULL,NULL,10,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('CORE','molis-work-v1-demo','让每项工作都有可信的完成依据','用户能看到一项工作何时开始、做出了什么，以及为什么可以算完成','只有进度标签而没有结果和完成依据，用户仍然无法相信工作真的完成了','Runtime 开始一项已约定的工作，并把进展和结果作为事实上报；每条要求都有当前结果支持、没有挡住收尾的 Concern 或待决定时，这项工作才能显式收尾并显示为已完成。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','satisfied',NULL,NULL,NULL,NULL,90,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('DECIDE','molis-work-v1-demo','决定首页先展示目标还是先展示 Runtime','首次打开项目时，用户知道自己该先看目标树还是先开一条会话','两个入口同时强调时，新用户会停在选择上','产品决定一个默认落点，另一个入口仍可从同一工作台到达。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,72,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('DESKTOP','molis-work-v1-demo','把 Molis Work 作为不切窗口的主工作站','用户在桌面端同时看到 Goal、下一步、完成要求和强绑定的 Runtime','工作在 AI 对话里推进、状态在另一个页面查看，会增加切换成本并削弱人的掌控感','桌面端复用网页事实和 Runtime 能力，将全局控制放进 TitleBar，并为 List、Focus 与 Runtime 保留连续三栏。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,74,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('DOCS','molis-work-v1-demo','让用户从 README 进入正确的使用方式','用户先理解长程任务为何会跑偏，再看到 Molis Work 的闭环、桌面端和 Runtime 伴随方式','功能清单无法建立需求感，也无法解释 Molis Work 与 Agent Orchestration 的边界','README 用痛点、核心思路和完整演示组织内容；截图来自 Mock 项目的真实网页与桌面页面。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,56,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('DROPPED','molis-work-v1-demo','在旧会话里自动启用 MCP','接入后不必新开对话也能立刻调用工具','早期希望减少一次重启，但旧会话读不到新接入','安装完成后在当前对话直接启用 MCP。这个方案会让人误以为安装失败，因此已经取消。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,20,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('GRAPH','molis-work-v1-demo','让复杂 Goal 关系仍然一眼可读','父子层级、前置依赖和当前焦点在复杂网络中仍有清楚的方向与落点','列表适合顺序浏览，但复杂 Goal 的多层结构和跨分支依赖会在列表里变得难以判断','用户在 List 与 Graph 之间切换；Graph 只读取真实父子和依赖关系，以节点、分区和有向连线呈现。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','satisfied',NULL,NULL,'2026-01-15T09:00:00.000Z','demo-user',76,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('INTERFACES','molis-work-v1-demo','让不同 AI 对话看到同一项目进度','用户换一个 Runtime 或新开对话后，仍能找到同一个项目的目标、进度和未完成工作','如果每个入口各自记录状态，用户换一次对话就要重新解释整个项目','用户在当前对话明确选择项目后继续推进；其他 Runtime 也通过 Molis Work 读取和更新同一份项目事实，不会各自维护一套进度。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,80,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('ONBOARDING','molis-work-v1-demo','让用户第一次打开就完成有效操作','用户首次进入后能选择项目、找到可做 Goal，并理解 Runtime 为什么绑定到它','展示很多功能不等于用户知道第一步做什么，首屏需要直接引向一次有效推进','首次体验使用一份明确标记的 Mock 项目，沿着可做 Goal、下一步与 Runtime 归属完成一轮引导。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,58,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('PLATFORM','molis-work-v1-demo','让项目事实成为不同 Runtime 的共同底座','不同 AI、会话和插件按各自所有者读到同一份项目事实','长程任务最容易在切换对话和 Runtime 后失去共同上下文','Molis Work 保存项目事实，每类事实由各自的插件负责；Runtime 经统一动作目录读取、执行工作并上报结果，不在各自会话里维护另一套项目记忆。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,96,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('RELEASE','molis-work-v1-demo','让新用户安装后知道下一步怎么开始','用户完成安装后知道如何启动页面、连接正在使用的 Runtime，以及为什么需要新开会话','安装成功但不知道服务是否常驻、工具何时生效或下一步说什么，仍然会被理解成产品不可用','安装只放置 Molis Work 自己的程序，不偷偷修改项目或 Runtime；用户随后显式启用常驻服务、预览并确认 Runtime 接入，再在新会话中选择或创建项目开始使用。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,60,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('RISK','molis-work-v1-demo','安装文档和真实接入步骤对不上','接入说明与当前产品步骤一致，用户不会按过期文档操作','文档仍写旧入口时，用户会以为产品坏了','对照当前安装、Runtime 接入和首次会话步骤，标出对不上的句子并改到同一条路径。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,78,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('V1','molis-work-v1-demo','让第一次使用的人顺利完成一轮目标协作','用户能把一个模糊想法变成清楚的目标树，并知道下一步、阻塞和完成依据','AI 对话结束后容易丢失目标、决定和进度，新用户尤其难判断该从哪里继续','用户先在当前对话说明想做什么，Runtime 保存可辨认的意图并上报工作事实；需要用户决定的由用户在 Web 确认，满足当前约定后显式收尾，Molis Work 持续保存共同进度。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,100,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('WEB','molis-work-v1-demo','让用户打开页面就看懂目标和下一步','用户不用理解内部协议，也能看出项目要解决什么、当前进展、谁该做什么和为什么被阻塞','底层规则正确并不代表产品容易理解；信息组织混乱会让用户放弃继续使用','用户打开项目后先看到目标树和当前目标，再按结果、完成标准、推进情况和历史阅读；搜索、状态筛选和待决定事项都放在统一导航中。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,70,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('WEB-SCAN','molis-work-v1-demo','打开项目后三秒内认出当前目标和阻塞','用户不用点进详情，也能从列表看出现在该看哪条 Goal、它卡在哪里','首屏如果只堆标题，用户仍然要逐条点开才能判断下一步','列表把当前目标、状态和阻塞放在同一行；多层子 Goal 用缩进表达归属，不把状态列推歪。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,68,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('WEB-SCAN-NEST','molis-work-v1-demo','再下一层仍能看出归属','五层树里最深的一行仍然明显属于上一层，不和旁边的叶子抢位置','只演示到四层时，更深的真实项目树仍然可能挤成一团','继续用同一套缩进，不另做编号体系。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,64,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('WEB-SCAN-ROW','molis-work-v1-demo','子 Goal 标题比父 Goal 更靠右，状态仍对齐','四层 Goal 树扫一眼就能分清父子，状态列仍在同一条竖线上','只有折叠箭头、标题却和父行齐平，多层树会读成平铺清单','标题簇按归属深度每次右移 16px；没有短码的子行仍给编号留位，避免标题跑到父行左边。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,66,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "goals"("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES('WORKSPACE','molis-work-v1-demo','让人能在同一工作台看清并推进 Goal','用户在一个窗口里查看 Goal Tree、Focus、Graph 和 Goal-bound Runtime','频繁切换页面、终端和 AI 对话会打断判断，也让 Goal 与执行 Session 脱节','桌面端把 Goal 导航、当前工作和 Runtime 组合成连续工作面；网页保留同一份项目事实与独立访问方式。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,94,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-ADOPTION::parent','914ffcd8187736b253fd229cd9daca3fb2ca9dfad76bb8f884b64a51b50a2e57','{"relation_id":"relation-9b1f993a-b73e-4221-bd76-5b8180a154e9","observed_event_cursor":14}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-CORE::parent','d721eec9435e64d875587f3a84b06a365df268e4cd0dede1a60ebb40e97c613e','{"relation_id":"relation-154659ed-b0a7-40a4-85ee-e2dd1c502fde","observed_event_cursor":17}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-DECIDE::dep::DESKTOP','14440157515ade20f1cb6bd3518775d4799503763f469dbeb84efda5abbe935d','{"relation_id":"relation-9fe341f0-cb19-47c4-987b-f5bf700f59a9","observed_event_cursor":41}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-DECIDE::parent','254894928beddcb044db452b70e67ce8796d33668c9c999181ffaba31519f511','{"relation_id":"relation-4db9ca93-63cd-4e3f-8a38-8570323a41fc","observed_event_cursor":40}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-DESKTOP::dep::CORE','1b6aec580036db1e38dfad9185d325aed7922570a419d32d3ffab915449cda9a','{"relation_id":"relation-079a08ff-ab7a-4db9-b126-e72cf5465f09","observed_event_cursor":37}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-DESKTOP::parent','9b34f3858142959ce8f5e6bb4a548188ab2452bbfa222477ae082bd7c98669b2','{"relation_id":"relation-b987903a-159f-4124-a601-38f7162d08ab","observed_event_cursor":36}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-DOCS::dep::ONBOARDING','fe5fc0e8f9d7ec1726164934ffab615ac128afd8e626427dbd5822d6d4ce7be5','{"relation_id":"relation-0208ba4c-102b-45bf-b185-b78aa6e8e912","observed_event_cursor":52}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-DOCS::parent','7f5c4aacedae414872baa348c56a2c4d72273d75c0a51df23bc6f09d343f53fc','{"relation_id":"relation-9145cfbe-cdd4-413c-b409-d41891579308","observed_event_cursor":51}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-DROPPED::parent','4f717bbd5483d43eb5bf20bb7f7e1696ce72e9ef04b7cd310adb5aa53a83356a','{"relation_id":"relation-8c653cea-a34c-4108-86a6-6496d1a92909","observed_event_cursor":55}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-GRAPH::dep::CORE','982f7074940763bdb615a712651f11c4905036fc4a82275c1410eb493fa773b3','{"relation_id":"relation-ba1e269d-18b3-4e04-b25d-3a23d0d16cfa","observed_event_cursor":33}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-GRAPH::parent','a6dc84ed100fd4201c0c9f397dbf9c5e64e71464f492bd17c3fde182b9bcea58','{"relation_id":"relation-0768608b-50b3-4261-9497-835e6c1bef14","observed_event_cursor":32}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-INTERFACES::dep::CORE','29625fe5e917fa6f024ccbd0c6962d112cccdae4a39f58f6c0b5ca8a3f1cf268','{"relation_id":"relation-48959c7e-fdf4-464a-8a4c-187f88d8743e","observed_event_cursor":21}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-INTERFACES::parent','e1046a1174abccee588c45356c7220d16dcd06f362111c504483065e3f0be234','{"relation_id":"relation-979ed680-2b58-4096-8304-45f5db94d978","observed_event_cursor":20}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-ONBOARDING::dep::RELEASE','cd6ab9ef58e13c46d36f469aff006907f5d4eee28c5b602cdedd285f6d42ed86','{"relation_id":"relation-2702625d-407c-427f-82e2-8c83708e0ec6","observed_event_cursor":48}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-ONBOARDING::parent','c97ca55216cc663147af12be561b6a49ca33396325a7797aab6837ef99590949','{"relation_id":"relation-7dfb5206-8e27-46a6-8bbd-b4d0755882d8","observed_event_cursor":47}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-PLATFORM::parent','0fd0d76077cf5599743f95e4d2340124165aed62219cb1ee601dbf6a712c94c7','{"relation_id":"relation-591512e4-512f-4b37-92a0-1fa3ff79f91f","observed_event_cursor":8}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-RELEASE::parent','0389c3eea1f660054a5732dd13930fee2e2531c7acef687830cc8115134641f9','{"relation_id":"relation-be3bb064-a8a0-4b59-9e37-576ad4394467","observed_event_cursor":44}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-RISK::dep::INTERFACES','891abded36861d3de56363f122df679ac68385bf51f1dd8237083404f76d0a81','{"relation_id":"relation-69962227-d655-4eec-8304-91516ab6f9d4","observed_event_cursor":25}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-RISK::parent','7b0732fe5f1101bd7fe7eb86cb991489e4e4553d268023c3e9d117369739f80c','{"relation_id":"relation-1e8000c8-517b-4cf1-8dea-15168e23a80b","observed_event_cursor":24}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-WEB-SCAN-NEST::parent','9bbfc2811692bd015359264c0f0bc9dbcee1b02f5dbc351513366336e2d2e97a','{"relation_id":"relation-d696bb2e-8d88-4a2a-bee5-97e28faf9690","observed_event_cursor":64}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-WEB-SCAN-ROW::parent','69b51b4669399efbfd60e99bd553fcd192b8e5eefeb680af5352cb1669f11c36','{"relation_id":"relation-8b657f4d-13c4-44e6-9d2a-81f929bd6825","observed_event_cursor":61}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-WEB-SCAN::parent','253d449bb829639f578d9aa5671e671c826f2a6730ed7141908b2e1354cc1478','{"relation_id":"relation-d4ad0701-4fb1-4cf7-8988-1cf4bcb741fe","observed_event_cursor":58}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-WEB::dep::INTERFACES','627972dce332cd0cf27f523ef7cd9f9d13028605cc8bcddf2ae9b12d2c9d4a4c','{"relation_id":"relation-787cf33b-945d-4f26-bdaf-6744275cf75a","observed_event_cursor":29}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-WEB::parent','65c3d23c5b088d37e366dd0f8ff542569252d13c4e9936f2d528eccead1f1345','{"relation_id":"relation-af85d178-92be-4804-a8e5-888eda9ee12f","observed_event_cursor":28}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-WORKSPACE::parent','d797f5384af091717827a01170a55ce8e984e742eac12bb5d0e5201c88b9e54d','{"relation_id":"relation-8588994e-4a0c-4b34-83dd-1835312b7598","observed_event_cursor":11}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:apply_goal_concern','demo-risk-open','937767a6b118cf044d9a0866a983163af2031b4617dd21b67676d8f16510326e','{"event_id":"gevt-22e97eed-190a-4af9-8c49-32b1f042fef8","observed_event_cursor":84,"recorded":true,"concern":{"concern_id":"gcon-e1ddd7c3-95a4-4f9d-9710-755699e104f1","event_id":"gevt-22e97eed-190a-4af9-8c49-32b1f042fef8","title":"README 仍指向已撤掉的启动命令","statement":"按文档复制的命令会启动旧入口，用户会以为安装失败。","scope":{"requirement_ids":["RISK-C1"],"event_ids":[],"concern_ids":[],"action":null},"blocks_closure":true,"status":"open","resolution_reason":null,"resolution_event_id":null,"cited_decision_id":null,"cited_subjects":[],"previous_status":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:configure_goal_events','demo-core-configure','fbd013c7a91b2cdb95e67574d01531252a0a80a95863247af1c936bb496f9bc0','{"config":{"project_id":"molis-work-v1-demo","goal_id":"CORE","version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"requirement_bindings":[{"type_id":"lifecycle","requirement_id":"CORE-C1"}],"updated_at":"2026-01-15T09:00:00.000Z","updated_by":"demo-user"},"event_id":"gevt-79d15b8c-e224-47ee-9858-5651aef0ca91","observed_event_cursor":69}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:configure_goal_events','demo-decide-configure','45409dfccdb380bf36ba6bc57f0ee695b27db17a23040e3d5ed9b7fa079c80ae','{"config":{"project_id":"molis-work-v1-demo","goal_id":"DECIDE","version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"requirement_bindings":[],"updated_at":"2026-01-15T09:00:00.000Z","updated_by":"demo-user"},"event_id":"gevt-6cbd9091-0b8d-4d53-a929-6ed4a0533e4c","observed_event_cursor":81}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:configure_goal_events','demo-desktop-configure','d207d0b08a8cd4442afaf9e72bd5c844dfabb013b7b1c3bfd6945b9ca42d009f','{"config":{"project_id":"molis-work-v1-demo","goal_id":"DESKTOP","version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"requirement_bindings":[],"updated_at":"2026-01-15T09:00:00.000Z","updated_by":"demo-user"},"event_id":"gevt-8d9132a6-4c6c-4332-ad45-1538920c1332","observed_event_cursor":78}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:configure_goal_events','demo-dropped-configure','8e13dbe718e9bd53dff4a733a87b0dc2a1618e9b12dcd09178de1932770d26b4','{"config":{"project_id":"molis-work-v1-demo","goal_id":"DROPPED","version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"requirement_bindings":[],"updated_at":"2026-01-15T09:00:00.000Z","updated_by":"demo-user"},"event_id":"gevt-94ca00a3-019b-4bd6-a0f5-ba1aeb067677","observed_event_cursor":90}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:configure_goal_events','demo-graph-configure','d7b2018434c46441046580e92e434b9f0c4d3d62567e28ec6ee869eb47f61ad5','{"config":{"project_id":"molis-work-v1-demo","goal_id":"GRAPH","version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"requirement_bindings":[],"updated_at":"2026-01-15T09:00:00.000Z","updated_by":"demo-user"},"event_id":"gevt-419ef40e-4b67-4b75-9977-92a6bfbec1b2","observed_event_cursor":85}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:configure_goal_events','demo-risk-configure','3829697d9bfc78a8c3d95a36d064b1b8b7abfaad66478e45c0912496e3631422','{"config":{"project_id":"molis-work-v1-demo","goal_id":"RISK","version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"requirement_bindings":[],"updated_at":"2026-01-15T09:00:00.000Z","updated_by":"demo-user"},"event_id":"gevt-380837f0-b074-4b1b-9b41-c1d3c3c8391a","observed_event_cursor":83}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:configure_goal_events','demo-v1-configure','fdb47314bde5ff4b4883bbf0451d61a77d3a8f24fb31f0114e3ed6c53c5608ee','{"config":{"project_id":"molis-work-v1-demo","goal_id":"V1","version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"requirement_bindings":[],"updated_at":"2026-01-15T09:00:00.000Z","updated_by":"demo-user"},"event_id":"gevt-f6e45caa-0d74-4196-8745-113c1b3a5bd6","observed_event_cursor":75}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-ADOPTION::identity','b4c820302bee9191c66871aa1f538c267148723a84b80447c238d3397fe93639','{"goal":{"goal_id":"ADOPTION","project_id":"molis-work-v1-demo","title":"让第一次接入从安装走到真实推进","outcome":"新用户从 README、安装和首次打开一路走到推进第一条 Goal","why":"只把程序装上不等于用户已经理解产品，更不等于完成第一次有效使用","business_logic":"公开文档先解释适用场景，再引导安装、连接 Runtime、选择项目并推进一条可执行 Goal。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":92,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":12}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-AUTO-CONNECT::identity','6246952e17ae2550216a09a7034d8f4ba4368e5f0468624faef1bb3367f5147a','{"goal":{"goal_id":"AUTO-CONNECT","project_id":"molis-work-v1-demo","title":"自动替用户选择最近使用的项目","outcome":"新对话少做一次项目确认","why":"早期方案希望用历史目录记录缩短首次连接步骤","business_logic":"新对话进入一个以前使用过的目录时，系统直接连接最近的项目，不再询问用户。这个方案可能选错项目，因此已经移入回收站，当前产品只展示候选并让用户决定。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":10,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":65}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-CORE::identity','4d1d36513614681bde3e3ea7a61477972769a5f5e8e7f577663af01085d42c34','{"goal":{"goal_id":"CORE","project_id":"molis-work-v1-demo","title":"让每项工作都有可信的完成依据","outcome":"用户能看到一项工作何时开始、做出了什么，以及为什么可以算完成","why":"只有进度标签而没有结果和完成依据，用户仍然无法相信工作真的完成了","business_logic":"Runtime 开始一项已约定的工作，并把进展和结果作为事实上报；每条要求都有当前结果支持、没有挡住收尾的 Concern 或待决定时，这项工作才能显式收尾并显示为已完成。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":90,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":15}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-DECIDE::identity','4fe594f26880333171f7c84f1ef334d83cf39442461c4fd495831ec39780cc88','{"goal":{"goal_id":"DECIDE","project_id":"molis-work-v1-demo","title":"决定首页先展示目标还是先展示 Runtime","outcome":"首次打开项目时，用户知道自己该先看目标树还是先开一条会话","why":"两个入口同时强调时，新用户会停在选择上","business_logic":"产品决定一个默认落点，另一个入口仍可从同一工作台到达。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":72,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":38}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-DESKTOP::identity','2a32d6210a67969623d4a21dad9aa307b37945a0e0abdf4f62eee96117a590cd','{"goal":{"goal_id":"DESKTOP","project_id":"molis-work-v1-demo","title":"把 Molis Work 作为不切窗口的主工作站","outcome":"用户在桌面端同时看到 Goal、下一步、完成要求和强绑定的 Runtime","why":"工作在 AI 对话里推进、状态在另一个页面查看，会增加切换成本并削弱人的掌控感","business_logic":"桌面端复用网页事实和 Runtime 能力，将全局控制放进 TitleBar，并为 List、Focus 与 Runtime 保留连续三栏。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":74,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":34}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-DOCS::identity','d5929ea1ff313ffc46ab029661dee58f21a448b4ab43623f99a4631e6cb241de','{"goal":{"goal_id":"DOCS","project_id":"molis-work-v1-demo","title":"让用户从 README 进入正确的使用方式","outcome":"用户先理解长程任务为何会跑偏，再看到 Molis Work 的闭环、桌面端和 Runtime 伴随方式","why":"功能清单无法建立需求感，也无法解释 Molis Work 与 Agent Orchestration 的边界","business_logic":"README 用痛点、核心思路和完整演示组织内容；截图来自 Mock 项目的真实网页与桌面页面。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":56,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":49}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-DROPPED::identity','5d929ef936a14bcffd5350beeb6824a2bfe7a925878392489690f0e518533fd1','{"goal":{"goal_id":"DROPPED","project_id":"molis-work-v1-demo","title":"在旧会话里自动启用 MCP","outcome":"接入后不必新开对话也能立刻调用工具","why":"早期希望减少一次重启，但旧会话读不到新接入","business_logic":"安装完成后在当前对话直接启用 MCP。这个方案会让人误以为安装失败，因此已经取消。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":20,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":53}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-GRAPH::identity','ea987baf28b44c30d47fdee77370b0e939e5fcc00a164c7455f0de3ca927c20f','{"goal":{"goal_id":"GRAPH","project_id":"molis-work-v1-demo","title":"让复杂 Goal 关系仍然一眼可读","outcome":"父子层级、前置依赖和当前焦点在复杂网络中仍有清楚的方向与落点","why":"列表适合顺序浏览，但复杂 Goal 的多层结构和跨分支依赖会在列表里变得难以判断","business_logic":"用户在 List 与 Graph 之间切换；Graph 只读取真实父子和依赖关系，以节点、分区和有向连线呈现。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":76,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":30}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-INTERFACES::identity','0a73d94260e157f1340bc8f2313d78ab61206ae97c62856c61d8466766848d15','{"goal":{"goal_id":"INTERFACES","project_id":"molis-work-v1-demo","title":"让不同 AI 对话看到同一项目进度","outcome":"用户换一个 Runtime 或新开对话后，仍能找到同一个项目的目标、进度和未完成工作","why":"如果每个入口各自记录状态，用户换一次对话就要重新解释整个项目","business_logic":"用户在当前对话明确选择项目后继续推进；其他 Runtime 也通过 Molis Work 读取和更新同一份项目事实，不会各自维护一套进度。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":80,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":18}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-ONBOARDING::identity','d6e7469b3eb1a555f9b52df26a389a90fd04cef64f90f11e6b5dd0424b7315e4','{"goal":{"goal_id":"ONBOARDING","project_id":"molis-work-v1-demo","title":"让用户第一次打开就完成有效操作","outcome":"用户首次进入后能选择项目、找到可做 Goal，并理解 Runtime 为什么绑定到它","why":"展示很多功能不等于用户知道第一步做什么，首屏需要直接引向一次有效推进","business_logic":"首次体验使用一份明确标记的 Mock 项目，沿着可做 Goal、下一步与 Runtime 归属完成一轮引导。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":58,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":45}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-PLATFORM::identity','64a255c80bf25e0d29e80aaa5c10be5c0486418461a27028c54cdd98409c7b22','{"goal":{"goal_id":"PLATFORM","project_id":"molis-work-v1-demo","title":"让项目事实成为不同 Runtime 的共同底座","outcome":"不同 AI、会话和插件按各自所有者读到同一份项目事实","why":"长程任务最容易在切换对话和 Runtime 后失去共同上下文","business_logic":"Molis Work 保存项目事实，每类事实由各自的插件负责；Runtime 经统一动作目录读取、执行工作并上报结果，不在各自会话里维护另一套项目记忆。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":96,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":6}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-RELEASE::identity','8172af28adf4033501d1391c893de182620a3615e186880e578bb7a25d85c691','{"goal":{"goal_id":"RELEASE","project_id":"molis-work-v1-demo","title":"让新用户安装后知道下一步怎么开始","outcome":"用户完成安装后知道如何启动页面、连接正在使用的 Runtime，以及为什么需要新开会话","why":"安装成功但不知道服务是否常驻、工具何时生效或下一步说什么，仍然会被理解成产品不可用","business_logic":"安装只放置 Molis Work 自己的程序，不偷偷修改项目或 Runtime；用户随后显式启用常驻服务、预览并确认 Runtime 接入，再在新会话中选择或创建项目开始使用。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":60,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":42}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-RISK::identity','15e8080eaf035db63f1c7f9bc7afb5ed23b43fdb87873cbde19bf1f6e63b9216','{"goal":{"goal_id":"RISK","project_id":"molis-work-v1-demo","title":"安装文档和真实接入步骤对不上","outcome":"接入说明与当前产品步骤一致，用户不会按过期文档操作","why":"文档仍写旧入口时，用户会以为产品坏了","business_logic":"对照当前安装、Runtime 接入和首次会话步骤，标出对不上的句子并改到同一条路径。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":78,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":22}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-V1::identity','18f31f88e834c1cb0de0760cb46404405186e6e1fea049836b645afe8270c666','{"goal":{"goal_id":"V1","project_id":"molis-work-v1-demo","title":"让第一次使用的人顺利完成一轮目标协作","outcome":"用户能把一个模糊想法变成清楚的目标树，并知道下一步、阻塞和完成依据","why":"AI 对话结束后容易丢失目标、决定和进度，新用户尤其难判断该从哪里继续","business_logic":"用户先在当前对话说明想做什么，Runtime 保存可辨认的意图并上报工作事实；需要用户决定的由用户在 Web 确认，满足当前约定后显式收尾，Molis Work 持续保存共同进度。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":100,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":4}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-WEB-SCAN-NEST::identity','a28e5a78df9f90718b8deee4a9ee13fcca780b52d8cb2f81c3e805e45738f269','{"goal":{"goal_id":"WEB-SCAN-NEST","project_id":"molis-work-v1-demo","title":"再下一层仍能看出归属","outcome":"五层树里最深的一行仍然明显属于上一层，不和旁边的叶子抢位置","why":"只演示到四层时，更深的真实项目树仍然可能挤成一团","business_logic":"继续用同一套缩进，不另做编号体系。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":64,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":62}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-WEB-SCAN-ROW::identity','7c4b4de2d72566ee2d48860c74b055a39a097afa6894dcaf7b6808e9a1f6808e','{"goal":{"goal_id":"WEB-SCAN-ROW","project_id":"molis-work-v1-demo","title":"子 Goal 标题比父 Goal 更靠右，状态仍对齐","outcome":"四层 Goal 树扫一眼就能分清父子，状态列仍在同一条竖线上","why":"只有折叠箭头、标题却和父行齐平，多层树会读成平铺清单","business_logic":"标题簇按归属深度每次右移 16px；没有短码的子行仍给编号留位，避免标题跑到父行左边。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":66,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":59}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-WEB-SCAN::identity','c14241c9147bb7794d9ae48a4b758e61397b17b07455cb44455205f7dfe5bf51','{"goal":{"goal_id":"WEB-SCAN","project_id":"molis-work-v1-demo","title":"打开项目后三秒内认出当前目标和阻塞","outcome":"用户不用点进详情，也能从列表看出现在该看哪条 Goal、它卡在哪里","why":"首屏如果只堆标题，用户仍然要逐条点开才能判断下一步","business_logic":"列表把当前目标、状态和阻塞放在同一行；多层子 Goal 用缩进表达归属，不把状态列推歪。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":68,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":56}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-WEB::identity','cbc7741f7462cf88b52f5052ec0ffd18b4e81327c84d0302834ff8fa8bc01b12','{"goal":{"goal_id":"WEB","project_id":"molis-work-v1-demo","title":"让用户打开页面就看懂目标和下一步","outcome":"用户不用理解内部协议，也能看出项目要解决什么、当前进展、谁该做什么和为什么被阻塞","why":"底层规则正确并不代表产品容易理解；信息组织混乱会让用户放弃继续使用","business_logic":"用户打开项目后先看到目标树和当前目标，再按结果、完成标准、推进情况和历史阅读；搜索、状态筛选和待决定事项都放在统一导航中。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":70,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":26}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal','demo-goal-WORKSPACE::identity','aa17e687936cea9277a55129222dd6c76cd2bb086ce988f1f5711fd18b7404a3','{"goal":{"goal_id":"WORKSPACE","project_id":"molis-work-v1-demo","title":"让人能在同一工作台看清并推进 Goal","outcome":"用户在一个窗口里查看 Goal Tree、Focus、Graph 和 Goal-bound Runtime","why":"频繁切换页面、终端和 AI 对话会打断判断，也让 Goal 与执行 Session 脱节","business_logic":"桌面端把 Goal 导航、当前工作和 Runtime 组合成连续工作面；网页保留同一份项目事实与独立访问方式。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":94,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"observed_event_cursor":9}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-ADOPTION','81f3c98132f5c9ae676722938e25bd6864b8d775e28747fddf9b55b048c25965','{"goal":{"goal_id":"ADOPTION","project_id":"molis-work-v1-demo","title":"让第一次接入从安装走到真实推进","outcome":"新用户从 README、安装和首次打开一路走到推进第一条 Goal"},"replayed":false,"observed_event_cursor":14,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-AUTO-CONNECT','0e2d758716f55b8ac0129d2003b765a96b8e7d6db083cf303d61dc0a34854f26','{"goal":{"goal_id":"AUTO-CONNECT","project_id":"molis-work-v1-demo","title":"自动替用户选择最近使用的项目","outcome":"新对话少做一次项目确认"},"replayed":false,"observed_event_cursor":66,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-CORE','0645658df31e580a3341d8621643136783db150fb09ec494d5226b08cfc9b621','{"goal":{"goal_id":"CORE","project_id":"molis-work-v1-demo","title":"让每项工作都有可信的完成依据","outcome":"用户能看到一项工作何时开始、做出了什么，以及为什么可以算完成"},"replayed":false,"observed_event_cursor":17,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-DECIDE','b23c75ac36199057e9790eedf53982c17b55cff2b8d3b2b85324251ac3d3f3f8','{"goal":{"goal_id":"DECIDE","project_id":"molis-work-v1-demo","title":"决定首页先展示目标还是先展示 Runtime","outcome":"首次打开项目时，用户知道自己该先看目标树还是先开一条会话"},"replayed":false,"observed_event_cursor":41,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-DESKTOP','56b445649c79b9e4183dff1f3db276968c861f133545847752a509ab16801c9a','{"goal":{"goal_id":"DESKTOP","project_id":"molis-work-v1-demo","title":"把 Molis Work 作为不切窗口的主工作站","outcome":"用户在桌面端同时看到 Goal、下一步、完成要求和强绑定的 Runtime"},"replayed":false,"observed_event_cursor":37,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-DOCS','21f1246177a32fa00c6fb229cbd224acdac39e56fa3298b4b06c9a9eb481637e','{"goal":{"goal_id":"DOCS","project_id":"molis-work-v1-demo","title":"让用户从 README 进入正确的使用方式","outcome":"用户先理解长程任务为何会跑偏，再看到 Molis Work 的闭环、桌面端和 Runtime 伴随方式"},"replayed":false,"observed_event_cursor":52,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-DROPPED','0fea1df56953f26b0c128ba77eada3028ffbc5ef5faca14f351f11fc03961235','{"goal":{"goal_id":"DROPPED","project_id":"molis-work-v1-demo","title":"在旧会话里自动启用 MCP","outcome":"接入后不必新开对话也能立刻调用工具"},"replayed":false,"observed_event_cursor":55,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-GRAPH','82dd13518df973feea115ff3ecdaf1fb75b46241a6629a8f54dda4253ae431ec','{"goal":{"goal_id":"GRAPH","project_id":"molis-work-v1-demo","title":"让复杂 Goal 关系仍然一眼可读","outcome":"父子层级、前置依赖和当前焦点在复杂网络中仍有清楚的方向与落点"},"replayed":false,"observed_event_cursor":33,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-INTERFACES','8f8c8c8316ec6c7523184c07d313812ff16bb96c913bd74791bf55cb14c0ab2f','{"goal":{"goal_id":"INTERFACES","project_id":"molis-work-v1-demo","title":"让不同 AI 对话看到同一项目进度","outcome":"用户换一个 Runtime 或新开对话后，仍能找到同一个项目的目标、进度和未完成工作"},"replayed":false,"observed_event_cursor":21,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-ONBOARDING','e882398efc2180d253e9bf3811c2d3e8b6581b0bacd45989d61e83f8cc218f23','{"goal":{"goal_id":"ONBOARDING","project_id":"molis-work-v1-demo","title":"让用户第一次打开就完成有效操作","outcome":"用户首次进入后能选择项目、找到可做 Goal，并理解 Runtime 为什么绑定到它"},"replayed":false,"observed_event_cursor":48,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-PLATFORM','6e33af0dafadee7280ac41ec5d4c12bc7b52149ed82fe4e769e45b7b5d42b1e2','{"goal":{"goal_id":"PLATFORM","project_id":"molis-work-v1-demo","title":"让项目事实成为不同 Runtime 的共同底座","outcome":"不同 AI、会话和插件按各自所有者读到同一份项目事实"},"replayed":false,"observed_event_cursor":8,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-RELEASE','7d4a41e451ee03e699054d3ef937225f7e8a7a59bd39a8db67229e530d39b5e8','{"goal":{"goal_id":"RELEASE","project_id":"molis-work-v1-demo","title":"让新用户安装后知道下一步怎么开始","outcome":"用户完成安装后知道如何启动页面、连接正在使用的 Runtime，以及为什么需要新开会话"},"replayed":false,"observed_event_cursor":44,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-RISK','abe0715e7f5fcbbd68b8e5dddaf3cad8eb0dbfdb79d04a3864425e5fe1ce905a','{"goal":{"goal_id":"RISK","project_id":"molis-work-v1-demo","title":"安装文档和真实接入步骤对不上","outcome":"接入说明与当前产品步骤一致，用户不会按过期文档操作"},"replayed":false,"observed_event_cursor":25,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-V1','b95594454b0f1bcd985de96c90c7ca9b9b301dbd951f4d6ad110820e8cdaa267','{"goal":{"goal_id":"V1","project_id":"molis-work-v1-demo","title":"让第一次使用的人顺利完成一轮目标协作","outcome":"用户能把一个模糊想法变成清楚的目标树，并知道下一步、阻塞和完成依据"},"replayed":false,"observed_event_cursor":5,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-WEB','f912bdae36454dc4f439d314ee93e9c1801b1531f39bf3897fcc6008b80b4c58','{"goal":{"goal_id":"WEB","project_id":"molis-work-v1-demo","title":"让用户打开页面就看懂目标和下一步","outcome":"用户不用理解内部协议，也能看出项目要解决什么、当前进展、谁该做什么和为什么被阻塞"},"replayed":false,"observed_event_cursor":29,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-WEB-SCAN','946868f0f6a192bea827bfc5408203ca73bbb4483fda70cac8fba3c89a897fbf','{"goal":{"goal_id":"WEB-SCAN","project_id":"molis-work-v1-demo","title":"打开项目后三秒内认出当前目标和阻塞","outcome":"用户不用点进详情，也能从列表看出现在该看哪条 Goal、它卡在哪里"},"replayed":false,"observed_event_cursor":58,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-WEB-SCAN-NEST','232f9f05b349b258e736e54ff323f3e9e8325878527cfc6a7eb2563d2bce39c8','{"goal":{"goal_id":"WEB-SCAN-NEST","project_id":"molis-work-v1-demo","title":"再下一层仍能看出归属","outcome":"五层树里最深的一行仍然明显属于上一层，不和旁边的叶子抢位置"},"replayed":false,"observed_event_cursor":64,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-WEB-SCAN-ROW','530e2adc0c85348ca2ec28a0c46a87954c26dfd2e1e8a5ea0a09557a57561a74','{"goal":{"goal_id":"WEB-SCAN-ROW","project_id":"molis-work-v1-demo","title":"子 Goal 标题比父 Goal 更靠右，状态仍对齐","outcome":"四层 Goal 树扫一眼就能分清父子，状态列仍在同一条竖线上"},"replayed":false,"observed_event_cursor":61,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:create_goal_intent','demo-goal-WORKSPACE','cfe7a98d9c7eeb3cfaf65da0aabf93c73bca7368b2884046daf9c883b3f540b3','{"goal":{"goal_id":"WORKSPACE","project_id":"molis-work-v1-demo","title":"让人能在同一工作台看清并推进 Goal","outcome":"用户在一个窗口里查看 Goal Tree、Focus、Graph 和 Goal-bound Runtime"},"replayed":false,"observed_event_cursor":11,"recorded":true,"completion_effect":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:record_goal_note','demo-core-note','d10db9df0d307ca6fed8543a9850d95fa72c716fbec53e4689711d645aef48ca','{"event_id":"gevt-2179e86c-bd76-4c0a-a826-65a37bf0f0ae","observed_event_cursor":72,"recorded":true}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:record_goal_note','demo-interfaces-note','0451fdbc722c9e7b773fc475a9f37306cb6a0881a4faf0512e6d5f2f9ae71ca4','{"event_id":"gevt-c8fa86d9-786a-4e6f-9305-e8e702eeb239","observed_event_cursor":74,"recorded":true}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:record_goal_note','demo-release-note','bbf928857239743d63f77f19bbae8af9f45d7f6c99c1a4b5e5e7e34d8be46093','{"event_id":"gevt-9a7f6109-86b0-40f9-92f2-17ceeb09f4c5","observed_event_cursor":67,"recorded":true}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:report_goal_events','demo-core-report','f00581d28e2ae7b6b07b5d4f01fa6cb395f5e785f7268d2334aa6c8bb3a083d5','{"events":[{"event_id":"gevt-2e834d72-e9ce-4ae2-bd89-c037815a21d7","project_id":"molis-work-v1-demo","goal_id":"CORE","title":"生命周期记录已接通","actor_id":"demo-user","actor_kind":"user","received_at":"2026-01-15T09:00:00.000Z","journal_seq":70,"config_version":1,"kind":"report","type":{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]},"payload":{"result":"从约定、报告到收尾形成完整记录"}}],"observed_event_cursor":71}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:report_goal_events','demo-desktop-report','f555904cc115a5ce18974ae34c99a3ae81e56297c17d5598875cd89cd13cde0b','{"events":[{"event_id":"gevt-49707344-2ce1-4b08-9744-aa4dafba63e1","project_id":"molis-work-v1-demo","goal_id":"DESKTOP","title":"工作台主栏已经对齐","actor_id":"demo-user","actor_kind":"user","received_at":"2026-01-15T09:00:00.000Z","journal_seq":79,"config_version":1,"kind":"report","type":{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]},"payload":{"result":"目录、舞台和标签已经能在同一窗口里切换。"}}],"observed_event_cursor":80}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:report_goal_events','demo-graph-report','e8159e1d7e511018f9c6657da236ad6547dcda8eef89b8064f75bf23d8aab336','{"events":[{"event_id":"gevt-687682e6-0596-49f1-b3d1-efa8890d7d2e","project_id":"molis-work-v1-demo","goal_id":"GRAPH","title":"画布已能读出依赖方向","actor_id":"demo-user","actor_kind":"user","received_at":"2026-01-15T09:00:00.000Z","journal_seq":86,"config_version":1,"kind":"report","type":{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]},"payload":{"result":"父子和前置关系都来自真实记录。"}}],"observed_event_cursor":87}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:report_goal_events','demo-v1-report','227d3b04da217c7f174703ed16e978c926f0be1638d7338fbf91919867e24684','{"events":[{"event_id":"gevt-46020f47-4c57-4540-8112-8ab4208622d5","project_id":"molis-work-v1-demo","goal_id":"V1","title":"目标树已经能看出下一步","actor_id":"demo-user","actor_kind":"user","received_at":"2026-01-15T09:00:00.000Z","journal_seq":76,"config_version":1,"kind":"report","type":{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]},"payload":{"result":"列表、画布和看板都有真实内容可扫。"}}],"observed_event_cursor":77}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:request_goal_decision','demo-decide-ask','ef19ebc8473ad4787e38ee194b4e2a81f5718fbe430ac8c3359412e6e2c71ce1','{"event_id":"gevt-c99dabf0-ddf4-4a29-8ede-b5066f413983","observed_event_cursor":82,"recorded":true,"decision_request":{"request_id":"gdec-req-655c5da7-3a53-4a63-8f74-3f8dafffb376","event_id":"gevt-c99dabf0-ddf4-4a29-8ede-b5066f413983","question":"第一次打开项目时，默认落在 Goal 列表还是默认打开一条 Session？","options":[{"option_id":"goals","label":"先看目标树","impact":"用户先理解现在做什么，再决定开哪条会话"},{"option_id":"session","label":"先开 Session","impact":"用户立刻回到对话，但可能还没看清目标"}],"scope":{"requirement_ids":["DECIDE-C1"],"event_ids":[],"concern_ids":[],"action":null},"purpose":"suggestion","proposed_change":null,"commitment":null,"status":"pending","created_at":"2026-01-15T09:00:00.000Z"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:set_active_goal','demo-active-goal','a0f2141dac542f74f89561317bee608494e61f23d9e1338db5b82ea80dd1bd33','{"active_goal_id":"V1","observed_event_cursor":92}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:set_goal_archived','demo-archive-graph','a0fa97583d513e087f83a509d19dd187fdbaa4e80bd837c1840d6312f24d157c','{"goal":{"goal_id":"GRAPH","project_id":"molis-work-v1-demo","title":"让复杂 Goal 关系仍然一眼可读","outcome":"父子层级、前置依赖和当前焦点在复杂网络中仍有清楚的方向与落点","why":"列表适合顺序浏览，但复杂 Goal 的多层结构和跨分支依赖会在列表里变得难以判断","business_logic":"用户在 List 与 Graph 之间切换；Graph 只读取真实父子和依赖关系，以节点、分区和有向连线呈现。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"satisfied","trashed_at":null,"trashed_by":null,"archived_at":"2026-01-15T09:00:00.000Z","archived_by":"demo-user","priority":76,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"active_goal_cleared":false,"observed_event_cursor":89}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:set_goal_trashed','demo-trash-auto-connect','e09dab789723f90c10135f877cdad6f0228d3281c031e8f2c179ed069aa808d9','{"status":"trashed","goal":{"goal_id":"AUTO-CONNECT","project_id":"molis-work-v1-demo","title":"自动替用户选择最近使用的项目","outcome":"新对话少做一次项目确认","why":"早期方案希望用历史目录记录缩短首次连接步骤","business_logic":"新对话进入一个以前使用过的目录时，系统直接连接最近的项目，不再询问用户。这个方案可能选错项目，因此已经移入回收站，当前产品只展示候选并让用户决定。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":"2026-01-15T09:00:00.000Z","trashed_by":"demo-user","archived_at":null,"archived_by":null,"priority":10,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"active_goal_cleared":false,"deactivated_relation_ids":[],"restored_relation_ids":[],"pending_relation_ids":[],"observed_event_cursor":68}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:submit_goal_event_closure','demo-core-close','fa37384da609aff7c2712e5d1fac7f016984236dad4824a657c81bd70d00e033','{"event_id":"gevt-7861ede3-4b2c-4e08-ba49-099f2b7f1f5d","observed_event_cursor":73,"recorded":true,"completion_applied":true,"work_status":"completed","unmet_reasons":[],"closure":{"closure_id":"gclo-953f27aa-8021-4140-b2dc-cb24c553d12e","event_id":"gevt-7861ede3-4b2c-4e08-ba49-099f2b7f1f5d","kind":"complete","result":"可用的生命周期记录","reason":"约定要求已有支持事实，演示收尾","recorded":true,"completion_applied":true,"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1,"unmet_reasons":[],"superseded":false,"superseded_reason":null,"recorded_at":"2026-01-15T09:00:00.000Z","acceptance_round":1}}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:submit_goal_event_closure','demo-dropped-cancel','02db29a4db2c28d40e748fbf95297a1c2dff764a9bf30d22fa7a97c42eb5d22d','{"event_id":"gevt-5df54cc7-3987-4926-86a0-c950c51db87d","observed_event_cursor":91,"recorded":true,"completion_applied":false,"work_status":"cancelled","unmet_reasons":[],"closure":{"closure_id":"gclo-030d8ad5-3e71-4c88-8cd6-807f3702908e","event_id":"gevt-5df54cc7-3987-4926-86a0-c950c51db87d","kind":"cancel","result":null,"reason":"旧会话读不到新接入，会让人误以为安装失败","recorded":true,"completion_applied":false,"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1,"unmet_reasons":[],"superseded":false,"superseded_reason":null,"recorded_at":"2026-01-15T09:00:00.000Z","acceptance_round":null}}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:submit_goal_event_closure','demo-graph-close','792349da840b2b3e0356befdc69712d44eeb34a5d1d43da33e99ce798b98b95c','{"event_id":"gevt-a0b5df41-cf50-46d5-b6d3-f80fcd2c2d9e","observed_event_cursor":88,"recorded":true,"completion_applied":true,"work_status":"completed","unmet_reasons":[],"closure":{"closure_id":"gclo-c676361a-5a76-4471-a473-ffd5f8655c09","event_id":"gevt-a0b5df41-cf50-46d5-b6d3-f80fcd2c2d9e","kind":"complete","result":"画布关系已经可扫","reason":"演示收尾，把已完成关系图移出日常列表","recorded":true,"completion_applied":true,"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1,"unmet_reasons":[],"superseded":false,"superseded_reason":null,"recorded_at":"2026-01-15T09:00:00.000Z","acceptance_round":1}}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','web-user','io.molis.work.goals:initialize_board','project-catalog-create-molis-work-v1-demo','44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a','{"project_id":"molis-work-v1-demo","observed_event_cursor":3}','2026-01-15T09:00:00.000Z');
INSERT INTO "library_artifact_versions"("artifact_id","version","artifact_type_id","schema_version","producer_plugin_version","content_kind","payload_json","content_ref","content_digest","size_bytes","metadata_json","scope","availability","unavailable_reason","lifecycle_state","supersedes_version","created_by","created_at","archived_at","archived_by","origin_json","title","media_type","trace_json") VALUES('demo/core-lifecycle-record',1,'io.molis.work.document',2,'0.1.0','inline','{"content":"# 生命周期记录已接通\n\n从约定、报告到收尾形成完整记录\n","format":"markdown","source":"file","source_id":"生命周期记录.md:v1","source_url":null,"title":"生命周期记录已接通","warnings":[]}',NULL,'sha256:ed13d996053ecdf96834908c38ab3f29bb5fcb025d78a8c6637c89ad369a25b9',239,'{"goal_id":"CORE","origin":"demo-seed"}','personal','available',NULL,'active',NULL,'demo-user','2026-01-15T09:00:00.000Z',NULL,NULL,'{"kind":"imported","file_name":"生命周期记录.md"}','生命周期记录已接通','text/markdown','[]');
INSERT INTO "library_artifact_versions"("artifact_id","version","artifact_type_id","schema_version","producer_plugin_version","content_kind","payload_json","content_ref","content_digest","size_bytes","metadata_json","scope","availability","unavailable_reason","lifecycle_state","supersedes_version","created_by","created_at","archived_at","archived_by","origin_json","title","media_type","trace_json") VALUES('demo/core-lifecycle-record',2,'io.molis.work.document',2,'0.1.0','inline','{"content":"# 可用的生命周期记录\n\n约定要求已有支持事实，演示收尾\n","format":"markdown","source":"file","source_id":"生命周期记录.md:v2","source_url":null,"title":"可用的生命周期记录","warnings":[]}',NULL,'sha256:fa22a2ebab3f7427680667dd56516e60bff3ec43c66514cb29e4b1dc784c2846',239,'{"goal_id":"CORE","origin":"demo-seed"}','personal','available',NULL,'active',1,'demo-user','2026-01-15T09:00:00.000Z',NULL,NULL,'{"kind":"imported","file_name":"生命周期记录.md"}','可用的生命周期记录','text/markdown','[]');
INSERT INTO "library_artifact_versions"("artifact_id","version","artifact_type_id","schema_version","producer_plugin_version","content_kind","payload_json","content_ref","content_digest","size_bytes","metadata_json","scope","availability","unavailable_reason","lifecycle_state","supersedes_version","created_by","created_at","archived_at","archived_by","origin_json","title","media_type","trace_json") VALUES('feed-capture:feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1:feedoutrule-4a10e769-0757-416b-80c3-13dc5debce20',1,'io.molis.work.feed.capture',1,'0.1.0','inline','{"materials":[],"occurred_at":"2026-09-16T04:25:00.000Z","source":{"source_id":"feed-source-f34498b13c742f0d0f851765e48fe4d6","source_kind":"rss","source_label":"Solidot"},"summary":"用户要能从列表看出下一步、阻塞和完成依据。","tags":["RSS","产品设计"],"title":"第一次把模糊想法收成目标树","url":"https://www.solidot.org/"}',NULL,'sha256:361ce27361a114a6ccfabf31b04c3c14b595ff6e7c1b9ba30bf40dfc86e68727',361,'{"feed_item_id":"feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1","rule_id":"feedoutrule-4a10e769-0757-416b-80c3-13dc5debce20"}','personal','available',NULL,'active',NULL,'web-user','2026-01-15T09:00:00.000Z',NULL,NULL,'{"kind":"pinned","subject":{"kind":"feed_item","id":"feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1"},"revision":"833d515074a307ae"}','第一次把模糊想法收成目标树','application/json','[]');
INSERT INTO "library_artifacts"("artifact_id","project_id","owner_actor_id","producer_plugin_id","producer_binding_signature","created_at") VALUES('demo/core-lifecycle-record','molis-work-v1-demo','web-user','io.molis.work.artifacts','official-artifacts-binding','2026-01-15T09:00:00.000Z');
INSERT INTO "library_artifacts"("artifact_id","project_id","owner_actor_id","producer_plugin_id","producer_binding_signature","created_at") VALUES('feed-capture:feeditem-4f336fee-98c8-40b6-a1c7-69a190ce2ab1:feedoutrule-4a10e769-0757-416b-80c3-13dc5debce20','molis-work-v1-demo','web-user','io.molis.work.feed','official-feed-binding','2026-01-15T09:00:00.000Z');
INSERT INTO "listener_instances"("project_id","source_id","cursor_json","state","attempt","retry_at","last_error_code","lease_owner","lease_expires_at","updated_at") VALUES('molis-work-v1-demo','demo-github','{}','idle',0,NULL,NULL,NULL,NULL,'2026-09-16T06:18:00.000Z');
INSERT INTO "listener_instances"("project_id","source_id","cursor_json","state","attempt","retry_at","last_error_code","lease_owner","lease_expires_at","updated_at") VALUES('molis-work-v1-demo','demo-gmail','{}','idle',0,NULL,NULL,NULL,NULL,'2026-09-16T05:42:00.000Z');
INSERT INTO "listener_instances"("project_id","source_id","cursor_json","state","attempt","retry_at","last_error_code","lease_owner","lease_expires_at","updated_at") VALUES('molis-work-v1-demo','feed-source-5496d064f90938a458c4b1eec79d4a4b','{}','idle',0,NULL,NULL,NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "listener_instances"("project_id","source_id","cursor_json","state","attempt","retry_at","last_error_code","lease_owner","lease_expires_at","updated_at") VALUES('molis-work-v1-demo','feed-source-a12054cbb831b279742fac4cfe340b2b','{}','idle',0,NULL,NULL,NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "listener_instances"("project_id","source_id","cursor_json","state","attempt","retry_at","last_error_code","lease_owner","lease_expires_at","updated_at") VALUES('molis-work-v1-demo','feed-source-f34498b13c742f0d0f851765e48fe4d6','{}','idle',0,NULL,NULL,NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "plugin_event_cursors"("project_id","subscriber_plugin_id","subscriber_install_id","subscriber_generation","revision","source_plugin_id","event_type_id","type_version","delivered_sequence","state","retry_at","last_error_code","updated_at") VALUES('molis-work-v1-demo','io.molis.work.git','plugin-install-1f6466ff32b4232a98f50611ede69465','7394e672-cad8-4821-8f8a-f4b89a466070','913f7f53-6678-4bc7-91fb-5bb1b030f70f','io.molis.work.coding','io.molis.work.coding.file-changed',1,0,'idle',NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_event_cursors"("project_id","subscriber_plugin_id","subscriber_install_id","subscriber_generation","revision","source_plugin_id","event_type_id","type_version","delivered_sequence","state","retry_at","last_error_code","updated_at") VALUES('molis-work-v1-demo','io.molis.work.git','plugin-install-1f6466ff32b4232a98f50611ede69465','7394e672-cad8-4821-8f8a-f4b89a466070','fda25c9d-d92b-4a4e-938b-a8ed33c0d17b','io.molis.work.coding','io.molis.work.coding.run-updated',1,0,'idle',NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_event_cursors"("project_id","subscriber_plugin_id","subscriber_install_id","subscriber_generation","revision","source_plugin_id","event_type_id","type_version","delivered_sequence","state","retry_at","last_error_code","updated_at") VALUES('molis-work-v1-demo','io.molis.work.git','plugin-install-1f6466ff32b4232a98f50611ede69465','7394e672-cad8-4821-8f8a-f4b89a466070','b2582ceb-5ef4-4113-a251-3f8a489ff15c','io.molis.work.coding','io.molis.work.coding.workspace-invalidated',1,0,'idle',NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_input_groups"("project_id","plugin_id","group_id","updated_at") VALUES('molis-work-v1-demo','io.molis.work.diff','snapshots','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_port_bindings"("project_id","target_plugin_id","target_port","source_plugin_id","source_port","origin","created_at","updated_at") VALUES('molis-work-v1-demo','io.molis.work.diff','after','system.materials','after','default','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_port_bindings"("project_id","target_plugin_id","target_port","source_plugin_id","source_port","origin","created_at","updated_at") VALUES('molis-work-v1-demo','io.molis.work.diff','before','system.materials','before','default','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_port_bindings"("project_id","target_plugin_id","target_port","source_plugin_id","source_port","origin","created_at","updated_at") VALUES('molis-work-v1-demo','io.molis.work.diff','changeset','io.molis.work.coding','changeset','default','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_port_bindings"("project_id","target_plugin_id","target_port","source_plugin_id","source_port","origin","created_at","updated_at") VALUES('molis-work-v1-demo','io.molis.work.diff','git-changeset','io.molis.work.git','changeset','default','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.coding','official-coding-binding','coding',1,'["coding_input_versions","coding_inputs","coding_plan_drafts","coding_plan_versions","coding_saved_history","coding_sessions","coding_sessions_project_updated_idx","sync_dd6dd4054975ce4abcd1e12268d3_aggregate_editor_versions","sync_dd6dd4054975ce4abcd1e12268d3_context","sync_dd6dd4054975ce4abcd1e12268d3_replica_changes","sync_dd6dd4054975ce4abcd1e12268d3_replica_changes_key","sync_dd6dd4054975ce4abcd1e12268d3_replica_conflicts","sync_dd6dd4054975ce4abcd1e12268d3_replica_heads","sync_dd6dd4054975ce4abcd1e12268d3_replica_outbox","sync_dd6dd4054975ce4abcd1e12268d3_replica_resolutions","sync_dd6dd4054975ce4abcd1e12268d3_replica_state","sync_dd6dd4054975ce4abcd1e12268d3_track_0_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_0_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_0_update","sync_dd6dd4054975ce4abcd1e12268d3_track_1_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_1_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_1_update","sync_dd6dd4054975ce4abcd1e12268d3_track_2_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_2_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_2_update","sync_dd6dd4054975ce4abcd1e12268d3_track_3_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_3_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_3_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.feed','official-feed-binding','feed',1,'["feed_item_events","feed_item_events_project_item_idx","feed_items","feed_items_project_signal_idx","feed_items_project_source_external_idx","feed_items_project_updated_idx","feed_materials","feed_materials_project_item_idx","feed_missed_pulls","feed_out_rules","feed_out_rules_project_enabled_idx","feed_source_runs","feed_source_runs_project_source_idx","feed_sources","feed_sources_project_updated_idx","listener_deliveries","listener_deliveries_recovery_idx","listener_instances","signal_events","signal_events_project_source_idx","signal_revisions","signals","signals_project_source_observed_idx","source_events","source_events_project_source_idx","sync_14ff60cd5b3b2f8842d99bea7ef6_aggregate_editor_versions","sync_14ff60cd5b3b2f8842d99bea7ef6_context","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes_key","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_conflicts","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_heads","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_outbox","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_resolutions","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state","sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_delete","sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_insert","sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_update","sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_delete","sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_insert","sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_update","sync_522a4260e0bcbee35d4d9f85406c_aggregate_editor_versions","sync_522a4260e0bcbee35d4d9f85406c_context","sync_522a4260e0bcbee35d4d9f85406c_replica_changes","sync_522a4260e0bcbee35d4d9f85406c_replica_changes_key","sync_522a4260e0bcbee35d4d9f85406c_replica_conflicts","sync_522a4260e0bcbee35d4d9f85406c_replica_heads","sync_522a4260e0bcbee35d4d9f85406c_replica_outbox","sync_522a4260e0bcbee35d4d9f85406c_replica_resolutions","sync_522a4260e0bcbee35d4d9f85406c_replica_state","sync_522a4260e0bcbee35d4d9f85406c_track_0_delete","sync_522a4260e0bcbee35d4d9f85406c_track_0_insert","sync_522a4260e0bcbee35d4d9f85406c_track_0_update","sync_522a4260e0bcbee35d4d9f85406c_track_1_delete","sync_522a4260e0bcbee35d4d9f85406c_track_1_insert","sync_522a4260e0bcbee35d4d9f85406c_track_1_update","sync_522a4260e0bcbee35d4d9f85406c_track_2_delete","sync_522a4260e0bcbee35d4d9f85406c_track_2_insert","sync_522a4260e0bcbee35d4d9f85406c_track_2_update","sync_522a4260e0bcbee35d4d9f85406c_track_3_delete","sync_522a4260e0bcbee35d4d9f85406c_track_3_insert","sync_522a4260e0bcbee35d4d9f85406c_track_3_update","sync_522a4260e0bcbee35d4d9f85406c_track_4_delete","sync_522a4260e0bcbee35d4d9f85406c_track_4_insert","sync_522a4260e0bcbee35d4d9f85406c_track_4_update","sync_522a4260e0bcbee35d4d9f85406c_track_5_delete","sync_522a4260e0bcbee35d4d9f85406c_track_5_insert","sync_522a4260e0bcbee35d4d9f85406c_track_5_update","sync_daec9cf494e58d382d6262de3af9_aggregate_editor_versions","sync_daec9cf494e58d382d6262de3af9_context","sync_daec9cf494e58d382d6262de3af9_replica_changes","sync_daec9cf494e58d382d6262de3af9_replica_changes_key","sync_daec9cf494e58d382d6262de3af9_replica_conflicts","sync_daec9cf494e58d382d6262de3af9_replica_heads","sync_daec9cf494e58d382d6262de3af9_replica_outbox","sync_daec9cf494e58d382d6262de3af9_replica_resolutions","sync_daec9cf494e58d382d6262de3af9_replica_state","sync_daec9cf494e58d382d6262de3af9_track_0_delete","sync_daec9cf494e58d382d6262de3af9_track_0_insert","sync_daec9cf494e58d382d6262de3af9_track_0_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.goals','official-goals-binding','goals',1,'["acceptance_criteria","acceptance_goal_idx","boards","goal_event_agreements","goal_event_applied_decisions","goal_event_applied_decisions_goal_idx","goal_event_closures","goal_event_closures_goal_idx","goal_event_concerns","goal_event_concerns_goal_idx","goal_event_config_versions","goal_event_configs","goal_event_decision_requests","goal_event_decision_requests_goal_idx","goal_event_progress_summaries","goal_event_progress_summaries_goal_idx","goal_event_requirement_bindings","goal_event_state_owners","goal_event_state_owners_project_idx","goal_event_types","goal_event_types_goal_idx","goal_event_work_status","goal_relations","goal_requirement_links","goal_trash_one_open_per_goal","goal_trash_records","goal_trash_records_goal_idx","goal_trash_relation_records","goal_trash_relation_records_relation_idx","goal_tree_item_effects","goal_tree_item_effects_proposal_idx","goal_tree_proposal_items","goal_tree_proposal_items_project_idx","goal_tree_proposal_items_proposal_idx","goal_tree_proposals","goal_tree_proposals_project_idx","goal_tree_proposals_supersedes_idx","goal_work_events","goal_work_events_goal_seq_idx","goals","goals_archive_idx","goals_project_idx","goals_ready_idx","goals_trash_idx","input_bindings","relations_from_idx","relations_to_idx","sync_ebbb9ae341b34cbb8aedd65a41e6_aggregate_editor_versions","sync_ebbb9ae341b34cbb8aedd65a41e6_context","sync_ebbb9ae341b34cbb8aedd65a41e6_context_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_context_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_context_update","sync_ebbb9ae341b34cbb8aedd65a41e6_journal","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes_key","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_conflicts","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_heads","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_outbox","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_resolutions","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state","sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.inbox','official-inbox-binding','inbox',1,'["inbox_scene_bindings"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.risk','official-risk-binding','risk',1,'["risk_editor_versions","risk_events","risk_events_risk_idx","risk_items","risk_items_status_idx","risk_links","risk_links_subject_idx","sync_57fe6903aad21582fd1bfbdd6011_aggregate_editor_versions","sync_57fe6903aad21582fd1bfbdd6011_context","sync_57fe6903aad21582fd1bfbdd6011_replica_changes","sync_57fe6903aad21582fd1bfbdd6011_replica_changes_key","sync_57fe6903aad21582fd1bfbdd6011_replica_conflicts","sync_57fe6903aad21582fd1bfbdd6011_replica_heads","sync_57fe6903aad21582fd1bfbdd6011_replica_outbox","sync_57fe6903aad21582fd1bfbdd6011_replica_resolutions","sync_57fe6903aad21582fd1bfbdd6011_replica_state","sync_57fe6903aad21582fd1bfbdd6011_track_0_delete","sync_57fe6903aad21582fd1bfbdd6011_track_0_insert","sync_57fe6903aad21582fd1bfbdd6011_track_0_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.schedule','official-schedule-binding','schedule',1,'["schedule_conversation_tasks","schedule_conversation_tasks_enabled_idx","schedule_conversation_turns","schedule_conversation_turns_task_idx","schedule_missed_runs","schedule_operation_occurrences","schedule_operations","schedule_plugin_reminders","schedule_plugin_reminders_owner","sync_fc44281fa4e6ae1ad919f15bea63_aggregate_editor_versions","sync_fc44281fa4e6ae1ad919f15bea63_context","sync_fc44281fa4e6ae1ad919f15bea63_replica_changes","sync_fc44281fa4e6ae1ad919f15bea63_replica_changes_key","sync_fc44281fa4e6ae1ad919f15bea63_replica_conflicts","sync_fc44281fa4e6ae1ad919f15bea63_replica_heads","sync_fc44281fa4e6ae1ad919f15bea63_replica_outbox","sync_fc44281fa4e6ae1ad919f15bea63_replica_resolutions","sync_fc44281fa4e6ae1ad919f15bea63_replica_state","sync_fc44281fa4e6ae1ad919f15bea63_track_0_delete","sync_fc44281fa4e6ae1ad919f15bea63_track_0_insert","sync_fc44281fa4e6ae1ad919f15bea63_track_0_update","sync_fc44281fa4e6ae1ad919f15bea63_track_1_delete","sync_fc44281fa4e6ae1ad919f15bea63_track_1_insert","sync_fc44281fa4e6ae1ad919f15bea63_track_1_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-15a5ea6c2bf72c9f3b7203ebd168072f','{"install_id":"plugin-install-15a5ea6c2bf72c9f3b7203ebd168072f","installation_generation":"aed92e69-9230-4c30-ad11-e05d6a541722","plugin_id":"io.molis.work.goals","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-goals-binding","manifest_digest":"fbbe0bbbf785e8c12663f7f8ca6c65e022200665475bf23cd4839c8fd567b5f6","deployment":"local","selected_entrypoint":"./index.js","grants":["acceptance:read","acceptance:report","actions:delegate","actions:invoke","artifacts:read","attention:read","attention:write","context-ledger:read","context-ledger:write","goals:decide","goals:read","goals:write","journal:project","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-1f6466ff32b4232a98f50611ede69465','{"install_id":"plugin-install-1f6466ff32b4232a98f50611ede69465","installation_generation":"7394e672-cad8-4821-8f8a-f4b89a466070","plugin_id":"io.molis.work.git","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-git-binding","manifest_digest":"c76b2b59256c33b3815a2c74ea1e92ce7a013f4a0633db187db615519c078f34","deployment":"local","selected_entrypoint":"./index.js","grants":["artifact:read","artifact:write","review:git-index","review:git-operation","storage:private","workspace:read"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-4cf31e639ff642433fc8607610c1a58d','{"install_id":"plugin-install-4cf31e639ff642433fc8607610c1a58d","installation_generation":"799628ad-3c63-477b-8906-f6ad4a7a7133","plugin_id":"io.molis.work.ppt","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-ppt-binding","manifest_digest":"7f506474948212f3adb05d5a9222dd130f59b0cfecef8a2418c854ec63fee461","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:delegate","artifact:read","artifact:write","model:invoke","ppt:read","ppt:write","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-4fdfcfd6d1db70e62f4224fae088eb1f','{"install_id":"plugin-install-4fdfcfd6d1db70e62f4224fae088eb1f","installation_generation":"36fbc99c-c1a1-4c2a-8357-75417be3ebed","plugin_id":"io.molis.work.form","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-form-binding","manifest_digest":"34e811b84e74fcc82bd30f0d5bade88c278fd158abd9bad0fd36829931e38d7d","deployment":"local","selected_entrypoint":"./index.js","grants":["artifact:read","artifact:write","form:read","form:submit","form:write","model:invoke","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-537d2d3be6d4ee6a1f86585c6e624a27','{"install_id":"plugin-install-537d2d3be6d4ee6a1f86585c6e624a27","installation_generation":"3f1e58dc-24e4-4d15-b275-a978f5bff4bd","plugin_id":"io.molis.work.pages","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-pages-binding","manifest_digest":"a8f1772489e8ebc8950f760853cbb07e0641b51dd7fc0ed991ef075349ce55df","deployment":"local","selected_entrypoint":"./index.js","grants":["artifact:read","artifact:write","goals:read","materials:read","model:invoke","pages:read","pages:write","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-622cc088255ca49281508f43304aa664','{"install_id":"plugin-install-622cc088255ca49281508f43304aa664","installation_generation":"3789d4bf-9a64-4d24-930d-c6d38830474c","plugin_id":"io.molis.work.dataset","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-dataset-binding","manifest_digest":"a38085b2b2581b003d3fbca60ecae22d0ba26f2b413eea97ebab141eec7ad3ad","deployment":"local","selected_entrypoint":"./index.js","grants":["artifact:read","artifact:write","dataset:read","dataset:write","model:invoke","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-6fc840a4ff1292e26de87e863c01467d','{"install_id":"plugin-install-6fc840a4ff1292e26de87e863c01467d","installation_generation":"756fc611-280f-4250-9ae0-312a087f1c95","plugin_id":"io.molis.work.native.workflows","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-workflows-binding","manifest_digest":"6f1603c118af084b452d56d89c3fbb9bb1ea99971f3929150b1d4d84e96b4e48","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:delegate","model:invoke","storage:private","workflows:read","workflows:write"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-7932faff44346fbb7b0b89911bd11e3a','{"install_id":"plugin-install-7932faff44346fbb7b0b89911bd11e3a","installation_generation":"85a3297c-7cb1-4ca9-af43-0ee3768e7adf","plugin_id":"io.molis.work.inbox","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-inbox-binding","manifest_digest":"1a1c05868089689de5257f8ea828d9c3087a15f7902112001e658947a5422511","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:delegate","attention:read","attention:write","evidence:read","feed:read","feed:write","functions:invoke","goals:read","inbox:read","inbox:write","journal:project","judgments:read","judgments:write","model:invoke","pages:read","pages:write","scenes:use","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-87f7cd49f3979409791d41e21b8fccc3','{"install_id":"plugin-install-87f7cd49f3979409791d41e21b8fccc3","installation_generation":"03fc641b-1f39-4846-8914-9f3e700fa5bc","plugin_id":"io.molis.work.work-brief","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-work-brief-binding","manifest_digest":"b04e9861ca8e2c482952e0d4d930a0c3231580be2e84f8b05fd8f1ea64a55b1a","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:delegate","artifact:read","artifact:write","projects:reach","storage:private","work-brief:read","work-brief:write"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-89fdd009a6009b63a534e1c415360402','{"install_id":"plugin-install-89fdd009a6009b63a534e1c415360402","installation_generation":"ce65da2d-0cd8-4723-8103-ee17e8fd293b","plugin_id":"io.molis.work.lingguang","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-lingguang-binding","manifest_digest":"a962e88440981c10b98bf9482857f351ed56aca13adc088bcc4ab3a42d11e1fb","deployment":"local","selected_entrypoint":"./index.js","grants":["lingguang:read","lingguang:write","materials:fetch","materials:read","model:invoke","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-9b090ee5406d4f5907d370339bdd8045','{"install_id":"plugin-install-9b090ee5406d4f5907d370339bdd8045","installation_generation":"fad82f8d-15de-4e81-a743-1432e115a4da","plugin_id":"io.molis.work.coding","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-coding-binding","manifest_digest":"90d812851657f01a729c1d70625e31335c837c920fde23d7035c6f5accc79ae0","deployment":"local","selected_entrypoint":"./index.js","grants":["acceptance:read","artifact:read","artifact:write","commands:read","goals:read","goals:write","knowledge:read","materials:read","model:invoke","model:read","review:git-integration","review:git-worktree","search:read","skills:read","storage:private","workspace:read"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-a2d0547d448030b70d0710e378775d51','{"install_id":"plugin-install-a2d0547d448030b70d0710e378775d51","installation_generation":"03394d35-828f-4838-9f64-6b6340c0af78","plugin_id":"io.molis.work.diff","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-diff-binding","manifest_digest":"48cf5ace89533a4412a484c64ef81ccf5d4fa7a1f74bb55b41fea93e50cd23a2","deployment":"local","selected_entrypoint":"./index.js","grants":["artifact:read"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-af5a48f1f1cc179a103e5e3a6b116dd4','{"install_id":"plugin-install-af5a48f1f1cc179a103e5e3a6b116dd4","installation_generation":"030e7eaf-fa63-4fd2-8e93-affed787950e","plugin_id":"io.molis.work.feed","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-feed-binding","manifest_digest":"6833db88e94a5bf33a102c29baf49ed6853a5b04eea7e32eff0b27d7d9ad6802","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:delegate","actions:invoke","artifact:write","attention:read","attention:write","connections:observe","connections:use","context-ledger:read","context-ledger:write","evidence:collect","evidence:read","feed:read","feed:write","functions:invoke","functions:manage","goals:read","goals:write","inbox:read","inbox:write","journal:project","judgments:read","judgments:write","model:invoke","plugins:read","scenes:use","schedule:read","schedule:write","sources:pull_connector","sources:pull_public_feed","sources:pull_query","sources:read_repository","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-ca555f34f4090939bc580012e756d92c','{"install_id":"plugin-install-ca555f34f4090939bc580012e756d92c","installation_generation":"2619be68-7b2a-42f0-9747-189c1b95391f","plugin_id":"io.molis.work.risk","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-risk-binding","manifest_digest":"82a15cd3228046ec6c852901070ae9b22ce3ef31f5f25d61214030008eafe754","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:delegate","risk:read","risk:write","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-da3726a85a96dceede918bef171fbc66','{"install_id":"plugin-install-da3726a85a96dceede918bef171fbc66","installation_generation":"b2ed41a0-618d-414c-8321-7eaf88327d66","plugin_id":"io.molis.work.schedule","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-schedule-binding","manifest_digest":"9400c2dca68c28abce6a627905aec2c309c9f1e51373fc97d258fcd3126efed0","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:invoke","agent:run","model:read","notifications:write","plugins:read","schedule:read","schedule:write","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.coding','official-coding-binding','0.1.0','90d812851657f01a729c1d70625e31335c837c920fde23d7035c6f5accc79ae0','{"plugin_id":"io.molis.work.coding","publisher_signature":"official-coding-binding","version":"0.1.0","manifest_digest":"90d812851657f01a729c1d70625e31335c837c920fde23d7035c6f5accc79ae0","manifest":"sha256:d59196e74ad15461033c769f1ddaaa4d079c0202a688bddd32a8fa2a5a6a7194","module_source":"sha256:e0f46b1f47ec0bee58e26025558194cb2fd233349be19258a43cafad08851113"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.dataset','official-dataset-binding','0.1.0','a38085b2b2581b003d3fbca60ecae22d0ba26f2b413eea97ebab141eec7ad3ad','{"plugin_id":"io.molis.work.dataset","publisher_signature":"official-dataset-binding","version":"0.1.0","manifest_digest":"a38085b2b2581b003d3fbca60ecae22d0ba26f2b413eea97ebab141eec7ad3ad","manifest":"sha256:2dba509415cdb6be660ff2e98f09ed0c736362c4157aa994cc97049de9b2ea48","module_source":"sha256:d311847682cfa063f26cd1339bc3768031e8a858cb238ba82083e3717c317168"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.diff','official-diff-binding','0.1.0','48cf5ace89533a4412a484c64ef81ccf5d4fa7a1f74bb55b41fea93e50cd23a2','{"plugin_id":"io.molis.work.diff","publisher_signature":"official-diff-binding","version":"0.1.0","manifest_digest":"48cf5ace89533a4412a484c64ef81ccf5d4fa7a1f74bb55b41fea93e50cd23a2","manifest":"sha256:678f99bed85fb6e1f8040b8c50040bc8155ebec05ab9e49a931630db3f0ab4f0","module_source":"sha256:a3aca2fc1c6fadbbb17f6f0834aa7fc1530c3365186f6a8a02df07b62ba0d270"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.feed','official-feed-binding','0.1.0','6833db88e94a5bf33a102c29baf49ed6853a5b04eea7e32eff0b27d7d9ad6802','{"plugin_id":"io.molis.work.feed","publisher_signature":"official-feed-binding","version":"0.1.0","manifest_digest":"6833db88e94a5bf33a102c29baf49ed6853a5b04eea7e32eff0b27d7d9ad6802","manifest":"sha256:1a133252276273c2f0aa0c393bfa55cab87a8912d091f5ef1d065e665478f613","module_source":"sha256:0103d37d0c30c48896bdc2f6901df0bf69a8af48fb3fcb31522df4e265018247"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.form','official-form-binding','0.1.0','34e811b84e74fcc82bd30f0d5bade88c278fd158abd9bad0fd36829931e38d7d','{"plugin_id":"io.molis.work.form","publisher_signature":"official-form-binding","version":"0.1.0","manifest_digest":"34e811b84e74fcc82bd30f0d5bade88c278fd158abd9bad0fd36829931e38d7d","manifest":"sha256:54d8412a4eddd19e85f59ea614275dc1144ae7ac57b0ab2f5c3e5e9a72d60f39","module_source":"sha256:ab330492e519e3939b5be57941ce78652f1c685e9b0fc1a861b1b50d7ae008fc"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.git','official-git-binding','0.1.0','c76b2b59256c33b3815a2c74ea1e92ce7a013f4a0633db187db615519c078f34','{"plugin_id":"io.molis.work.git","publisher_signature":"official-git-binding","version":"0.1.0","manifest_digest":"c76b2b59256c33b3815a2c74ea1e92ce7a013f4a0633db187db615519c078f34","manifest":"sha256:5d213316fdfa3c0f87d275b681deb6b1de62b0d3086702783aae8ecd2f8c8335","module_source":"sha256:89b7df4a05453b0aacdb09843887a68b902ef874ba419c6e7ae4024809d3619d"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.goals','official-goals-binding','0.1.0','fbbe0bbbf785e8c12663f7f8ca6c65e022200665475bf23cd4839c8fd567b5f6','{"plugin_id":"io.molis.work.goals","publisher_signature":"official-goals-binding","version":"0.1.0","manifest_digest":"fbbe0bbbf785e8c12663f7f8ca6c65e022200665475bf23cd4839c8fd567b5f6","manifest":"sha256:219d918a32baaba20d98186277c824b3b868f61d816a5e10edc1e84e45c13077","module_source":"sha256:351d3eeb14341371bfc558d917aab9548483996d21cdb602c9c116d1125bf8be"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.inbox','official-inbox-binding','0.1.0','1a1c05868089689de5257f8ea828d9c3087a15f7902112001e658947a5422511','{"plugin_id":"io.molis.work.inbox","publisher_signature":"official-inbox-binding","version":"0.1.0","manifest_digest":"1a1c05868089689de5257f8ea828d9c3087a15f7902112001e658947a5422511","manifest":"sha256:e2024806ae3d5b1ba771fecd4e9d912aee0757b806973a010ed0a643863005d6","module_source":"sha256:e98117e4fd6d1de012f86545a2f17e0f96d2c6cd9fd8624960d157edbbdcec78"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.lingguang','official-lingguang-binding','0.1.0','a962e88440981c10b98bf9482857f351ed56aca13adc088bcc4ab3a42d11e1fb','{"plugin_id":"io.molis.work.lingguang","publisher_signature":"official-lingguang-binding","version":"0.1.0","manifest_digest":"a962e88440981c10b98bf9482857f351ed56aca13adc088bcc4ab3a42d11e1fb","manifest":"sha256:37c3c00f96c2cfd9283ec7921ff1ecc4f92e6ceb97f8fa05303d4027128b6cfc","module_source":"sha256:28aae3d85531f925b3c82d6368ee7647422afeb4ef0023f3db3c0fb2b41c3d1e"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.native.workflows','official-workflows-binding','0.1.0','6f1603c118af084b452d56d89c3fbb9bb1ea99971f3929150b1d4d84e96b4e48','{"plugin_id":"io.molis.work.native.workflows","publisher_signature":"official-workflows-binding","version":"0.1.0","manifest_digest":"6f1603c118af084b452d56d89c3fbb9bb1ea99971f3929150b1d4d84e96b4e48","manifest":"sha256:d5ee7a73ca5c152fc3913b9f9a51212547e9d5bba4346ae2bc9e2ab6bdd2cd88","module_source":"sha256:8278198c7f1921c86f41747c67820aa6ddbba4759e2a0685ece0e79d374dba3f"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.pages','official-pages-binding','0.1.0','a8f1772489e8ebc8950f760853cbb07e0641b51dd7fc0ed991ef075349ce55df','{"plugin_id":"io.molis.work.pages","publisher_signature":"official-pages-binding","version":"0.1.0","manifest_digest":"a8f1772489e8ebc8950f760853cbb07e0641b51dd7fc0ed991ef075349ce55df","manifest":"sha256:6c8e18724988f773ecb7906e13a660dcd69f16059223da6806954eca4752a92f","module_source":"sha256:c19e5ff6f8b80850e81c5a9e301dbe12183945d536eae0e75f3a0e77f444ea6f"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.ppt','official-ppt-binding','0.1.0','7f506474948212f3adb05d5a9222dd130f59b0cfecef8a2418c854ec63fee461','{"plugin_id":"io.molis.work.ppt","publisher_signature":"official-ppt-binding","version":"0.1.0","manifest_digest":"7f506474948212f3adb05d5a9222dd130f59b0cfecef8a2418c854ec63fee461","manifest":"sha256:7e286decafcce3a7d5503b349f3634bd8a8d059691de13dcb1e384292c898917","module_source":"sha256:03538c421415ea518132efcd28dab5f117345954e9e34363cf646bf63913746f"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.risk','official-risk-binding','0.1.0','82a15cd3228046ec6c852901070ae9b22ce3ef31f5f25d61214030008eafe754','{"plugin_id":"io.molis.work.risk","publisher_signature":"official-risk-binding","version":"0.1.0","manifest_digest":"82a15cd3228046ec6c852901070ae9b22ce3ef31f5f25d61214030008eafe754","manifest":"sha256:80c2aa5f2bad6404ef415b799ab13a16fb18fa15e59fc9f0ec66b70070fc57d8","module_source":"sha256:42c73cc09f41ad108eb566fd9dec25f59e5b55dfcd6cf614fbc7cb1c88ea7280"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.schedule','official-schedule-binding','0.1.0','9400c2dca68c28abce6a627905aec2c309c9f1e51373fc97d258fcd3126efed0','{"plugin_id":"io.molis.work.schedule","publisher_signature":"official-schedule-binding","version":"0.1.0","manifest_digest":"9400c2dca68c28abce6a627905aec2c309c9f1e51373fc97d258fcd3126efed0","manifest":"sha256:6cf955cb74846ff73923039507d7760ab2056157bb5e67625dff0cb9b04c5a61","module_source":"sha256:bb79ba05b06a859ae3524943688a594b4a81d9d97698697d460ccdc3d9f957ca"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.work-brief','official-work-brief-binding','0.1.0','b04e9861ca8e2c482952e0d4d930a0c3231580be2e84f8b05fd8f1ea64a55b1a','{"plugin_id":"io.molis.work.work-brief","publisher_signature":"official-work-brief-binding","version":"0.1.0","manifest_digest":"b04e9861ca8e2c482952e0d4d930a0c3231580be2e84f8b05fd8f1ea64a55b1a","manifest":"sha256:93003fb77352dac1154f7e435fcca6ae51575549517bd81c061ab7384cb43816","module_source":"sha256:de4e9bac183062f82adc7c7311b41b361b0c3629d9c2dc5413942a9557ea6419"}');
INSERT INTO "process_items_replica_state"("id","device","cursor","applying") VALUES(1,'29b67439bee56ff6921fc49c96407b9a',0,0);
INSERT INTO "project_approvals_replica_changes"("seq","key") VALUES(1,'["molis-work-v1-demo","project_approvals","molis-work-v1-demo"]');
INSERT INTO "project_approvals_replica_changes"("seq","key") VALUES(2,'["molis-work-v1-demo","project_approvals","molis-work-v1-demo"]');
INSERT INTO "project_approvals_replica_state"("id","device","cursor","applying") VALUES(1,'8532c4f384151faea50b674fedfadd2d',0,0);
INSERT INTO "project_guidance_replica_state"("id","device","cursor","applying") VALUES(1,'32e9c697477876218cf9c32bcd569f3d',0,0);
INSERT INTO "project_review_decisions"("decision_id","project_id","request_id","request_key","record_json","recorded_at") VALUES('1f6e6ab9-fef3-4956-81ca-75792130bec7','molis-work-v1-demo','["system","system.acceptance","acceptance.decide",1,"system.acceptance","io.molis.work.goals/goal/CORE","f7bd224e3d051afa3bcac9b0f9423198"]','io.molis.work.goals/goal/CORE','{"actor_id":"demo-user","choice_fingerprint":"e1a350d7560560f71df34e8a03ad1dbb753c039205e09e399ad5ba898608467c","decided_at":"2026-01-15T09:00:00.000Z","decision":"apply","decision_id":"1f6e6ab9-fef3-4956-81ca-75792130bec7","note":null,"presentation":{"approver":{"kind":"person"},"choices":[{"accepts":["CORE-C1"],"availability":{"available":true},"id":"apply","label":{"literal":"认可所选要求"},"returns":[]}],"expires_at":null,"requirements":[{"evidence":[],"id":"CORE-C1","requires_person":false,"statement":"工作从约定、报告到收尾形成完整记录","target":{"owner":{"kind":"system","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"subject":{"id":"io.molis.work.goals/goal/CORE:CORE-C1","kind":"acceptance_requirement"},"version":"r1@demo-core-delivery"},"version":"1"}],"summary":"交付 demo-core-delivery · 认可所选要求"},"publisher_signature":"system:system.acceptance","reference":{"id":"[\"system\",\"system.acceptance\",\"acceptance.decide\",1,\"system.acceptance\",\"io.molis.work.goals/goal/CORE\",\"f7bd224e3d051afa3bcac9b0f9423198\"]","owner":{"kind":"trusted-decision","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"version":"18f3c1f9fdb864c3128ea7374f7f233d47f94b3d5e9e191edb62fdad0d49661a"},"request_key":"io.molis.work.goals/goal/CORE","review":{"requirements":[{"disposition":"accepted","evidence":[],"id":"CORE-C1","target":{"owner":{"kind":"system","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"subject":{"id":"io.molis.work.goals/goal/CORE:CORE-C1","kind":"acceptance_requirement"},"version":"r1@demo-core-delivery"},"version":"1"}],"target":{"owner":{"kind":"system","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"subject":{"id":"io.molis.work.goals/goal/CORE","kind":"acceptance_subject"},"version":"f40e28824f5a7675fbd5e668de352e82d85dbc9f67fec60a4366602ee3aeeae4"}},"source":{"actor_id":"demo-user","entry":{"conversation_ref":"demo:goals","message_ref":"demo:io.molis.work.goals/goal/CORE","source":"management"},"kind":"person"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_review_decisions"("decision_id","project_id","request_id","request_key","record_json","recorded_at") VALUES('ecb2a990-35d0-4fc4-b118-e14292442840','molis-work-v1-demo','["system","system.acceptance","acceptance.decide",1,"system.acceptance","io.molis.work.goals/goal/GRAPH","381e405dad5f0e65bd71a197854bbd83"]','io.molis.work.goals/goal/GRAPH','{"actor_id":"demo-user","choice_fingerprint":"d1236f76385c8040eb9a6cd7690f1936177da7ba573554577107faa525592a8f","decided_at":"2026-01-15T09:00:00.000Z","decision":"apply","decision_id":"ecb2a990-35d0-4fc4-b118-e14292442840","note":null,"presentation":{"approver":{"kind":"person"},"choices":[{"accepts":["GRAPH-C1"],"availability":{"available":true},"id":"apply","label":{"literal":"认可所选要求"},"returns":[]}],"expires_at":null,"requirements":[{"evidence":[],"id":"GRAPH-C1","requires_person":false,"statement":"复杂网络中的关系方向和阻塞节点可以直接辨认","target":{"owner":{"kind":"system","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"subject":{"id":"io.molis.work.goals/goal/GRAPH:GRAPH-C1","kind":"acceptance_requirement"},"version":"r1@demo-graph-delivery"},"version":"1"}],"summary":"交付 demo-graph-delivery · 认可所选要求"},"publisher_signature":"system:system.acceptance","reference":{"id":"[\"system\",\"system.acceptance\",\"acceptance.decide\",1,\"system.acceptance\",\"io.molis.work.goals/goal/GRAPH\",\"381e405dad5f0e65bd71a197854bbd83\"]","owner":{"kind":"trusted-decision","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"version":"b93a202efbec8108741f6d46c561126174770cd009986503cac9c324c66e316d"},"request_key":"io.molis.work.goals/goal/GRAPH","review":{"requirements":[{"disposition":"accepted","evidence":[],"id":"GRAPH-C1","target":{"owner":{"kind":"system","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"subject":{"id":"io.molis.work.goals/goal/GRAPH:GRAPH-C1","kind":"acceptance_requirement"},"version":"r1@demo-graph-delivery"},"version":"1"}],"target":{"owner":{"kind":"system","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"subject":{"id":"io.molis.work.goals/goal/GRAPH","kind":"acceptance_subject"},"version":"c8d2740b7024deaead61bb44b3f9a06d14471f2c9498d92260d42610bc7c2c6f"}},"source":{"actor_id":"demo-user","entry":{"conversation_ref":"demo:goals","message_ref":"demo:io.molis.work.goals/goal/GRAPH","source":"management"},"kind":"person"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_root"("project_id","created_at") VALUES('molis-work-v1-demo','2026-01-15T09:00:00.000Z');
INSERT INTO "schedule_action_bindings"("job_id","install_id","installation_generation","action_version") VALUES('job_22fa415f-d8fc-481e-bb25-8964f438080e','plugin-install-af5a48f1f1cc179a103e5e3a6b116dd4','030e7eaf-fa63-4fd2-8e93-affed787950e',1);
INSERT INTO "schedule_jobs"("job_id","plugin_id","capability_id","object_ref","title","recurrence_kind","interval_ms","next_due_at","enabled","lease_until","lease_token","last_wakeup_id","created_at","updated_at") VALUES('job_22fa415f-d8fc-481e-bb25-8964f438080e','io.molis.work.feed','feed.sources.wake','sources','拉取到期的 Feed 来源','interval',30000,'2026-01-15T09:00:00.000Z',1,NULL,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "source_events"("event_id","project_id","source_id","type","payload_json","at") VALUES('source-event-2741df5c-a8ba-48f5-8ba7-ec6e81f6c28c','molis-work-v1-demo','feed-source-f34498b13c742f0d0f851765e48fe4d6','source.created','{"status":"active","enabled":true}','2026-01-15T09:00:00.000Z');
INSERT INTO "source_events"("event_id","project_id","source_id","type","payload_json","at") VALUES('source-event-4f45f72e-3087-4baf-b6c6-20db9a156647','molis-work-v1-demo','demo-github','source.created','{"status":"disconnected","enabled":false}','2026-09-16T06:18:00.000Z');
INSERT INTO "source_events"("event_id","project_id","source_id","type","payload_json","at") VALUES('source-event-b650b041-8c9c-45c5-aa57-337e203805bb','molis-work-v1-demo','feed-source-a12054cbb831b279742fac4cfe340b2b','source.created','{"status":"active","enabled":true}','2026-01-15T09:00:00.000Z');
INSERT INTO "source_events"("event_id","project_id","source_id","type","payload_json","at") VALUES('source-event-dc8c22c7-6e1f-43f1-910d-a416e0fa29cc','molis-work-v1-demo','feed-source-5496d064f90938a458c4b1eec79d4a4b','source.created','{"status":"active","enabled":true}','2026-01-15T09:00:00.000Z');
INSERT INTO "source_events"("event_id","project_id","source_id","type","payload_json","at") VALUES('source-event-f62268e8-c6d3-42d4-964f-fd5a4dfb998c','molis-work-v1-demo','demo-gmail','source.created','{"status":"disconnected","enabled":false}','2026-09-16T05:42:00.000Z');
INSERT INTO "surface_corrections_replica_state"("id","device","cursor","applying") VALUES(1,'2796bc03f45cef5f326d3372eeafa8ee',0,0);
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_context"("id","project_id") VALUES(1,'molis-work-v1-demo');
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes"("seq","key") VALUES(1,'["molis-work-v1-demo","project_sources","molis-work-v1-demo"]');
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes"("seq","key") VALUES(2,'["molis-work-v1-demo","project_sources","molis-work-v1-demo"]');
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes"("seq","key") VALUES(3,'["molis-work-v1-demo","project_sources","molis-work-v1-demo"]');
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes"("seq","key") VALUES(4,'["molis-work-v1-demo","project_sources","molis-work-v1-demo"]');
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes"("seq","key") VALUES(5,'["molis-work-v1-demo","project_sources","molis-work-v1-demo"]');
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes"("seq","key") VALUES(6,'["molis-work-v1-demo","project_sources","molis-work-v1-demo"]');
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes"("seq","key") VALUES(7,'["molis-work-v1-demo","project_sources","molis-work-v1-demo"]');
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes"("seq","key") VALUES(8,'["molis-work-v1-demo","project_sources","molis-work-v1-demo"]');
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes"("seq","key") VALUES(9,'["molis-work-v1-demo","project_sources","molis-work-v1-demo"]');
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes"("seq","key") VALUES(10,'["molis-work-v1-demo","project_sources","molis-work-v1-demo"]');
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state"("id","device","cursor","applying") VALUES(1,'2b253a5cbdb4e1d0cd37f05bc819753b',0,0);
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_context"("id","project_id") VALUES(1,'molis-work-v1-demo');
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_changes"("seq","key") VALUES(1,'["molis-work-v1-demo","project_feed","molis-work-v1-demo"]');
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_changes"("seq","key") VALUES(2,'["molis-work-v1-demo","project_feed","molis-work-v1-demo"]');
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_changes"("seq","key") VALUES(3,'["molis-work-v1-demo","project_feed","molis-work-v1-demo"]');
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_changes"("seq","key") VALUES(4,'["molis-work-v1-demo","project_feed","molis-work-v1-demo"]');
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_changes"("seq","key") VALUES(5,'["molis-work-v1-demo","project_feed","molis-work-v1-demo"]');
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_changes"("seq","key") VALUES(6,'["molis-work-v1-demo","project_feed","molis-work-v1-demo"]');
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_changes"("seq","key") VALUES(7,'["molis-work-v1-demo","project_feed","molis-work-v1-demo"]');
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_changes"("seq","key") VALUES(8,'["molis-work-v1-demo","project_feed","molis-work-v1-demo"]');
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_changes"("seq","key") VALUES(9,'["molis-work-v1-demo","project_feed","molis-work-v1-demo"]');
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_changes"("seq","key") VALUES(10,'["molis-work-v1-demo","project_feed","molis-work-v1-demo"]');
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_changes"("seq","key") VALUES(11,'["molis-work-v1-demo","project_feed","molis-work-v1-demo"]');
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_changes"("seq","key") VALUES(12,'["molis-work-v1-demo","project_feed","molis-work-v1-demo"]');
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_state"("id","device","cursor","applying") VALUES(1,'5f9fad7eb297ff2fd29457a05734093f',0,0);
INSERT INTO "sync_57fe6903aad21582fd1bfbdd6011_context"("id","project_id") VALUES(1,'molis-work-v1-demo');
INSERT INTO "sync_57fe6903aad21582fd1bfbdd6011_replica_state"("id","device","cursor","applying") VALUES(1,'e6bfa7703906c01a7160905510905f00',0,0);
INSERT INTO "sync_daec9cf494e58d382d6262de3af9_context"("id","project_id") VALUES(1,'molis-work-v1-demo');
INSERT INTO "sync_daec9cf494e58d382d6262de3af9_replica_changes"("seq","key") VALUES(1,'["molis-work-v1-demo","feed_rule","feedoutrule-4a10e769-0757-416b-80c3-13dc5debce20"]');
INSERT INTO "sync_daec9cf494e58d382d6262de3af9_replica_state"("id","device","cursor","applying") VALUES(1,'891d3524084a26e6112769e727cb2bd1',0,0);
INSERT INTO "sync_dd6dd4054975ce4abcd1e12268d3_context"("id","project_id") VALUES(1,'molis-work-v1-demo');
INSERT INTO "sync_dd6dd4054975ce4abcd1e12268d3_replica_state"("id","device","cursor","applying") VALUES(1,'a8c5abcd88f655d76e138e8b7206e7d6',0,0);
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_context"("id","project_id") VALUES(1,'molis-work-v1-demo');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(1,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(2,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(3,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(4,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(5,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(6,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(7,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(8,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(9,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(10,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(11,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(12,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(13,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(14,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(15,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(16,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(17,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(18,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(19,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(20,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(21,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(22,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(23,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(24,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(25,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(26,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(27,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(28,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(29,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(30,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(31,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(32,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(33,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(34,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(35,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(36,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(37,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(38,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(39,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(40,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(41,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(42,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(43,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(44,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(45,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(46,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(47,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(48,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(49,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(50,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(51,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(52,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(53,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(54,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(55,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(56,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(57,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(58,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(59,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(60,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(61,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(62,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(63,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(64,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(65,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(66,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(67,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(68,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(69,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(70,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(71,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(72,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(73,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(74,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(75,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(76,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(77,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(78,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(79,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(80,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(81,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(82,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(83,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(84,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(85,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(86,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(87,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(88,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(89,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(90,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(91,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(92,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(93,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(94,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(95,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(96,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(97,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(98,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(99,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(100,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(101,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(102,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(103,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(104,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(105,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(106,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(107,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(108,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(109,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(110,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(111,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(112,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(113,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(114,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(115,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(116,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(117,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(118,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(119,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(120,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(121,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(122,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(123,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(124,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(125,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(126,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(127,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(128,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(129,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(130,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(131,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(132,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(133,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(134,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(135,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(136,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(137,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(138,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(139,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(140,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(141,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(142,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(143,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(144,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(145,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(146,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(147,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(148,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(149,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(150,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(151,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(152,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(153,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(154,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(155,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(156,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(157,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(158,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(159,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(160,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(161,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(162,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(163,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(164,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(165,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(166,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(167,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(168,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(169,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(170,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(171,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(172,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(173,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(174,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(175,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(176,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(177,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(178,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(179,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(180,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(181,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(182,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(183,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(184,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(185,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(186,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(187,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(188,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(189,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(190,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(191,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(192,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(193,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(194,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(195,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(196,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(197,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(198,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(199,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(200,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(201,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(202,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(203,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(204,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(205,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(206,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(207,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(208,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(209,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(210,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(211,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(212,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(213,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(214,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(215,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(216,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(217,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(218,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(219,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(220,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(221,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(222,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(223,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(224,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(225,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(226,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(227,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(228,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(229,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(230,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(231,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(232,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(233,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(234,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(235,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(236,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(237,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(238,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(239,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(240,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(241,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(242,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(243,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(244,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(245,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(246,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(247,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(248,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(249,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(250,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(251,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(252,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(253,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(254,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(255,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(256,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(257,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(258,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(259,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(260,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(261,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(262,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(263,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(264,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(265,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(266,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(267,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(268,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(269,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(270,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(271,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(272,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(273,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(274,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(275,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(276,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(277,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(278,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(279,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(280,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(281,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(282,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(283,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(284,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(285,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(286,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(287,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(288,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(289,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(290,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(291,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(292,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes"("seq","key") VALUES(293,'["molis-work-v1-demo","project_goals","molis-work-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state"("id","device","cursor","applying") VALUES(1,'312fc64a89f85ee81e0f6e89063ca5ff',0,0);
INSERT INTO "sync_fc44281fa4e6ae1ad919f15bea63_context"("id","project_id") VALUES(1,'molis-work-v1-demo');
INSERT INTO "sync_fc44281fa4e6ae1ad919f15bea63_replica_state"("id","device","cursor","applying") VALUES(1,'888ae85a70f30c4943ce1b4b53688369',0,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('acceptance_replica_changes',23);
INSERT INTO sqlite_sequence(name,seq) VALUES('artifacts_replica_changes',5);
INSERT INTO sqlite_sequence(name,seq) VALUES('attention_replica_changes',1);
INSERT INTO sqlite_sequence(name,seq) VALUES('events',109);
INSERT INTO sqlite_sequence(name,seq) VALUES('project_approvals_replica_changes',2);
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes',10);
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_522a4260e0bcbee35d4d9f85406c_replica_changes',12);
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_daec9cf494e58d382d6262de3af9_replica_changes',1);
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes',293);
CREATE INDEX acceptance_checks_by_subject ON acceptance_checks (subject_no, requirement_id, clock);
CREATE INDEX acceptance_decisions_by_subject ON acceptance_decisions (subject_no, requirement_id, clock);
CREATE INDEX acceptance_goal_idx ON acceptance_criteria(goal_id);
CREATE INDEX acceptance_replica_changes_key ON acceptance_replica_changes(key);
CREATE INDEX artifacts_replica_changes_key ON artifacts_replica_changes(key);
CREATE UNIQUE INDEX attention_entries_owned_subject_idx
      ON attention_entries(project_id, owner_plugin_id, subject_type, subject_id, reason) WHERE owner_plugin_id IS NOT NULL;
CREATE INDEX attention_entries_project_status_idx
      ON attention_entries(project_id, status, updated_at DESC, entry_id);
CREATE INDEX attention_entries_project_subject_idx
      ON attention_entries(project_id, subject_type, subject_id);
CREATE UNIQUE INDEX attention_entries_unassigned_subject_idx
      ON attention_entries(project_id, subject_type, subject_id, reason) WHERE owner_plugin_id IS NULL;
CREATE INDEX attention_events_project_entry_idx
      ON attention_events(project_id, entry_id, at, event_id);
CREATE INDEX attention_replica_changes_key ON attention_replica_changes(key);
CREATE INDEX builder_replica_changes_key ON builder_replica_changes(key);
CREATE INDEX coding_sessions_project_updated_idx
      ON coding_sessions(project_id, updated_at DESC, session_id);
CREATE INDEX context_edges_source_idx ON context_edges
    (scope_kind, scope_id, relation_type, json_extract(source_json, '$.module'), json_extract(source_json, '$.id'));
CREATE INDEX events_project_idx ON events(project_id, seq);
CREATE INDEX feed_item_events_project_item_idx
      ON feed_item_events(project_id, item_id, at, event_id);
CREATE UNIQUE INDEX feed_items_project_signal_idx
      ON feed_items(project_id, signal_id) WHERE signal_id IS NOT NULL;
CREATE UNIQUE INDEX feed_items_project_source_external_idx
      ON feed_items(project_id, source_id, external_id)
      WHERE source_id IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX feed_items_project_updated_idx
      ON feed_items(project_id, disposition, source_updated_at DESC);
CREATE INDEX feed_materials_project_item_idx
      ON feed_materials(project_id, item_id, updated_at DESC, material_id);
CREATE INDEX feed_out_rules_project_enabled_idx
      ON feed_out_rules(project_id, enabled, created_at, rule_id);
CREATE INDEX feed_source_runs_project_source_idx
      ON feed_source_runs(project_id, source_id, started_at DESC);
CREATE INDEX feed_sources_project_updated_idx
      ON feed_sources(project_id, updated_at DESC, source_id);
CREATE INDEX goal_event_applied_decisions_goal_idx
    ON goal_event_applied_decisions(project_id, goal_id, recorded_at);
CREATE INDEX goal_event_closures_goal_idx
    ON goal_event_closures(project_id, goal_id, recorded_at);
CREATE INDEX goal_event_concerns_goal_idx
    ON goal_event_concerns(project_id, goal_id, status);
CREATE INDEX goal_event_decision_requests_goal_idx
    ON goal_event_decision_requests(project_id, goal_id, status);
CREATE INDEX goal_event_progress_summaries_goal_idx
    ON goal_event_progress_summaries(project_id, goal_id, recorded_at);
CREATE INDEX goal_event_state_owners_project_idx
    ON goal_event_state_owners(project_id, goal_id);
CREATE INDEX goal_event_types_goal_idx
    ON goal_event_types(project_id, goal_id, type_id, type_version);
CREATE UNIQUE INDEX goal_trash_one_open_per_goal
    ON goal_trash_records(project_id, goal_id)
    WHERE restored_at IS NULL;
CREATE INDEX goal_trash_records_goal_idx
    ON goal_trash_records(project_id, goal_id, restored_at, trashed_at);
CREATE INDEX goal_trash_relation_records_relation_idx
    ON goal_trash_relation_records(relation_id, restored_at);
CREATE INDEX goal_tree_item_effects_proposal_idx ON goal_tree_item_effects(project_id, proposal_id, item_id, created_at, effect_id);
CREATE INDEX goal_tree_proposal_items_project_idx
    ON goal_tree_proposal_items(project_id, state, item_id);
CREATE INDEX goal_tree_proposal_items_proposal_idx
    ON goal_tree_proposal_items(proposal_id, ordinal, item_id);
CREATE INDEX goal_tree_proposals_project_idx
    ON goal_tree_proposals(project_id, root_goal_id, state, created_at DESC, proposal_id);
CREATE INDEX goal_tree_proposals_supersedes_idx
    ON goal_tree_proposals(supersedes_proposal_id);
CREATE INDEX goal_work_events_goal_seq_idx
    ON goal_work_events(project_id, goal_id, journal_seq);
CREATE INDEX goals_archive_idx ON goals(project_id, archived_at);
CREATE INDEX goals_project_idx ON goals(project_id);
CREATE INDEX goals_ready_idx ON goals(project_id, definition_state, decomposition_state, validity_state, fulfillment_state);
CREATE INDEX goals_trash_idx ON goals(project_id, trashed_at);
CREATE INDEX guidance_entries_project_idx ON guidance_entries(project_id, position, guidance_id);
CREATE INDEX guidance_revisions_project_idx ON guidance_revisions(project_id, guidance_id, revision DESC);
CREATE INDEX library_artifact_versions_type_idx
    ON library_artifact_versions(artifact_type_id, schema_version, scope, lifecycle_state);
CREATE INDEX library_artifacts_project_idx
    ON library_artifacts(project_id, created_at DESC, artifact_id);
CREATE INDEX listener_deliveries_recovery_idx
      ON listener_deliveries(project_id, source_id, state, updated_at, raw_event_id);
CREATE INDEX material_recent_uses_caller_idx
  ON material_recent_uses(caller_kind, caller_id, sequence);
CREATE UNIQUE INDEX plugin_events_board_sequence ON plugin_events (project_id, sequence);
CREATE INDEX plugin_events_board_type_source
      ON plugin_events (project_id, event_type_id, type_version, source_plugin_id, sequence);
CREATE INDEX plugin_notifications_pending ON plugin_notifications (project_id, created_at) WHERE delivered_at IS NULL;
CREATE INDEX process_item_versions_type_idx
    ON process_item_versions(artifact_type_id, schema_version, scope, lifecycle_state);
CREATE INDEX process_items_project_idx
    ON process_items(project_id, created_at DESC, artifact_id);
CREATE INDEX process_items_replica_changes_key ON process_items_replica_changes(key);
CREATE INDEX project_approval_rules_order ON project_approval_rules(project_id, rule_order, id);
CREATE INDEX project_approval_rules_scope ON project_approval_rules(project_id, scope_json, state, id);
CREATE INDEX project_approvals_replica_changes_key ON project_approvals_replica_changes(key);
CREATE INDEX project_guidance_replica_changes_key ON project_guidance_replica_changes(key);
CREATE INDEX project_review_decisions_history ON project_review_decisions(project_id, recorded_at, decision_id);
CREATE INDEX relations_from_idx ON goal_relations(project_id, from_goal_id, state);
CREATE INDEX relations_to_idx ON goal_relations(project_id, to_goal_id, state);
CREATE INDEX risk_events_risk_idx ON risk_events(risk_id, at);
CREATE INDEX risk_items_status_idx ON risk_items(project_id, status, updated_at);
CREATE INDEX risk_links_subject_idx ON risk_links(subject_kind, subject_id);
CREATE INDEX schedule_conversation_tasks_enabled_idx
      ON schedule_conversation_tasks(enabled, updated_at);
CREATE INDEX schedule_conversation_turns_task_idx
      ON schedule_conversation_turns(task_id, created_at);
CREATE INDEX schedule_jobs_due_idx
      ON schedule_jobs(enabled, next_due_at);
CREATE INDEX schedule_plugin_reminders_owner ON schedule_plugin_reminders(project_id, plugin_id, installation_id);
CREATE INDEX signal_events_project_source_idx
      ON signal_events(project_id, source_id, at, event_id);
CREATE INDEX signals_project_source_observed_idx
      ON signals(project_id, source_id, observed_at DESC, signal_id);
CREATE INDEX source_events_project_source_idx
      ON source_events(project_id, source_id, at, event_id);
CREATE INDEX surface_corrections_replica_changes_key ON surface_corrections_replica_changes(key);
CREATE INDEX sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes_key ON sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key);
CREATE INDEX sync_522a4260e0bcbee35d4d9f85406c_replica_changes_key ON sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key);
CREATE INDEX sync_57fe6903aad21582fd1bfbdd6011_replica_changes_key ON sync_57fe6903aad21582fd1bfbdd6011_replica_changes(key);
CREATE INDEX sync_daec9cf494e58d382d6262de3af9_replica_changes_key ON sync_daec9cf494e58d382d6262de3af9_replica_changes(key);
CREATE INDEX sync_dd6dd4054975ce4abcd1e12268d3_replica_changes_key ON sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key);
CREATE INDEX sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes_key ON sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key);
CREATE INDEX sync_fc44281fa4e6ae1ad919f15bea63_replica_changes_key ON sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key);
CREATE TRIGGER acceptance_checks_mark AFTER INSERT ON acceptance_checks BEGIN INSERT INTO acceptance_replica_changes(key) SELECT (SELECT json_array(s.project_id,'acceptance',s.provider_id,s.subject_kind,s.subject_id) FROM acceptance_subjects s WHERE s.subject_no=NEW.subject_no) WHERE (SELECT applying FROM acceptance_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER acceptance_checks_no_delete BEFORE DELETE ON acceptance_checks
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER acceptance_checks_no_update BEFORE UPDATE ON acceptance_checks
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER acceptance_decisions_mark AFTER INSERT ON acceptance_decisions BEGIN INSERT INTO acceptance_replica_changes(key) SELECT (SELECT json_array(s.project_id,'acceptance',s.provider_id,s.subject_kind,s.subject_id) FROM acceptance_subjects s WHERE s.subject_no=NEW.subject_no) WHERE (SELECT applying FROM acceptance_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER acceptance_decisions_no_delete BEFORE DELETE ON acceptance_decisions
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER acceptance_decisions_no_update BEFORE UPDATE ON acceptance_decisions
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER acceptance_deliveries_mark AFTER INSERT ON acceptance_deliveries BEGIN INSERT INTO acceptance_replica_changes(key) SELECT (SELECT json_array(s.project_id,'acceptance',s.provider_id,s.subject_kind,s.subject_id) FROM acceptance_subjects s WHERE s.subject_no=NEW.subject_no) WHERE (SELECT applying FROM acceptance_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER acceptance_deliveries_no_delete BEFORE DELETE ON acceptance_deliveries
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER acceptance_deliveries_no_update BEFORE UPDATE ON acceptance_deliveries
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER acceptance_requirements_mark AFTER INSERT ON acceptance_requirements BEGIN INSERT INTO acceptance_replica_changes(key) SELECT (SELECT json_array(s.project_id,'acceptance',s.provider_id,s.subject_kind,s.subject_id) FROM acceptance_subjects s WHERE s.subject_no=NEW.subject_no) WHERE (SELECT applying FROM acceptance_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER acceptance_requirements_no_delete BEFORE DELETE ON acceptance_requirements
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER acceptance_requirements_no_update BEFORE UPDATE ON acceptance_requirements
  WHEN NOT EXISTS (SELECT 1 FROM acceptance_sync_resolving) BEGIN SELECT RAISE(ABORT, 'acceptance records are append-only'); END;
CREATE TRIGGER artifacts_sync_identity_delete AFTER DELETE ON library_artifacts BEGIN INSERT INTO artifacts_replica_changes(key) SELECT json_array(OLD.project_id,'artifact',OLD.artifact_id) WHERE (SELECT applying FROM artifacts_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER artifacts_sync_identity_insert AFTER INSERT ON library_artifacts BEGIN INSERT INTO artifacts_replica_changes(key) SELECT json_array(NEW.project_id,'artifact',NEW.artifact_id) WHERE (SELECT applying FROM artifacts_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER artifacts_sync_identity_update AFTER UPDATE ON library_artifacts BEGIN INSERT INTO artifacts_replica_changes(key) SELECT json_array(NEW.project_id,'artifact',NEW.artifact_id) WHERE (SELECT applying FROM artifacts_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER artifacts_sync_version_delete AFTER DELETE ON library_artifact_versions WHEN (SELECT project_id FROM library_artifacts WHERE artifact_id=OLD.artifact_id) IS NOT NULL BEGIN INSERT INTO artifacts_replica_changes(key) SELECT json_array((SELECT project_id FROM library_artifacts WHERE artifact_id=OLD.artifact_id),'artifact',OLD.artifact_id) WHERE (SELECT applying FROM artifacts_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER artifacts_sync_version_insert AFTER INSERT ON library_artifact_versions WHEN (SELECT project_id FROM library_artifacts WHERE artifact_id=NEW.artifact_id) IS NOT NULL BEGIN INSERT INTO artifacts_replica_changes(key) SELECT json_array((SELECT project_id FROM library_artifacts WHERE artifact_id=NEW.artifact_id),'artifact',NEW.artifact_id) WHERE (SELECT applying FROM artifacts_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER artifacts_sync_version_update AFTER UPDATE ON library_artifact_versions WHEN (SELECT project_id FROM library_artifacts WHERE artifact_id=NEW.artifact_id) IS NOT NULL BEGIN INSERT INTO artifacts_replica_changes(key) SELECT json_array((SELECT project_id FROM library_artifacts WHERE artifact_id=NEW.artifact_id),'artifact',NEW.artifact_id) WHERE (SELECT applying FROM artifacts_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER attention_attention_entries_delete AFTER DELETE ON attention_entries BEGIN INSERT INTO attention_replica_changes(key) SELECT json_array(OLD.project_id,'project_attention',OLD.project_id) WHERE (SELECT applying FROM attention_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER attention_attention_entries_insert AFTER INSERT ON attention_entries BEGIN INSERT INTO attention_replica_changes(key) SELECT json_array(NEW.project_id,'project_attention',NEW.project_id) WHERE (SELECT applying FROM attention_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER attention_attention_entries_update AFTER UPDATE ON attention_entries BEGIN INSERT INTO attention_replica_changes(key) SELECT json_array(NEW.project_id,'project_attention',NEW.project_id) WHERE (SELECT applying FROM attention_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER attention_attention_events_delete AFTER DELETE ON attention_events BEGIN INSERT INTO attention_replica_changes(key) SELECT json_array(OLD.project_id,'project_attention',OLD.project_id) WHERE (SELECT applying FROM attention_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER attention_attention_events_insert AFTER INSERT ON attention_events BEGIN INSERT INTO attention_replica_changes(key) SELECT json_array(NEW.project_id,'project_attention',NEW.project_id) WHERE (SELECT applying FROM attention_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER attention_attention_events_update AFTER UPDATE ON attention_events BEGIN INSERT INTO attention_replica_changes(key) SELECT json_array(NEW.project_id,'project_attention',NEW.project_id) WHERE (SELECT applying FROM attention_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER builder_content_private_sync_delete AFTER DELETE ON plugin_private_values WHEN OLD.item_key='plugin-builder:agent-built:v1' AND substr(OLD.install_id,1,13)='agent-studio:' BEGIN INSERT INTO builder_replica_changes(key) SELECT key FROM (SELECT json_array(substr(OLD.install_id,14),'builder_content',entries.item_id) AS key FROM (SELECT json_extract(value,'$.id') AS item_id FROM json_each(OLD.item_value,'$.builds') UNION SELECT json_extract(value,'$.buildId') AS item_id FROM json_each(OLD.item_value,'$.releases')) AS entries) WHERE (SELECT applying FROM builder_replica_state WHERE id=1)=0; END;
CREATE TRIGGER builder_content_private_sync_insert AFTER INSERT ON plugin_private_values WHEN NEW.item_key='plugin-builder:agent-built:v1' AND substr(NEW.install_id,1,13)='agent-studio:' BEGIN INSERT INTO builder_replica_changes(key) SELECT key FROM (SELECT json_array(substr(NEW.install_id,14),'builder_content',entries.item_id) AS key FROM (SELECT json_extract(value,'$.id') AS item_id FROM json_each(NEW.item_value,'$.builds') UNION SELECT json_extract(value,'$.buildId') AS item_id FROM json_each(NEW.item_value,'$.releases')) AS entries) WHERE (SELECT applying FROM builder_replica_state WHERE id=1)=0; END;
CREATE TRIGGER builder_content_private_sync_move_new AFTER UPDATE OF install_id,item_key ON plugin_private_values WHEN NEW.item_key='plugin-builder:agent-built:v1' AND substr(NEW.install_id,1,13)='agent-studio:' AND NOT (NEW.install_id=OLD.install_id AND NEW.item_key=OLD.item_key) BEGIN INSERT INTO builder_replica_changes(key) SELECT key FROM (SELECT json_array(substr(NEW.install_id,14),'builder_content',entries.item_id) AS key FROM (SELECT json_extract(value,'$.id') AS item_id FROM json_each(NEW.item_value,'$.builds') UNION SELECT json_extract(value,'$.buildId') AS item_id FROM json_each(NEW.item_value,'$.releases')) AS entries) WHERE (SELECT applying FROM builder_replica_state WHERE id=1)=0; END;
CREATE TRIGGER builder_content_private_sync_move_old AFTER UPDATE OF install_id,item_key ON plugin_private_values WHEN OLD.item_key='plugin-builder:agent-built:v1' AND substr(OLD.install_id,1,13)='agent-studio:' AND NOT (NEW.install_id=OLD.install_id AND NEW.item_key=OLD.item_key) BEGIN INSERT INTO builder_replica_changes(key) SELECT key FROM (SELECT json_array(substr(OLD.install_id,14),'builder_content',entries.item_id) AS key FROM (SELECT json_extract(value,'$.id') AS item_id FROM json_each(OLD.item_value,'$.builds') UNION SELECT json_extract(value,'$.buildId') AS item_id FROM json_each(OLD.item_value,'$.releases')) AS entries) WHERE (SELECT applying FROM builder_replica_state WHERE id=1)=0; END;
CREATE TRIGGER builder_content_private_sync_update AFTER UPDATE OF item_value ON plugin_private_values WHEN NEW.item_key='plugin-builder:agent-built:v1' AND substr(NEW.install_id,1,13)='agent-studio:' AND NEW.install_id=OLD.install_id AND NEW.item_key=OLD.item_key BEGIN INSERT INTO builder_replica_changes(key) SELECT key FROM (SELECT json_array(substr(NEW.install_id,14),'builder_content',entries.item_id) AS key FROM (SELECT json_extract(value,'$.id') AS item_id FROM json_each(OLD.item_value,'$.builds') UNION SELECT json_extract(value,'$.buildId') AS item_id FROM json_each(OLD.item_value,'$.releases') UNION SELECT json_extract(value,'$.id') AS item_id FROM json_each(NEW.item_value,'$.builds') UNION SELECT json_extract(value,'$.buildId') AS item_id FROM json_each(NEW.item_value,'$.releases')) AS entries WHERE ((SELECT json_group_array(json(value)) FROM json_each(OLD.item_value,'$.builds') WHERE json_extract(value,'$.id')=entries.item_id) || (SELECT json_group_array(json(value)) FROM json_each(OLD.item_value,'$.releases') WHERE json_extract(value,'$.buildId')=entries.item_id)) IS NOT ((SELECT json_group_array(json(value)) FROM json_each(NEW.item_value,'$.builds') WHERE json_extract(value,'$.id')=entries.item_id) || (SELECT json_group_array(json(value)) FROM json_each(NEW.item_value,'$.releases') WHERE json_extract(value,'$.buildId')=entries.item_id))) WHERE (SELECT applying FROM builder_replica_state WHERE id=1)=0; END;
CREATE TRIGGER process_items_sync_identity_delete AFTER DELETE ON process_items BEGIN INSERT INTO process_items_replica_changes(key) SELECT json_array(OLD.project_id,'process_item',OLD.artifact_id) WHERE (SELECT applying FROM process_items_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER process_items_sync_identity_insert AFTER INSERT ON process_items BEGIN INSERT INTO process_items_replica_changes(key) SELECT json_array(NEW.project_id,'process_item',NEW.artifact_id) WHERE (SELECT applying FROM process_items_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER process_items_sync_identity_update AFTER UPDATE ON process_items BEGIN INSERT INTO process_items_replica_changes(key) SELECT json_array(NEW.project_id,'process_item',NEW.artifact_id) WHERE (SELECT applying FROM process_items_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER process_items_sync_version_delete AFTER DELETE ON process_item_versions WHEN (SELECT project_id FROM process_items WHERE artifact_id=OLD.artifact_id) IS NOT NULL BEGIN INSERT INTO process_items_replica_changes(key) SELECT json_array((SELECT project_id FROM process_items WHERE artifact_id=OLD.artifact_id),'process_item',OLD.artifact_id) WHERE (SELECT applying FROM process_items_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER process_items_sync_version_insert AFTER INSERT ON process_item_versions WHEN (SELECT project_id FROM process_items WHERE artifact_id=NEW.artifact_id) IS NOT NULL BEGIN INSERT INTO process_items_replica_changes(key) SELECT json_array((SELECT project_id FROM process_items WHERE artifact_id=NEW.artifact_id),'process_item',NEW.artifact_id) WHERE (SELECT applying FROM process_items_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER process_items_sync_version_update AFTER UPDATE ON process_item_versions WHEN (SELECT project_id FROM process_items WHERE artifact_id=NEW.artifact_id) IS NOT NULL BEGIN INSERT INTO process_items_replica_changes(key) SELECT json_array((SELECT project_id FROM process_items WHERE artifact_id=NEW.artifact_id),'process_item',NEW.artifact_id) WHERE (SELECT applying FROM process_items_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER project_approvals_decisions_insert AFTER INSERT ON project_review_decisions BEGIN INSERT INTO project_approvals_replica_changes(key) SELECT json_array(NEW.project_id,'project_approvals',NEW.project_id) WHERE (SELECT applying FROM project_approvals_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER project_approvals_rules_insert AFTER INSERT ON project_approval_rules BEGIN INSERT INTO project_approvals_replica_changes(key) SELECT json_array(NEW.project_id,'project_approvals',NEW.project_id) WHERE (SELECT applying FROM project_approvals_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER project_approvals_rules_update AFTER UPDATE ON project_approval_rules BEGIN INSERT INTO project_approvals_replica_changes(key) SELECT json_array(NEW.project_id,'project_approvals',NEW.project_id) WHERE (SELECT applying FROM project_approvals_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER project_guidance_entries_insert AFTER INSERT ON guidance_entries BEGIN INSERT INTO project_guidance_replica_changes(key) SELECT json_array(NEW.project_id,'project_guidance',NEW.project_id) WHERE (SELECT applying FROM project_guidance_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER project_guidance_entries_update AFTER UPDATE ON guidance_entries BEGIN INSERT INTO project_guidance_replica_changes(key) SELECT json_array(NEW.project_id,'project_guidance',NEW.project_id) WHERE (SELECT applying FROM project_guidance_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER project_guidance_revisions_insert AFTER INSERT ON guidance_revisions BEGIN INSERT INTO project_guidance_replica_changes(key) SELECT json_array(NEW.project_id,'project_guidance',NEW.project_id) WHERE (SELECT applying FROM project_guidance_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER surface_corrections_delete AFTER DELETE ON surface_corrections BEGIN INSERT INTO surface_corrections_replica_changes(key) SELECT json_array((SELECT project_id FROM project_root),'surface_corrections',(SELECT project_id FROM project_root)) WHERE (SELECT applying FROM surface_corrections_replica_state WHERE id=1)=0 AND ((SELECT count(*) FROM project_root)=1); END;
CREATE TRIGGER surface_corrections_insert AFTER INSERT ON surface_corrections BEGIN INSERT INTO surface_corrections_replica_changes(key) SELECT json_array((SELECT project_id FROM project_root),'surface_corrections',(SELECT project_id FROM project_root)) WHERE (SELECT applying FROM surface_corrections_replica_state WHERE id=1)=0 AND ((SELECT count(*) FROM project_root)=1); END;
CREATE TRIGGER surface_corrections_update AFTER UPDATE ON surface_corrections BEGIN INSERT INTO surface_corrections_replica_changes(key) SELECT json_array((SELECT project_id FROM project_root),'surface_corrections',(SELECT project_id FROM project_root)) WHERE (SELECT applying FROM surface_corrections_replica_state WHERE id=1)=0 AND ((SELECT count(*) FROM project_root)=1); END;
CREATE TRIGGER "sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_delete" AFTER DELETE ON "feed_sources" BEGIN INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_sources',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_insert" AFTER INSERT ON "feed_sources" BEGIN INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_sources',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_update" AFTER UPDATE ON "feed_sources" BEGIN INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_sources',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0;INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_sources',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_sources',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_delete" AFTER DELETE ON "source_events" BEGIN INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_sources',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_insert" AFTER INSERT ON "source_events" BEGIN INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_sources',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_update" AFTER UPDATE ON "source_events" BEGIN INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_sources',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0;INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_sources',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_sources',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_0_delete" AFTER DELETE ON "signals" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_feed',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_0_insert" AFTER INSERT ON "signals" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_0_update" AFTER UPDATE ON "signals" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0;INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_feed',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_1_delete" AFTER DELETE ON "signal_revisions" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_feed',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_1_insert" AFTER INSERT ON "signal_revisions" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_1_update" AFTER UPDATE ON "signal_revisions" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0;INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_feed',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_2_delete" AFTER DELETE ON "signal_events" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_feed',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_2_insert" AFTER INSERT ON "signal_events" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_2_update" AFTER UPDATE ON "signal_events" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0;INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_feed',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_3_delete" AFTER DELETE ON "feed_items" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_feed',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_3_insert" AFTER INSERT ON "feed_items" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_3_update" AFTER UPDATE ON "feed_items" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0;INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_feed',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_4_delete" AFTER DELETE ON "feed_materials" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_feed',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_4_insert" AFTER INSERT ON "feed_materials" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_4_update" AFTER UPDATE ON "feed_materials" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0;INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_feed',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_5_delete" AFTER DELETE ON "feed_item_events" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_feed',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_5_insert" AFTER INSERT ON "feed_item_events" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_522a4260e0bcbee35d4d9f85406c_track_5_update" AFTER UPDATE ON "feed_item_events" BEGIN INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0;INSERT INTO sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_feed',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_feed',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_522a4260e0bcbee35d4d9f85406c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_57fe6903aad21582fd1bfbdd6011_track_0_delete" AFTER DELETE ON "risk_items" BEGIN INSERT INTO sync_57fe6903aad21582fd1bfbdd6011_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'risk',OLD."risk_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_57fe6903aad21582fd1bfbdd6011_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_57fe6903aad21582fd1bfbdd6011_track_0_insert" AFTER INSERT ON "risk_items" BEGIN INSERT INTO sync_57fe6903aad21582fd1bfbdd6011_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'risk',NEW."risk_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_57fe6903aad21582fd1bfbdd6011_replica_state WHERE id=1)=0;INSERT INTO "risk_editor_versions" ("risk_id","revision") SELECT NEW."risk_id",NEW."revision" WHERE 1=1 ON CONFLICT ("risk_id") DO UPDATE SET "revision"=MAX("revision",excluded."revision"); END;
CREATE TRIGGER "sync_57fe6903aad21582fd1bfbdd6011_track_0_update" AFTER UPDATE ON "risk_items" BEGIN INSERT INTO sync_57fe6903aad21582fd1bfbdd6011_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'risk',NEW."risk_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_57fe6903aad21582fd1bfbdd6011_replica_state WHERE id=1)=0;INSERT INTO sync_57fe6903aad21582fd1bfbdd6011_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'risk',OLD."risk_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'risk',NEW."risk_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_57fe6903aad21582fd1bfbdd6011_replica_state WHERE id=1)=0;INSERT INTO "risk_editor_versions" ("risk_id","revision") SELECT NEW."risk_id",NEW."revision" WHERE 1=1 ON CONFLICT ("risk_id") DO UPDATE SET "revision"=MAX("revision",excluded."revision"); END;
CREATE TRIGGER "sync_daec9cf494e58d382d6262de3af9_track_0_delete" AFTER DELETE ON "feed_out_rules" BEGIN INSERT INTO sync_daec9cf494e58d382d6262de3af9_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'feed_rule',OLD."rule_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_daec9cf494e58d382d6262de3af9_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_daec9cf494e58d382d6262de3af9_track_0_insert" AFTER INSERT ON "feed_out_rules" BEGIN INSERT INTO sync_daec9cf494e58d382d6262de3af9_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'feed_rule',NEW."rule_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_daec9cf494e58d382d6262de3af9_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_daec9cf494e58d382d6262de3af9_track_0_update" AFTER UPDATE ON "feed_out_rules" BEGIN INSERT INTO sync_daec9cf494e58d382d6262de3af9_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'feed_rule',NEW."rule_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_daec9cf494e58d382d6262de3af9_replica_state WHERE id=1)=0;INSERT INTO sync_daec9cf494e58d382d6262de3af9_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'feed_rule',OLD."rule_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'feed_rule',NEW."rule_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_daec9cf494e58d382d6262de3af9_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_dd6dd4054975ce4abcd1e12268d3_track_0_delete" AFTER DELETE ON "coding_sessions" BEGIN INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'coding_content',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_dd6dd4054975ce4abcd1e12268d3_track_0_insert" AFTER INSERT ON "coding_sessions" BEGIN INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'coding_content',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_dd6dd4054975ce4abcd1e12268d3_track_0_update" AFTER UPDATE ON "coding_sessions" WHEN ((OLD."title" IS NOT NEW."title" OR OLD."archived" IS NOT NEW."archived" OR OLD."goal_id" IS NOT NEW."goal_id")) OR ((OLD."state" IS NOT NEW."state") AND NEW."state" IN ('done','failed','stopped','cancelled') AND NEW."runtime_session_id" IS NOT NULL) BEGIN INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'coding_content',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0;INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'coding_content',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'coding_content',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_dd6dd4054975ce4abcd1e12268d3_track_1_delete" AFTER DELETE ON "coding_plan_drafts" BEGIN INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'coding_content',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_dd6dd4054975ce4abcd1e12268d3_track_1_insert" AFTER INSERT ON "coding_plan_drafts" BEGIN INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'coding_content',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_dd6dd4054975ce4abcd1e12268d3_track_1_update" AFTER UPDATE ON "coding_plan_drafts" BEGIN INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'coding_content',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0;INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'coding_content',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'coding_content',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_dd6dd4054975ce4abcd1e12268d3_track_2_delete" AFTER DELETE ON "coding_saved_history" BEGIN INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'coding_content',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_dd6dd4054975ce4abcd1e12268d3_track_2_insert" AFTER INSERT ON "coding_saved_history" BEGIN INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'coding_content',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_dd6dd4054975ce4abcd1e12268d3_track_2_update" AFTER UPDATE ON "coding_saved_history" BEGIN INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'coding_content',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0;INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'coding_content',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'coding_content',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_dd6dd4054975ce4abcd1e12268d3_track_3_delete" AFTER DELETE ON "coding_inputs" BEGIN INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'coding_content',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_dd6dd4054975ce4abcd1e12268d3_track_3_insert" AFTER INSERT ON "coding_inputs" BEGIN INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'coding_content',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_dd6dd4054975ce4abcd1e12268d3_track_3_update" AFTER UPDATE ON "coding_inputs" BEGIN INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'coding_content',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0;INSERT INTO sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'coding_content',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'coding_content',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_dd6dd4054975ce4abcd1e12268d3_replica_state WHERE id=1)=0; END;
CREATE TRIGGER sync_ebbb9ae341b34cbb8aedd65a41e6_context_delete BEFORE DELETE ON context_edges WHEN OLD.scope_kind='personal' AND ((json_extract(OLD.source_json,'$.module')='plugins' AND json_extract(OLD.source_json,'$.plugin_id')='io.molis.work.goals') OR (json_extract(OLD.target_json,'$.module')='plugins' AND json_extract(OLD.target_json,'$.plugin_id')='io.molis.work.goals')) BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT json_array(OLD.scope_id,'project_goals',OLD.scope_id) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER sync_ebbb9ae341b34cbb8aedd65a41e6_context_insert AFTER INSERT ON context_edges WHEN NEW.scope_kind='personal' AND ((json_extract(NEW.source_json,'$.module')='plugins' AND json_extract(NEW.source_json,'$.plugin_id')='io.molis.work.goals') OR (json_extract(NEW.target_json,'$.module')='plugins' AND json_extract(NEW.target_json,'$.plugin_id')='io.molis.work.goals')) BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT json_array(NEW.scope_id,'project_goals',NEW.scope_id) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER sync_ebbb9ae341b34cbb8aedd65a41e6_context_update AFTER UPDATE ON context_edges WHEN NEW.scope_kind='personal' AND ((json_extract(NEW.source_json,'$.module')='plugins' AND json_extract(NEW.source_json,'$.plugin_id')='io.molis.work.goals') OR (json_extract(NEW.target_json,'$.module')='plugins' AND json_extract(NEW.target_json,'$.plugin_id')='io.molis.work.goals')) BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT json_array(NEW.scope_id,'project_goals',NEW.scope_id) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER sync_ebbb9ae341b34cbb8aedd65a41e6_journal AFTER INSERT ON events WHEN substr(NEW.type,1,20)='io.molis.work.goals:' AND NEW.type NOT IN ('io.molis.work.goals:board.created') BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT json_array(NEW.project_id,'project_goals',NEW.project_id) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_delete" AFTER DELETE ON "boards" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE (1=1) AND (EXISTS (SELECT 1 FROM "goals" AS sync_exists WHERE sync_exists."project_id"=OLD."project_id"))) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_insert" AFTER INSERT ON "boards" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE (1=1) AND (EXISTS (SELECT 1 FROM "goals" AS sync_exists WHERE sync_exists."project_id"=NEW."project_id"))) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_update" AFTER UPDATE ON "boards" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE (1=1) AND (EXISTS (SELECT 1 FROM "goals" AS sync_exists WHERE sync_exists."project_id"=NEW."project_id"))) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE (1=1) AND (EXISTS (SELECT 1 FROM "goals" AS sync_exists WHERE sync_exists."project_id"=OLD."project_id")) EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE (1=1) AND (EXISTS (SELECT 1 FROM "goals" AS sync_exists WHERE sync_exists."project_id"=NEW."project_id"))) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_delete" AFTER DELETE ON "goal_work_events" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_insert" AFTER INSERT ON "goal_work_events" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_update" AFTER UPDATE ON "goal_work_events" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_delete" AFTER DELETE ON "goal_requirement_links" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_insert" AFTER INSERT ON "goal_requirement_links" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_update" AFTER UPDATE ON "goal_requirement_links" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_delete" AFTER DELETE ON "goal_event_state_owners" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_insert" AFTER INSERT ON "goal_event_state_owners" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_update" AFTER UPDATE ON "goal_event_state_owners" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_delete" AFTER DELETE ON "goal_event_agreements" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_insert" AFTER INSERT ON "goal_event_agreements" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_update" AFTER UPDATE ON "goal_event_agreements" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_delete" AFTER DELETE ON "goal_event_progress_summaries" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_insert" AFTER INSERT ON "goal_event_progress_summaries" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_update" AFTER UPDATE ON "goal_event_progress_summaries" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_delete" AFTER DELETE ON "goal_event_concerns" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_insert" AFTER INSERT ON "goal_event_concerns" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_update" AFTER UPDATE ON "goal_event_concerns" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_delete" AFTER DELETE ON "goal_event_decision_requests" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_insert" AFTER INSERT ON "goal_event_decision_requests" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_update" AFTER UPDATE ON "goal_event_decision_requests" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_delete" AFTER DELETE ON "goal_event_applied_decisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_insert" AFTER INSERT ON "goal_event_applied_decisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_update" AFTER UPDATE ON "goal_event_applied_decisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_delete" AFTER DELETE ON "goal_event_closures" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_insert" AFTER INSERT ON "goal_event_closures" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_update" AFTER UPDATE ON "goal_event_closures" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_delete" AFTER DELETE ON "goal_event_work_status" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_insert" AFTER INSERT ON "goal_event_work_status" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_update" AFTER UPDATE ON "goal_event_work_status" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_delete" AFTER DELETE ON "goals" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_insert" AFTER INSERT ON "goals" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_update" AFTER UPDATE ON "goals" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_delete" AFTER DELETE ON "input_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_insert" AFTER INSERT ON "input_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_update" AFTER UPDATE ON "input_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_delete" AFTER DELETE ON "goal_tree_proposals" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_insert" AFTER INSERT ON "goal_tree_proposals" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_update" AFTER UPDATE ON "goal_tree_proposals" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_delete" AFTER DELETE ON "goal_tree_proposal_items" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_insert" AFTER INSERT ON "goal_tree_proposal_items" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_update" AFTER UPDATE ON "goal_tree_proposal_items" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_delete" AFTER DELETE ON "goal_tree_item_effects" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_insert" AFTER INSERT ON "goal_tree_item_effects" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_update" AFTER UPDATE ON "goal_tree_item_effects" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_delete" AFTER DELETE ON "acceptance_criteria" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goals" AS sync_parent WHERE 1=1 AND sync_parent."goal_id"=OLD."goal_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_insert" AFTER INSERT ON "acceptance_criteria" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goals" AS sync_parent WHERE 1=1 AND sync_parent."goal_id"=NEW."goal_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_update" AFTER UPDATE ON "acceptance_criteria" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goals" AS sync_parent WHERE 1=1 AND sync_parent."goal_id"=NEW."goal_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goals" AS sync_parent WHERE 1=1 AND sync_parent."goal_id"=OLD."goal_id" EXCEPT SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goals" AS sync_parent WHERE 1=1 AND sync_parent."goal_id"=NEW."goal_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_delete" AFTER DELETE ON "goal_relations" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_insert" AFTER INSERT ON "goal_relations" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_update" AFTER UPDATE ON "goal_relations" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_delete" AFTER DELETE ON "goal_trash_records" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_insert" AFTER INSERT ON "goal_trash_records" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_update" AFTER UPDATE ON "goal_trash_records" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_delete" AFTER DELETE ON "goal_trash_relation_records" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_trash_records" AS sync_parent WHERE 1=1 AND sync_parent."trash_record_id"=OLD."trash_record_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_insert" AFTER INSERT ON "goal_trash_relation_records" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_trash_records" AS sync_parent WHERE 1=1 AND sync_parent."trash_record_id"=NEW."trash_record_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_update" AFTER UPDATE ON "goal_trash_relation_records" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_trash_records" AS sync_parent WHERE 1=1 AND sync_parent."trash_record_id"=NEW."trash_record_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_trash_records" AS sync_parent WHERE 1=1 AND sync_parent."trash_record_id"=OLD."trash_record_id" EXCEPT SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_trash_records" AS sync_parent WHERE 1=1 AND sync_parent."trash_record_id"=NEW."trash_record_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_delete" AFTER DELETE ON "goal_event_configs" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_insert" AFTER INSERT ON "goal_event_configs" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_update" AFTER UPDATE ON "goal_event_configs" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_delete" AFTER DELETE ON "goal_event_config_versions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_insert" AFTER INSERT ON "goal_event_config_versions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_update" AFTER UPDATE ON "goal_event_config_versions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_delete" AFTER DELETE ON "goal_event_types" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_insert" AFTER INSERT ON "goal_event_types" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_update" AFTER UPDATE ON "goal_event_types" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_delete" AFTER DELETE ON "goal_event_requirement_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_insert" AFTER INSERT ON "goal_event_requirement_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_update" AFTER UPDATE ON "goal_event_requirement_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_fc44281fa4e6ae1ad919f15bea63_track_0_delete" AFTER DELETE ON "schedule_conversation_tasks" BEGIN INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',OLD."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_fc44281fa4e6ae1ad919f15bea63_track_0_insert" AFTER INSERT ON "schedule_conversation_tasks" BEGIN INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',NEW."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_fc44281fa4e6ae1ad919f15bea63_track_0_update" AFTER UPDATE ON "schedule_conversation_tasks" BEGIN INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',NEW."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0;INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',OLD."task_id") AS key WHERE 1=1 EXCEPT SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',NEW."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_fc44281fa4e6ae1ad919f15bea63_track_1_delete" AFTER DELETE ON "schedule_conversation_turns" BEGIN INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',OLD."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_fc44281fa4e6ae1ad919f15bea63_track_1_insert" AFTER INSERT ON "schedule_conversation_turns" BEGIN INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',NEW."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_fc44281fa4e6ae1ad919f15bea63_track_1_update" AFTER UPDATE ON "schedule_conversation_turns" BEGIN INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',NEW."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0;INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',OLD."task_id") AS key WHERE 1=1 EXCEPT SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',NEW."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0; END;
PRAGMA user_version=1;
COMMIT;
