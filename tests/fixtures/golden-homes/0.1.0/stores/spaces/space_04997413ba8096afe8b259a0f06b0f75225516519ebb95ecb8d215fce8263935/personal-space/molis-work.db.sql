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
INSERT INTO "acceptance_replica_state"("id","device","cursor","applying") VALUES(1,'b627c11ac1c1334d1a4cd91dbd14635e',0,0);
INSERT INTO "artifacts_replica_state"("id","device","cursor","applying") VALUES(1,'b668f5e1b167e93e1897a138c50c068d',0,0);
INSERT INTO "attention_replica_state"("id","device","cursor","applying") VALUES(1,'82906a106b23529500463ae78c843c05',0,0);
INSERT INTO "builder_replica_state"("id","device","cursor","applying") VALUES(1,'b88ba2ff2d8c7e02d05eb99cbbd80d56',0,0);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.coding','official-coding-binding','coding',1,'["coding_input_versions","coding_inputs","coding_plan_drafts","coding_plan_versions","coding_saved_history","coding_sessions","coding_sessions_project_updated_idx","sync_dd6dd4054975ce4abcd1e12268d3_aggregate_editor_versions","sync_dd6dd4054975ce4abcd1e12268d3_context","sync_dd6dd4054975ce4abcd1e12268d3_replica_changes","sync_dd6dd4054975ce4abcd1e12268d3_replica_changes_key","sync_dd6dd4054975ce4abcd1e12268d3_replica_conflicts","sync_dd6dd4054975ce4abcd1e12268d3_replica_heads","sync_dd6dd4054975ce4abcd1e12268d3_replica_outbox","sync_dd6dd4054975ce4abcd1e12268d3_replica_resolutions","sync_dd6dd4054975ce4abcd1e12268d3_replica_state","sync_dd6dd4054975ce4abcd1e12268d3_track_0_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_0_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_0_update","sync_dd6dd4054975ce4abcd1e12268d3_track_1_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_1_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_1_update","sync_dd6dd4054975ce4abcd1e12268d3_track_2_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_2_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_2_update","sync_dd6dd4054975ce4abcd1e12268d3_track_3_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_3_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_3_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.feed','official-feed-binding','feed',1,'["feed_item_events","feed_item_events_project_item_idx","feed_items","feed_items_project_signal_idx","feed_items_project_source_external_idx","feed_items_project_updated_idx","feed_materials","feed_materials_project_item_idx","feed_missed_pulls","feed_out_rules","feed_out_rules_project_enabled_idx","feed_source_runs","feed_source_runs_project_source_idx","feed_sources","feed_sources_project_updated_idx","listener_deliveries","listener_deliveries_recovery_idx","listener_instances","signal_events","signal_events_project_source_idx","signal_revisions","signals","signals_project_source_observed_idx","source_events","source_events_project_source_idx","sync_14ff60cd5b3b2f8842d99bea7ef6_aggregate_editor_versions","sync_14ff60cd5b3b2f8842d99bea7ef6_context","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes_key","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_conflicts","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_heads","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_outbox","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_resolutions","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state","sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_delete","sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_insert","sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_update","sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_delete","sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_insert","sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_update","sync_522a4260e0bcbee35d4d9f85406c_aggregate_editor_versions","sync_522a4260e0bcbee35d4d9f85406c_context","sync_522a4260e0bcbee35d4d9f85406c_replica_changes","sync_522a4260e0bcbee35d4d9f85406c_replica_changes_key","sync_522a4260e0bcbee35d4d9f85406c_replica_conflicts","sync_522a4260e0bcbee35d4d9f85406c_replica_heads","sync_522a4260e0bcbee35d4d9f85406c_replica_outbox","sync_522a4260e0bcbee35d4d9f85406c_replica_resolutions","sync_522a4260e0bcbee35d4d9f85406c_replica_state","sync_522a4260e0bcbee35d4d9f85406c_track_0_delete","sync_522a4260e0bcbee35d4d9f85406c_track_0_insert","sync_522a4260e0bcbee35d4d9f85406c_track_0_update","sync_522a4260e0bcbee35d4d9f85406c_track_1_delete","sync_522a4260e0bcbee35d4d9f85406c_track_1_insert","sync_522a4260e0bcbee35d4d9f85406c_track_1_update","sync_522a4260e0bcbee35d4d9f85406c_track_2_delete","sync_522a4260e0bcbee35d4d9f85406c_track_2_insert","sync_522a4260e0bcbee35d4d9f85406c_track_2_update","sync_522a4260e0bcbee35d4d9f85406c_track_3_delete","sync_522a4260e0bcbee35d4d9f85406c_track_3_insert","sync_522a4260e0bcbee35d4d9f85406c_track_3_update","sync_522a4260e0bcbee35d4d9f85406c_track_4_delete","sync_522a4260e0bcbee35d4d9f85406c_track_4_insert","sync_522a4260e0bcbee35d4d9f85406c_track_4_update","sync_522a4260e0bcbee35d4d9f85406c_track_5_delete","sync_522a4260e0bcbee35d4d9f85406c_track_5_insert","sync_522a4260e0bcbee35d4d9f85406c_track_5_update","sync_daec9cf494e58d382d6262de3af9_aggregate_editor_versions","sync_daec9cf494e58d382d6262de3af9_context","sync_daec9cf494e58d382d6262de3af9_replica_changes","sync_daec9cf494e58d382d6262de3af9_replica_changes_key","sync_daec9cf494e58d382d6262de3af9_replica_conflicts","sync_daec9cf494e58d382d6262de3af9_replica_heads","sync_daec9cf494e58d382d6262de3af9_replica_outbox","sync_daec9cf494e58d382d6262de3af9_replica_resolutions","sync_daec9cf494e58d382d6262de3af9_replica_state","sync_daec9cf494e58d382d6262de3af9_track_0_delete","sync_daec9cf494e58d382d6262de3af9_track_0_insert","sync_daec9cf494e58d382d6262de3af9_track_0_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.goals','official-goals-binding','goals',1,'["acceptance_criteria","acceptance_goal_idx","boards","goal_event_agreements","goal_event_applied_decisions","goal_event_applied_decisions_goal_idx","goal_event_closures","goal_event_closures_goal_idx","goal_event_concerns","goal_event_concerns_goal_idx","goal_event_config_versions","goal_event_configs","goal_event_decision_requests","goal_event_decision_requests_goal_idx","goal_event_progress_summaries","goal_event_progress_summaries_goal_idx","goal_event_requirement_bindings","goal_event_state_owners","goal_event_state_owners_project_idx","goal_event_types","goal_event_types_goal_idx","goal_event_work_status","goal_relations","goal_requirement_links","goal_trash_one_open_per_goal","goal_trash_records","goal_trash_records_goal_idx","goal_trash_relation_records","goal_trash_relation_records_relation_idx","goal_tree_item_effects","goal_tree_item_effects_proposal_idx","goal_tree_proposal_items","goal_tree_proposal_items_project_idx","goal_tree_proposal_items_proposal_idx","goal_tree_proposals","goal_tree_proposals_project_idx","goal_tree_proposals_supersedes_idx","goal_work_events","goal_work_events_goal_seq_idx","goals","goals_archive_idx","goals_project_idx","goals_ready_idx","goals_trash_idx","input_bindings","relations_from_idx","relations_to_idx","sync_ebbb9ae341b34cbb8aedd65a41e6_aggregate_editor_versions","sync_ebbb9ae341b34cbb8aedd65a41e6_context","sync_ebbb9ae341b34cbb8aedd65a41e6_context_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_context_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_context_update","sync_ebbb9ae341b34cbb8aedd65a41e6_journal","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes_key","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_conflicts","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_heads","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_outbox","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_resolutions","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state","sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.inbox','official-inbox-binding','inbox',1,'["inbox_scene_bindings"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.risk','official-risk-binding','risk',1,'["risk_editor_versions","risk_events","risk_events_risk_idx","risk_items","risk_items_status_idx","risk_links","risk_links_subject_idx","sync_57fe6903aad21582fd1bfbdd6011_aggregate_editor_versions","sync_57fe6903aad21582fd1bfbdd6011_context","sync_57fe6903aad21582fd1bfbdd6011_replica_changes","sync_57fe6903aad21582fd1bfbdd6011_replica_changes_key","sync_57fe6903aad21582fd1bfbdd6011_replica_conflicts","sync_57fe6903aad21582fd1bfbdd6011_replica_heads","sync_57fe6903aad21582fd1bfbdd6011_replica_outbox","sync_57fe6903aad21582fd1bfbdd6011_replica_resolutions","sync_57fe6903aad21582fd1bfbdd6011_replica_state","sync_57fe6903aad21582fd1bfbdd6011_track_0_delete","sync_57fe6903aad21582fd1bfbdd6011_track_0_insert","sync_57fe6903aad21582fd1bfbdd6011_track_0_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.schedule','official-schedule-binding','schedule',1,'["schedule_conversation_tasks","schedule_conversation_tasks_enabled_idx","schedule_conversation_turns","schedule_conversation_turns_task_idx","schedule_missed_runs","schedule_operation_occurrences","schedule_operations","schedule_plugin_reminders","schedule_plugin_reminders_owner","sync_fc44281fa4e6ae1ad919f15bea63_aggregate_editor_versions","sync_fc44281fa4e6ae1ad919f15bea63_context","sync_fc44281fa4e6ae1ad919f15bea63_replica_changes","sync_fc44281fa4e6ae1ad919f15bea63_replica_changes_key","sync_fc44281fa4e6ae1ad919f15bea63_replica_conflicts","sync_fc44281fa4e6ae1ad919f15bea63_replica_heads","sync_fc44281fa4e6ae1ad919f15bea63_replica_outbox","sync_fc44281fa4e6ae1ad919f15bea63_replica_resolutions","sync_fc44281fa4e6ae1ad919f15bea63_replica_state","sync_fc44281fa4e6ae1ad919f15bea63_track_0_delete","sync_fc44281fa4e6ae1ad919f15bea63_track_0_insert","sync_fc44281fa4e6ae1ad919f15bea63_track_0_update","sync_fc44281fa4e6ae1ad919f15bea63_track_1_delete","sync_fc44281fa4e6ae1ad919f15bea63_track_1_insert","sync_fc44281fa4e6ae1ad919f15bea63_track_1_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-4cf31e639ff642433fc8607610c1a58d','{"install_id":"plugin-install-4cf31e639ff642433fc8607610c1a58d","installation_generation":"1a963148-6226-473e-841c-ef99c52b2f50","plugin_id":"io.molis.work.ppt","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-ppt-binding","manifest_digest":"ae3f34cec4f35fdf105063f883c7124c07e79a194ea5260ddcca573a49367997","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:delegate","artifact:read","artifact:write","model:invoke","ppt:read","ppt:write","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-4fdfcfd6d1db70e62f4224fae088eb1f','{"install_id":"plugin-install-4fdfcfd6d1db70e62f4224fae088eb1f","installation_generation":"5c955624-437b-44da-9d27-2398df8a4972","plugin_id":"io.molis.work.form","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-form-binding","manifest_digest":"c9f86e82954aa2630e329b6d684520fe8694c4f76058cf0b43ef9b81bbe0ff5b","deployment":"local","selected_entrypoint":"./index.js","grants":["artifact:read","artifact:write","form:read","form:submit","form:write","model:invoke","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-537d2d3be6d4ee6a1f86585c6e624a27','{"install_id":"plugin-install-537d2d3be6d4ee6a1f86585c6e624a27","installation_generation":"7fb142b9-3bb2-4ed8-a7ef-bbaaab2479a5","plugin_id":"io.molis.work.pages","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-pages-binding","manifest_digest":"8e7bee967eda9e423b56b0ece26a18ffc86836202f2d168580f8eeb5a80efd7d","deployment":"local","selected_entrypoint":"./index.js","grants":["artifact:read","artifact:write","goals:read","materials:read","model:invoke","pages:read","pages:write","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-622cc088255ca49281508f43304aa664','{"install_id":"plugin-install-622cc088255ca49281508f43304aa664","installation_generation":"2cb47696-98e7-486a-ad4a-0df67772018f","plugin_id":"io.molis.work.dataset","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-dataset-binding","manifest_digest":"4704f89c0adda1b29cfcf3ec535ce5f4b3992bb405652876994f99c5901efffa","deployment":"local","selected_entrypoint":"./index.js","grants":["artifact:read","artifact:write","dataset:read","dataset:write","model:invoke","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-6fc840a4ff1292e26de87e863c01467d','{"install_id":"plugin-install-6fc840a4ff1292e26de87e863c01467d","installation_generation":"7524b271-3c20-4e59-a138-0089bf3c7eef","plugin_id":"io.molis.work.native.workflows","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-workflows-binding","manifest_digest":"8dfe7904c21ecf58152c3cb2d2978464884d405703fc75b58e3732ac1b9f4254","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:delegate","model:invoke","storage:private","workflows:read","workflows:write"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-89fdd009a6009b63a534e1c415360402','{"install_id":"plugin-install-89fdd009a6009b63a534e1c415360402","installation_generation":"75b4246d-e4eb-4bcd-a726-a069e74304ee","plugin_id":"io.molis.work.lingguang","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-lingguang-binding","manifest_digest":"b7db4be10aa7ad223c616613fa540fee5bab39e6aa4a7490a91cfaf28c51d235","deployment":"local","selected_entrypoint":"./index.js","grants":["lingguang:read","lingguang:write","materials:fetch","materials:read","model:invoke","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-da3726a85a96dceede918bef171fbc66','{"install_id":"plugin-install-da3726a85a96dceede918bef171fbc66","installation_generation":"1201521b-f3d7-4f3a-8849-932009299426","plugin_id":"io.molis.work.schedule","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-schedule-binding","manifest_digest":"f30bbea664eeb308adcb205e3e7ca3b998db4bd5b877f3727396e30901ac8f37","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:invoke","agent:run","model:read","notifications:write","plugins:read","schedule:read","schedule:write","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.dataset','official-dataset-binding','0.1.0','4704f89c0adda1b29cfcf3ec535ce5f4b3992bb405652876994f99c5901efffa','{"plugin_id":"io.molis.work.dataset","publisher_signature":"official-dataset-binding","version":"0.1.0","manifest_digest":"4704f89c0adda1b29cfcf3ec535ce5f4b3992bb405652876994f99c5901efffa","manifest":"sha256:ef9e28f79469e57588134e6ddaecc6eea48a394b06918ffefda60a6ea7ab54da"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.form','official-form-binding','0.1.0','c9f86e82954aa2630e329b6d684520fe8694c4f76058cf0b43ef9b81bbe0ff5b','{"plugin_id":"io.molis.work.form","publisher_signature":"official-form-binding","version":"0.1.0","manifest_digest":"c9f86e82954aa2630e329b6d684520fe8694c4f76058cf0b43ef9b81bbe0ff5b","manifest":"sha256:c900ffd68c6b8be8751a7281515457a5744b759e15506ad20655177c53edf7f1"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.lingguang','official-lingguang-binding','0.1.0','b7db4be10aa7ad223c616613fa540fee5bab39e6aa4a7490a91cfaf28c51d235','{"plugin_id":"io.molis.work.lingguang","publisher_signature":"official-lingguang-binding","version":"0.1.0","manifest_digest":"b7db4be10aa7ad223c616613fa540fee5bab39e6aa4a7490a91cfaf28c51d235","manifest":"sha256:e3ffcaee9c64a9585e897bef37d4c70f7c3ad53a16acc4b0bb92d1b8dfdab095"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.native.workflows','official-workflows-binding','0.1.0','8dfe7904c21ecf58152c3cb2d2978464884d405703fc75b58e3732ac1b9f4254','{"plugin_id":"io.molis.work.native.workflows","publisher_signature":"official-workflows-binding","version":"0.1.0","manifest_digest":"8dfe7904c21ecf58152c3cb2d2978464884d405703fc75b58e3732ac1b9f4254","manifest":"sha256:5daa70cb6c677ba42b12237af8b0f47dd1b3e1ddb212de2cd21c108f0e6f8e15"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.pages','official-pages-binding','0.1.0','8e7bee967eda9e423b56b0ece26a18ffc86836202f2d168580f8eeb5a80efd7d','{"plugin_id":"io.molis.work.pages","publisher_signature":"official-pages-binding","version":"0.1.0","manifest_digest":"8e7bee967eda9e423b56b0ece26a18ffc86836202f2d168580f8eeb5a80efd7d","manifest":"sha256:b43f08c7d30a3435c8103b331c1c8bffe3a1d0cc656e7b03114d3f137bdc0c10"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.ppt','official-ppt-binding','0.1.0','ae3f34cec4f35fdf105063f883c7124c07e79a194ea5260ddcca573a49367997','{"plugin_id":"io.molis.work.ppt","publisher_signature":"official-ppt-binding","version":"0.1.0","manifest_digest":"ae3f34cec4f35fdf105063f883c7124c07e79a194ea5260ddcca573a49367997","manifest":"sha256:9caecbd6aa68bbb926bd1bb0dfb6d53b408afeda31dcca61c6a42584477eb01d"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.schedule','official-schedule-binding','0.1.0','f30bbea664eeb308adcb205e3e7ca3b998db4bd5b877f3727396e30901ac8f37','{"plugin_id":"io.molis.work.schedule","publisher_signature":"official-schedule-binding","version":"0.1.0","manifest_digest":"f30bbea664eeb308adcb205e3e7ca3b998db4bd5b877f3727396e30901ac8f37","manifest":"sha256:159d36b4ee53d960ecd966616ca722521f112133b5b2d60af8b78ad27ecb3d96"}');
INSERT INTO "process_items_replica_state"("id","device","cursor","applying") VALUES(1,'8f4f4de036d13ce0cdcbc07fe81e5d7b',0,0);
INSERT INTO "project_approvals_replica_state"("id","device","cursor","applying") VALUES(1,'2048b8091611a55adc7e2e0917b8812f',0,0);
INSERT INTO "project_guidance_replica_state"("id","device","cursor","applying") VALUES(1,'374cd7d5435e7882b8a2042742a9745c',0,0);
INSERT INTO "project_root"("project_id","created_at") VALUES('personal','2026-01-15T09:00:00.000Z');
INSERT INTO "surface_corrections_replica_state"("id","device","cursor","applying") VALUES(1,'661fde1bfc0205ce935e478fdc738656',0,0);
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_context"("id","project_id") VALUES(1,NULL);
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state"("id","device","cursor","applying") VALUES(1,'b346398d1919adacd81502ed84ca9396',0,0);
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_context"("id","project_id") VALUES(1,NULL);
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_state"("id","device","cursor","applying") VALUES(1,'4d69544335d692da048ab7843ca35ca0',0,0);
INSERT INTO "sync_57fe6903aad21582fd1bfbdd6011_context"("id","project_id") VALUES(1,NULL);
INSERT INTO "sync_57fe6903aad21582fd1bfbdd6011_replica_state"("id","device","cursor","applying") VALUES(1,'6888307d62b66921256d77feb647ba92',0,0);
INSERT INTO "sync_daec9cf494e58d382d6262de3af9_context"("id","project_id") VALUES(1,NULL);
INSERT INTO "sync_daec9cf494e58d382d6262de3af9_replica_state"("id","device","cursor","applying") VALUES(1,'40a492fbaf17e2d27bfa2cd3f985f121',0,0);
INSERT INTO "sync_dd6dd4054975ce4abcd1e12268d3_context"("id","project_id") VALUES(1,NULL);
INSERT INTO "sync_dd6dd4054975ce4abcd1e12268d3_replica_state"("id","device","cursor","applying") VALUES(1,'ed684c6d7af4aa9dd326582db5816167',0,0);
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_context"("id","project_id") VALUES(1,NULL);
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state"("id","device","cursor","applying") VALUES(1,'6202fcd75e790ac6dc4fd9233d302e10',0,0);
INSERT INTO "sync_fc44281fa4e6ae1ad919f15bea63_context"("id","project_id") VALUES(1,'personal');
INSERT INTO "sync_fc44281fa4e6ae1ad919f15bea63_replica_state"("id","device","cursor","applying") VALUES(1,'f1d5bfd7a4dbcd1f3271c33859bbbd6f',0,0);
DELETE FROM sqlite_sequence;
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
