import type { ShelfArtifactSource, ShelfItemRecord, ShelfJobRecord } from '@molis-ai/molis-work-contracts/modules/shelf';
import type { SyncBlobReference } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { shelfErrors } from './errors.js';

export type ShelfPortableRecord = Omit<ShelfItemRecord, 'relative_path' | 'artifact_source'> & {
  copy_hash: string;
  artifact_source?: Omit<ShelfArtifactSource, 'project_path'>;
};
export type ShelfPortableJob = Omit<ShelfJobRecord, 'runtime' | 'isolation' | 'execution' | 'error'>;
export interface ShelfPortableFile { relative: string; digest: string; size: number; data: string | SyncBlobReference }
export interface ShelfPortableItem { record: ShelfPortableRecord; files: ShelfPortableFile[] }
export interface ShelfPortableContent { format: 1; spaceId: string; items: ShelfPortableItem[]; jobs: ShelfPortableJob[] }

export const SHELF_PORTABLE_ITEM_FIELDS = ['item_id','group','kind','name','mime','size_bytes','origin_hash','copy_hash','hidden','created_at',
  'source_item_id','source_item_ids','job_id','preview_text','status','failure_reason','children'] as const;
export const SHELF_PORTABLE_JOB_FIELDS = ['job_id','recipe','status','item_id','item_ids','option_id','result_item_id','created_at','finished_at'] as const;
const kinds = ['pdf','image','text','markdown','url','website','file','folder'];
const recipes = ['extract_text','summarize','extract_structure','translate','to_markdown','redact','combine','shortcut'];
const invalid = (): never => { throw shelfErrors.invalid_file('Shelf 同步内容未通过完整格式校验，原内容已保留'); };

