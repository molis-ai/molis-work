-- The project database baseline, version 2 (repository-anti-corruption §4.1): the schema a new project database gets.
-- Generated from PROJECT_DATABASE_BASELINE; a change to any owner's tables means a new version and a new snapshot.
CREATE TABLE acceptance_criteria (
    criterion_id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    decision_method TEXT NOT NULL,
    pass_condition TEXT NOT NULL,
    target_json TEXT,
    required_evidence_json TEXT NOT NULL DEFAULT '[]'
  );
CREATE TABLE attention_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      at TEXT NOT NULL
    );
CREATE TABLE boards (
          board_id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          active_goal_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
CREATE TABLE casebook_goal_contexts (
 board TEXT NOT NULL, interaction_epoch TEXT NOT NULL, context_epoch TEXT NOT NULL,
 operation_id TEXT NOT NULL, phase TEXT NOT NULL, body TEXT NOT NULL,
 PRIMARY KEY(board,interaction_epoch,context_epoch,operation_id,phase));
CREATE TABLE casebook_interaction_actions (
 board TEXT NOT NULL, key TEXT NOT NULL, digest TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(board,key));
CREATE TABLE casebook_interaction_audit_keys (board TEXT PRIMARY KEY, secret TEXT NOT NULL);
CREATE TABLE casebook_interaction_facts (
 board TEXT NOT NULL, epoch TEXT NOT NULL, seq INTEGER NOT NULL, id TEXT NOT NULL UNIQUE, body TEXT NOT NULL,
 PRIMARY KEY(board,epoch,seq));
CREATE TABLE casebook_interaction_scopes (
 board TEXT PRIMARY KEY, epoch TEXT NOT NULL, state TEXT NOT NULL, secret TEXT NOT NULL, since TEXT NOT NULL, pauses INTEGER NOT NULL DEFAULT 0);
CREATE TABLE claims (
    claim_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    actor_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
    contract_revision INTEGER NOT NULL DEFAULT 1,
    action_kind TEXT,
    action_target_id TEXT,
    state TEXT NOT NULL CHECK (state IN ('active', 'released', 'expired', 'revoked')),
    capabilities_json TEXT NOT NULL DEFAULT '[]',
    goal_mode_attestation INTEGER NOT NULL DEFAULT 0,
    resolved_policy_json TEXT NOT NULL,
    claimed_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    renewed_at TEXT,
    released_at TEXT,
    release_reason TEXT
  );
CREATE TABLE clarification_sessions (
          session_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          claim_id TEXT REFERENCES claims(claim_id),
          run_id TEXT REFERENCES runs(run_id),
          rough_idea TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('clarifying', 'proposal_ready', 'closed')),
          current_understanding TEXT,
          next_question TEXT,
          proposal_summary TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          closed_at TEXT
        );
CREATE TABLE clarification_turns (
          turn_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES clarification_sessions(session_id) ON DELETE CASCADE,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          run_id TEXT REFERENCES runs(run_id),
          actor_id TEXT NOT NULL,
          turn_index INTEGER NOT NULL,
          turn_kind TEXT NOT NULL CHECK (turn_kind IN ('rough_idea', 'user_answer')),
          user_message TEXT NOT NULL,
          current_understanding TEXT,
          known_facts_json TEXT NOT NULL DEFAULT '[]',
          assumptions_json TEXT NOT NULL DEFAULT '[]',
          next_question TEXT,
          proposal_summary TEXT,
          created_at TEXT NOT NULL,
          UNIQUE(session_id, turn_index)
        );
CREATE TABLE coding_plan_drafts (
      board_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      draft_json TEXT NOT NULL,
      PRIMARY KEY (board_id, session_id),
      FOREIGN KEY (board_id, session_id) REFERENCES coding_sessions(board_id, session_id) ON DELETE CASCADE
    );
CREATE TABLE coding_sessions (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
      PRIMARY KEY (board_id, session_id)
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
CREATE TABLE coverage_contract_revisions (
    parent_goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    child_goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    parent_contract_revision INTEGER NOT NULL,
    child_contract_revision INTEGER NOT NULL,
    recorded_at TEXT NOT NULL,
    PRIMARY KEY (parent_goal_id, child_goal_id, parent_contract_revision)
  );
CREATE TABLE events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL UNIQUE,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          actor_id TEXT NOT NULL,
          type TEXT NOT NULL,
          object_type TEXT NOT NULL,
          object_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          at TEXT NOT NULL
        );
