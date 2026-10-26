import { errorMessage } from "../dom.js";
import { status } from "./request.js";
import type { Page } from "./page.js";

/** The project has one current directory: where new rounds run and what Files and Git show. Choosing it here sets it for the whole project (the same setting as in project settings), then the embedded Files and Git views re-read it. */
export async function useProjectWorkspace(page: Page, id: string) {
  const { L, host, lifetime, root } = page;
  try {
    await host.selectWorkspace(id);
  } catch (error) {
    throw new Error(L("coding.workspace.switch-failed-why", { reason: errorMessage(error) }));
  }
  lifetime.assertCurrent();
  root.querySelectorAll<HTMLElement>("[data-git-refresh],[data-files-refresh]").forEach(button => button.click());
}

/**
 * Opening a session, or pointing it at another directory, makes that directory the project's current one, so Files and Git always
 * show where the open session's next round runs. A directory that is no longer authorized is left alone.
 */
export async function followWorkspace(page: Page) {
  const { L } = page, { s } = page;
  const target = s.state.workspaces?.find(item => item.workspace_id === s.workspaceId && item.realpath_verified);
  if (!target || target.workspace_id === s.state.workspace?.workspace_id) return;
  try {
    await useProjectWorkspace(page, target.workspace_id);
    s.state.workspace = target;
  } catch (error) {
    status(page, L("coding.workspace.files-git-unchanged", { reason: errorMessage(error) }), true);
  }
}

/** The header names the folder; the full path stays one hover away. */
export function showWorkspace(page: Page, path: string | null | undefined, fallback: string) {
  const { L, q, root, turns } = page;
  const label = q("[data-coding-workspace-label]"), name = path ? path.split("/").filter(Boolean).at(-1) ?? "" : fallback;
  label.innerHTML = (path ? '<svg aria-hidden="true"><use href="#icon-folder"></use></svg>' : "") + "<span></span>";
  const text = label.lastChild;
  if (text) text.textContent = name;
  label.title = path || "";
  label.dataset.empty = String(!path);
  root.dataset.codingWorkspaceName = path ? name : "";
  turns.querySelectorAll("[data-coding-welcome-workspace]").forEach(node => {
    node.textContent = path ? name : L("coding.welcome.workspace");
    if (node.parentElement) node.parentElement.title = path || "";
  });
}
