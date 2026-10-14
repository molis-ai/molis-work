import type { EditorView } from "prosemirror-view";
import type { UiSideContext } from "@molis-ai/molis-work-contracts/platform/ui";
import { focusComment, commentBlock } from "./editor-comments.js";
import { commentErrorMessage } from "./comment-browser-types.js";
interface CommentEditorState {
  readonly selected: { id: string; version: number }|null;
  readonly editor: {view: EditorView}|null;
  readonly unshowable: boolean; readonly dirty: boolean;
  workbench: HTMLElement; persistCurrent(): Promise<unknown>; showNote(message: string,error: boolean): void; translate(value: string): string;
}
interface CommentCommand {
  context?: UiSideContext; command?: {request_id: string; kind: string; mark_id: string; index: number; version: number; note: string};
}
interface CommentAnswer {
  type: string; object_id: string; request_id: string; text?: string; version?: number; found?: boolean; opened?: boolean; saved?: boolean; error?: string;
  notes?: Array<{index: number; text: string; note: string}>;
}
/** The editor owns notes and anchors. The side view only requests operations on the currently bound document. */
export function bindComments(state: CommentEditorState): (markId: string|null) => Promise<void> {
  const { workbench, persistCurrent, showNote, translate: L }=state;
  const commentOpen = async (markId: string|null) => {
    if (!state.selected || !state.editor || state.unshowable) return;
    const id = state.selected.id;
    try {
      if (state.dirty) await persistCurrent();
      if (state.selected?.id !== id) return;
      const excerpts: string[] = [];
      if (markId) state.editor.view.state.doc.descendants(node => { if (node.isText && node.marks.some(mark => mark.type.name === 'comment' && mark.attrs.id === markId)) excerpts.push(node.text ?? ""); });
      const detail = { tab: 'plugin:pages/comments', target: { open_id: crypto.randomUUID(), page_id: id, mark_id: markId || null, excerpt: excerpts.join('').slice(0, 2000) } };
      if (window.parent !== window) window.parent.postMessage({ type: 'molis:side-open', ...detail }, location.origin);
      else document.dispatchEvent(new CustomEvent('molis:side-open', { detail }));
    } catch (error) { showNote(commentErrorMessage(error), true); }
  };
  workbench.querySelector('[data-pages-comments-open]')?.addEventListener('click', () => { void commentOpen(null); });
  const commentsCommand = async (message: CommentCommand) => {
    const context = message.context, command = message.command;
    if (!state.selected || !state.editor || state.unshowable || context?.plugin_id !== 'io.molis.work.pages' || context.object_ref?.id !== state.selected.id || !command?.request_id) return;
    const answer: CommentAnswer = { type: 'molis:side-context-result', object_id: state.selected.id, request_id: command.request_id };
    try {
      if (command.kind === 'draft') {
        answer.text = state.editor.view.state.doc.textBetween(0, state.editor.view.state.doc.content.size, '\n\n').slice(0, 100000);
        answer.version = state.selected.version;
      } else if (command.kind === 'notes') {
        const notes: NonNullable<CommentAnswer["notes"]> = [];
        state.editor.view.state.doc.forEach((node, _pos, index) => {
          if (String(node.attrs.note || '').trim()) notes.push({ index, text: node.textContent.slice(0, 100), note: String(node.attrs.note) });
        });
        answer.notes = notes; answer.version = state.selected.version;
      } else if (command.kind === 'focus-mark') {
        answer.found = focusComment(state.editor, command.mark_id);
        if(!answer.found) throw new Error(L('原文已变更，保留引用'));
      } else if (command.kind === 'discuss-note') {
        if (state.dirty || state.selected.version !== command.version) throw new Error(L('正文已改变，请保存后重新发起评论'));
        const markId = commentBlock(state.editor, command.index);
        if (!markId) throw new Error(L('请在正文中选择要讨论的文字'));
        await commentOpen(markId);answer.opened = true;
      } else if (command.kind === 'save-note') {
        if (state.dirty || state.selected.version !== command.version) throw new Error(L('正文已改变，请保存后重新发起评论'));
        const node = state.editor.view.state.doc.maybeChild(command.index);
        if (!node || !('note' in node.attrs) || typeof command.note !== 'string' || command.note.length > 20000) throw new Error(L('文档请求失败'));
        let pos = 0; for (let i=0;i<command.index;i++) pos += state.editor.view.state.doc.child(i).nodeSize;
        state.editor.view.dispatch(state.editor.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, note: command.note.trim() }));
        await persistCurrent(); answer.saved = true;
      } else return;
    } catch (error) { answer.error = commentErrorMessage(error); }
    if (window.parent !== window) window.parent.postMessage(answer, location.origin);
    else document.dispatchEvent(new CustomEvent('molis:side-context-result', { detail: answer }));
  };
  document.addEventListener('molis:side-context-command', event => { void commentsCommand((event as CustomEvent<CommentCommand>).detail); });
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'molis:side-context-command') void commentsCommand(event.data);
  });
  return commentOpen;
}
