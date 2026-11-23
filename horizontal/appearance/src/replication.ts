import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { UiAppearanceSelection } from '@molis-ai/molis-work-contracts/platform/ui';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { createSyncDocument, parseSyncDocumentValue } from '@molis-ai/molis-work-plugin-sdk';
import { assertPortableConfig, personalConfigRecord, createAtomicFileDocument, readStorageSpace } from '@molis-ai/molis-work-storage';
import { builtinAppearance } from './builtins.js';
import { APPEARANCE_STATE_FILE, isSelection, parseAppearanceValues, type AppearanceState, type AppearanceValues, type createStateFile } from './state.js';

const appearanceKey = 'appearance';
const invalid = () => new ActionError('actions.input_invalid', '外观的同步选择无效');

export function appearanceDocument(home: string, file: ReturnType<typeof createStateFile>, spaceId: string, actor: string,
  authorize: () => void, changed: (revision: number) => void) {
  const check = () => {
    authorize();
    const space = readStorageSpace(home);
    if (space?.kind !== 'personal' || space.spaceId !== spaceId || space.ownerUserId !== actor) throw new ActionError('actions.forbidden', '外观不属于当前个人空间');
  };
  const storage = createAtomicFileDocument(file.path, () => {
    check();
    file.writable(file.read());
  }, { durable: true });
  const { sync: _sync, ...empty } = file.empty;
  const encode = (state: AppearanceState) => {
    const { sync, ...data } = state;
    return sync === null ? null : JSON.stringify({ ...sync, data });
  };
  const decode = (source: string | null) => source === null ? file.empty : APPEARANCE_STATE_FILE.parse(JSON.parse(source));
  const selection = (value: unknown): UiAppearanceSelection => {
    assertPortableConfig(value, 4096);
    const row = personalConfigRecord(value, ['space_id', 'selection']);
    if (row.space_id !== spaceId || !isSelection(row.selection)) throw invalid();
    if (builtinAppearance().resolve(row.selection).problems.length) throw new ActionError('actions.unavailable', '这套外观在当前设备不可用', { details: { sync_waiting: true } });
    return row.selection;
  };
  const document = createSyncDocument<AppearanceValues>({
    spaceId, authorize: check, initial: () => empty, validate: parseAppearanceValues,
    storage: {
      read: () => encode(decode(storage.read())),
      compareAndSet(expected, value) {
        const raw = storage.read();
        const before = decode(raw);
        if (encode(before) !== expected) return false;
        const { data, ...sync } = parseSyncDocumentValue(JSON.parse(value), spaceId, parseAppearanceValues);
        mkdirSync(dirname(file.path), { recursive: true, mode: 0o700 });
        const written = storage.compareAndSet(raw, JSON.stringify({ ...data, sync }) + '\n');
        if (written && !isDeepStrictEqual(before.selection, data.selection)) changed(data.selection_revision);
        return written;
      },
    },
    authorizeKey(_data, key, value) {
      check();
      if (key !== appearanceKey) throw invalid();
      if (value !== undefined && value !== null) {
        assertPortableConfig(value, 4096);
        const row = personalConfigRecord(value, ['space_id', 'selection']);
        if (row.space_id !== spaceId || !isSelection(row.selection)) throw invalid();
      }
    },
    observe: data => data.selection_revision ? new Map([[appearanceKey, JSON.stringify(data.selection)]]) : new Map(),
    read: data => data.selection_revision ? { space_id: spaceId, selection: data.selection } : null,
    belongsToProject: () => false,
    apply(data, _key, value) {
      const chosen = value === null ? empty.selection : selection(value);
      if (isDeepStrictEqual(chosen, data.selection) && data.selection_revision > 0) return;
      const revision = data.selection_revision + 1;
      if (!Number.isSafeInteger(revision)) throw invalid();
      const receipt = { request_id: randomUUID(), selection_revision: revision, selection: chosen };
      Object.assign(data, { selection: chosen, selection_revision: revision, last_recoverable: data.selection, undo_selection: data.selection,
        applications: [...data.applications, { actor_id: actor, choice: { kind: 'selection', selection: chosen }, applied: receipt }] });
    },
  });
  const seed = () => {
    const state = file.writable(file.read());
    if (state.sync !== null || !state.selection_revision) return;
    const { sync: _journal, ...values } = state;
    document.update(data => Object.assign(data, values));
  };
  return {
    update(previous: AppearanceState, next: AppearanceState) {
      seed();
      const { sync: _journal, ...values } = next;
      document.update(data => {
        if (data.selection_revision !== previous.selection_revision) {
          throw new ActionError('actions.conflict', '外观已在别处更新，请读取当前选择');
        }
        Object.assign(data, values);
      });
    },
    replica: {
      ...document.replica, maintain: seed,
      next: options => {
        seed();
        return document.replica.next(options);
      },
      receive: (event, options) => {
        seed();
        document.replica.receive(event, options);
      },
    } satisfies SyncReplicaAdapter,
  };
}
