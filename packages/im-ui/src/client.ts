import { COPY_FEEDBACK_CLIENT_SCRIPT, FIELD_FIT_CLIENT_SCRIPT, SCROLL_FOLLOW_CLIENT_SCRIPT, THEME_BOOTSTRAP_SCRIPT } from '@molis-ai/molis-work-design-system';
import { createViews } from './views.js';
import { createMessageFormat } from './message-format.js';
import { createHistory } from './browser/history.js';
import { createDrafts } from './browser/drafts.js';
import { createTransport } from './browser/transport.js';
import { createInvitations } from './browser/invitations.js';
import { startIm } from './browser/controller.js';
import { createImShell } from './browser/controller-shell.js';
import { createImComposer } from './browser/controller-composer.js';
import { createImSync } from './browser/controller-sync.js';
import { createImRooms } from './browser/controller-rooms.js';
import { createImTopics } from './browser/controller-topics.js';
import { createImNavigate } from './browser/controller-navigate.js';
import { createImDialogs } from './browser/controller-dialogs.js';
import { createImStartup } from './browser/controller-startup.js';
import { createImPage } from './browser/controller-page.js';
import { createImClicks } from './browser/controller-clicks.js';

// Self-contained typed factories are serialized after TypeScript compilation.
// Dependencies are explicit arguments; no server-side imports execute in the browser.
// The shared page mechanisms the conversation uses: one scroll owner per stream, one copy feedback, one intrinsic field
// sizing (VUX-26, VUX-19, VUX-16).
export const IM_CLIENT_SCRIPT = THEME_BOOTSTRAP_SCRIPT + SCROLL_FOLLOW_CLIENT_SCRIPT + ';\n' + COPY_FEEDBACK_CLIENT_SCRIPT + ';\n' + FIELD_FIT_CLIENT_SCRIPT + `;\n(${startIm})({
  createViews: ${createViews}, createMessageFormat: ${createMessageFormat},
  createHistory: ${createHistory}, createDrafts: ${createDrafts}, createTransport: ${createTransport}, createInvitations: ${createInvitations},
  createImShell: ${createImShell}, createImComposer: ${createImComposer}, createImSync: ${createImSync}, createImRooms: ${createImRooms}, createImTopics: ${createImTopics},
  createImNavigate: ${createImNavigate}, createImDialogs: ${createImDialogs}, createImStartup: ${createImStartup}, createImPage: ${createImPage}, createImClicks: ${createImClicks}
});`;