export function shelfSyncObject(input: unknown, keys?: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const value = input as Record<string, unknown>;
  if (keys && (keys.some(key => !Object.hasOwn(value,key)) || Object.keys(value).some(key => !keys.includes(key) && !optional.includes(key)))) return invalid();
  return value;
}
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.length <= max; }
function id(value: unknown): value is string { return text(value,120) && /^[A-Za-z0-9_-]{1,120}$/.test(value); }
function nullableId(value: unknown): boolean { return value === null || id(value); }
function ids(value: unknown): value is string[] { return Array.isArray(value) && value.length <= 10000 && value.every(id) && new Set(value).size === value.length; }
function size(value: unknown, max = 64 * 1024 * 1024): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max; }
function stamp(value: unknown): boolean { return text(value,100) && Number.isFinite(Date.parse(value)); }
export function shelfSyncDigest(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
export function shelfSyncKey(key:string):{kind:'item'|'job';id:string}{
  let value:unknown;try{value=JSON.parse(key);}catch{return invalid();}
  if(!Array.isArray(value)||value.length!==2||!['item','job'].includes(value[0])||!id(value[1])||JSON.stringify(value)!==key)return invalid();
  return {kind:value[0] as 'item'|'job',id:value[1]};
}
export function shelfSyncRelative(value: unknown): value is string {
  return text(value,1000) && !!value && !/[\\\0]/.test(value) && !/^[A-Za-z]:/.test(value)
    && value.split('/').every(part => !!part && part !== '.' && part !== '..');
}
function filename(value: unknown): boolean { return shelfSyncRelative(value) && !value.includes('/') && value.length <= 255; }
function coverage(value: unknown): boolean { return value === undefined || (Array.isArray(value) && value.length <= 10000 && value.every(row => text(row,2000))); }

export function validateShelfPortableRecord(input: unknown): ShelfPortableRecord {
  const row = shelfSyncObject(input,SHELF_PORTABLE_ITEM_FIELDS,['artifact_source','material_coverage']);
  if (!id(row.item_id) || !['material','result'].includes(String(row.group)) || !kinds.includes(String(row.kind))
    || !filename(row.name) || !text(row.mime,200) || !size(row.size_bytes) || typeof row.hidden !== 'boolean'
    || !stamp(row.created_at) || !nullableId(row.source_item_id) || !ids(row.source_item_ids) || !nullableId(row.job_id)
    || !(row.preview_text === null || text(row.preview_text,32*1024*1024)) || !['done','failed'].includes(String(row.status))
    || !(row.failure_reason === null || text(row.failure_reason,2000)) || !coverage(row.material_coverage)
    || !Array.isArray(row.children) || row.children.length > 10000) return invalid();
  const empty = row.status === 'failed' && row.size_bytes === 0;
  if (!(shelfSyncDigest(row.origin_hash) || (empty && row.origin_hash === '')) || !(shelfSyncDigest(row.copy_hash) || (empty && row.copy_hash === ''))) return invalid();
  if (row.kind !== 'folder' && row.children.length) return invalid();
  const paths = new Set<string>(); let total = 0;
  for (const value of row.children) {
    const child = shelfSyncObject(value,['relative','name','kind','size_bytes']);
    if (!shelfSyncRelative(child.relative) || !filename(child.name) || child.name !== child.relative.split('/').at(-1)
      || !kinds.includes(String(child.kind)) || child.kind === 'folder' || !size(child.size_bytes) || child.size_bytes === 0 || paths.has(child.relative)) return invalid();
    paths.add(child.relative); total += child.size_bytes;
  }
  if (row.kind === 'folder' && (!row.children.length || total !== row.size_bytes)) return invalid();
  if (row.kind !== 'folder' && Number(row.size_bytes) > 32*1024*1024) return invalid();
  if (row.artifact_source !== undefined) {
    const source = shelfSyncObject(row.artifact_source,['project_id','reference','producer_plugin_id','content_hash']), reference = shelfSyncObject(source.reference,['artifact_id','version']);
    if (!id(source.project_id) || !text(source.producer_plugin_id,500) || !source.producer_plugin_id || !shelfSyncDigest(source.content_hash)
      || !text(reference.artifact_id,500) || !reference.artifact_id || !Number.isSafeInteger(reference.version) || Number(reference.version) < 1) return invalid();
  }
  return row as ShelfPortableRecord;
}

function validateJob(input: unknown): ShelfPortableJob {
  const row = shelfSyncObject(input,SHELF_PORTABLE_JOB_FIELDS,['material_coverage']);
  if (!id(row.job_id) || !recipes.includes(String(row.recipe)) || !['succeeded','failed','cancelled'].includes(String(row.status))
    || !id(row.item_id) || !ids(row.item_ids) || !row.item_ids.includes(row.item_id)
    || !(row.option_id === null || text(row.option_id,500)) || !nullableId(row.result_item_id)
    || !stamp(row.created_at) || !stamp(row.finished_at) || !coverage(row.material_coverage)) return invalid();
  return row as ShelfPortableJob;
}

/** Bytes and reference manifests share one current format; no paths, runtime identity, settings or clipboard fields are accepted. */
export function validateShelfPortable(input: unknown, spaceId: string, key:string, representation: 'bytes' | 'references' = 'bytes'): ShelfPortableContent {
  const identity=shelfSyncKey(key);
  const value = shelfSyncObject(input,['format','spaceId','items','jobs']);
  if (value.format !== 1 || value.spaceId !== spaceId || !Array.isArray(value.items) || !Array.isArray(value.jobs)
    || value.items.length !== (identity.kind==='item'?1:0) || value.jobs.length !== (identity.kind==='job'?1:0)) return invalid();
  const seen = new Set<string>(), jobs = new Set<string>(); let total = 0;
  for (const input of value.items) {
    const item = shelfSyncObject(input,['record','files']), record = validateShelfPortableRecord(item.record);
    if(record.item_id!==identity.id)return invalid();
    if (seen.has(record.item_id) || !Array.isArray(item.files) || item.files.length > 10000) return invalid(); seen.add(record.item_id);
    const expected = record.kind === 'folder' ? record.children.map(child => [child.relative,child.size_bytes] as const)
      : record.copy_hash === '' ? [] : [[record.name,record.size_bytes] as const];
    if (item.files.length !== expected.length) return invalid();
    for (const [index,input] of item.files.entries()) {
      const file = shelfSyncObject(input,['relative','digest','size','data']), [relative,length] = expected[index]!;
      if (file.relative !== relative || file.size !== length || !shelfSyncDigest(file.digest) || !size(file.size,record.kind==='folder'?64*1024*1024:32*1024*1024)) return invalid();
      if (representation === 'bytes') {
        if (typeof file.data !== 'string' || file.data.length > 90*1024*1024 || Buffer.from(file.data,'base64').toString('base64') !== file.data
          || Buffer.from(file.data,'base64').byteLength !== file.size) return invalid();
      } else if(file.size===0){if(file.data!=='')return invalid();}else {
        const reference = shelfSyncObject(file.data,['digest','size']);
        if (reference.digest !== file.digest || reference.size !== file.size) return invalid();
      }
      total += file.size;
    }
  }
  if (total > 100000000) throw shelfErrors.too_large('Shelf 可携带文件超过个人空间内容上限，原内容已保留');
  for (const input of value.jobs) { const job = validateJob(input); if (job.job_id!==identity.id||jobs.has(job.job_id)) return invalid(); jobs.add(job.job_id); }
  return {format:1,spaceId,items:value.items as ShelfPortableItem[],jobs:value.jobs as ShelfPortableJob[]};
}
