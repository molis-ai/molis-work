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
INSERT INTO "model_providers"("provider_id","display_name","base_url","api_format","credential_ref","enabled","prompt_cache","models_json","created_at","updated_at","thinking") VALUES('golden-model-seed','金样模型 seed 已改','http://127.0.0.1:9/v1','openai-chat-completions','connector-connection:d4c71e9c-56f3-4f47-8f06-10c7734b167c:token',1,'off','[{"model_id":"golden-model","enabled":true}]','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z','off');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "project_catalog_replica_state"("id","device","cursor","applying") VALUES(1,'cfd7b271e9956fc621c39cb7f568507d',0,0);
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-0aae49ec-6fde-4838-b8d8-ed7d556079c1','project-c64187c9-041e-4e62-829e-320302398da6','project.plugin_added','web-user','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-120a2e97-5d98-4391-bb51-837058fb95b5','project-c64187c9-041e-4e62-829e-320302398da6','project.plugin_added','web-user','{"plugin_id":"goals"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-228cff77-b014-47dd-9f8e-e465e52c8b6b','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"goals"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-297e1951-6ce1-4fe6-9fb8-eb64c36d5b76','goalboard-v1-demo','project.created','fixture-restore','{"project_id":"goalboard-v1-demo"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-2ba53b9d-fc77-4cd1-af72-c3bc536b307a','project-c64187c9-041e-4e62-829e-320302398da6','project.plugin_added','web-user','{"plugin_id":"diff"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-35b930fd-6f18-4d3c-ae48-3c3e0ebf75fa','project-c64187c9-041e-4e62-829e-320302398da6','project.created','web-user','{"project_id":"project-c64187c9-041e-4e62-829e-320302398da6"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-3ad47dc6-e3e6-455d-aa63-e3f4bc94226a','project-c64187c9-041e-4e62-829e-320302398da6','project.plugin_added','web-user','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-4bbb7a31-9a40-447b-91e0-411b991adb27','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"git"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-6647049e-74f7-4925-ae5c-de02c68633ce','personal','project.created','web-user','{"project_id":"personal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-762e0c4c-d669-4e71-835e-ac7d120bb164','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-7874a1d8-4145-4eb7-aece-e36d08c004e7','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-84fdd31f-3f84-44ae-a603-906689520924','project-c64187c9-041e-4e62-829e-320302398da6','project.plugin_added','web-user','{"plugin_id":"files"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-889caad7-1eb0-4455-9021-b84c4f53fba1','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"files"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-8f11076d-fbc7-42ce-a241-749c3949b5c1','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"text-stats"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-918b6611-b1d2-46c4-9075-820ea4f2884a','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-95ef3166-ee85-40d7-96ab-b44de864e80b','project-c64187c9-041e-4e62-829e-320302398da6','project.plugin_added','web-user','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-9b430c3c-c166-4773-b4a4-2a6d8d39313e','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-a0bd508a-07a8-4d42-8d2c-afb22742b5ad','project-c64187c9-041e-4e62-829e-320302398da6','project.plugin_added','web-user','{"plugin_id":"git"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-a4dfa417-b4ed-4230-8aea-069019df7999','project-c64187c9-041e-4e62-829e-320302398da6','project.plugin_added','web-user','{"plugin_id":"text-stats"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-a5499341-9d50-4353-aed8-2ff85e0190d6','goalboard-v1-demo','project.plugin_added','fixture-restore','{"plugin_id":"diff"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-c0784529-4bbf-4643-b4e7-89a12e7d61b4','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-f32d648d-727b-482d-af46-6f5606487781','molis-work-v1-demo','project.demo_created','web-user','{"project_id":"molis-work-v1-demo"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-f363e779-ae05-4bcc-91f5-1e9b78285ce9','molis-work-v1-demo','project.plugin_added','web-user','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
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
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','coding','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','diff','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','feed','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','files','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','git','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','goals','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','inbox','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','schedule','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','text-stats','2026-01-15T09:00:00.000Z');
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
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','diff');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','feed');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','files');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','git');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','goals');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','inbox');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','text-stats');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('goalboard-v1-demo','金样历史项目','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('molis-work-v1-demo','Molis Work 示例项目','created','regenerable_demo','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('personal','个人空间','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('project-c64187c9-041e-4e62-829e-320302398da6','金样工作项目','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-3d30ccfc144de9b56908d1cf','workspace-output-3d30ccfc144de9b56908d1cf','molis-work-v1-demo',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-6e669b205be9daf8c756a699','workspace-output-6e669b205be9daf8c756a699','personal',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-90724d9bf1dbe6ca5584f8b6','workspace-output-90724d9bf1dbe6ca5584f8b6','goalboard-v1-demo',0,1,'fixture-restore','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-dffc2b7f6c3d95d0bf369e6f','workspace-output-dffc2b7f6c3d95d0bf369e6f','project-c64187c9-041e-4e62-829e-320302398da6',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-3d30ccfc144de9b56908d1cf','project-output:molis-work-v1-demo',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-6e669b205be9daf8c756a699','project-output:personal',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-90724d9bf1dbe6ca5584f8b6','project-output:goalboard-v1-demo',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-dffc2b7f6c3d95d0bf369e6f','project-output:project-c64187c9-041e-4e62-829e-320302398da6',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
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
