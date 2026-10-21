import { COPY_FEEDBACK_CLIENT_SCRIPT, SCROLL_FOLLOW_CLIENT_SCRIPT, THEME_BOOTSTRAP_SCRIPT } from '@molis-ai/molis-work-design-system';
import { createViews } from './views.js';
import { createMessageFormat } from './message-format.js';
import { createHistory } from './browser/history.js';
import { createDrafts } from './browser/drafts.js';
import { createTransport } from './browser/transport.js';
import { startIm } from './browser/controller.js';

// Self-contained typed factories are serialized after TypeScript compilation.
// Dependencies are explicit arguments; no server-side imports execute in the browser.
// The shared page mechanisms the conversation uses: one scroll owner per stream, one copy feedback (VUX-26, VUX-19).
export const IM_CLIENT_SCRIPT = THEME_BOOTSTRAP_SCRIPT + SCROLL_FOLLOW_CLIENT_SCRIPT + ';\n' + COPY_FEEDBACK_CLIENT_SCRIPT + `;\n(${startIm})({
  createViews: ${createViews}, createMessageFormat: ${createMessageFormat},
  createHistory: ${createHistory}, createDrafts: ${createDrafts}, createTransport: ${createTransport}
});`;
