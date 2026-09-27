import type { ApiError, BrowserStorage } from './types.js';
/** HTTP, local-host bridge and connection lifecycle have no conversation state. */
export function createTransport(onUnauthorized: () => void) {
  const storage: BrowserStorage = {
    read<T>(key: string, fallback: T): T {
      try {
        return JSON.parse(localStorage.getItem(key) ?? 'null') as T ?? fallback;
      }
      catch {
        return fallback;
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      }
      catch { /* Storage may be unavailable in a private browser. */ }
    },
  };
  async function api<T>(path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch('/im/api' + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    }
    catch {
      const error: ApiError = new Error('暂时无法确认结果，请重试连接。');
      error.uncertain = true;
      throw error;
    }
    let value: T & {
      error?: string;
      code?: string;
    };
    try {
      value = await response.json();
    }
    catch {
      throw new Error('服务返回了无法读取的响应，请重新连接。');
    }
    if (!response.ok) {
      const error: ApiError = new Error(value.error || '暂时无法完成，请重试。');
      error.code = value.code;
      error.status = response.status;
      if (response.status === 401)
        onUnauthorized();
      throw error;
    }
    return value;
  }
  function connectProject(): Promise<void> {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { removeEventListener('message', done); reject(new Error('工作台未能连接此项目，请重新打开讨论。')); }, 15000);
      const done = (event: MessageEvent) => {
        if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'molis:im-connected' || event.data.requestId !== requestId)
          return;
        clearTimeout(timer);
        removeEventListener('message', done);
        event.data.error ? reject(new Error(event.data.error)) : resolve();
      };
      addEventListener('message', done);
      parent.postMessage({ type: 'molis:im-connect', requestId }, location.origin);
    });
  }
  function subscribe(path: string, callbacks: {
    update(): void;
    revoked(): void;
    offline(): void;
  }): EventSource {
    const events = new EventSource('/im/api' + path + '/events');
    for (const type of ['ready', 'reset', 'change'])
      events.addEventListener(type, callbacks.update);
    events.onmessage = callbacks.update;
    events.onopen = callbacks.update;
    events.addEventListener('revoked', () => { events.close(); callbacks.revoked(); });
    events.onerror = callbacks.offline;
    return events;
  }
  return { api, storage, connectProject, subscribe };
}
