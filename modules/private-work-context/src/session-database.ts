import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createSessionContentStore, type SessionContentStore } from './content-store.js';
import { initializeOrValidateSessionSchema, validateSessionRegistryMeta } from './session-schema.js';
import { sessionErrors } from '@molis-ai/molis-work-contracts/modules/private-work-context';
import {installSessionReplicationJournal,type SessionReplicationSupport,type SessionReplicaJournal} from './session-replication-journal.js';

function inspectSessionOwner(db: Database.Database): void {
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='session_meta'").get()) {
    validateSessionRegistryMeta(db);
  } else if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get()) {
    throw sessionErrors.registry_unknown('不会复用未知 Session Registry 数据库');
  }
}

/** Key owner asks only whether encrypted technical bodies remain. Does not open the normal Registry or resume handoffs. */
export function hasSessionSyncProtectedData(home:string,support:SessionReplicationSupport):boolean {
  const file=path.join(path.resolve(home),'sessions','sessions.db');if(!fs.existsSync(file))return false;
  const db=new Database(file,{readonly:true,fileMustExist:true,timeout:5000});
  try{validateSessionRegistryMeta(db);return support.hasProtectedData(db);}finally{db.close();}
}

/** One current owner database and one encrypted content directory, without resuming or sending work. */
export function openSessionOwnerDatabase<T>(
  home: string | undefined,
  support:SessionReplicationSupport,
  create: (db: Database.Database, homeDirectory: string, content: SessionContentStore,journal:SessionReplicaJournal,fresh:boolean) => T,
): T {
  const homeDirectory = path.resolve(home ?? path.join(os.homedir(), '.molis-work'));
  const directory = path.join(homeDirectory, 'sessions');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'sessions.db');
  if (fs.existsSync(file)) {
    const probe = new Database(file, { readonly: true, fileMustExist: true, timeout: 5000 });
    try { inspectSessionOwner(probe); } finally { probe.close(); }
  }
  const db = new Database(file, { timeout: 5000 });
  try {
    // Recheck after reopening too: no WAL, content directory or schema write may precede owner/version refusal.
    inspectSessionOwner(db);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    const content = createSessionContentStore(path.join(directory, 'content'));
    return db.transaction(() => {
      const fresh=initializeOrValidateSessionSchema(db,support.schema),journal=support.open(db,homeDirectory,fresh);
      if(fresh)installSessionReplicationJournal(db,journal);
      return create(db, homeDirectory, content,journal,fresh);
    }).immediate();
  } catch (error) {
    db.close();
    throw error;
  }
}
