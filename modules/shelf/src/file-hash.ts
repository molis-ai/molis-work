import { createHash } from 'node:crypto';

export function shelfFileDigest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
