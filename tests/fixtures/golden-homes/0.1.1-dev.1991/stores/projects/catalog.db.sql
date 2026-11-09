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
CREATE TABLE goal_desktop_panel_aliases (
      panel_id TEXT NOT NULL REFERENCES goal_desktop_panels(panel_id) ON DELETE CASCADE,
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (runtime_id, stable_work_context_id)
    );
CREATE TABLE goal_desktop_panels (
      panel_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(project_id),
      goal_id TEXT NOT NULL,
      runtime_kind TEXT NOT NULL,
      launch_command TEXT NOT NULL,
      launch_args TEXT NOT NULL,
      cwd TEXT,
      work_context_id TEXT NOT NULL,
      host_session_id TEXT,
      tab_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open', 'exited')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
CREATE TABLE project_plugin_exclusions (
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL,
      removed_at TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id)
    );
CREATE TABLE project_plugins (
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL,
      added_at TEXT NOT NULL,
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
INSERT INTO "catalog_meta"("key","value") VALUES('schema_version','2');
INSERT INTO "model_providers"("provider_id","display_name","base_url","api_format","credential_ref","enabled","prompt_cache","models_json","created_at","updated_at","thinking") VALUES('golden-model-seed','金样模型 seed 已改','http://127.0.0.1:9/v1','openai-chat-completions','connector-connection:23b97984-59c9-428a-99e7-7f6e36d06eb2:token',1,'off','[{"model_id":"golden-model","enabled":true}]','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','off');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "project_catalog_replica_state"("id","device","cursor","applying") VALUES(1,'cfd7b271e9956fc621c39cb7f568507d',0,0);
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-04d1b00b-3153-4980-9d1c-9341e3042370','project-be251f3d-abc0-4340-9e9f-ca73b29292fa','project.plugin_added','web-user','{"plugin_id":"goals"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-07fb5906-716d-4864-b997-77c156813231','goalboard-v1-demo','project.created','fixture-restore','{"project_id":"goalboard-v1-demo"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-0af001db-c544-4d92-ab9b-ba5e616fd918','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"goals"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-184c577c-dc0d-4508-8f27-72bdbd7b2dfc','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-1beacc1c-793c-4f19-a961-db1627a355d2','project-be251f3d-abc0-4340-9e9f-ca73b29292fa','project.plugin_added','web-user','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-25387e1b-b1a8-49f6-9cfa-dbc7f0c2cfa7','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"git"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-2e0d4852-a4b9-4115-b125-bb9da8e74a99','project-be251f3d-abc0-4340-9e9f-ca73b29292fa','project.plugin_added','web-user','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-4af63e3f-71d4-41e9-aa10-f322be9b3437','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-58223211-2d2b-46bb-a18f-c53239870bb6','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"diff"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-63450501-7cb8-4e47-a66c-041a2f15925f','project-be251f3d-abc0-4340-9e9f-ca73b29292fa','project.plugin_added','web-user','{"plugin_id":"text-stats"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-699fa90f-72f8-43f4-8577-d2ae848775b1','project-be251f3d-abc0-4340-9e9f-ca73b29292fa','project.plugin_added','web-user','{"plugin_id":"files"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-6eafd6bf-ce50-4709-a37b-f845e79ed6b8','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-81d88550-c7b9-4b26-ac8b-f65955c2e439','molis-work-v1-demo','project.demo_created','web-user','{"project_id":"molis-work-v1-demo"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-8d6126f6-f102-46c2-89df-5b551b5a1195','project-be251f3d-abc0-4340-9e9f-ca73b29292fa','project.plugin_added','web-user','{"plugin_id":"diff"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-932100ce-8062-4dc8-bf88-1fe3f928b2f2','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-b2e4a743-75d5-4758-a0a0-2c1a6822732d','project-be251f3d-abc0-4340-9e9f-ca73b29292fa','project.plugin_added','web-user','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-c99556f3-33f9-470e-85ef-27af4315ecc7','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"files"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-cfcf569e-53b6-4fe4-9a69-ceddbce4c03c','project-be251f3d-abc0-4340-9e9f-ca73b29292fa','project.plugin_added','web-user','{"plugin_id":"git"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-d5694b2d-2d00-43f4-b1b8-4443edea1c3f','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-d889b570-5a68-4468-a143-5634709066a0','project-be251f3d-abc0-4340-9e9f-ca73b29292fa','project.created','web-user','{"project_id":"project-be251f3d-abc0-4340-9e9f-ca73b29292fa"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-e296a85a-4bbc-410e-a02d-1256859f2fc8','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"text-stats"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-eb4f6b3f-df94-483a-ba30-5f497b7d3a0d','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-ebc5c8f9-039e-4ef1-9033-ae8e94567039','personal','project.created','web-user','{"project_id":"personal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('goalboard-v1-demo','coding','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('goalboard-v1-demo','diff','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('goalboard-v1-demo','feed','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('goalboard-v1-demo','files','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('goalboard-v1-demo','git','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('goalboard-v1-demo','goals','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('goalboard-v1-demo','inbox','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('goalboard-v1-demo','schedule','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('goalboard-v1-demo','text-stats','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('molis-work-v1-demo','coding','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('molis-work-v1-demo','feed','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('molis-work-v1-demo','inbox','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('molis-work-v1-demo','schedule','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('personal','schedule','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','coding','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','diff','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','feed','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','files','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','git','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','goals','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','inbox','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','schedule','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','text-stats','2026-01-15T09:00:00.000Z');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','diff');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','feed');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','files');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','git');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','goals');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','inbox');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('goalboard-v1-demo','text-stats');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','feed');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','inbox');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('molis-work-v1-demo','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('personal','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','diff');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','feed');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','files');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','git');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','goals');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','inbox');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','text-stats');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('goalboard-v1-demo','金样历史项目','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('molis-work-v1-demo','Molis Work 示例项目','created','regenerable_demo','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('personal','个人空间','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('project-be251f3d-abc0-4340-9e9f-ca73b29292fa','金样工作项目','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-281a62bca4b4a6335bd88998','workspace-output-281a62bca4b4a6335bd88998','goalboard-v1-demo',0,1,'fixture-restore','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-5bfa2d7282b406f15f970f10','workspace-output-5bfa2d7282b406f15f970f10','molis-work-v1-demo',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-ba3ed9c899d03c24be87923b','workspace-output-ba3ed9c899d03c24be87923b','personal',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-fa70183f28078f7fd7c1f0c5','workspace-output-fa70183f28078f7fd7c1f0c5','project-be251f3d-abc0-4340-9e9f-ca73b29292fa',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-281a62bca4b4a6335bd88998','project-output:goalboard-v1-demo',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-5bfa2d7282b406f15f970f10','project-output:molis-work-v1-demo',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-ba3ed9c899d03c24be87923b','project-output:personal',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-fa70183f28078f7fd7c1f0c5','project-output:project-be251f3d-abc0-4340-9e9f-ca73b29292fa',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('project_catalog_replica_changes',0);
CREATE INDEX context_edges_source_idx ON context_edges
    (scope_kind, scope_id, relation_type, json_extract(source_json, '$.module'), json_extract(source_json, '$.id'));
CREATE INDEX goal_desktop_panels_goal_idx
      ON goal_desktop_panels(project_id, goal_id, tab_index);
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
