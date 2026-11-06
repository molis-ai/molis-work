import { builtinSyncBindings } from './builtin-sync.js';
import { personalDocumentOptions } from './personal-document-options.js';
import { assertPersonalSpaceAuthority } from './personal-space-authority.js';
import type { SyncDocumentStorage } from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import type { PluginManifest, PluginStartContext, PluginSyncContext } from '@molis-ai/molis-work-contracts/platform/plugin';
import { ensureStorageSpace } from '@molis-ai/molis-work-storage';

/** Only composition supplies Home ownership. A plugin manifest, project argument or wire payload cannot choose a space. */
export function syncActivation(home: string | undefined, manifest: PluginManifest, context: PluginStartContext, active: () => void): PluginSyncContext | undefined {
  if (!home || !manifest.sync) return undefined;
  const space = ensureStorageSpace(home);
  if (space.kind !== 'personal') return undefined;
  const assertActive = () => { active(); context.requireGrant('storage:private'); };
  assertActive();
  const documents: Record<string, SyncDocumentStorage> = Object.create(null);
  for (const {entry, collection, binding} of builtinSyncBindings()) {
    if (binding.scope !== 'home-document' || entry.manifest.plugin_id !== manifest.plugin_id
      || entry.manifest.publisher.publisher_id !== manifest.publisher.publisher_id || entry.manifest.publisher.signature !== manifest.publisher.signature) continue;
    const declaration = entry.manifest.owner_files;
    if (!declaration || !binding.path.startsWith(declaration.store_name + '/')
      || !declaration.entries.some(file => file.kind === 'file' && binding.path === declaration.store_name + '/' + file.name)) throw new Error('SYNC_DOCUMENT_OWNER_MISMATCH');
    const check = () => { assertActive(); assertPersonalSpaceAuthority(home, space.spaceId); };
    const read = () => { check(); context.requireGrant(declaration.read_permission); };
    const write = () => { check(); context.requireGrant(declaration.write_permission); };
    const storage = personalDocumentOptions(home, binding.path, check, {declaration,read,write})!.storage;
    documents[collection.id] = Object.freeze({
      files: storage.files,
      read() { read(); return storage.read(); },
      compareAndSet(expected:string|null, value:string) { write(); return storage.compareAndSet(expected, value); },
      ...(storage.compareAndSetChecked ? {compareAndSetChecked(expected: string | null, value: string, validate: () => void) { write(); return storage.compareAndSetChecked!(expected, value, () => { write(); validate(); write(); }); }} : {}),
      ...(storage.withReadLock ? {withReadLock<T>(operation: (value: string | null) => T) { read(); return storage.withReadLock!(value => { read(); const result=operation(value); read(); return result; }); }} : {}),
    });
  }
  return Object.freeze({ spaceId: space.spaceId, assertActive, ...(Object.keys(documents).length ? {documents: Object.freeze(documents)} : {}) });
}

/** Space identity for an explicit local-copy operation; it carries no account or network permission. */
export function copyActivation(home: string | undefined, manifest: PluginManifest, context: PluginStartContext, active: () => void): PluginSyncContext | undefined {
  if (!home || !manifest.sync) return undefined;
  const space = ensureStorageSpace(home);
  return Object.freeze({spaceId: space.spaceId, assertActive() { active(); context.requireGrant('storage:private'); }});
}
