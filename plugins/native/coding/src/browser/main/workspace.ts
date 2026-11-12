import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { errorMessage } from "../dom.js";
import { status } from "./request.js";
import type { Page } from "./page.js";

/**
 * The embedded Files and Git show the folder the page's new rounds run in. Which folder they show is this page's own state: the
 * project keeps no browsing choice, and rounds the Assistant starts run in the project's output (SSC-17).
 */
export async function useProjectWorkspace(page: Page, id: string) {
  const { host, lifetime } = page;
  try {
    await host.selectWorkspace(id);
  } catch (error) {
    throw new Error(uiText.text("coding.workspace.switch-failed-why", { reason: errorMessage(error) }));
  }
  lifetime.assertCurrent();
}

/**
 * Opening a session, or pointing it at another directory, has the embedded Files and Git show that directory, so they always show
 * where the open session's next round runs. A directory that is no longer authorized is left alone.
 */
export async function followWorkspace(page: Page) {
  const { s } = page;
  const target = s.state.workspaces?.find(item => item.workspace_id === s.workspaceId && item.realpath_verified);
  if (!target || target.workspace_id === s.state.workspace?.workspace_id) return;
  try {
    await useProjectWorkspace(page, target.workspace_id);
    s.state.workspace = target;
  } catch (error) {
    status(page, uiText.text("coding.workspace.files-git-unchanged", { reason: errorMessage(error) }), true);
  }
}

/** The header names the folder; the full path stays one hover away. */
export function showWorkspace(page: Page, path: string | null | undefined, fallback: string) {
  const { q, root, turns } = page;
  const label = q("[data-coding-workspace-label]"), name = path ? path.split("/").filter(Boolean).at(-1) ?? "" : fallback;
  label.innerHTML = (path ? '<svg aria-hidden="true"><use href="#icon-folder"></use></svg>' : "") + "<span></span>";
  const text = label.lastChild;
  if (text) text.textContent = name;
  label.title = path || "";
  label.dataset.empty = String(!path);
  root.dataset.codingWorkspaceName = path ? name : "";
  turns.querySelectorAll("[data-coding-welcome-workspace]").forEach(node => {
    node.textContent = path ? name : uiText.text("coding.welcome.workspace");
    if (node.parentElement) node.parentElement.title = path || "";
  });
}
