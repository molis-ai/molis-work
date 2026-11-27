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
INSERT INTO "catalog_meta"("key","value") VALUES('owner','molis-work-project-catalog-v1');
INSERT INTO "catalog_meta"("key","value") VALUES('schema_version','1');
INSERT INTO "model_providers"("provider_id","display_name","base_url","api_format","credential_ref","enabled","prompt_cache","models_json","created_at","updated_at","thinking") VALUES('golden-model-seed','金样模型 seed 已改','http://127.0.0.1:9/v1','openai-chat-completions','connector-connection:e1e7747e-7195-4bc8-9db4-8114b4d422e6:token',1,'off','[{"model_id":"golden-model","enabled":true}]','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','off');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','coding','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','diff','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','feed','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','git','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','goals','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','inbox','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','risk','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','schedule','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','text-stats','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','work-brief','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','coding','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','feed','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','goals','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','inbox','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','risk','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','schedule','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('personal','schedule','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','coding','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','diff','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','feed','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','git','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','goals','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','inbox','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','risk','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','schedule','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','text-stats','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','work-brief','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "project_catalog_replica_state"("id","device","cursor","applying") VALUES(1,'cfd7b271e9956fc621c39cb7f568507d',0,0);
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-01c2a3a4-f43d-4a8b-bb6c-8ae89d987dec','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"work-brief"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-02912194-4250-42b1-9f74-e262ca2f9ea8','project-ae076f4f-3257-40a5-be48-38652812f188','project.plugin_added','web-user','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-0bf02311-3806-4ee3-8d4f-8246bdd88d04','project-ae076f4f-3257-40a5-be48-38652812f188','project.plugin_added','web-user','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-1489cba7-4c5e-435e-bde4-861aca418b8e','project-ae076f4f-3257-40a5-be48-38652812f188','project.plugin_added','web-user','{"plugin_id":"risk"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-15547a3a-46e9-4e4d-9c90-612fe6d1b3f6','project-ae076f4f-3257-40a5-be48-38652812f188','project.created','web-user','{"project_id":"project-ae076f4f-3257-40a5-be48-38652812f188"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-1f7dec29-686a-4ef8-a3ab-c24a3bfd766f','goalboard-v1-demo','project.created','fixture-restore','{"project_id":"goalboard-v1-demo"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-23dc53ff-b15f-4f51-a3ad-e122957613fd','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-31a6319d-53e2-4e46-9023-51d4e8df05c9','project-ae076f4f-3257-40a5-be48-38652812f188','project.plugin_added','web-user','{"plugin_id":"diff"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-3832ffc3-99f9-4ef3-a23e-0d1b28d4529e','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-3be75939-377d-44e3-85a9-cfe7b60a13e5','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-4b4a422a-f6fd-4d9a-8f23-2cf85c911e79','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"goals"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-5816693e-8f03-42f2-8942-70e28a5373ef','project-ae076f4f-3257-40a5-be48-38652812f188','project.plugin_added','web-user','{"plugin_id":"git"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-5ce3cf1e-b2f4-4216-9544-6a803cc0a109','molis-work-v1-demo','project.demo_created','web-user','{"project_id":"molis-work-v1-demo"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-613e545f-a06c-4b54-9af7-7e00dc05c675','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"risk"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-9551f23c-d3f5-478c-b7fe-3c2edf485a92','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-a270282c-f4d0-4239-8e8a-a3b968dac323','personal','project.created','web-user','{"project_id":"personal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-ac8118f7-916e-4d74-9086-0a72a4b4a12c','project-ae076f4f-3257-40a5-be48-38652812f188','project.plugin_added','web-user','{"plugin_id":"text-stats"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-bae49332-c477-4173-841f-516d9c3dfcc4','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-c60c2a37-dcca-41ba-983e-5bf47e19c92a','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"text-stats"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-ce3760fc-526d-4c78-9de4-68dd5ce9e44c','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"diff"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-e6e4058b-5ed1-4840-8168-1d70259ad0e4','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"risk"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-e85d6842-9d1b-48d6-94a2-54f9ad8e8532','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"git"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-f6db63c5-a273-4937-9d9a-a18f90c23214','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-f73327c7-e8e2-43e3-923d-9c89fc305d36','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"goals"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-f74683bd-041d-4eba-93e4-d1885a474b9f','project-ae076f4f-3257-40a5-be48-38652812f188','project.plugin_added','web-user','{"plugin_id":"work-brief"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-fafd0516-0b11-408c-aa2e-05f1b0ed0f11','project-ae076f4f-3257-40a5-be48-38652812f188','project.plugin_added','web-user','{"plugin_id":"goals"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-fe3041ea-9a2f-4df5-9d62-55208d31ea8b','project-ae076f4f-3257-40a5-be48-38652812f188','project.plugin_added','web-user','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','diff');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','feed');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','git');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','goals');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','inbox');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','risk');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','text-stats');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','work-brief');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','feed');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','goals');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','inbox');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','risk');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('personal','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','diff');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','feed');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','git');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','goals');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','inbox');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','risk');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','text-stats');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','work-brief');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('goalboard-v1-demo','金样历史项目','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('molis-work-v1-demo','Molis Work 示例项目','created','regenerable_demo','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('personal','个人空间','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('project-ae076f4f-3257-40a5-be48-38652812f188','金样工作项目','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-00d31a2b700a702a8a1a448c','workspace-output-00d31a2b700a702a8a1a448c','molis-work-v1-demo',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-36ceb028dda74a00818fad2a','workspace-output-36ceb028dda74a00818fad2a','personal',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-669b0413b467c6a17da3fcfd','workspace-output-669b0413b467c6a17da3fcfd','goalboard-v1-demo',0,1,'fixture-restore','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-b9c9fa058bfe5665d17136b7','workspace-output-b9c9fa058bfe5665d17136b7','project-ae076f4f-3257-40a5-be48-38652812f188',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-00d31a2b700a702a8a1a448c','project-output:molis-work-v1-demo',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-36ceb028dda74a00818fad2a','project-output:personal',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-669b0413b467c6a17da3fcfd','project-output:goalboard-v1-demo',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-b9c9fa058bfe5665d17136b7','project-output:project-ae076f4f-3257-40a5-be48-38652812f188',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
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