CREATE TABLE evidence (
    evidence_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    contract_revision INTEGER NOT NULL DEFAULT 1,
    criterion_ids_json TEXT NOT NULL,
    producer_actor_id TEXT NOT NULL,
    run_id TEXT REFERENCES runs(run_id),
    review_id TEXT,
    kind TEXT NOT NULL,
    locator TEXT NOT NULL,
    locator_status TEXT NOT NULL DEFAULT 'unverified' CHECK (locator_status IN ('verified', 'unverified')),
    locator_validation_reason TEXT NOT NULL DEFAULT '历史 Evidence 未进行 locator 预检',
    locator_checked_at TEXT,
    locator_workspace_id TEXT,
    locator_workspace_root TEXT,
    digest TEXT,
    captured_at TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('passed', 'failed', 'inconclusive')),
    historical_unmapped INTEGER NOT NULL DEFAULT 0
  );
CREATE TABLE evidence_corrections (
    correction_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    target_evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence(evidence_id),
    action TEXT NOT NULL CHECK (action IN ('supersede', 'retract')),
    replacement_evidence_id TEXT REFERENCES evidence(evidence_id),
    actor_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK (
      (action = 'supersede' AND replacement_evidence_id IS NOT NULL) OR
      (action = 'retract' AND replacement_evidence_id IS NULL)
    )
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
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
      disposition TEXT NOT NULL CHECK (disposition IN ('inbox', 'saved', 'promoted', 'processing', 'archived')),
      read_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      source_created_at TEXT NOT NULL,
      source_updated_at TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, item_id)
    );
CREATE TABLE feed_materials (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
      PRIMARY KEY (board_id, material_id),
      FOREIGN KEY (board_id, item_id) REFERENCES feed_items(board_id, item_id) ON DELETE CASCADE
    );
CREATE TABLE feed_out_rules (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      match_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      function_key TEXT,
      admission TEXT NOT NULL DEFAULT 'suggest',
      judgment_json TEXT,
      revision TEXT,
      PRIMARY KEY (board_id, rule_id)
    );
CREATE TABLE feed_runtime_blobs (
    namespace TEXT NOT NULL, key TEXT NOT NULL, opaque TEXT NOT NULL, cas_token TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
  );
CREATE TABLE feed_source_runs (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
      PRIMARY KEY (board_id, run_id),
      UNIQUE (board_id, operation_id)
    );
CREATE TABLE feed_sources (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
      PRIMARY KEY (board_id, source_id)
);
CREATE TABLE goal_contract_revisions (
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    contract_json TEXT NOT NULL,
    effect TEXT NOT NULL CHECK (effect IN ('metadata', 'revalidate', 'rework')),
    source_proposal_id TEXT,
    changed_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (goal_id, revision)
  );
CREATE TABLE goal_event_agreements (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    outcome TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    event_id TEXT,
    PRIMARY KEY (board_id, goal_id, version)
  );
CREATE TABLE goal_event_applied_decisions (
    decision_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    adopted_planning_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    config_event_id TEXT NOT NULL,
    PRIMARY KEY (board_id, goal_id, version)
  );
CREATE TABLE goal_event_configs (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    current_version INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    PRIMARY KEY (board_id, goal_id)
  );
CREATE TABLE goal_event_decision_requests (
    request_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    type_id TEXT NOT NULL,
    requirement_id TEXT NOT NULL,
    created_in_config_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (board_id, goal_id, type_id, requirement_id)
  );
CREATE TABLE goal_event_requirement_conclusions (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    requirement_id TEXT NOT NULL,
    decision_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('accepted', 'rejected')),
    received_at TEXT NOT NULL,
    journal_seq INTEGER NOT NULL,
    PRIMARY KEY (board_id, goal_id, requirement_id, decision_id)
  );
