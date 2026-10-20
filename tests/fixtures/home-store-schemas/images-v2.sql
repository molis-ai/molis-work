CREATE TABLE connections (
 id TEXT PRIMARY KEY,name TEXT NOT NULL,api_format TEXT NOT NULL,base_url TEXT NOT NULL,model TEXT NOT NULL,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE jobs (
 id TEXT PRIMARY KEY,project_id TEXT NOT NULL,request_id TEXT NOT NULL,input_hash TEXT NOT NULL,
 connection_id TEXT NOT NULL,connection_name TEXT NOT NULL,api_format TEXT NOT NULL,model TEXT NOT NULL,
 prompt TEXT NOT NULL,size TEXT NOT NULL,aspect_ratio TEXT NOT NULL,status TEXT NOT NULL,
 images_json TEXT NOT NULL,error TEXT NOT NULL,created_at TEXT NOT NULL,finished_at TEXT,runner_id TEXT,
 UNIQUE(project_id,request_id)
);
CREATE INDEX jobs_project_created ON jobs(project_id,created_at DESC);
CREATE TABLE replica_state (id INTEGER PRIMARY KEY CHECK(id=1),device TEXT NOT NULL,cursor INTEGER NOT NULL DEFAULT 0,applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT,key TEXT NOT NULL);
CREATE INDEX replica_changes_key ON replica_changes(key);
CREATE TABLE replica_heads (key TEXT PRIMARY KEY,revision INTEGER NOT NULL);
CREATE TABLE replica_outbox (key TEXT PRIMARY KEY,through_seq INTEGER NOT NULL,operation TEXT NOT NULL);
CREATE TABLE replica_conflicts (key TEXT PRIMARY KEY,event TEXT NOT NULL,reason TEXT NOT NULL,waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT,key TEXT NOT NULL,choice TEXT NOT NULL,local_json TEXT NOT NULL,remote_json TEXT NOT NULL);
