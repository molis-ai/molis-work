PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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
CREATE TABLE model_providers (
      provider_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_format TEXT NOT NULL,
      credential_ref TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      prompt_cache TEXT NOT NULL DEFAULT 'off',
      models_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      thinking TEXT NOT NULL DEFAULT 'off'
    );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE partition_plugins (
      partition_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL,
      enabled_at TEXT NOT NULL,
      enabled_by TEXT NOT NULL,
      PRIMARY KEY (partition_id, plugin_id)
    );
CREATE TABLE plugin_terminal_panel_aliases (
      panel_id TEXT NOT NULL REFERENCES plugin_terminal_panels(panel_id) ON DELETE CASCADE,
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (runtime_id, stable_work_context_id)
    );
CREATE TABLE plugin_terminal_panels (
      panel_id TEXT PRIMARY KEY,
      install_id TEXT NOT NULL,
      project_id TEXT REFERENCES projects(project_id),
      actor_id TEXT NOT NULL,
      key TEXT NOT NULL,
      subject TEXT,
      runtime TEXT NOT NULL,
      launch_command TEXT NOT NULL,
      launch_args TEXT NOT NULL,
      title TEXT NOT NULL,
      host_session_id TEXT,
      tab_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
CREATE TABLE project_catalog_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE project_catalog_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE project_catalog_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE project_catalog_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE project_catalog_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE project_catalog_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE project_deletion_steps (
      deletion_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pending', 'complete')),
      error TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (deletion_id, owner_id)
    );
CREATE TABLE project_deletions (
      deletion_id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      project_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      staged_directory TEXT NOT NULL,
      deleted_binding_count INTEGER NOT NULL,
      cleanup_state TEXT NOT NULL CHECK (cleanup_state IN ('complete', 'pending')),
      cleanup_error TEXT,
      deleted_at TEXT NOT NULL,
      cleaned_at TEXT,
      UNIQUE(actor_id, idempotency_key)
    );
CREATE TABLE project_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
CREATE TABLE project_instruction_settings (
      project_id TEXT PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
      off INTEGER NOT NULL CHECK (off IN (0, 1)),
      confirmed_workspace_id TEXT,
      updated_at TEXT NOT NULL
    );
CREATE TABLE project_plugin_exclusions (
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL,
      removed_at TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id)
    );
CREATE TABLE project_portable_plugins (
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id)
    );
CREATE TABLE project_recycle (
    project_id TEXT PRIMARY KEY,
    recycled INTEGER NOT NULL CHECK(recycled IN (0,1)), generation INTEGER NOT NULL,
    observed_at TEXT NOT NULL
  );
CREATE TABLE project_recycle_receipts (
    actor_id TEXT NOT NULL, operation_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
    result_json TEXT NOT NULL, PRIMARY KEY(actor_id,operation_id)
  );