CREATE TABLE goal_event_requirements (
    requirement_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    owner TEXT NOT NULL CHECK (owner = 'event_work'),
    source TEXT NOT NULL CHECK (source IN ('intent', 'configuration', 'continue', 'migration')),
    adopted_at TEXT NOT NULL,
    adopted_by TEXT NOT NULL,
    PRIMARY KEY (goal_id)
  );
CREATE TABLE goal_event_trusted_decisions (
    decision_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    PRIMARY KEY (board_id, goal_id, type_id, type_version)
  );
CREATE TABLE goal_event_work_status (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    work_status TEXT NOT NULL CHECK (work_status IN ('open', 'completed', 'cancelled')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (goal_id)
  );
CREATE TABLE goal_relations (
    relation_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    from_goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    to_goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    type TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('proposed', 'active', 'inactive')),
    reason TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deactivated_at TEXT
  );
CREATE TABLE goal_risks (
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    risk_id TEXT NOT NULL REFERENCES risks(risk_id) ON DELETE CASCADE,
    PRIMARY KEY (goal_id, risk_id)
  );
CREATE TABLE goal_trash_records (
    trash_record_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('goal', 'contract', 'relation', 'dependency', 'risk', 'policy', 'candidate', 'rewire')),
    operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'deactivate')),
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    root_goal_id TEXT REFERENCES goals(goal_id) ON DELETE SET NULL,
    submitted_by TEXT NOT NULL,
    discovered_in_run_id TEXT REFERENCES runs(run_id) ON DELETE SET NULL,
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    current_contract_revision INTEGER NOT NULL DEFAULT 1,
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
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          actor_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          outcome_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (board_id, actor_id, operation, idempotency_key)
        );
CREATE TABLE impact_bindings (
    binding_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    surface TEXT NOT NULL,
    access TEXT NOT NULL CHECK (access IN ('read', 'write', 'decide', 'exclusive')),
    input_snapshot TEXT,
    state TEXT NOT NULL CHECK (state IN ('proposed', 'confirmed', 'inactive')),
    reason TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    deactivated_at TEXT, deactivation_reason TEXT
  );
CREATE TABLE inbox_entries (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      subject_type TEXT NOT NULL CHECK (subject_type IN ('feed_item', 'goal_decision', 'source_fault')),
      subject_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('manual', 'source_rule', 'goal_decision', 'source_fault', 'artifact_out_failed')),
      status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'dismissed')),
      detail_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      PRIMARY KEY (board_id, entry_id),
      UNIQUE (board_id, subject_type, subject_id, reason)
);
CREATE TABLE input_bindings (
    binding_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    owner_actor_id TEXT NOT NULL,
    producer_plugin_id TEXT NOT NULL,
    producer_binding_signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (artifact_id, board_id)
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
CREATE TABLE planning_method_packs (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    method_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    pack_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (board_id, method_id)
  );
CREATE TABLE plugin_event_cursors (
      board_id TEXT NOT NULL,
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
      PRIMARY KEY (board_id, subscriber_plugin_id, subscriber_install_id, subscriber_generation, source_plugin_id, event_type_id, type_version)
    );
CREATE TABLE plugin_event_resolutions (
      resolution_id TEXT PRIMARY KEY, board_id TEXT NOT NULL, subscriber_plugin_id TEXT NOT NULL, record_json TEXT NOT NULL
    );
CREATE TABLE plugin_events (
      event_id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
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
      board_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, plugin_id)
    );
CREATE TABLE plugin_port_artifact_bindings (
      board_id TEXT NOT NULL,
      target_plugin_id TEXT NOT NULL,
      target_port TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (board_id, target_plugin_id, target_port)
    );
CREATE TABLE plugin_port_bindings (
      board_id TEXT NOT NULL,
      target_plugin_id TEXT NOT NULL,
      target_port TEXT NOT NULL,
      source_plugin_id TEXT NOT NULL,
      source_port TEXT NOT NULL,
      origin TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, target_plugin_id, target_port)
    );
CREATE TABLE plugin_port_outputs (
      board_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      port TEXT NOT NULL,
      artifact_id TEXT,
      version INTEGER,
      invalidated_reason TEXT,
      scope_key TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, plugin_id, port)
    );
