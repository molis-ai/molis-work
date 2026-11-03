import type { ImSearchResult } from '@molis-ai/molis-work-contracts/services/im';
import type { ApiError } from './types.js';
import type { ImCtx } from './controller-types.js';
/** Page-level listeners: search, host messages, the composers, keyboard, window and visibility events. */
export function createImPage(c: ImCtx) {
  const { s, v, q, e, dialog, api, drafts } = c;
  q('[data-search-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = q<HTMLInputElement>('[data-search] input').value.trim(), version = s.epoch, search = ++s.searchVersion, results = q('[data-search-results]');
    if (!query) {
      results.textContent = '输入消息内容或话题名称。';
      return;
    }
    results.textContent = '正在搜索…';
    try {
      const result = await api<ImSearchResult>(c.pathFor(s.roomId) + '/search?q=' + encodeURIComponent(query));
      if (version !== s.epoch || search !== s.searchVersion)
        return;
      results.innerHTML = result.messages.map(message => '<button type="button" class="im-search-result" data-action="jump-message" data-id="' + e(message.id) + '" data-thread="' + e(message.thread_id || '') + '"><small>' + e(message.author.display_name) + ' · ' + e(message.thread_id ? '# ' + (s.roomState!.threads.find(t => t.id === message.thread_id)?.title || '话题') : '主群') + ' · ' + v.time(message.created_at) + '</small>' + e(message.body.slice(0, 240)) + '</button>').join('') || '<p class="im-muted">没有找到相关消息，换个关键词试试。</p>';
    }
    catch (cause) {
      const error = cause as ApiError;
      if (search === s.searchVersion)
        results.textContent = error.message;
    }
  });
  addEventListener('message', event => {
    if (event.source === parent && event.origin === location.origin && event.data?.type === 'molis:im-visibility') {
      s.hostVisible = Boolean(event.data.visible);
      if (['light', 'dark'].includes(event.data.theme))
        document.documentElement.dataset.resolvedTheme = event.data.theme;
      if (s.hostVisible)
        c.scheduleRead();
      else
        c.rememberPosition();
    }
  });
  for (const kind of ['group', 'thread'] as const) {
    c.formFor(kind).addEventListener('submit', event => { event.preventDefault(); void c.send(kind); });
    c.inputFor(kind).addEventListener('input', () => c.readDraft(kind));
    c.inputFor(kind).addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        void c.send(kind);
      }
    });
    // One owner for the stream's scroll (VUX-26): back at the end, the reader follows again and 回到最新消息 goes.
    window.molisFollow?.(v.scroller(kind), { onChange: state => { if (state === 'following') q('[data-action="latest-' + kind + '"]').hidden = true; } });
    v.scroller(kind).addEventListener('scroll', c.scheduleRead, { passive: true });
  }
  dialog.addEventListener('close', () => { s.dialogVersion++; });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || dialog.open)
      return; if (!q('[data-search]').hidden) {
        event.preventDefault();
        c.closeSearch();
      }
    else
      parent.postMessage({ type: 'molis:im-close' }, location.origin);
  });
  addEventListener('resize', () => { c.resizeInput('group'); c.resizeInput('thread'); });
  addEventListener('online', () => { c.connectEvents(); c.scheduleRefresh(); });
  addEventListener('offline', () => c.connection('已离线', true));
  addEventListener('pagehide', () => { c.rememberPosition(); s.events?.close(); drafts.save(); clearTimeout(s.refreshTimer); clearTimeout(s.readTimer); });
  addEventListener('pageshow', event => {
    if (event.persisted) {
      c.connectEvents();
      c.scheduleRefresh();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && s.roomId) {
      c.scheduleRefresh();
      c.scheduleRead();
    }
  });
}
