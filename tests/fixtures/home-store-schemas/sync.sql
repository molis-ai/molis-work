CREATE TABLE sync_policy(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL);
CREATE TABLE sync_partition_cursors(namespace TEXT PRIMARY KEY,cursor INTEGER NOT NULL);
