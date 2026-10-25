-- PG-080 / R-B9: offline rehearsal only. Stop the Home and back it up before applying to a real project library (one file per project).
-- Run with an API that stops at the first error (or sqlite3 -bail). On failure ROLLBACK; never continue with the remaining statements.
-- No runtime reader invokes this file, and the code reads no earlier value: a line Feed started before this change names the producer
-- `io.molis.work.native.feed` / `native:feed`, which is not Feed's Manifest (`io.molis.work.feed` / `official-feed-binding`), so Feed's own
-- `head` and `readOwn` refuse it until it is rewritten. Safe to run again: a second run finds nothing to change.
BEGIN IMMEDIATE;
CREATE TEMP TABLE feed_producer_guard (ok INTEGER NOT NULL CHECK (ok = 1));
-- A line is Feed's old line only by BOTH values; a line with one of them is somebody else's and stops the run.
INSERT INTO feed_producer_guard SELECT count(*) = 0 FROM library_artifacts
  WHERE (producer_plugin_id = 'io.molis.work.native.feed') <> (producer_binding_signature = 'native:feed');
-- Nothing of another producer may already sit under Feed's new identity.
INSERT INTO feed_producer_guard SELECT count(*) = 0 FROM library_artifacts
  WHERE producer_plugin_id = 'io.molis.work.feed' AND producer_binding_signature <> 'official-feed-binding';
UPDATE library_artifacts SET producer_plugin_id = 'io.molis.work.feed', producer_binding_signature = 'official-feed-binding'
  WHERE producer_plugin_id = 'io.molis.work.native.feed' AND producer_binding_signature = 'native:feed';
DROP TABLE feed_producer_guard;
COMMIT;