CREATE TABLE plugin_private_values (
      install_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      item_value TEXT NOT NULL,
      PRIMARY KEY (install_id, item_key)
    );
CREATE TABLE plugin_runtime_installs (install_id TEXT PRIMARY KEY, record_json TEXT NOT NULL);
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    owner_actor_id TEXT NOT NULL,
    producer_plugin_id TEXT NOT NULL,
    producer_binding_signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (artifact_id, board_id)
  );
CREATE TABLE project_browsing_settings (
    board_id TEXT PRIMARY KEY, workspace_id TEXT
  );
CREATE TABLE project_guidance_entries (
    guidance_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
    UNIQUE(board_id, position),
    UNIQUE(board_id, kind, content_hash)
  );
CREATE TABLE project_guidance_revisions (
    revision_id TEXT PRIMARY KEY,
    guidance_id TEXT NOT NULL REFERENCES project_guidance_entries(guidance_id) ON DELETE CASCADE,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
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
CREATE TABLE review_obligations (
    obligation_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    contract_revision INTEGER NOT NULL DEFAULT 1,
    role TEXT NOT NULL CHECK (role IN ('self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'human_approver')),
    required_count INTEGER NOT NULL,
    independence_rule TEXT NOT NULL,
    criterion_scope_json TEXT NOT NULL DEFAULT '[]',
    state TEXT NOT NULL CHECK (state IN ('pending', 'satisfied', 'waived')),
    created_at TEXT NOT NULL
  );
CREATE TABLE reviews (
    review_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    obligation_id TEXT NOT NULL REFERENCES review_obligations(obligation_id),
    claim_id TEXT REFERENCES claims(claim_id),
    actor_id TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'fail', 'needs_changes', 'inconclusive')),
    evidence_refs_json TEXT NOT NULL DEFAULT '[]',
    reasoning TEXT NOT NULL,
    submitted_at TEXT NOT NULL
  );
CREATE TABLE risks (
    risk_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    probability TEXT NOT NULL,
    impact TEXT NOT NULL,
    affected_surfaces_json TEXT NOT NULL DEFAULT '[]',
    trigger TEXT NOT NULL,
    treatment TEXT NOT NULL,
    treatment_plan TEXT NOT NULL DEFAULT '',
    blocking_mode TEXT NOT NULL CHECK (blocking_mode IN ('none', 'claim', 'completion', 'invalidate_on_trigger')),
    revisit_condition TEXT NOT NULL,
    owner TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('open', 'triggered', 'resolved', 'accepted', 'expired')),
    resolution_basis_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE runs (
    run_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    claim_id TEXT NOT NULL REFERENCES claims(claim_id),
    actor_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
    state TEXT NOT NULL CHECK (state IN ('started', 'blocked', 'completed', 'failed', 'abandoned')),
    block_reason TEXT,
    output_refs_json TEXT NOT NULL DEFAULT '[]',
    discovery_refs_json TEXT NOT NULL DEFAULT '[]',
    started_at TEXT NOT NULL,
    ended_at TEXT
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
    board_id TEXT NOT NULL, operation_id TEXT NOT NULL, due_at TEXT NOT NULL, record_json TEXT NOT NULL,
    PRIMARY KEY (board_id, operation_id, due_at)
  );
CREATE TABLE schedule_operations (
    board_id TEXT NOT NULL, id TEXT NOT NULL, job_id TEXT NOT NULL UNIQUE, record_json TEXT NOT NULL,
    PRIMARY KEY (board_id, id)
  );
CREATE TABLE schedule_plugin_reminders (
    id TEXT PRIMARY KEY, board_id TEXT NOT NULL, plugin_id TEXT NOT NULL, installation_id TEXT,
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
CREATE INDEX acceptance_goal_idx ON acceptance_criteria(goal_id);
CREATE INDEX attention_events_project_entry_idx
      ON attention_events(project_id, entry_id, at, event_id);
CREATE INDEX claims_action_idx ON claims(board_id, action_kind, action_target_id, state);
CREATE INDEX claims_board_state_idx ON claims(board_id, state, expires_at);
CREATE INDEX claims_goal_idx ON claims(goal_id, state);
CREATE UNIQUE INDEX claims_one_active_per_goal ON claims(goal_id) WHERE state = 'active';
CREATE UNIQUE INDEX clarification_one_open_session_per_goal
          ON clarification_sessions(goal_id)
          WHERE state != 'closed';
CREATE INDEX clarification_sessions_goal_idx
          ON clarification_sessions(board_id, goal_id, updated_at DESC, session_id);
CREATE INDEX clarification_turns_session_idx
          ON clarification_turns(session_id, turn_index, turn_id);
CREATE INDEX coding_sessions_board_updated_idx
      ON coding_sessions(board_id, updated_at DESC, session_id);
CREATE INDEX context_edges_source_idx ON context_edges
    (scope_kind, scope_id, relation_type, json_extract(source_json, '$.module'), json_extract(source_json, '$.id'));
CREATE INDEX coverage_contract_revisions_child_idx
    ON coverage_contract_revisions(child_goal_id, child_contract_revision);
CREATE INDEX events_board_idx ON events(board_id, seq);
CREATE INDEX evidence_corrections_goal_idx
    ON evidence_corrections(board_id, goal_id, created_at, correction_id);
CREATE INDEX evidence_goal_idx ON evidence(goal_id, result);
CREATE INDEX feed_item_events_project_item_idx
      ON feed_item_events(project_id, item_id, at, event_id);
CREATE UNIQUE INDEX feed_items_board_signal_idx
      ON feed_items(board_id, signal_id) WHERE signal_id IS NOT NULL;
CREATE UNIQUE INDEX feed_items_board_source_external_idx
      ON feed_items(board_id, source_id, external_id)
      WHERE source_id IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX feed_items_board_updated_idx
      ON feed_items(board_id, disposition, source_updated_at DESC);
CREATE INDEX feed_materials_board_item_idx
      ON feed_materials(board_id, item_id, updated_at DESC, material_id);
CREATE INDEX feed_out_rules_board_enabled_idx
      ON feed_out_rules(board_id, enabled, created_at, rule_id);
CREATE INDEX feed_source_runs_board_source_idx
      ON feed_source_runs(board_id, source_id, started_at DESC);
CREATE INDEX feed_sources_board_updated_idx
      ON feed_sources(board_id, updated_at DESC, source_id);
CREATE INDEX goal_contract_revisions_board_idx
    ON goal_contract_revisions(board_id, goal_id, revision DESC);
CREATE INDEX goal_event_applied_decisions_goal_idx
    ON goal_event_applied_decisions(board_id, goal_id, recorded_at);
CREATE INDEX goal_event_closures_goal_idx
    ON goal_event_closures(board_id, goal_id, recorded_at);
CREATE INDEX goal_event_concerns_goal_idx
    ON goal_event_concerns(board_id, goal_id, status);
CREATE INDEX goal_event_decision_requests_goal_idx
    ON goal_event_decision_requests(board_id, goal_id, status);
CREATE INDEX goal_event_progress_summaries_goal_idx
    ON goal_event_progress_summaries(board_id, goal_id, recorded_at);
CREATE INDEX goal_event_requirement_conclusions_latest_idx
    ON goal_event_requirement_conclusions(board_id, goal_id, requirement_id, journal_seq);
CREATE INDEX goal_event_requirements_goal_idx
    ON goal_event_requirements(board_id, goal_id, requirement_id);
CREATE INDEX goal_event_state_owners_board_idx
    ON goal_event_state_owners(board_id, goal_id);
CREATE INDEX goal_event_trusted_decisions_goal_idx
    ON goal_event_trusted_decisions(board_id, goal_id, recorded_at);
CREATE INDEX goal_event_types_goal_idx
    ON goal_event_types(board_id, goal_id, type_id, type_version);
CREATE UNIQUE INDEX goal_trash_one_open_per_goal
    ON goal_trash_records(board_id, goal_id)
    WHERE restored_at IS NULL;
CREATE INDEX goal_trash_records_goal_idx
    ON goal_trash_records(board_id, goal_id, restored_at, trashed_at);
CREATE INDEX goal_trash_relation_records_relation_idx
    ON goal_trash_relation_records(relation_id, restored_at);
CREATE INDEX goal_tree_proposal_decisions_item_idx
    ON goal_tree_proposal_decisions(proposal_id, item_id, created_at, decision_id);
CREATE INDEX goal_tree_proposal_items_board_idx
    ON goal_tree_proposal_items(board_id, state, item_id);
CREATE INDEX goal_tree_proposal_items_proposal_idx
    ON goal_tree_proposal_items(proposal_id, ordinal, item_id);
CREATE INDEX goal_tree_proposals_board_idx
    ON goal_tree_proposals(board_id, root_goal_id, state, created_at DESC, proposal_id);
CREATE INDEX goal_tree_proposals_supersedes_idx
    ON goal_tree_proposals(supersedes_proposal_id);
CREATE INDEX goal_work_event_judgments_requirement_idx
    ON goal_work_event_judgments(requirement_id, event_id);
CREATE INDEX goal_work_events_goal_seq_idx
    ON goal_work_events(board_id, goal_id, journal_seq);
CREATE INDEX goals_archive_idx ON goals(board_id, archived_at);
CREATE INDEX goals_board_idx ON goals(board_id);
CREATE INDEX goals_ready_idx ON goals(board_id, definition_state, decomposition_state, validity_state, fulfillment_state);
CREATE INDEX goals_trash_idx ON goals(board_id, trashed_at);
CREATE INDEX impacts_goal_idx ON impact_bindings(board_id, goal_id, state);
CREATE INDEX impacts_surface_idx ON impact_bindings(board_id, surface, state);
CREATE INDEX inbox_entries_board_status_idx
      ON inbox_entries(board_id, status, updated_at DESC, entry_id);
CREATE INDEX inbox_entries_board_subject_idx
      ON inbox_entries(board_id, subject_type, subject_id);
CREATE INDEX library_artifact_versions_type_idx
    ON library_artifact_versions(artifact_type_id, schema_version, scope, lifecycle_state);
CREATE INDEX library_artifacts_board_idx
    ON library_artifacts(board_id, created_at DESC, artifact_id);
CREATE INDEX listener_deliveries_recovery_idx
      ON listener_deliveries(project_id, source_id, state, updated_at, raw_event_id);
CREATE UNIQUE INDEX plugin_events_board_sequence ON plugin_events (board_id, sequence);
CREATE INDEX plugin_events_board_type_source
      ON plugin_events (board_id, event_type_id, type_version, source_plugin_id, sequence);
CREATE INDEX policies_scope_idx ON policy_bindings(board_id, goal_id, state);
CREATE INDEX process_item_versions_type_idx
    ON process_item_versions(artifact_type_id, schema_version, scope, lifecycle_state);
CREATE INDEX process_items_board_idx
    ON process_items(board_id, created_at DESC, artifact_id);
CREATE INDEX project_guidance_board_idx
    ON project_guidance_entries(board_id, position, guidance_id);
CREATE INDEX project_guidance_revisions_board_idx
    ON project_guidance_revisions(board_id, guidance_id, revision DESC);
CREATE INDEX relations_from_idx ON goal_relations(board_id, from_goal_id, state);
CREATE INDEX relations_to_idx ON goal_relations(board_id, to_goal_id, state);
CREATE INDEX reviews_obligation_idx ON reviews(obligation_id, verdict);
CREATE UNIQUE INDEX runs_one_nonterminal_per_claim ON runs(claim_id) WHERE state IN ('started', 'blocked');
CREATE INDEX schedule_conversation_tasks_enabled_idx
      ON schedule_conversation_tasks(enabled, updated_at);
CREATE INDEX schedule_conversation_turns_task_idx
      ON schedule_conversation_turns(task_id, created_at);
CREATE INDEX schedule_jobs_due_idx
      ON schedule_jobs(enabled, next_due_at);
CREATE INDEX schedule_plugin_reminders_owner ON schedule_plugin_reminders(board_id, plugin_id, installation_id);
CREATE INDEX signal_events_project_source_idx
      ON signal_events(project_id, source_id, at, event_id);
CREATE INDEX signals_project_source_observed_idx
      ON signals(project_id, source_id, observed_at DESC, signal_id);
CREATE INDEX source_events_project_source_idx
      ON source_events(project_id, source_id, at, event_id);
