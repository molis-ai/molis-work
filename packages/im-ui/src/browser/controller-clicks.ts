import type { StreamKind, ApiError } from './types.js';
import type { ImCtx } from './controller-types.js';
/** The one document click handler that routes every data-action. */
export function createImClicks(c: ImCtx) {
  const { s, root, v, q, dialog, drafts } = c;
  document.addEventListener('click', async (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-action]') : null;
    if (!button)
      return;
    const action = button.dataset.action;
    try {
      if (action === 'select-room')
        await c.selectRoom(button.dataset.id!);
      else if (action === 'select-thread')
        await c.selectThread(button.dataset.id!);
      else if (action === 'create-room')
        c.newRoom();
      else if (action === 'join')
        c.joinRoom();
      else if (action === 'new-topic')
        c.newThread();
      else if (action === 'minimize')
        parent.postMessage({ type: 'molis:im-close' }, location.origin);
      else if (action === 'search')
        c.openSearch();
      else if (action === 'close-search')
        c.closeSearch();
      else if (action === 'quote')
        c.quoteMessage(button.dataset.id!);
      else if (action === 'cancel-quote') {
        const kind = c.activeKind();
        drafts.quote(c.target(kind), { quote_id: undefined, quote_body: undefined, quote_author: undefined });
        c.paintQuote(kind);
      }
      else if (action === 'jump-message')
        await c.jumpMessage(button.dataset.id!, button.dataset.thread || '');
      else if (action === 'mention')
        c.showMentions();
      else if (action === 'insert-mention') {
        const kind = c.activeKind(), input = c.inputFor(kind);
        input.setRangeText('@' + button.dataset.name + ' ', input.selectionStart, input.selectionEnd, 'end');
        dialog.close();
        c.readDraft(kind);
        input.focus();
      }
      else if (action === 'format-help')
        c.openDialog('消息格式', '<p>用 **文字** 标记重点；用反引号包住代码，三个反引号写代码块；用 &gt; 开头引用一段文字。</p><p>Enter 发送，Shift + Enter 换行。</p>');
      else if (action === 'create-thread')
        c.newThread(button.dataset.id!);
      else if (action === 'source-message')
        await c.locateSource(button.dataset.id!);
      else if (action === 'close-thread')
        c.closeThread();
      else if (action === 'share')
        c.share(button.dataset.id!);
      else if (action === 'history')
        await c.history(button.dataset.kind as StreamKind);
      else if (action === 'invite')
        await c.showInvite();
      else if (action === 'members')
        c.members();
      else if (action === 'close-dialog')
        dialog.close();
      else if (action === 'rooms') {
        root.classList.toggle('show-directory');
        q('.im-sidebar-scrim').hidden = !root.classList.contains('show-directory');
      }
      else if (action === 'retry') {
        if (s.member && s.roomId && !s.authLost) {
          await c.selectRoom(s.roomId);
        }
        else
          await c.startup();
      }
      else if (action === 'latest-group' || action === 'latest-thread') {
        const kind = action.slice(7) as StreamKind, n = v.scroller(kind), follow = window.molisFollow?.(n);
        follow ? follow.toLatest() : n.scrollTop = n.scrollHeight;
        button.hidden = true;
      }
      else if (action === 'copy-invite') {
        await c.invitations.copy(button);
      }
      else if (action === 'rotate-invite') {
        await c.invitations.rotate(button);
      }
    }
    catch (cause) {
      const error = cause as ApiError;
      c.toast(error.message);
    }
  });
}
