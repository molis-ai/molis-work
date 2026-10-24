import { COPY_FEEDBACK_CLIENT_SCRIPT, FIELD_FIT_CLIENT_SCRIPT, SCROLL_FOLLOW_CLIENT_SCRIPT, THEME_BOOTSTRAP_SCRIPT } from '@molis-ai/molis-work-design-system';
import { createViews } from './views.js';
import { createMessageFormat } from './message-format.js';
import { createHistory } from './browser/history.js';
import { createDrafts } from './browser/drafts.js';
import { createTransport } from './browser/transport.js';
import { createInvitations } from './browser/invitations.js';
import { startIm } from './browser/controller.js';

// Self-contained typed factories are serialized after TypeScript compilation.
// Dependencies are explicit arguments; no server-side imports execute in the browser.
// The shared page mechanisms the conversation uses: one scroll owner per stream, one copy feedback, one intrinsic field
// sizing (VUX-26, VUX-19, VUX-16).
export const IM_CLIENT_SCRIPT = THEME_BOOTSTRAP_SCRIPT + SCROLL_FOLLOW_CLIENT_SCRIPT + ';\n' + COPY_FEEDBACK_CLIENT_SCRIPT + ';\n' + FIELD_FIT_CLIENT_SCRIPT + `;\n(${startIm})({
  createViews: ${createViews}, createMessageFormat: ${createMessageFormat},
  createHistory: ${createHistory}, createDrafts: ${createDrafts}, createTransport: ${createTransport}, createInvitations: ${createInvitations}
});`;
