-- Current platform/module project database baseline, version 16. Plugin declarations are separate.
CREATE TABLE IF NOT EXISTS molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS project_root (
      project_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );


  CREATE TABLE IF NOT EXISTS library_artifacts (
    artifact_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
    owner_actor_id TEXT NOT NULL,
    producer_plugin_id TEXT NOT NULL,
    producer_binding_signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (artifact_id, project_id)
  );
  CREATE INDEX IF NOT EXISTS library_artifacts_project_idx
    ON library_artifacts(project_id, created_at DESC, artifact_id);

  CREATE TABLE IF NOT EXISTS library_artifact_versions (
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
  CREATE INDEX IF NOT EXISTS library_artifact_versions_type_idx
    ON library_artifact_versions(artifact_type_id, schema_version, scope, lifecycle_state);


  CREATE TABLE IF NOT EXISTS process_items (
    artifact_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
    owner_actor_id TEXT NOT NULL,
    producer_plugin_id TEXT NOT NULL,
    producer_binding_signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (artifact_id, project_id)
  );
  CREATE INDEX IF NOT EXISTS process_items_project_idx
    ON process_items(project_id, created_at DESC, artifact_id);

  CREATE TABLE IF NOT EXISTS process_item_versions (
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
  CREATE INDEX IF NOT EXISTS process_item_versions_type_idx
    ON process_item_versions(artifact_type_id, schema_version, scope, lifecycle_state);


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
        CREATE INDEX events_project_idx ON events(project_id, seq);


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
  CREATE INDEX context_edges_source_idx ON context_edges
    (scope_kind, scope_id, relation_type, json_extract(source_json, '$.module'), json_extract(source_json, '$.id'));


    CREATE TABLE IF NOT EXISTS feed_sources (
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
    CREATE INDEX IF NOT EXISTS feed_sources_project_updated_idx
      ON feed_sources(project_id, updated_at DESC, source_id);

    CREATE TABLE IF NOT EXISTS source_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('source.created', 'source.updated', 'source.status_changed', 'source.retired')),
      payload_json TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS source_events_project_source_idx
      ON source_events(project_id, source_id, at, event_id);


    CREATE TABLE IF NOT EXISTS signals (
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
    CREATE INDEX IF NOT EXISTS signals_project_source_observed_idx
      ON signals(project_id, source_id, observed_at DESC, signal_id);

    CREATE TABLE IF NOT EXISTS signal_revisions (
      project_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      draft_json TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      PRIMARY KEY (project_id, signal_id, revision)
    );

    CREATE TABLE IF NOT EXISTS signal_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('signal.accepted', 'signal.changed')),
      revision INTEGER NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS signal_events_project_source_idx
      ON signal_events(project_id, source_id, at, event_id);


    CREATE TABLE IF NOT EXISTS listener_instances (
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

    CREATE TABLE IF NOT EXISTS listener_deliveries (
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
    CREATE INDEX IF NOT EXISTS listener_deliveries_recovery_idx
      ON listener_deliveries(project_id, source_id, state, updated_at, raw_event_id);

    -- The run ledger belongs to Listener Host and names its Source by id only: the Source table is modules/sources' own, and
    -- a Source's runs are forgotten explicitly (deleteListenerSourceState), never through another owner's foreign key.
    CREATE TABLE IF NOT EXISTS feed_source_runs (
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
    CREATE INDEX IF NOT EXISTS feed_source_runs_project_source_idx
      ON feed_source_runs(project_id, source_id, started_at DESC);


    CREATE TABLE IF NOT EXISTS inbox_entries (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
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
      PRIMARY KEY (project_id, entry_id),
      UNIQUE (project_id, subject_type, subject_id, reason)
);
    CREATE INDEX IF NOT EXISTS inbox_entries_project_status_idx
      ON inbox_entries(project_id, status, updated_at DESC, entry_id);
    CREATE INDEX IF NOT EXISTS inbox_entries_project_subject_idx
      ON inbox_entries(project_id, subject_type, subject_id);

    CREATE TABLE IF NOT EXISTS attention_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS attention_events_project_entry_idx
      ON attention_events(project_id, entry_id, at, event_id);


    CREATE TABLE IF NOT EXISTS feed_items (
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
      disposition TEXT NOT NULL CHECK (disposition IN ('inbox', 'saved', 'promoted', 'processing', 'archived')),
      read_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      source_created_at TEXT NOT NULL,
      source_updated_at TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS feed_items_project_updated_idx
      ON feed_items(project_id, disposition, source_updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS feed_items_project_source_external_idx
      ON feed_items(project_id, source_id, external_id)
      WHERE source_id IS NOT NULL AND external_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS feed_materials (
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
    CREATE INDEX IF NOT EXISTS feed_materials_project_item_idx
      ON feed_materials(project_id, item_id, updated_at DESC, material_id);

    CREATE TABLE IF NOT EXISTS feed_item_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS feed_item_events_project_item_idx
      ON feed_item_events(project_id, item_id, at, event_id);

    CREATE UNIQUE INDEX IF NOT EXISTS feed_items_project_signal_idx
      ON feed_items(project_id, signal_id) WHERE signal_id IS NOT NULL;


  CREATE TABLE IF NOT EXISTS feed_runtime_blobs (
    namespace TEXT NOT NULL, key TEXT NOT NULL, opaque TEXT NOT NULL, cas_token TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
  );


    CREATE TABLE IF NOT EXISTS plugin_runtime_installs (install_id TEXT PRIMARY KEY, record_json TEXT NOT NULL);


    CREATE TABLE IF NOT EXISTS plugin_runtime_release_artifacts (
      plugin_id TEXT NOT NULL,
      publisher_signature TEXT NOT NULL,
      version TEXT NOT NULL,
      manifest_digest TEXT NOT NULL,
      artifact_json TEXT NOT NULL,
      PRIMARY KEY (plugin_id, publisher_signature, version, manifest_digest)
    );


    CREATE TABLE IF NOT EXISTS plugin_private_values (
      install_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      item_value TEXT NOT NULL,
      PRIMARY KEY (install_id, item_key)
    );


    CREATE TABLE IF NOT EXISTS plugin_events (
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
    CREATE UNIQUE INDEX IF NOT EXISTS plugin_events_board_sequence ON plugin_events (project_id, sequence);
    CREATE INDEX IF NOT EXISTS plugin_events_board_type_source
      ON plugin_events (project_id, event_type_id, type_version, source_plugin_id, sequence);
    CREATE TABLE IF NOT EXISTS plugin_event_cursors (
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
    CREATE TABLE IF NOT EXISTS plugin_event_resolutions (
      resolution_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, subscriber_plugin_id TEXT NOT NULL, record_json TEXT NOT NULL
    );


    CREATE TABLE IF NOT EXISTS plugin_port_bindings (
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
    CREATE TABLE IF NOT EXISTS plugin_port_artifact_bindings (
      project_id TEXT NOT NULL,
      target_plugin_id TEXT NOT NULL,
      target_port TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, target_plugin_id, target_port)
    );
    CREATE TABLE IF NOT EXISTS plugin_input_groups (
      project_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id)
    );
    CREATE TABLE IF NOT EXISTS plugin_port_outputs (
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


    CREATE TABLE IF NOT EXISTS plugin_project_databases (
      plugin_id TEXT PRIMARY KEY,
      publisher_signature TEXT NOT NULL,
      store_name TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL CHECK (version >= 1),
      tables_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );


    CREATE TABLE IF NOT EXISTS schedule_jobs (
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
    CREATE INDEX IF NOT EXISTS schedule_jobs_due_idx
      ON schedule_jobs(enabled, next_due_at);

    CREATE TABLE IF NOT EXISTS schedule_wakeups (
      wakeup_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      due_at TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('ok', 'failed', 'plugin_unavailable')),
      detail TEXT,
      FOREIGN KEY (job_id) REFERENCES schedule_jobs(job_id)
    );


  CREATE TABLE IF NOT EXISTS project_browsing_settings (
    project_id TEXT PRIMARY KEY, workspace_id TEXT
  );

    CREATE TABLE IF NOT EXISTS goals_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS goals_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS goals_replica_changes_key ON goals_replica_changes(key);
    CREATE TABLE IF NOT EXISTS goals_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS goals_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS goals_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS goals_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS artifacts_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS artifacts_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS artifacts_replica_changes_key ON artifacts_replica_changes(key);
    CREATE TABLE IF NOT EXISTS artifacts_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS artifacts_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS artifacts_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS artifacts_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS process_items_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS process_items_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS process_items_replica_changes_key ON process_items_replica_changes(key);
    CREATE TABLE IF NOT EXISTS process_items_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS process_items_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS process_items_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS process_items_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS schedule_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS schedule_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS schedule_replica_changes_key ON schedule_replica_changes(key);
    CREATE TABLE IF NOT EXISTS schedule_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS schedule_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS schedule_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS schedule_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS feed_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS feed_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS feed_replica_changes_key ON feed_replica_changes(key);
    CREATE TABLE IF NOT EXISTS feed_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS feed_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS feed_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS feed_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS sources_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sources_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sources_replica_changes_key ON sources_replica_changes(key);
    CREATE TABLE IF NOT EXISTS sources_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sources_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sources_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sources_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS attention_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS attention_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS attention_replica_changes_key ON attention_replica_changes(key);
    CREATE TABLE IF NOT EXISTS attention_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attention_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attention_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS attention_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS messages_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS messages_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_replica_changes_key ON messages_replica_changes(key);
    CREATE TABLE IF NOT EXISTS messages_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS messages_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS coding_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS coding_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS coding_replica_changes_key ON coding_replica_changes(key);
    CREATE TABLE IF NOT EXISTS coding_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS coding_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS coding_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS coding_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS builder_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS builder_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS builder_replica_changes_key ON builder_replica_changes(key);
    CREATE TABLE IF NOT EXISTS builder_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS builder_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS builder_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS builder_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
