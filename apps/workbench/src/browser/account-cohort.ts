import { accountEventStream } from './account-event-stream.js';
import { accountTransition } from './account-transition.js';
export interface AccountPreparation {id: string; ownerPageId: string; intent: 'switch' | 'logout'; ready: boolean}

/** Host supplies the participant set and existing lease. This channel only prepares this page and reports its acknowledgement. */
export function accountCohort(prepare: (signal: AbortSignal) => Promise<boolean>, revoked: () => void, failure: (error: unknown) => void) {
  const pageId: string = crypto.randomUUID();
  const transition = accountTransition();
  const L = globalThis.L || (text => text);
  let current: AccountPreparation | null = null, preparing: string | null = null, revision = 0;
  let cancellation: Promise<void> | null = null;
  let preparationAbort: AbortController | null = null;
  let waiting: {id: string; resolve(value: string): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>} | null = null;
  const request = (action: string, id?: string, intent?: string) => molisWorkRequest<AccountPreparation | {preparation: null}>(
    '/api/personal/prepare?' + new URLSearchParams({action,page:pageId,...(id?{id}:{}),...(intent?{intent}:{})}), {method:'POST',body:{}});
  const rejectWaiting = () => {
    if (waiting) {clearTimeout(waiting.timer); waiting.reject(new Error(L('账号操作已取消，尚未退出或切换账号。'))); waiting = null;}
  };
  const resume = () => {
    preparationAbort?.abort(); preparationAbort = null;
    current = null; preparing = null; revision++; rejectWaiting(); transition.resume();
  };
  const cancel = (): Promise<void> => {
    if (cancellation) return cancellation;
    const id = current?.id; rejectWaiting();
    cancellation = (async () => {
      if(id) await request('cancel',id);
      // A failed request cannot prove that the Host cancelled its OAuth attempt.
      if (!id || current?.id === id) resume();
    })().finally(() => {cancellation = null;});
    return cancellation;
  };
  const observe = (value: AccountPreparation | null | undefined) => {
    if (!value) {if (value === null && current) resume(); return;}
    if (current?.id !== value.id) preparationAbort?.abort();
    revision++;
    current = value;
    if (value.ready && waiting?.id === value.id) {clearTimeout(waiting.timer); waiting.resolve(value.id); waiting = null;}
    if (preparing === value.id) return;
    preparing = value.id;
    const controller = preparationAbort = new AbortController();
    void (async () => {
      try {
        if (!await prepare(controller.signal)) {if (current?.id === value.id)await cancel();return;}
        if (controller.signal.aborted || current?.id !== value.id) return;
        const acknowledgedRevision = revision;
        const answer = await request('ack',value.id);
        if (current?.id === value.id && revision === acknowledgedRevision && 'id' in answer) observe(answer);
      } catch(error) {if (controller.signal.aborted || current?.id !== value.id)return;try {await cancel();} catch { /* The failure below keeps the preparation visibly unsuccessful. */ } failure(error);}
    })();
  };
  const events = accountEventStream(pageId, value => {
    if (value.type === 'cancelled') { resume(); return; }
    observe(value.preparation);
  }, () => { if (current) void cancel().catch(failure); }, () => { resume(); revoked(); });
  const connect = (binding?: string) => events.connect(binding);
  const detach = transition.changed(() => { if (current) void cancel().catch(failure); });
  return {pageId,connect,observe,cancel,get revision() { return revision; },
    async begin(intent: 'switch' | 'logout'): Promise<string | null> {
      if(cancellation)await cancellation;
      connect();
      const startedRevision = revision;
      const answer = await request('start',undefined,intent).catch(error => {if (revision === startedRevision) throw error;return null;});
      if (!answer || revision !== startedRevision && (!('id' in answer) || current?.id !== answer.id)) return null;
      if (!('id' in answer)) throw new Error(L('账号准备尚未完成，请稍后重试。'));
      if (current?.id !== answer.id) observe(answer);
      if (current?.id === answer.id && current.ready) return answer.id;
      return new Promise<string>((resolve,reject) => {
        const timer = setTimeout(() => {reject(new Error(L('有页面未响应，尚未退出或切换账号。请检查其他窗口后重试。')));void cancel().catch(failure);},30000);
        waiting = {id:answer.id,resolve,reject,timer};
      });
    },
    close() {
      preparationAbort?.abort(); preparationAbort = null;
      events.close();detach();
      void molisWorkRequest('/api/personal/prepare?' + new URLSearchParams({action:'leave',page:pageId}),{method:'POST',body:{},keepalive:true})
        .catch(() => { /* An unconfirmed departure remains a missing participant and cancels a later preparation. */ });
    },
  };
}