CREATE TABLE projects (
      project_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('created')),
      data_class TEXT NOT NULL CHECK (data_class IN ('user', 'regenerable_demo')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
CREATE TABLE runtime_context_binding_events (
      event_id TEXT PRIMARY KEY,
      binding_id TEXT NOT NULL,
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('context.bound', 'context.rebound', 'context.unbound')),
      previous_project_id TEXT,
      project_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
CREATE TABLE runtime_context_bindings (
  binding_id TEXT PRIMARY KEY, runtime_id TEXT NOT NULL, stable_work_context_id TEXT NOT NULL,
  bound_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(runtime_id, stable_work_context_id)
);
CREATE TABLE runtime_context_setup_requests (
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(project_id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (runtime_id, stable_work_context_id, idempotency_key)
    );
CREATE TABLE runtime_context_suggestion_rejections (
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (runtime_id, stable_work_context_id, project_id)
    );
CREATE TABLE workspace_project_memberships (
      membership_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      role_input INTEGER NOT NULL CHECK (role_input IN (0, 1)),
      role_output INTEGER NOT NULL CHECK (role_output IN (0, 1)),
      bound_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(workspace_id, project_id),
      CHECK (role_input = 1 OR role_output = 1)
    );
CREATE TABLE workspace_source_links (
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      source_workspace_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      bound_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, source_workspace_id)
    );
CREATE TABLE workspaces (
      workspace_id TEXT PRIMARY KEY,
      canonical_path TEXT NOT NULL UNIQUE,
      realpath_verified INTEGER NOT NULL CHECK (realpath_verified IN (0, 1)),
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
INSERT INTO "catalog_meta"("key","value") VALUES('mark.former-personal-plugins','2026-01-15T09:00:00.000Z');
INSERT INTO "catalog_meta"("key","value") VALUES('owner','molis-work-project-catalog-v1');
INSERT INTO "catalog_meta"("key","value") VALUES('schema_version','1');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','coding','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','dataset','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','diff','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','feed','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','form','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','git','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','goals','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','inbox','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','lingguang','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','pages','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','ppt','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','risk','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','schedule','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','work-brief','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','workflows','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','coding','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','dataset','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','feed','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','form','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','goals','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','inbox','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','lingguang','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','pages','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','ppt','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','risk','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','schedule','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','workflows','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('personal','dataset','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('personal','form','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('personal','lingguang','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('personal','pages','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('personal','ppt','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('personal','schedule','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('personal','workflows','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','coding','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','dataset','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','diff','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','feed','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','form','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','git','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','goals','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','inbox','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','lingguang','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','pages','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','ppt','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','risk','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','schedule','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','work-brief','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','workflows','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "project_catalog_replica_state"("id","device","cursor","applying") VALUES(1,'cfd7b271e9956fc621c39cb7f568507d',0,0);
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-09efe8c5-df53-4b16-a9c3-97f6a3bbbac2','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.plugin_added','web-user','{"plugin_id":"git"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-0c07c0a6-ef43-4771-8233-d663136a31e8','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"dataset"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-0ff9ac51-069a-462c-ab18-1480f9bde527','molis-work-v1-demo','project.demo_created','web-user','{"project_id":"molis-work-v1-demo"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-19e14b5d-c981-4f48-a890-73eb77b72e8a','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"lingguang"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-1bf471fa-5a18-4a9f-a09c-7c622f9d5efe','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"goals"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-1e2b7546-cf09-40f2-8f9e-6e40c5c20870','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-2cc1585b-1122-458b-bbb7-17abeff40d91','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"pages"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-357ff103-466b-437c-a346-1da31369d7cd','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.plugin_added','web-user','{"plugin_id":"ppt"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-35c552af-89ea-455c-bc38-b653e42c229f','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.plugin_added','web-user','{"plugin_id":"workflows"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-401bcfa0-975d-409f-80b9-2b6d8b4442d2','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.plugin_added','web-user','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-45211fe2-acf2-4dde-ad53-0ddbfb993bcc','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"diff"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-4961b825-7d0e-4d76-bde1-b71e21a3f69c','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.plugin_added','web-user','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-4c333979-747c-4b6b-9973-b84b8eb7fc38','goalboard-v1-demo','project.created','fixture-restore','{"project_id":"goalboard-v1-demo"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-662b5728-cb32-4468-8fdd-25ce009e82ae','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"form"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-68601ee5-7686-49e8-90a1-c34c0e388258','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"goals"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-7fc8cf2b-9dc0-4e85-bd79-dcf6c0f2baac','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"pages"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-854411d0-52c6-41f6-a1f1-7cc35159430a','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-8bc6fef3-5ace-43d3-b8af-5ad22075f0e3','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.plugin_added','web-user','{"plugin_id":"pages"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-8ec675c0-4bd3-40c3-9528-4b5a8650a4be','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.plugin_added','web-user','{"plugin_id":"lingguang"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-95d8d960-70c8-4c31-b52a-59575c95315e','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"workflows"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-97ea41ac-88a2-4609-85da-1c806f30b4eb','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"risk"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-9b173538-093b-4768-a3e8-b174a390caab','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"work-brief"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-9c112258-8cc6-40de-9fc6-de6eb71662e5','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-9f7429d4-85a7-4843-b1f2-d6ff67107679','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"workflows"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-a4d8b2ec-bab9-41b1-9bed-de004d27e5f7','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-a8ccbbda-f9c5-4f5e-9860-e6e8737b64f9','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"lingguang"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-acc0a34c-b0e5-4981-979a-0698f5645140','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"git"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-bad6b9b3-b47b-410c-9c8f-8bd6620e0c86','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.plugin_added','web-user','{"plugin_id":"risk"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-bbb21626-2c1c-4653-9f63-95bbfc8c49e5','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.plugin_added','web-user','{"plugin_id":"form"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-bbb46db4-a6b4-48a2-b6a4-486abf4d14e1','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.plugin_added','web-user','{"plugin_id":"dataset"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-bc8a8d78-ed53-4b6c-95e6-21d5b1ced763','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-c8f09789-b88d-49c1-8f62-d270da0ef0b9','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"dataset"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-c97f5884-2928-45bf-b3c4-a9c54be03a12','personal','project.created','web-user','{"project_id":"personal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-ca3da7d3-1703-481d-8e9b-3bb23201f7a1','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-db52dd38-3478-4a04-84e4-769030c6dc4e','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.plugin_added','web-user','{"plugin_id":"diff"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-dcb3841e-1427-4643-96b3-84e1f473a837','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"ppt"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-dd098f87-a7d1-4899-9e68-d865605207e0','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.plugin_added','web-user','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-ddcdbcbc-f5c7-499c-b3bc-196c165d2e87','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"ppt"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-e431ecd5-b6dd-42fb-a838-248b74a9805f','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.plugin_added','web-user','{"plugin_id":"goals"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-e47f2cca-bdce-4ec7-a684-1a4cf4f603ab','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.plugin_added','web-user','{"plugin_id":"work-brief"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-e5989f6c-f54b-4dfc-a6a6-176d0bf6c0bd','project-791103fd-73f1-4091-acb6-1281d19bd75b','project.created','web-user','{"project_id":"project-791103fd-73f1-4091-acb6-1281d19bd75b"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-f7b5cacd-8a0a-4c38-ad30-872b65575b24','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"form"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-ff2de5c0-86bd-4c49-827a-df2071faec08','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"risk"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','dataset');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','diff');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','feed');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','form');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','git');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','goals');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','inbox');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','lingguang');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','pages');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','ppt');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','risk');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','work-brief');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','workflows');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','dataset');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','feed');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','form');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','goals');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','inbox');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','lingguang');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','pages');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','ppt');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','risk');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','workflows');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('personal','dataset');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('personal','form');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('personal','lingguang');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('personal','pages');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('personal','ppt');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('personal','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('personal','workflows');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','dataset');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','diff');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','feed');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','form');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','git');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','goals');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','inbox');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','lingguang');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','pages');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','ppt');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','risk');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','work-brief');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','workflows');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('goalboard-v1-demo','金样历史项目','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('molis-work-v1-demo','Molis Work 示例项目','created','regenerable_demo','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('personal','个人空间','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('project-791103fd-73f1-4091-acb6-1281d19bd75b','金样工作项目','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-323f14876fdf047a23bb58cd','workspace-output-323f14876fdf047a23bb58cd','project-791103fd-73f1-4091-acb6-1281d19bd75b',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-3556bfac63d37897116a01f2','workspace-output-3556bfac63d37897116a01f2','personal',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-618ca9c0ccd49e4b1737c2bb','workspace-output-618ca9c0ccd49e4b1737c2bb','goalboard-v1-demo',0,1,'fixture-restore','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-f161824ed1f267bb3270ec34','workspace-output-f161824ed1f267bb3270ec34','molis-work-v1-demo',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-323f14876fdf047a23bb58cd','project-output:project-791103fd-73f1-4091-acb6-1281d19bd75b',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-3556bfac63d37897116a01f2','project-output:personal',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-618ca9c0ccd49e4b1737c2bb','project-output:goalboard-v1-demo',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-f161824ed1f267bb3270ec34','project-output:molis-work-v1-demo',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('project_catalog_replica_changes',0);
CREATE INDEX context_edges_source_idx ON context_edges
    (scope_kind, scope_id, relation_type, json_extract(source_json, '$.module'), json_extract(source_json, '$.id'));
CREATE INDEX model_providers_enabled_idx
      ON model_providers(enabled, display_name);
CREATE INDEX plugin_terminal_panels_owner_idx
      ON plugin_terminal_panels(install_id, project_id, actor_id, subject, tab_index);
CREATE INDEX project_catalog_replica_changes_key ON project_catalog_replica_changes(key);
CREATE INDEX project_deletions_project_idx
      ON project_deletions(project_id, deleted_at, deletion_id);
CREATE INDEX project_events_project_idx
      ON project_events(project_id, created_at, event_id);
CREATE INDEX projects_display_name_idx
      ON projects(display_name COLLATE NOCASE, project_id);
CREATE INDEX runtime_context_binding_events_context_idx
      ON runtime_context_binding_events(runtime_id, stable_work_context_id, created_at, event_id);
CREATE INDEX runtime_context_setup_requests_project_idx
      ON runtime_context_setup_requests(project_id, created_at);
CREATE INDEX runtime_context_suggestion_rejections_project_idx
      ON runtime_context_suggestion_rejections(project_id, created_at);
CREATE UNIQUE INDEX workspace_project_memberships_one_output_idx
      ON workspace_project_memberships(project_id) WHERE role_output = 1;
CREATE INDEX workspace_project_memberships_project_idx
      ON workspace_project_memberships(project_id, workspace_id);
CREATE INDEX workspace_source_links_workspace_idx
      ON workspace_source_links(workspace_id);
CREATE TRIGGER projects_sync_delete AFTER DELETE ON projects BEGIN INSERT INTO project_catalog_replica_changes(key) SELECT OLD.project_id WHERE (SELECT applying FROM project_catalog_replica_state WHERE id=1)=0 AND (0=1); END;
CREATE TRIGGER projects_sync_events AFTER INSERT ON project_events BEGIN INSERT INTO project_catalog_replica_changes(key) SELECT NEW.project_id WHERE (SELECT applying FROM project_catalog_replica_state WHERE id=1)=0 AND (0=1); END;
PRAGMA user_version=0;
COMMIT;
