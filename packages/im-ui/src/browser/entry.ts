import { createViews } from "../views.js";
import { createMessageFormat } from "../message-format.js";
import { createHistory } from "./history.js";
import { createDrafts } from "./drafts.js";
import { createTransport } from "./transport.js";
import { createInvitations } from "./invitations.js";
import { startIm } from "./controller.js";
import { createImShell } from "./controller-shell.js";
import { createImComposer } from "./controller-composer.js";
import { createImSync } from "./controller-sync.js";
import { createImRooms } from "./controller-rooms.js";
import { createImTopics } from "./controller-topics.js";
import { createImNavigate } from "./controller-navigate.js";
import { createImDialogs } from "./controller-dialogs.js";
import { createImStartup } from "./controller-startup.js";
import { createImPage } from "./controller-page.js";
import { createImClicks } from "./controller-clicks.js";
import { installImLanguage } from "./locale.js";

Object.assign(document, { molisImLanguage: installImLanguage() });
startIm({
  createViews, createMessageFormat, createHistory, createDrafts, createTransport, createInvitations,
  createImShell, createImComposer, createImSync, createImRooms, createImTopics,
  createImNavigate, createImDialogs, createImStartup, createImPage, createImClicks,
});
