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
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_99000747-4527-43fc-9fd2-1adf95d88843','{"spaceId":"space_99000747-4527-43fc-9fd2-1adf95d88843","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "project_catalog_replica_state"("id","device","cursor","applying") VALUES(1,'cfd7b271e9956fc621c39cb7f568507d',0,0);
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-0e9b314e-3c01-4f77-85a2-a027c80a5062','project-a9867ade-741e-4f30-a62c-7f67c9a0b9ca','project.created','web-user','{"project_id":"project-a9867ade-741e-4f30-a62c-7f67c9a0b9ca"}','2026-11-12T13:27:10.063Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-362adf67-945d-4130-a04d-7fb406ca7c03','project-a9867ade-741e-4f30-a62c-7f67c9a0b9ca','project.workspace_member_bound','web-user','{"workspace_id":"workspace-3fd6411a-09b8-48fd-a899-976e31896692"}','2026-11-12T13:27:10.725Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-371c7d34-fb0a-4b32-b78a-2c5b70b08464','project-71c8e026-b779-4ad3-9186-a022c9269b5b','project.workspace_output_set','web-user','{"workspace_id":"workspace-514ebb55-43db-44b4-bfe6-16e1dcbfdb1d","previous_workspace_id":"workspace-output-1e2987064c7ce88d984d1c1d"}','2026-11-12T13:27:09.633Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-6e199af9-e453-46d2-9e1b-38aa9a2b4707','project-71c8e026-b779-4ad3-9186-a022c9269b5b','project.plugin_added','web-user','{"plugin_id":"coding"}','2026-11-12T13:27:08.224Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-8c010c99-e86e-478c-bbd0-ddf80449830e','project-71c8e026-b779-4ad3-9186-a022c9269b5b','project.workspace_member_bound','web-user','{"workspace_id":"workspace-514ebb55-43db-44b4-bfe6-16e1dcbfdb1d"}','2026-11-12T13:27:09.633Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-9b22f3bf-f649-4500-b8cf-096c2de9e5ba','project-a9867ade-741e-4f30-a62c-7f67c9a0b9ca','project.workspace_output_set','web-user','{"workspace_id":"workspace-3fd6411a-09b8-48fd-a899-976e31896692","previous_workspace_id":"workspace-output-d37e107276d9b9dd97cd6e1d"}','2026-11-12T13:27:10.725Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-a3bfafb8-251f-4c92-b1a7-64794bbba372','project-71c8e026-b779-4ad3-9186-a022c9269b5b','project.created','web-user','{"project_id":"project-71c8e026-b779-4ad3-9186-a022c9269b5b"}','2026-11-12T13:27:08.218Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-a9fbc611-e45a-4d2b-a5d4-e04213eeb2fd','project-a9867ade-741e-4f30-a62c-7f67c9a0b9ca','project.plugin_added','web-user','{"plugin_id":"coding"}','2026-11-12T13:27:10.065Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-71c8e026-b779-4ad3-9186-a022c9269b5b','coding','2026-11-12T13:27:08.224Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-71c8e026-b779-4ad3-9186-a022c9269b5b','schedule','2026-11-12T13:27:08.044Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-a9867ade-741e-4f30-a62c-7f67c9a0b9ca','coding','2026-11-12T13:27:10.065Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-a9867ade-741e-4f30-a62c-7f67c9a0b9ca','schedule','2026-11-12T13:27:09.902Z');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-71c8e026-b779-4ad3-9186-a022c9269b5b','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-71c8e026-b779-4ad3-9186-a022c9269b5b','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-a9867ade-741e-4f30-a62c-7f67c9a0b9ca','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-a9867ade-741e-4f30-a62c-7f67c9a0b9ca','schedule');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('project-71c8e026-b779-4ad3-9186-a022c9269b5b','文件时代甲','created','user','2026-11-12T13:27:08.044Z','2026-11-12T13:27:08.044Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('project-a9867ade-741e-4f30-a62c-7f67c9a0b9ca','文件时代乙','created','user','2026-11-12T13:27:09.902Z','2026-11-12T13:27:09.902Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-membership-4a19d42d-82a0-41fa-91da-519b33e6cfcd','workspace-514ebb55-43db-44b4-bfe6-16e1dcbfdb1d','project-71c8e026-b779-4ad3-9186-a022c9269b5b',0,1,'web-user','2026-11-12T13:27:09.633Z','2026-11-12T13:27:09.633Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-membership-984a5095-21a5-4ca6-ad9f-346fc81a75d9','workspace-3fd6411a-09b8-48fd-a899-976e31896692','project-a9867ade-741e-4f30-a62c-7f67c9a0b9ca',0,1,'web-user','2026-11-12T13:27:10.725Z','2026-11-12T13:27:10.725Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-3fd6411a-09b8-48fd-a899-976e31896692','/files-era/folder-1',1,'folder-1','2026-11-12T13:27:10.725Z','2026-11-12T13:27:10.725Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-514ebb55-43db-44b4-bfe6-16e1dcbfdb1d','/files-era/folder-0',1,'folder-0','2026-11-12T13:27:09.633Z','2026-11-12T13:27:09.633Z');
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
