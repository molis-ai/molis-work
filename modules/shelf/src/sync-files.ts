import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { shelfErrors } from './errors.js';
import { shelfFileDigest } from './file-hash.js';
import { shelfSyncRelative, type ShelfPortableFile, type ShelfPortableItem, type ShelfPortableRecord } from './sync-shape.js';

function within(root: string, relative: string): string {
  const canonical = realpathSync(root), filename = path.resolve(canonical, relative);
  if (!filename.startsWith(canonical + path.sep) || !shelfSyncRelative(relative.split(path.sep).join('/'))) throw shelfErrors.path_invalid('Shelf 文件路径不属于当前材料');
  const parts = path.relative(canonical, filename).split(path.sep); let current = canonical;
  for (const part of parts) {
    current = path.join(current,part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw shelfErrors.path_invalid('Shelf 文件路径包含链接，原内容已保留');
  }
  return filename;
}
export function shelfPortableHash(record: Pick<ShelfPortableRecord,'kind'>, files: readonly ShelfPortableFile[]): string {
  if (!files.length) return '';
  if (record.kind !== 'folder') return files[0]!.digest;
  const hash = createHash('sha256');
  for (const file of [...files].sort((a,b)=>a.relative<b.relative?-1:a.relative>b.relative?1:0)) hash.update(`${file.relative}:${file.digest}\n`);
  return hash.digest('hex');
}
export function shelfPortableBytes(file: ShelfPortableFile): Buffer {
  if (typeof file.data !== 'string') throw shelfErrors.invalid_file('Shelf 文件尚未完整恢复');
  const bytes = Buffer.from(file.data,'base64');
  if (bytes.byteLength !== file.size || shelfFileDigest(bytes) !== file.digest) throw shelfErrors.hash_changed('Shelf 文件字节摘要不匹配，原内容已保留');
  return bytes;
}
export function readShelfPortableFiles(root: string, relative: string, record: ShelfPortableRecord): ShelfPortableFile[] {
  if (!relative) { if (record.copy_hash !== '' || record.size_bytes !== 0) throw shelfErrors.invalid_file('Shelf 材料缺少原文件定位'); return []; }
  const entries = record.kind === 'folder' ? record.children.map(child=>({ relative: child.relative, source: path.join(relative,child.relative), size: child.size_bytes }))
    : [{ relative: record.name, source: relative, size: record.size_bytes }];
  const files = entries.map(entry => {
    const filename = within(root,entry.source);
    let bytes: Buffer;
    try { const stat=lstatSync(filename);if(!stat.isFile()||stat.size!==entry.size||stat.size>(record.kind==='folder'?64:32)*1024*1024)throw shelfErrors.hash_changed('Shelf 原件已变化，请先核对材料');bytes=readFileSync(filename); }
    catch(error){if(error&&typeof error==='object'&&'code' in error&&['ENOENT','EACCES','EPERM'].includes(String(error.code)))throw shelfErrors.sync_unavailable('Shelf 原件暂时不可用，原内容已保留');throw error;}
    return { relative: entry.relative, digest: shelfFileDigest(bytes), size: bytes.byteLength, data: bytes.toString('base64') };
  });
  if(shelfPortableHash(record,files)!==record.copy_hash)throw shelfErrors.hash_changed('Shelf 副本已在外部变化，请先核对材料');
  return files;
}

/** Stage complete bytes before the catalog can reference them; an existing version is verified, never overwritten. */
function immutable(root: string, relative: string, bytes: Buffer): void {
  const filename = within(root,relative); mkdirSync(path.dirname(filename),{recursive:true});
  if(existsSync(filename)){if(!lstatSync(filename).isFile()||shelfFileDigest(readFileSync(filename))!==shelfFileDigest(bytes))throw shelfErrors.hash_changed('Shelf 保存版本与内容不一致，原文件已保留');return;}
  writeFileSync(filename,bytes,{flag:'wx',mode:0o600});
}
export function stageShelfPortableFiles(root: string, item: ShelfPortableItem, authorize:()=>void): string {
  const { record,files }=item;
  if(shelfPortableHash(record,files)!==record.copy_hash)throw shelfErrors.hash_changed('Shelf 文件清单摘要不匹配');
  // Verify every body before any destination path is created.
  const bodies=files.map(file=>({file,bytes:shelfPortableBytes(file)}));authorize();
  if(!files.length)return '';
  const base=path.join('files',record.item_id,'versions',record.copy_hash,record.name);
  for(const {file,bytes}of bodies){authorize();immutable(root,record.kind==='folder'?path.join(base,file.relative):base,bytes);}
  authorize();return base;
}
export function stageShelfTextCopy(root: string, itemId: string, name: string, bytes: Buffer): { relative: string; digest: string } {
  const digest=shelfFileDigest(bytes),relative=path.join('files',itemId,'versions',digest,name);
  immutable(root,relative,bytes);return {relative,digest};
}
