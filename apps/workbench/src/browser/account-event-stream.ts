/** A reconnect is bound to the original Host page registration, never to a replacement Cookie identity. */
export function accountEventStream(pageId: string, receive: (value: {type: string; preparation?: import('./account-cohort.js').AccountPreparation | null}) => void, disconnected: () => void, revoked: () => void) {
  let binding = '', source: EventSource | null = null, closed = false, delay = 500;
  let retry: ReturnType<typeof setTimeout> | undefined, watchdog: ReturnType<typeof setTimeout> | undefined;
  const stop = () => { source?.close(); source = null; clearTimeout(watchdog); };
  const close = () => { closed = true; stop(); clearTimeout(retry); };
  const lost = () => {
    stop(); disconnected();
    if (!closed && !retry) { retry = setTimeout(() => { retry = undefined; open(); }, delay); delay = Math.min(delay * 2, 10_000); }
  };
  const alive = () => { clearTimeout(watchdog); watchdog = setTimeout(lost, 35_000); };
  const open = () => {
    if (closed || source || !binding) return;
    const stream = source = new EventSource('/api/personal/events?' + new URLSearchParams({page:pageId,binding}));
    alive();
    stream.onmessage = event => {
      if (source !== stream) return;
      let value: Parameters<typeof receive>[0];
      try { value = JSON.parse(event.data) as Parameters<typeof receive>[0]; }
      catch { lost(); return; }
      delay = 500; alive();
      if (value.type === 'revoked') { close(); revoked(); return; }
      if (value.type !== 'heartbeat') receive(value);
    };
    stream.onerror = () => { if (source === stream) lost(); };
  };
  return {
    connect(value?: string) {
      if (closed || !value) return;
      if (binding && binding !== value) { close(); revoked(); return; }
      binding = value; if (!retry) open();
    },
    close,
  };
}
