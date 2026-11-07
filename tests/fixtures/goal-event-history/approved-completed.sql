-- Frozen current project baseline and unchanged Goal business scenario.
PRAGMA foreign_keys=OFF;
CREATE TABLE acceptance_criteria (
    criterion_id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    decision_method TEXT NOT NULL,
    pass_condition TEXT NOT NULL,
    target_json TEXT,
    required_evidence_json TEXT NOT NULL DEFAULT '[]'
  );
CREATE TABLE artifacts_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE artifacts_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE artifacts_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE artifacts_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE artifacts_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE artifacts_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
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
CREATE TABLE feed_runtime_blobs (
    namespace TEXT NOT NULL, key TEXT NOT NULL, opaque TEXT NOT NULL, cas_token TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
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
    recorded_at TEXT NOT NULL
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
    updated_at TEXT NOT NULL
  );
CREATE TABLE goal_event_config_versions (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    adopted_planning_json TEXT NOT NULL DEFAULT '[]',
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
CREATE TABLE goal_event_requirement_conclusions (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    requirement_id TEXT NOT NULL,
    decision_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('accepted', 'rejected')),
    received_at TEXT NOT NULL,
    journal_seq INTEGER NOT NULL,
    PRIMARY KEY (project_id, goal_id, requirement_id, decision_id)
  );
