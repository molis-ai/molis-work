import { rollbackPreservingError } from "@molis-ai/molis-work-storage";
import type { SyncLocalProtection } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {checkSqliteBaselineVersion,describeSqliteBaseline,describeSqliteSchema,homeSqlitePath,readUpgradeStore,sqliteStoreLabel,storageErrors,type SqliteBaselineDatabase} from '@molis-ai/molis-work-storage';
import {existsSync} from 'node:fs';
import {openSyncDatabase,SYNC_STORE_BASELINE} from './database.js';
import { syncError } from './sync-errors.js';

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
    }catch(error){rollbackPreservingError(error, () => db.exec('ROLLBACK'));throw error;}
  }finally{db.close();}
}

/**
 * Whether a store at the baseline's version still carries the baseline's tables: the read-only half of the structure refusal every open
 * path makes. Storage keeps that comparison private, so it is mirrored here from the same describers; extra tables belong to another
 * owner and stay accepted, as they are there.
 */
function syncStoreShapePresent(db:SqliteBaselineDatabase):boolean {
  const found=describeSqliteSchema(db),expected=describeSqliteBaseline(SYNC_STORE_BASELINE);
  return Object.entries(expected.tables).every(([name,shape])=>found.tables[name]!==undefined&&JSON.stringify(found.tables[name])===JSON.stringify(shape));
}

/** Public technical predicate for the key owner; never reads or decrypts another owner's business records. */
export function hasProtectedSyncPayloads(home:string,namespace:string):boolean {
  const file=homeSqlitePath(home,'sync');
  if(!existsSync(file))return false;
  // Read-only, no lock, no write and no upgrade (upgrade-chain-design §2.5): the store's version is classified the one way every open path
  // classifies it. Older than this build signals the holder of the Home's lock and is refused as storage.upgrade_pending; newer is
  // storage.store_too_new; tables without a version mark are storage.schema_version_mismatch. Nothing here reads or repairs such a store.
  return readUpgradeStore(file,db=>{
    if(!checkSqliteBaselineVersion(db,file,SYNC_STORE_BASELINE,home))return false;
    if(!syncStoreShapePresent(db))throw storageErrors.schema_structure_mismatch(
      `${sqliteStoreLabel(file,home)} 的结构与当前完整基线不符，不会就地修补。请用与它相符的版本打开，或备份后移走这个库让它重建。`);
    return !!db.prepare(`SELECT 1 FROM sync_payload_modes WHERE namespace=? AND protected=1 AND
    (EXISTS(SELECT 1 FROM sync_blob_parts WHERE namespace=?) OR
     EXISTS(SELECT 1 FROM sync_failures WHERE namespace=? AND event IS NOT NULL))`).get(namespace,namespace,namespace);
  });
}
