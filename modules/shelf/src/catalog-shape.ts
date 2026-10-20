import type { ShelfClipboardRecord, ShelfDeviceSettings, ShelfItemRecord, ShelfJobRecord } from '@molis-ai/molis-work-contracts/modules/shelf';
import { defaultShelfDeviceSettings } from './settings.js';
import { shelfErrors } from './errors.js';

export interface StoredItem extends Omit<ShelfItemRecord, 'hidden' | 'size_bytes' | 'preview_text' | 'relative_path'> {
  hidden: boolean;
  size_bytes: number;
  preview_text: string | null;
  relative_path: string;
  copy_hash: string;
  origin_realpath: string | null;
}
export interface CatalogFile {
  version: 2;
  seeded_sample: boolean;
  items: StoredItem[];
  jobs: ShelfJobRecord[];
  clipboard: ShelfClipboardRecord[];
  current_clip_id: string | null;
  settings: ShelfDeviceSettings;
}
export function emptyShelfCatalog(): CatalogFile {
  return { version: 2, seeded_sample: false, items: [], jobs: [], clipboard: [], current_clip_id: null, settings: defaultShelfDeviceSettings() };
}
export function readCurrentCatalog(value: unknown): CatalogFile {
  const raw = value as Partial<CatalogFile> | null;
  const keys = Object.keys(emptyShelfCatalog());
  if (!raw || raw.version !== 2 || Object.keys(raw).some(key=>!keys.includes(key)) || keys.some(key=>!Object.hasOwn(raw,key))
    || typeof raw.seeded_sample !== 'boolean' || !Array.isArray(raw.items) || !Array.isArray(raw.jobs) || !Array.isArray(raw.clipboard)
    || !(raw.current_clip_id === null || typeof raw.current_clip_id === 'string') || !raw.settings
    || raw.items.some(item => !item || !Array.isArray(item.source_item_ids) || !Array.isArray(item.children)
      || !['done', 'failed'].includes(item.status) || !(item.failure_reason === null || typeof item.failure_reason === 'string')
      || typeof item.relative_path!=='string' || typeof item.copy_hash!=='string' || !/^(?:[a-f0-9]{64})?$/.test(item.copy_hash)
      || !(item.origin_realpath===null||typeof item.origin_realpath==='string'))
    || new Set(raw.items.map(item=>item.item_id)).size!==raw.items.length
    || raw.jobs.some(job => !job || !Array.isArray(job.item_ids) || !(job.option_id === null || typeof job.option_id === 'string') || typeof job.runtime !== 'string')
    || new Set(raw.jobs.map(job=>job.job_id)).size!==raw.jobs.length
    || raw.clipboard.some(clip => !clip || typeof clip.clip_id !== 'string' || !['url', 'text'].includes(clip.kind)
      || typeof clip.body !== 'string' || typeof clip.title !== 'string' || typeof clip.created_at !== 'string' || typeof clip.fingerprint !== 'string')) {
    throw shelfErrors.invalid_file('Shelf 目录格式不符；期望版本 2 的现行格式。原文件已保留，请恢复当前格式的目录。');
  }
  return raw as CatalogFile;
}
