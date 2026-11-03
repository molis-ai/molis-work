import type { StreamKind } from './types.js';
import type { ImBaseCtx, ImCtx } from './controller-types.js';
/** Small shared helpers: element lookup by stream, paths, status lines and the composer's enabled state. */
export function createImShell(c: ImBaseCtx): Pick<ImCtx, 'key' | 'target' | 'formFor' | 'inputFor' | 'pathFor' | 'toast' | 'syncError' | 'connection' | 'status' | 'syncComposer' | 'resizeInput' | 'activeKind' | 'actions' | 'parseInvite'> {
  const { s, q } = c;
  const key = (suffix: string) => 'molis-im:' + s.member!.id + ':' + suffix;
  const target = (kind: StreamKind) => kind === 'thread' ? s.threadId && s.roomId + '/' + s.threadId : s.roomId;
  const formFor = (kind: StreamKind) => q<HTMLFormElement>('[data-composer="' + kind + '"]');
  const inputFor = (kind: StreamKind) => formFor(kind).querySelector('textarea')!;
  const pathFor = (room: string, thread = '') => '/rooms/' + encodeURIComponent(room) + (thread ? '/threads/' + encodeURIComponent(thread) : '');
  const toast = (message: string) => { const node = q('[data-toast]'); node.textContent = message; node.hidden = false; clearTimeout(s.toastTimer); s.toastTimer = setTimeout(() => node.hidden = true, 4000); };
  const syncError = (message: string) => { const node = q('[data-sync-alert]'); node.querySelector('span')!.textContent = message; node.hidden = !message; };
  const connection = (message: string, failed = false) => { const node = q('[data-connection]'); node.textContent = message; node.classList.toggle('is-offline', failed); };
  const status = (kind: StreamKind, message: string, error = false) => { const node = q('[data-compose-status="' + kind + '"]'); node.textContent = message; node.classList.toggle('is-error', error); };
  function syncComposer(kind: StreamKind) {
    const form = formFor(kind), busy = s.busyTargets.has(target(kind));
    const loaded = !s.authLost && s.roomState?.room.id === s.roomId && (kind === 'group' || s.threadState?.thread.id === s.threadId);
    form.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled = busy || !loaded || !inputFor(kind).value.trim() || !target(kind);
    inputFor(kind).disabled = busy || !loaded;
  }
  // The field grows with what is written (data-fit, the shared intrinsic sizing); a value set here sends no input event.
  const resizeInput = (kind: StreamKind) => window.molisFit?.(inputFor(kind));
  const activeKind = (): StreamKind => s.threadId || s.threadDraft ? 'thread' : 'group';
  const actions = (label: string) => '<p class="im-form-error" data-form-error role="alert"></p><div class="im-form-actions"><button class="im-secondary" type="button" data-action="close-dialog">取消</button><button class="im-primary" type="submit">' + label + '</button></div>';
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
  return { key, target, formFor, inputFor, pathFor, toast, syncError, connection, status, syncComposer, resizeInput, activeKind, actions, parseInvite };
}
