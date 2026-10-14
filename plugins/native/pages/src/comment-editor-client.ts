/** The editor owns notes and anchors. The side view only requests operations on the currently bound document. */
export const PAGES_COMMENT_EDITOR_SCRIPT = String.raw`
  const commentOpen = async (markId) => {
    if (!selected || unshowable) return;
    const id = selected.id;
    try {
      if (dirty || saveTimer) await persistCurrent();
      if (selected?.id !== id) return;
      const excerpts = [];
      if (markId) editor.view.state.doc.descendants(node => { if (node.isText && node.marks.some(mark => mark.type.name === 'comment' && mark.attrs.id === markId)) excerpts.push(node.text); });
      const detail = { tab: 'plugin:pages/comments', target: { open_id: crypto.randomUUID(), page_id: id, mark_id: markId || null, excerpt: excerpts.join('').slice(0, 2000) } };
      if (window.parent !== window) window.parent.postMessage({ type: 'molis:side-open', ...detail }, location.origin);
      else document.dispatchEvent(new CustomEvent('molis:side-open', { detail }));
    } catch (error) { showNote(error.message, true); }
  };
  workbench.querySelector('[data-pages-comments-open]')?.addEventListener('click', () => { void commentOpen(null); });
  const commentsCommand = async (message) => {
    const context = message.context, command = message.command;
    if (!selected || !editor || unshowable || context?.plugin_id !== 'io.molis.work.pages' || context.object_ref?.id !== selected.id || !command?.request_id) return;
    const answer = { type: 'molis:side-context-result', object_id: selected.id, request_id: command.request_id };
    try {
      if (command.kind === 'draft') {
        answer.text = editor.view.state.doc.textBetween(0, editor.view.state.doc.content.size, '\n\n').slice(0, 100000);
        answer.version = selected.version;
      } else if (command.kind === 'notes') {
        const notes = [];
        editor.view.state.doc.forEach((node, pos, index) => {
          if (String(node.attrs.note || '').trim()) notes.push({ index, text: node.textContent.slice(0, 100), note: String(node.attrs.note) });
        });
        answer.notes = notes; answer.version = selected.version;
      } else if (command.kind === 'focus-mark') {
        answer.found = Editor.focusComment(editor, command.mark_id);
        if(!answer.found) throw new Error(L('原文已变更，保留引用'));
      } else if (command.kind === 'discuss-note') {
        if (dirty || saveTimer || selected.version !== command.version) throw new Error(L('正文已改变，请保存后重新发起评论'));
        const markId = Editor.commentBlock(editor, command.index);
        if (!markId) throw new Error(L('请在正文中选择要讨论的文字'));
        await commentOpen(markId);answer.opened = true;
      } else if (command.kind === 'save-note') {
        if (dirty || saveTimer || selected.version !== command.version) throw new Error(L('正文已改变，请保存后重新发起评论'));
        const node = editor.view.state.doc.maybeChild(command.index);
        if (!node || !('note' in node.attrs) || typeof command.note !== 'string' || command.note.length > 20000) throw new Error(L('文档请求失败'));
        let pos = 0; for (let i=0;i<command.index;i++) pos += editor.view.state.doc.child(i).nodeSize;
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, note: command.note.trim() }));
        await persistCurrent(); answer.saved = true;
      } else return;
    } catch (error) { answer.error = error.message; }
    if (window.parent !== window) window.parent.postMessage(answer, location.origin);
    else document.dispatchEvent(new CustomEvent('molis:side-context-result', { detail: answer }));
  };
  document.addEventListener('molis:side-context-command', event => { void commentsCommand(event.detail); });
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'molis:side-context-command') void commentsCommand(event.data);
  });
`;
