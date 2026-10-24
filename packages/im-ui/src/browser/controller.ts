import type { createViews } from '../views.js';
import type { createMessageFormat } from '../message-format.js';
import type { createHistory } from './history.js';
import type { createDrafts } from './drafts.js';
import type { createTransport } from './transport.js';
import type { createInvitations } from './invitations.js';
import type { ImBaseCtx, ImCtx, ImState } from './controller-types.js';
import type { createImShell } from './controller-shell.js';
import type { createImComposer } from './controller-composer.js';
import type { createImSync } from './controller-sync.js';
import type { createImRooms } from './controller-rooms.js';
import type { createImTopics } from './controller-topics.js';
import type { createImNavigate } from './controller-navigate.js';
import type { createImDialogs } from './controller-dialogs.js';
import type { createImStartup } from './controller-startup.js';
import type { createImPage } from './controller-page.js';
import type { createImClicks } from './controller-clicks.js';

/** The factories the page serializes into the browser; each is self-contained and gets its dependencies as arguments. */
export interface ImFactories {
  createViews: typeof createViews;
  createMessageFormat: typeof createMessageFormat;
  createHistory: typeof createHistory;
  createDrafts: typeof createDrafts;
  createTransport: typeof createTransport;
  createInvitations: typeof createInvitations;
  createImShell: typeof createImShell;
  createImComposer: typeof createImComposer;
  createImSync: typeof createImSync;
  createImRooms: typeof createImRooms;
  createImTopics: typeof createImTopics;
  createImNavigate: typeof createImNavigate;
  createImDialogs: typeof createImDialogs;
  createImStartup: typeof createImStartup;
  createImPage: typeof createImPage;
  createImClicks: typeof createImClicks;
}

/** Browser-owned orchestration only. Facts remain in the shared server. The work itself is in the controller-* layers. */
export function startIm(factories: ImFactories) {
  const root = document.querySelector<HTMLElement>('[data-im-app]')!;
  if (!root)
    return;
  root.querySelector<HTMLElement>('[data-action="minimize"]')!.hidden = parent === window;
  root.querySelector<HTMLElement>('.im-room-directory')!.hidden = Boolean(new URLSearchParams(location.search).get('project'));
  const v = factories.createViews(root, factories.createMessageFormat), { q, escape: e, icon } = v;
  const dialog = document.querySelector<HTMLDialogElement>('[data-dialog]')!;
  const dialogBody = dialog.querySelector<HTMLElement>('[data-dialog-body]')!;
  const projectId = new URLSearchParams(location.search).get('project') || '';
  const s: ImState = {
    hostVisible: parent === window, readBusy: false, readTimer: undefined, searchVersion: 0, positions: {}, anchors: {}, streamCache: new Map(),
    member: null, rooms: [], roomState: null, threadState: null, roomId: '', threadId: '', groupMessages: [], threadMessages: [], groupPage: null,
    threadPage: null, events: null, epoch: 0, refreshing: false, refreshAgain: false, refreshTimer: undefined, toastTimer: undefined,
    threadDraft: null, seen: {}, busyTargets: new Set(), inviteToken: '', dialogVersion: 0, authLost: false,
  };
  const elements = { root, v, q, e, icon, dialog, dialogBody, projectId, s };
  // Cross-layer calls happen in the returned handlers, once the full context is assembled.
  const context = (): ImCtx => c;
  const { api, storage, connectProject, subscribe } = factories.createTransport(() => { s.authLost = true; c.syncComposer('group'); c.syncComposer('thread'); c.syncError('身份连接已失效，请重新连接。已输入的内容会保留。'); });
  const { merge, latest, reset: resetHistory } = factories.createHistory(api);
  const base: ImBaseCtx = Object.assign(elements, { api, storage, connectProject, subscribe, merge, latest, resetHistory, drafts: factories.createDrafts(storage) });
  const methods = Object.assign(base, factories.createImShell(base), factories.createImComposer(base, context), factories.createImSync(base, context), factories.createImRooms(base, context), factories.createImTopics(base, context),
    factories.createImNavigate(base, context), factories.createImDialogs(base, context), factories.createImStartup(base, context));
  const c: ImCtx = Object.assign(methods, { invitations: factories.createInvitations({ api, dialog, body: dialogBody, current: () => ({ room: s.roomId, version: s.dialogVersion }),
    open: methods.openDialog, escape: e, icon, toast: methods.toast }) });
  factories.createImPage(c);
  factories.createImClicks(c);
  parent.postMessage({ type: 'molis:im-ready' }, location.origin);
  void c.startup();
}
