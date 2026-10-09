-- Real-Home maintenance for W2-05 (specs/repository-anti-corruption/spec.md §4.11, decision #21): the Experiments private
-- store, plugins/experiments/private.sqlite, gets its version 1. Until now it had none (CREATE TABLE IF NOT EXISTS); the build
-- that carries EXPERIMENTS_PRIVATE_BASELINE (apps/local-host/src/experiments-private-store.ts) refuses a file with tables and no
-- version. Nothing else about the store changes: this writes `PRAGMA user_version = 1` and no table or row.
--
-- Run it with every Molis Work process of the Home stopped and after a full backup, on this one file only:
--   node:sqlite  db.exec(<this file>)    (the same SQLite as the product)    or    sqlite3 -bail plugins/experiments/private.sqlite < this file
-- The statements stop at the first error. The transaction is then still open and is rolled back when the connection closes, so
-- either the whole script ran or nothing changed. Do not run it in the sqlite3 shell without -bail: the shell goes on after an
-- error, and what is left of the script commits.
BEGIN IMMEDIATE;

-- Only an unversioned store that is exactly the baseline goes on: one table, its three columns in order with the primary key,
-- no index besides the primary key's, no foreign key, no CHECK, no view or trigger. A named CHECK that fails says which one it was.
CREATE TEMP TABLE maintenance_precondition (
  unversioned INTEGER NOT NULL CONSTRAINT "user_version is 0" CHECK (unversioned = 1),
  only_table INTEGER NOT NULL CONSTRAINT "plugin_private_values is the only table" CHECK (only_table = 1),
  columns_match INTEGER NOT NULL CONSTRAINT "plugin_private_values has the baseline's columns" CHECK (columns_match = 1),
  nothing_else INTEGER NOT NULL CONSTRAINT "no other index, foreign key, CHECK, view or trigger" CHECK (nothing_else = 1)
);
INSERT INTO maintenance_precondition SELECT
  (SELECT user_version = 0 FROM pragma_user_version),
  (SELECT count(*) = 1 AND min(name) = 'plugin_private_values' FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'),
  ifnull((SELECT group_concat(entry, ',') = 'install_id TEXT 1 1 ,item_key TEXT 1 2 ,item_value TEXT 1 0 ' FROM (
     SELECT name || ' ' || upper(type) || ' ' || "notnull" || ' ' || pk || ' ' || ifnull(dflt_value, '') AS entry
     FROM pragma_table_info('plugin_private_values') ORDER BY cid)), 0),
  ifnull((SELECT count(*) = 0 FROM sqlite_master WHERE type IN ('view', 'trigger') OR (type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'))
  AND (SELECT count(*) = 0 FROM pragma_foreign_key_list('plugin_private_values'))
  AND (SELECT sql NOT LIKE '%CHECK%' FROM sqlite_master WHERE type = 'table' AND name = 'plugin_private_values'), 0);

PRAGMA user_version = 1;
COMMIT;
