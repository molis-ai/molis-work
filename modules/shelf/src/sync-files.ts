import type {SyncDocumentStorage} from '@molis-ai/molis-work-plugin-sdk';
import path from 'node:path';
import { shelfErrors } from './errors.js';
import { shelfFileDigest, shelfFolderDigest } from './file-hash.js';
import { shelfSyncRelative, type ShelfPortableFile, type ShelfPortableItem, type ShelfPortableRecord } from './sync-shape.js';

type Files = NonNullable<SyncDocumentStorage['files']>;
export function shelfPortableHash(record: Pick<ShelfPortableRecord,'kind'>, files: readonly ShelfPortableFile[]): string {
  if (!files.length) return '';
  if (record.kind !== 'folder') return files[0]!.digest;
  return shelfFolderDigest(files);
}
export function shelfPortableBytes(file: ShelfPortableFile): Buffer {
  if (typeof file.data !== 'string') throw shelfErrors.invalid_file('Shelf 文件尚未完整恢复');
  const bytes = Buffer.from(file.data,'base64');
  if (bytes.byteLength !== file.size || shelfFileDigest(bytes) !== file.digest) throw shelfErrors.hash_changed('Shelf 文件字节摘要不匹配，原内容已保留');
  return bytes;
}
export function readShelfPortableFiles(port: Files, relative: string, record: ShelfPortableRecord): ShelfPortableFile[] {
  if (!relative) { if (record.copy_hash !== '' || record.size_bytes !== 0) throw shelfErrors.invalid_file('Shelf 材料缺少原文件定位'); return []; }
  const entries = record.kind === 'folder' ? record.children.map(child=>({ relative: child.relative, source: path.join(relative,child.relative), size: child.size_bytes }))
    : [{ relative: record.name, source: relative, size: record.size_bytes }];
  const files = entries.map(entry => {
    if(!shelfSyncRelative(entry.source))throw shelfErrors.path_invalid("Shelf 文件路径不属于当前材料");
    let bytes: Buffer;
    try { const stat=port.stat(entry.source);if(!stat)throw shelfErrors.sync_unavailable('Shelf 原件暂时不可用，原内容已保留');if(stat.kind!=='file'||stat.size!==entry.size||stat.size>(record.kind==='folder'?64:32)*1024*1024)throw shelfErrors.hash_changed('Shelf 原件已变化，请先核对材料');const data=port.read(entry.source);if(!data)throw shelfErrors.sync_unavailable('Shelf 原件暂时不可用');bytes=Buffer.from(data); }
    catch(error){if(error&&typeof error==='object'&&'code' in error&&['ENOENT','EACCES','EPERM'].includes(String(error.code)))throw shelfErrors.sync_unavailable('Shelf 原件暂时不可用，原内容已保留');throw error;}
    return { relative: entry.relative, digest: shelfFileDigest(bytes), size: bytes.byteLength, data: bytes.toString('base64') };
  });
  if(shelfPortableHash(record,files)!==record.copy_hash)throw shelfErrors.hash_changed('Shelf 副本已在外部变化，请先核对材料');
  return files;
}

/** Stage complete bytes before the catalog can reference them; an existing version is verified, never overwritten. */
function immutable(port: Files, relative: string, bytes: Buffer): void {
  if(!shelfSyncRelative(relative))throw shelfErrors.path_invalid('Shelf 文件路径不属于当前材料');
  if(port.stat(relative)){const existing=port.read(relative);if(!existing||shelfFileDigest(existing)!==shelfFileDigest(bytes))throw shelfErrors.hash_changed('Shelf 保存版本与内容不一致，原文件已保留');return;}
  port.create(relative,bytes);
}
export function stageShelfPortableFiles(port: Files, item: ShelfPortableItem, authorize:()=>void): string {
  const { record,files }=item;
  if(shelfPortableHash(record,files)!==record.copy_hash)throw shelfErrors.hash_changed('Shelf 文件清单摘要不匹配');
  // Verify every body before any destination path is created.
  const bodies=files.map(file=>({file,bytes:shelfPortableBytes(file)}));authorize();
  if(!files.length)return '';
  const base=path.join('files',record.item_id,'versions',record.copy_hash,record.name);
  for(const {file,bytes}of bodies){authorize();immutable(port,record.kind==='folder'?path.join(base,file.relative):base,bytes);}
  authorize();return base;
}
