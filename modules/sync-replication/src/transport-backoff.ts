import {ActionError, defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import {syncResponseMessage} from './quota.js';
import {syncError} from './sync-errors.js';

const errors = defineErrorCodes('sync_replication', {transport_backoff: 'unavailable'});
export const isTransportBackoff = (error: unknown): boolean =>
  error instanceof ActionError && error.code === 'sync_replication.transport_backoff';

function retryAfterTime(header: string | null, now: number): number {
  if (!header) return now;
  if (/^\d+$/u.test(header)) {
    const deadline = now + Number(header) * 1000;
    return Number.isSafeInteger(deadline) ? deadline : now;
  }
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(now, date) : now;
}

export function syncTransportBackoff() {
  let failures = 0;
  let retryAt = 0;
  let notBefore = 0;
  let message = syncResponseMessage(undefined);
  const delay = (header: string | null) => {
    const now = Date.now();
    const exponential = 15_000 * 2 ** Math.min(failures++, 5);
    notBefore = Math.max(notBefore, retryAfterTime(header, now));
    retryAt = Math.max(retryAt, now + Math.min(300_000, exponential * (1 + Math.random() / 4)), notBefore);
  };
  return {
    delay: () => retryAt - Date.now(),
    assertReady() {
      if (Date.now() < notBefore) throw errors.transport_backoff(message);
    },
    currentError() {
      return errors.transport_backoff(message);
    },
    offline(cause: unknown) {
      delay(null);
      message = cause instanceof Error ? cause.message : syncResponseMessage(undefined);
      return errors.transport_backoff(message);
    },
    async check(response: Response, authorize: () => void) {
      if (response.status !== 429 && response.status < 500) return;
      const header = response.headers.get('Retry-After');
      let code: unknown;
      try {
        code = (await response.json() as {error?: unknown} | null)?.error;
      } catch {
        // Gateway errors may be HTML. Keep the retry deadline and generic status message.
      }
      authorize();
      // A corrupt part belongs to one item. Preserve isolation even when the server reports it as 503.
      if (response.status !== 429 && code === 'SYNC_BLOB_CORRUPT') throw syncError('invalid', syncResponseMessage(code));
      delay(header);
      message = syncResponseMessage(typeof code === 'string' ? code : response.status === 429 ? 'SYNC_RATE_LIMITED' : undefined);
      throw errors.transport_backoff(message);
    },
    succeeded() {
      if (Date.now() < notBefore) return;
      failures = 0;
      retryAt = 0;
      notBefore = 0;
    },
  };
}
