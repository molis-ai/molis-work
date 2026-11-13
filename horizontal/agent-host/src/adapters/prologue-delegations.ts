import { createHash } from "node:crypto";
import { WorkDelegationStore, workDelegationKey } from "../delegations.js";
import { readDelegationState } from "../delegation-state.js";
import { agentErrors } from "../errors.js";
import type { PrologueEffects } from "./prologue-effects.js";

/** One new encrypted kind; metadata contains no work/actor/arguments and existing records are never rewritten. */
export function createPrologueDelegations(effects: PrologueEffects, appId: string): WorkDelegationStore {
  const kind = `molis-work-delegation-${createHash("sha256").update(appId).digest("hex").slice(0, 24)}`;
  const { storage } = effects.host;
  const read = async (id: string) => {
    const record = await storage.get({ kind, id });
    if (!record) return undefined;
    if (record.tombstoned || record.metadata.schema !== 1) throw agentErrors.delegation_unreadable("授权存储记录不可读");
    const bytes = await storage.readSecure({ kind, id });
    try {
      const value = readDelegationState(JSON.parse(new TextDecoder().decode(bytes)));
      if (value.storage_version !== record.version || workDelegationKey(value.subject) !== id) throw agentErrors.delegation_unreadable("授权存储版本或主体不一致");
      return value;
    } finally { bytes.fill(0); }
  };
  return new WorkDelegationStore({
    read,
    async compareAndSet(id, expectedVersion, value, control) {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      try {
        await effects.call({ beforeEffect: control.beforeEffect, assert_current: control.assertCurrent }, async () => {
          await storage.commit({ kind, id, expectedVersion, metadata: { schema: 1 }, secureBody: bytes });
        });
      } finally { bytes.fill(0); }
    },
    async list() {
      const ids: string[] = []; let cursor: string | undefined;
      do {
        const page = await storage.list({ kind, limit: 100, ...(cursor ? { cursor } : {}) });
        ids.push(...page.records.map(record => record.id));
        cursor = page.cursor;
      } while (cursor);
      return ids;
    },
  });
}
