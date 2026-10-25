import { bindBlank } from "./blank.js";
import { bindContext } from "./context.js";
import { bindDocument } from "./document.js";
import { bindEvents } from "./events.js";
import { bindImport } from "./import.js";
import { bindLanding } from "./landing.js";
import { createPage } from "./page.js";
import type { PagesHost } from "./types.js";

/**
 * The Pages workbench client: library, autosave, ProseMirror host. In the side view it mounts the comments panel; in the stage it
 * binds the page the server drew. Listeners are bound in the order the page's parts depend on each other: the context and the
 * landing before the blank-document watch, the document and the import dialog before the events that use them.
 */
export function pagesClient(host: PagesHost) {
  const Editor = window.MolisWorkPagesEditor;
  if (host.side) {
    Editor.mountComments({ messages: host.messages, translate: host.translate, projectId: host.projectId, route: (path) => host.route(path), pluginRoute: (path) => host.pluginRoute(path) });
    return;
  }
  const page = createPage(host, Editor);
  if (!page) return;
  bindContext(page);
  bindLanding(page);
  bindBlank(page);
  bindDocument(page);
  bindImport(page);
  bindEvents(page);
}
