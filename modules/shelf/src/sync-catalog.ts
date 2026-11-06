import {createShelfFileCollector,verifyShelfFileCommit} from './file-gc.js';
import { createSyncDocument, type SyncDocumentStorage } from '@molis-ai/molis-work-plugin-sdk';
import { emptyShelfCatalog, readCurrentCatalog, type CatalogFile } from './catalog-shape.js';
import { shelfDocumentStorage } from './catalog-document.js';
import { shelfCatalogOwner } from './sync-owner.js';
import { shelfErrors } from './errors.js';

export type { CatalogFile, StoredItem } from './catalog-shape.js';
export const SHELF_DOCUMENT_PATH = 'shelf/catalog.json';
export interface ShelfSyncOptions { spaceId: string; storage: SyncDocumentStorage; authorize(): void }

/** Business data and replication metadata are committed by the same atomic document CAS. */
export function createShelfCatalog(sync: ShelfSyncOptions, assertIdle?: (catalog:CatalogFile,key:string)=>void) {
  const files=sync.storage.files;
  if(!files)throw shelfErrors.sync_unavailable("Shelf 同步文件服务不可用");
  const document=createSyncDocument({ ...shelfCatalogOwner(sync,assertIdle),storage:shelfDocumentStorage(sync.storage,readCurrentCatalog,(next,previous)=>verifyShelfFileCommit(files,next,previous)),
      initial:emptyShelfCatalog,validate:readCurrentCatalog });
    return {read:document.read,update:document.update,replica:document.replica,collect:createShelfFileCollector(files,sync.storage,document.read,sync.authorize)};
}
