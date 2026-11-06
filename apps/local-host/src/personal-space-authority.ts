import { resolve } from 'node:path';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';

/** A live Host surface owns this admission. It is not an identity stored in a plugin or a database. */
const surfaces = new Map<string, {spaceId: string; assertCurrent(): void}>();
export function bindPersonalSpaceAuthority(home: string, spaceId: string, assertCurrent: () => void): () => void {
  const key = resolve(home), authority = {spaceId, assertCurrent};
  if (surfaces.has(key)) throw new ActionError('actions.forbidden', '个人空间已有活动的授权主人');
  surfaces.set(key, authority);
  return () => { if (surfaces.get(key) === authority) surfaces.delete(key); };
}
/** Local retained snapshots are account content, even when cloud synchronization is not selected. */
export function assertPersonalSpaceAuthority(home: string, spaceId: string): void {
  const authority = surfaces.get(resolve(home));
  if (!authority || authority.spaceId !== spaceId) throw new ActionError('actions.forbidden', '当前个人空间没有活动账号授权');
  authority.assertCurrent();
}
