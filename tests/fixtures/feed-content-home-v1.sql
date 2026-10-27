-- FI-6: the Feed Home half's reference ledger (feed-inbox-home-reference-ledger.md §3.2), accepted with C.
-- This is a normative v1 fixture, not a schema captured from a real Home.
CREATE TABLE feed_content_holds (
  content_ref TEXT NOT NULL,
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  PRIMARY KEY (content_ref, project_id, source_id)
);
CREATE INDEX feed_content_holds_by_holder ON feed_content_holds (project_id, source_id);
CREATE TABLE feed_content_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
