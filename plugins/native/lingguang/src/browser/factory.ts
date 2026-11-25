import { installChat } from "./chat.js";
import { installCommands } from "./commands.js";
import { installEditor } from "./editor.js";
import { installList } from "./list.js";
import { installLoad } from "./load.js";
import { installMaterial } from "./material.js";
import { createPage } from "./page.js";
import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { LingguangHost, SaveState } from "./types.js";

/** The workbench calls this bundle as `(host) => …`: the build wraps the entry in that function. */
declare const host: LingguangHost;

/** 灵光's page: capture, list, edit, discard and the contextual brainstorm. The sparks themselves belong to the local host. */
function mountLingguang(): void {
  const workbench = document.querySelector<HTMLElement>("[data-lingguang=workbench]");
  if (!workbench) return;
  const life = host.mountPluginClient(workbench);
  if (!life) return;
  const page = createPage(host, life, workbench);
  if (typeof host.surfaceFor === "function" && !host.surfaceFor("goal")) {
    const goalButton = workbench.querySelector<HTMLElement>("[data-lingguang-to-goal]");
    if (goalButton) goalButton.hidden = true;
  }
  installEditor(page);
  installList(page);
  installLoad(page);
  installMaterial(page);
  installChat(page);
  installCommands(page);
  document.addEventListener("molis-work:language-changed", () => {
    page.renderList();
    page.syncSelectionBar();
    const state = page.el.saveStatus.dataset.mwState as SaveState | undefined;
    if (page.s.selected && state) page.showSave(state);
  }, { signal: life.signal });
  life.whenVisible(() => () => { if (life.alive && !document.hidden) void page.leaveBlank().catch(() => {}); });
  void page.loadList().catch((error: unknown) => { page.listFailed(error); throw error; }).then(page.openWanted).catch((error: unknown) => page.showNote(messageOf(error), true));
}

mountLingguang();
