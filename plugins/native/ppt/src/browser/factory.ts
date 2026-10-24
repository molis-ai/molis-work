import { messageOf } from "./dom.js";
import { installCommands } from "./commands.js";
import { installEditor } from "./editor.js";
import { installEvents } from "./events.js";
import { installList } from "./list.js";
import { installOutline } from "./outline.js";
import { createPage } from "./page.js";
import { installPresent } from "./present.js";
import { installSlides } from "./slides.js";
import { installStatus } from "./status.js";
import type { PptHost } from "./types.js";

/** The workbench calls this bundle as `(host) => …`: the build wraps the entry in that function. */
declare const host: PptHost;

/** PPT's page: slides, theme colors, preview, presenting, PowerPoint/PDF export. The decks themselves belong to the local host. */
function mountPpt(): void {
  const bench = document.querySelector<HTMLElement>("[data-ppt=workbench]");
  if (!bench) return;
  const page = createPage(host, bench);
  installStatus(page);
  installSlides(page);
  installList(page);
  installEditor(page);
  installOutline(page);
  installPresent(page);
  installCommands(page);
  installEvents(page);
  void page.loadList().catch((error: unknown) => { page.showNote(messageOf(error), true); page.listFailed(error); });
}

mountPpt();
