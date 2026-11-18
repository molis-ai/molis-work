/**
 * The role tables added in store version 2 (specs/onboarding-coverage/role-service-design.md §2): a personal original's fixed versions,
 * the members of a project with their own versions, the two default layers, template adoption receipts and where an adopted original
 * came from. 1 → 2 only creates them, empty: a draft written before has no version until it is saved once.
 */
export const CHARACTER_ROLE_TABLES_SQL = `
CREATE TABLE character_versions (
  character_id TEXT NOT NULL, owner_actor_id TEXT NOT NULL, version INTEGER NOT NULL,
  draft_revision INTEGER NOT NULL, saved_at TEXT NOT NULL, content TEXT NOT NULL,
  PRIMARY KEY (character_id, version)
);
CREATE TABLE character_origins (
  character_id TEXT PRIMARY KEY, owner_actor_id TEXT NOT NULL, origin TEXT NOT NULL
);
CREATE TABLE character_members (
  member_id TEXT PRIMARY KEY, owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, character_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'disabled', 'removed')), revision TEXT NOT NULL, member_version INTEGER NOT NULL,
  sections TEXT NOT NULL, origin TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX character_members_live ON character_members (owner_actor_id, project_id, character_id) WHERE state != 'removed';
CREATE TABLE character_member_versions (
  member_id TEXT NOT NULL, member_version INTEGER NOT NULL, original_version INTEGER NOT NULL, saved_at TEXT NOT NULL, sections TEXT NOT NULL,
  PRIMARY KEY (member_id, member_version)
);
CREATE TABLE character_defaults (
  owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, selection TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, project_id)
);
CREATE TABLE character_adoptions (
  owner_actor_id TEXT NOT NULL, scope TEXT NOT NULL, request_id TEXT NOT NULL, request_digest TEXT NOT NULL, receipt TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, scope, request_id)
);`;
