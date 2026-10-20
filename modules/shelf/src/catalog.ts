import {createShelfFileCollector,verifyShelfFileCommit} from './file-gc.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createSyncDocument, type SyncDocumentStorage } from '@molis-ai/molis-work-plugin-sdk';
import { emptyShelfCatalog, readCurrentCatalog, type CatalogFile } from './catalog-shape.js';
import { shelfDocumentStorage } from './catalog-document.js';
import { shelfCatalogOwner } from './sync-owner.js';
import { shelfErrors } from './errors.js';

export type { CatalogFile, StoredItem } from './catalog-shape.js';
export const SHELF_DOCUMENT_PATH = 'shelf/catalog.json';
export interface ShelfSyncOptions { spaceId: string; storage: SyncDocumentStorage; authorize(): void }

/** Business data and replication metadata are committed by the same atomic document CAS. */
export function createShelfCatalog(root: string, sync?: ShelfSyncOptions, assertIdle?: (catalog:CatalogFile,key:string)=>void) {
  if(sync){
    const document=createSyncDocument({ ...shelfCatalogOwner(root,sync,assertIdle),storage:shelfDocumentStorage(sync.storage,readCurrentCatalog,(next,previous)=>verifyShelfFileCommit(root,next,previous)),
      initial:emptyShelfCatalog,validate:readCurrentCatalog });
    return {read:document.read,update:document.update,replica:document.replica,collect:createShelfFileCollector(root,sync.storage,document.read,sync.authorize)};
  }
  const filename = path.join(root, 'catalog.json');
  const read = (): CatalogFile => {
    if(!existsSync(filename))return emptyShelfCatalog();
    const raw:unknown=JSON.parse(readFileSync(filename,'utf8'));
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||!('replication' in raw)||raw.replication!==null)throw shelfErrors.invalid_file('Shelf 本地目录格式不符，原文件已保留');
    const {replication:_replication,...data}=raw;return readCurrentCatalog(data);
  };
  return { read, replica:undefined,collect:undefined,update(mutate: (catalog: CatalogFile) => void): void {
    const catalog = read(); mutate(catalog); readCurrentCatalog(catalog);mkdirSync(root, { recursive: true });
    const temporary = `${filename}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({...catalog,replication:null}, null, 2)}\n`); renameSync(temporary, filename);
  } };
}
