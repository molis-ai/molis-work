-- Real-Home maintenance for W2-05 (specs/repository-anti-corruption/spec.md §4.11, decision #21): an Alchemist project's search
-- store, alchemist/projects/<id>/search.sqlite, gets its version 1. Until now it had none (CREATE TABLE IF NOT EXISTS); the build
-- that carries ALCHEMIST_SEARCH_BASELINE (apps/local-host/src/alchemist-search.ts) refuses a file with tables and no version.
-- Nothing else about the store changes: this writes `PRAGMA user_version = 1` and no table or row. (The real Home had no such
-- store on 2026-10-08; this is for any Home that has one.)
--
-- Run it once per search.sqlite, with every Molis Work process of the Home stopped and after a full backup:
--   node:sqlite  db.exec(<this file>)    (the same SQLite as the product)    or    sqlite3 -bail <search.sqlite> < this file
-- The statements stop at the first error. The transaction is then still open and is rolled back when the connection closes, so
-- either the whole script ran or nothing changed. Do not run it in the sqlite3 shell without -bail: the shell goes on after an
-- error, and what is left of the script commits.
BEGIN IMMEDIATE;

-- Only an unversioned store that is exactly the baseline goes on: one table, its four columns in order with the primary key,
-- no index besides the primary key's, no foreign key, no CHECK, no view or trigger. A named CHECK that fails says which one it was.
CREATE TEMP TABLE maintenance_precondition (
  unversioned INTEGER NOT NULL CONSTRAINT "user_version is 0" CHECK (unversioned = 1),
  only_table INTEGER NOT NULL CONSTRAINT "feed_runtime_blobs is the only table" CHECK (only_table = 1),
  columns_match INTEGER NOT NULL CONSTRAINT "feed_runtime_blobs has the baseline's columns" CHECK (columns_match = 1),
  nothing_else INTEGER NOT NULL CONSTRAINT "no other index, foreign key, CHECK, view or trigger" CHECK (nothing_else = 1)
);
INSERT INTO maintenance_precondition SELECT
  (SELECT user_version = 0 FROM pragma_user_version),
  (SELECT count(*) = 1 AND min(name) = 'feed_runtime_blobs' FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'),
  ifnull((SELECT group_concat(entry, ',') = 'namespace TEXT 1 1 ,key TEXT 1 2 ,opaque TEXT 1 0 ,cas_token TEXT 1 0 ' FROM (
     SELECT name || ' ' || upper(type) || ' ' || "notnull" || ' ' || pk || ' ' || ifnull(dflt_value, '') AS entry
     FROM pragma_table_info('feed_runtime_blobs') ORDER BY cid)), 0),
  ifnull((SELECT count(*) = 0 FROM sqlite_master WHERE type IN ('view', 'trigger') OR (type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'))
  AND (SELECT count(*) = 0 FROM pragma_foreign_key_list('feed_runtime_blobs'))
  AND (SELECT sql NOT LIKE '%CHECK%' FROM sqlite_master WHERE type = 'table' AND name = 'feed_runtime_blobs'), 0);

PRAGMA user_version = 1;
COMMIT;
