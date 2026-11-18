PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE feed_runtime_blobs (
    namespace TEXT NOT NULL, key TEXT NOT NULL, opaque TEXT NOT NULL, cas_token TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
  );
PRAGMA user_version=1;
COMMIT;
