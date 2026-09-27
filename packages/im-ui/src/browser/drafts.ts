import type { BrowserStorage, MessageDraft, TopicDraft } from './types.js';
/** Draft versions and persistence are independent of the visible conversation. */
export function createDrafts(storage: BrowserStorage) {
  let namespace = '';
  let messages: Record<string, MessageDraft> = {};
  const save = () => {
    if (namespace)
      storage.write(namespace, messages);
  };
  function load(memberId: string) {
    namespace = 'molis-im:' + memberId + ':drafts';
    messages = storage.read(namespace, {});
  }
  function edit(target: string, body: string): MessageDraft {
    const prior = messages[target];
    const draft = { ...prior, body, client_id: prior?.body === body ? prior.client_id : crypto.randomUUID() };
    messages[target] = draft;
    save();
    return draft;
  }
  function quote(target: string, value: Pick<MessageDraft, 'quote_id' | 'quote_body' | 'quote_author'>) {
    const draft = messages[target];
    if (!draft)
      return;
    Object.assign(draft, value, { client_id: crypto.randomUUID() });
    save();
  }
  function clearMessage(target: string, submittedId: string): boolean {
    if (messages[target]?.client_id !== submittedId)
      return false;
    delete messages[target];
    save();
    return true;
  }
  function clearTopic(key: string, submittedId: string): boolean {
    const latest = storage.read<TopicDraft | null>(key, null);
    if (latest?.client_id !== submittedId)
      return false;
    storage.write(key, null);
    return true;
  }
  return { load, save, edit, quote, clearMessage, clearTopic, get: (target: string) => messages[target] };
}
