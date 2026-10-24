import type { ImMember, ImRoom, ImRoomState, ImThreadState, ImMessage, ImMessagePage } from '@molis-ai/molis-work-contracts/services/im';
import type { StreamKind, ScrollAnchor } from './types.js';
import type { createViews } from '../views.js';
import type { createHistory } from './history.js';
import type { createDrafts } from './drafts.js';
import type { createTransport } from './transport.js';
import type { createInvitations } from './invitations.js';

/** The page's mutable state. One object, so the controller's layers (each serialized on its own) share it instead of a closure. */
export interface ImState {
  hostVisible: boolean;
  readBusy: boolean;
  readTimer: ReturnType<typeof setTimeout> | undefined;
  searchVersion: number;
  positions: Record<string, number>;
  anchors: Record<string, ScrollAnchor>;
  streamCache: Map<string, { messages: ImMessage[]; page: ImMessagePage | null }>;
  member: ImMember | null;
  rooms: ImRoom[];
  roomState: ImRoomState | null;
  threadState: ImThreadState | null;
  roomId: string;
  threadId: string;
  groupMessages: ImMessage[];
  threadMessages: ImMessage[];
  groupPage: ImMessagePage | null;
  threadPage: ImMessagePage | null;
  events: EventSource | null;
  epoch: number;
  refreshing: boolean;
  refreshAgain: boolean;
  refreshTimer: ReturnType<typeof setTimeout> | undefined;
  toastTimer: ReturnType<typeof setTimeout> | undefined;
  threadDraft: { source_message_id: string } | null;
  seen: Record<string, boolean>;
  busyTargets: Set<string>;
  inviteToken: string;
  dialogVersion: number;
  authLost: boolean;
}

type Views = ReturnType<typeof createViews>;

/**
 * What every layer of the controller sees: the page's elements and services (set before any layer runs), the shared state,
 * and the functions each layer returns. Layers call each other through this object, late-bound, so none of them closes over another.
 */
export interface ImCtx extends ReturnType<typeof createTransport> {
  merge: ReturnType<typeof createHistory>['merge'];
  latest: ReturnType<typeof createHistory>['latest'];
  root: HTMLElement;
  v: Views;
  q: Views['q'];
  e: Views['escape'];
  icon: Views['icon'];
  dialog: HTMLDialogElement;
  dialogBody: HTMLElement;
  projectId: string;
  s: ImState;
  resetHistory: () => void;
  drafts: ReturnType<typeof createDrafts>;
  invitations: ReturnType<typeof createInvitations>;
  // shell
  key: (suffix: string) => string;
  target: (kind: StreamKind) => string;
  formFor: (kind: StreamKind) => HTMLFormElement;
  inputFor: (kind: StreamKind) => HTMLTextAreaElement;
  pathFor: (room: string, thread?: string) => string;
  toast: (message: string) => void;
  syncError: (message: string) => void;
  connection: (message: string, failed?: boolean) => void;
  status: (kind: StreamKind, message: string, error?: boolean) => void;
  syncComposer: (kind: StreamKind) => void;
  resizeInput: (kind: StreamKind) => unknown;
  activeKind: () => StreamKind;
  actions: (label: string) => string;
  parseInvite: (value: unknown) => string;
  // composer
  restoreDraft: (kind: StreamKind) => void;
  readDraft: (kind: StreamKind) => void;
  render: (kind: StreamKind, mode?: 'preserve' | 'latest' | 'older') => void;
  updateHeader: () => void;
  rememberPosition: () => void;
  restorePosition: (kind: StreamKind, version: number) => Promise<void>;
  paintQuote: (kind: StreamKind) => void;
  quoteMessage: (id: string) => void;
  closeSearch: () => void;
  openSearch: () => void;
  scheduleRead: () => void;
  markVisible: () => Promise<void>;
  // sync
  connectEvents: () => void;
  scheduleRefresh: () => void;
  refresh: () => Promise<void>;
  history: (kind: StreamKind) => Promise<void>;
  // rooms
  selectRoom: (id: string) => Promise<void>;
  selectThread: (id: string, focus?: boolean) => Promise<void>;
  // topics
  revealThread: () => void;
  closeThread: () => void;
  newThread: (messageId?: string) => void;
  // navigate
  locateSource: (id: string) => Promise<void>;
  send: (kind: StreamKind) => Promise<void>;
  jumpMessage: (id: string, thread: string) => Promise<void>;
  // dialogs
  openDialog: (title: string, html: string, submit?: ((values: Record<string, string>, current: () => boolean) => Promise<void>) | undefined) => void;
  newRoom: () => void;
  joinRoom: () => void;
  share: (messageId: string) => void;
  showInvite: () => Promise<void>;
  members: () => void;
  showMentions: () => void;
  // startup
  startup: () => Promise<void>;
}
