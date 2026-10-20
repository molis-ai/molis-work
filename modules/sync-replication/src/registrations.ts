import type { SyncRegistration } from './index.js';
import { syncNamespace } from './namespace.js';
import { syncError } from './sync-errors.js';

export function assertSyncRegistration(registration: SyncRegistration | undefined, authorize: () => void): void {
  authorize();
  if (registration?.available?.() === false) throw syncError('scope', '同步插件实例或授权已变化');
  authorize();
}

/** Host discovery is a projection, never policy. Publish a complete checked set only after authority survives the wait. */
export function syncRegistrations(fixed: readonly SyncRegistration[], discover: (() => Promise<readonly SyncRegistration[]>) | undefined, authorize: () => void) {
  const permanent = [...fixed], reserved = new Set(permanent.map(row => syncNamespace(row.selection)));
  if (reserved.size !== permanent.length) throw syncError('invalid', '同步目录存在重复集合');
  let dynamic: readonly SyncRegistration[] = [], pending: Promise<void> | undefined;
  return {
    current(): SyncRegistration[] {
      authorize();
      const current = [...permanent, ...dynamic].filter(row => {
        try { return row.available?.() !== false; } catch { return false; /* A revoked owner is unavailable, not an empty successful replica. */ }
      });
      authorize(); return current;
    },
    refresh(): Promise<void> {
      if (!discover) { authorize(); return Promise.resolve(); }
      if (pending) return pending;
      const run = async () => {
        authorize(); const next = await discover(); authorize();
        const names = new Set<string>(), result: SyncRegistration[] = [];
        for (const row of next) {
          const namespace = syncNamespace(row.selection);
          if (names.has(namespace)) throw syncError('invalid', '动态同步目录存在重复集合');
          names.add(namespace);
          if (!reserved.has(namespace)) result.push(row);
        }
        dynamic = result;
      };
      pending = run().finally(() => { pending = undefined; });
      return pending;
    },
  };
}