CREATE TABLE goal_event_requirements (
    requirement_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    bound_type_id TEXT,
    created_at TEXT NOT NULL,
    created_in_config_version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    source_json TEXT,
    human_decision_required INTEGER NOT NULL DEFAULT 0 CHECK (human_decision_required IN (0, 1)),
    current_status TEXT NOT NULL DEFAULT 'active' CHECK (current_status IN ('active', 'retired')),
    revision INTEGER NOT NULL DEFAULT 1,
    support_valid_after_seq INTEGER NOT NULL DEFAULT 0
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
CREATE TABLE goal_event_trusted_decisions (
    decision_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind = 'user'),
    authority_source TEXT NOT NULL CHECK (authority_source IN ('web', 'management')),
    conversation_ref TEXT NOT NULL,
    message_ref TEXT NOT NULL,
    request_id TEXT,
    selected_option_id TEXT,
    conclusion TEXT NOT NULL,
    accepts_requirements INTEGER NOT NULL CHECK (accepts_requirements IN (0, 1)),
    scope_json TEXT NOT NULL,
    change_json TEXT,
    recorded_at TEXT NOT NULL
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
CREATE TABLE goal_tree_proposal_decisions (
    decision_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    proposal_id TEXT NOT NULL REFERENCES goal_tree_proposals(proposal_id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES goal_tree_proposal_items(item_id) ON DELETE CASCADE,
    decision TEXT NOT NULL CHECK (decision IN ('confirmed', 'rejected', 'revised', 'conflict')),
    actor_id TEXT NOT NULL,
    authority_source TEXT NOT NULL CHECK (authority_source IN ('runtime_dialogue', 'web', 'management')),
    runtime_actor_id TEXT,
    conversation_ref TEXT NOT NULL,
    message_ref TEXT NOT NULL,
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
CREATE TABLE goal_work_event_judgments (
    event_id TEXT NOT NULL REFERENCES goal_work_events(event_id) ON DELETE CASCADE,
    requirement_id TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('supports', 'contradicts', 'unknown')),
    PRIMARY KEY (event_id, requirement_id)
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
CREATE TABLE inbox_entries (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      owner_plugin_id TEXT,
      subject_type TEXT NOT NULL CHECK (subject_type IN ('feed_item', 'goal_decision', 'source_fault')),
      subject_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('manual', 'source_rule', 'goal_decision', 'source_fault', 'artifact_out_failed')),
      status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'dismissed')),
      detail_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      PRIMARY KEY (project_id, entry_id)
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
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE planning_method_packs (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    method_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    pack_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, method_id)
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
CREATE TABLE policy_bindings (
    policy_binding_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT REFERENCES goals(goal_id),
    scope TEXT NOT NULL CHECK (scope IN ('project_default', 'ancestor_minimum', 'goal')),
    policy_json TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active', 'replaced', 'withdrawn')),
    created_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
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
CREATE TABLE project_browsing_settings (
    project_id TEXT PRIMARY KEY, workspace_id TEXT
  );
CREATE TABLE project_guidance_entries (
    guidance_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
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
CREATE TABLE project_guidance_revisions (
    revision_id TEXT PRIMARY KEY,
    guidance_id TEXT NOT NULL REFERENCES project_guidance_entries(guidance_id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
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
CREATE TABLE project_root (
      project_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
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
      updated_at TEXT NOT NULL
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
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_fc44281fa4e6ae1ad919f15bea63_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_dd6dd4054975ce4abcd1e12268d3_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_21391483cd8d8dcc743c2ecd02ca_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_21391483cd8d8dcc743c2ecd02ca_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_21391483cd8d8dcc743c2ecd02ca_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_21391483cd8d8dcc743c2ecd02ca_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_21391483cd8d8dcc743c2ecd02ca_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_21391483cd8d8dcc743c2ecd02ca_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_21391483cd8d8dcc743c2ecd02ca_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_21391483cd8d8dcc743c2ecd02ca_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_522a4260e0bcbee35d4d9f85406c_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_daec9cf494e58d382d6262de3af9_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('V1-C1','V1','第一次使用的人能从首屏看懂目标、下一步和阻塞','inspection','首次使用者无需阅读协议即可正确复述',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('PLATFORM-C1','PLATFORM','不同 Runtime 读取到一致的 Goal 状态与完成依据','automated_check','跨入口一致性测试通过',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('WORKSPACE-C1','WORKSPACE','用户不切窗口即可从 Goal 进入对应 Runtime','inspection','桌面主工作流可完成并保持 Goal 绑定',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('ADOPTION-C1','ADOPTION','首次用户能独立完成一次从安装到推进的闭环','inspection','首次使用走查无阻断步骤',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('CORE-C1','CORE','工作从开始到证据和复核形成完整记录','automated_check','生命周期自动化测试通过',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('INTERFACES-C1','INTERFACES','不同入口读取到一致的可做工作和占用状态','automated_check','跨入口自动化测试通过',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('WEB-C1','WEB','桌面和移动端关键信息清楚可用','inspection','视觉、响应式和可访问性 QA 通过',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('GRAPH-C1','GRAPH','复杂网络中的关系方向和阻塞节点可以直接辨认','inspection','12 Goal 演示网络在桌面宽度下可读',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('DESKTOP-C1','DESKTOP','桌面端三栏在宽屏下形成完整工作闭环','inspection','Goal 选择、Focus 与 Runtime 归属保持同步',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('RELEASE-C1','RELEASE','安装、接入和重启提示可以按公开步骤重复完成','automated_check','全新安装端到端验证通过',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('ONBOARDING-C1','ONBOARDING','首次用户无需外部讲解即可推进第一条 Goal','inspection','首次体验测试完成一条可执行 Goal',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('DOCS-C1','DOCS','README 清楚表达痛点、边界、闭环与多种使用方式','inspection','目标用户能准确复述产品独特机制',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('AUTO-CONNECT-C1','AUTO-CONNECT','新对话无需确认就进入历史项目','inspection','进入历史目录后直接显示最近项目',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('OLD-HUMAN-C1','OLD-HUMAN','用户亲自核对付款体验','human_decision','用户亲自核对付款体验',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('OLD-POLICY-C1','OLD-POLICY','实际付款成功','inspection','实际付款成功',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('OLD-RISK-C1','OLD-RISK','结果可以打开','inspection','结果可以打开',NULL,'[]');
INSERT INTO "acceptance_criteria" ("criterion_id","goal_id","statement","decision_method","pass_condition","target_json","required_evidence_json") VALUES ('MIXED-C1','MIXED-OWNER','结果确实可读','inspection','打开实际结果',NULL,'[]');
INSERT INTO "artifacts_replica_state" ("id","device","cursor","applying") VALUES (1,'af2999d2063e267807ff2b93c5068e72',0,0);
INSERT INTO "boards" ("project_id","active_goal_id","created_at","updated_at") VALUES ('goalboard-v1-demo','V1','2026-09-10T07:03:28.489Z','2026-09-10T07:03:28.555Z');
INSERT INTO "builder_replica_state" ("id","device","cursor","applying") VALUES (1,'244b18dc6d80ad2c1826e94332276d77',0,0);
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (1,'4005bba2-9fb1-4282-af2b-25b83e4ee59d','goalboard-v1-demo','demo-user','board.created','board','goalboard-v1-demo','创建 Molis Work 真相源','{"title":"让第一次使用 Molis Work 的人顺利完成一次目标协作"}','2026-09-10T07:03:28.489Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (2,'1e0548b8-3bc3-49ef-9352-8d2055cdae7d','goalboard-v1-demo','demo-user','goal.created','goal','V1','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_compound"}','2026-09-10T07:03:28.489Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (3,'a89a26dd-4a84-43cd-910e-39c2c41284e4','goalboard-v1-demo','demo-user','goal.created','goal','PLATFORM','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_compound"}','2026-09-10T07:03:28.490Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (4,'5b17734a-9a8d-41f6-8aa4-5347bee2c9ea','goalboard-v1-demo','demo-user','goal.created','goal','WORKSPACE','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_compound"}','2026-09-10T07:03:28.504Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (5,'834e4eff-f474-4a2c-b261-c08d4414f645','goalboard-v1-demo','demo-user','goal.created','goal','ADOPTION','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_compound"}','2026-09-10T07:03:28.505Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (6,'4be81538-8e7a-4b88-850d-dde451f86da3','goalboard-v1-demo','demo-user','goal.created','goal','CORE','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.505Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (7,'d1650f9d-9fb8-462e-ac0e-000f40978de6','goalboard-v1-demo','demo-user','goal.created','goal','INTERFACES','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.506Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (8,'7e46eaab-f9e7-40ec-8293-6b34768a3722','goalboard-v1-demo','demo-user','goal.created','goal','WEB','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.507Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (9,'3c6de0df-0efd-42f0-a9da-7f5db8c9833a','goalboard-v1-demo','demo-user','goal.created','goal','GRAPH','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.507Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (10,'20d383ec-4973-4446-a4f7-5c909901f30e','goalboard-v1-demo','demo-user','goal.created','goal','DESKTOP','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.507Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (11,'c4bee7cd-6369-4a05-8144-84a382442999','goalboard-v1-demo','demo-user','goal.created','goal','RELEASE','创建新 Goal','{"definition_state":"draft","decomposition_state":"abstract"}','2026-09-10T07:03:28.508Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (12,'adab0c96-d84f-40df-a154-d9716e5f9534','goalboard-v1-demo','demo-user','goal.created','goal','ONBOARDING','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.508Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (13,'c066123d-8bb0-4bc7-b55f-07a014a262f4','goalboard-v1-demo','demo-user','goal.created','goal','DOCS','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.509Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (14,'c30d9bae-6b25-4911-82c6-1d6875fb80f6','goalboard-v1-demo','demo-user','goal.created','goal','AUTO-CONNECT','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.509Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (15,'0e3b4c7f-3fa4-4eeb-b361-1d26779657b1','goalboard-v1-demo','demo-user','relation.added','relation','relation-46303826-25b2-4b8e-ad5e-b76617d90fc9','共同组成第一次完整的 Molis Work 使用体验','{"from_goal_id":"PLATFORM","to_goal_id":"V1","type":"part_of","reason":"共同组成第一次完整的 Molis Work 使用体验"}','2026-09-10T07:03:28.510Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (16,'a8f67517-1803-41b7-b450-18b9353870d1','goalboard-v1-demo','demo-user','relation.added','relation','relation-d0cedc75-3cc4-4977-a253-247efa2b82fb','共同组成第一次完整的 Molis Work 使用体验','{"from_goal_id":"WORKSPACE","to_goal_id":"V1","type":"part_of","reason":"共同组成第一次完整的 Molis Work 使用体验"}','2026-09-10T07:03:28.512Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (17,'f6f131ad-8701-4d9e-80d0-83ef4a9b3ea3','goalboard-v1-demo','demo-user','relation.added','relation','relation-4814cf00-c15c-4d86-b625-15f7c60df9b7','共同组成第一次完整的 Molis Work 使用体验','{"from_goal_id":"ADOPTION","to_goal_id":"V1","type":"part_of","reason":"共同组成第一次完整的 Molis Work 使用体验"}','2026-09-10T07:03:28.513Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (18,'66f71884-9649-4d38-b006-7619fbbba895','goalboard-v1-demo','demo-user','relation.added','relation','relation-9410d190-8f63-466a-8797-14efb68c326d','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"CORE","to_goal_id":"PLATFORM","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.514Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (19,'288f4dc5-7b96-410b-9188-c89423c8e4e9','goalboard-v1-demo','demo-user','relation.added','relation','relation-e744e983-eef6-4ea8-ad99-96cd1b73b248','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"INTERFACES","to_goal_id":"PLATFORM","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.515Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (20,'ced3ad73-a66d-4c60-9f09-450aa42014b8','goalboard-v1-demo','demo-user','relation.added','relation','relation-8217b2ac-8515-4f15-82de-c772e6c97a23','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"WEB","to_goal_id":"WORKSPACE","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.524Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (21,'3d45ee25-eb78-48b2-b880-7eb6cb092b3f','goalboard-v1-demo','demo-user','relation.added','relation','relation-730b96da-261b-4736-9788-7f8f89edcf64','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"GRAPH","to_goal_id":"WORKSPACE","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.525Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (22,'64520514-3c85-4d42-879e-57ff5dcb72e7','goalboard-v1-demo','demo-user','relation.added','relation','relation-f5af7868-c03c-4486-975b-01f92da14355','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"DESKTOP","to_goal_id":"WORKSPACE","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.526Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (23,'1a594912-70e4-475c-8f3f-0ac467667030','goalboard-v1-demo','demo-user','relation.added','relation','relation-ecd7a888-4fdb-4ff5-8aeb-22b195aa8a45','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"RELEASE","to_goal_id":"ADOPTION","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.527Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (24,'98bb304c-9ce3-46f6-976b-2c61706c296c','goalboard-v1-demo','demo-user','relation.added','relation','relation-e62c0749-b7fe-4bd9-9669-e0063c9b289d','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"ONBOARDING","to_goal_id":"ADOPTION","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.527Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (25,'d4a784b3-2739-4398-a11f-0ad8a6cbd2a4','goalboard-v1-demo','demo-user','relation.added','relation','relation-fd86817a-3c4e-41b0-8311-a2c55b7daaed','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"DOCS","to_goal_id":"ADOPTION","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.528Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (26,'4927695b-c0b0-4bd0-ae0d-bb73508db30d','goalboard-v1-demo','demo-user','relation.added','relation','relation-3db70bd7-947c-44d4-b92f-7c794331177d','共享项目进度前，必须先保证每项工作的状态和完成依据可靠','{"from_goal_id":"INTERFACES","to_goal_id":"CORE","type":"depends_on","reason":"共享项目进度前，必须先保证每项工作的状态和完成依据可靠"}','2026-09-10T07:03:28.528Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (27,'c740eeef-9c17-40b5-b155-29247d33fe12','goalboard-v1-demo','demo-user','relation.added','relation','relation-a2944b01-48f2-43a4-8215-bb3d5165fec8','页面显示必须和不同 Runtime 看到的项目进度一致','{"from_goal_id":"WEB","to_goal_id":"INTERFACES","type":"depends_on","reason":"页面显示必须和不同 Runtime 看到的项目进度一致"}','2026-09-10T07:03:28.529Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (28,'c8a5255c-fbb0-4458-b080-92df8a2dfef0','goalboard-v1-demo','demo-user','relation.added','relation','relation-6b87504f-8ad9-49a9-acc4-4d75f39eea1d','关系图必须读取不同 Runtime 共享的同一份 Goal 关系事实','{"from_goal_id":"GRAPH","to_goal_id":"INTERFACES","type":"depends_on","reason":"关系图必须读取不同 Runtime 共享的同一份 Goal 关系事实"}','2026-09-10T07:03:28.529Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (29,'d2c9656b-feb2-4ab1-aaf3-e1dbec8dfd1d','goalboard-v1-demo','demo-user','relation.added','relation','relation-5e6401d7-b1dc-4a94-8c53-f04539921f6a','桌面工作站必须先建立可靠的 Goal 状态与完成依据','{"from_goal_id":"DESKTOP","to_goal_id":"CORE","type":"depends_on","reason":"桌面工作站必须先建立可靠的 Goal 状态与完成依据"}','2026-09-10T07:03:28.530Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (30,'350f3de8-5eab-49f0-a7fd-b32c4a36fe94','goalboard-v1-demo','demo-user','relation.added','relation','relation-341fe1f6-94a5-4b9d-96d8-1481878e7570','首次体验需要建立在可重复的安装与接入路径上','{"from_goal_id":"ONBOARDING","to_goal_id":"RELEASE","type":"depends_on","reason":"首次体验需要建立在可重复的安装与接入路径上"}','2026-09-10T07:03:28.530Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (31,'f5dcb3fd-64d7-43fc-8ec6-7463b65de061','goalboard-v1-demo','demo-user','relation.added','relation','relation-26184b19-74b6-4509-a239-b2c3d9ef3b67','README 的演示必须来自已经走通的首次体验','{"from_goal_id":"DOCS","to_goal_id":"ONBOARDING","type":"depends_on","reason":"README 的演示必须来自已经走通的首次体验"}','2026-09-10T07:03:28.530Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (33,'123a51e2-5d73-4cfc-ba4f-2fe994fb5d2d','goalboard-v1-demo','demo-user','goal.trashed','goal','AUTO-CONNECT','这会替用户猜项目；当前方案只展示历史候选，并再次询问用户','{"trash_record_id":"trash-c5c4a4b4-7cc5-45b5-94a4-dcd93556680b","deactivated_relation_ids":[],"active_goal_cleared":false}','2026-09-10T07:03:28.538Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (44,'0a7bbc6e-88f6-4a94-87c7-944be0ff82e4','goalboard-v1-demo','migration-user','goal.created','goal','OLD-HUMAN','创建新 Goal','{"definition_state":"draft","decomposition_state":"abstract"}','2026-09-10T07:03:28.560Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (45,'488bf575-5e66-484a-a26f-163e0097098a','goalboard-v1-demo','migration-user','goal.created','goal','OLD-POLICY','创建新 Goal','{"definition_state":"draft","decomposition_state":"abstract"}','2026-09-10T07:03:28.560Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (46,'7c1558b1-e478-47b3-9f27-0c1954fc8a6d','goalboard-v1-demo','migration-user','goal.created','goal','OLD-RISK','创建新 Goal','{"definition_state":"draft","decomposition_state":"abstract"}','2026-09-10T07:03:28.561Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (47,'2abf18de-a998-4a91-9bbc-d922db58334c','goalboard-v1-demo','mixed-user','goal.created','goal','MIXED-OWNER','创建新 Goal','{"definition_state":"draft","decomposition_state":"abstract"}','2026-09-10T07:29:38.098Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (48,'gevt-a47aa75e-722e-41ac-8896-e59373c12681','goalboard-v1-demo','mixed-runtime','goal.event_config.updated','goal_event_config','MIXED-OWNER','登记 Goal 局部事件配置','{"config_version":1,"types":[{"type_id":"check","version":1,"name":"实际核对","purpose":"保留真实支持","source":{"kind":"local","label":"当前 Goal 局部定义"},"fields":[{"field_id":"result","name":"结果","purpose":"核对结果","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[],"adopted_planning":[]}','2026-09-10T07:29:38.102Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (49,'gevt-75b666e9-56d7-4929-b6d0-7474b5937be3','goalboard-v1-demo','mixed-runtime','goal.work_event.recorded','goal_work_event','gevt-75b666e9-56d7-4929-b6d0-7474b5937be3','结果核对','{"type_id":"check","type_version":1,"fields":{"result":"真实结果可以打开"},"judgments":[{"requirement_id":"MIXED-C1","verdict":"supports"}]}','2026-09-10T07:29:38.103Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (50,'0fc8c18e-4b3e-4606-8896-c093be12c247','goalboard-v1-demo','mixed-user','policy.added_from_tree_proposal','policy','mixed-project-human','本项目完成必须由用户验收','{"proposal_item_id":"old-policy-decision","goal_id":null,"scope":"project_default","replaced_binding_ids":[]}','2026-09-10T07:29:38.105Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (51,'gevt-c3a48804-b9f3-4b0f-9a75-2393f0881092','goalboard-v1-demo','existing-user','goal.event_state.user_decision','goal_work_event','gevt-c3a48804-b9f3-4b0f-9a75-2393f0881092','记录用户决定','{"operation":"user_decision","decision_id":"gdec-83564492-8f53-45d4-9c70-7cd39039fc2a","governance_decision_id":"gedec-fe7294b3-8446-424e-9418-2932bb8027d9","request_id":null,"selected_option_id":null,"conclusion":"我已经核对本 Goal 的当前交付，同意满足人工验收责任；剩余输入遗漏修复后可以完成","accepts_requirements":false,"effects":[{"kind":"authorize_action","action":"complete"}],"scope":{"requirement_ids":[],"event_ids":[],"concern_ids":[],"action":"complete"},"authorized_change":null,"config_version":1,"agreement_version":1}','2026-09-10T08:08:53.175Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (52,'gevt-fff26575-8687-4006-bc0a-652b335c236f','goalboard-v1-demo','existing-runtime','goal.event_state.closure_submitted','goal_work_event','gevt-fff26575-8687-4006-bc0a-652b335c236f','显式完成当前 Goal','{"operation":"closure_submitted","kind":"complete","result":"实际结果可读","reason":"保留真实人工批准，核对剩余风险","completion_applied":true,"unmet_reasons":[],"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1}','2026-09-10T08:08:53.178Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (54,'gevt-5965c521-f7b9-481e-80c8-e51c6a319e69','goalboard-v1-demo','migration:36','goal.event_state.concern_opened','goal_work_event','gevt-5965c521-f7b9-481e-80c8-e51c6a319e69','迁入完成阻塞：共享输入记录仍有遗漏','{"operation":"concern_opened","concern_id":"imported-risk:MIXED-OWNER:mixed-shared-risk","title":"共享输入记录仍有遗漏","statement":"共享输入记录仍有遗漏；缺失记录全部补齐","scope":{"requirement_ids":[],"event_ids":[],"concern_ids":[],"action":"complete"},"blocks_closure":true}','2026-10-04T20:13:22.300Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (55,'gevt-ea40aa5e-b9de-4fc5-84d9-1e2e837968f7','goalboard-v1-demo','migration:36','goal.event_state.concern_opened','goal_work_event','gevt-ea40aa5e-b9de-4fc5-84d9-1e2e837968f7','迁入完成阻塞：共享输入记录仍有遗漏','{"operation":"concern_opened","concern_id":"imported-risk:OLD-HUMAN:mixed-shared-risk","title":"共享输入记录仍有遗漏","statement":"共享输入记录仍有遗漏；缺失记录全部补齐","scope":{"requirement_ids":[],"event_ids":[],"concern_ids":[],"action":"complete"},"blocks_closure":true}','2026-10-04T20:13:22.300Z');
INSERT INTO "events" ("seq","event_id","project_id","actor_id","type","object_type","object_id","reason","payload_json","at") VALUES (56,'gevt-fca3466a-5e03-4f25-ac8b-a3ff3948e9b5','goalboard-v1-demo','migration:36','goal.event_state.concern_opened','goal_work_event','gevt-fca3466a-5e03-4f25-ac8b-a3ff3948e9b5','迁入完成阻塞：付款记录存在遗漏，结果未确认','{"operation":"concern_opened","concern_id":"imported-risk:OLD-RISK:legacy-completion-risk","title":"付款记录存在遗漏，结果未确认","statement":"付款记录存在遗漏，结果未确认；全部付款记录可读取","scope":{"requirement_ids":[],"event_ids":[],"concern_ids":[],"action":"complete"},"blocks_closure":true}','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','MIXED-OWNER',1,'真实结果继续有效','mixed-runtime','2026-09-10T07:29:38.102Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','ADOPTION',1,'新用户从 README、安装和首次打开一路走到推进第一条 Goal','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','AUTO-CONNECT',1,'新对话少做一次项目确认','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','CORE',1,'用户能看到一项工作何时开始、做出了什么，以及为什么可以算完成','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','DESKTOP',1,'用户在桌面端同时看到 Goal、下一步、完成要求和强绑定的 Runtime','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','DOCS',1,'用户先理解长程任务为何会跑偏，再看到 Molis Work 的闭环、桌面端和 Runtime 伴随方式','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','GRAPH',1,'父子层级、前置依赖和当前焦点在复杂网络中仍有清楚的方向与落点','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','INTERFACES',1,'用户换一个 Runtime 或新开对话后，仍能找到同一个项目的目标、进度和未完成工作','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','OLD-HUMAN',1,'用户亲自核对付款体验','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','OLD-POLICY',1,'实际付款成功','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','OLD-RISK',1,'结果可以打开','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','ONBOARDING',1,'用户首次进入后能选择项目、找到可做 Goal，并理解 Runtime 为什么绑定到它','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','PLATFORM',1,'不同 AI、会话和工具读取同一份 Goal、关系、决定、进度与完成依据','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','RELEASE',1,'用户完成安装后知道如何启动页面、连接正在使用的 Runtime，以及为什么需要新开会话','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','V1',1,'用户能把一个模糊想法变成清楚的目标树，并知道下一步、阻塞和完成依据','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','WEB',1,'用户不用理解内部协议，也能看出项目要解决什么、当前进展、谁该做什么和为什么被阻塞','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_agreements" ("project_id","goal_id","version","outcome","actor_id","created_at","event_id") VALUES ('goalboard-v1-demo','WORKSPACE',1,'用户在一个窗口里查看 Goal Tree、Focus、Graph 和 Goal-bound Runtime','migration:36','2026-10-04T20:13:22.300Z','');
INSERT INTO "goal_event_applied_decisions" ("decision_id","project_id","goal_id","governance_decision_id","request_id","event_id","selected_option_id","conclusion","accepts_requirements","effects_json","scope_json","commitment_json","authorized_change_json","config_version","agreement_version","actor_id","authority_source","recorded_at") VALUES ('gdec-83564492-8f53-45d4-9c70-7cd39039fc2a','goalboard-v1-demo','MIXED-OWNER','gedec-fe7294b3-8446-424e-9418-2932bb8027d9',NULL,'gevt-c3a48804-b9f3-4b0f-9a75-2393f0881092',NULL,'我已经核对本 Goal 的当前交付，同意满足人工验收责任；剩余输入遗漏修复后可以完成',0,'[{"kind":"authorize_action","action":"complete"}]','{"requirement_ids":[],"event_ids":[],"concern_ids":[],"action":"complete"}','{"outcome":"真实结果继续有效","requirements":[{"requirement_id":"MIXED-C1","statement":"结果确实可读","human_decision_required":false,"bound_type_ids":[]},{"requirement_id":"imported-policy:MIXED-OWNER","statement":"本项目完成必须由用户验收","human_decision_required":true,"bound_type_ids":[]}]}',NULL,1,1,'existing-user','web','2026-09-10T08:08:53.175Z');
INSERT INTO "goal_event_closures" ("closure_id","project_id","goal_id","event_id","kind","result","reason","completion_applied","expected_config_version","expected_agreement_version","config_version","agreement_version","unmet_reasons_json","superseded","superseded_reason","recorded_at") VALUES ('gclo-f5c0d3db-95a0-444f-978e-17060d3f6ab8','goalboard-v1-demo','MIXED-OWNER','gevt-fff26575-8687-4006-bc0a-652b335c236f','complete','实际结果可读','保留真实人工批准，核对剩余风险',1,1,1,1,1,'[]',0,NULL,'2026-09-10T08:08:53.178Z');
INSERT INTO "goal_event_concerns" ("concern_id","project_id","goal_id","event_id","title","statement","scope_json","blocks_closure","status","resolution_reason","resolution_event_id","cited_decision_id","previous_status","created_at","updated_at") VALUES ('imported-risk:MIXED-OWNER:mixed-shared-risk','goalboard-v1-demo','MIXED-OWNER','gevt-5965c521-f7b9-481e-80c8-e51c6a319e69','共享输入记录仍有遗漏','共享输入记录仍有遗漏；缺失记录全部补齐','{"requirement_ids":[],"event_ids":[],"concern_ids":[],"action":"complete"}',1,'open',NULL,NULL,NULL,NULL,'2026-10-04T20:13:22.300Z','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_concerns" ("concern_id","project_id","goal_id","event_id","title","statement","scope_json","blocks_closure","status","resolution_reason","resolution_event_id","cited_decision_id","previous_status","created_at","updated_at") VALUES ('imported-risk:OLD-HUMAN:mixed-shared-risk','goalboard-v1-demo','OLD-HUMAN','gevt-ea40aa5e-b9de-4fc5-84d9-1e2e837968f7','共享输入记录仍有遗漏','共享输入记录仍有遗漏；缺失记录全部补齐','{"requirement_ids":[],"event_ids":[],"concern_ids":[],"action":"complete"}',1,'open',NULL,NULL,NULL,NULL,'2026-10-04T20:13:22.300Z','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_concerns" ("concern_id","project_id","goal_id","event_id","title","statement","scope_json","blocks_closure","status","resolution_reason","resolution_event_id","cited_decision_id","previous_status","created_at","updated_at") VALUES ('imported-risk:OLD-RISK:legacy-completion-risk','goalboard-v1-demo','OLD-RISK','gevt-fca3466a-5e03-4f25-ac8b-a3ff3948e9b5','付款记录存在遗漏，结果未确认','付款记录存在遗漏，结果未确认；全部付款记录可读取','{"requirement_ids":[],"event_ids":[],"concern_ids":[],"action":"complete"}',1,'open',NULL,NULL,NULL,NULL,'2026-10-04T20:13:22.300Z','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_config_versions" ("project_id","goal_id","version","actor_id","adopted_planning_json","created_at","config_event_id") VALUES ('goalboard-v1-demo','MIXED-OWNER',1,'mixed-runtime','[]','2026-09-10T07:29:38.102Z','gevt-a47aa75e-722e-41ac-8896-e59373c12681');
INSERT INTO "goal_event_configs" ("project_id","goal_id","current_version","updated_at","updated_by") VALUES ('goalboard-v1-demo','MIXED-OWNER',1,'2026-09-10T07:29:38.102Z','mixed-runtime');
INSERT INTO "goal_event_requirement_conclusions" ("project_id","goal_id","requirement_id","decision_id","actor_id","verdict","received_at","journal_seq") VALUES ('goalboard-v1-demo','MIXED-OWNER','imported-policy:MIXED-OWNER','gdec-83564492-8f53-45d4-9c70-7cd39039fc2a','existing-user','accepted','2026-09-10T08:08:53.175Z',51);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('ADOPTION-C1','goalboard-v1-demo','ADOPTION','首次用户能独立完成一次从安装到推进的闭环',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"inspection","pass_condition":"首次使用走查无阻断步骤"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:ADOPTION','goalboard-v1-demo','ADOPTION','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('AUTO-CONNECT-C1','goalboard-v1-demo','AUTO-CONNECT','新对话无需确认就进入历史项目',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"inspection","pass_condition":"进入历史目录后直接显示最近项目"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:AUTO-CONNECT','goalboard-v1-demo','AUTO-CONNECT','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('CORE-C1','goalboard-v1-demo','CORE','工作从开始到证据和复核形成完整记录',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"automated_check","pass_condition":"生命周期自动化测试通过"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:CORE','goalboard-v1-demo','CORE','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('DESKTOP-C1','goalboard-v1-demo','DESKTOP','桌面端三栏在宽屏下形成完整工作闭环',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"inspection","pass_condition":"Goal 选择、Focus 与 Runtime 归属保持同步"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:DESKTOP','goalboard-v1-demo','DESKTOP','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('DOCS-C1','goalboard-v1-demo','DOCS','README 清楚表达痛点、边界、闭环与多种使用方式',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"inspection","pass_condition":"目标用户能准确复述产品独特机制"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:DOCS','goalboard-v1-demo','DOCS','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('GRAPH-C1','goalboard-v1-demo','GRAPH','复杂网络中的关系方向和阻塞节点可以直接辨认',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"inspection","pass_condition":"12 Goal 演示网络在桌面宽度下可读"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:GRAPH','goalboard-v1-demo','GRAPH','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('INTERFACES-C1','goalboard-v1-demo','INTERFACES','不同入口读取到一致的可做工作和占用状态',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"automated_check","pass_condition":"跨入口自动化测试通过"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:INTERFACES','goalboard-v1-demo','INTERFACES','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('MIXED-C1','goalboard-v1-demo','MIXED-OWNER','结果确实可读',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"inspection","pass_condition":"打开实际结果"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:MIXED-OWNER','goalboard-v1-demo','MIXED-OWNER','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('OLD-HUMAN-C1','goalboard-v1-demo','OLD-HUMAN','用户亲自核对付款体验',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"human_decision","pass_condition":"用户亲自核对付款体验"}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:OLD-HUMAN','goalboard-v1-demo','OLD-HUMAN','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('OLD-POLICY-C1','goalboard-v1-demo','OLD-POLICY','实际付款成功',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"inspection","pass_condition":"实际付款成功"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:OLD-POLICY','goalboard-v1-demo','OLD-POLICY','用户明确要求完成前亲自验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human","legacy-explicit-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('OLD-RISK-C1','goalboard-v1-demo','OLD-RISK','结果可以打开',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"inspection","pass_condition":"结果可以打开"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:OLD-RISK','goalboard-v1-demo','OLD-RISK','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('ONBOARDING-C1','goalboard-v1-demo','ONBOARDING','首次用户无需外部讲解即可推进第一条 Goal',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"inspection","pass_condition":"首次体验测试完成一条可执行 Goal"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:ONBOARDING','goalboard-v1-demo','ONBOARDING','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('PLATFORM-C1','goalboard-v1-demo','PLATFORM','不同 Runtime 读取到一致的 Goal 状态与完成依据',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"automated_check","pass_condition":"跨入口一致性测试通过"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:PLATFORM','goalboard-v1-demo','PLATFORM','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('RELEASE-C1','goalboard-v1-demo','RELEASE','安装、接入和重启提示可以按公开步骤重复完成',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"automated_check","pass_condition":"全新安装端到端验证通过"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:RELEASE','goalboard-v1-demo','RELEASE','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('V1-C1','goalboard-v1-demo','V1','第一次使用的人能从首屏看懂目标、下一步和阻塞',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"inspection","pass_condition":"首次使用者无需阅读协议即可正确复述"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:V1','goalboard-v1-demo','V1','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('WEB-C1','goalboard-v1-demo','WEB','桌面和移动端关键信息清楚可用',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"inspection","pass_condition":"视觉、响应式和可访问性 QA 通过"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:WEB','goalboard-v1-demo','WEB','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('WORKSPACE-C1','goalboard-v1-demo','WORKSPACE','用户不切窗口即可从 Goal 进入对应 Runtime',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_acceptance_criterion","decision_method":"inspection","pass_condition":"桌面主工作流可完成并保持 Goal 绑定"}',0,'active',1,0);
INSERT INTO "goal_event_requirements" ("requirement_id","project_id","goal_id","statement","bound_type_id","created_at","created_in_config_version","actor_id","source_json","human_decision_required","current_status","revision","support_valid_after_seq") VALUES ('imported-policy:WORKSPACE','goalboard-v1-demo','WORKSPACE','本项目完成必须由用户验收',NULL,'2026-10-04T20:13:22.300Z',0,'migration:36','{"kind":"imported_human_approval","policy_binding_ids":["mixed-project-human"]}',1,'active',1,0);
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','MIXED-OWNER','event_work','configuration','2026-09-10T07:29:38.102Z','mixed-runtime');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','ADOPTION','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','AUTO-CONNECT','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','CORE','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','DESKTOP','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','DOCS','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','GRAPH','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','INTERFACES','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','OLD-HUMAN','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','OLD-POLICY','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','OLD-RISK','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','ONBOARDING','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','PLATFORM','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','RELEASE','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','V1','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','WEB','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_state_owners" ("project_id","goal_id","owner","source","adopted_at","adopted_by") VALUES ('goalboard-v1-demo','WORKSPACE','event_work','intent','2026-10-04T20:13:22.300Z','migration:36');
INSERT INTO "goal_event_trusted_decisions" ("decision_id","project_id","goal_id","actor_id","actor_kind","authority_source","conversation_ref","message_ref","request_id","selected_option_id","conclusion","accepts_requirements","scope_json","change_json","recorded_at") VALUES ('gedec-fe7294b3-8446-424e-9418-2932bb8027d9','goalboard-v1-demo','MIXED-OWNER','existing-user','user','web','web:goalboard-v1-demo','web-event-decision:approved-policy-before-migration',NULL,NULL,'我已经核对本 Goal 的当前交付，同意满足人工验收责任；剩余输入遗漏修复后可以完成',0,'{"requirement_ids":[],"event_ids":[],"concern_ids":[],"action":"complete"}',NULL,'2026-09-10T08:08:53.172Z');
INSERT INTO "goal_event_types" ("project_id","goal_id","type_id","type_version","name","purpose","semantic_family","source_json","fields_json","created_at","created_in_config_version","actor_id") VALUES ('goalboard-v1-demo','MIXED-OWNER','check',1,'实际核对','保留真实支持',NULL,'{"kind":"local","label":"当前 Goal 局部定义"}','[{"field_id":"result","name":"结果","purpose":"核对结果","format":"text","required":true,"source":{"kind":"local"}}]','2026-09-10T07:29:38.102Z',1,'mixed-runtime');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','MIXED-OWNER','completed','2026-09-10T08:08:53.178Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','ADOPTION','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','AUTO-CONNECT','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','CORE','completed','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','DESKTOP','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','DOCS','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','GRAPH','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','INTERFACES','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','OLD-HUMAN','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','OLD-POLICY','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','OLD-RISK','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','ONBOARDING','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','PLATFORM','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','RELEASE','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','V1','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','WEB','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_event_work_status" ("project_id","goal_id","work_status","updated_at") VALUES ('goalboard-v1-demo','WORKSPACE','open','2026-10-04T20:13:22.300Z');
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-46303826-25b2-4b8e-ad5e-b76617d90fc9','goalboard-v1-demo','PLATFORM','V1','part_of','active','共同组成第一次完整的 Molis Work 使用体验','demo-user','2026-09-10T07:03:28.510Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-d0cedc75-3cc4-4977-a253-247efa2b82fb','goalboard-v1-demo','WORKSPACE','V1','part_of','active','共同组成第一次完整的 Molis Work 使用体验','demo-user','2026-09-10T07:03:28.512Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-4814cf00-c15c-4d86-b625-15f7c60df9b7','goalboard-v1-demo','ADOPTION','V1','part_of','active','共同组成第一次完整的 Molis Work 使用体验','demo-user','2026-09-10T07:03:28.513Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-9410d190-8f63-466a-8797-14efb68c326d','goalboard-v1-demo','CORE','PLATFORM','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.514Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-e744e983-eef6-4ea8-ad99-96cd1b73b248','goalboard-v1-demo','INTERFACES','PLATFORM','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.515Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-8217b2ac-8515-4f15-82de-c772e6c97a23','goalboard-v1-demo','WEB','WORKSPACE','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.524Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-730b96da-261b-4736-9788-7f8f89edcf64','goalboard-v1-demo','GRAPH','WORKSPACE','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.525Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-f5af7868-c03c-4486-975b-01f92da14355','goalboard-v1-demo','DESKTOP','WORKSPACE','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.526Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-ecd7a888-4fdb-4ff5-8aeb-22b195aa8a45','goalboard-v1-demo','RELEASE','ADOPTION','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.527Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-e62c0749-b7fe-4bd9-9669-e0063c9b289d','goalboard-v1-demo','ONBOARDING','ADOPTION','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.527Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-fd86817a-3c4e-41b0-8311-a2c55b7daaed','goalboard-v1-demo','DOCS','ADOPTION','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.528Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-3db70bd7-947c-44d4-b92f-7c794331177d','goalboard-v1-demo','INTERFACES','CORE','depends_on','active','共享项目进度前，必须先保证每项工作的状态和完成依据可靠','demo-user','2026-09-10T07:03:28.528Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-a2944b01-48f2-43a4-8215-bb3d5165fec8','goalboard-v1-demo','WEB','INTERFACES','depends_on','active','页面显示必须和不同 Runtime 看到的项目进度一致','demo-user','2026-09-10T07:03:28.529Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-6b87504f-8ad9-49a9-acc4-4d75f39eea1d','goalboard-v1-demo','GRAPH','INTERFACES','depends_on','active','关系图必须读取不同 Runtime 共享的同一份 Goal 关系事实','demo-user','2026-09-10T07:03:28.529Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-5e6401d7-b1dc-4a94-8c53-f04539921f6a','goalboard-v1-demo','DESKTOP','CORE','depends_on','active','桌面工作站必须先建立可靠的 Goal 状态与完成依据','demo-user','2026-09-10T07:03:28.530Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-341fe1f6-94a5-4b9d-96d8-1481878e7570','goalboard-v1-demo','ONBOARDING','RELEASE','depends_on','active','首次体验需要建立在可重复的安装与接入路径上','demo-user','2026-09-10T07:03:28.530Z',NULL);
INSERT INTO "goal_relations" ("relation_id","project_id","from_goal_id","to_goal_id","type","state","reason","created_by","created_at","deactivated_at") VALUES ('relation-26184b19-74b6-4509-a239-b2c3d9ef3b67','goalboard-v1-demo','DOCS','ONBOARDING','depends_on','active','README 的演示必须来自已经走通的首次体验','demo-user','2026-09-10T07:03:28.530Z',NULL);
INSERT INTO "goal_trash_records" ("trash_record_id","project_id","goal_id","trashed_at","trashed_by","trash_reason","restored_at","restored_by","restore_reason") VALUES ('trash-c5c4a4b4-7cc5-45b5-94a4-dcd93556680b','goalboard-v1-demo','AUTO-CONNECT','2026-09-10T07:03:28.538Z','demo-user','这会替用户猜项目；当前方案只展示历史候选，并再次询问用户',NULL,NULL,NULL);
INSERT INTO "goal_work_event_judgments" ("event_id","requirement_id","verdict") VALUES ('gevt-75b666e9-56d7-4929-b6d0-7474b5937be3','MIXED-C1','supports');
INSERT INTO "goal_work_events" ("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES ('gevt-a47aa75e-722e-41ac-8896-e59373c12681','goalboard-v1-demo','MIXED-OWNER','configuration',NULL,NULL,'新增记录方式：实际核对','{"config_version":1,"types":[{"type_id":"check","version":1,"name":"实际核对","purpose":"保留真实支持","source":{"kind":"local","label":"当前 Goal 局部定义"},"fields":[{"field_id":"result","name":"结果","purpose":"核对结果","format":"text","required":true,"source":{"kind":"local"}}]}],"extra_requirements":[],"requirement_bindings":[],"adopted_planning":[]}','mixed-runtime','runtime','2026-09-10T07:29:38.102Z',48,1);
INSERT INTO "goal_work_events" ("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES ('gevt-75b666e9-56d7-4929-b6d0-7474b5937be3','goalboard-v1-demo','MIXED-OWNER','report','check',1,'结果核对','{"result":"真实结果可以打开"}','mixed-runtime','runtime','2026-09-10T07:29:38.103Z',49,1);
INSERT INTO "goal_work_events" ("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES ('gevt-c3a48804-b9f3-4b0f-9a75-2393f0881092','goalboard-v1-demo','MIXED-OWNER','system',NULL,NULL,'记录用户决定','{"operation":"user_decision","decision_id":"gdec-83564492-8f53-45d4-9c70-7cd39039fc2a","governance_decision_id":"gedec-fe7294b3-8446-424e-9418-2932bb8027d9","request_id":null,"selected_option_id":null,"conclusion":"我已经核对本 Goal 的当前交付，同意满足人工验收责任；剩余输入遗漏修复后可以完成","accepts_requirements":false,"effects":[{"kind":"authorize_action","action":"complete"}],"scope":{"requirement_ids":[],"event_ids":[],"concern_ids":[],"action":"complete"},"authorized_change":null,"config_version":1,"agreement_version":1}','existing-user','user','2026-09-10T08:08:53.175Z',51,1);
INSERT INTO "goal_work_events" ("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES ('gevt-fff26575-8687-4006-bc0a-652b335c236f','goalboard-v1-demo','MIXED-OWNER','system',NULL,NULL,'显式完成当前 Goal','{"operation":"closure_submitted","kind":"complete","result":"实际结果可读","reason":"保留真实人工批准，核对剩余风险","completion_applied":true,"unmet_reasons":[],"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1}','existing-runtime','runtime','2026-09-10T08:08:53.178Z',52,1);
INSERT INTO "goal_work_events" ("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES ('gevt-5965c521-f7b9-481e-80c8-e51c6a319e69','goalboard-v1-demo','MIXED-OWNER','system',NULL,NULL,'迁入完成阻塞：共享输入记录仍有遗漏','{"operation":"concern_opened","concern_id":"imported-risk:MIXED-OWNER:mixed-shared-risk","title":"共享输入记录仍有遗漏","statement":"共享输入记录仍有遗漏；缺失记录全部补齐","scope":{"requirement_ids":[],"event_ids":[],"concern_ids":[],"action":"complete"},"blocks_closure":true}','migration:36',NULL,'2026-10-04T20:13:22.300Z',54,NULL);
INSERT INTO "goal_work_events" ("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES ('gevt-ea40aa5e-b9de-4fc5-84d9-1e2e837968f7','goalboard-v1-demo','OLD-HUMAN','system',NULL,NULL,'迁入完成阻塞：共享输入记录仍有遗漏','{"operation":"concern_opened","concern_id":"imported-risk:OLD-HUMAN:mixed-shared-risk","title":"共享输入记录仍有遗漏","statement":"共享输入记录仍有遗漏；缺失记录全部补齐","scope":{"requirement_ids":[],"event_ids":[],"concern_ids":[],"action":"complete"},"blocks_closure":true}','migration:36',NULL,'2026-10-04T20:13:22.300Z',55,NULL);
INSERT INTO "goal_work_events" ("event_id","project_id","goal_id","kind","type_id","type_version","title","payload_json","actor_id","actor_kind","received_at","journal_seq","config_version") VALUES ('gevt-fca3466a-5e03-4f25-ac8b-a3ff3948e9b5','goalboard-v1-demo','OLD-RISK','system',NULL,NULL,'迁入完成阻塞：付款记录存在遗漏，结果未确认','{"operation":"concern_opened","concern_id":"imported-risk:OLD-RISK:legacy-completion-risk","title":"付款记录存在遗漏，结果未确认","statement":"付款记录存在遗漏，结果未确认；全部付款记录可读取","scope":{"requirement_ids":[],"event_ids":[],"concern_ids":[],"action":"complete"},"blocks_closure":true}','migration:36',NULL,'2026-10-04T20:13:22.300Z',56,NULL);
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('V1','goalboard-v1-demo','让第一次使用的人顺利完成一轮目标协作','用户能把一个模糊想法变成清楚的目标树，并知道下一步、阻塞和完成依据','AI 对话结束后容易丢失目标、决定和进度，新用户尤其难判断该从哪里继续','用户先在当前对话说明想做什么，Runtime 通过提问整理目标并请用户确认；确认后，当前或后续 Runtime 从可做项中选择工作，提交结果和证据，Molis Work 持续保存共同进度。','[]','[]','[]','[]','[]',NULL,'accepted','closed_compound','valid','unmet',NULL,NULL,NULL,NULL,100,'demo-user','2026-09-10T07:03:28.489Z','2026-09-10T07:03:28.489Z','2026-09-10T07:03:28.489Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('PLATFORM','goalboard-v1-demo','让项目事实成为不同 Runtime 的共同底座','不同 AI、会话和工具读取同一份 Goal、关系、决定、进度与完成依据','长程任务最容易在切换对话和 Runtime 后失去共同上下文','Molis Work 保存项目事实；Runtime 只负责读取可做项、执行工作并提交结果，不在各自会话里维护另一套项目记忆。','[]','[]','[]','[]','[]',NULL,'accepted','closed_compound','valid','unmet',NULL,NULL,NULL,NULL,96,'demo-user','2026-09-10T07:03:28.490Z','2026-09-10T07:03:28.490Z','2026-09-10T07:03:28.490Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('WORKSPACE','goalboard-v1-demo','让人能在同一工作台看清并推进 Goal','用户在一个窗口里查看 Goal Tree、Focus、Graph 和 Goal-bound Runtime','频繁切换页面、终端和 AI 对话会打断判断，也让 Goal 与执行 Session 脱节','桌面端把 Goal 导航、当前工作和 Runtime 组合成连续工作面；网页保留同一份项目事实与独立访问方式。','[]','[]','[]','[]','[]',NULL,'accepted','closed_compound','valid','unmet',NULL,NULL,NULL,NULL,94,'demo-user','2026-09-10T07:03:28.504Z','2026-09-10T07:03:28.504Z','2026-09-10T07:03:28.504Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('ADOPTION','goalboard-v1-demo','让第一次接入从安装走到真实推进','新用户从 README、安装和首次打开一路走到推进第一条 Goal','只把程序装上不等于用户已经理解产品，更不等于完成第一次有效使用','公开文档先解释适用场景，再引导安装、连接 Runtime、选择项目并推进一条可执行 Goal。','[]','[]','[]','[]','[]',NULL,'accepted','closed_compound','valid','unmet',NULL,NULL,NULL,NULL,92,'demo-user','2026-09-10T07:03:28.505Z','2026-09-10T07:03:28.505Z','2026-09-10T07:03:28.505Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('CORE','goalboard-v1-demo','让每项工作都有可信的完成依据','用户能看到一项工作何时开始、做出了什么，以及为什么可以算完成','只有进度标签而没有结果、证据和复核，用户仍然无法相信工作真的完成了','Runtime 选择一项已经准备好的工作并标记开始；完成后提交对应验收条件的证据，必要复核通过后，这项工作才会显示为已完成。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','satisfied',NULL,NULL,NULL,NULL,90,'demo-user','2026-09-10T07:03:28.505Z','2026-09-10T07:03:28.505Z','2026-09-10T07:03:28.550Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('INTERFACES','goalboard-v1-demo','让不同 AI 对话看到同一项目进度','用户换一个 Runtime 或新开对话后，仍能找到同一个项目的目标、进度和未完成工作','如果每个入口各自记录状态，用户换一次对话就要重新解释整个项目','用户在当前对话明确选择项目后继续推进；其他 Runtime 也通过 Molis Work 读取和更新同一份项目事实，不会各自维护一套进度。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','unmet',NULL,NULL,NULL,NULL,80,'demo-user','2026-09-10T07:03:28.506Z','2026-09-10T07:03:28.506Z','2026-09-10T07:03:28.506Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('WEB','goalboard-v1-demo','让用户打开页面就看懂目标和下一步','用户不用理解内部协议，也能看出项目要解决什么、当前进展、谁该做什么和为什么被阻塞','底层规则正确并不代表产品容易理解；信息组织混乱会让用户放弃继续使用','用户打开项目后先看到目标树和当前目标，再按结果、完成标准、推进情况、风险和历史阅读；搜索、状态筛选和待决定事项都放在统一导航中。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','unmet',NULL,NULL,NULL,NULL,70,'demo-user','2026-09-10T07:03:28.507Z','2026-09-10T07:03:28.507Z','2026-09-10T07:03:28.507Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('GRAPH','goalboard-v1-demo','让复杂 Goal 关系仍然一眼可读','父子层级、前置依赖和当前焦点在复杂网络中仍有清楚的方向与落点','列表适合顺序浏览，但复杂 Goal 的多层结构和跨分支依赖会在列表里变得难以判断','用户在 List 与 Graph 之间切换；Graph 只读取真实父子和依赖关系，以节点、分区和有向连线呈现。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','unmet',NULL,NULL,NULL,NULL,76,'demo-user','2026-09-10T07:03:28.507Z','2026-09-10T07:03:28.507Z','2026-09-10T07:03:28.507Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('DESKTOP','goalboard-v1-demo','把 Molis Work 作为不切窗口的主工作站','用户在桌面端同时看到 Goal、下一步、完成要求和强绑定的 Runtime','工作在 AI 对话里推进、状态在另一个页面查看，会增加切换成本并削弱人的掌控感','桌面端复用网页事实和 Runtime 能力，将全局控制放进 TitleBar，并为 List、Focus 与 Runtime 保留连续三栏。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','unmet',NULL,NULL,NULL,NULL,74,'demo-user','2026-09-10T07:03:28.507Z','2026-09-10T07:03:28.507Z','2026-09-10T07:03:28.507Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('RELEASE','goalboard-v1-demo','让新用户安装后知道下一步怎么开始','用户完成安装后知道如何启动页面、连接正在使用的 Runtime，以及为什么需要新开会话','安装成功但不知道服务是否常驻、工具何时生效或下一步说什么，仍然会被理解成产品不可用','安装只放置 Molis Work 自己的程序，不偷偷修改项目或 Runtime；用户随后显式启用常驻服务、预览并确认 Runtime 接入，再在新会话中选择或创建项目开始使用。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,60,NULL,NULL,'2026-09-10T07:03:28.508Z','2026-09-10T07:03:28.508Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('ONBOARDING','goalboard-v1-demo','让用户第一次打开就完成有效操作','用户首次进入后能选择项目、找到可做 Goal，并理解 Runtime 为什么绑定到它','展示很多功能不等于用户知道第一步做什么，首屏需要直接引向一次有效推进','首次体验使用一份明确标记的 Mock 项目，沿着可做 Goal、下一步与 Runtime 归属完成一轮引导。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','unmet',NULL,NULL,NULL,NULL,58,'demo-user','2026-09-10T07:03:28.508Z','2026-09-10T07:03:28.508Z','2026-09-10T07:03:28.508Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('DOCS','goalboard-v1-demo','让用户从 README 进入正确的使用方式','用户先理解长程任务为何会跑偏，再看到 Molis Work 的闭环、桌面端和 Runtime 伴随方式','功能清单无法建立需求感，也无法解释 Molis Work 与 Agent Orchestration 的边界','README 用痛点、核心思路和完整演示组织内容；截图来自 Mock 项目的真实网页与桌面页面。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','unmet',NULL,NULL,NULL,NULL,56,'demo-user','2026-09-10T07:03:28.509Z','2026-09-10T07:03:28.509Z','2026-09-10T07:03:28.509Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('AUTO-CONNECT','goalboard-v1-demo','自动替用户选择最近使用的项目','新对话少做一次项目确认','早期方案希望用历史目录记录缩短首次连接步骤','新对话进入一个以前使用过的目录时，系统直接连接最近的项目，不再询问用户。这个方案可能选错项目，因此已经移入回收站，当前产品只展示候选并让用户决定。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','unmet','2026-09-10T07:03:28.538Z','demo-user',NULL,NULL,10,'demo-user','2026-09-10T07:03:28.509Z','2026-09-10T07:03:28.509Z','2026-09-10T07:03:28.538Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('OLD-HUMAN','goalboard-v1-demo','历史迁移场景 OLD-HUMAN','用户亲自核对付款体验','保留已有明确约定','单向升级后要求和责任仍须可读可改','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-09-10T07:03:28.560Z','2026-09-10T07:03:28.560Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('OLD-POLICY','goalboard-v1-demo','历史迁移场景 OLD-POLICY','实际付款成功','保留已有明确约定','单向升级后要求和责任仍须可读可改','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-09-10T07:03:28.560Z','2026-09-10T07:03:28.560Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('OLD-RISK','goalboard-v1-demo','历史迁移场景 OLD-RISK','结果可以打开','保留已有明确约定','单向升级后要求和责任仍须可读可改','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-09-10T07:03:28.561Z','2026-09-10T07:03:28.561Z');
INSERT INTO "goals" ("goal_id","project_id","title","outcome","why","business_logic","in_scope_json","out_of_scope_json","constraints_json","required_inputs_json","promised_outputs_json","decomposition_review_json","definition_state","decomposition_state","validity_state","fulfillment_state","trashed_at","trashed_by","archived_at","archived_by","priority","accepted_by","accepted_at","created_at","updated_at") VALUES ('MIXED-OWNER','goalboard-v1-demo','已有事件 owner 的旧要求','真实结果继续有效','旧 criterion 已有真实事件支持','单向迁移不得丢弃它','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','satisfied',NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-09-10T07:29:38.098Z','2026-09-10T08:08:53.178Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','initialize_board','demo-board','44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a','{"project_id":"goalboard-v1-demo","observed_event_cursor":1}','2026-09-10T07:03:28.489Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-part-PLATFORM','6482c3a8d0633f75f1cda11eeefc3dd7ca543d0d43f9eca0eb3a38ba4a3b3eba','{"relation_id":"relation-46303826-25b2-4b8e-ad5e-b76617d90fc9","observed_event_cursor":15}','2026-09-10T07:03:28.510Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-part-WORKSPACE','c82e6659f90d83cf44078a6802429aab882e5248f7fb69d6deaae3603242a0cd','{"relation_id":"relation-d0cedc75-3cc4-4977-a253-247efa2b82fb","observed_event_cursor":16}','2026-09-10T07:03:28.512Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-part-ADOPTION','8c4c953cbbc131dd0107694b8bc264106228d57464282ad08412d37cae240fbc','{"relation_id":"relation-4814cf00-c15c-4d86-b625-15f7c60df9b7","observed_event_cursor":17}','2026-09-10T07:03:28.513Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-part-CORE','0d6f6c328d7f3070e0cc0641e9927279a8cd34565edc3ff5f0d0368ca54299f3','{"relation_id":"relation-9410d190-8f63-466a-8797-14efb68c326d","observed_event_cursor":18}','2026-09-10T07:03:28.514Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-part-INTERFACES','77f9377cf3bd2c7fe3c310ae04baa77d2a69d91e7378288bbb5d29cb67ad5de8','{"relation_id":"relation-e744e983-eef6-4ea8-ad99-96cd1b73b248","observed_event_cursor":19}','2026-09-10T07:03:28.515Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-part-WEB','1e3ff6a45cb626f0025e9d77216a8e89a046d9316f91aba036ab8c1d3317f13a','{"relation_id":"relation-8217b2ac-8515-4f15-82de-c772e6c97a23","observed_event_cursor":20}','2026-09-10T07:03:28.524Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-part-GRAPH','26812e7c892d637e16c8f6408364118c594f48da3efb1f8e3d471d633eb7c74f','{"relation_id":"relation-730b96da-261b-4736-9788-7f8f89edcf64","observed_event_cursor":21}','2026-09-10T07:03:28.525Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-part-DESKTOP','44ec270574fa0799cbb675c9fa729f770bd45ebf9cca33d639266580b66a370a','{"relation_id":"relation-f5af7868-c03c-4486-975b-01f92da14355","observed_event_cursor":22}','2026-09-10T07:03:28.526Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-part-RELEASE','a1042b41785a71853c0b2adc1994d358331d682ccb75ac09024fbaeab05920f2','{"relation_id":"relation-ecd7a888-4fdb-4ff5-8aeb-22b195aa8a45","observed_event_cursor":23}','2026-09-10T07:03:28.527Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-part-ONBOARDING','21fa6f6da09772a17e97aff9ec22ec5685353373dec53a92ed3f47defbbbb06f','{"relation_id":"relation-e62c0749-b7fe-4bd9-9669-e0063c9b289d","observed_event_cursor":24}','2026-09-10T07:03:28.527Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-part-DOCS','edebf6641ea067e7c1ffac4e7e424127a0e85c0efd82920b6b4b595c2d131424','{"relation_id":"relation-fd86817a-3c4e-41b0-8311-a2c55b7daaed","observed_event_cursor":25}','2026-09-10T07:03:28.528Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-dependency-interfaces','4212417003556279a15467e2beb05fedf495746c75c696da34f07de90e651303','{"relation_id":"relation-3db70bd7-947c-44d4-b92f-7c794331177d","observed_event_cursor":26}','2026-09-10T07:03:28.528Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-dependency-web','215aa0fb7f5fb5fe4cae3afdbfd6b063ea4fc7cf9cd1edf2732bf6c64be46509','{"relation_id":"relation-a2944b01-48f2-43a4-8215-bb3d5165fec8","observed_event_cursor":27}','2026-09-10T07:03:28.529Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-dependency-graph','a54fcefe992827478644cf65d7b0f4e12bcf8aee3d3c75e284138aa3c39f8300','{"relation_id":"relation-6b87504f-8ad9-49a9-acc4-4d75f39eea1d","observed_event_cursor":28}','2026-09-10T07:03:28.529Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-dependency-desktop','c9c2312048bd48ea14ed96929703343234592cad72dfcab1890e57a28e8c5442','{"relation_id":"relation-5e6401d7-b1dc-4a94-8c53-f04539921f6a","observed_event_cursor":29}','2026-09-10T07:03:28.530Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-dependency-onboarding','3e8414f6e7fd92b35a9c7937511a5a8c469503218711a28db6b4d551007502cf','{"relation_id":"relation-341fe1f6-94a5-4b9d-96d8-1481878e7570","observed_event_cursor":30}','2026-09-10T07:03:28.530Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_relation','demo-dependency-docs','7130416bf9475ebe006b6a08de7bf332cbb74fabfb4fffa75a49771f38bc5b70','{"relation_id":"relation-26184b19-74b6-4509-a239-b2c3d9ef3b67","observed_event_cursor":31}','2026-09-10T07:03:28.530Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','demo-user','add_risk','demo-risk-first-restart','a5c777c15939f4df3d9150c8d8a736c4b9dc25aaaca03a59196ed1ecece1ca62','{"risk":{"risk_id":"RISK-FIRST-RESTART","project_id":"goalboard-v1-demo","description":"用户接入 Runtime 后没有新开会话，误以为安装失败","probability":"medium","impact":"用户看不到 Molis Work 工具，无法开始第一次使用","affected_surfaces":["首次安装","Runtime 接入"],"trigger":"用户继续使用接入前已经打开的会话","treatment":"mitigate","treatment_plan":"","blocking_mode":"none","revisit_condition":"安装结果和接入预览都清楚说明新开会话的原因和下一步","owner":"产品体验","state":"open","resolution_basis":null,"created_at":"2026-09-10T07:03:28.532Z","updated_at":"2026-09-10T07:03:28.532Z"},"transitions":[{"goal_id":"RELEASE","previous_action_token":"015c71bbe8e02f95e8983236eca05686","projection":{"goal_id":"RELEASE","contract_revision":1,"progress":"not_started","primary_action":{"action_id":"action-a8122f09c3549b87ffe37f55","actor":"runtime","kind":"clarify","status":"ready","target_type":"goal","target_id":"RELEASE","reasons":[]},"actions":[{"action_id":"action-a8122f09c3549b87ffe37f55","actor":"runtime","kind":"clarify","status":"ready","target_type":"goal","target_id":"RELEASE","reasons":[]}],"action_token":"015c71bbe8e02f95e8983236eca05686","display_status":"continue"},"affected_goals":[{"goal_id":"RELEASE","contract_revision":1,"progress":"not_started","primary_action":{"action_id":"action-a8122f09c3549b87ffe37f55","actor":"runtime","kind":"clarify","status":"ready","target_type":"goal","target_id":"RELEASE","reasons":[]},"action_token":"015c71bbe8e02f95e8983236eca05686","display_status":"continue"}],"summary":"已记录风险，不新增用户待办","observed_event_cursor":32}],"observed_event_cursor":32}','2026-09-10T07:03:28.532Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','runtime-core','claim_goal','demo-core-claim','f3f50cb4ff6f2131a98ef644fb4ecc7d3e970e6b38b2865275e8d82c78fb8122','{"allowed":true,"observed_event_cursor":33,"reasons":[],"claim":{"claim_id":"claim-dc5985a4-4a90-4aaa-880a-28f896f96e14","project_id":"goalboard-v1-demo","goal_id":"CORE","actor_id":"runtime-core","role":"executor","contract_revision":1,"action_kind":"execute","action_target_id":"CORE","state":"active","capabilities":[],"goal_mode_attestation":false,"resolved_policy":{"goal_mode":"preferred","required_capabilities":[],"self_verification":true,"cross_reviewers":0,"adversarial_reviewers":0,"human_approval":false,"max_lease_seconds":1800},"claimed_at":"2026-09-10T07:03:28.540Z","expires_at":"2026-09-10T07:33:28.540Z","renewed_at":null,"released_at":null,"release_reason":null},"replayed":false}','2026-09-10T07:03:28.539Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','runtime-core','start_run','demo-core-run','516fe370819c54c411c7adb73b7160988dad03999d738f2297741bd203d775cf','{"run":{"run_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","project_id":"goalboard-v1-demo","goal_id":"CORE","claim_id":"claim-dc5985a4-4a90-4aaa-880a-28f896f96e14","actor_id":"runtime-core","role":"executor","state":"started","block_reason":null,"output_refs":[],"discovery_refs":[],"started_at":"2026-09-10T07:03:28.541Z","ended_at":null},"observed_event_cursor":35}','2026-09-10T07:03:28.541Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','runtime-core','report_run','demo-core-run-complete','8e32de79bb818f1cf49734120236be23e1c4335f5246e6867de9411db905890a','{"run":{"run_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","project_id":"goalboard-v1-demo","goal_id":"CORE","claim_id":"claim-dc5985a4-4a90-4aaa-880a-28f896f96e14","actor_id":"runtime-core","role":"executor","state":"completed","block_reason":null,"output_refs":["tests/v1.test.ts"],"discovery_refs":[],"started_at":"2026-09-10T07:03:28.541Z","ended_at":"2026-09-10T07:03:28.543Z"},"observed_event_cursor":36,"transition":{"goal_id":"CORE","previous_action_token":"6bb6bf58c8d6e46dead0b1444437cd55","projection":{"goal_id":"CORE","contract_revision":1,"progress":"work_recorded","primary_action":{"action_id":"action-77c1abae7519eaaebb327691","actor":"runtime","kind":"submit_evidence","status":"active","target_type":"run","target_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","reasons":[{"code":"action.evidence_incomplete","severity":"warning","subject_type":"run","subject_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","message":"执行已经完成，还需要补齐完成依据","remediation":"提交当前 Contract revision 所需的最后一条 Evidence 后会自动释放工作。"}]},"actions":[{"action_id":"action-77c1abae7519eaaebb327691","actor":"runtime","kind":"submit_evidence","status":"active","target_type":"run","target_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","reasons":[{"code":"action.evidence_incomplete","severity":"warning","subject_type":"run","subject_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","message":"执行已经完成，还需要补齐完成依据","remediation":"提交当前 Contract revision 所需的最后一条 Evidence 后会自动释放工作。"}]}],"action_token":"2e51258038925f4e17921c9b7541f5c9","display_status":"in_progress"},"affected_goals":[{"goal_id":"CORE","contract_revision":1,"progress":"work_recorded","primary_action":{"action_id":"action-77c1abae7519eaaebb327691","actor":"runtime","kind":"submit_evidence","status":"active","target_type":"run","target_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","reasons":[{"code":"action.evidence_incomplete","severity":"warning","subject_type":"run","subject_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","message":"执行已经完成，还需要补齐完成依据","remediation":"提交当前 Contract revision 所需的最后一条 Evidence 后会自动释放工作。"}]},"action_token":"2e51258038925f4e17921c9b7541f5c9","display_status":"in_progress"}],"summary":"已记录本阶段产物","observed_event_cursor":36}}','2026-09-10T07:03:28.542Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','runtime-core','submit_evidence','demo-core-evidence','9f1efd1614152da15ae8d38183471667ebde917406f48b21bc6084cf4100d86f','{"evidence":{"evidence_id":"evidence-3aaba898-2eb4-4565-acbb-13cccced105f","project_id":"goalboard-v1-demo","goal_id":"CORE","contract_revision":1,"criterion_ids":["CORE-C1"],"producer_actor_id":"runtime-core","run_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","review_id":null,"kind":"test","locator":"command://pnpm-test","locator_status":"unverified","locator_validation_reason":"不透明或外部 locator 已保留为 UNVERIFIED；Molis Work 不会调用自定义协议","locator_checked_at":"2026-09-10T07:03:28.545Z","locator_workspace_id":null,"digest":null,"captured_at":"2026-09-10T07:03:28.545Z","result":"passed","lifecycle_state":"effective","correction":null,"historical_unmapped":false},"observed_event_cursor":38,"transition":{"goal_id":"CORE","previous_action_token":"2e51258038925f4e17921c9b7541f5c9","projection":{"goal_id":"CORE","contract_revision":1,"progress":"work_recorded","primary_action":{"action_id":"action-8b0b3c4001bbd07472c0f31a","actor":"runtime","kind":"review","status":"ready","target_type":"review_obligation","target_id":"obligation-64b45adb-d01f-4ee5-a9d7-fba2f7dcb9a6","reasons":[]},"actions":[{"action_id":"action-8b0b3c4001bbd07472c0f31a","actor":"runtime","kind":"review","status":"ready","target_type":"review_obligation","target_id":"obligation-64b45adb-d01f-4ee5-a9d7-fba2f7dcb9a6","reasons":[]}],"action_token":"bc49b6de772fa1099fcf9789ccfe42ae","display_status":"continue"},"affected_goals":[{"goal_id":"CORE","contract_revision":1,"progress":"work_recorded","primary_action":{"action_id":"action-8b0b3c4001bbd07472c0f31a","actor":"runtime","kind":"review","status":"ready","target_type":"review_obligation","target_id":"obligation-64b45adb-d01f-4ee5-a9d7-fba2f7dcb9a6","reasons":[]},"action_token":"bc49b6de772fa1099fcf9789ccfe42ae","display_status":"continue"}],"summary":"已记录完成依据","observed_event_cursor":38}}','2026-09-10T07:03:28.545Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','runtime-core','submit_review','demo-core-review','c190c83074aaf56e00148d4ac063185a35144ffe0a09b98d4acf915cdc69ec39','{"review":{"review_id":"review-3c52c9fe-13b8-41ce-92d2-725de601ae6f","project_id":"goalboard-v1-demo","goal_id":"CORE","obligation_id":"obligation-64b45adb-d01f-4ee5-a9d7-fba2f7dcb9a6","claim_id":null,"actor_id":"runtime-core","verdict":"pass","evidence_refs":["evidence-3aaba898-2eb4-4565-acbb-13cccced105f"],"reasoning":"生命周期测试通过","submitted_at":"2026-09-10T07:03:28.550Z"},"observed_event_cursor":40,"transition":{"goal_id":"CORE","previous_action_token":"bc49b6de772fa1099fcf9789ccfe42ae","projection":{"goal_id":"CORE","contract_revision":1,"progress":"verified","primary_action":null,"actions":[],"action_token":"e860ebc1537180e7b4660f8d71ccf5af","display_status":"completed"},"affected_goals":[{"goal_id":"CORE","contract_revision":1,"progress":"verified","primary_action":null,"action_token":"e860ebc1537180e7b4660f8d71ccf5af","display_status":"completed"}],"summary":"已记录复核结果","observed_event_cursor":40}}','2026-09-10T07:03:28.550Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','runtime-core','evaluate_leaf_completion','demo-core-complete','411b89fc57c66098a0d9a68d7e3c492c9933e671c0480e30cfe1a84e15237d03','{"satisfied":true,"reasons":[],"observed_event_cursor":40}','2026-09-10T07:03:28.553Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','runtime-interface','claim_goal','demo-interface-claim','6ffbf790d78c5f1a15ce473d4f7d6739b8b1ba547e70941c19dca0ff3be6d630','{"allowed":true,"observed_event_cursor":40,"reasons":[],"claim":{"claim_id":"claim-c44fe62b-c4bf-4b0e-9d14-3f302a74c45b","project_id":"goalboard-v1-demo","goal_id":"INTERFACES","actor_id":"runtime-interface","role":"executor","contract_revision":1,"action_kind":"execute","action_target_id":"INTERFACES","state":"active","capabilities":[],"goal_mode_attestation":false,"resolved_policy":{"goal_mode":"preferred","required_capabilities":[],"self_verification":true,"cross_reviewers":0,"adversarial_reviewers":0,"human_approval":false,"max_lease_seconds":1800},"claimed_at":"2026-09-10T07:03:28.554Z","expires_at":"2026-09-10T07:33:28.554Z","renewed_at":null,"released_at":null,"release_reason":null},"replayed":false}','2026-09-10T07:03:28.553Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','runtime-interface','start_run','demo-interface-run','ee73190f49d01e0b20782352a8aa00df648f62904407861918e968d588e6ff43','{"run":{"run_id":"run-65ec112f-54fe-499a-a41d-b5fc73d14f85","project_id":"goalboard-v1-demo","goal_id":"INTERFACES","claim_id":"claim-c44fe62b-c4bf-4b0e-9d14-3f302a74c45b","actor_id":"runtime-interface","role":"executor","state":"started","block_reason":null,"output_refs":[],"discovery_refs":[],"started_at":"2026-09-10T07:03:28.554Z","ended_at":null},"observed_event_cursor":42}','2026-09-10T07:03:28.554Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','runtime-interface','submit_candidate','demo-candidate','015b8f6ae3d66514b6d8178ff3e626a44aed82ed38376b8609884169bcfd79cb','{"candidate":{"candidate_id":"candidate-b0050ab4-1d01-4556-ac3d-fa0053f69ce2","project_id":"goalboard-v1-demo","submitted_by":"runtime-interface","discovered_in_run_id":"run-65ec112f-54fe-499a-a41d-b5fc73d14f85","proposed_goal":{"title":"让旧数据升级前先看到安全说明","outcome":"用户在升级前知道哪些内容会保留、哪些需要重新整理","why":"旧版数据和当前规则并不完全对应，直接迁移可能让用户误以为缺失内容仍然有效","business_logic":"用户升级时先看到每类旧数据的处理结果；能安全保留的内容明确列出，不能可靠迁移的内容提示重新整理，不会静默丢失或伪造。","acceptance_criteria":[{"statement":"升级报告逐项说明可迁移内容和需要重建的内容","decision_method":"automated_check","pass_condition":"迁移样例没有未解释字段"}]},"proposed_relations":[],"proposed_impacts":[],"proposed_risks":[],"blocking_mode":"none","state":"pending","decision":null,"created_at":"2026-09-10T07:03:28.555Z","decided_at":null},"observed_event_cursor":43}','2026-09-10T07:03:28.555Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','mixed-runtime','configure_goal_events','mixed-configure','f29cb7d226a3f3764c3fa9d7ab4f7f2fcbe7cade28de45c36a7931cec4d39111','{"config":{"project_id":"goalboard-v1-demo","goal_id":"MIXED-OWNER","version":1,"types":[{"type_id":"check","version":1,"name":"实际核对","purpose":"保留真实支持","source":{"kind":"local","label":"当前 Goal 局部定义"},"fields":[{"field_id":"result","name":"结果","purpose":"核对结果","format":"text","required":true,"source":{"kind":"local"}}]}],"adopted_planning":[],"extra_requirements":[],"requirement_bindings":[],"updated_at":"2026-09-10T07:29:38.102Z","updated_by":"mixed-runtime"},"event_id":"gevt-a47aa75e-722e-41ac-8896-e59373c12681","observed_event_cursor":48}','2026-09-10T07:29:38.102Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','mixed-runtime','configure_goal_events_request','mixed-configure','5acad0863241b6f6a93186b5e2671e5673fb70ddfa30b7be7c29e157c522cac6','{"config":{"project_id":"goalboard-v1-demo","goal_id":"MIXED-OWNER","version":1,"types":[{"type_id":"check","version":1,"name":"实际核对","purpose":"保留真实支持","source":{"kind":"local","label":"当前 Goal 局部定义"},"fields":[{"field_id":"result","name":"结果","purpose":"核对结果","format":"text","required":true,"source":{"kind":"local"}}]}],"adopted_planning":[],"extra_requirements":[],"requirement_bindings":[],"updated_at":"2026-09-10T07:29:38.102Z","updated_by":"mixed-runtime"},"event_id":"gevt-a47aa75e-722e-41ac-8896-e59373c12681","observed_event_cursor":48}','2026-09-10T07:29:38.103Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','mixed-runtime','report_goal_events','mixed-report','9d5df42b0b3763b0ff9570c87fe1556ac8de5f839ec4ab927141b0c935969795','{"events":[{"event_id":"gevt-75b666e9-56d7-4929-b6d0-7474b5937be3","project_id":"goalboard-v1-demo","goal_id":"MIXED-OWNER","title":"结果核对","actor_id":"mixed-runtime","actor_kind":"runtime","received_at":"2026-09-10T07:29:38.103Z","journal_seq":49,"config_version":1,"kind":"report","type":{"type_id":"check","version":1,"name":"实际核对","purpose":"保留真实支持","source":{"kind":"local","label":"当前 Goal 局部定义"},"fields":[{"field_id":"result","name":"结果","purpose":"核对结果","format":"text","required":true,"source":{"kind":"local"}}]},"payload":{"result":"真实结果可以打开"},"judgments":[{"requirement_id":"MIXED-C1","verdict":"supports"}]}],"observed_event_cursor":49}','2026-09-10T07:29:38.103Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','existing-user','record_goal_user_decision','approved-policy-before-migration','1acadeefc733972f0eb553106ceea508a907f9d2c506d3d31956d5c438896f0d','{"event_id":"gevt-c3a48804-b9f3-4b0f-9a75-2393f0881092","observed_event_cursor":51,"recorded":true,"decision":{"decision_id":"gdec-83564492-8f53-45d4-9c70-7cd39039fc2a","governance_decision_id":"gedec-fe7294b3-8446-424e-9418-2932bb8027d9","request_id":null,"selected_option_id":null,"conclusion":"我已经核对本 Goal 的当前交付，同意满足人工验收责任；剩余输入遗漏修复后可以完成","accepts_requirements":false,"effects":[{"kind":"authorize_action","action":"complete"}],"scope":{"requirement_ids":[],"event_ids":[],"concern_ids":[],"action":"complete"},"commitment":{"outcome":"真实结果继续有效","requirements":[{"requirement_id":"MIXED-C1","statement":"结果确实可读","human_decision_required":false,"bound_type_ids":[]},{"requirement_id":"imported-policy:MIXED-OWNER","statement":"本项目完成必须由用户验收","human_decision_required":true,"bound_type_ids":[]}]},"authorized_change":null,"config_version":1,"agreement_version":1,"actor_id":"existing-user","authority_source":"web","recorded_at":"2026-09-10T08:08:53.175Z"}}','2026-09-10T08:08:53.175Z');
INSERT INTO "idempotency_records" ("project_id","actor_id","operation","idempotency_key","request_hash","outcome_json","created_at") VALUES ('goalboard-v1-demo','existing-runtime','submit_goal_event_closure','approved-still-blocked-by-risk','d7b4fc0c718e4590dfda9185ee19a2ba7bafeb0473f0133f3965121dea319629','{"event_id":"gevt-fff26575-8687-4006-bc0a-652b335c236f","observed_event_cursor":52,"recorded":true,"completion_applied":true,"work_status":"completed","unmet_reasons":[],"closure":{"closure_id":"gclo-f5c0d3db-95a0-444f-978e-17060d3f6ab8","event_id":"gevt-fff26575-8687-4006-bc0a-652b335c236f","kind":"complete","result":"实际结果可读","reason":"保留真实人工批准，核对剩余风险","recorded":true,"completion_applied":true,"expected_config_version":1,"expected_agreement_version":1,"config_version":1,"agreement_version":1,"unmet_reasons":[],"superseded":false,"superseded_reason":null,"recorded_at":"2026-09-10T08:08:53.178Z"}}','2026-09-10T08:08:53.178Z');
INSERT INTO "plugin_project_databases" ("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES ('io.molis.work.goals','official-goals-binding','goals',1,'["acceptance_criteria","acceptance_goal_idx","boards","goal_event_agreements","goal_event_applied_decisions","goal_event_applied_decisions_goal_idx","goal_event_closures","goal_event_closures_goal_idx","goal_event_concerns","goal_event_concerns_goal_idx","goal_event_config_versions","goal_event_configs","goal_event_decision_requests","goal_event_decision_requests_goal_idx","goal_event_progress_summaries","goal_event_progress_summaries_goal_idx","goal_event_requirement_bindings","goal_event_requirement_conclusions","goal_event_requirement_conclusions_latest_idx","goal_event_requirements","goal_event_requirements_goal_idx","goal_event_state_owners","goal_event_state_owners_project_idx","goal_event_trusted_decisions","goal_event_trusted_decisions_goal_idx","goal_event_types","goal_event_types_goal_idx","goal_event_work_status","goal_relations","goal_trash_one_open_per_goal","goal_trash_records","goal_trash_records_goal_idx","goal_trash_relation_records","goal_trash_relation_records_relation_idx","goal_tree_proposal_decisions","goal_tree_proposal_decisions_item_idx","goal_tree_proposal_items","goal_tree_proposal_items_project_idx","goal_tree_proposal_items_proposal_idx","goal_tree_proposals","goal_tree_proposals_project_idx","goal_tree_proposals_supersedes_idx","goal_work_event_judgments","goal_work_event_judgments_requirement_idx","goal_work_events","goal_work_events_goal_seq_idx","goals","goals_archive_idx","goals_project_idx","goals_ready_idx","goals_trash_idx","input_bindings","planning_method_packs","policies_scope_idx","policy_bindings","project_guidance_entries","project_guidance_project_idx","project_guidance_revisions","project_guidance_revisions_project_idx","relations_from_idx","relations_to_idx","sync_ebbb9ae341b34cbb8aedd65a41e6_aggregate_editor_versions","sync_ebbb9ae341b34cbb8aedd65a41e6_context","sync_ebbb9ae341b34cbb8aedd65a41e6_context_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_context_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_context_update","sync_ebbb9ae341b34cbb8aedd65a41e6_journal","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes_key","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_conflicts","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_heads","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_outbox","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_resolutions","sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state","sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_24_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_24_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_24_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_25_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_25_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_25_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_26_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_26_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_26_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_27_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_27_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_27_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_28_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_28_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_28_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_29_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_29_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_29_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_30_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_30_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_30_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_update","sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_delete","sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_insert","sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_update"]','2026-11-03T17:48:08.153Z');
INSERT INTO "plugin_project_databases" ("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES ('io.molis.work.inbox','official-inbox-binding','inbox',1,'["inbox_scene_bindings","sync_21391483cd8d8dcc743c2ecd02ca_aggregate_editor_versions","sync_21391483cd8d8dcc743c2ecd02ca_attention_events_delete","sync_21391483cd8d8dcc743c2ecd02ca_attention_events_insert","sync_21391483cd8d8dcc743c2ecd02ca_attention_events_update","sync_21391483cd8d8dcc743c2ecd02ca_context","sync_21391483cd8d8dcc743c2ecd02ca_inbox_entries_delete","sync_21391483cd8d8dcc743c2ecd02ca_inbox_entries_insert","sync_21391483cd8d8dcc743c2ecd02ca_inbox_entries_update","sync_21391483cd8d8dcc743c2ecd02ca_replica_changes","sync_21391483cd8d8dcc743c2ecd02ca_replica_changes_key","sync_21391483cd8d8dcc743c2ecd02ca_replica_conflicts","sync_21391483cd8d8dcc743c2ecd02ca_replica_heads","sync_21391483cd8d8dcc743c2ecd02ca_replica_outbox","sync_21391483cd8d8dcc743c2ecd02ca_replica_resolutions","sync_21391483cd8d8dcc743c2ecd02ca_replica_state"]','2026-11-03T17:48:08.160Z');
INSERT INTO "plugin_project_databases" ("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES ('io.molis.work.schedule','official-schedule-binding','schedule',1,'["schedule_conversation_tasks","schedule_conversation_tasks_enabled_idx","schedule_conversation_turns","schedule_conversation_turns_task_idx","schedule_operation_occurrences","schedule_operations","schedule_plugin_reminders","schedule_plugin_reminders_owner","sync_fc44281fa4e6ae1ad919f15bea63_aggregate_editor_versions","sync_fc44281fa4e6ae1ad919f15bea63_context","sync_fc44281fa4e6ae1ad919f15bea63_replica_changes","sync_fc44281fa4e6ae1ad919f15bea63_replica_changes_key","sync_fc44281fa4e6ae1ad919f15bea63_replica_conflicts","sync_fc44281fa4e6ae1ad919f15bea63_replica_heads","sync_fc44281fa4e6ae1ad919f15bea63_replica_outbox","sync_fc44281fa4e6ae1ad919f15bea63_replica_resolutions","sync_fc44281fa4e6ae1ad919f15bea63_replica_state","sync_fc44281fa4e6ae1ad919f15bea63_track_0_delete","sync_fc44281fa4e6ae1ad919f15bea63_track_0_insert","sync_fc44281fa4e6ae1ad919f15bea63_track_0_update","sync_fc44281fa4e6ae1ad919f15bea63_track_1_delete","sync_fc44281fa4e6ae1ad919f15bea63_track_1_insert","sync_fc44281fa4e6ae1ad919f15bea63_track_1_update"]','2026-11-03T17:48:08.165Z');
INSERT INTO "plugin_project_databases" ("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES ('io.molis.work.feed','official-feed-binding','feed',1,'["feed_item_events","feed_item_events_project_item_idx","feed_items","feed_items_project_signal_idx","feed_items_project_source_external_idx","feed_items_project_updated_idx","feed_materials","feed_materials_project_item_idx","feed_out_rules","feed_out_rules_project_enabled_idx","feed_source_runs","feed_source_runs_project_source_idx","feed_sources","feed_sources_project_updated_idx","listener_deliveries","listener_deliveries_recovery_idx","listener_instances","signal_events","signal_events_project_source_idx","signal_revisions","signals","signals_project_source_observed_idx","source_events","source_events_project_source_idx","sync_14ff60cd5b3b2f8842d99bea7ef6_aggregate_editor_versions","sync_14ff60cd5b3b2f8842d99bea7ef6_context","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes_key","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_conflicts","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_heads","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_outbox","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_resolutions","sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state","sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_delete","sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_insert","sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_update","sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_delete","sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_insert","sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_update","sync_522a4260e0bcbee35d4d9f85406c_aggregate_editor_versions","sync_522a4260e0bcbee35d4d9f85406c_context","sync_522a4260e0bcbee35d4d9f85406c_replica_changes","sync_522a4260e0bcbee35d4d9f85406c_replica_changes_key","sync_522a4260e0bcbee35d4d9f85406c_replica_conflicts","sync_522a4260e0bcbee35d4d9f85406c_replica_heads","sync_522a4260e0bcbee35d4d9f85406c_replica_outbox","sync_522a4260e0bcbee35d4d9f85406c_replica_resolutions","sync_522a4260e0bcbee35d4d9f85406c_replica_state","sync_522a4260e0bcbee35d4d9f85406c_track_0_delete","sync_522a4260e0bcbee35d4d9f85406c_track_0_insert","sync_522a4260e0bcbee35d4d9f85406c_track_0_update","sync_522a4260e0bcbee35d4d9f85406c_track_1_delete","sync_522a4260e0bcbee35d4d9f85406c_track_1_insert","sync_522a4260e0bcbee35d4d9f85406c_track_1_update","sync_522a4260e0bcbee35d4d9f85406c_track_2_delete","sync_522a4260e0bcbee35d4d9f85406c_track_2_insert","sync_522a4260e0bcbee35d4d9f85406c_track_2_update","sync_522a4260e0bcbee35d4d9f85406c_track_3_delete","sync_522a4260e0bcbee35d4d9f85406c_track_3_insert","sync_522a4260e0bcbee35d4d9f85406c_track_3_update","sync_522a4260e0bcbee35d4d9f85406c_track_4_delete","sync_522a4260e0bcbee35d4d9f85406c_track_4_insert","sync_522a4260e0bcbee35d4d9f85406c_track_4_update","sync_522a4260e0bcbee35d4d9f85406c_track_5_delete","sync_522a4260e0bcbee35d4d9f85406c_track_5_insert","sync_522a4260e0bcbee35d4d9f85406c_track_5_update","sync_daec9cf494e58d382d6262de3af9_aggregate_editor_versions","sync_daec9cf494e58d382d6262de3af9_context","sync_daec9cf494e58d382d6262de3af9_replica_changes","sync_daec9cf494e58d382d6262de3af9_replica_changes_key","sync_daec9cf494e58d382d6262de3af9_replica_conflicts","sync_daec9cf494e58d382d6262de3af9_replica_heads","sync_daec9cf494e58d382d6262de3af9_replica_outbox","sync_daec9cf494e58d382d6262de3af9_replica_resolutions","sync_daec9cf494e58d382d6262de3af9_replica_state","sync_daec9cf494e58d382d6262de3af9_track_0_delete","sync_daec9cf494e58d382d6262de3af9_track_0_insert","sync_daec9cf494e58d382d6262de3af9_track_0_update"]','2026-11-03T17:48:08.177Z');
INSERT INTO "plugin_project_databases" ("plugin_id","publisher_signature","store_name","version","tables_json","created_at") VALUES ('io.molis.work.coding','official-coding-binding','coding',1,'["coding_input_versions","coding_inputs","coding_plan_drafts","coding_plan_versions","coding_saved_history","coding_sessions","coding_sessions_project_updated_idx","sync_dd6dd4054975ce4abcd1e12268d3_aggregate_editor_versions","sync_dd6dd4054975ce4abcd1e12268d3_context","sync_dd6dd4054975ce4abcd1e12268d3_replica_changes","sync_dd6dd4054975ce4abcd1e12268d3_replica_changes_key","sync_dd6dd4054975ce4abcd1e12268d3_replica_conflicts","sync_dd6dd4054975ce4abcd1e12268d3_replica_heads","sync_dd6dd4054975ce4abcd1e12268d3_replica_outbox","sync_dd6dd4054975ce4abcd1e12268d3_replica_resolutions","sync_dd6dd4054975ce4abcd1e12268d3_replica_state","sync_dd6dd4054975ce4abcd1e12268d3_track_0_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_0_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_0_update","sync_dd6dd4054975ce4abcd1e12268d3_track_1_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_1_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_1_update","sync_dd6dd4054975ce4abcd1e12268d3_track_2_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_2_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_2_update","sync_dd6dd4054975ce4abcd1e12268d3_track_3_delete","sync_dd6dd4054975ce4abcd1e12268d3_track_3_insert","sync_dd6dd4054975ce4abcd1e12268d3_track_3_update"]','2026-11-03T17:48:08.186Z');
INSERT INTO "policy_bindings" ("policy_binding_id","project_id","goal_id","scope","policy_json","state","created_by","reason","created_at") VALUES ('legacy-explicit-human','goalboard-v1-demo','OLD-POLICY','goal','{"human_approval":true}','active','migration-user','用户明确要求完成前亲自验收','2026-09-10T07:03:28.561Z');
INSERT INTO "policy_bindings" ("policy_binding_id","project_id","goal_id","scope","policy_json","state","created_by","reason","created_at") VALUES ('mixed-project-human','goalboard-v1-demo',NULL,'project_default','{"human_approval":true}','active','mixed-user','本项目完成必须由用户验收','2026-09-10T07:29:38.105Z');
INSERT INTO "process_items_replica_state" ("id","device","cursor","applying") VALUES (1,'e6a77ce3c9634724e95432f7fac2ce10',0,0);
INSERT INTO "project_root" ("project_id","created_at") VALUES ('goalboard-v1-demo','2026-09-10T07:03:28.489Z');
INSERT INTO "sync_fc44281fa4e6ae1ad919f15bea63_context" ("id","project_id") VALUES (1,NULL);
INSERT INTO "sync_fc44281fa4e6ae1ad919f15bea63_replica_state" ("id","device","cursor","applying") VALUES (1,'a3862fcaccde22e144e05b877a42466b',0,0);
INSERT INTO "sync_dd6dd4054975ce4abcd1e12268d3_context" ("id","project_id") VALUES (1,NULL);
INSERT INTO "sync_dd6dd4054975ce4abcd1e12268d3_replica_state" ("id","device","cursor","applying") VALUES (1,'302d923bf18235e1f37d016bb6581987',0,0);
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_context" ("id","project_id") VALUES (1,NULL);
INSERT INTO "sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state" ("id","device","cursor","applying") VALUES (1,'0a6c47b9e63dc9c654e84da0aebaf44c',0,0);
INSERT INTO "sync_21391483cd8d8dcc743c2ecd02ca_context" ("id","project_id") VALUES (1,NULL);
INSERT INTO "sync_21391483cd8d8dcc743c2ecd02ca_replica_state" ("id","device","cursor","applying") VALUES (1,'c6ff0d7fbdddffc5bdfb1732dc8476ea',0,0);
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_context" ("id","project_id") VALUES (1,NULL);
INSERT INTO "sync_522a4260e0bcbee35d4d9f85406c_replica_state" ("id","device","cursor","applying") VALUES (1,'08c68878b0b4e40d1316886d19a21a03',0,0);
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_context" ("id","project_id") VALUES (1,NULL);
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (1,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (2,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (3,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (4,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (5,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (6,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (7,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (8,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (9,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (10,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (11,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (12,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (13,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (14,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (15,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (16,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (17,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (18,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (19,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (20,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (21,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (22,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (23,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (24,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (25,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (26,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (27,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (28,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (29,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (30,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (31,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (32,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (33,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (34,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (35,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (36,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (37,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (38,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (39,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (40,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (41,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (42,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (43,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (44,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (45,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (46,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (47,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (48,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (49,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (50,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (51,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (52,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (53,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (54,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (55,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (56,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (57,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (58,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (59,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (60,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (61,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (62,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (63,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (64,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (65,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (66,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (67,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (68,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (69,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (70,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (71,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (72,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (73,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (74,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (75,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (76,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (77,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (78,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (79,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (80,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (81,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (82,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (83,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (84,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (85,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (86,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (87,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (88,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (89,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (90,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (91,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (92,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (93,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (94,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (95,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (96,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (97,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (98,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (99,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (100,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (101,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (102,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (103,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (104,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (105,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (106,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (107,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (108,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (109,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (110,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (111,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (112,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (113,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (114,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (115,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (116,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (117,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (118,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (119,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (120,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (121,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (122,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (123,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (124,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (125,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (126,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (127,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (128,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (129,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (130,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (131,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (132,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (133,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (134,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (135,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (136,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (137,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (138,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (139,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (140,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (141,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (142,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (143,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (144,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (145,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (146,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (147,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (148,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (149,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (150,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (151,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (152,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (153,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (154,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (155,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (156,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (157,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes" ("seq","key") VALUES (158,'["goalboard-v1-demo","project_goals","goalboard-v1-demo"]');
INSERT INTO "sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state" ("id","device","cursor","applying") VALUES (1,'b52c68060ca60ca3ac2d3e1f91ff46cd',0,0);
INSERT INTO "sync_daec9cf494e58d382d6262de3af9_context" ("id","project_id") VALUES (1,NULL);
INSERT INTO "sync_daec9cf494e58d382d6262de3af9_replica_state" ("id","device","cursor","applying") VALUES (1,'26799b8f68227f7afbecd53937901035',0,0);
CREATE INDEX acceptance_goal_idx ON acceptance_criteria(goal_id);
CREATE INDEX artifacts_replica_changes_key ON artifacts_replica_changes(key);
CREATE INDEX attention_events_project_entry_idx
      ON attention_events(project_id, entry_id, at, event_id);
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
CREATE INDEX goal_event_requirement_conclusions_latest_idx
    ON goal_event_requirement_conclusions(project_id, goal_id, requirement_id, journal_seq);
CREATE INDEX goal_event_requirements_goal_idx
    ON goal_event_requirements(project_id, goal_id, requirement_id);
CREATE INDEX goal_event_state_owners_project_idx
    ON goal_event_state_owners(project_id, goal_id);
CREATE INDEX goal_event_trusted_decisions_goal_idx
    ON goal_event_trusted_decisions(project_id, goal_id, recorded_at);
CREATE INDEX goal_event_types_goal_idx
    ON goal_event_types(project_id, goal_id, type_id, type_version);
CREATE UNIQUE INDEX goal_trash_one_open_per_goal
    ON goal_trash_records(project_id, goal_id)
    WHERE restored_at IS NULL;
CREATE INDEX goal_trash_records_goal_idx
    ON goal_trash_records(project_id, goal_id, restored_at, trashed_at);
CREATE INDEX goal_trash_relation_records_relation_idx
    ON goal_trash_relation_records(relation_id, restored_at);
CREATE INDEX goal_tree_proposal_decisions_item_idx
    ON goal_tree_proposal_decisions(proposal_id, item_id, created_at, decision_id);
CREATE INDEX goal_tree_proposal_items_project_idx
    ON goal_tree_proposal_items(project_id, state, item_id);
CREATE INDEX goal_tree_proposal_items_proposal_idx
    ON goal_tree_proposal_items(proposal_id, ordinal, item_id);
CREATE INDEX goal_tree_proposals_project_idx
    ON goal_tree_proposals(project_id, root_goal_id, state, created_at DESC, proposal_id);
CREATE INDEX goal_tree_proposals_supersedes_idx
    ON goal_tree_proposals(supersedes_proposal_id);
CREATE INDEX goal_work_event_judgments_requirement_idx
    ON goal_work_event_judgments(requirement_id, event_id);
CREATE INDEX goal_work_events_goal_seq_idx
    ON goal_work_events(project_id, goal_id, journal_seq);
CREATE INDEX goals_archive_idx ON goals(project_id, archived_at);
CREATE INDEX goals_project_idx ON goals(project_id);
CREATE INDEX goals_ready_idx ON goals(project_id, definition_state, decomposition_state, validity_state, fulfillment_state);
CREATE INDEX goals_trash_idx ON goals(project_id, trashed_at);
CREATE UNIQUE INDEX inbox_entries_owned_subject_idx
      ON inbox_entries(project_id, owner_plugin_id, subject_type, subject_id, reason) WHERE owner_plugin_id IS NOT NULL;
CREATE INDEX inbox_entries_project_status_idx
      ON inbox_entries(project_id, status, updated_at DESC, entry_id);
CREATE INDEX inbox_entries_project_subject_idx
      ON inbox_entries(project_id, subject_type, subject_id);
CREATE UNIQUE INDEX inbox_entries_unassigned_subject_idx
      ON inbox_entries(project_id, subject_type, subject_id, reason) WHERE owner_plugin_id IS NULL;
CREATE INDEX library_artifact_versions_type_idx
    ON library_artifact_versions(artifact_type_id, schema_version, scope, lifecycle_state);
CREATE INDEX library_artifacts_project_idx
    ON library_artifacts(project_id, created_at DESC, artifact_id);
CREATE INDEX listener_deliveries_recovery_idx
      ON listener_deliveries(project_id, source_id, state, updated_at, raw_event_id);
CREATE UNIQUE INDEX plugin_events_board_sequence ON plugin_events (project_id, sequence);
CREATE INDEX plugin_events_board_type_source
      ON plugin_events (project_id, event_type_id, type_version, source_plugin_id, sequence);
CREATE INDEX plugin_notifications_pending ON plugin_notifications (project_id, created_at) WHERE delivered_at IS NULL;
CREATE INDEX policies_scope_idx ON policy_bindings(project_id, goal_id, state);
CREATE INDEX process_item_versions_type_idx
    ON process_item_versions(artifact_type_id, schema_version, scope, lifecycle_state);
CREATE INDEX process_items_project_idx
    ON process_items(project_id, created_at DESC, artifact_id);
CREATE INDEX process_items_replica_changes_key ON process_items_replica_changes(key);
CREATE INDEX project_guidance_project_idx
    ON project_guidance_entries(project_id, position, guidance_id);
CREATE INDEX project_guidance_revisions_project_idx
    ON project_guidance_revisions(project_id, guidance_id, revision DESC);
CREATE INDEX relations_from_idx ON goal_relations(project_id, from_goal_id, state);
CREATE INDEX relations_to_idx ON goal_relations(project_id, to_goal_id, state);
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
CREATE INDEX sync_fc44281fa4e6ae1ad919f15bea63_replica_changes_key ON sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key);
CREATE INDEX sync_dd6dd4054975ce4abcd1e12268d3_replica_changes_key ON sync_dd6dd4054975ce4abcd1e12268d3_replica_changes(key);
CREATE INDEX sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes_key ON sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key);
CREATE INDEX sync_21391483cd8d8dcc743c2ecd02ca_replica_changes_key ON sync_21391483cd8d8dcc743c2ecd02ca_replica_changes(key);
CREATE INDEX sync_522a4260e0bcbee35d4d9f85406c_replica_changes_key ON sync_522a4260e0bcbee35d4d9f85406c_replica_changes(key);
CREATE INDEX sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes_key ON sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key);
CREATE INDEX sync_daec9cf494e58d382d6262de3af9_replica_changes_key ON sync_daec9cf494e58d382d6262de3af9_replica_changes(key);
CREATE TRIGGER artifacts_sync_identity_delete AFTER DELETE ON library_artifacts BEGIN INSERT INTO artifacts_replica_changes(key) SELECT json_array(OLD.project_id,'artifact',OLD.artifact_id) WHERE (SELECT applying FROM artifacts_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER artifacts_sync_identity_insert AFTER INSERT ON library_artifacts BEGIN INSERT INTO artifacts_replica_changes(key) SELECT json_array(NEW.project_id,'artifact',NEW.artifact_id) WHERE (SELECT applying FROM artifacts_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER artifacts_sync_identity_update AFTER UPDATE ON library_artifacts BEGIN INSERT INTO artifacts_replica_changes(key) SELECT json_array(NEW.project_id,'artifact',NEW.artifact_id) WHERE (SELECT applying FROM artifacts_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER artifacts_sync_version_delete AFTER DELETE ON library_artifact_versions WHEN (SELECT project_id FROM library_artifacts WHERE artifact_id=OLD.artifact_id) IS NOT NULL BEGIN INSERT INTO artifacts_replica_changes(key) SELECT json_array((SELECT project_id FROM library_artifacts WHERE artifact_id=OLD.artifact_id),'artifact',OLD.artifact_id) WHERE (SELECT applying FROM artifacts_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER artifacts_sync_version_insert AFTER INSERT ON library_artifact_versions WHEN (SELECT project_id FROM library_artifacts WHERE artifact_id=NEW.artifact_id) IS NOT NULL BEGIN INSERT INTO artifacts_replica_changes(key) SELECT json_array((SELECT project_id FROM library_artifacts WHERE artifact_id=NEW.artifact_id),'artifact',NEW.artifact_id) WHERE (SELECT applying FROM artifacts_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER artifacts_sync_version_update AFTER UPDATE ON library_artifact_versions WHEN (SELECT project_id FROM library_artifacts WHERE artifact_id=NEW.artifact_id) IS NOT NULL BEGIN INSERT INTO artifacts_replica_changes(key) SELECT json_array((SELECT project_id FROM library_artifacts WHERE artifact_id=NEW.artifact_id),'artifact',NEW.artifact_id) WHERE (SELECT applying FROM artifacts_replica_state WHERE id=1)=0 AND (1=1); END;
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
CREATE TRIGGER "sync_fc44281fa4e6ae1ad919f15bea63_track_0_delete" AFTER DELETE ON "schedule_conversation_tasks" BEGIN INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',OLD."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_fc44281fa4e6ae1ad919f15bea63_track_0_insert" AFTER INSERT ON "schedule_conversation_tasks" BEGIN INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',NEW."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_fc44281fa4e6ae1ad919f15bea63_track_0_update" AFTER UPDATE ON "schedule_conversation_tasks" BEGIN INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',NEW."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0;INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',OLD."task_id") AS key WHERE 1=1 EXCEPT SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',NEW."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_fc44281fa4e6ae1ad919f15bea63_track_1_delete" AFTER DELETE ON "schedule_conversation_turns" BEGIN INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',OLD."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_fc44281fa4e6ae1ad919f15bea63_track_1_insert" AFTER INSERT ON "schedule_conversation_turns" BEGIN INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',NEW."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_fc44281fa4e6ae1ad919f15bea63_track_1_update" AFTER UPDATE ON "schedule_conversation_turns" BEGIN INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',NEW."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0;INSERT INTO sync_fc44281fa4e6ae1ad919f15bea63_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',OLD."task_id") AS key WHERE 1=1 EXCEPT SELECT json_array((SELECT project_id FROM "sync_fc44281fa4e6ae1ad919f15bea63_context" WHERE id=1),'schedule_task',NEW."task_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_fc44281fa4e6ae1ad919f15bea63_replica_state WHERE id=1)=0; END;
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
CREATE TRIGGER "sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_delete" AFTER DELETE ON "feed_sources" BEGIN INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_sources',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_insert" AFTER INSERT ON "feed_sources" BEGIN INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_sources',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_14ff60cd5b3b2f8842d99bea7ef6_track_0_update" AFTER UPDATE ON "feed_sources" BEGIN INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_sources',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0;INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_sources',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_sources',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_delete" AFTER DELETE ON "source_events" BEGIN INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_sources',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_insert" AFTER INSERT ON "source_events" BEGIN INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_sources',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_14ff60cd5b3b2f8842d99bea7ef6_track_1_update" AFTER UPDATE ON "source_events" BEGIN INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_sources',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0;INSERT INTO sync_14ff60cd5b3b2f8842d99bea7ef6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_sources',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_sources',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_14ff60cd5b3b2f8842d99bea7ef6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER sync_21391483cd8d8dcc743c2ecd02ca_attention_events_delete BEFORE DELETE ON attention_events BEGIN INSERT INTO sync_21391483cd8d8dcc743c2ecd02ca_replica_changes(key) SELECT json_array(OLD.project_id,'project_attention',OLD.project_id) WHERE (SELECT applying FROM sync_21391483cd8d8dcc743c2ecd02ca_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER sync_21391483cd8d8dcc743c2ecd02ca_attention_events_insert AFTER INSERT ON attention_events BEGIN INSERT INTO sync_21391483cd8d8dcc743c2ecd02ca_replica_changes(key) SELECT json_array(NEW.project_id,'project_attention',NEW.project_id) WHERE (SELECT applying FROM sync_21391483cd8d8dcc743c2ecd02ca_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER sync_21391483cd8d8dcc743c2ecd02ca_attention_events_update AFTER UPDATE ON attention_events BEGIN INSERT INTO sync_21391483cd8d8dcc743c2ecd02ca_replica_changes(key) SELECT json_array(NEW.project_id,'project_attention',NEW.project_id) WHERE (SELECT applying FROM sync_21391483cd8d8dcc743c2ecd02ca_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER sync_21391483cd8d8dcc743c2ecd02ca_inbox_entries_delete BEFORE DELETE ON inbox_entries BEGIN INSERT INTO sync_21391483cd8d8dcc743c2ecd02ca_replica_changes(key) SELECT json_array(OLD.project_id,'project_attention',OLD.project_id) WHERE (SELECT applying FROM sync_21391483cd8d8dcc743c2ecd02ca_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER sync_21391483cd8d8dcc743c2ecd02ca_inbox_entries_insert AFTER INSERT ON inbox_entries BEGIN INSERT INTO sync_21391483cd8d8dcc743c2ecd02ca_replica_changes(key) SELECT json_array(NEW.project_id,'project_attention',NEW.project_id) WHERE (SELECT applying FROM sync_21391483cd8d8dcc743c2ecd02ca_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER sync_21391483cd8d8dcc743c2ecd02ca_inbox_entries_update AFTER UPDATE ON inbox_entries BEGIN INSERT INTO sync_21391483cd8d8dcc743c2ecd02ca_replica_changes(key) SELECT json_array(NEW.project_id,'project_attention',NEW.project_id) WHERE (SELECT applying FROM sync_21391483cd8d8dcc743c2ecd02ca_replica_state WHERE id=1)=0 AND (1=1); END;
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
CREATE TRIGGER sync_ebbb9ae341b34cbb8aedd65a41e6_context_delete BEFORE DELETE ON context_edges WHEN OLD.scope_kind='personal' AND (json_extract(OLD.source_json,'$.module')='goals' OR json_extract(OLD.target_json,'$.module')='goals') BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT json_array(OLD.scope_id,'project_goals',OLD.scope_id) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER sync_ebbb9ae341b34cbb8aedd65a41e6_context_insert AFTER INSERT ON context_edges WHEN NEW.scope_kind='personal' AND (json_extract(NEW.source_json,'$.module')='goals' OR json_extract(NEW.target_json,'$.module')='goals') BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT json_array(NEW.scope_id,'project_goals',NEW.scope_id) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER sync_ebbb9ae341b34cbb8aedd65a41e6_context_update AFTER UPDATE ON context_edges WHEN NEW.scope_kind='personal' AND (json_extract(NEW.source_json,'$.module')='goals' OR json_extract(NEW.target_json,'$.module')='goals') BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT json_array(NEW.scope_id,'project_goals',NEW.scope_id) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER sync_ebbb9ae341b34cbb8aedd65a41e6_journal AFTER INSERT ON events WHEN substr(NEW.type,1,20)='io.molis.work.goals:' AND NEW.type NOT IN ('io.molis.work.goals:board.created') BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT json_array(NEW.project_id,'project_goals',NEW.project_id) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_delete" AFTER DELETE ON "boards" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE (1=1) AND (EXISTS (SELECT 1 FROM "goals" AS sync_exists WHERE sync_exists."project_id"=OLD."project_id") OR EXISTS (SELECT 1 FROM "project_guidance_entries" AS sync_exists WHERE sync_exists."project_id"=OLD."project_id"))) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_insert" AFTER INSERT ON "boards" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE (1=1) AND (EXISTS (SELECT 1 FROM "goals" AS sync_exists WHERE sync_exists."project_id"=NEW."project_id") OR EXISTS (SELECT 1 FROM "project_guidance_entries" AS sync_exists WHERE sync_exists."project_id"=NEW."project_id"))) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_0_update" AFTER UPDATE ON "boards" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE (1=1) AND (EXISTS (SELECT 1 FROM "goals" AS sync_exists WHERE sync_exists."project_id"=NEW."project_id") OR EXISTS (SELECT 1 FROM "project_guidance_entries" AS sync_exists WHERE sync_exists."project_id"=NEW."project_id"))) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE (1=1) AND (EXISTS (SELECT 1 FROM "goals" AS sync_exists WHERE sync_exists."project_id"=OLD."project_id") OR EXISTS (SELECT 1 FROM "project_guidance_entries" AS sync_exists WHERE sync_exists."project_id"=OLD."project_id")) EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE (1=1) AND (EXISTS (SELECT 1 FROM "goals" AS sync_exists WHERE sync_exists."project_id"=NEW."project_id") OR EXISTS (SELECT 1 FROM "project_guidance_entries" AS sync_exists WHERE sync_exists."project_id"=NEW."project_id"))) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_delete" AFTER DELETE ON "goal_event_configs" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_insert" AFTER INSERT ON "goal_event_configs" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_10_update" AFTER UPDATE ON "goal_event_configs" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_delete" AFTER DELETE ON "goal_event_config_versions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_insert" AFTER INSERT ON "goal_event_config_versions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_11_update" AFTER UPDATE ON "goal_event_config_versions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_delete" AFTER DELETE ON "goal_event_types" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_insert" AFTER INSERT ON "goal_event_types" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_12_update" AFTER UPDATE ON "goal_event_types" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_delete" AFTER DELETE ON "goal_event_requirements" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_insert" AFTER INSERT ON "goal_event_requirements" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_13_update" AFTER UPDATE ON "goal_event_requirements" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_delete" AFTER DELETE ON "goal_event_requirement_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_insert" AFTER INSERT ON "goal_event_requirement_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_14_update" AFTER UPDATE ON "goal_event_requirement_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_delete" AFTER DELETE ON "goal_work_events" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_insert" AFTER INSERT ON "goal_work_events" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_15_update" AFTER UPDATE ON "goal_work_events" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_delete" AFTER DELETE ON "goal_work_event_judgments" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_work_events" AS sync_parent WHERE 1=1 AND sync_parent."event_id"=OLD."event_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_insert" AFTER INSERT ON "goal_work_event_judgments" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_work_events" AS sync_parent WHERE 1=1 AND sync_parent."event_id"=NEW."event_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_16_update" AFTER UPDATE ON "goal_work_event_judgments" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_work_events" AS sync_parent WHERE 1=1 AND sync_parent."event_id"=NEW."event_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_work_events" AS sync_parent WHERE 1=1 AND sync_parent."event_id"=OLD."event_id" EXCEPT SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_work_events" AS sync_parent WHERE 1=1 AND sync_parent."event_id"=NEW."event_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_delete" AFTER DELETE ON "goal_event_state_owners" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_insert" AFTER INSERT ON "goal_event_state_owners" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_17_update" AFTER UPDATE ON "goal_event_state_owners" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_delete" AFTER DELETE ON "goal_event_agreements" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_insert" AFTER INSERT ON "goal_event_agreements" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_18_update" AFTER UPDATE ON "goal_event_agreements" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_delete" AFTER DELETE ON "goal_event_progress_summaries" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_insert" AFTER INSERT ON "goal_event_progress_summaries" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_19_update" AFTER UPDATE ON "goal_event_progress_summaries" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_delete" AFTER DELETE ON "goals" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_insert" AFTER INSERT ON "goals" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_1_update" AFTER UPDATE ON "goals" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_delete" AFTER DELETE ON "goal_event_concerns" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_insert" AFTER INSERT ON "goal_event_concerns" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_20_update" AFTER UPDATE ON "goal_event_concerns" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_delete" AFTER DELETE ON "goal_event_decision_requests" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_insert" AFTER INSERT ON "goal_event_decision_requests" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_21_update" AFTER UPDATE ON "goal_event_decision_requests" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_delete" AFTER DELETE ON "goal_event_applied_decisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_insert" AFTER INSERT ON "goal_event_applied_decisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_22_update" AFTER UPDATE ON "goal_event_applied_decisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_delete" AFTER DELETE ON "goal_event_requirement_conclusions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_insert" AFTER INSERT ON "goal_event_requirement_conclusions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_23_update" AFTER UPDATE ON "goal_event_requirement_conclusions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_24_delete" AFTER DELETE ON "goal_event_closures" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_24_insert" AFTER INSERT ON "goal_event_closures" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_24_update" AFTER UPDATE ON "goal_event_closures" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_25_delete" AFTER DELETE ON "goal_event_work_status" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_25_insert" AFTER INSERT ON "goal_event_work_status" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_25_update" AFTER UPDATE ON "goal_event_work_status" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_26_delete" AFTER DELETE ON "input_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_26_insert" AFTER INSERT ON "input_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_26_update" AFTER UPDATE ON "input_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_27_delete" AFTER DELETE ON "goal_tree_proposals" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_27_insert" AFTER INSERT ON "goal_tree_proposals" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_27_update" AFTER UPDATE ON "goal_tree_proposals" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_28_delete" AFTER DELETE ON "goal_tree_proposal_items" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_28_insert" AFTER INSERT ON "goal_tree_proposal_items" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_28_update" AFTER UPDATE ON "goal_tree_proposal_items" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_29_delete" AFTER DELETE ON "goal_tree_proposal_decisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_29_insert" AFTER INSERT ON "goal_tree_proposal_decisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_29_update" AFTER UPDATE ON "goal_tree_proposal_decisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_delete" AFTER DELETE ON "acceptance_criteria" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goals" AS sync_parent WHERE 1=1 AND sync_parent."goal_id"=OLD."goal_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_insert" AFTER INSERT ON "acceptance_criteria" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goals" AS sync_parent WHERE 1=1 AND sync_parent."goal_id"=NEW."goal_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_2_update" AFTER UPDATE ON "acceptance_criteria" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goals" AS sync_parent WHERE 1=1 AND sync_parent."goal_id"=NEW."goal_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goals" AS sync_parent WHERE 1=1 AND sync_parent."goal_id"=OLD."goal_id" EXCEPT SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goals" AS sync_parent WHERE 1=1 AND sync_parent."goal_id"=NEW."goal_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_30_delete" AFTER DELETE ON "goal_event_trusted_decisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_30_insert" AFTER INSERT ON "goal_event_trusted_decisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_30_update" AFTER UPDATE ON "goal_event_trusted_decisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_delete" AFTER DELETE ON "goal_relations" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_insert" AFTER INSERT ON "goal_relations" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_3_update" AFTER UPDATE ON "goal_relations" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_delete" AFTER DELETE ON "goal_trash_records" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_insert" AFTER INSERT ON "goal_trash_records" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_4_update" AFTER UPDATE ON "goal_trash_records" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_delete" AFTER DELETE ON "goal_trash_relation_records" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_trash_records" AS sync_parent WHERE 1=1 AND sync_parent."trash_record_id"=OLD."trash_record_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_insert" AFTER INSERT ON "goal_trash_relation_records" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_trash_records" AS sync_parent WHERE 1=1 AND sync_parent."trash_record_id"=NEW."trash_record_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_5_update" AFTER UPDATE ON "goal_trash_relation_records" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_trash_records" AS sync_parent WHERE 1=1 AND sync_parent."trash_record_id"=NEW."trash_record_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_trash_records" AS sync_parent WHERE 1=1 AND sync_parent."trash_record_id"=OLD."trash_record_id" EXCEPT SELECT json_array(sync_parent."project_id",'project_goals',sync_parent."project_id") AS key FROM "goal_trash_records" AS sync_parent WHERE 1=1 AND sync_parent."trash_record_id"=NEW."trash_record_id") WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_delete" AFTER DELETE ON "policy_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_insert" AFTER INSERT ON "policy_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_6_update" AFTER UPDATE ON "policy_bindings" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_delete" AFTER DELETE ON "project_guidance_entries" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_insert" AFTER INSERT ON "project_guidance_entries" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_7_update" AFTER UPDATE ON "project_guidance_entries" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_delete" AFTER DELETE ON "project_guidance_revisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_insert" AFTER INSERT ON "project_guidance_revisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_8_update" AFTER UPDATE ON "project_guidance_revisions" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_delete" AFTER DELETE ON "planning_method_packs" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_insert" AFTER INSERT ON "planning_method_packs" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_ebbb9ae341b34cbb8aedd65a41e6_track_9_update" AFTER UPDATE ON "planning_method_packs" BEGIN INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0;INSERT INTO sync_ebbb9ae341b34cbb8aedd65a41e6_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'project_goals',OLD."project_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'project_goals',NEW."project_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_ebbb9ae341b34cbb8aedd65a41e6_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_daec9cf494e58d382d6262de3af9_track_0_delete" AFTER DELETE ON "feed_out_rules" BEGIN INSERT INTO sync_daec9cf494e58d382d6262de3af9_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'feed_rule',OLD."rule_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_daec9cf494e58d382d6262de3af9_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_daec9cf494e58d382d6262de3af9_track_0_insert" AFTER INSERT ON "feed_out_rules" BEGIN INSERT INTO sync_daec9cf494e58d382d6262de3af9_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'feed_rule',NEW."rule_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_daec9cf494e58d382d6262de3af9_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_daec9cf494e58d382d6262de3af9_track_0_update" AFTER UPDATE ON "feed_out_rules" BEGIN INSERT INTO sync_daec9cf494e58d382d6262de3af9_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'feed_rule',NEW."rule_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_daec9cf494e58d382d6262de3af9_replica_state WHERE id=1)=0;INSERT INTO sync_daec9cf494e58d382d6262de3af9_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'feed_rule',OLD."rule_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'feed_rule',NEW."rule_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_daec9cf494e58d382d6262de3af9_replica_state WHERE id=1)=0; END;
PRAGMA user_version=1;
PRAGMA foreign_keys=ON;
