import type { SyncLocalProtection } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { syncError } from './project-replica-sync-errors.js';

type Purpose = 'outbox' | 'conflict' | 'recovery_local' | 'recovery_remote' | 'deferred_event';
const PREFIX = 'sealed-sync:1:';
/** Protect all persisted bodies, not only uploads. No plaintext fallback exists for a protected owner. */
export function replicaSerialization(authorize: () => void, protection?: SyncLocalProtection) {
  const binding = (key: string, purpose: Purpose) => JSON.stringify([purpose, key]);
  return {
    write(value: unknown, key: string, purpose: Purpose): string {
      authorize();
      const json = JSON.stringify(value);
      if (typeof json !== 'string') throw syncError('invalid', '同步正文无法保存');
      if (!protection) return json;
      const sealed = protection.seal(Buffer.from(json, 'utf8'), binding(key, purpose));
      authorize();
      if (!(sealed instanceof Uint8Array) || !sealed.length) throw syncError('invalid', '同步正文保护失败');
      return PREFIX + Buffer.from(sealed).toString('base64');
    },
    read(input: unknown, key: string, purpose: Purpose): unknown {
      authorize();
      const raw = String(input);
      if (!protection) return JSON.parse(raw);
      if (!raw.startsWith(PREFIX)) throw syncError('invalid', '此同步正文未使用当前本机保护，原数据已保留');
      const encoded = raw.slice(PREFIX.length), sealed = Buffer.from(encoded, 'base64');
      if (!sealed.length || sealed.toString('base64') !== encoded) throw syncError('invalid', '同步正文保护格式无效');
      const plaintext = protection.open(sealed, binding(key, purpose));
      authorize();
      if (!(plaintext instanceof Uint8Array)) throw syncError('invalid', '同步正文保护失败');
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
    },
  };
}
