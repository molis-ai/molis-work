-- Real-Home maintenance four (specs/repository-anti-corruption/spec.md §4.1): the project catalog, projects/catalog.db,
-- from version 21 to version 22. Version 22 adds the table that keeps each owner's step of a project deletion
-- (modules/projects/src/deletion-steps.ts); nothing else about the catalog changed.
--
-- Run it with every Molis Work process of the Home stopped and after a full backup, on the catalog file only:
--   node:sqlite  db.exec(<this file>)    (the same SQLite as the product)    or    sqlite3 -bail projects/catalog.db < this file
-- The statements stop at the first error. The transaction is then still open and is rolled back when the connection
-- closes, so either the whole script ran or nothing changed. Do not run it in the sqlite3 shell without -bail: the shell
-- goes on after an error, and what is left of the script commits.
BEGIN IMMEDIATE;

-- Only the project catalog at version 21 goes on; a named CHECK that fails says which one it was.
CREATE TEMP TABLE maintenance_precondition (
  owner_rows INTEGER NOT NULL CONSTRAINT "catalog_meta.owner is molis-work-project-catalog-v1" CHECK (owner_rows = 1),
  version_rows INTEGER NOT NULL CONSTRAINT "catalog_meta.schema_version is 21" CHECK (version_rows = 1)
);
INSERT INTO maintenance_precondition SELECT
  (SELECT COUNT(*) FROM catalog_meta WHERE key = 'owner' AND value = 'molis-work-project-catalog-v1'),
  (SELECT COUNT(*) FROM catalog_meta WHERE key = 'schema_version' AND value = '21');

-- No IF NOT EXISTS: a catalog that already has the table is not the catalog this script is for.
CREATE TABLE project_deletion_steps (
  deletion_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'complete')),
  error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (deletion_id, owner_id)
);

UPDATE catalog_meta SET value = '22' WHERE key = 'schema_version' AND value = '21';
COMMIT;
