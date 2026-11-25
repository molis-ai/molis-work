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
CREATE TABLE plugin_partition_runtime (install_id TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK (state IN ('installed', 'running', 'disabled', 'crashed', 'quarantined')),
      recovery_count INTEGER NOT NULL CHECK (recovery_count >= 0), last_error_code TEXT, updated_at TEXT NOT NULL);
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
INSERT INTO "acceptance_decisions"("seq","decision_id","subject_no","clock","requirement_id","requirement_version","stands_round","version","decision","note","origin","origin_ref","actor_id","decided_at") VALUES(1,'9b69f394-bb47-41ee-9ba3-def3f8d562b3',5,1,'CORE-C1',1,1,'demo-core-delivery','accepted',NULL,'trusted_decision','9b69f394-bb47-41ee-9ba3-def3f8d562b3','demo-user','2026-01-15T09:00:00.000Z');
INSERT INTO "acceptance_decisions"("seq","decision_id","subject_no","clock","requirement_id","requirement_version","stands_round","version","decision","note","origin","origin_ref","actor_id","decided_at") VALUES(2,'abaac866-a9e4-4fbc-8b91-2b5b7e2bb804',9,1,'GRAPH-C1',1,1,'demo-graph-delivery','accepted',NULL,'trusted_decision','abaac866-a9e4-4fbc-8b91-2b5b7e2bb804','demo-user','2026-01-15T09:00:00.000Z');
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
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(21,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","GRAPH"]');
INSERT INTO "acceptance_replica_changes"("seq","key") VALUES(22,'["molis-work-v1-demo","acceptance","io.molis.work.goals","goal","CORE"]');
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
INSERT INTO "artifacts_replica_changes"("seq","key") VALUES(4,'["molis-work-v1-demo","artifact","feed-capture:feeditem-524ac393-86d6-46f3-aa23-521b6125fb25:feedoutrule-b3d79af8-f503-42d6-9c34-3e1e2019669d"]');
INSERT INTO "artifacts_replica_changes"("seq","key") VALUES(5,'["molis-work-v1-demo","artifact","feed-capture:feeditem-524ac393-86d6-46f3-aa23-521b6125fb25:feedoutrule-b3d79af8-f503-42d6-9c34-3e1e2019669d"]');
INSERT INTO "artifacts_replica_state"("id","device","cursor","applying") VALUES(1,'e06f0f28f286226e0bf7c130daa5c634',0,0);
INSERT INTO "attention_entries"("project_id","entry_id","owner_plugin_id","subject_type","subject_id","reason","status","detail_json","revision","created_at","updated_at","completed_at") VALUES('molis-work-v1-demo','inboxentry-11ffdf71-62f2-4644-8126-ff97ebc1933b','io.molis.work.feed','feed_item','feeditem-35245c29-2139-4da3-87d4-8a33482f6116','manual','dismissed','{}',2,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_entries"("project_id","entry_id","owner_plugin_id","subject_type","subject_id","reason","status","detail_json","revision","created_at","updated_at","completed_at") VALUES('molis-work-v1-demo','inboxentry-16a8a3af-99c5-4b07-8fa6-5ad588f13de7','io.molis.work.feed','feed_item','feeditem-e0273360-7f83-45a4-a637-02fb499ee682','source_rule','open','{"source_id":"demo-github"}',1,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "attention_entries"("project_id","entry_id","owner_plugin_id","subject_type","subject_id","reason","status","detail_json","revision","created_at","updated_at","completed_at") VALUES('molis-work-v1-demo','inboxentry-83ff703c-5af7-41d1-921a-69833231b509','io.molis.work.feed','source_fault','demo-gmail','source_fault','open','{"error_code":"feed.auth_required","user_action":"连接 Gmail 后重新同步。未授权前只保留这条故障引用。"}',1,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "attention_entries"("project_id","entry_id","owner_plugin_id","subject_type","subject_id","reason","status","detail_json","revision","created_at","updated_at","completed_at") VALUES('molis-work-v1-demo','inboxentry-b8e6147f-606c-4e18-ae3d-37576faf8495','io.molis.work.feed','feed_item','feeditem-48378648-c010-49f7-bc01-9d350156eec4','manual','done','{}',2,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_entries"("project_id","entry_id","owner_plugin_id","subject_type","subject_id","reason","status","detail_json","revision","created_at","updated_at","completed_at") VALUES('molis-work-v1-demo','inboxentry-b97e33e2-90f2-4d42-b18f-34b341c15bd6','io.molis.work.feed','feed_item','feeditem-524ac393-86d6-46f3-aa23-521b6125fb25','manual','open','{"added_by":"web_user"}',1,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "attention_events"("event_id","project_id","entry_id","owner_plugin_id","type","subject_type","subject_id","at") VALUES('attention-event-4f53820d-0635-48d7-acc5-90c9c1aab65d','molis-work-v1-demo','inboxentry-11ffdf71-62f2-4644-8126-ff97ebc1933b','io.molis.work.feed','attention_entry.created','feed_item','feeditem-35245c29-2139-4da3-87d4-8a33482f6116','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_events"("event_id","project_id","entry_id","owner_plugin_id","type","subject_type","subject_id","at") VALUES('attention-event-5af55b0a-0bfc-4cdf-9099-e42661a769a7','molis-work-v1-demo','inboxentry-b97e33e2-90f2-4d42-b18f-34b341c15bd6','io.molis.work.feed','attention_entry.created','feed_item','feeditem-524ac393-86d6-46f3-aa23-521b6125fb25','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_events"("event_id","project_id","entry_id","owner_plugin_id","type","subject_type","subject_id","at") VALUES('attention-event-87adbc21-b578-4a2f-81d7-2b5c481e4655','molis-work-v1-demo','inboxentry-83ff703c-5af7-41d1-921a-69833231b509','io.molis.work.feed','attention_entry.created','source_fault','demo-gmail','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_events"("event_id","project_id","entry_id","owner_plugin_id","type","subject_type","subject_id","at") VALUES('attention-event-9d20a194-8207-4cb5-aa38-3efbf7d78ad5','molis-work-v1-demo','inboxentry-16a8a3af-99c5-4b07-8fa6-5ad588f13de7','io.molis.work.feed','attention_entry.created','feed_item','feeditem-e0273360-7f83-45a4-a637-02fb499ee682','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_events"("event_id","project_id","entry_id","owner_plugin_id","type","subject_type","subject_id","at") VALUES('attention-event-a9519fda-9189-488c-aaf9-de122ed86fd2','molis-work-v1-demo','inboxentry-b8e6147f-606c-4e18-ae3d-37576faf8495','io.molis.work.feed','attention_entry.done','feed_item','feeditem-48378648-c010-49f7-bc01-9d350156eec4','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_events"("event_id","project_id","entry_id","owner_plugin_id","type","subject_type","subject_id","at") VALUES('attention-event-ad8a580f-7cfd-48e7-8347-d829c8bcf420','molis-work-v1-demo','inboxentry-b8e6147f-606c-4e18-ae3d-37576faf8495','io.molis.work.feed','attention_entry.created','feed_item','feeditem-48378648-c010-49f7-bc01-9d350156eec4','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_events"("event_id","project_id","entry_id","owner_plugin_id","type","subject_type","subject_id","at") VALUES('attention-event-cd211807-8baf-4208-b474-5a752ef1dcb7','molis-work-v1-demo','inboxentry-11ffdf71-62f2-4644-8126-ff97ebc1933b','io.molis.work.feed','attention_entry.dismissed','feed_item','feeditem-35245c29-2139-4da3-87d4-8a33482f6116','2026-01-15T09:00:00.000Z');
INSERT INTO "attention_replica_changes"("seq","key") VALUES(1,'["molis-work-v1-demo","project_attention","molis-work-v1-demo"]');
INSERT INTO "attention_replica_state"("id","device","cursor","applying") VALUES(1,'d4e559e5ea8e3d2990fef8433b731eed',0,0);
INSERT INTO "boards"("project_id","active_goal_id","created_at","updated_at") VALUES('molis-work-v1-demo','V1','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "builder_replica_state"("id","device","cursor","applying") VALUES(1,'6e0ffb686e314e9d9273e7b514aac0f8',0,0);
INSERT INTO "context_edges"("scope_kind","scope_id","edge_key","revision","relation_type","source_json","target_json","actor_id","cause","recorded_at","state") VALUES('personal','molis-work-v1-demo','io.molis.work.goals:goal.output:CORE:["demo/core-lifecycle-record",2]',1,'goal.output','{"module":"plugins","plugin_id":"io.molis.work.goals","object_type":"goal","id":"CORE","version":null,"scope":{"kind":"personal","id":"molis-work-v1-demo"}}','{"module":"artifacts","id":"demo/core-lifecycle-record","version":2,"scope":{"kind":"personal","id":"molis-work-v1-demo"}}','demo-user','goals.deliverable','2026-01-15T09:00:00.000Z','active');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(1,'event:artifact:demo/core-lifecycle-record:1:registered','molis-work-v1-demo','demo-user','artifact.published','artifact','demo/core-lifecycle-record@1','Plugin 发布了成果','{"artifact_id":"demo/core-lifecycle-record","version":1,"artifact_type_id":"io.molis.work.document","schema_version":2,"scope":"personal","content_digest":"sha256:ed13d996053ecdf96834908c38ab3f29bb5fcb025d78a8c6637c89ad369a25b9"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(2,'event:artifact:demo/core-lifecycle-record:2:registered','molis-work-v1-demo','demo-user','artifact.version_registered','artifact','demo/core-lifecycle-record@2','Plugin 注册了新的成果版本','{"artifact_id":"demo/core-lifecycle-record","version":2,"artifact_type_id":"io.molis.work.document","schema_version":2,"scope":"personal","content_digest":"sha256:fa22a2ebab3f7427680667dd56516e60bff3ec43c66514cb29e4b1dc784c2846"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(3,'9114d01a-6365-4782-9d38-7adf40146af0','molis-work-v1-demo','web-user','io.molis.work.goals:board.created','io.molis.work.goals:board','molis-work-v1-demo','创建 Molis Work 真相源','{}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(4,'b5321d1b-2426-4de3-919a-f415731e277e','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','V1','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(5,'gevt-a181c455-0c51-46f6-8ba6-95c3b0705cfa','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-a181c455-0c51-46f6-8ba6-95c3b0705cfa','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(6,'2acc6c57-7976-4713-8c04-021ed17b391e','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','PLATFORM','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(7,'gevt-e225fec3-f145-4cac-a17e-661fc94d8193','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-e225fec3-f145-4cac-a17e-661fc94d8193','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(8,'74297b36-ce1d-4165-aac6-4307dff2a605','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-92d4235c-0ef8-4c84-8e26-ff68272269dd','创建 Goal 时指定上级 Goal','{"from_goal_id":"PLATFORM","to_goal_id":"V1","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(9,'5401c750-0288-436d-9c23-041741e8a76b','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','WORKSPACE','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(10,'gevt-47f212b8-3d0e-410d-9c3c-74d359e54880','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-47f212b8-3d0e-410d-9c3c-74d359e54880','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(11,'0612eade-dd2c-4bb7-91e1-21a91a5fbc56','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-b445fac9-9ddc-4b60-a585-5b8855a7ad10','创建 Goal 时指定上级 Goal','{"from_goal_id":"WORKSPACE","to_goal_id":"V1","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(12,'bd5ef2b4-82db-4a87-bb3c-3d874eed1914','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','ADOPTION','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(13,'gevt-8bd38e85-5c90-4e49-bbdd-e5ea8a6aeae0','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-8bd38e85-5c90-4e49-bbdd-e5ea8a6aeae0','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(14,'ae64fc54-34f4-4e53-9c3a-c28e5c8e0f59','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-62feb584-b421-405b-99d3-358936d594f2','创建 Goal 时指定上级 Goal','{"from_goal_id":"ADOPTION","to_goal_id":"V1","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(15,'29878ef6-7279-4758-bc3b-1481c2abc469','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','CORE','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(16,'gevt-ba09d91f-a461-4de2-aa18-b46981f30d28','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-ba09d91f-a461-4de2-aa18-b46981f30d28','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(17,'00386eb5-40c6-4949-934f-edde836a50bd','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-f479e1ce-b2cc-417e-b959-55b33aefa029','创建 Goal 时指定上级 Goal','{"from_goal_id":"CORE","to_goal_id":"PLATFORM","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(18,'025e9ed4-ff2b-4181-9b7a-c32ae3ae3695','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','INTERFACES','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(19,'gevt-9e93990c-0197-4560-8852-110ceb4c5e17','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-9e93990c-0197-4560-8852-110ceb4c5e17','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(20,'0b844ba7-6aee-4ea7-b1c0-acef5cf18bf5','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-3a8f0117-8b12-4dcd-9fc1-98a6448acfc3','创建 Goal 时指定上级 Goal','{"from_goal_id":"INTERFACES","to_goal_id":"PLATFORM","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(21,'a2493504-a0af-4a9a-8a22-b25c0fb1daa5','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-e3a97e43-5662-4c3b-af4a-518da800be16','创建 Goal 时指定上游依赖','{"from_goal_id":"INTERFACES","to_goal_id":"CORE","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(22,'7e14b2f6-acaa-49b4-ac25-e77edff0a4da','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','RISK','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(23,'gevt-1c6c2930-165d-4573-93a4-91f6aba01429','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-1c6c2930-165d-4573-93a4-91f6aba01429','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(24,'082b59f3-05f2-4094-929f-8bf8ce47e97c','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-49ea29b9-1e35-47f1-995e-151c274d9752','创建 Goal 时指定上级 Goal','{"from_goal_id":"RISK","to_goal_id":"PLATFORM","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(25,'7c2991d2-c753-4bda-8f8f-62c4b6751d82','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-9fd04c88-5a73-47cd-92da-0ffae60fc85d','创建 Goal 时指定上游依赖','{"from_goal_id":"RISK","to_goal_id":"INTERFACES","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(26,'74e9c692-deab-40c8-85bd-94d3b0b906f4','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','WEB','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(27,'gevt-31e6966c-fac0-4018-9867-3200d5807200','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-31e6966c-fac0-4018-9867-3200d5807200','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(28,'21d2aad5-628b-4995-a71a-96ebf6da586d','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-16664916-a051-4c98-aed2-a18681b33232','创建 Goal 时指定上级 Goal','{"from_goal_id":"WEB","to_goal_id":"WORKSPACE","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(29,'7623b27d-36e0-4210-adac-b2a7853be216','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-bcc73a98-77ab-4e30-8de8-8f728baf8543','创建 Goal 时指定上游依赖','{"from_goal_id":"WEB","to_goal_id":"INTERFACES","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(30,'c30a9e0c-a679-456c-94b0-110b453c0d20','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','GRAPH','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(31,'gevt-5848a47b-6932-4a7d-a36f-b7b057533f35','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-5848a47b-6932-4a7d-a36f-b7b057533f35','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(32,'33c7d104-f527-4d81-9f4c-d72266e4e2d0','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-c4a22b29-fb35-46ee-bcc5-b7b4298b1ed8','创建 Goal 时指定上级 Goal','{"from_goal_id":"GRAPH","to_goal_id":"WORKSPACE","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(33,'0e7660e3-1fd8-4d31-b09c-9401f8dcb1f8','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-662d58c8-d07a-40ac-8ea9-83dd6c1b7203','创建 Goal 时指定上游依赖','{"from_goal_id":"GRAPH","to_goal_id":"CORE","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(34,'dd7a6208-789a-4693-8cf9-97cd0ea8cb77','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','DESKTOP','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(35,'gevt-de1ba585-c7f5-4dcf-a3a0-f46b4252c501','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-de1ba585-c7f5-4dcf-a3a0-f46b4252c501','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(36,'3d7bcde8-ebeb-4d6a-9231-223cc2c4df96','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-830071b4-b3f0-45a7-a034-3305a9e3f36e','创建 Goal 时指定上级 Goal','{"from_goal_id":"DESKTOP","to_goal_id":"WORKSPACE","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(37,'ec43a913-5c08-4378-b5e9-bb5bbf71f3b7','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-1253db4b-c222-48ac-976f-de839963cb22','创建 Goal 时指定上游依赖','{"from_goal_id":"DESKTOP","to_goal_id":"CORE","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(38,'235e6975-7ed7-4999-8e49-149571a10ebf','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','DECIDE','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(39,'gevt-73bc2967-d5a4-481a-be5d-bcf99d2f5f30','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-73bc2967-d5a4-481a-be5d-bcf99d2f5f30','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(40,'aa8b10d2-bb5a-4945-af76-5a981350ed13','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-f74a15a6-5e4d-45e2-9bb6-2c74d9c11802','创建 Goal 时指定上级 Goal','{"from_goal_id":"DECIDE","to_goal_id":"WORKSPACE","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(41,'ed0d012c-0244-44bd-8117-a6283a2efa42','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-01073c17-b8e9-48ab-94bd-2a3ea26854f2','创建 Goal 时指定上游依赖','{"from_goal_id":"DECIDE","to_goal_id":"DESKTOP","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(42,'2d1ce950-4e5a-4d4e-a54b-12c17466f539','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','RELEASE','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(43,'gevt-25963fd1-3c6a-4acc-91d8-120303dba7ac','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-25963fd1-3c6a-4acc-91d8-120303dba7ac','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(44,'a3e8ea1b-17f4-416b-89b3-41e2b5766be5','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-492757ea-3e23-45dc-81f5-bc7f39562a7f','创建 Goal 时指定上级 Goal','{"from_goal_id":"RELEASE","to_goal_id":"ADOPTION","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(45,'0e0d2e6d-cf2c-499c-a458-dc254b5c77ec','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','ONBOARDING','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(46,'gevt-2488802b-5620-4eee-ba26-32484272c62a','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-2488802b-5620-4eee-ba26-32484272c62a','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(47,'ab6d47eb-0ac0-411b-ba42-0fc34336161d','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-218c75d1-5347-4655-8c62-f0d951cdfff5','创建 Goal 时指定上级 Goal','{"from_goal_id":"ONBOARDING","to_goal_id":"ADOPTION","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(48,'8496c4da-f1ae-4d09-aca4-f694c8bae804','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-eb63b53b-7f53-4ead-a6d5-85a69290a5e3','创建 Goal 时指定上游依赖','{"from_goal_id":"ONBOARDING","to_goal_id":"RELEASE","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(49,'3393829a-be87-4187-b886-fe594fb0c8eb','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','DOCS','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(50,'gevt-df43a6f1-539b-4d83-8e62-2dc6538359fb','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-df43a6f1-539b-4d83-8e62-2dc6538359fb','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(51,'d9ca98aa-3f98-4f84-aa36-0ef242945efa','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-29ab9660-7990-4148-9ad9-bcbea7789977','创建 Goal 时指定上级 Goal','{"from_goal_id":"DOCS","to_goal_id":"ADOPTION","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(52,'9befc4d3-7c6b-49b4-949b-e414651f934c','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-9821ae08-4030-4d06-a5d7-bc1c9394691f','创建 Goal 时指定上游依赖','{"from_goal_id":"DOCS","to_goal_id":"ONBOARDING","type":"depends_on","state":"active","reason":"创建 Goal 时指定上游依赖"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(53,'514e03e3-437c-4ed9-af6c-7b4cf5584d95','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','DROPPED','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(54,'gevt-f37e510b-af42-4563-a44f-b7a82ab84f6a','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-f37e510b-af42-4563-a44f-b7a82ab84f6a','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(55,'e4b48f45-1ab3-4584-9b12-98ba705002b2','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-c5e67d28-ad64-4b85-bd12-6ea9e63a7dec','创建 Goal 时指定上级 Goal','{"from_goal_id":"DROPPED","to_goal_id":"ADOPTION","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(56,'6ada3824-c254-4139-9dcf-0d2b50dd7998','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','WEB-SCAN','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(57,'gevt-06beb234-ffa9-4208-a478-f61ba493096a','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-06beb234-ffa9-4208-a478-f61ba493096a','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(58,'2a2fe68f-4888-4a00-9c34-ed70f2594807','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-e60568c4-cc8c-4f56-acd1-95523a6aa902','创建 Goal 时指定上级 Goal','{"from_goal_id":"WEB-SCAN","to_goal_id":"WEB","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(59,'6644d8cb-f63a-4335-a82b-9b64311890dd','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','WEB-SCAN-ROW','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(60,'gevt-cdda1286-03bc-4319-bec9-cfdbe4032d63','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-cdda1286-03bc-4319-bec9-cfdbe4032d63','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(61,'05004a6b-649c-4992-b78c-2d5673c343c0','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-a41fa59b-2c5e-4859-9ef2-49541cdfe882','创建 Goal 时指定上级 Goal','{"from_goal_id":"WEB-SCAN-ROW","to_goal_id":"WEB-SCAN","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(62,'a01b40b0-40e2-47ac-9616-8307fa0f2db5','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','WEB-SCAN-NEST','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(63,'gevt-db2769d1-0a06-475f-8b7c-7f453f147f0b','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-db2769d1-0a06-475f-8b7c-7f453f147f0b','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(64,'6d49f2c8-0cf3-40fb-9003-de93aba12884','molis-work-v1-demo','demo-user','io.molis.work.goals:relation.added','io.molis.work.goals:relation','relation-435f16ad-5112-47ed-a4bb-be73163cfb15','创建 Goal 时指定上级 Goal','{"from_goal_id":"WEB-SCAN-NEST","to_goal_id":"WEB-SCAN-ROW","type":"part_of","state":"active","reason":"创建 Goal 时指定上级 Goal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(65,'3cf28716-f5e3-4ea8-afc2-a7a952c52fca','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.created','io.molis.work.goals:goal','AUTO-CONNECT','保存原始意图','{"definition_state":"draft","decomposition_state":"abstract"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(66,'gevt-e73fe355-8978-4a89-be0e-278d21369260','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.intent_created','io.molis.work.goals:goal_work_event','gevt-e73fe355-8978-4a89-be0e-278d21369260','保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(67,'gevt-f9c13db5-eb07-43f9-92d9-5ddbfac16c45','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.observation_note','io.molis.work.goals:goal_work_event','gevt-f9c13db5-eb07-43f9-92d9-5ddbfac16c45','接入 Runtime 后必须新开会话；继续使用接入前的会话会让人误以为安装失败。','{"operation":"observation_note","body":"接入 Runtime 后必须新开会话；继续使用接入前的会话会让人误以为安装失败。"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(68,'91ba3a00-f10f-40d3-a624-c3741c178592','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.trashed','io.molis.work.goals:goal','AUTO-CONNECT','这会替用户猜项目；当前方案只展示历史候选，并再次询问用户','{"trash_record_id":"trash-95f6898e-9c5b-4fb9-9bad-0d76a57f2777","deactivated_relation_ids":[],"active_goal_cleared":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(69,'gevt-83e5ca86-bdbc-4584-9bfa-a6a2eea755bf','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_config.updated','io.molis.work.goals:goal_event_config','CORE','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[{"type_id":"lifecycle","requirement_id":"CORE-C1"}]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(70,'gevt-3b18ef0e-3306-476b-98e3-fee5d3abe9d6','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.work_event.recorded','io.molis.work.goals:goal_work_event','gevt-3b18ef0e-3306-476b-98e3-fee5d3abe9d6','生命周期记录已接通','{"type_id":"lifecycle","type_version":1,"fields":{"result":"从约定、报告到收尾形成完整记录"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(71,'gevt-621ab6b2-dfcd-4fc9-b561-663e6f9183bc','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.progress_summary','io.molis.work.goals:goal_work_event','gevt-621ab6b2-dfcd-4fc9-b561-663e6f9183bc','记录当前进展和下一步','{"operation":"progress_summary","summary":"完成依据已经写进当前事件记录。","based_on_cursor":70,"next_step":"明确收尾","next_actor":"当前用户"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(72,'gevt-cb94a65a-9579-460f-a030-5139e2b4c4a2','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.observation_note','io.molis.work.goals:goal_work_event','gevt-cb94a65a-9579-460f-a030-5139e2b4c4a2','演示项目用当前事件记录说明这项工作为什么可以算完成。','{"operation":"observation_note","body":"演示项目用当前事件记录说明这项工作为什么可以算完成。"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(73,'gevt-a9231fbf-3799-4268-be0d-e11c1eac11b2','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.observation_note','io.molis.work.goals:goal_work_event','gevt-a9231fbf-3799-4268-be0d-e11c1eac11b2','升级前应先看到安全说明：能保留的旧数据明确列出，不能可靠迁移的内容提示重新整理。','{"operation":"observation_note","body":"升级前应先看到安全说明：能保留的旧数据明确列出，不能可靠迁移的内容提示重新整理。"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(74,'gevt-34e765ca-2837-45f2-a4ab-5060506dbd22','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_config.updated','io.molis.work.goals:goal_event_config','V1','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(75,'gevt-447811b9-b59c-4ac0-a48f-9b42cc3f658a','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.work_event.recorded','io.molis.work.goals:goal_work_event','gevt-447811b9-b59c-4ac0-a48f-9b42cc3f658a','目标树已经能看出下一步','{"type_id":"lifecycle","type_version":1,"fields":{"result":"列表、画布和看板都有真实内容可扫。"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(76,'gevt-0ffa039a-ba27-47ab-a877-d755a7c5839f','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.progress_summary','io.molis.work.goals:goal_work_event','gevt-0ffa039a-ba27-47ab-a877-d755a7c5839f','记录当前进展和下一步','{"operation":"progress_summary","summary":"列表、画布和看板都有真实内容可扫。","based_on_cursor":75,"next_step":"先处理需要决定和受阻的 Goal","next_actor":"当前用户"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(77,'gevt-2ddedb68-8a30-4b3c-a784-45b4ad04270f','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_config.updated','io.molis.work.goals:goal_event_config','DESKTOP','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(78,'gevt-3e3bafdb-0b4b-47a0-84c7-8bef810d63a6','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.work_event.recorded','io.molis.work.goals:goal_work_event','gevt-3e3bafdb-0b4b-47a0-84c7-8bef810d63a6','工作台主栏已经对齐','{"type_id":"lifecycle","type_version":1,"fields":{"result":"目录、舞台和标签已经能在同一窗口里切换。"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(79,'gevt-66516333-92ad-45fd-9ca8-c0f5ef9fea6d','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.progress_summary','io.molis.work.goals:goal_work_event','gevt-66516333-92ad-45fd-9ca8-c0f5ef9fea6d','记录当前进展和下一步','{"operation":"progress_summary","summary":"目录、舞台和标签已经能在同一窗口里切换。","based_on_cursor":78,"next_step":"核对分屏后 Goal 绑定仍保持","next_actor":"当前用户"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(80,'gevt-37fdbcc1-f917-452e-88fa-04b6a517a719','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_config.updated','io.molis.work.goals:goal_event_config','DECIDE','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(81,'gevt-a3219e72-16c1-460f-a670-8828c0f8a9fc','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.decision_requested','io.molis.work.goals:goal_work_event','gevt-a3219e72-16c1-460f-a670-8828c0f8a9fc','请求决定：第一次打开项目时，默认落在 Goal 列表还是默认打开一条 Session？','{"operation":"decision_requested","request_id":"gdec-req-57969f1a-9076-4876-8537-af0e40334b5b","question":"第一次打开项目时，默认落在 Goal 列表还是默认打开一条 Session？","options":[{"option_id":"goals","label":"先看目标树","impact":"用户先理解现在做什么，再决定开哪条会话"},{"option_id":"session","label":"先开 Session","impact":"用户立刻回到对话，但可能还没看清目标"}],"scope":{"requirement_ids":["DECIDE-C1"],"event_ids":[],"concern_ids":[],"action":null},"purpose":"suggestion","proposed_change":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(82,'gevt-cd6a4f46-113f-464b-a726-8ee0ba28cedf','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_config.updated','io.molis.work.goals:goal_event_config','RISK','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(83,'gevt-20a29442-afd9-4c05-b826-07548c849202','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.concern_opened','io.molis.work.goals:goal_work_event','gevt-20a29442-afd9-4c05-b826-07548c849202','提出 Concern：README 仍指向已撤掉的启动命令','{"operation":"concern_opened","concern_id":"gcon-b0398fe7-383a-445e-bee5-f7788f923eac","title":"README 仍指向已撤掉的启动命令","statement":"按文档复制的命令会启动旧入口，用户会以为安装失败。","scope":{"requirement_ids":["RISK-C1"],"event_ids":[],"concern_ids":[],"action":null},"blocks_closure":true,"cited_subjects":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(84,'gevt-ef111823-ff48-40f0-ac74-e53b0500b1d9','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_config.updated','io.molis.work.goals:goal_event_config','GRAPH','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(85,'gevt-3c44de11-20cc-4869-a157-4272a7befff1','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.work_event.recorded','io.molis.work.goals:goal_work_event','gevt-3c44de11-20cc-4869-a157-4272a7befff1','画布已能读出依赖方向','{"type_id":"lifecycle","type_version":1,"fields":{"result":"父子和前置关系都来自真实记录。"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(86,'gevt-e428df36-0016-4b8b-9dc5-9c14603d27f2','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.progress_summary','io.molis.work.goals:goal_work_event','gevt-e428df36-0016-4b8b-9dc5-9c14603d27f2','记录当前进展和下一步','{"operation":"progress_summary","summary":"父子和前置关系都来自真实记录。","based_on_cursor":85,"next_step":"退出日常列表，需要时再打开归档","next_actor":"当前用户"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(87,'gevt-e77b9d67-12d5-4d18-9a28-bd3404a553fb','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_config.updated','io.molis.work.goals:goal_event_config','DROPPED','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(88,'gevt-0622376f-57ce-4d2d-8f91-45b06a0f1010','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.closure_submitted','io.molis.work.goals:goal_work_event','gevt-0622376f-57ce-4d2d-8f91-45b06a0f1010','取消当前 Goal','{"operation":"closure_submitted","kind":"cancel","result":null,"reason":"旧会话读不到新接入，会让人误以为安装失败","completion_applied":false,"unmet_reasons":[],"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(89,'1611d43e-5a48-4786-bf2b-c79f56c30cbc','molis-work-v1-demo','demo-user','io.molis.work.goals:board.active_goal_changed','io.molis.work.goals:goal','V1','演示项目从第一个目标开始','{}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(90,'gevt-62c5cde6-3555-4a2a-9002-076b388fcff3','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.closure_submitted','io.molis.work.goals:goal_work_event','gevt-62c5cde6-3555-4a2a-9002-076b388fcff3','显式完成当前 Goal','{"operation":"closure_submitted","kind":"complete","result":"可用的生命周期记录","reason":"约定要求已有支持事实，演示收尾","completion_applied":true,"unmet_reasons":[],"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(91,'gevt-40c82e49-1a84-4957-a494-edfbd6479e88','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.event_state.closure_submitted','io.molis.work.goals:goal_work_event','gevt-40c82e49-1a84-4957-a494-edfbd6479e88','显式完成当前 Goal','{"operation":"closure_submitted","kind":"complete","result":"画布关系已经可扫","reason":"演示收尾，把已完成关系图移出日常列表","completion_applied":true,"unmet_reasons":[],"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(92,'1dc0ea23-60b2-400e-8590-9cbf92cf15e6','molis-work-v1-demo','demo-user','io.molis.work.goals:goal.archived','io.molis.work.goals:goal','GRAPH','画布关系已经可扫，退出日常工作列表','{"active_goal_cleared":false}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(93,'event-c0ddb2fa-82bb-49eb-b5b5-41bd3ec5bc30','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.registered','io.molis.work.feed:feed_source','feed-source-f34498b13c742f0d0f851765e48fe4d6','已注册 Feed 来源；尚未联网读取','{}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(94,'event-53983fd0-9884-4d12-be1c-eea76a655f00','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.registered','io.molis.work.feed:feed_source','feed-source-a12054cbb831b279742fac4cfe340b2b','已注册 Feed 来源；尚未联网读取','{}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(95,'event-7b534b03-9a4a-406e-8f3a-c4d587f4bba7','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.registered','io.molis.work.feed:feed_source','feed-source-5496d064f90938a458c4b1eec79d4a4b','已注册 Feed 来源；尚未联网读取','{}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(96,'event-d5d0d4cd-221c-496d-bd80-0e4d773bb67f','molis-work-v1-demo','web-user','attention_entry.created','inbox_entry','inboxentry-16a8a3af-99c5-4b07-8fa6-5ad588f13de7','对象已加入 Inbox','{"owner_plugin_id":"io.molis.work.feed","subject_type":"feed_item","subject_id":"feeditem-e0273360-7f83-45a4-a637-02fb499ee682","reason":"source_rule"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(97,'event-227cdc26-8857-4fd4-8f99-6c737e7f9389','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.item_ingested','io.molis.work.feed:feed_item','feeditem-e0273360-7f83-45a4-a637-02fb499ee682','从 GitHub · molis-work 导入 Feed Item','{"source_id":"demo-github","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(98,'event-2562b941-eda8-4d28-b4c2-b3a2d1df8c9e','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.item_ingested','io.molis.work.feed:feed_item','feeditem-bea8b7e7-ba48-426c-819a-53107bc4cac1','从 GitHub · molis-work 导入 Feed Item','{"source_id":"demo-github","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(99,'event-77841ee4-2723-4808-a86e-265b1ff6ff17','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.item_ingested','io.molis.work.feed:feed_item','feeditem-9a816458-356f-46ae-8204-32b5e3178924','从 Gmail · 产品反馈 导入 Feed Item','{"source_id":"demo-gmail","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(100,'event-fb0ab8fd-890c-4719-8c77-0e647103d0ab','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.item_ingested','io.molis.work.feed:feed_item','feeditem-524ac393-86d6-46f3-aa23-521b6125fb25','从 Solidot 导入 Feed Item','{"source_id":"feed-source-f34498b13c742f0d0f851765e48fe4d6","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(101,'event:artifact:feed-capture:feeditem-524ac393-86d6-46f3-aa23-521b6125fb25:feedoutrule-b3d79af8-f503-42d6-9c34-3e1e2019669d:1:registered','molis-work-v1-demo','web-user','artifact.published','artifact','feed-capture:feeditem-524ac393-86d6-46f3-aa23-521b6125fb25:feedoutrule-b3d79af8-f503-42d6-9c34-3e1e2019669d@1','Plugin 发布了成果','{"artifact_id":"feed-capture:feeditem-524ac393-86d6-46f3-aa23-521b6125fb25:feedoutrule-b3d79af8-f503-42d6-9c34-3e1e2019669d","version":1,"artifact_type_id":"io.molis.work.feed.capture","schema_version":1,"scope":"personal","content_digest":"sha256:361ce27361a114a6ccfabf31b04c3c14b595ff6e7c1b9ba30bf40dfc86e68727"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(102,'event-f4047a64-befc-4062-89e9-3370aa6405e8','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.item_ingested','io.molis.work.feed:feed_item','feeditem-35245c29-2139-4da3-87d4-8a33482f6116','从 公开频道 · 工作台演示 导入 Feed Item','{"source_id":"feed-source-a12054cbb831b279742fac4cfe340b2b","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(103,'event-1baee74f-6d09-4805-a16f-9f2fe3413257','molis-work-v1-demo','web-user','io.molis.work.feed:feed_source.item_ingested','io.molis.work.feed:feed_item','feeditem-48378648-c010-49f7-bc01-9d350156eec4','从 共同进度怎么被记住 导入 Feed Item','{"source_id":"feed-source-5496d064f90938a458c4b1eec79d4a4b","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(104,'event-2a3e4033-fc95-4049-acbe-f4e5ca5052ca','molis-work-v1-demo','web-user','attention_entry.created','inbox_entry','inboxentry-b97e33e2-90f2-4d42-b18f-34b341c15bd6','对象已加入 Inbox','{"owner_plugin_id":"io.molis.work.feed","subject_type":"feed_item","subject_id":"feeditem-524ac393-86d6-46f3-aa23-521b6125fb25","reason":"manual"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(105,'event-e0e0fa72-502e-4532-96bc-ba566deb7b3a','molis-work-v1-demo','web-user','attention_entry.created','inbox_entry','inboxentry-11ffdf71-62f2-4644-8126-ff97ebc1933b','对象已加入 Inbox','{"owner_plugin_id":"io.molis.work.feed","subject_type":"feed_item","subject_id":"feeditem-35245c29-2139-4da3-87d4-8a33482f6116","reason":"manual"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(106,'event-ccbc7528-8ff5-41de-a216-c65adf46bc00','molis-work-v1-demo','web-user','attention_entry.dismissed','inbox_entry','inboxentry-11ffdf71-62f2-4644-8126-ff97ebc1933b','Inbox Entry 已标记为 dismissed','{"owner_plugin_id":"io.molis.work.feed","subject_type":"feed_item","subject_id":"feeditem-35245c29-2139-4da3-87d4-8a33482f6116","reason":"manual"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(107,'event-5d045416-3d38-4034-9dbb-6f47e5cc9686','molis-work-v1-demo','web-user','attention_entry.created','inbox_entry','inboxentry-b8e6147f-606c-4e18-ae3d-37576faf8495','对象已加入 Inbox','{"owner_plugin_id":"io.molis.work.feed","subject_type":"feed_item","subject_id":"feeditem-48378648-c010-49f7-bc01-9d350156eec4","reason":"manual"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(108,'event-39ed8e7a-d8b4-42ea-ad00-f29bf5572170','molis-work-v1-demo','web-user','attention_entry.done','inbox_entry','inboxentry-b8e6147f-606c-4e18-ae3d-37576faf8495','Inbox Entry 已标记为 done','{"owner_plugin_id":"io.molis.work.feed","subject_type":"feed_item","subject_id":"feeditem-48378648-c010-49f7-bc01-9d350156eec4","reason":"manual"}','2026-01-15T09:00:00.000Z');
INSERT INTO "events"("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES(109,'event-d6769e9b-63ab-4304-bc8d-9de083bb3aa8','molis-work-v1-demo','web-user','attention_entry.created','inbox_entry','inboxentry-83ff703c-5af7-41d1-921a-69833231b509','对象已加入 Inbox','{"owner_plugin_id":"io.molis.work.feed","subject_type":"source_fault","subject_id":"demo-gmail","reason":"source_fault"}','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_item_events"("event_id","project_id","item_id","type","payload_json","at") VALUES('feed-event-1300ac76-4d55-42b9-9f77-417800d6628d','molis-work-v1-demo','feeditem-48378648-c010-49f7-bc01-9d350156eec4','feed_item.created','{"source_id":"feed-source-5496d064f90938a458c4b1eec79d4a4b","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_item_events"("event_id","project_id","item_id","type","payload_json","at") VALUES('feed-event-13be9a00-1833-4831-8b2e-8284f8d0cd44','molis-work-v1-demo','feeditem-e0273360-7f83-45a4-a637-02fb499ee682','feed_item.created','{"source_id":"demo-github","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_item_events"("event_id","project_id","item_id","type","payload_json","at") VALUES('feed-event-3a115aeb-9207-45f3-ad0f-48b18f8e158e','molis-work-v1-demo','feeditem-bea8b7e7-ba48-426c-819a-53107bc4cac1','feed_item.created','{"source_id":"demo-github","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_item_events"("event_id","project_id","item_id","type","payload_json","at") VALUES('feed-event-5afc3263-cae1-4b4a-b49d-2e24640ef9d5','molis-work-v1-demo','feeditem-524ac393-86d6-46f3-aa23-521b6125fb25','feed_item.created','{"source_id":"feed-source-f34498b13c742f0d0f851765e48fe4d6","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_item_events"("event_id","project_id","item_id","type","payload_json","at") VALUES('feed-event-b5e69df0-6b47-4f46-9b0d-d7fb8ca5dfb3','molis-work-v1-demo','feeditem-35245c29-2139-4da3-87d4-8a33482f6116','feed_item.created','{"source_id":"feed-source-a12054cbb831b279742fac4cfe340b2b","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_item_events"("event_id","project_id","item_id","type","payload_json","at") VALUES('feed-event-de3f9d17-0ca5-4f0d-ad87-ffdea5911886','molis-work-v1-demo','feeditem-9a816458-356f-46ae-8204-32b5e3178924','feed_item.created','{"source_id":"demo-gmail","signal_id":null}','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_items"("project_id","item_id","source_id","signal_id","signal_revision","kind","title","summary","body","source_kind","source_label","external_id","url","origin_status","priority","tags_json","author","disposition","read_at","revision","source_created_at","source_updated_at","imported_at","updated_at") VALUES('molis-work-v1-demo','feeditem-35245c29-2139-4da3-87d4-8a33482f6116','feed-source-a12054cbb831b279742fac4cfe340b2b',NULL,NULL,'youtube_video','不切窗口推进 Goal 的工作台演示','目录、舞台和会话如何留在同一个窗口。','演示里桌面端把 Goal 导航、当前工作和 Runtime 组合成连续工作面。本条是本地示例，不是当场拉取的频道更新。','youtube_channel','公开频道 · 工作台演示','yt:demo-workbench-tour','https://www.youtube.com/watch?v=dQw4w9wg','inbox','medium','["YouTube"]','工作台演示','inbox',NULL,1,'2026-09-15T12:00:00.000Z','2026-09-15T12:00:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_items"("project_id","item_id","source_id","signal_id","signal_revision","kind","title","summary","body","source_kind","source_label","external_id","url","origin_status","priority","tags_json","author","disposition","read_at","revision","source_created_at","source_updated_at","imported_at","updated_at") VALUES('molis-work-v1-demo','feeditem-48378648-c010-49f7-bc01-9d350156eec4','feed-source-5496d064f90938a458c4b1eec79d4a4b',NULL,NULL,'web_query_result','不同 Runtime 怎样读同一份项目进度','查询「AI 工作台如何保存共同进度」的本地示例结果。','如果每个入口各自记状态，换一次对话就要重新解释整个项目。共同底座应保存 Goal、关系、决定和完成依据。','web_query','共同进度怎么被记住','query:shared-progress-1',NULL,'inbox','medium','["网页查询"]',NULL,'inbox',NULL,1,'2026-09-15T10:00:00.000Z','2026-09-15T10:00:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_items"("project_id","item_id","source_id","signal_id","signal_revision","kind","title","summary","body","source_kind","source_label","external_id","url","origin_status","priority","tags_json","author","disposition","read_at","revision","source_created_at","source_updated_at","imported_at","updated_at") VALUES('molis-work-v1-demo','feeditem-524ac393-86d6-46f3-aa23-521b6125fb25','feed-source-f34498b13c742f0d0f851765e48fe4d6',NULL,NULL,'rss_entry','第一次把模糊想法收成目标树','用户要能从列表看出下一步、阻塞和完成依据。','长程任务最容易在换对话后丢失共同进度。先把模糊想法收成目标树，再决定谁做下一步。这篇文章和当前示例项目的主 Goal 直接相关。','rss','Solidot','https://example.com/posts/goal-tree-first-run','https://www.solidot.org/','inbox','medium','["RSS","产品设计"]','Solidot','inbox',NULL,1,'2026-09-16T04:25:00.000Z','2026-09-16T04:25:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_items"("project_id","item_id","source_id","signal_id","signal_revision","kind","title","summary","body","source_kind","source_label","external_id","url","origin_status","priority","tags_json","author","disposition","read_at","revision","source_created_at","source_updated_at","imported_at","updated_at") VALUES('molis-work-v1-demo','feeditem-9a816458-356f-46ae-8204-32b5e3178924','demo-gmail',NULL,NULL,'gmail_message','第一次打开项目时，默认该先看目标还是先开会话？','合作方问首页落点。决定仍在 Goals 的 DECIDE，这里只保留邮件事实。','如果两个入口同时强调，新用户会停在选择上。请产品给一个默认落点，另一个入口仍可从同一工作台到达。','gmail','Gmail · 产品反馈','demo-gmail-landing',NULL,'inbox','medium','["Gmail","产品"]','Mina <partner@example.com>','inbox',NULL,1,'2026-09-16T05:42:00.000Z','2026-09-16T05:42:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_items"("project_id","item_id","source_id","signal_id","signal_revision","kind","title","summary","body","source_kind","source_label","external_id","url","origin_status","priority","tags_json","author","disposition","read_at","revision","source_created_at","source_updated_at","imported_at","updated_at") VALUES('molis-work-v1-demo','feeditem-bea8b7e7-ba48-426c-819a-53107bc4cac1','demo-github',NULL,NULL,'github_notification','CI：生命周期自动化检查已通过','与 CORE-C1 对应的检查已经变绿。','这条通知只作记录，不需要立刻介入。','github','GitHub · molis-work','demo-github-ci',NULL,'inbox','medium','["GitHub","CI"]','github-actions','inbox',NULL,1,'2026-09-16T03:10:00.000Z','2026-09-16T03:10:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_items"("project_id","item_id","source_id","signal_id","signal_revision","kind","title","summary","body","source_kind","source_label","external_id","url","origin_status","priority","tags_json","author","disposition","read_at","revision","source_created_at","source_updated_at","imported_at","updated_at") VALUES('molis-work-v1-demo','feeditem-e0273360-7f83-45a4-a637-02fb499ee682','demo-github',NULL,NULL,'github_notification','PR #418 请确认完成依据是否写进事件记录','Review 要求核对：工作何时开始、提交了什么、为什么可以算完成。','请对照 CORE 的约定：从约定、报告到收尾要形成完整记录。这条通知需要人决定是否并入当前 Goal。','github','GitHub · molis-work','demo-github-pr-418','https://github.com/example/molis-work/pull/418','inbox','medium','["GitHub","Review"]','octocat','inbox',NULL,1,'2026-09-16T06:18:00.000Z','2026-09-16T06:18:00.000Z','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "feed_out_rules"("project_id","rule_id","name","enabled","match_json","created_at","updated_at","admission","judgment_json","revision") VALUES('molis-work-v1-demo','feedoutrule-b3d79af8-f503-42d6-9c34-3e1e2019669d','捕捉首次协作文章',1,'{"contains":"目标树","source_id":"feed-source-f34498b13c742f0d0f851765e48fe4d6"}','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','suggest',NULL,'710b18c1-debd-4d77-beb8-dc1469effda8');
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
INSERT INTO "goal_event_closures"("closure_id","project_id","goal_id","event_id","kind","result","reason","completion_applied","expected_config_version","expected_agreement_version","config_version","agreement_version","unmet_reasons_json","superseded","superseded_reason","recorded_at","acceptance_round") VALUES('gclo-7787257e-2484-4657-84b2-adeb1336d44c','molis-work-v1-demo','GRAPH','gevt-40c82e49-1a84-4957-a494-edfbd6479e88','complete','画布关系已经可扫','演示收尾，把已完成关系图移出日常列表',1,1,1,1,1,'[]',0,NULL,'2026-01-15T09:00:00.000Z',1);
INSERT INTO "goal_event_closures"("closure_id","project_id","goal_id","event_id","kind","result","reason","completion_applied","expected_config_version","expected_agreement_version","config_version","agreement_version","unmet_reasons_json","superseded","superseded_reason","recorded_at","acceptance_round") VALUES('gclo-b4a871a4-26c0-4723-8237-c682de988410','molis-work-v1-demo','DROPPED','gevt-0622376f-57ce-4d2d-8f91-45b06a0f1010','cancel',NULL,'旧会话读不到新接入，会让人误以为安装失败',0,1,1,1,1,'[]',0,NULL,'2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_event_closures"("closure_id","project_id","goal_id","event_id","kind","result","reason","completion_applied","expected_config_version","expected_agreement_version","config_version","agreement_version","unmet_reasons_json","superseded","superseded_reason","recorded_at","acceptance_round") VALUES('gclo-f7571f7b-18e4-4e35-bff2-150eb5eee277','molis-work-v1-demo','CORE','gevt-62c5cde6-3555-4a2a-9002-076b388fcff3','complete','可用的生命周期记录','约定要求已有支持事实，演示收尾',1,1,1,1,1,'[]',0,NULL,'2026-01-15T09:00:00.000Z',1);
INSERT INTO "goal_event_concerns"("concern_id","project_id","goal_id","event_id","title","statement","scope_json","blocks_closure","status","resolution_reason","resolution_event_id","cited_decision_id","previous_status","created_at","updated_at","cited_subjects_json") VALUES('gcon-b0398fe7-383a-445e-bee5-f7788f923eac','molis-work-v1-demo','RISK','gevt-20a29442-afd9-4c05-b826-07548c849202','README 仍指向已撤掉的启动命令','按文档复制的命令会启动旧入口，用户会以为安装失败。','{"requirement_ids":["RISK-C1"],"event_ids":[],"concern_ids":[],"action":null}',1,'open',NULL,NULL,NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','[]');
INSERT INTO "goal_event_config_versions"("project_id","goal_id","version","actor_id","created_at","config_event_id") VALUES('molis-work-v1-demo','CORE',1,'demo-user','2026-01-15T09:00:00.000Z','gevt-83e5ca86-bdbc-4584-9bfa-a6a2eea755bf');
INSERT INTO "goal_event_config_versions"("project_id","goal_id","version","actor_id","created_at","config_event_id") VALUES('molis-work-v1-demo','DECIDE',1,'demo-user','2026-01-15T09:00:00.000Z','gevt-37fdbcc1-f917-452e-88fa-04b6a517a719');
INSERT INTO "goal_event_config_versions"("project_id","goal_id","version","actor_id","created_at","config_event_id") VALUES('molis-work-v1-demo','DESKTOP',1,'demo-user','2026-01-15T09:00:00.000Z','gevt-2ddedb68-8a30-4b3c-a784-45b4ad04270f');
INSERT INTO "goal_event_config_versions"("project_id","goal_id","version","actor_id","created_at","config_event_id") VALUES('molis-work-v1-demo','DROPPED',1,'demo-user','2026-01-15T09:00:00.000Z','gevt-e77b9d67-12d5-4d18-9a28-bd3404a553fb');
INSERT INTO "goal_event_config_versions"("project_id","goal_id","version","actor_id","created_at","config_event_id") VALUES('molis-work-v1-demo','GRAPH',1,'demo-user','2026-01-15T09:00:00.000Z','gevt-ef111823-ff48-40f0-ac74-e53b0500b1d9');
INSERT INTO "goal_event_config_versions"("project_id","goal_id","version","actor_id","created_at","config_event_id") VALUES('molis-work-v1-demo','RISK',1,'demo-user','2026-01-15T09:00:00.000Z','gevt-cd6a4f46-113f-464b-a726-8ee0ba28cedf');
INSERT INTO "goal_event_config_versions"("project_id","goal_id","version","actor_id","created_at","config_event_id") VALUES('molis-work-v1-demo','V1',1,'demo-user','2026-01-15T09:00:00.000Z','gevt-34e765ca-2837-45f2-a4ab-5060506dbd22');
INSERT INTO "goal_event_configs"("project_id","goal_id","current_version","updated_at","updated_by") VALUES('molis-work-v1-demo','CORE',1,'2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_configs"("project_id","goal_id","current_version","updated_at","updated_by") VALUES('molis-work-v1-demo','DECIDE',1,'2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_configs"("project_id","goal_id","current_version","updated_at","updated_by") VALUES('molis-work-v1-demo','DESKTOP',1,'2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_configs"("project_id","goal_id","current_version","updated_at","updated_by") VALUES('molis-work-v1-demo','DROPPED',1,'2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_configs"("project_id","goal_id","current_version","updated_at","updated_by") VALUES('molis-work-v1-demo','GRAPH',1,'2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_configs"("project_id","goal_id","current_version","updated_at","updated_by") VALUES('molis-work-v1-demo','RISK',1,'2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_configs"("project_id","goal_id","current_version","updated_at","updated_by") VALUES('molis-work-v1-demo','V1',1,'2026-01-15T09:00:00.000Z','demo-user');
INSERT INTO "goal_event_decision_requests"("request_id","project_id","goal_id","event_id","question","options_json","scope_json","purpose","proposed_change_json","commitment_json","status","created_at") VALUES('gdec-req-57969f1a-9076-4876-8537-af0e40334b5b','molis-work-v1-demo','DECIDE','gevt-a3219e72-16c1-460f-a670-8828c0f8a9fc','第一次打开项目时，默认落在 Goal 列表还是默认打开一条 Session？','[{"option_id":"goals","label":"先看目标树","impact":"用户先理解现在做什么，再决定开哪条会话"},{"option_id":"session","label":"先开 Session","impact":"用户立刻回到对话，但可能还没看清目标"}]','{"requirement_ids":["DECIDE-C1"],"event_ids":[],"concern_ids":[],"action":null}','suggestion',NULL,NULL,'pending','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_progress_summaries"("summary_id","project_id","goal_id","event_id","summary_text","based_on_cursor","next_step","next_actor","actor_id","recorded_at") VALUES('gsum-245a89ea-e7b8-41a7-98c5-464699aa0fdd','molis-work-v1-demo','GRAPH','gevt-e428df36-0016-4b8b-9dc5-9c14603d27f2','父子和前置关系都来自真实记录。',85,'退出日常列表，需要时再打开归档','当前用户','demo-user','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_progress_summaries"("summary_id","project_id","goal_id","event_id","summary_text","based_on_cursor","next_step","next_actor","actor_id","recorded_at") VALUES('gsum-90202f2a-0efb-4c0d-aa5d-84491bb06471','molis-work-v1-demo','DESKTOP','gevt-66516333-92ad-45fd-9ca8-c0f5ef9fea6d','目录、舞台和标签已经能在同一窗口里切换。',78,'核对分屏后 Goal 绑定仍保持','当前用户','demo-user','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_progress_summaries"("summary_id","project_id","goal_id","event_id","summary_text","based_on_cursor","next_step","next_actor","actor_id","recorded_at") VALUES('gsum-905677c7-9c4d-4e08-a4a1-38e37cf30a58','molis-work-v1-demo','CORE','gevt-621ab6b2-dfcd-4fc9-b561-663e6f9183bc','完成依据已经写进当前事件记录。',70,'明确收尾','当前用户','demo-user','2026-01-15T09:00:00.000Z');
INSERT INTO "goal_event_progress_summaries"("summary_id","project_id","goal_id","event_id","summary_text","based_on_cursor","next_step","next_actor","actor_id","recorded_at") VALUES('gsum-afc56fd7-1aff-47f8-af85-0f27d852b480','molis-work-v1-demo','V1','gevt-0ffa039a-ba27-47ab-a877-d755a7c5839f','列表、画布和看板都有真实内容可扫。',75,'先处理需要决定和受阻的 Goal','当前用户','demo-user','2026-01-15T09:00:00.000Z');
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
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-01073c17-b8e9-48ab-94bd-2a3ea26854f2','molis-work-v1-demo','DECIDE','DESKTOP','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-1253db4b-c222-48ac-976f-de839963cb22','molis-work-v1-demo','DESKTOP','CORE','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-16664916-a051-4c98-aed2-a18681b33232','molis-work-v1-demo','WEB','WORKSPACE','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-218c75d1-5347-4655-8c62-f0d951cdfff5','molis-work-v1-demo','ONBOARDING','ADOPTION','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-29ab9660-7990-4148-9ad9-bcbea7789977','molis-work-v1-demo','DOCS','ADOPTION','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-3a8f0117-8b12-4dcd-9fc1-98a6448acfc3','molis-work-v1-demo','INTERFACES','PLATFORM','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-435f16ad-5112-47ed-a4bb-be73163cfb15','molis-work-v1-demo','WEB-SCAN-NEST','WEB-SCAN-ROW','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-492757ea-3e23-45dc-81f5-bc7f39562a7f','molis-work-v1-demo','RELEASE','ADOPTION','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-49ea29b9-1e35-47f1-995e-151c274d9752','molis-work-v1-demo','RISK','PLATFORM','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-62feb584-b421-405b-99d3-358936d594f2','molis-work-v1-demo','ADOPTION','V1','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-662d58c8-d07a-40ac-8ea9-83dd6c1b7203','molis-work-v1-demo','GRAPH','CORE','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-830071b4-b3f0-45a7-a034-3305a9e3f36e','molis-work-v1-demo','DESKTOP','WORKSPACE','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-92d4235c-0ef8-4c84-8e26-ff68272269dd','molis-work-v1-demo','PLATFORM','V1','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-9821ae08-4030-4d06-a5d7-bc1c9394691f','molis-work-v1-demo','DOCS','ONBOARDING','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-9fd04c88-5a73-47cd-92da-0ffae60fc85d','molis-work-v1-demo','RISK','INTERFACES','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-a41fa59b-2c5e-4859-9ef2-49541cdfe882','molis-work-v1-demo','WEB-SCAN-ROW','WEB-SCAN','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-b445fac9-9ddc-4b60-a585-5b8855a7ad10','molis-work-v1-demo','WORKSPACE','V1','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-bcc73a98-77ab-4e30-8de8-8f728baf8543','molis-work-v1-demo','WEB','INTERFACES','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-c4a22b29-fb35-46ee-bcc5-b7b4298b1ed8','molis-work-v1-demo','GRAPH','WORKSPACE','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-c5e67d28-ad64-4b85-bd12-6ea9e63a7dec','molis-work-v1-demo','DROPPED','ADOPTION','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-e3a97e43-5662-4c3b-af4a-518da800be16','molis-work-v1-demo','INTERFACES','CORE','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-e60568c4-cc8c-4f56-acd1-95523a6aa902','molis-work-v1-demo','WEB-SCAN','WEB','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-eb63b53b-7f53-4ead-a6d5-85a69290a5e3','molis-work-v1-demo','ONBOARDING','RELEASE','depends_on','active','创建 Goal 时指定上游依赖','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-f479e1ce-b2cc-417e-b959-55b33aefa029','molis-work-v1-demo','CORE','PLATFORM','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
INSERT INTO "goal_relations"("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES('relation-f74a15a6-5e4d-45e2-9bb6-2c74d9c11802','molis-work-v1-demo','DECIDE','WORKSPACE','part_of','active','创建 Goal 时指定上级 Goal','demo-user','2026-01-15T09:00:00.000Z',NULL);
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
INSERT INTO "goal_trash_records"("trash_record_id","project_id","goal_id","trashed_at","trashed_by","trash_reason","restored_at","restored_by","restore_reason") VALUES('trash-95f6898e-9c5b-4fb9-9bad-0d76a57f2777','molis-work-v1-demo','AUTO-CONNECT','2026-01-15T09:00:00.000Z','demo-user','这会替用户猜项目；当前方案只展示历史候选，并再次询问用户',NULL,NULL,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-0622376f-57ce-4d2d-8f91-45b06a0f1010','molis-work-v1-demo','DROPPED','system',NULL,NULL,'取消当前 Goal','{"operation":"closure_submitted","kind":"cancel","result":null,"reason":"旧会话读不到新接入，会让人误以为安装失败","completion_applied":false,"unmet_reasons":[],"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1}','demo-user','user','2026-01-15T09:00:00.000Z',88,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-06beb234-ffa9-4208-a478-f61ba493096a','molis-work-v1-demo','WEB-SCAN','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',57,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-0ffa039a-ba27-47ab-a877-d755a7c5839f','molis-work-v1-demo','V1','system',NULL,NULL,'记录当前进展和下一步','{"operation":"progress_summary","summary":"列表、画布和看板都有真实内容可扫。","based_on_cursor":75,"next_step":"先处理需要决定和受阻的 Goal","next_actor":"当前用户"}','demo-user','user','2026-01-15T09:00:00.000Z',76,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-1c6c2930-165d-4573-93a4-91f6aba01429','molis-work-v1-demo','RISK','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',23,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-20a29442-afd9-4c05-b826-07548c849202','molis-work-v1-demo','RISK','system',NULL,NULL,'提出 Concern：README 仍指向已撤掉的启动命令','{"operation":"concern_opened","concern_id":"gcon-b0398fe7-383a-445e-bee5-f7788f923eac","title":"README 仍指向已撤掉的启动命令","statement":"按文档复制的命令会启动旧入口，用户会以为安装失败。","scope":{"requirement_ids":["RISK-C1"],"event_ids":[],"concern_ids":[],"action":null},"blocks_closure":true,"cited_subjects":[]}','demo-user','user','2026-01-15T09:00:00.000Z',83,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-2488802b-5620-4eee-ba26-32484272c62a','molis-work-v1-demo','ONBOARDING','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',46,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-25963fd1-3c6a-4acc-91d8-120303dba7ac','molis-work-v1-demo','RELEASE','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',43,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-2ddedb68-8a30-4b3c-a784-45b4ad04270f','molis-work-v1-demo','DESKTOP','configuration',NULL,NULL,'新增记录方式：生命周期交付','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','demo-user','user','2026-01-15T09:00:00.000Z',77,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-31e6966c-fac0-4018-9867-3200d5807200','molis-work-v1-demo','WEB','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',27,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-34e765ca-2837-45f2-a4ab-5060506dbd22','molis-work-v1-demo','V1','configuration',NULL,NULL,'新增记录方式：生命周期交付','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','demo-user','user','2026-01-15T09:00:00.000Z',74,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-37fdbcc1-f917-452e-88fa-04b6a517a719','molis-work-v1-demo','DECIDE','configuration',NULL,NULL,'新增记录方式：生命周期交付','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','demo-user','user','2026-01-15T09:00:00.000Z',80,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-3b18ef0e-3306-476b-98e3-fee5d3abe9d6','molis-work-v1-demo','CORE','report','lifecycle',1,'生命周期记录已接通','{"result":"从约定、报告到收尾形成完整记录"}','demo-user','user','2026-01-15T09:00:00.000Z',70,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-3c44de11-20cc-4869-a157-4272a7befff1','molis-work-v1-demo','GRAPH','report','lifecycle',1,'画布已能读出依赖方向','{"result":"父子和前置关系都来自真实记录。"}','demo-user','user','2026-01-15T09:00:00.000Z',85,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-3e3bafdb-0b4b-47a0-84c7-8bef810d63a6','molis-work-v1-demo','DESKTOP','report','lifecycle',1,'工作台主栏已经对齐','{"result":"目录、舞台和标签已经能在同一窗口里切换。"}','demo-user','user','2026-01-15T09:00:00.000Z',78,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-40c82e49-1a84-4957-a494-edfbd6479e88','molis-work-v1-demo','GRAPH','system',NULL,NULL,'显式完成当前 Goal','{"operation":"closure_submitted","kind":"complete","result":"画布关系已经可扫","reason":"演示收尾，把已完成关系图移出日常列表","completion_applied":true,"unmet_reasons":[],"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1}','demo-user','user','2026-01-15T09:00:00.000Z',91,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-447811b9-b59c-4ac0-a48f-9b42cc3f658a','molis-work-v1-demo','V1','report','lifecycle',1,'目标树已经能看出下一步','{"result":"列表、画布和看板都有真实内容可扫。"}','demo-user','user','2026-01-15T09:00:00.000Z',75,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-47f212b8-3d0e-410d-9c3c-74d359e54880','molis-work-v1-demo','WORKSPACE','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',10,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-5848a47b-6932-4a7d-a36f-b7b057533f35','molis-work-v1-demo','GRAPH','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',31,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-621ab6b2-dfcd-4fc9-b561-663e6f9183bc','molis-work-v1-demo','CORE','system',NULL,NULL,'记录当前进展和下一步','{"operation":"progress_summary","summary":"完成依据已经写进当前事件记录。","based_on_cursor":70,"next_step":"明确收尾","next_actor":"当前用户"}','demo-user','user','2026-01-15T09:00:00.000Z',71,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-62c5cde6-3555-4a2a-9002-076b388fcff3','molis-work-v1-demo','CORE','system',NULL,NULL,'显式完成当前 Goal','{"operation":"closure_submitted","kind":"complete","result":"可用的生命周期记录","reason":"约定要求已有支持事实，演示收尾","completion_applied":true,"unmet_reasons":[],"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1}','demo-user','user','2026-01-15T09:00:00.000Z',90,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-66516333-92ad-45fd-9ca8-c0f5ef9fea6d','molis-work-v1-demo','DESKTOP','system',NULL,NULL,'记录当前进展和下一步','{"operation":"progress_summary","summary":"目录、舞台和标签已经能在同一窗口里切换。","based_on_cursor":78,"next_step":"核对分屏后 Goal 绑定仍保持","next_actor":"当前用户"}','demo-user','user','2026-01-15T09:00:00.000Z',79,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-73bc2967-d5a4-481a-be5d-bcf99d2f5f30','molis-work-v1-demo','DECIDE','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',39,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-83e5ca86-bdbc-4584-9bfa-a6a2eea755bf','molis-work-v1-demo','CORE','configuration',NULL,NULL,'新增记录方式：生命周期交付','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[{"type_id":"lifecycle","requirement_id":"CORE-C1"}]}','demo-user','user','2026-01-15T09:00:00.000Z',69,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-8bd38e85-5c90-4e49-bbdd-e5ea8a6aeae0','molis-work-v1-demo','ADOPTION','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',13,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-9e93990c-0197-4560-8852-110ceb4c5e17','molis-work-v1-demo','INTERFACES','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',19,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-a181c455-0c51-46f6-8ba6-95c3b0705cfa','molis-work-v1-demo','V1','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',5,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-a3219e72-16c1-460f-a670-8828c0f8a9fc','molis-work-v1-demo','DECIDE','system',NULL,NULL,'请求决定：第一次打开项目时，默认落在 Goal 列表还是默认打开一条 Session？','{"operation":"decision_requested","request_id":"gdec-req-57969f1a-9076-4876-8537-af0e40334b5b","question":"第一次打开项目时，默认落在 Goal 列表还是默认打开一条 Session？","options":[{"option_id":"goals","label":"先看目标树","impact":"用户先理解现在做什么，再决定开哪条会话"},{"option_id":"session","label":"先开 Session","impact":"用户立刻回到对话，但可能还没看清目标"}],"scope":{"requirement_ids":["DECIDE-C1"],"event_ids":[],"concern_ids":[],"action":null},"purpose":"suggestion","proposed_change":null}','demo-user','user','2026-01-15T09:00:00.000Z',81,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-a9231fbf-3799-4268-be0d-e11c1eac11b2','molis-work-v1-demo','INTERFACES','system',NULL,NULL,'升级前应先看到安全说明：能保留的旧数据明确列出，不能可靠迁移的内容提示重新整理。','{"operation":"observation_note","body":"升级前应先看到安全说明：能保留的旧数据明确列出，不能可靠迁移的内容提示重新整理。"}','demo-user','user','2026-01-15T09:00:00.000Z',73,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-ba09d91f-a461-4de2-aa18-b46981f30d28','molis-work-v1-demo','CORE','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',16,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-cb94a65a-9579-460f-a030-5139e2b4c4a2','molis-work-v1-demo','CORE','system',NULL,NULL,'演示项目用当前事件记录说明这项工作为什么可以算完成。','{"operation":"observation_note","body":"演示项目用当前事件记录说明这项工作为什么可以算完成。"}','demo-user','user','2026-01-15T09:00:00.000Z',72,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-cd6a4f46-113f-464b-a726-8ee0ba28cedf','molis-work-v1-demo','RISK','configuration',NULL,NULL,'新增记录方式：生命周期交付','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','demo-user','user','2026-01-15T09:00:00.000Z',82,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-cdda1286-03bc-4319-bec9-cfdbe4032d63','molis-work-v1-demo','WEB-SCAN-ROW','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',60,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-db2769d1-0a06-475f-8b7c-7f453f147f0b','molis-work-v1-demo','WEB-SCAN-NEST','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',63,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-de1ba585-c7f5-4dcf-a3a0-f46b4252c501','molis-work-v1-demo','DESKTOP','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',35,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-df43a6f1-539b-4d83-8e62-2dc6538359fb','molis-work-v1-demo','DOCS','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',50,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-e225fec3-f145-4cac-a17e-661fc94d8193','molis-work-v1-demo','PLATFORM','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',7,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-e428df36-0016-4b8b-9dc5-9c14603d27f2','molis-work-v1-demo','GRAPH','system',NULL,NULL,'记录当前进展和下一步','{"operation":"progress_summary","summary":"父子和前置关系都来自真实记录。","based_on_cursor":85,"next_step":"退出日常列表，需要时再打开归档","next_actor":"当前用户"}','demo-user','user','2026-01-15T09:00:00.000Z',86,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-e73fe355-8978-4a89-be0e-278d21369260','molis-work-v1-demo','AUTO-CONNECT','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',66,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-e77b9d67-12d5-4d18-9a28-bd3404a553fb','molis-work-v1-demo','DROPPED','configuration',NULL,NULL,'新增记录方式：生命周期交付','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','demo-user','user','2026-01-15T09:00:00.000Z',87,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-ef111823-ff48-40f0-ac74-e53b0500b1d9','molis-work-v1-demo','GRAPH','configuration',NULL,NULL,'新增记录方式：生命周期交付','{"config_version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[]}','demo-user','user','2026-01-15T09:00:00.000Z',84,1);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-f37e510b-af42-4563-a44f-b7a82ab84f6a','molis-work-v1-demo','DROPPED','system',NULL,NULL,'保存原始意图','{"operation":"intent_created","source_kind":"onboarding"}','demo-user','user','2026-01-15T09:00:00.000Z',54,NULL);
INSERT INTO "goal_work_events"("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES('gevt-f9c13db5-eb07-43f9-92d9-5ddbfac16c45','molis-work-v1-demo','RELEASE','system',NULL,NULL,'接入 Runtime 后必须新开会话；继续使用接入前的会话会让人误以为安装失败。','{"operation":"observation_note","body":"接入 Runtime 后必须新开会话；继续使用接入前的会话会让人误以为安装失败。"}','demo-user','user','2026-01-15T09:00:00.000Z',67,NULL);
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
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-ADOPTION::parent','914ffcd8187736b253fd229cd9daca3fb2ca9dfad76bb8f884b64a51b50a2e57','{"relation_id":"relation-62feb584-b421-405b-99d3-358936d594f2","observed_event_cursor":14}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-CORE::parent','d721eec9435e64d875587f3a84b06a365df268e4cd0dede1a60ebb40e97c613e','{"relation_id":"relation-f479e1ce-b2cc-417e-b959-55b33aefa029","observed_event_cursor":17}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-DECIDE::dep::DESKTOP','14440157515ade20f1cb6bd3518775d4799503763f469dbeb84efda5abbe935d','{"relation_id":"relation-01073c17-b8e9-48ab-94bd-2a3ea26854f2","observed_event_cursor":41}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-DECIDE::parent','254894928beddcb044db452b70e67ce8796d33668c9c999181ffaba31519f511','{"relation_id":"relation-f74a15a6-5e4d-45e2-9bb6-2c74d9c11802","observed_event_cursor":40}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-DESKTOP::dep::CORE','1b6aec580036db1e38dfad9185d325aed7922570a419d32d3ffab915449cda9a','{"relation_id":"relation-1253db4b-c222-48ac-976f-de839963cb22","observed_event_cursor":37}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-DESKTOP::parent','9b34f3858142959ce8f5e6bb4a548188ab2452bbfa222477ae082bd7c98669b2','{"relation_id":"relation-830071b4-b3f0-45a7-a034-3305a9e3f36e","observed_event_cursor":36}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-DOCS::dep::ONBOARDING','fe5fc0e8f9d7ec1726164934ffab615ac128afd8e626427dbd5822d6d4ce7be5','{"relation_id":"relation-9821ae08-4030-4d06-a5d7-bc1c9394691f","observed_event_cursor":52}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-DOCS::parent','7f5c4aacedae414872baa348c56a2c4d72273d75c0a51df23bc6f09d343f53fc','{"relation_id":"relation-29ab9660-7990-4148-9ad9-bcbea7789977","observed_event_cursor":51}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-DROPPED::parent','4f717bbd5483d43eb5bf20bb7f7e1696ce72e9ef04b7cd310adb5aa53a83356a','{"relation_id":"relation-c5e67d28-ad64-4b85-bd12-6ea9e63a7dec","observed_event_cursor":55}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-GRAPH::dep::CORE','982f7074940763bdb615a712651f11c4905036fc4a82275c1410eb493fa773b3','{"relation_id":"relation-662d58c8-d07a-40ac-8ea9-83dd6c1b7203","observed_event_cursor":33}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-GRAPH::parent','a6dc84ed100fd4201c0c9f397dbf9c5e64e71464f492bd17c3fde182b9bcea58','{"relation_id":"relation-c4a22b29-fb35-46ee-bcc5-b7b4298b1ed8","observed_event_cursor":32}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-INTERFACES::dep::CORE','29625fe5e917fa6f024ccbd0c6962d112cccdae4a39f58f6c0b5ca8a3f1cf268','{"relation_id":"relation-e3a97e43-5662-4c3b-af4a-518da800be16","observed_event_cursor":21}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-INTERFACES::parent','e1046a1174abccee588c45356c7220d16dcd06f362111c504483065e3f0be234','{"relation_id":"relation-3a8f0117-8b12-4dcd-9fc1-98a6448acfc3","observed_event_cursor":20}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-ONBOARDING::dep::RELEASE','cd6ab9ef58e13c46d36f469aff006907f5d4eee28c5b602cdedd285f6d42ed86','{"relation_id":"relation-eb63b53b-7f53-4ead-a6d5-85a69290a5e3","observed_event_cursor":48}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-ONBOARDING::parent','c97ca55216cc663147af12be561b6a49ca33396325a7797aab6837ef99590949','{"relation_id":"relation-218c75d1-5347-4655-8c62-f0d951cdfff5","observed_event_cursor":47}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-PLATFORM::parent','0fd0d76077cf5599743f95e4d2340124165aed62219cb1ee601dbf6a712c94c7','{"relation_id":"relation-92d4235c-0ef8-4c84-8e26-ff68272269dd","observed_event_cursor":8}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-RELEASE::parent','0389c3eea1f660054a5732dd13930fee2e2531c7acef687830cc8115134641f9','{"relation_id":"relation-492757ea-3e23-45dc-81f5-bc7f39562a7f","observed_event_cursor":44}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-RISK::dep::INTERFACES','891abded36861d3de56363f122df679ac68385bf51f1dd8237083404f76d0a81','{"relation_id":"relation-9fd04c88-5a73-47cd-92da-0ffae60fc85d","observed_event_cursor":25}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-RISK::parent','7b0732fe5f1101bd7fe7eb86cb991489e4e4553d268023c3e9d117369739f80c','{"relation_id":"relation-49ea29b9-1e35-47f1-995e-151c274d9752","observed_event_cursor":24}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-WEB-SCAN-NEST::parent','9bbfc2811692bd015359264c0f0bc9dbcee1b02f5dbc351513366336e2d2e97a','{"relation_id":"relation-435f16ad-5112-47ed-a4bb-be73163cfb15","observed_event_cursor":64}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-WEB-SCAN-ROW::parent','69b51b4669399efbfd60e99bd553fcd192b8e5eefeb680af5352cb1669f11c36','{"relation_id":"relation-a41fa59b-2c5e-4859-9ef2-49541cdfe882","observed_event_cursor":61}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-WEB-SCAN::parent','253d449bb829639f578d9aa5671e671c826f2a6730ed7141908b2e1354cc1478','{"relation_id":"relation-e60568c4-cc8c-4f56-acd1-95523a6aa902","observed_event_cursor":58}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-WEB::dep::INTERFACES','627972dce332cd0cf27f523ef7cd9f9d13028605cc8bcddf2ae9b12d2c9d4a4c','{"relation_id":"relation-bcc73a98-77ab-4e30-8de8-8f728baf8543","observed_event_cursor":29}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-WEB::parent','65c3d23c5b088d37e366dd0f8ff542569252d13c4e9936f2d528eccead1f1345','{"relation_id":"relation-16664916-a051-4c98-aed2-a18681b33232","observed_event_cursor":28}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:add_relation','demo-goal-WORKSPACE::parent','d797f5384af091717827a01170a55ce8e984e742eac12bb5d0e5201c88b9e54d','{"relation_id":"relation-b445fac9-9ddc-4b60-a585-5b8855a7ad10","observed_event_cursor":11}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:apply_goal_concern','demo-risk-open','937767a6b118cf044d9a0866a983163af2031b4617dd21b67676d8f16510326e','{"event_id":"gevt-20a29442-afd9-4c05-b826-07548c849202","observed_event_cursor":83,"recorded":true,"concern":{"concern_id":"gcon-b0398fe7-383a-445e-bee5-f7788f923eac","event_id":"gevt-20a29442-afd9-4c05-b826-07548c849202","title":"README 仍指向已撤掉的启动命令","statement":"按文档复制的命令会启动旧入口，用户会以为安装失败。","scope":{"requirement_ids":["RISK-C1"],"event_ids":[],"concern_ids":[],"action":null},"blocks_closure":true,"status":"open","resolution_reason":null,"resolution_event_id":null,"cited_decision_id":null,"cited_subjects":[],"previous_status":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:configure_goal_events','demo-core-configure','fbd013c7a91b2cdb95e67574d01531252a0a80a95863247af1c936bb496f9bc0','{"config":{"project_id":"molis-work-v1-demo","goal_id":"CORE","version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"requirement_bindings":[{"type_id":"lifecycle","requirement_id":"CORE-C1"}],"updated_at":"2026-01-15T09:00:00.000Z","updated_by":"demo-user"},"event_id":"gevt-83e5ca86-bdbc-4584-9bfa-a6a2eea755bf","observed_event_cursor":69}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:configure_goal_events','demo-decide-configure','45409dfccdb380bf36ba6bc57f0ee695b27db17a23040e3d5ed9b7fa079c80ae','{"config":{"project_id":"molis-work-v1-demo","goal_id":"DECIDE","version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"requirement_bindings":[],"updated_at":"2026-01-15T09:00:00.000Z","updated_by":"demo-user"},"event_id":"gevt-37fdbcc1-f917-452e-88fa-04b6a517a719","observed_event_cursor":80}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:configure_goal_events','demo-desktop-configure','d207d0b08a8cd4442afaf9e72bd5c844dfabb013b7b1c3bfd6945b9ca42d009f','{"config":{"project_id":"molis-work-v1-demo","goal_id":"DESKTOP","version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"requirement_bindings":[],"updated_at":"2026-01-15T09:00:00.000Z","updated_by":"demo-user"},"event_id":"gevt-2ddedb68-8a30-4b3c-a784-45b4ad04270f","observed_event_cursor":77}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:configure_goal_events','demo-dropped-configure','8e13dbe718e9bd53dff4a733a87b0dc2a1618e9b12dcd09178de1932770d26b4','{"config":{"project_id":"molis-work-v1-demo","goal_id":"DROPPED","version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"requirement_bindings":[],"updated_at":"2026-01-15T09:00:00.000Z","updated_by":"demo-user"},"event_id":"gevt-e77b9d67-12d5-4d18-9a28-bd3404a553fb","observed_event_cursor":87}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:configure_goal_events','demo-graph-configure','d7b2018434c46441046580e92e434b9f0c4d3d62567e28ec6ee869eb47f61ad5','{"config":{"project_id":"molis-work-v1-demo","goal_id":"GRAPH","version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"requirement_bindings":[],"updated_at":"2026-01-15T09:00:00.000Z","updated_by":"demo-user"},"event_id":"gevt-ef111823-ff48-40f0-ac74-e53b0500b1d9","observed_event_cursor":84}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:configure_goal_events','demo-risk-configure','3829697d9bfc78a8c3d95a36d064b1b8b7abfaad66478e45c0912496e3631422','{"config":{"project_id":"molis-work-v1-demo","goal_id":"RISK","version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"requirement_bindings":[],"updated_at":"2026-01-15T09:00:00.000Z","updated_by":"demo-user"},"event_id":"gevt-cd6a4f46-113f-464b-a726-8ee0ba28cedf","observed_event_cursor":82}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:configure_goal_events','demo-v1-configure','fdb47314bde5ff4b4883bbf0451d61a77d3a8f24fb31f0114e3ed6c53c5608ee','{"config":{"project_id":"molis-work-v1-demo","goal_id":"V1","version":1,"types":[{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]}],"requirement_bindings":[],"updated_at":"2026-01-15T09:00:00.000Z","updated_by":"demo-user"},"event_id":"gevt-34e765ca-2837-45f2-a4ab-5060506dbd22","observed_event_cursor":74}','2026-01-15T09:00:00.000Z');
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
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:record_goal_note','demo-core-note','d10db9df0d307ca6fed8543a9850d95fa72c716fbec53e4689711d645aef48ca','{"event_id":"gevt-cb94a65a-9579-460f-a030-5139e2b4c4a2","observed_event_cursor":72,"recorded":true}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:record_goal_note','demo-interfaces-note','0451fdbc722c9e7b773fc475a9f37306cb6a0881a4faf0512e6d5f2f9ae71ca4','{"event_id":"gevt-a9231fbf-3799-4268-be0d-e11c1eac11b2","observed_event_cursor":73,"recorded":true}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:record_goal_note','demo-release-note','bbf928857239743d63f77f19bbae8af9f45d7f6c99c1a4b5e5e7e34d8be46093','{"event_id":"gevt-f9c13db5-eb07-43f9-92d9-5ddbfac16c45","observed_event_cursor":67,"recorded":true}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:report_goal_events','demo-core-report','f00581d28e2ae7b6b07b5d4f01fa6cb395f5e785f7268d2334aa6c8bb3a083d5','{"events":[{"event_id":"gevt-3b18ef0e-3306-476b-98e3-fee5d3abe9d6","project_id":"molis-work-v1-demo","goal_id":"CORE","title":"生命周期记录已接通","actor_id":"demo-user","actor_kind":"user","received_at":"2026-01-15T09:00:00.000Z","journal_seq":70,"config_version":1,"kind":"report","type":{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]},"payload":{"result":"从约定、报告到收尾形成完整记录"}}],"observed_event_cursor":71}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:report_goal_events','demo-desktop-report','f555904cc115a5ce18974ae34c99a3ae81e56297c17d5598875cd89cd13cde0b','{"events":[{"event_id":"gevt-3e3bafdb-0b4b-47a0-84c7-8bef810d63a6","project_id":"molis-work-v1-demo","goal_id":"DESKTOP","title":"工作台主栏已经对齐","actor_id":"demo-user","actor_kind":"user","received_at":"2026-01-15T09:00:00.000Z","journal_seq":78,"config_version":1,"kind":"report","type":{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]},"payload":{"result":"目录、舞台和标签已经能在同一窗口里切换。"}}],"observed_event_cursor":79}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:report_goal_events','demo-graph-report','e8159e1d7e511018f9c6657da236ad6547dcda8eef89b8064f75bf23d8aab336','{"events":[{"event_id":"gevt-3c44de11-20cc-4869-a157-4272a7befff1","project_id":"molis-work-v1-demo","goal_id":"GRAPH","title":"画布已能读出依赖方向","actor_id":"demo-user","actor_kind":"user","received_at":"2026-01-15T09:00:00.000Z","journal_seq":85,"config_version":1,"kind":"report","type":{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]},"payload":{"result":"父子和前置关系都来自真实记录。"}}],"observed_event_cursor":86}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:report_goal_events','demo-v1-report','227d3b04da217c7f174703ed16e978c926f0be1638d7338fbf91919867e24684','{"events":[{"event_id":"gevt-447811b9-b59c-4ac0-a48f-9b42cc3f658a","project_id":"molis-work-v1-demo","goal_id":"V1","title":"目标树已经能看出下一步","actor_id":"demo-user","actor_kind":"user","received_at":"2026-01-15T09:00:00.000Z","journal_seq":75,"config_version":1,"kind":"report","type":{"type_id":"lifecycle","version":1,"name":"生命周期交付","purpose":"可核对的工作结果","semantic_family":"delivery","source":{"kind":"local","label":"演示项目"},"fields":[{"field_id":"result","name":"结果","purpose":"当前交付","format":"text","required":true,"source":{"kind":"local"}}]},"payload":{"result":"列表、画布和看板都有真实内容可扫。"}}],"observed_event_cursor":76}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:request_goal_decision','demo-decide-ask','ef19ebc8473ad4787e38ee194b4e2a81f5718fbe430ac8c3359412e6e2c71ce1','{"event_id":"gevt-a3219e72-16c1-460f-a670-8828c0f8a9fc","observed_event_cursor":81,"recorded":true,"decision_request":{"request_id":"gdec-req-57969f1a-9076-4876-8537-af0e40334b5b","event_id":"gevt-a3219e72-16c1-460f-a670-8828c0f8a9fc","question":"第一次打开项目时，默认落在 Goal 列表还是默认打开一条 Session？","options":[{"option_id":"goals","label":"先看目标树","impact":"用户先理解现在做什么，再决定开哪条会话"},{"option_id":"session","label":"先开 Session","impact":"用户立刻回到对话，但可能还没看清目标"}],"scope":{"requirement_ids":["DECIDE-C1"],"event_ids":[],"concern_ids":[],"action":null},"purpose":"suggestion","proposed_change":null,"commitment":null,"status":"pending","created_at":"2026-01-15T09:00:00.000Z"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:set_active_goal','demo-active-goal','a0f2141dac542f74f89561317bee608494e61f23d9e1338db5b82ea80dd1bd33','{"active_goal_id":"V1","observed_event_cursor":89}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:set_goal_archived','demo-archive-graph','a0fa97583d513e087f83a509d19dd187fdbaa4e80bd837c1840d6312f24d157c','{"goal":{"goal_id":"GRAPH","project_id":"molis-work-v1-demo","title":"让复杂 Goal 关系仍然一眼可读","outcome":"父子层级、前置依赖和当前焦点在复杂网络中仍有清楚的方向与落点","why":"列表适合顺序浏览，但复杂 Goal 的多层结构和跨分支依赖会在列表里变得难以判断","business_logic":"用户在 List 与 Graph 之间切换；Graph 只读取真实父子和依赖关系，以节点、分区和有向连线呈现。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"satisfied","trashed_at":null,"trashed_by":null,"archived_at":"2026-01-15T09:00:00.000Z","archived_by":"demo-user","priority":76,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"active_goal_cleared":false,"observed_event_cursor":92}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:set_goal_trashed','demo-trash-auto-connect','e09dab789723f90c10135f877cdad6f0228d3281c031e8f2c179ed069aa808d9','{"status":"trashed","goal":{"goal_id":"AUTO-CONNECT","project_id":"molis-work-v1-demo","title":"自动替用户选择最近使用的项目","outcome":"新对话少做一次项目确认","why":"早期方案希望用历史目录记录缩短首次连接步骤","business_logic":"新对话进入一个以前使用过的目录时，系统直接连接最近的项目，不再询问用户。这个方案可能选错项目，因此已经移入回收站，当前产品只展示候选并让用户决定。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","trashed_at":"2026-01-15T09:00:00.000Z","trashed_by":"demo-user","archived_at":null,"archived_by":null,"priority":10,"accepted_by":null,"accepted_at":null,"created_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","acceptance_criteria":[]},"active_goal_cleared":false,"deactivated_relation_ids":[],"restored_relation_ids":[],"pending_relation_ids":[],"observed_event_cursor":68}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:submit_goal_event_closure','demo-core-close','fa37384da609aff7c2712e5d1fac7f016984236dad4824a657c81bd70d00e033','{"event_id":"gevt-62c5cde6-3555-4a2a-9002-076b388fcff3","observed_event_cursor":90,"recorded":true,"completion_applied":true,"work_status":"completed","unmet_reasons":[],"closure":{"closure_id":"gclo-f7571f7b-18e4-4e35-bff2-150eb5eee277","event_id":"gevt-62c5cde6-3555-4a2a-9002-076b388fcff3","kind":"complete","result":"可用的生命周期记录","reason":"约定要求已有支持事实，演示收尾","recorded":true,"completion_applied":true,"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1,"unmet_reasons":[],"superseded":false,"superseded_reason":null,"recorded_at":"2026-01-15T09:00:00.000Z","acceptance_round":1}}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:submit_goal_event_closure','demo-dropped-cancel','02db29a4db2c28d40e748fbf95297a1c2dff764a9bf30d22fa7a97c42eb5d22d','{"event_id":"gevt-0622376f-57ce-4d2d-8f91-45b06a0f1010","observed_event_cursor":88,"recorded":true,"completion_applied":false,"work_status":"cancelled","unmet_reasons":[],"closure":{"closure_id":"gclo-b4a871a4-26c0-4723-8237-c682de988410","event_id":"gevt-0622376f-57ce-4d2d-8f91-45b06a0f1010","kind":"cancel","result":null,"reason":"旧会话读不到新接入，会让人误以为安装失败","recorded":true,"completion_applied":false,"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1,"unmet_reasons":[],"superseded":false,"superseded_reason":null,"recorded_at":"2026-01-15T09:00:00.000Z","acceptance_round":null}}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','demo-user','io.molis.work.goals:submit_goal_event_closure','demo-graph-close','792349da840b2b3e0356befdc69712d44eeb34a5d1d43da33e99ce798b98b95c','{"event_id":"gevt-40c82e49-1a84-4957-a494-edfbd6479e88","observed_event_cursor":91,"recorded":true,"completion_applied":true,"work_status":"completed","unmet_reasons":[],"closure":{"closure_id":"gclo-7787257e-2484-4657-84b2-adeb1336d44c","event_id":"gevt-40c82e49-1a84-4957-a494-edfbd6479e88","kind":"complete","result":"画布关系已经可扫","reason":"演示收尾，把已完成关系图移出日常列表","recorded":true,"completion_applied":true,"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1,"unmet_reasons":[],"superseded":false,"superseded_reason":null,"recorded_at":"2026-01-15T09:00:00.000Z","acceptance_round":1}}','2026-01-15T09:00:00.000Z');
INSERT INTO "idempotency_records"("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES('molis-work-v1-demo','web-user','io.molis.work.goals:initialize_board','project-catalog-create-molis-work-v1-demo','44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a','{"project_id":"molis-work-v1-demo","observed_event_cursor":3}','2026-01-15T09:00:00.000Z');
INSERT INTO "library_artifact_versions"("artifact_id","version","artifact_type_id","schema_version","producer_plugin_version","content_kind","payload_json","content_ref","content_digest","size_bytes","metadata_json","scope","availability","unavailable_reason","lifecycle_state","supersedes_version","created_by","created_at","archived_at","archived_by","origin_json","title","media_type","trace_json") VALUES('demo/core-lifecycle-record',1,'io.molis.work.document',2,'0.1.0','inline','{"content":"# 生命周期记录已接通\n\n从约定、报告到收尾形成完整记录\n","format":"markdown","source":"file","source_id":"生命周期记录.md:v1","source_url":null,"title":"生命周期记录已接通","warnings":[]}',NULL,'sha256:ed13d996053ecdf96834908c38ab3f29bb5fcb025d78a8c6637c89ad369a25b9',239,'{"origin":"demo-seed"}','personal','available',NULL,'active',NULL,'demo-user','2026-01-15T09:00:00.000Z',NULL,NULL,'{"kind":"imported","file_name":"生命周期记录.md"}','生命周期记录已接通','text/markdown','[]');
INSERT INTO "library_artifact_versions"("artifact_id","version","artifact_type_id","schema_version","producer_plugin_version","content_kind","payload_json","content_ref","content_digest","size_bytes","metadata_json","scope","availability","unavailable_reason","lifecycle_state","supersedes_version","created_by","created_at","archived_at","archived_by","origin_json","title","media_type","trace_json") VALUES('demo/core-lifecycle-record',2,'io.molis.work.document',2,'0.1.0','inline','{"content":"# 可用的生命周期记录\n\n约定要求已有支持事实，演示收尾\n","format":"markdown","source":"file","source_id":"生命周期记录.md:v2","source_url":null,"title":"可用的生命周期记录","warnings":[]}',NULL,'sha256:fa22a2ebab3f7427680667dd56516e60bff3ec43c66514cb29e4b1dc784c2846',239,'{"origin":"demo-seed"}','personal','available',NULL,'active',1,'demo-user','2026-01-15T09:00:00.000Z',NULL,NULL,'{"kind":"imported","file_name":"生命周期记录.md"}','可用的生命周期记录','text/markdown','[]');
INSERT INTO "library_artifact_versions"("artifact_id","version","artifact_type_id","schema_version","producer_plugin_version","content_kind","payload_json","content_ref","content_digest","size_bytes","metadata_json","scope","availability","unavailable_reason","lifecycle_state","supersedes_version","created_by","created_at","archived_at","archived_by","origin_json","title","media_type","trace_json") VALUES('feed-capture:feeditem-524ac393-86d6-46f3-aa23-521b6125fb25:feedoutrule-b3d79af8-f503-42d6-9c34-3e1e2019669d',1,'io.molis.work.feed.capture',1,'0.1.0','inline','{"materials":[],"occurred_at":"2026-09-16T04:25:00.000Z","source":{"source_id":"feed-source-f34498b13c742f0d0f851765e48fe4d6","source_kind":"rss","source_label":"Solidot"},"summary":"用户要能从列表看出下一步、阻塞和完成依据。","tags":["RSS","产品设计"],"title":"第一次把模糊想法收成目标树","url":"https://www.solidot.org/"}',NULL,'sha256:361ce27361a114a6ccfabf31b04c3c14b595ff6e7c1b9ba30bf40dfc86e68727',361,'{"feed_item_id":"feeditem-524ac393-86d6-46f3-aa23-521b6125fb25","rule_id":"feedoutrule-b3d79af8-f503-42d6-9c34-3e1e2019669d"}','personal','available',NULL,'active',NULL,'web-user','2026-01-15T09:00:00.000Z',NULL,NULL,'{"kind":"pinned","subject":{"kind":"feed_item","id":"feeditem-524ac393-86d6-46f3-aa23-521b6125fb25"},"revision":"833d515074a307ae"}','第一次把模糊想法收成目标树','application/json','[]');
INSERT INTO "library_artifacts"("artifact_id","project_id","owner_actor_id","producer_plugin_id","producer_binding_signature","created_at") VALUES('demo/core-lifecycle-record','molis-work-v1-demo','web-user','io.molis.work.artifacts','official-artifacts-binding','2026-01-15T09:00:00.000Z');
INSERT INTO "library_artifacts"("artifact_id","project_id","owner_actor_id","producer_plugin_id","producer_binding_signature","created_at") VALUES('feed-capture:feeditem-524ac393-86d6-46f3-aa23-521b6125fb25:feedoutrule-b3d79af8-f503-42d6-9c34-3e1e2019669d','molis-work-v1-demo','web-user','io.molis.work.feed','official-feed-binding','2026-01-15T09:00:00.000Z');
INSERT INTO "listener_instances"("project_id","source_id","cursor_json","state","attempt","retry_at","last_error_code","lease_owner","lease_expires_at","updated_at") VALUES('molis-work-v1-demo','demo-github','{}','idle',0,NULL,NULL,NULL,NULL,'2026-09-16T06:18:00.000Z');
INSERT INTO "listener_instances"("project_id","source_id","cursor_json","state","attempt","retry_at","last_error_code","lease_owner","lease_expires_at","updated_at") VALUES('molis-work-v1-demo','demo-gmail','{}','idle',0,NULL,NULL,NULL,NULL,'2026-09-16T05:42:00.000Z');
INSERT INTO "listener_instances"("project_id","source_id","cursor_json","state","attempt","retry_at","last_error_code","lease_owner","lease_expires_at","updated_at") VALUES('molis-work-v1-demo','feed-source-5496d064f90938a458c4b1eec79d4a4b','{}','idle',0,NULL,NULL,NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "listener_instances"("project_id","source_id","cursor_json","state","attempt","retry_at","last_error_code","lease_owner","lease_expires_at","updated_at") VALUES('molis-work-v1-demo','feed-source-a12054cbb831b279742fac4cfe340b2b','{}','idle',0,NULL,NULL,NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "listener_instances"("project_id","source_id","cursor_json","state","attempt","retry_at","last_error_code","lease_owner","lease_expires_at","updated_at") VALUES('molis-work-v1-demo','feed-source-f34498b13c742f0d0f851765e48fe4d6','{}','idle',0,NULL,NULL,NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "plugin_event_cursors"("project_id","subscriber_plugin_id","subscriber_install_id","subscriber_generation","revision","source_plugin_id","event_type_id","type_version","delivered_sequence","state","retry_at","last_error_code","updated_at") VALUES('molis-work-v1-demo','io.molis.work.git','plugin-install-1f6466ff32b4232a98f50611ede69465','e97f6d39-dc71-4a43-b8c7-484075ce9585','7ec02e31-6b93-44b8-8ceb-a194b4eec271','io.molis.work.coding','io.molis.work.coding.file-changed',1,0,'idle',NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_event_cursors"("project_id","subscriber_plugin_id","subscriber_install_id","subscriber_generation","revision","source_plugin_id","event_type_id","type_version","delivered_sequence","state","retry_at","last_error_code","updated_at") VALUES('molis-work-v1-demo','io.molis.work.git','plugin-install-1f6466ff32b4232a98f50611ede69465','e97f6d39-dc71-4a43-b8c7-484075ce9585','4b81c08b-2694-44da-bb6b-7c7c73578b7f','io.molis.work.coding','io.molis.work.coding.run-updated',1,0,'idle',NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_event_cursors"("project_id","subscriber_plugin_id","subscriber_install_id","subscriber_generation","revision","source_plugin_id","event_type_id","type_version","delivered_sequence","state","retry_at","last_error_code","updated_at") VALUES('molis-work-v1-demo','io.molis.work.git','plugin-install-1f6466ff32b4232a98f50611ede69465','e97f6d39-dc71-4a43-b8c7-484075ce9585','c32a3222-c65e-4c04-aa76-7f587caea36f','io.molis.work.coding','io.molis.work.coding.workspace-invalidated',1,0,'idle',NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_input_groups"("project_id","plugin_id","group_id","updated_at") VALUES('molis-work-v1-demo','io.molis.work.diff','snapshots','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_port_bindings"("project_id","target_plugin_id","target_port","source_plugin_id","source_port","origin","created_at","updated_at") VALUES('molis-work-v1-demo','io.molis.work.diff','after','system.materials','after','default','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_port_bindings"("project_id","target_plugin_id","target_port","source_plugin_id","source_port","origin","created_at","updated_at") VALUES('molis-work-v1-demo','io.molis.work.diff','before','system.materials','before','default','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_port_bindings"("project_id","target_plugin_id","target_port","source_plugin_id","source_port","origin","created_at","updated_at") VALUES('molis-work-v1-demo','io.molis.work.diff','changeset','io.molis.work.coding','changeset','default','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_port_bindings"("project_id","target_plugin_id","target_port","source_plugin_id","source_port","origin","created_at","updated_at") VALUES('molis-work-v1-demo','io.molis.work.diff','git-changeset','io.molis.work.git','changeset','default','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_private_values"("install_id","item_key","item_value") VALUES('plugin-install-15a5ea6c2bf72c9f3b7203ebd168072f','demo:seeded','done');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.coding','official-coding-binding','coding',1,'["coding_input_versions","coding_inputs","coding_plan_drafts","coding_plan_versions","coding_saved_history","coding_sessions","coding_sessions_project_updated_idx","sync_dd6dd4054975ce4abcd1e12268d3_aggregate_editor_versions","sync_dd6dd4054975ce4abcd1e12268d3_context","sync_dd6dd4054975ce4abcd1e12268d3_replica_changes","sync_dd6dd4054975ce4abcd1e12268d3_replica_changes_key","sync_dd6dd4054975ce4abcd1e12268d3_replica_conflicts","sync_dd6dd4054975ce4abcd1e12268d3_replica_heads","sync_dd6dd4054975ce4abcd1e12268d3_replica_outbox","sync_dd6dd4054975ce4abcd1e12268d3_replica_resolutions","sync_dd6dd4054975ce4abcd1e12268d3_replica_state","sync_dd6dd4054975ce4abcd1e12268d3_track_0_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_0_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_0_update","sync_dd6dd4054975ce4abcd1e12268d3_track_1_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_1_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_1_update","sync_dd6dd4054975ce4abcd1e12268d3_track_2_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_2_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_2_update","sync_dd6dd4054975ce4abcd1e12268d3_track_3_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_3_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_3_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.feed','official-feed-binding','feed',1,'["feed_item_events","feed_item_events_project_item_idx","feed_items","feed_items_project_signal_idx","feed_items_project_source_external_idx","feed_items_project_updated_idx","feed_materials","feed_materials_project_item_idx","feed_missed_pulls","feed_out_rules","feed_out_rules_project_enabled_idx","feed_source_runs","feed_source_runs_project_source_idx","feed_sources","feed_sources_project_updated_idx","listener_deliveries","listener_deliveries_recovery_idx","listener_instances","signal_events","signal_events_project_source_idx","signal_revisions","signals","signals_project_source_observed_idx","source_events","source_events_project_source_idx","sync_14ff60cd5b3b2f8842d99bea7ef6_aggregate_editor_versions","sync_14ff60cd5b3b2f8842d99bea7ef6_context","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes_key","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_conflicts","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_heads","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_outbox","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_resolutions","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state","sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_delete","sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_insert","sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_update","sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_delete","sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_insert","sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_update","sync_522a4260e0bcbee35d4d9f85406c_aggregate_editor_versions","sync_522a4260e0bcbee35d4d9f85406c_context","sync_522a4260e0bcbee35d4d9f85406c_replica_changes","sync_522a4260e0bcbee35d4d9f85406c_replica_changes_key","sync_522a4260e0bcbee35d4d9f85406c_replica_conflicts","sync_522a4260e0bcbee35d4d9f85406c_replica_heads","sync_522a4260e0bcbee35d4d9f85406c_replica_outbox","sync_522a4260e0bcbee35d4d9f85406c_replica_resolutions","sync_522a4260e0bcbee35d4d9f85406c_replica_state","sync_522a4260e0bcbee35d4d9f85406c_track_0_delete","sync_522a4260e0bcbee35d4d9f85406c_track_0_insert","sync_522a4260e0bcbee35d4d9f85406c_track_0_update","sync_522a4260e0bcbee35d4d9f85406c_track_1_delete","sync_522a4260e0bcbee35d4d9f85406c_track_1_insert","sync_522a4260e0bcbee35d4d9f85406c_track_1_update","sync_522a4260e0bcbee35d4d9f85406c_track_2_delete","sync_522a4260e0bcbee35d4d9f85406c_track_2_insert","sync_522a4260e0bcbee35d4d9f85406c_track_2_update","sync_522a4260e0bcbee35d4d9f85406c_track_3_delete","sync_522a4260e0bcbee35d4d9f85406c_track_3_insert","sync_522a4260e0bcbee35d4d9f85406c_track_3_update","sync_522a4260e0bcbee35d4d9f85406c_track_4_delete","sync_522a4260e0bcbee35d4d9f85406c_track_4_insert","sync_522a4260e0bcbee35d4d9f85406c_track_4_update","sync_522a4260e0bcbee35d4d9f85406c_track_5_delete","sync_522a4260e0bcbee35d4d9f85406c_track_5_insert","sync_522a4260e0bcbee35d4d9f85406c_track_5_update","sync_daec9cf494e58d382d6262de3af9_aggregate_editor_versions","sync_daec9cf494e58d382d6262de3af9_context","sync_daec9cf494e58d382d6262de3af9_replica_changes","sync_daec9cf494e58d382d6262de3af9_replica_changes_key","sync_daec9cf494e58d382d6262de3af9_replica_conflicts","sync_daec9cf494e58d382d6262de3af9_replica_heads","sync_daec9cf494e58d382d6262de3af9_replica_outbox","sync_daec9cf494e58d382d6262de3af9_replica_resolutions","sync_daec9cf494e58d382d6262de3af9_replica_state","sync_daec9cf494e58d382d6262de3af9_track_0_delete","sync_daec9cf494e58d382d6262de3af9_track_0_insert","sync_daec9cf494e58d382d6262de3af9_track_0_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.goals','official-goals-binding','goals',1,'["acceptance_criteria","acceptance_goal_idx","boards","goal_event_agreements","goal_event_applied_decisions","goal_event_applied_decisions_goal_idx","goal_event_closures","goal_event_closures_goal_idx","goal_event_concerns","goal_event_concerns_goal_idx","goal_event_config_versions","goal_event_configs","goal_event_decision_requests","goal_event_decision_requests_goal_idx","goal_event_progress_summaries","goal_event_progress_summaries_goal_idx","goal_event_requirement_bindings","goal_event_state_owners","goal_event_state_owners_project_idx","goal_event_types","goal_event_types_goal_idx","goal_event_work_status","goal_relations","goal_requirement_links","goal_trash_one_open_per_goal","goal_trash_records","goal_trash_records_goal_idx","goal_trash_relation_records","goal_trash_relation_records_relation_idx","goal_tree_item_effects","goal_tree_item_effects_proposal_idx","goal_tree_proposal_items","goal_tree_proposal_items_project_idx","goal_tree_proposal_items_proposal_idx","goal_tree_proposals","goal_tree_proposals_project_idx","goal_tree_proposals_supersedes_idx","goal_work_events","goal_work_events_goal_seq_idx","goals","goals_archive_idx","goals_project_idx","goals_ready_idx","goals_trash_idx","input_bindings","relations_from_idx","relations_to_idx","sync_ebbb9ae341b34cbb8aedd65a41e6_aggregate_editor_versions","sync_ebbb9ae341b34cbb8aedd65a41e6_context","sync_ebbb9ae341b34cbb8aedd65a41e6_context_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_context_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_context_update","sync_ebbb9ae341b34cbb8aedd65a41e6_journal","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes_key","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_conflicts","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_heads","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_outbox","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_resolutions","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state","sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.inbox','official-inbox-binding','inbox',1,'["inbox_scene_bindings"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.risk','official-risk-binding','risk',1,'["risk_editor_versions","risk_events","risk_events_risk_idx","risk_items","risk_items_status_idx","risk_links","risk_links_subject_idx","sync_57fe6903aad21582fd1bfbdd6011_aggregate_editor_versions","sync_57fe6903aad21582fd1bfbdd6011_context","sync_57fe6903aad21582fd1bfbdd6011_replica_changes","sync_57fe6903aad21582fd1bfbdd6011_replica_changes_key","sync_57fe6903aad21582fd1bfbdd6011_replica_conflicts","sync_57fe6903aad21582fd1bfbdd6011_replica_heads","sync_57fe6903aad21582fd1bfbdd6011_replica_outbox","sync_57fe6903aad21582fd1bfbdd6011_replica_resolutions","sync_57fe6903aad21582fd1bfbdd6011_replica_state","sync_57fe6903aad21582fd1bfbdd6011_track_0_delete","sync_57fe6903aad21582fd1bfbdd6011_track_0_insert","sync_57fe6903aad21582fd1bfbdd6011_track_0_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_project_databases"("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES('io.molis.work.schedule','official-schedule-binding','schedule',1,'["schedule_conversation_tasks","schedule_conversation_tasks_enabled_idx","schedule_conversation_turns","schedule_conversation_turns_task_idx","schedule_missed_runs","schedule_operation_occurrences","schedule_operations","schedule_plugin_reminders","schedule_plugin_reminders_owner","sync_fc44281fa4e6ae1ad919f15bea63_aggregate_editor_versions","sync_fc44281fa4e6ae1ad919f15bea63_context","sync_fc44281fa4e6ae1ad919f15bea63_replica_changes","sync_fc44281fa4e6ae1ad919f15bea63_replica_changes_key","sync_fc44281fa4e6ae1ad919f15bea63_replica_conflicts","sync_fc44281fa4e6ae1ad919f15bea63_replica_heads","sync_fc44281fa4e6ae1ad919f15bea63_replica_outbox","sync_fc44281fa4e6ae1ad919f15bea63_replica_resolutions","sync_fc44281fa4e6ae1ad919f15bea63_replica_state","sync_fc44281fa4e6ae1ad919f15bea63_track_0_delete","sync_fc44281fa4e6ae1ad919f15bea63_track_0_insert","sync_fc44281fa4e6ae1ad919f15bea63_track_0_update","sync_fc44281fa4e6ae1ad919f15bea63_track_1_delete","sync_fc44281fa4e6ae1ad919f15bea63_track_1_insert","sync_fc44281fa4e6ae1ad919f15bea63_track_1_update"]','2026-01-15T09:00:00.000Z');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-15a5ea6c2bf72c9f3b7203ebd168072f','{"install_id":"plugin-install-15a5ea6c2bf72c9f3b7203ebd168072f","installation_generation":"7c01afe0-e938-4d0e-97df-d427ae61067f","plugin_id":"io.molis.work.goals","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-goals-binding","manifest_digest":"611f7a6572a7617ee82e58d50ef75f1e9253a8555418d2d6efde352cb0e3f906","deployment":"local","selected_entrypoint":"./index.js","grants":["acceptance:read","acceptance:report","actions:delegate","actions:invoke","artifacts:read","attention:read","attention:write","context-ledger:read","context-ledger:write","goals:decide","goals:read","goals:write","journal:project","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-1f6466ff32b4232a98f50611ede69465','{"install_id":"plugin-install-1f6466ff32b4232a98f50611ede69465","installation_generation":"e97f6d39-dc71-4a43-b8c7-484075ce9585","plugin_id":"io.molis.work.git","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-git-binding","manifest_digest":"1f78738a27a2e4a3eb2286f5653d11bfac119ea778d4d68780dacba24064820c","deployment":"local","selected_entrypoint":"./index.js","grants":["artifact:read","artifact:write","review:git-index","review:git-operation","storage:private","workspace:read"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-4cf31e639ff642433fc8607610c1a58d','{"install_id":"plugin-install-4cf31e639ff642433fc8607610c1a58d","installation_generation":"b2b91312-3bb4-4209-9f04-e6aeb607e911","plugin_id":"io.molis.work.ppt","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-ppt-binding","manifest_digest":"c4338b16b943a38601139e1c1c5eb1f4947d0809d4e8bd9690e81c96b93ec381","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:delegate","artifact:read","artifact:write","model:invoke","ppt:read","ppt:write","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-4fdfcfd6d1db70e62f4224fae088eb1f','{"install_id":"plugin-install-4fdfcfd6d1db70e62f4224fae088eb1f","installation_generation":"ff7bf642-b2aa-4625-822c-33f9c88c34c3","plugin_id":"io.molis.work.form","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-form-binding","manifest_digest":"ea94f29253e01822a66e437b6788321044cbef90167b51d5bbf1788ee4cd55e0","deployment":"local","selected_entrypoint":"./index.js","grants":["artifact:read","artifact:write","form:read","form:submit","form:write","model:invoke","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-537d2d3be6d4ee6a1f86585c6e624a27','{"install_id":"plugin-install-537d2d3be6d4ee6a1f86585c6e624a27","installation_generation":"f3e6e4d5-2fc3-4d15-b9db-9872a83757ec","plugin_id":"io.molis.work.pages","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-pages-binding","manifest_digest":"ade6f7f347852f64ae6a53262426cd4a8c1ff782d2578827bf35ab5e3d62796c","deployment":"local","selected_entrypoint":"./index.js","grants":["artifact:read","artifact:write","goals:read","materials:read","model:invoke","pages:read","pages:write","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-622cc088255ca49281508f43304aa664','{"install_id":"plugin-install-622cc088255ca49281508f43304aa664","installation_generation":"73daf076-45bb-420b-b00a-9f845e581401","plugin_id":"io.molis.work.dataset","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-dataset-binding","manifest_digest":"1374eaf22e88dace30175566ed08355c1fe85c9f20301bf3185e26dc43a0630b","deployment":"local","selected_entrypoint":"./index.js","grants":["artifact:read","artifact:write","dataset:read","dataset:write","model:invoke","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-6fc840a4ff1292e26de87e863c01467d','{"install_id":"plugin-install-6fc840a4ff1292e26de87e863c01467d","installation_generation":"b37ec610-1f18-4620-b4d1-64a9560961a7","plugin_id":"io.molis.work.native.workflows","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-workflows-binding","manifest_digest":"6f372e9d6c75554b5f84066ade7a2fb03a5b02f56a882f67b00f5772a22f15a3","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:delegate","model:invoke","storage:private","workflows:read","workflows:write"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-7932faff44346fbb7b0b89911bd11e3a','{"install_id":"plugin-install-7932faff44346fbb7b0b89911bd11e3a","installation_generation":"8b09c22e-7e02-4872-9b85-c239ab44b646","plugin_id":"io.molis.work.inbox","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-inbox-binding","manifest_digest":"16750f15ba319647c337447531f4aecf6beb9097ab5e5fa3e304ec0dbfe87d70","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:delegate","attention:read","attention:write","evidence:read","feed:read","feed:write","functions:invoke","goals:read","inbox:read","inbox:write","journal:project","judgments:read","judgments:write","model:invoke","pages:read","pages:write","scenes:use","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-87f7cd49f3979409791d41e21b8fccc3','{"install_id":"plugin-install-87f7cd49f3979409791d41e21b8fccc3","installation_generation":"c3cb524c-be09-49ad-a8c3-a50bc6099d85","plugin_id":"io.molis.work.work-brief","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-work-brief-binding","manifest_digest":"6ce0a982492c907c37b2137ee37114c778c335b6f7cad74ef28d8fb751886367","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:delegate","artifact:read","artifact:write","projects:reach","storage:private","work-brief:read","work-brief:write"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-89fdd009a6009b63a534e1c415360402','{"install_id":"plugin-install-89fdd009a6009b63a534e1c415360402","installation_generation":"40888273-a962-4f66-93e2-aab139f1f602","plugin_id":"io.molis.work.lingguang","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-lingguang-binding","manifest_digest":"f6e497c59f11998e142d295c631c6422d3ff828c585adbba0face4111b297ad7","deployment":"local","selected_entrypoint":"./index.js","grants":["lingguang:read","lingguang:write","materials:fetch","materials:read","model:invoke","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-9b090ee5406d4f5907d370339bdd8045','{"install_id":"plugin-install-9b090ee5406d4f5907d370339bdd8045","installation_generation":"0391738c-607d-4c2d-a7bf-4d4c68adaa08","plugin_id":"io.molis.work.coding","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-coding-binding","manifest_digest":"2b6aa5713abd41e893f64cafcc8a6c99347b3fa12a278369be6195814e63dd76","deployment":"local","selected_entrypoint":"./index.js","grants":["acceptance:read","artifact:read","artifact:write","commands:read","goals:read","goals:write","knowledge:read","materials:read","model:invoke","model:read","review:git-integration","review:git-worktree","search:read","skills:read","storage:private","workspace:read"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-a2d0547d448030b70d0710e378775d51','{"install_id":"plugin-install-a2d0547d448030b70d0710e378775d51","installation_generation":"8bf1f60f-1a18-43f0-b96e-92d36e958e0e","plugin_id":"io.molis.work.diff","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-diff-binding","manifest_digest":"3489537bacbb434f3c042bf6d704952bcf5ac0b50bcd1b36203e25060dfe2606","deployment":"local","selected_entrypoint":"./index.js","grants":["artifact:read"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-af5a48f1f1cc179a103e5e3a6b116dd4','{"install_id":"plugin-install-af5a48f1f1cc179a103e5e3a6b116dd4","installation_generation":"a03a09cc-4c2e-46ca-88f4-aa63904dffcb","plugin_id":"io.molis.work.feed","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-feed-binding","manifest_digest":"610db5ac19508eef4570fee742e33df23243133ed246d4c9a5767f046689f90d","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:delegate","actions:invoke","artifact:write","attention:read","attention:write","connections:observe","connections:use","context-ledger:read","context-ledger:write","evidence:collect","evidence:read","feed:read","feed:write","functions:invoke","functions:manage","goals:read","goals:write","inbox:read","inbox:write","journal:project","judgments:read","judgments:write","model:invoke","plugins:read","scenes:use","schedule:read","schedule:write","sources:pull_connector","sources:pull_public_feed","sources:pull_query","sources:read_repository","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-ca555f34f4090939bc580012e756d92c','{"install_id":"plugin-install-ca555f34f4090939bc580012e756d92c","installation_generation":"d20c75d7-aa46-427c-abed-3b3874adbb6c","plugin_id":"io.molis.work.risk","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-risk-binding","manifest_digest":"eb05b675abbdd46b76e810b95660fdc8d9532e0d9a41d8c90e1d5cb0d4abf516","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:delegate","risk:read","risk:write","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_installs"("install_id","record_json","publisher_trust") VALUES('plugin-install-da3726a85a96dceede918bef171fbc66','{"install_id":"plugin-install-da3726a85a96dceede918bef171fbc66","installation_generation":"6e66801c-a633-4f24-a177-b1e85f05012d","plugin_id":"io.molis.work.schedule","version":"0.1.0","publisher_id":"molis","publisher_signature":"official-schedule-binding","manifest_digest":"42f605e80d41e46c11b61d4acf438b40c90d5c780d99efb7cd8156f2a54ff193","deployment":"local","selected_entrypoint":"./index.js","grants":["actions:invoke","agent:run","model:read","notifications:write","plugins:read","schedule:read","schedule:write","storage:private"],"execution":"host","publisher_trust":"host","state":"installed","recovery_count":0,"last_error_code":null,"installed_at":"2026-01-15T09:00:00.000Z","updated_at":"2026-01-15T09:00:00.000Z","uninstalled_at":null,"retain_private_data":true}','host');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.coding','official-coding-binding','0.1.0','2b6aa5713abd41e893f64cafcc8a6c99347b3fa12a278369be6195814e63dd76','{"plugin_id":"io.molis.work.coding","publisher_signature":"official-coding-binding","version":"0.1.0","manifest_digest":"2b6aa5713abd41e893f64cafcc8a6c99347b3fa12a278369be6195814e63dd76","manifest":"sha256:07962619db1f0a6dc879bd7d6d530eadd012522e66572997e4c98ca21ba031ec"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.dataset','official-dataset-binding','0.1.0','1374eaf22e88dace30175566ed08355c1fe85c9f20301bf3185e26dc43a0630b','{"plugin_id":"io.molis.work.dataset","publisher_signature":"official-dataset-binding","version":"0.1.0","manifest_digest":"1374eaf22e88dace30175566ed08355c1fe85c9f20301bf3185e26dc43a0630b","manifest":"sha256:e3646dd7d21e996ad0216f5ae3312594d17a4faabce2769264b59fbf07ad33b7"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.diff','official-diff-binding','0.1.0','3489537bacbb434f3c042bf6d704952bcf5ac0b50bcd1b36203e25060dfe2606','{"plugin_id":"io.molis.work.diff","publisher_signature":"official-diff-binding","version":"0.1.0","manifest_digest":"3489537bacbb434f3c042bf6d704952bcf5ac0b50bcd1b36203e25060dfe2606","manifest":"sha256:c14b98a34a06fc4dfdb8d6e37460ee7d6939041afa123e10d9b0cb55097b4869"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.feed','official-feed-binding','0.1.0','610db5ac19508eef4570fee742e33df23243133ed246d4c9a5767f046689f90d','{"plugin_id":"io.molis.work.feed","publisher_signature":"official-feed-binding","version":"0.1.0","manifest_digest":"610db5ac19508eef4570fee742e33df23243133ed246d4c9a5767f046689f90d","manifest":"sha256:7feb43b220d5cb51657f3bf52a853d4173932e4db70db4e7387d023525baab06"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.form','official-form-binding','0.1.0','ea94f29253e01822a66e437b6788321044cbef90167b51d5bbf1788ee4cd55e0','{"plugin_id":"io.molis.work.form","publisher_signature":"official-form-binding","version":"0.1.0","manifest_digest":"ea94f29253e01822a66e437b6788321044cbef90167b51d5bbf1788ee4cd55e0","manifest":"sha256:450b530bede496f51b06d245041fdbf195d6efcd675c29163ea1397991f0a3b7"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.git','official-git-binding','0.1.0','1f78738a27a2e4a3eb2286f5653d11bfac119ea778d4d68780dacba24064820c','{"plugin_id":"io.molis.work.git","publisher_signature":"official-git-binding","version":"0.1.0","manifest_digest":"1f78738a27a2e4a3eb2286f5653d11bfac119ea778d4d68780dacba24064820c","manifest":"sha256:5c282d12953ba1b58d382a401de7a0735f087ade88efbf6996faa8ca99aac9eb"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.goals','official-goals-binding','0.1.0','611f7a6572a7617ee82e58d50ef75f1e9253a8555418d2d6efde352cb0e3f906','{"plugin_id":"io.molis.work.goals","publisher_signature":"official-goals-binding","version":"0.1.0","manifest_digest":"611f7a6572a7617ee82e58d50ef75f1e9253a8555418d2d6efde352cb0e3f906","manifest":"sha256:59c2c9d251e80761d6f50fb6fccaef02823e709591121cd3a52d01eda963472e"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.inbox','official-inbox-binding','0.1.0','16750f15ba319647c337447531f4aecf6beb9097ab5e5fa3e304ec0dbfe87d70','{"plugin_id":"io.molis.work.inbox","publisher_signature":"official-inbox-binding","version":"0.1.0","manifest_digest":"16750f15ba319647c337447531f4aecf6beb9097ab5e5fa3e304ec0dbfe87d70","manifest":"sha256:a330d6b1b8fa67747209e792b085e0901a41d0a28a86c9c964c0312c2488d7a4"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.lingguang','official-lingguang-binding','0.1.0','f6e497c59f11998e142d295c631c6422d3ff828c585adbba0face4111b297ad7','{"plugin_id":"io.molis.work.lingguang","publisher_signature":"official-lingguang-binding","version":"0.1.0","manifest_digest":"f6e497c59f11998e142d295c631c6422d3ff828c585adbba0face4111b297ad7","manifest":"sha256:e07c635a416a7df9ef12d32eaad87d44bc480765816e5db82daef9207b393598"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.native.workflows','official-workflows-binding','0.1.0','6f372e9d6c75554b5f84066ade7a2fb03a5b02f56a882f67b00f5772a22f15a3','{"plugin_id":"io.molis.work.native.workflows","publisher_signature":"official-workflows-binding","version":"0.1.0","manifest_digest":"6f372e9d6c75554b5f84066ade7a2fb03a5b02f56a882f67b00f5772a22f15a3","manifest":"sha256:434f0a0526079a52ce09dcd71a4f1c32be64c0ba9a76db4a0b7a35049ba9217f"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.pages','official-pages-binding','0.1.0','ade6f7f347852f64ae6a53262426cd4a8c1ff782d2578827bf35ab5e3d62796c','{"plugin_id":"io.molis.work.pages","publisher_signature":"official-pages-binding","version":"0.1.0","manifest_digest":"ade6f7f347852f64ae6a53262426cd4a8c1ff782d2578827bf35ab5e3d62796c","manifest":"sha256:e0ac49d4617433f26e7e1df109b9bd7e13804015a32e0e132c1d27780e40f706"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.ppt','official-ppt-binding','0.1.0','c4338b16b943a38601139e1c1c5eb1f4947d0809d4e8bd9690e81c96b93ec381','{"plugin_id":"io.molis.work.ppt","publisher_signature":"official-ppt-binding","version":"0.1.0","manifest_digest":"c4338b16b943a38601139e1c1c5eb1f4947d0809d4e8bd9690e81c96b93ec381","manifest":"sha256:a5c7f5ea592f0cd6f974b48ed57d00e5bd9ac653d960eba331b27c513443a1cf"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.risk','official-risk-binding','0.1.0','eb05b675abbdd46b76e810b95660fdc8d9532e0d9a41d8c90e1d5cb0d4abf516','{"plugin_id":"io.molis.work.risk","publisher_signature":"official-risk-binding","version":"0.1.0","manifest_digest":"eb05b675abbdd46b76e810b95660fdc8d9532e0d9a41d8c90e1d5cb0d4abf516","manifest":"sha256:3b24c33132791483d9d70be31b3654e7510245784efe99f8c409510c4b44acf5"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.schedule','official-schedule-binding','0.1.0','42f605e80d41e46c11b61d4acf438b40c90d5c780d99efb7cd8156f2a54ff193','{"plugin_id":"io.molis.work.schedule","publisher_signature":"official-schedule-binding","version":"0.1.0","manifest_digest":"42f605e80d41e46c11b61d4acf438b40c90d5c780d99efb7cd8156f2a54ff193","manifest":"sha256:99ba23f5493130a14fcac0f1fdf84179959495294172c31fa91506b024b63a1c"}');
INSERT INTO "plugin_runtime_release_artifacts"("plugin_id","publisher_signature","version","manifest_digest","artifact_json") VALUES('io.molis.work.work-brief','official-work-brief-binding','0.1.0','6ce0a982492c907c37b2137ee37114c778c335b6f7cad74ef28d8fb751886367','{"plugin_id":"io.molis.work.work-brief","publisher_signature":"official-work-brief-binding","version":"0.1.0","manifest_digest":"6ce0a982492c907c37b2137ee37114c778c335b6f7cad74ef28d8fb751886367","manifest":"sha256:9f15df578dae9cc73ee7cf45e72ec4af7bc0d6c07003316da711486f7b61a285"}');
INSERT INTO "process_items_replica_state"("id","device","cursor","applying") VALUES(1,'29b67439bee56ff6921fc49c96407b9a',0,0);
INSERT INTO "project_approvals_replica_changes"("seq","key") VALUES(1,'["molis-work-v1-demo","project_approvals","molis-work-v1-demo"]');
INSERT INTO "project_approvals_replica_changes"("seq","key") VALUES(2,'["molis-work-v1-demo","project_approvals","molis-work-v1-demo"]');
INSERT INTO "project_approvals_replica_state"("id","device","cursor","applying") VALUES(1,'8532c4f384151faea50b674fedfadd2d',0,0);
INSERT INTO "project_guidance_replica_state"("id","device","cursor","applying") VALUES(1,'32e9c697477876218cf9c32bcd569f3d',0,0);
INSERT INTO "project_review_decisions"("decision_id","project_id","request_id","request_key","record_json","recorded_at") VALUES('9b69f394-bb47-41ee-9ba3-def3f8d562b3','molis-work-v1-demo','["system","system.acceptance","acceptance.decide",1,"system.acceptance","io.molis.work.goals/goal/CORE","f7bd224e3d051afa3bcac9b0f9423198"]','io.molis.work.goals/goal/CORE','{"actor_id":"demo-user","choice_fingerprint":"e1a350d7560560f71df34e8a03ad1dbb753c039205e09e399ad5ba898608467c","decided_at":"2026-01-15T09:00:00.000Z","decision":"apply","decision_id":"9b69f394-bb47-41ee-9ba3-def3f8d562b3","note":null,"presentation":{"approver":{"kind":"person"},"choices":[{"accepts":["CORE-C1"],"availability":{"available":true},"id":"apply","label":{"literal":"认可所选要求"},"returns":[]}],"expires_at":null,"requirements":[{"evidence":[],"id":"CORE-C1","requires_person":false,"statement":"工作从约定、报告到收尾形成完整记录","target":{"owner":{"kind":"system","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"subject":{"id":"io.molis.work.goals/goal/CORE:CORE-C1","kind":"acceptance_requirement"},"version":"r1@demo-core-delivery"},"version":"1"}],"summary":"交付 demo-core-delivery · 认可所选要求"},"publisher_signature":"system:system.acceptance","reference":{"id":"[\"system\",\"system.acceptance\",\"acceptance.decide\",1,\"system.acceptance\",\"io.molis.work.goals/goal/CORE\",\"f7bd224e3d051afa3bcac9b0f9423198\"]","owner":{"kind":"trusted-decision","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"version":"18f3c1f9fdb864c3128ea7374f7f233d47f94b3d5e9e191edb62fdad0d49661a"},"request_key":"io.molis.work.goals/goal/CORE","review":{"requirements":[{"disposition":"accepted","evidence":[],"id":"CORE-C1","target":{"owner":{"kind":"system","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"subject":{"id":"io.molis.work.goals/goal/CORE:CORE-C1","kind":"acceptance_requirement"},"version":"r1@demo-core-delivery"},"version":"1"}],"target":{"owner":{"kind":"system","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"subject":{"id":"io.molis.work.goals/goal/CORE","kind":"acceptance_subject"},"version":"f40e28824f5a7675fbd5e668de352e82d85dbc9f67fec60a4366602ee3aeeae4"}},"source":{"actor_id":"demo-user","entry":{"conversation_ref":"demo:io.molis.work.goals","message_ref":"demo:io.molis.work.goals/goal/CORE","source":"management"},"kind":"person"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_review_decisions"("decision_id","project_id","request_id","request_key","record_json","recorded_at") VALUES('abaac866-a9e4-4fbc-8b91-2b5b7e2bb804','molis-work-v1-demo','["system","system.acceptance","acceptance.decide",1,"system.acceptance","io.molis.work.goals/goal/GRAPH","381e405dad5f0e65bd71a197854bbd83"]','io.molis.work.goals/goal/GRAPH','{"actor_id":"demo-user","choice_fingerprint":"d1236f76385c8040eb9a6cd7690f1936177da7ba573554577107faa525592a8f","decided_at":"2026-01-15T09:00:00.000Z","decision":"apply","decision_id":"abaac866-a9e4-4fbc-8b91-2b5b7e2bb804","note":null,"presentation":{"approver":{"kind":"person"},"choices":[{"accepts":["GRAPH-C1"],"availability":{"available":true},"id":"apply","label":{"literal":"认可所选要求"},"returns":[]}],"expires_at":null,"requirements":[{"evidence":[],"id":"GRAPH-C1","requires_person":false,"statement":"复杂网络中的关系方向和阻塞节点可以直接辨认","target":{"owner":{"kind":"system","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"subject":{"id":"io.molis.work.goals/goal/GRAPH:GRAPH-C1","kind":"acceptance_requirement"},"version":"r1@demo-graph-delivery"},"version":"1"}],"summary":"交付 demo-graph-delivery · 认可所选要求"},"publisher_signature":"system:system.acceptance","reference":{"id":"[\"system\",\"system.acceptance\",\"acceptance.decide\",1,\"system.acceptance\",\"io.molis.work.goals/goal/GRAPH\",\"381e405dad5f0e65bd71a197854bbd83\"]","owner":{"kind":"trusted-decision","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"version":"b93a202efbec8108741f6d46c561126174770cd009986503cac9c324c66e316d"},"request_key":"io.molis.work.goals/goal/GRAPH","review":{"requirements":[{"disposition":"accepted","evidence":[],"id":"GRAPH-C1","target":{"owner":{"kind":"system","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"subject":{"id":"io.molis.work.goals/goal/GRAPH:GRAPH-C1","kind":"acceptance_requirement"},"version":"r1@demo-graph-delivery"},"version":"1"}],"target":{"owner":{"kind":"system","project_id":"molis-work-v1-demo","provider_id":"system.acceptance","scope":"project"},"subject":{"id":"io.molis.work.goals/goal/GRAPH","kind":"acceptance_subject"},"version":"c8d2740b7024deaead61bb44b3f9a06d14471f2c9498d92260d42610bc7c2c6f"}},"source":{"actor_id":"demo-user","entry":{"conversation_ref":"demo:io.molis.work.goals","message_ref":"demo:io.molis.work.goals/goal/GRAPH","source":"management"},"kind":"person"}}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_root"("project_id","created_at") VALUES('molis-work-v1-demo','2026-01-15T09:00:00.000Z');
INSERT INTO "source_events"("event_id","project_id","source_id","type","payload_json","at") VALUES('source-event-2e1afabc-6515-4c0f-a03d-8b0197e32bfa','molis-work-v1-demo','feed-source-a12054cbb831b279742fac4cfe340b2b','source.created','{"status":"active","enabled":true}','2026-01-15T09:00:00.000Z');
INSERT INTO "source_events"("event_id","project_id","source_id","type","payload_json","at") VALUES('source-event-301fc72f-f96f-4082-82c0-89db58591f95','molis-work-v1-demo','demo-github','source.created','{"status":"disconnected","enabled":false}','2026-09-16T06:18:00.000Z');
INSERT INTO "source_events"("event_id","project_id","source_id","type","payload_json","at") VALUES('source-event-34573d78-72e7-4844-ac55-0a59c85b2cd7','molis-work-v1-demo','feed-source-f34498b13c742f0d0f851765e48fe4d6','source.created','{"status":"active","enabled":true}','2026-01-15T09:00:00.000Z');
INSERT INTO "source_events"("event_id","project_id","source_id","type","payload_json","at") VALUES('source-event-bdb4faa7-ab8d-4b7f-888a-3eea2d5d99df','molis-work-v1-demo','demo-gmail','source.created','{"status":"disconnected","enabled":false}','2026-09-16T05:42:00.000Z');
INSERT INTO "source_events"("event_id","project_id","source_id","type","payload_json","at") VALUES('source-event-df25d537-fd00-4e4b-8051-d8315aa75226','molis-work-v1-demo','feed-source-5496d064f90938a458c4b1eec79d4a4b','source.created','{"status":"active","enabled":true}','2026-01-15T09:00:00.000Z');
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
INSERT INTO "sync_daec9cf494e58d382d6262de3af9_replica_changes"("seq","key") VALUES(1,'["molis-work-v1-demo","feed_rule","feedoutrule-b3d79af8-f503-42d6-9c34-3e1e2019669d"]');
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
INSERT INTO sqlite_sequence(name,seq) VALUES('builder_replica_changes',0);
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
