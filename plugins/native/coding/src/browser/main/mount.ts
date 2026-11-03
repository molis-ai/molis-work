import type { CodingHost } from "./host.js";
import { mountBoard } from "./mount-board.js";
import { mountComposerParts } from "./mount-composer.js";
import { createPage, mountFoundations } from "./mount-core.js";
import { mountControlEvents, mountSessionEvents } from "./mount-events.js";
import { mountForms } from "./mount-forms.js";
import { mountComposer, mountPolling } from "./mount-submit.js";
import { mountWork } from "./mount-work.js";

/**
 * Mounts Coding's page on the root the workbench made: the markup is found, the page's memory made, then its parts built in the
 * order they lean on each other (the draft first, as the others save through it) and its events, forms and reading started last.
 */
export function mountCoding(host: CodingHost): void {
  const page = createPage(host);
  if (!page) return;
  mountFoundations(page);
  mountComposerParts(page);
  mountBoard(page);
  mountWork(page);
  mountSessionEvents(page);
  mountControlEvents(page);
  mountForms(page);
  mountComposer(page);
  mountPolling(page);
}
