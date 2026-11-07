import type { SqliteDatabase } from "./sqlite.js";
import {DatabaseSync} from 'node:sqlite';
import Database from 'better-sqlite3';
import {existsSync,statSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';

interface CatalogReader {prepare(sql:string):{get():unknown}}
const probeErrors=defineErrorCodes('storage',{catalog_probe_busy:'conflict'});
function catalogOwner(db:CatalogReader):string|null {
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'catalog_meta'").get())return null;
  const row=db.prepare("SELECT value FROM catalog_meta WHERE key = 'owner'").get() as {value:unknown}|undefined;
  return typeof row?.value==='string'?row.value:null;
}
function catalogVersion(db:CatalogReader):number {
  const row=db.prepare("SELECT value FROM catalog_meta WHERE key = 'schema_version'").get() as {value:unknown}|undefined;
  return Number(row?.value);
}
function fileState(filename:string){
  const stat=statSync(filename,{bigint:true});
  return {stamp:[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':'),wal:existsSync(filename+'-wal'),shm:existsSync(filename+'-shm'),journal:existsSync(filename+'-journal')};
}
/** Early refusal only; the normal writer must still validate its own live owner/version before business effects.
 * A closed WAL file is inspected without creating sidecars. A live WAL is read normally, never ignored by immutable mode.
 * Partial journals or a change during a closed-file observation are refused, not repaired or checkpointed.
 */
export function inspectCatalogFile(filename:string):{owner:string|null;version:number}{
  const before=fileState(filename);
  if(before.journal||before.wal!==before.shm)throw probeErrors.catalog_probe_busy('目录库日志尚未就绪，请稍后重试，原件已保留');
  const uri=pathToFileURL(filename);uri.searchParams.set('mode','ro');if(!before.wal)uri.searchParams.set('immutable','1');
  // A second SQLite library in this process can release the resident driver's POSIX locks on close.
  // Live WAL readers must share that driver's connection/lock bookkeeping; immutable is only for closed files.
  const db=before.wal?new Database(filename,{readonly:true,fileMustExist:true}):new DatabaseSync(uri.href,{readOnly:true,allowExtension:false});let result:{owner:string|null;version:number};
  try{db.exec('BEGIN');const owner=catalogOwner(db);result={owner,version:owner===null?Number.NaN:catalogVersion(db)};db.exec('COMMIT');}finally{db.close();}
  const after=fileState(filename);
  if(after.stamp!==before.stamp||after.journal||after.wal!==before.wal||after.shm!==before.shm)throw probeErrors.catalog_probe_busy('目录库在检查期间发生变化，请重试，原件已保留');
  return result;
}

/** Existing local catalog schema metadata; the Host supplies identity and migration versions. */
export class LocalCatalogMetadata {
  constructor(private readonly db: SqliteDatabase) {}
  create(): void {
    this.db.exec(`CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  }
  initialize(owner: string, version: number): void {
    this.db.prepare("INSERT INTO catalog_meta (key, value) VALUES (?, ?)").run("owner", owner);
    this.db.prepare("INSERT INTO catalog_meta (key, value) VALUES (?, ?)").run("schema_version", String(version));
  }
  owner(): string | null {
    return catalogOwner(this.db);
  }
  version(): number {
    return catalogVersion(this.db);
  }
  setVersion(version: number): void {
    this.db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run(String(version));
  }

  setOwner(owner: string): void {
    const changed = Number(this.db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'owner'").run(owner).changes);
    if (changed === 0) this.db.prepare("INSERT INTO catalog_meta (key, value) VALUES (?, ?)").run("owner", owner);
  }
}
