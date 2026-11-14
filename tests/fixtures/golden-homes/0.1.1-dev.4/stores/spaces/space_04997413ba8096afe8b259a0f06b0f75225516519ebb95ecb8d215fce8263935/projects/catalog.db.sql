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
INSERT INTO "catalog_meta"("key","value") VALUES('schema_version','4');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "project_catalog_replica_changes"("seq","key") VALUES(1,'project-d9faa79b-57a7-4f8a-b159-e23837c264c6');
INSERT INTO "project_catalog_replica_changes"("seq","key") VALUES(2,'project-d9faa79b-57a7-4f8a-b159-e23837c264c6');
INSERT INTO "project_catalog_replica_changes"("seq","key") VALUES(3,'project-d9faa79b-57a7-4f8a-b159-e23837c264c6');
INSERT INTO "project_catalog_replica_changes"("seq","key") VALUES(4,'project-d9faa79b-57a7-4f8a-b159-e23837c264c6');
INSERT INTO "project_catalog_replica_changes"("seq","key") VALUES(5,'project-d9faa79b-57a7-4f8a-b159-e23837c264c6');
INSERT INTO "project_catalog_replica_changes"("seq","key") VALUES(6,'project-d9faa79b-57a7-4f8a-b159-e23837c264c6');
INSERT INTO "project_catalog_replica_changes"("seq","key") VALUES(7,'project-d9faa79b-57a7-4f8a-b159-e23837c264c6');
INSERT INTO "project_catalog_replica_changes"("seq","key") VALUES(8,'project-d9faa79b-57a7-4f8a-b159-e23837c264c6');
INSERT INTO "project_catalog_replica_changes"("seq","key") VALUES(9,'project-d9faa79b-57a7-4f8a-b159-e23837c264c6');
INSERT INTO "project_catalog_replica_state"("id","device","cursor","applying") VALUES(1,'8e3e01ba15303331292d99fb71fe0893',0,0);
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-05bf9a28-e544-41e0-b577-5fe78be7b909','project-d9faa79b-57a7-4f8a-b159-e23837c264c6','project.plugin_added','owner','{"plugin_id":"coding"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-08588bde-f9ea-4b5a-a826-9c7313cd958e','project-d9faa79b-57a7-4f8a-b159-e23837c264c6','project.plugin_added','owner','{"plugin_id":"git"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-0a4f3221-5e38-4b91-b1eb-b3d2dadc3c6a','project-d9faa79b-57a7-4f8a-b159-e23837c264c6','project.plugin_added','owner','{"plugin_id":"text-stats"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-6bd68821-ec2d-436c-89f4-66a122ae8d46','project-d9faa79b-57a7-4f8a-b159-e23837c264c6','project.plugin_added','owner','{"plugin_id":"risk"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-84693b57-d1d4-4391-9905-3bb2402d46e8','project-d9faa79b-57a7-4f8a-b159-e23837c264c6','project.plugin_added','owner','{"plugin_id":"diff"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-87526748-6477-4098-8b77-a6c1f1a706b9','project-d9faa79b-57a7-4f8a-b159-e23837c264c6','project.created','owner','{"project_id":"project-d9faa79b-57a7-4f8a-b159-e23837c264c6"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-a2a72f9d-4e54-483b-a756-2c2cd7dbbcd5','personal','project.created','web-user','{"project_id":"personal"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-c6b0bdc0-4d24-4bf7-8bce-b1bdae00cbf2','project-d9faa79b-57a7-4f8a-b159-e23837c264c6','project.plugin_added','owner','{"plugin_id":"feed"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-d225fedd-c770-4bc4-b4aa-0af30acba4c4','project-d9faa79b-57a7-4f8a-b159-e23837c264c6','project.plugin_added','owner','{"plugin_id":"goals"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_events"("event_id","project_id","type","actor_id","payload_json","created_at") VALUES('project-event-ef6478f2-ce62-45e0-b557-d803b7fb3367','project-d9faa79b-57a7-4f8a-b159-e23837c264c6','project.plugin_added','owner','{"plugin_id":"inbox"}','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('personal','schedule','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','coding','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','diff','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','feed','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','git','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','goals','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','inbox','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','risk','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','schedule','2026-01-15T09:00:00.000Z');
INSERT INTO "project_plugins"("project_id","plugin_id","added_at") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','text-stats','2026-01-15T09:00:00.000Z');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('personal','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','coding');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','diff');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','feed');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','git');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','goals');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','inbox');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','risk');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','schedule');
INSERT INTO "project_portable_plugins"("project_id","plugin_id") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','text-stats');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('personal','个人空间','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "projects"("project_id","display_name","source","data_class","created_at","updated_at") VALUES('project-d9faa79b-57a7-4f8a-b159-e23837c264c6','金样账号项目','created','user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-5f37456f8f929d43f2535b54','workspace-output-5f37456f8f929d43f2535b54','project-d9faa79b-57a7-4f8a-b159-e23837c264c6',0,1,'owner','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspace_project_memberships"("membership_id","workspace_id","project_id","role_input","role_output","bound_by","created_at","updated_at") VALUES('workspace-output-membership-b1e6f4b7dcb9b126c1e6e9e2','workspace-output-b1e6f4b7dcb9b126c1e6e9e2','personal',0,1,'web-user','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-5f37456f8f929d43f2535b54','project-output:project-d9faa79b-57a7-4f8a-b159-e23837c264c6',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "workspaces"("workspace_id","canonical_path","realpath_verified","display_name","created_at","updated_at") VALUES('workspace-output-b1e6f4b7dcb9b126c1e6e9e2','project-output:personal',0,'project-output','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('project_catalog_replica_changes',9);
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
CREATE TRIGGER projects_sync_delete AFTER DELETE ON projects BEGIN INSERT INTO project_catalog_replica_changes(key) SELECT OLD.project_id WHERE (SELECT applying FROM project_catalog_replica_state WHERE id=1)=0 AND ((OLD.data_class='user') AND OLD.project_id<>'personal'); END;
CREATE TRIGGER projects_sync_events AFTER INSERT ON project_events BEGIN INSERT INTO project_catalog_replica_changes(key) SELECT NEW.project_id WHERE (SELECT applying FROM project_catalog_replica_state WHERE id=1)=0 AND ((NEW.type IN ('project.created','project.renamed','project.plugin_added','project.plugin_removed','project.recycled','project.restored') AND EXISTS(SELECT 1 FROM projects WHERE project_id=NEW.project_id AND data_class='user')) AND NEW.project_id<>'personal'); END;
PRAGMA user_version=0;
COMMIT;
