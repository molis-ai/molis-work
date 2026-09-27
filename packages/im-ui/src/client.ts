import { THEME_BOOTSTRAP_SCRIPT } from '@molis-ai/molis-work-design-system';
import { createViews } from './views.js';
import { createMessageFormat } from './message-format.js';
import { createHistory } from './browser/history.js';
import { createDrafts } from './browser/drafts.js';
import { createTransport } from './browser/transport.js';
import { startIm } from './browser/controller.js';

// Self-contained typed factories are serialized after TypeScript compilation.
// Dependencies are explicit arguments; no server-side imports execute in the browser.
export const IM_CLIENT_SCRIPT = THEME_BOOTSTRAP_SCRIPT + `(${startIm})({
  createViews: ${createViews}, createMessageFormat: ${createMessageFormat},
  createHistory: ${createHistory}, createDrafts: ${createDrafts}, createTransport: ${createTransport}
});`;
