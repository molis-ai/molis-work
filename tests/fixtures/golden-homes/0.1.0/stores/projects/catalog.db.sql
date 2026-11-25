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
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('goalboard-v1-demo','work-brief','2026-01-15T09:00:00.000Z','fixture-restore');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','coding','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','feed','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','goals','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','inbox','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','risk','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('molis-work-v1-demo','schedule','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('personal','schedule','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','coding','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','diff','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','feed','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','git','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','goals','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','inbox','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','risk','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','schedule','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "partition_plugins"("partition_id","plugin_id","enabled_at","enabled_by") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','work-brief','2026-01-15T09:00:00.000Z','web-user');
INSERT INTO "project_catalog_replica_state"("id","device","cursor","applying") VALUES(1,'cfd7b271e9956fc621c39cb7f568507d',0,0);
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-24369494-489c-4019-bf3f-34501ee53ff7','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-2465b624-1630-4e66-be96-31d185f82296','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"goals"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-24e56ccf-dc73-4197-87de-8bf504ab15a6','project-038fd99d-87df-4cdb-9de0-56838f641ed7','project.plugin_added','web-user','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-36734481-e590-440e-8dab-fd8649d18533','goalboard-v1-demo','project.created','fixture-restore','{"project_id":"goalboard-v1-demo"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-44ef93f5-e0b0-4d67-9049-5986fb49c704','project-038fd99d-87df-4cdb-9de0-56838f641ed7','project.plugin_added','web-user','{"plugin_id":"diff"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-48d9922f-5ae3-4f33-a9e8-37993779079d','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"work-brief"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-6e6d12d7-8619-4df8-8d66-939b921d3a94','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"git"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-89d1ffd2-35ce-4b45-8037-7aefd8063624','project-038fd99d-87df-4cdb-9de0-56838f641ed7','project.plugin_added','web-user','{"plugin_id":"git"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-8c12bb13-c079-405e-a41f-abfe791f0bc6','molis-work-v1-demo','project.demo_created','web-user','{"project_id":"molis-work-v1-demo"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-8c92032f-5afb-43cc-9e23-793e019e8a66','project-038fd99d-87df-4cdb-9de0-56838f641ed7','project.created','web-user','{"project_id":"project-038fd99d-87df-4cdb-9de0-56838f641ed7"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-98ab49d6-8bca-4079-9c06-fba0f30a2ee0','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-9a44c077-096d-4558-8eb1-324b0add644d','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-9d4b1730-4f8d-4901-a267-85add8c48fe4','project-038fd99d-87df-4cdb-9de0-56838f641ed7','project.plugin_added','web-user','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-ad5d7170-a86e-49d8-b44e-3f0353e176fb','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-ad69c4cb-7462-4d12-b3d6-748b2c6c8ee5','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-bd79559c-ae91-4ff4-a8f1-df564280832a','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"risk"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-c35a6bf6-d0a7-4f94-8844-e8361de7c629','personal','project.created','web-user','{"project_id":"personal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-c5226ced-a56b-486b-af74-e6c7b3899287','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"risk"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-c764ac8d-bd03-4670-b296-65780f8c4a5c','project-038fd99d-87df-4cdb-9de0-56838f641ed7','project.plugin_added','web-user','{"plugin_id":"goals"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-c8d8ed9e-85b9-4e70-bb39-36f7cdef69c9','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"diff"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-d0294bf4-1d10-4d75-98b2-472f06c380af','project-038fd99d-87df-4cdb-9de0-56838f641ed7','project.plugin_added','web-user','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-d1a21519-0c17-4eb5-b437-52bfcd5e6077','project-038fd99d-87df-4cdb-9de0-56838f641ed7','project.plugin_added','web-user','{"plugin_id":"work-brief"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-e0d8a8e0-8896-40bb-ad98-b45bf5e9058a','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"goals"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-fc9fd5c5-6df2-427c-9acc-475a2080a062','project-038fd99d-87df-4cdb-9de0-56838f641ed7','project.plugin_added','web-user','{"plugin_id":"risk"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-ff123eb1-b7a0-4d1a-ac7e-1a8994476244','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','diff');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','feed');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','git');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','goals');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','inbox');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','risk');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','work-brief');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','feed');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','goals');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','inbox');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','risk');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('personal','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','diff');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','feed');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','git');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','goals');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','inbox');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','risk');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','work-brief');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('goalboard-v1-demo','金样历史项目','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('molis-work-v1-demo','Molis Work 示例项目','created','regenerable_demo','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('personal','个人空间','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('project-038fd99d-87df-4cdb-9de0-56838f641ed7','金样工作项目','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-140a920ca9d553351162a691','workspace-output-140a920ca9d553351162a691','goalboard-v1-demo',0,1,'fixture-restore','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-5ab9215049f6b9e24cba4672','workspace-output-5ab9215049f6b9e24cba4672','personal',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-afb1e9b10584b2d394c1ba20','workspace-output-afb1e9b10584b2d394c1ba20','project-038fd99d-87df-4cdb-9de0-56838f641ed7',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-e86f07d8500ace6339b71112','workspace-output-e86f07d8500ace6339b71112','molis-work-v1-demo',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-140a920ca9d553351162a691','project-output:goalboard-v1-demo',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-5ab9215049f6b9e24cba4672','project-output:personal',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-afb1e9b10584b2d394c1ba20','project-output:project-038fd99d-87df-4cdb-9de0-56838f641ed7',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-e86f07d8500ace6339b71112','project-output:molis-work-v1-demo',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
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
