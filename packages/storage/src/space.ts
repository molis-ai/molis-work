import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { StorageSpace, SpaceAssetRef } from '@molis-ai/molis-work-contracts/platform/storage';

export type { StorageSpace, SpaceAssetRef };
const FILE = 'storage-space.json';
export const STORAGE_SPACE_SCHEMA_SQL = 'CREATE TABLE IF NOT EXISTS molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);';

function validate(value: StorageSpace): StorageSpace {
  if (!value || typeof value.spaceId!=='string' || !/^space_[a-zA-Z0-9_-]+$/.test(value.spaceId)) throw new Error('SPACE_METADATA_INVALID');
  if (value.kind === 'team') throw new Error('TEAM_SPACE_NOT_AVAILABLE');
  if (value.kind === 'local') {
    if (value.ownerUserId !== null || value.teamId !== null || value.issuer !== null || value.applicationId !== null) throw new Error('SPACE_METADATA_INVALID');
  } else if (value.kind !== 'personal' || ![value.ownerUserId,value.issuer,value.applicationId].every(item=>typeof item==='string' && item.trim().length>0) || value.teamId !== null) {
    throw new Error('SPACE_METADATA_INVALID');
  }
  return Object.freeze({spaceId:value.spaceId,kind:value.kind,ownerUserId:value.ownerUserId,teamId:value.teamId,issuer:value.issuer,applicationId:value.applicationId});
}

/** Stable across devices; never based on mutable names, emails or OS paths. */
export function personalStorageSpace(issuer: string, applicationId: string, userId: string): StorageSpace {
  const key = JSON.stringify([issuer, applicationId, userId]);
  return validate({spaceId:'space_'+createHash('sha256').update(key).digest('hex'),kind:'personal',ownerUserId:userId,teamId:null,issuer,applicationId});
}

/** A Home is one immutable ownership scope. Existing Homes become local in place. */
export function ensureStorageSpace(home: string, expected?: StorageSpace): StorageSpace {
  if (expected) validate(expected);
  fs.mkdirSync(home,{recursive:true,mode:0o700});
  const file=path.join(home,FILE);
  const value=expected ?? {spaceId:'space_'+randomUUID(),kind:'local',ownerUserId:null,teamId:null,issuer:null,applicationId:null};
  // Publish a fully written file atomically without replacing a competing owner.
  if (!fs.existsSync(file)) {
    const temp=path.join(home,`.space-${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temp,JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});
      try { fs.linkSync(temp,file); } catch(error) { if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error; }
    } finally { if(fs.existsSync(temp))fs.unlinkSync(temp); }
  }
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  let stored:StorageSpace;
  try { if(fs.fstatSync(fd).size>4096)throw new Error('SPACE_METADATA_INVALID'); stored=validate(JSON.parse(fs.readFileSync(fd,'utf8'))); }
  finally { fs.closeSync(fd); }
  if(expected && JSON.stringify(stored)!==JSON.stringify(validate(expected)))throw new Error('SPACE_OWNERSHIP_MISMATCH');
  return stored;
}

export interface SpaceDatabase {
  exec(sql:string):unknown;
  prepare(sql:string):{get(...args:unknown[]):unknown;run(...args:unknown[]):unknown};
}

/** Read existing ownership without assigning or changing the database's space. */
export function readDatabaseSpace(db: SpaceDatabase): StorageSpace | null {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='molis_storage_space'").get()) return null;
  const row = db.prepare('SELECT descriptor FROM molis_storage_space WHERE singleton=1').get() as { descriptor: string } | undefined;
  return row ? validate(JSON.parse(row.descriptor)) : null;
}

/** Normalized ownership for every record/version/blob reference owned by this store.
 * Never enumerate business tables or relabel a database from another space.
 */
export function bindDatabaseSpace(db:SpaceDatabase,space:StorageSpace):void {
  validate(space);
  const descriptor=JSON.stringify(validate(space));
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='molis_storage_space'").get()){
    const existing=db.prepare('SELECT descriptor FROM molis_storage_space WHERE singleton=1').get() as {descriptor:string}|undefined;
    if(existing){if(existing.descriptor!==descriptor)throw new Error('SPACE_OWNERSHIP_MISMATCH');return;}
  }
  db.exec(STORAGE_SPACE_SCHEMA_SQL);
  db.prepare('INSERT INTO molis_storage_space VALUES (1,?,?) ON CONFLICT(singleton) DO NOTHING').run(space.spaceId,descriptor);
  const row=db.prepare('SELECT descriptor FROM molis_storage_space WHERE singleton=1').get() as {descriptor:string};
  if(row.descriptor!==descriptor)throw new Error('SPACE_OWNERSHIP_MISMATCH');
}

export function spaceAssetRef(space:StorageSpace,owner:string,assetId:string,projectId?:string):SpaceAssetRef {
  validate(space);
  if(!owner || !assetId)throw new Error('ASSET_ID_REQUIRED');
  return {spaceId:space.spaceId,owner,assetId,...(projectId?{projectId}:{})};
}
