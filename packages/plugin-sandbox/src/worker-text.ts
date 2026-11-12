import { AsyncLocalStorage } from 'node:async_hooks';
import { LOCALE_TAG, UI_FILE_LIMITS, type UiLocalePack } from '@molis-ai/molis-work-contracts/platform/ui';
import { installUiText, textKeyPrefix } from '@molis-ai/molis-work-plugin-sdk/ui';

/** The trusted parent can give two languages of the running owner and two projections of common words. */
export const SANDBOX_TEXT_BYTES = UI_FILE_LIMITS.locale * 4 + 1024;

/** Every asynchronous continuation holds its own operation; one left behind cannot see the next call's words or language. */
export function sandboxWorkerText(owner: string, activeCall: () => string | undefined) {
  const current = new AsyncLocalStorage<{ id: string; locale: string | null }>();
  const live = () => {
    const held = current.getStore();
    return held && held.locale !== null && held.id === activeCall() ? held : undefined;
  };
  let packs: readonly UiLocalePack[] = [];
  let chunks: Buffer[] = [], received = 0;
  installUiText({
    locale: () => live()?.locale ?? null,
    noContext: () => 'default',
    ownerOfPrefix: prefix => live() && prefix === textKeyPrefix(owner) ? owner : null,
    defaultLocale: id => live() ? packs.find(pack => pack.owner === id)?.locale ?? null : null,
    message(id, key, locale) {
      if (!live()) return null;
      const words = packs.find(pack => pack.owner === id && pack.locale === locale)?.messages;
      return words && Object.hasOwn(words, key) ? words[key]! : null;
    },
  });
  return {
    part(encoded: string) {
      if (activeCall() !== undefined) process.exit(74);
      const part = Buffer.from(encoded, 'base64');
      received += part.length;
      if (received > SANDBOX_TEXT_BYTES) process.exit(74);
      chunks.push(part);
    },
    run<T>(id: string, locale: string | null, task: () => T): T {
      if (locale !== null && !LOCALE_TAG.test(locale)) process.exit(74);
      if (received) {
        const data = JSON.parse(Buffer.concat(chunks, received).toString('utf8')) as UiLocalePack[];
        if (!Array.isArray(data) || data.length > 4 || data.some(pack => pack.owner !== owner && (pack.owner !== 'workbench'
          || Object.keys(pack.messages).some(key => !key.startsWith('common.'))))) process.exit(74);
        packs = data; chunks = []; received = 0;
      }
      return current.run({ id, locale }, task);
    },
  };
}
