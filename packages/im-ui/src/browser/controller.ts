import type { ImMember, ImRoom, ImRoomState, ImThreadState, ImMessage, ImMessagePage, ImRoomList, ImReadState, ImMarkReadInput, ImSessionState, ImInvite, ImSearchResult } from '@molis-ai/molis-work-contracts/services/im';
import type { StreamKind, ScrollAnchor, TopicDraft, ApiError } from './types.js';
import type { createViews } from '../views.js';
import type { createMessageFormat } from '../message-format.js';
import type { createHistory } from './history.js';
import type { createDrafts } from './drafts.js';
import type { createTransport } from './transport.js';
/** Browser-owned orchestration only. Facts remain in the shared server. */
export function startIm(factories: {
  createViews: typeof createViews;
  createMessageFormat: typeof createMessageFormat;
  createHistory: typeof createHistory;
  createDrafts: typeof createDrafts;
  createTransport: typeof createTransport;
}) {
  const root = document.querySelector<HTMLElement>('[data-im-app]')!;
  if (!root)
    return;
  root.querySelector<HTMLElement>('[data-action="minimize"]')!.hidden = parent === window;
  root.querySelector<HTMLElement>('.im-legacy-directory')!.hidden = Boolean(new URLSearchParams(location.search).get('project'));
  const v = factories.createViews(root, factories.createMessageFormat), { q, escape: e, icon } = v;
  const dialog = document.querySelector<HTMLDialogElement>('[data-dialog]')!;
  const dialogBody = dialog.querySelector<HTMLElement>('[data-dialog-body]')!;
  const projectId = new URLSearchParams(location.search).get('project') || '';
  let hostVisible = parent === window, readBusy = false;
  let readTimer: ReturnType<typeof setTimeout> | undefined;
  let searchVersion = 0;
  let positions: Record<string, number> = {}, anchors: Record<string, ScrollAnchor> = {};
  const streamCache = new Map<string, {
    messages: ImMessage[];
    page: ImMessagePage | null;
  }>();
  let member: ImMember | null = null, rooms: ImRoom[] = [], roomState: ImRoomState | null = null, threadState: ImThreadState | null = null;
  let roomId = '', threadId = '';
  let groupMessages: ImMessage[] = [], threadMessages: ImMessage[] = [];
  let groupPage: ImMessagePage | null = null, threadPage: ImMessagePage | null = null;
  let events: EventSource | null = null, epoch = 0, refreshing = false, refreshAgain = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined, toastTimer: ReturnType<typeof setTimeout> | undefined;
  let threadDraft: {
    source_message_id: string;
  } | null = null;
  let seen: Record<string, boolean> = {};
  const busyTargets = new Set<string>();
  let inviteToken = '', dialogVersion = 0, authLost = false;
  const { api, storage, connectProject, subscribe } = factories.createTransport(() => { authLost = true; syncComposer('group'); syncComposer('thread'); syncError('身份连接已失效，请重新连接。已输入的内容会保留。'); });
  const { merge, latest, reset: resetHistory } = factories.createHistory(api);
  const drafts = factories.createDrafts(storage);
  const key = (suffix: string) => 'molis-im:' + member!.id + ':' + suffix;
  const target = (kind: StreamKind) => kind === 'thread' ? threadId && roomId + '/' + threadId : roomId;
  const formFor = (kind: StreamKind) => q<HTMLFormElement>('[data-composer="' + kind + '"]');
  const inputFor = (kind: StreamKind) => formFor(kind).querySelector('textarea')!;
  const pathFor = (room: string, thread = '') => '/rooms/' + encodeURIComponent(room) + (thread ? '/threads/' + encodeURIComponent(thread) : '');
  const toast = (message: string) => { const node = q('[data-toast]'); node.textContent = message; node.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => node.hidden = true, 4000); };
  const syncError = (message: string) => { const node = q('[data-sync-alert]'); node.querySelector('span')!.textContent = message; node.hidden = !message; };
  const connection = (message: string, failed = false) => { const node = q('[data-connection]'); node.textContent = message; node.classList.toggle('is-offline', failed); };
  const status = (kind: StreamKind, message: string, error = false) => { const node = q('[data-compose-status="' + kind + '"]'); node.textContent = message; node.classList.toggle('is-error', error); };
  function syncComposer(kind: StreamKind) {
    const form = formFor(kind), busy = busyTargets.has(target(kind));
    const loaded = !authLost && roomState?.room.id === roomId && (kind === 'group' || threadState?.thread.id === threadId);
    form.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled = busy || !loaded || !inputFor(kind).value.trim() || !target(kind);
    inputFor(kind).disabled = busy || !loaded;
  }
  function resizeInput(kind: StreamKind) {
    const input = inputFor(kind);
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, matchMedia('(max-height:300px)').matches ? 34 : matchMedia('(max-width:640px)').matches ? 75 : 130) + 'px';
  }
  function restoreDraft(kind: StreamKind) {
    inputFor(kind).value = drafts.get(target(kind))?.body || '';
    paintQuote(kind);
    status(kind, '');
    syncComposer(kind);
    resizeInput(kind);
  }
  function readDraft(kind: StreamKind) {
    const id = target(kind);
    if (!id)
      return;
    const body = inputFor(kind).value;
    drafts.edit(id, body);
    syncComposer(kind);
    resizeInput(kind);
  }
  function render(kind: StreamKind, mode: 'preserve' | 'latest' | 'older' = 'preserve') {
    v.stream(kind, kind === 'group' ? groupMessages : threadMessages, kind === 'group' ? groupPage : threadPage, roomState?.threads || [], threadId, mode, threadDraft?.source_message_id || '', member?.id);
    scheduleRead();
  }
  function updateHeader() {
    if (!roomState)
      return;
    v.groupHeader(roomState, threadDraft ? '__draft' : threadId, seen, member);
    v.roomList(rooms, roomId);
  }
  function connectEvents() {
    events?.close();
    events = null;
    if (!roomId)
      return;
    const captured = roomId;
    events = subscribe(pathFor(roomId), {
      update() {
        if (captured !== roomId)
          return; connection('已连接'); scheduleRefresh();
      },
      revoked() { authLost = true; connection('访问已失效', true); syncError('连接或群访问已失效，请重新连接。'); roomState = null; syncComposer('group'); syncComposer('thread'); },
      offline() {
        if (captured === roomId) {
          connection('重连中', true);
          scheduleRefresh();
        }
      },
    });
  }
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void refresh(), 100);
  }
  async function refresh() {
    if (!roomId)
      return;
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    const version = epoch, r = roomId, t = threadId;
    try {
      const [listing, state, group, read, thread] = await Promise.all([
        api<ImRoomList>('/rooms'), api<ImRoomState>(pathFor(r)), latest(pathFor(r), groupMessages, groupPage, () => epoch === version), api<ImReadState>(pathFor(r) + '/read'),
        t ? Promise.all([api<ImThreadState>(pathFor(r, t)), latest(pathFor(r, t), threadMessages, threadPage, () => epoch === version)]) : null,
      ]);
      if (version !== epoch)
        return;
      const threadWasUnloaded = !threadState;
      rooms = listing.rooms;
      roomState = state;
      seen = read.unread;
      positions = read.positions;
      groupMessages = merge(groupMessages, group.messages);
      groupPage = group;
      if (thread) {
        threadState = thread[0];
        threadMessages = merge(threadMessages, thread[1].messages);
        threadPage = thread[1];
        v.context(threadState);
        if (threadWasUnloaded) {
          formFor('thread').hidden = false;
          restoreDraft('thread');
        }
      }
      updateHeader();
      render('group');
      if (t)
        render('thread');
      syncError('');
    }
    catch (cause) {
      const error = cause as ApiError;
      if (version === epoch) {
        if (error.status === 403) {
          authLost = true;
          events?.close();
          syncComposer('group');
          syncComposer('thread');
        }
        connection('同步中断', true);
        syncError(error.status === 403 ? '你已无法访问这个群聊。' : '同步暂时中断，已输入的内容会保留。');
      }
    }
    finally {
      refreshing = false;
      if (refreshAgain) {
        refreshAgain = false;
        scheduleRefresh();
      }
    }
  }
  async function selectRoom(id: string) {
    rememberPosition();
    threadDraft = null;
    const version = ++epoch;
    events?.close();
    roomId = id;
    roomState = null;
    threadId = '';
    threadState = null;
    groupMessages = [];
    threadMessages = [];
    groupPage = null;
    threadPage = null;
    formFor('group').hidden = true;
    formFor('thread').hidden = true;
    syncComposer('group');
    syncComposer('thread');
    q('[data-room-title]').textContent = rooms.find(room => room.id === id)?.title || '群聊';
    q('[data-member-count]').textContent = '正在载入…';
    q('[data-thread-strip]').replaceChildren();
    q('[data-member-avatars]').replaceChildren();
    q('[data-action="invite"]').hidden = true;
    q('[data-welcome]').hidden = true;
    q('[data-conversations]').hidden = false;
    q('[data-thread-pane]').hidden = true;
    q('[data-conversations]').classList.remove('has-thread');
    root.classList.remove('show-directory');
    q('[data-sidebar-scrim]')?.setAttribute('hidden', '');
    q('[data-stream="group"]').innerHTML = '<p class="im-empty" role="status">正在载入群聊…</p>';
    q('[data-conversations]').classList.add('im-loading');
    try {
      const [state, messages] = await Promise.all([api<ImRoomState>(pathFor(id)), latest(pathFor(id), [], null, () => epoch === version)]);
      if (version !== epoch)
        return;
      roomState = state;
      groupMessages = messages.messages;
      groupPage = messages;
      updateHeader();
      render('group', 'latest');
      await restorePosition('group', version);
      formFor('group').hidden = false;
      restoreDraft('group');
      storage.write(key('room'), id);
      connectEvents();
      syncError('');
      q('[data-conversations]').classList.remove('im-loading');
      const saved = storage.read(key('thread:' + id), '');
      if (state.threads.some(thread => thread.id === saved))
        await selectThread(saved, false);
    }
    catch (cause) {
      const error = cause as ApiError;
      if (version === epoch) {
        q('[data-stream="group"]').innerHTML = '<div class="im-empty">' + e(error.message) + '<p><button class="im-secondary" type="button" data-action="retry">重试</button></p></div>';
        syncError(error.message);
      }
    }
    finally {
      if (version === epoch)
        q('[data-conversations]').classList.remove('im-loading');
    }
  }
  function revealThread() {
    const pane = q('[data-thread-pane]'), wasOpen = q('[data-conversations]').classList.contains('has-thread');
    pane.hidden = false;
    pane.classList.remove('is-entering', 'is-switching');
    void pane.offsetWidth;
    pane.classList.add(wasOpen ? 'is-switching' : 'is-entering');
    q('[data-conversations]').classList.add('has-thread');
  }
  const activeKind = (): StreamKind => threadId || threadDraft ? 'thread' : 'group';
  function rememberPosition() {
    if (!member || !roomId)
      return;
    const kind = activeKind();
    if (threadDraft)
      return;
    const id = target(kind);
    // Hidden search results and closed panes have no reading geometry.
    const anchor = q('[data-search]').hidden ? v.captureScroll(kind) : null;
    if (anchor) {
      anchors[id] = anchor;
      storage.write(key('anchors'), anchors);
    }
    if (kind === 'thread' && threadState)
      streamCache.set(id, { messages: threadMessages, page: threadPage });
  }
  async function restorePosition(kind: StreamKind, version: number) {
    const anchor = anchors[target(kind)];
    if (!anchor)
      return;
    let messages = kind === 'group' ? groupMessages : threadMessages, page = kind === 'group' ? groupPage : threadPage;
    while (anchor.id && !messages.some(m => m.id === anchor.id) && page?.has_more) {
      page = await api<ImMessagePage>(pathFor(roomId, kind === 'thread' ? threadId : '') + '/messages?before=' + page.next_before);
      if (version !== epoch)
        return;
      messages = merge(messages, page.messages);
      if (kind === 'group') {
        groupMessages = messages;
        groupPage = page;
      }
      else {
        threadMessages = messages;
        threadPage = page;
      }
    }
    render(kind);
    v.restoreScroll(kind, anchor);
  }
  async function selectThread(id: string, focus = false) {
    if (!roomState || roomState.room.id !== roomId)
      return;
    if (threadId === id && threadState) {
      closeSearch();
      return;
    }
    rememberPosition();
    threadDraft = null;
    closeSearch();
    const version = ++epoch;
    threadId = id;
    threadState = null;
    threadMessages = [];
    threadPage = null;
    revealThread();
    q('[data-thread-title]').textContent = roomState!.threads.find(t => t.id === id)?.title || '话题';
    q('[data-thread-context]').replaceChildren();
    q('[data-stream="thread"]').innerHTML = '<p class="im-empty" role="status">正在载入讨论…</p>';
    formFor('thread').hidden = true;
    updateHeader();
    try {
      const cached = streamCache.get(target('thread'));
      const [state, messages] = await Promise.all([api<ImThreadState>(pathFor(roomId, id)), latest(pathFor(roomId, id), cached?.messages || [], cached?.page || null, () => epoch === version)]);
      if (version !== epoch)
        return;
      threadState = state;
      threadMessages = messages.messages;
      threadPage = messages;
      v.context(state);
      formFor('thread').hidden = false;
      restoreDraft('thread');
      updateHeader();
      render('thread', 'latest');
      await restorePosition('thread', version);
      if (version !== epoch)
        return;
      storage.write(key('thread:' + roomId), id);
      scheduleRead();
      if (focus)
        inputFor('thread').focus({ preventScroll: true });
    }
    catch (cause) {
      const error = cause as ApiError;
      if (version === epoch)
        q('[data-stream="thread"]').innerHTML = '<div class="im-empty">' + e(error.message) + '<p><button type="button" class="im-secondary" data-action="select-thread" data-id="' + e(id) + '">重试</button></p></div>';
    }
  }
  function closeThread() {
    rememberPosition();
    ++epoch;
    threadId = '';
    threadState = null;
    threadDraft = null;
    storage.write(key('thread:' + roomId), '');
    closeSearch();
    q('[data-conversations]').classList.remove('has-thread');
    q('[data-thread-pane]').hidden = true;
    updateHeader();
    render('group');
    const anchor = anchors[roomId];
    if (anchor)
      v.restoreScroll('group', anchor);
    restoreDraft('group');
    scheduleRead();
  }
  async function locateSource(id: string) {
    if (threadId || threadDraft)
      closeThread();
    const version = epoch;
    let message = q('[data-stream="group"] [data-message="' + CSS.escape(id) + '"]');
    try {
      while (!message && groupPage?.has_more && version === epoch) {
        const page = await api<ImMessagePage>(pathFor(roomId) + '/messages?before=' + groupPage.next_before);
        if (version !== epoch)
          return;
        groupPage = page;
        groupMessages = merge(groupMessages, page.messages);
        render('group', 'older');
        message = q('[data-stream="group"] [data-message="' + CSS.escape(id) + '"]');
      }
      if (!message)
        return;
      message.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      message.focus({ preventScroll: true });
      message.classList.remove('im-source-flash');
      void message.offsetWidth;
      message.classList.add('im-source-flash');
      setTimeout(() => message.classList.remove('im-source-flash'), 1200);
    }
    catch (cause) {
      const error = cause as ApiError;
      toast(error.message);
    }
  }
  async function send(kind: StreamKind) {
    const id = target(kind), r = roomId, t = kind === 'thread' ? threadId : '';
    if (!id || authLost || busyTargets.has(id) || roomState?.room.id !== r || (kind === 'thread' && threadState?.thread.id !== t))
      return;
    readDraft(kind);
    const draft = { ...drafts.get(id)! };
    if (!draft.body?.trim())
      return;
    const wasFocused = document.activeElement === inputFor(kind);
    busyTargets.add(id);
    syncComposer(kind);
    status(kind, '正在发送…');
    try {
      const result = await api<{
        message: ImMessage;
      }>(pathFor(r, t) + '/messages', { body: draft.body, client_id: draft.client_id, ...(draft.quote_id ? { quote_id: draft.quote_id } : {}) });
      const cleared = drafts.clearMessage(id, draft.client_id);
      if (id === target(kind)) {
        if (cleared) {
          inputFor(kind).value = '';
          paintQuote(kind);
          resizeInput(kind);
        }
        status(kind, '已发送');
        setTimeout(() => {
          if (id === target(kind) && q('[data-compose-status="' + kind + '"]').textContent === '已发送')
            status(kind, '');
        }, 1800);
        if (kind === 'group')
          groupMessages = merge(groupMessages, [result.message]);
        else
          threadMessages = merge(threadMessages, [result.message]);
        render(kind, 'latest');
      }
      scheduleRefresh();
    }
    catch (cause) {
      const error = cause as ApiError;
      if (id === target(kind))
        status(kind, error.uncertain ? '未能确认发送结果。原文已保留，再次发送不会重复。' : error.message, true);
    }
    finally {
      busyTargets.delete(id);
      syncComposer(kind);
      if (wasFocused && id === target(kind) && !dialog.open && document.activeElement === document.body)
        inputFor(kind).focus({ preventScroll: true });
    }
  }
  async function history(kind: StreamKind) {
    const page = kind === 'group' ? groupPage : threadPage;
    if (!page?.has_more)
      return;
    const version = epoch, node = q('[data-stream="' + kind + '"]'), button = node.querySelector<HTMLButtonElement>('[data-action="history"]')!;
    button.disabled = true;
    button.textContent = '正在载入…';
    try {
      const result = await api<ImMessagePage>(pathFor(roomId, kind === 'thread' ? threadId : '') + '/messages?before=' + page.next_before);
      if (version !== epoch)
        return;
      if (kind === 'group') {
        groupPage = result;
        groupMessages = merge(groupMessages, result.messages);
      }
      else {
        threadPage = result;
        threadMessages = merge(threadMessages, result.messages);
      }
      render(kind, 'older');
    }
    catch (cause) {
      const error = cause as ApiError;
      toast(error.message);
      button.textContent = '重试加载更早的消息';
    }
    finally {
      if (button.isConnected) {
        button.disabled = false;
        if (button.textContent === '正在载入…')
          button.textContent = '加载更早的消息';
      }
    }
  }
  function openDialog(title: string, html: string, submit?: (values: Record<string, string>, current: () => boolean) => Promise<void>) {
    const version = ++dialogVersion;
    dialog.dataset.room = roomId;
    dialog.querySelector('[data-dialog-title]')!.textContent = title;
    dialogBody.innerHTML = html;
    dialog.showModal();
    const current = () => dialog.open && dialogVersion === version;
    const form = dialogBody.querySelector('form');
    if (!form || !submit)
      return;
    let pending: {
      signature: string;
      client_id: string;
    } | null = null, busy = false;
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (busy)
        return;
      const values = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value)]));
      const signature = JSON.stringify(values);
      if (!pending || pending.signature !== signature)
        pending = { signature, client_id: crypto.randomUUID() };
      const err = form.querySelector<HTMLElement>('[data-form-error]')!;
      err.textContent = '';
      busy = true;
      const controls = [...form.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>('button,input,textarea')];
      controls.forEach(control => control.disabled = true);
      try {
        await submit({ ...values, client_id: pending.client_id }, current);
      }
      catch (cause) {
        const error = cause as ApiError;
        err.textContent = error.message;
      }
      finally {
        busy = false;
        controls.forEach(control => control.disabled = false);
      }
    };
  }
  const actions = (label: string) => '<p class="im-form-error" data-form-error role="alert"></p><div class="im-form-actions"><button class="im-secondary" type="button" data-action="close-dialog">取消</button><button class="im-primary" type="submit">' + label + '</button></div>';
  function newRoom() {
    if (!member) {
      toast('先设置你的名字，再创建群聊。');
      return;
    }
    openDialog('创建群聊', '<form><p>成员共享消息和所有 Thread，在同一个空间里讨论。</p><label class="im-field">群聊名称<input name="title" maxlength="80" required placeholder="例如：产品共创" autofocus></label>' + actions('创建群聊') + '</form>', async (body, current) => {
      const result = await api<{
        room: ImRoom;
      }>('/rooms', body); rooms = (await api<ImRoomList>('/rooms')).rooms; v.roomList(rooms, roomId); if (!current())
        return; dialog.close(); await selectRoom(result.room.id);
    });
  }
  function parseInvite(value: unknown) {
    const raw = String(value || '').trim();
    try {
      const url = new URL(raw);
      return new URLSearchParams(url.hash.slice(1)).get('invite') || url.searchParams.get('invite') || raw;
    }
    catch {
      return raw;
    }
  }
  function joinRoom() {
    if (!member) {
      toast('先设置你的名字，再加入群聊。');
      return;
    }
    openDialog('加入群聊', '<form><p>粘贴群成员发来的邀请链接。</p><label class="im-field">邀请链接<input name="token" value="' + e(inviteToken) + '" required autocomplete="off" autofocus></label>' + actions('加入群聊') + '</form>', async (body, current) => {
      const result = await api<{
        room: ImRoom;
      }>('/join', { ...body, token: parseInvite(body.token) }); inviteToken = ''; window.history.replaceState(null, '', location.pathname + location.search.replace(/([?&])invite=[^&]*&?/, '$1').replace(/[?&]$/, '')); rooms = (await api<ImRoomList>('/rooms')).rooms; v.roomList(rooms, roomId); if (!current())
        return; dialog.close(); await selectRoom(result.room.id);
    });
  }
  function newThread(messageId = '') {
    if (!roomState)
      return;
    rememberPosition();
    closeSearch();
    const message = groupMessages.find(item => item.id === messageId), r = roomId, version = ++epoch;
    const stored = storage.read<TopicDraft | null>(key('topic-draft:' + r), null);
    threadId = '';
    threadState = null;
    threadDraft = { source_message_id: messageId };
    revealThread();
    formFor('thread').hidden = true;
    v.context({ thread: { id: 'draft', title: '新话题', source_message_id: messageId }, context: message ? [message] : [] });
    const stream = q('[data-stream="thread"]');
    stream.innerHTML = '<form class="im-thread-setup"><p>让一个问题有自己的讨论空间，所有项目成员都能参与。</p><label class="im-field">话题名称<input name="title" maxlength="80" required placeholder="这次想聊什么？" autocomplete="off"></label><label class="im-field">第一条消息<textarea name="body" rows="4" maxlength="12000" required placeholder="把问题、背景或需要的判断写在这里…"></textarea></label><p class="im-form-error" data-form-error role="alert"></p><div class="im-form-actions"><button class="im-secondary" type="button" data-action="close-thread">留作草稿</button><button class="im-primary" type="submit">发布话题</button></div></form>';
    updateHeader();
    const form = stream.querySelector('form')!;
    const titleInput = form.querySelector<HTMLInputElement>('[name=title]')!, bodyInput = form.querySelector<HTMLTextAreaElement>('[name=body]')!;
    let pending = stored && (stored.source_message_id || '') === messageId ? stored : null, busy = false;
    if (pending) {
      titleInput.value = pending.title;
      bodyInput.value = pending.body;
    }
    const save = () => {
      const title = titleInput.value, body = bodyInput.value; if (!pending || pending.title !== title || pending.body !== body)
        pending = { title, body, source_message_id: messageId || undefined, client_id: crypto.randomUUID() }; storage.write(key('topic-draft:' + r), pending);
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
        const result = await api<ImThreadState>(pathFor(r) + '/threads', submitted);
        drafts.clearTopic(key('topic-draft:' + r), submitted.client_id);
        const state = await api<ImRoomState>(pathFor(r));
        if (r !== roomId || version !== epoch)
          return;
        roomState = state;
        threadDraft = null;
        await selectThread(result.thread.id);
      }
      catch (cause) {
        const error = cause as ApiError;
        if (version === epoch)
          form.querySelector<HTMLElement>('[data-form-error]')!.textContent = error.message;
      }
      finally {
        busy = false;
        controls.forEach(control => control.disabled = false);
      }
    };
  }
  function share(messageId: string) {
    const reply = threadMessages.find(item => item.id === messageId);
    if (!reply)
      return;
    const r = roomId, t = threadId;
    openDialog('把讨论带回群聊', '<form><p>分享到 ' + e(roomState!.room.title) + '，保留原回复和 Thread 链接。</p><div class="im-context-message">' + e(reply.body) + '</div><label class="im-field">补充一句（可选）<textarea name="body" rows="2" maxlength="12000" placeholder="例如：这次讨论的结论"></textarea></label>' + actions('分享到群聊') + '</form>', async (body, current) => {
      const result = await api<{
        message: ImMessage;
      }>(pathFor(r, t) + '/share', { ...body, message_id: messageId }); if (current())
        dialog.close(); if (r === roomId) {
          groupMessages = merge(groupMessages, [result.message]);
          render('group', 'latest');
          scheduleRefresh();
        } toast('已分享到群聊');
    });
  }
  async function showInvite() {
    const r = roomId;
    openDialog('邀请成员 · ' + roomState!.room.title, '<p role="status">正在获取邀请链接…</p>');
    const version = dialogVersion;
    try {
      const invite = await api<ImInvite>(pathFor(r) + '/invite');
      if (!dialog.open || version !== dialogVersion || roomId !== r)
        return;
      dialogBody.innerHTML = '<p>通过这个链接加入群聊后，可以查看群里的消息和全部 Thread。</p><label class="im-field">邀请链接<input class="im-invite-value" readonly value="' + e(invite.url) + '" data-invite-value></label><p class="im-form-error" data-invite-error role="alert"></p><div class="im-form-actions"><button class="im-secondary" type="button" data-action="rotate-invite">更换链接</button><button class="im-primary" type="button" data-action="copy-invite">' + icon('copy') + '复制链接</button></div>';
    }
    catch (cause) {
      const error = cause as ApiError;
      if (dialog.open && version === dialogVersion && roomId === r)
        dialogBody.innerHTML = '<p class="im-form-error">' + e(error.message) + '</p>';
    }
  }
  function members() {
    if (!roomState)
      return;
    openDialog('群成员 · ' + roomState.members.length, roomState!.members.map(person => '<div class="im-member-row">' + v.avatar(person) + '<span>' + e(person.display_name) + '</span><small>' + (person.id === roomState!.room.owner_id ? '创建者' : person.id === member?.id ? '你' : '成员') + '</small></div>').join('') + '<p>所有成员共享群聊与全部 Thread。</p>');
  }
  function paintQuote(kind: StreamKind) {
    const draft = drafts.get(target(kind)), node = q('[data-quote="' + kind + '"]');
    node.hidden = !draft?.quote_id;
    node.innerHTML = draft?.quote_id ? '<span>引用 ' + e(draft.quote_author) + '：' + e(draft.quote_body) + '</span><button type="button" data-action="cancel-quote" aria-label="取消引用">' + icon('x') + '</button>' : '';
  }
  function quoteMessage(id: string) {
    const kind = activeKind(), message = (kind === 'group' ? groupMessages : threadMessages).find(m => m.id === id);
    if (!message)
      return;
    readDraft(kind);
    drafts.quote(target(kind), { quote_id: id, quote_body: message.body, quote_author: message.author.display_name });
    paintQuote(kind);
    inputFor(kind).focus();
  }
  function showMentions() {
    openDialog('提到项目成员', roomState!.members.map(person => '<button type="button" class="im-member-row" data-action="insert-mention" data-name="' + e(person.display_name) + '">' + v.avatar(person) + e(person.display_name) + '</button>').join('') + '<p>插入成员名字。本版不会额外发送通知。</p>');
  }
  function closeSearch() {
    const wasSearching = !q('[data-search]').hidden;
    searchVersion++;
    q('[data-search]').hidden = true;
    q('[data-conversations]').classList.remove('is-searching');
    if (wasSearching) v.restoreScroll(activeKind(), anchors[target(activeKind())] ?? null);
  }
  function openSearch() { rememberPosition(); q('[data-search]').hidden = false; q('[data-conversations]').classList.add('is-searching'); q<HTMLInputElement>('[data-search] input').focus(); }
  q('[data-search-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = q<HTMLInputElement>('[data-search] input').value.trim(), version = epoch, search = ++searchVersion, results = q('[data-search-results]');
    if (!query) {
      results.textContent = '输入消息内容或话题名称。';
      return;
    }
    results.textContent = '正在搜索…';
    try {
      const result = await api<ImSearchResult>(pathFor(roomId) + '/search?q=' + encodeURIComponent(query));
      if (version !== epoch || search !== searchVersion)
        return;
      results.innerHTML = result.messages.map(message => '<button type="button" class="im-search-result" data-action="jump-message" data-id="' + e(message.id) + '" data-thread="' + e(message.thread_id || '') + '"><small>' + e(message.author.display_name) + ' · ' + e(message.thread_id ? '# ' + (roomState!.threads.find(t => t.id === message.thread_id)?.title || '话题') : '主群') + ' · ' + v.time(message.created_at) + '</small>' + e(message.body.slice(0, 240)) + '</button>').join('') || '<p class="im-muted">没有找到相关消息，换个关键词试试。</p>';
    }
    catch (cause) {
      const error = cause as ApiError;
      if (search === searchVersion)
        results.textContent = error.message;
    }
  });
  async function jumpMessage(id: string, thread: string) {
    closeSearch();
    if (!thread) {
      await locateSource(id);
      return;
    }
    await selectThread(thread);
    if (threadId !== thread)
      return;
    const version = epoch;
    let node = q('[data-stream="thread"] [data-message="' + CSS.escape(id) + '"]');
    while (!node && threadPage?.has_more) {
      const before = threadPage.next_before;
      await history('thread');
      if (version !== epoch || before === threadPage.next_before)
        return;
      node = q('[data-stream="thread"] [data-message="' + CSS.escape(id) + '"]');
    }
    if (node) {
      node.scrollIntoView({ block: 'center', behavior: 'instant' });
      node.focus({ preventScroll: true });
      node.classList.add('im-source-flash');
      setTimeout(() => node.classList.remove('im-source-flash'), 1200);
    }
  }
  function scheduleRead() { clearTimeout(readTimer); readTimer = setTimeout(() => void markVisible(), 500); }
  async function markVisible() {
    if (!hostVisible || document.visibilityState !== 'visible' || !roomState || threadDraft || readBusy || !q('[data-search]').hidden)
      return;
    const kind = activeKind(), stream = q('[data-stream="' + kind + '"]'), bounds = v.scroller(kind).getBoundingClientRect(), messages = kind === 'group' ? groupMessages : threadMessages;
    const visible = [...stream.querySelectorAll<HTMLElement>('[data-message]')].filter(node => { const rect = node.getBoundingClientRect(); return rect.top < bounds.bottom && rect.bottom > bounds.top; }).at(-1);
    const message = messages.find(m => m.id === visible?.dataset.message), t = threadId, r = roomId;
    if (!message || message.sequence <= (positions[t] || 0))
      return;
    readBusy = true;
    try {
      const result = await api<ImReadState>(pathFor(r) + '/read', { message_id: message.id, client_id: crypto.randomUUID() } satisfies ImMarkReadInput);
      if (r === roomId) {
        seen = result.unread;
        positions = result.positions;
        updateHeader();
      }
    }
    catch { }
    finally {
      readBusy = false;
    }
  }
  addEventListener('message', event => {
    if (event.source === parent && event.origin === location.origin && event.data?.type === 'molis:im-visibility') {
      hostVisible = Boolean(event.data.visible);
      if (['light', 'dark'].includes(event.data.theme))
        document.documentElement.dataset.resolvedTheme = event.data.theme;
      if (hostVisible)
        scheduleRead();
      else
        rememberPosition();
    }
  });
  async function startup() {
    connection('连接中');
    try {
      events?.close();
      streamCache.clear();
      resetHistory();
      let result = await api<ImSessionState>('/session');
      // The authenticated host may recover its existing local project owner before asking for a new name.
      if (projectId && parent !== window) {
        await connectProject();
        result = await api<ImSessionState>('/session');
      }
      member = result.member;
      authLost = false;
      inviteToken = inviteToken || new URLSearchParams(location.hash.slice(1)).get('invite') || new URLSearchParams(location.search).get('invite') || '';
      if (!member) {
        connection('待加入');
        q('[data-welcome]').hidden = false;
        q('[data-conversations]').hidden = true;
        q('[data-welcome-body]').innerHTML = '<form data-name-form><label class="im-field">你的名字<input name="display_name" maxlength="40" required autocomplete="nickname" placeholder="你的名字"></label><p class="im-form-error" data-form-error role="alert"></p><div class="im-form-actions"><button class="im-primary" type="submit">继续</button></div></form>';
        q<HTMLFormElement>('[data-name-form]').onsubmit = async (event) => {
          event.preventDefault(); const form = event.currentTarget as HTMLFormElement, button = form.querySelector('button')!; button.disabled = true; const name = form.querySelector<HTMLInputElement>('[name=display_name]')!.value; const id = form.dataset.requestName === name && form.dataset.requestId || crypto.randomUUID(); form.dataset.requestId = id; form.dataset.requestName = name; try {
            await api('/session', { display_name: name, client_id: id });
            await startup();
          }
            catch (cause) {
              const error = cause as ApiError;
              form.querySelector<HTMLElement>('[data-form-error]')!.textContent = error.message;
              button.disabled = false;
            }
        };
        v.roomList([], null);
        return;
      }
      drafts.load(member.id);
      anchors = storage.read(key('anchors'), {});
      root.dataset.member = member.id;
      if (projectId) {
        const project = await api<{
          room: ImRoom;
        }>('/projects/' + encodeURIComponent(projectId) + '/room', {});
        rooms = [project.room];
        await selectRoom(project.room.id);
        return;
      }
      q('[data-own-name]').textContent = member.display_name;
      q('[data-own-avatar]').textContent = [...member.display_name].slice(-2).join('');
      rooms = (await api<ImRoomList>('/rooms')).rooms;
      v.roomList(rooms, roomId);
      connection('已连接');
      syncError('');
      if (rooms.length) {
        const saved = storage.read(key('room'), '');
        await selectRoom(rooms.some(room => room.id === saved) ? saved : rooms[0].id);
      }
      else {
        q('[data-welcome-title]').textContent = '从一个群聊开始';
        q('[data-welcome-copy]').textContent = '邀请一起工作的人，把消息、话题和讨论结果留在同一个地方。';
        q('[data-welcome-body]').innerHTML = '<div class="im-form-actions"><button class="im-primary" type="button" data-action="create-room">创建群聊</button><button class="im-secondary" type="button" data-action="join">通过邀请加入</button></div>';
      }
      if (inviteToken)
        joinRoom();
    }
    catch (cause) {
      const error = cause as ApiError;
      connection('未连接', true);
      q('[data-welcome]').hidden = false;
      q('[data-conversations]').hidden = true;
      q('[data-welcome-body]').innerHTML = '<p class="im-form-error">' + e(error.message) + '</p><div class="im-form-actions"><button type="button" class="im-primary" data-action="retry">重新连接</button></div>';
      syncError('群聊服务暂时不可用。');
    }
  }
  for (const kind of ['group', 'thread'] as const) {
    formFor(kind).addEventListener('submit', event => { event.preventDefault(); void send(kind); });
    inputFor(kind).addEventListener('input', () => readDraft(kind));
    inputFor(kind).addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        void send(kind);
      }
    });
    v.scroller(kind).addEventListener('scroll', () => {
      const n = v.scroller(kind); if (n.scrollHeight - n.scrollTop - n.clientHeight < 70)
        q('[data-action="latest-' + kind + '"]').hidden = true; scheduleRead();
    }, { passive: true });
  }
  document.addEventListener('click', async (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-action]') : null;
    if (!button)
      return;
    const action = button.dataset.action;
    try {
      if (action === 'select-room')
        await selectRoom(button.dataset.id!);
      else if (action === 'select-thread')
        await selectThread(button.dataset.id!);
      else if (action === 'create-room')
        newRoom();
      else if (action === 'join')
        joinRoom();
      else if (action === 'new-topic')
        newThread();
      else if (action === 'minimize')
        parent.postMessage({ type: 'molis:im-close' }, location.origin);
      else if (action === 'search')
        openSearch();
      else if (action === 'close-search')
        closeSearch();
      else if (action === 'quote')
        quoteMessage(button.dataset.id!);
      else if (action === 'cancel-quote') {
        const kind = activeKind();
        drafts.quote(target(kind), { quote_id: undefined, quote_body: undefined, quote_author: undefined });
        paintQuote(kind);
      }
      else if (action === 'jump-message')
        await jumpMessage(button.dataset.id!, button.dataset.thread || '');
      else if (action === 'mention')
        showMentions();
      else if (action === 'insert-mention') {
        const kind = activeKind(), input = inputFor(kind);
        input.setRangeText('@' + button.dataset.name + ' ', input.selectionStart, input.selectionEnd, 'end');
        dialog.close();
        readDraft(kind);
        input.focus();
      }
      else if (action === 'format-help')
        openDialog('消息格式', '<p>用 **文字** 标记重点；用反引号包住代码，三个反引号写代码块；用 &gt; 开头引用一段文字。</p><p>Enter 发送，Shift + Enter 换行。</p>');
      else if (action === 'create-thread')
        newThread(button.dataset.id!);
      else if (action === 'source-message')
        await locateSource(button.dataset.id!);
      else if (action === 'close-thread')
        closeThread();
      else if (action === 'share')
        share(button.dataset.id!);
      else if (action === 'history')
        await history(button.dataset.kind as StreamKind);
      else if (action === 'invite')
        await showInvite();
      else if (action === 'members')
        members();
      else if (action === 'close-dialog')
        dialog.close();
      else if (action === 'rooms') {
        root.classList.toggle('show-directory');
        q('.im-sidebar-scrim').hidden = !root.classList.contains('show-directory');
      }
      else if (action === 'retry') {
        if (member && roomId && !authLost) {
          await selectRoom(roomId);
        }
        else
          await startup();
      }
      else if (action === 'latest-group' || action === 'latest-thread') {
        const kind = action.slice(7) as StreamKind, n = v.scroller(kind);
        n.scrollTop = n.scrollHeight;
        button.hidden = true;
      }
      else if (action === 'copy-invite') {
        const input = dialogBody.querySelector<HTMLInputElement>('[data-invite-value]')!;
        try {
          await navigator.clipboard.writeText(input.value);
          button.textContent = '已复制';
        }
        catch {
          input.focus();
          input.select();
          toast('链接已选中，请复制。');
        }
      }
      else if (action === 'rotate-invite') {
        const r = dialog.dataset.room!, version = dialogVersion;
        button.disabled = true;
        try {
          const result = await api<ImInvite>(pathFor(r) + '/invite/rotate', { client_id: crypto.randomUUID() });
          if (dialog.open && version === dialogVersion && roomId === r) {
            dialogBody.querySelector<HTMLInputElement>('[data-invite-value]')!.value = result.url;
            toast('已更换邀请链接，旧链接不再可用');
          }
        }
        catch (cause) {
          const error = cause as ApiError;
          if (dialog.open && version === dialogVersion)
            dialogBody.querySelector<HTMLElement>('[data-invite-error]')!.textContent = error.message;
        }
        finally {
          button.disabled = false;
        }
      }
    }
    catch (cause) {
      const error = cause as ApiError;
      toast(error.message);
    }
  });
  dialog.addEventListener('close', () => { dialogVersion++; });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || dialog.open)
      return; if (!q('[data-search]').hidden) {
        event.preventDefault();
        closeSearch();
      }
    else
      parent.postMessage({ type: 'molis:im-close' }, location.origin);
  });
  addEventListener('resize', () => { resizeInput('group'); resizeInput('thread'); });
  addEventListener('online', () => { connectEvents(); scheduleRefresh(); });
  addEventListener('offline', () => connection('已离线', true));
  addEventListener('pagehide', () => { rememberPosition(); events?.close(); drafts.save(); clearTimeout(refreshTimer); clearTimeout(readTimer); });
  addEventListener('pageshow', event => {
    if (event.persisted) {
      connectEvents();
      scheduleRefresh();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && roomId) {
      scheduleRefresh();
      scheduleRead();
    }
  });
  parent.postMessage({ type: 'molis:im-ready' }, location.origin);
  void startup();
}
