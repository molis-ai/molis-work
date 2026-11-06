-- Current personal-sync baseline v2: resumable attachment control data, not plugin business tables.
CREATE TABLE sync_policy(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL);
CREATE TABLE sync_partition_cursors(namespace TEXT PRIMARY KEY,cursor INTEGER NOT NULL);
CREATE TABLE sync_blob_parts(digest TEXT NOT NULL,part INTEGER NOT NULL,checksum TEXT NOT NULL,bytes BLOB NOT NULL,PRIMARY KEY(digest,part));
CREATE TABLE sync_blob_uploads(namespace TEXT NOT NULL,operation TEXT NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(namespace,operation,digest));
