import { installChat } from "./chat.js";
import { installCommands } from "./commands.js";
import { installEditor } from "./editor.js";
import { installList } from "./list.js";
import { installLoad } from "./load.js";
import { installMaterial } from "./material.js";
import { createPage } from "./page.js";
import { messageOf } from "./dom.js";
import type { LingguangHost } from "./types.js";

/** The workbench calls this bundle as `(host) => …`: the build wraps the entry in that function. */
declare const host: LingguangHost;

/** 灵光's page: capture, list, edit, discard and the contextual brainstorm. The sparks themselves belong to the local host. */
function mountLingguang(): void {
  const workbench = document.querySelector<HTMLElement>("[data-lingguang=workbench]");
  if (!workbench) return;
  const life = host.mountPluginClient(workbench);
  if (!life) return;
  const page = createPage(host, life, workbench);
  installEditor(page);
  installList(page);
  installLoad(page);
  installMaterial(page);
  installChat(page);
  installCommands(page);
  life.whenVisible(() => () => { if (life.alive && !document.hidden) void page.leaveBlank().catch(() => {}); });
  void page.loadList().catch((error: unknown) => { page.listFailed(error); throw error; }).then(page.openWanted).catch((error: unknown) => page.showNote(messageOf(error), true));
}

mountLingguang();
