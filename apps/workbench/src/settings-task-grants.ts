import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { readFileSync } from "node:fs";

/**
 * 授权与放行 in a project's settings (specs/proactive-assistant/task-grants-platform-area.md §5): what each background task of the
 * project may read, by task, with taking a category or all of it back. Reading and changing go through
 * `/projects/<id>/api/settings/task-grants`, which calls `agent.task_grants.*` and the providers' own search sources as the person.
 */
export function renderTaskGrantsSettings({ projectId }: { readText(text: string): string; projectId: string }): string {
  return `<section class="settings-document task-grants-settings" aria-labelledby="task-grants-title" data-task-grants-settings data-project="${projectId}">
    <header class="settings-page-heading"><h1 id="task-grants-title">${uiText("workbench.settings-task-grants.access-approvals")}</h1>
      <p>${uiText("workbench.settings-task-grants.what-each-background-task-project-may-read-its")}</p></header>
    <section class="settings-section" aria-labelledby="task-grants-tasks-title">
      <h2 id="task-grants-tasks-title">${uiText("workbench.settings-task-grants.what-background-tasks-may-read")}</h2>
      <div class="task-grants-page" data-task-grants-list aria-live="polite"><p class="task-grants-page__state">${uiText("workbench.settings-task-grants.loading")}</p></div>
    </section>
  </section>`;
}

/**
 * The page's program: TypeScript in src/browser/task-grants-page.ts (tsconfig.browser.json), which draws the rows with the reads area's
 * own row model and request forming, bundled by esbuild into dist/task-grants-page-client.js when the package builds. The Workbench
 * program and the project settings page carry it, as they carry the 插件 page's, so a page the settings cover places later is bound too.
 * The path goes through the package root, so this reads the same bundle from dist/ and from src/ (tests load the source with tsx).
 */
export const TASK_GRANTS_SETTINGS_CLIENT_SCRIPT = readFileSync(new URL("../dist/task-grants-page-client.js", import.meta.url), "utf8");
