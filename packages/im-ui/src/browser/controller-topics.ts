import type { ImRoomState, ImThreadState } from '@molis-ai/molis-work-contracts/services/im';
import type { TopicDraft, ApiError } from './types.js';
import type { ImCtx } from './controller-types.js';
/** The thread pane: revealing it, closing it and the new-topic form. */
export function createImTopics(c: ImCtx): Pick<ImCtx, 'revealThread' | 'closeThread' | 'newThread'> {
  const { s, v, q, api, storage, drafts } = c;
  function revealThread() {
    const pane = q('[data-thread-pane]'), wasOpen = q('[data-conversations]').classList.contains('has-thread');
    pane.hidden = false;
    pane.classList.remove('is-entering', 'is-switching');
    void pane.offsetWidth;
    pane.classList.add(wasOpen ? 'is-switching' : 'is-entering');
    q('[data-conversations]').classList.add('has-thread');
  }
  function closeThread() {
    c.rememberPosition();
    ++s.epoch;
    s.threadId = '';
    s.threadState = null;
    s.threadDraft = null;
    storage.write(c.key('thread:' + s.roomId), '');
    c.closeSearch();
    q('[data-conversations]').classList.remove('has-thread');
    q('[data-thread-pane]').hidden = true;
    c.updateHeader();
    c.render('group');
    const anchor = s.anchors[s.roomId];
    if (anchor)
      v.restoreScroll('group', anchor);
    c.restoreDraft('group');
    c.scheduleRead();
  }
  function newThread(messageId = '') {
    if (!s.roomState)
      return;
    c.rememberPosition();
    c.closeSearch();
    const message = s.groupMessages.find(item => item.id === messageId), r = s.roomId, version = ++s.epoch;
    const stored = storage.read<TopicDraft | null>(c.key('topic-draft:' + r), null);
    s.threadId = '';
    s.threadState = null;
    s.threadDraft = { source_message_id: messageId };
    revealThread();
    c.formFor('thread').hidden = true;
    v.context({ thread: { id: 'draft', title: '新话题', source_message_id: messageId }, context: message ? [message] : [] });
    const stream = q('[data-stream="thread"]');
    stream.innerHTML = '<form class="im-thread-setup"><p>让一个问题有自己的讨论空间，所有项目成员都能参与。</p><label class="im-field">话题名称<input name="title" maxlength="80" required placeholder="这次想聊什么？" autocomplete="off"></label><label class="im-field">第一条消息<textarea name="body" rows="4" maxlength="12000" required placeholder="把问题、背景或需要的判断写在这里…"></textarea></label><p class="im-form-error" data-form-error role="alert"></p><div class="im-form-actions"><button class="im-secondary" type="button" data-action="close-thread">留作草稿</button><button class="im-primary" type="submit">发布话题</button></div></form>';
    c.updateHeader();
    const form = stream.querySelector('form')!;
    const titleInput = form.querySelector<HTMLInputElement>('[name=title]')!, bodyInput = form.querySelector<HTMLTextAreaElement>('[name=body]')!;
    let pending = stored && (stored.source_message_id || '') === messageId ? stored : null, busy = false;
    if (pending) {
      titleInput.value = pending.title;
      bodyInput.value = pending.body;
    }
    const save = () => {
      const title = titleInput.value, body = bodyInput.value; if (!pending || pending.title !== title || pending.body !== body)
        pending = { title, body, source_message_id: messageId || undefined, client_id: crypto.randomUUID() }; storage.write(c.key('topic-draft:' + r), pending);
    };
    form.addEventListener('input', save);
    titleInput.focus({ preventScroll: true });
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (busy)
        return;
      save();
      busy = true;
      const controls = [...form.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>('button,input,textarea')];
      controls.forEach(control => control.disabled = true);
      form.querySelector<HTMLElement>('[data-form-error]')!.textContent = '';
      const submitted = { ...pending! };
      try {
        const result = await api<ImThreadState>(c.pathFor(r) + '/threads', submitted);
        drafts.clearTopic(c.key('topic-draft:' + r), submitted.client_id);
        const state = await api<ImRoomState>(c.pathFor(r));
        if (r !== s.roomId || version !== s.epoch)
          return;
        s.roomState = state;
        s.threadDraft = null;
        await c.selectThread(result.thread.id);
      }
      catch (cause) {
        const error = cause as ApiError;
        if (version === s.epoch)
          form.querySelector<HTMLElement>('[data-form-error]')!.textContent = error.message;
      }
      finally {
        busy = false;
        controls.forEach(control => control.disabled = false);
      }
    };
  }
  return { revealThread, closeThread, newThread };
}
