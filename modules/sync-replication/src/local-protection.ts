import type { SyncLocalProtection } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { openSyncDatabase } from './database.js';
import { syncError } from './sync-errors.js';
import {existsSync} from 'node:fs';
import {homeSqlitePath,openReadOnlyHomeSqlite} from '@molis-ai/molis-work-storage';
import {SYNC_STORE_BASELINE} from './database.js';

/** The current local format pins the trusted owner's choice. Removing a port cannot downgrade saved bodies. */
export function pinSyncProtection(home:string,namespace:string,authorize:()=>void,protection?:SyncLocalProtection):void {
  authorize();const db=openSyncDatabase(home);
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      const protectedMode=protection?1:0;
      const row=db.prepare('SELECT protected FROM sync_payload_modes WHERE namespace=?').get(namespace);
      if(row&&row.protected!==protectedMode)throw syncError('scope','同步集合的本机保护配置已变化，原数据已保留');
      if(!row)db.prepare('INSERT INTO sync_payload_modes VALUES (?,?)').run(namespace,protectedMode);
      authorize();db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }finally{db.close();}
}

/** Public technical predicate for the key owner; never reads or decrypts another owner's business records. */
export function hasProtectedSyncPayloads(home:string,namespace:string):boolean {
  if(!existsSync(homeSqlitePath(home,'sync')))return false;
  const db=openReadOnlyHomeSqlite(home,'sync');
  try{if(db.prepare('PRAGMA user_version').get()?.user_version!==SYNC_STORE_BASELINE.version)throw syncError('invalid','同步库版本不符，原数据已保留');
    return !!db.prepare(`SELECT 1 FROM sync_payload_modes WHERE namespace=? AND protected=1 AND
    (EXISTS(SELECT 1 FROM sync_blob_parts WHERE namespace=?) OR
     EXISTS(SELECT 1 FROM sync_failures WHERE namespace=? AND event IS NOT NULL))`).get(namespace,namespace,namespace);
  }finally{db.close();}
}
