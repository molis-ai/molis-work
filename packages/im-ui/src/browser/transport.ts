import type { ApiError, BrowserStorage } from './types.js';
const localFailure = (word: string): ApiError => Object.assign(new Error(word), { word });

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
    if (body && typeof body === "object" && "subjects" in body && Array.isArray(body.subjects) && body.subjects.length && window.molisDiscussionObjects) {
      try { return await window.molisDiscussionObjects.send<T>(path, body); }
      catch (cause) {
        const error = cause as ApiError;
        if (!error.status) error.uncertain = true;
        if (error.status === 401) onUnauthorized();
        throw error;
      }
    }
    let response: Response;
    try {
      response = await fetch('/im/api' + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    }
    catch {
      const error: ApiError = localFailure("im-ui.transport.unconfirmed");
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
      throw localFailure("im-ui.transport.unreadable");
    }
    if (!response.ok) {
      const error: ApiError = new Error(typeof value?.error === "string" ? value.error : "Discussion request failed");
      error.code = typeof value?.code === "string" ? value.code : undefined;
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
      const timer = setTimeout(() => { removeEventListener('message', done); reject(localFailure("im-ui.transport.workbench-unavailable")); }, 15000);
      const done = (event: MessageEvent) => {
        if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'molis:im-connected' || event.data.requestId !== requestId)
          return;
        clearTimeout(timer);
        removeEventListener('message', done);
        if (!event.data.error) { resolve(); return; }
        const error: ApiError = new Error(event.data.error);
        error.code = typeof event.data.code === "string" ? event.data.code : undefined;
        error.word = "im-ui.transport.workbench-unavailable";
        reject(error);
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
