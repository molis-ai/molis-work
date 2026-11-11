import { CODING_PLUGIN_ID, CODING_UI_CONTRIBUTION_ID } from "@molis-ai/molis-work-plugin-coding";
import { ensureProjectPlugins, projectPluginProblem, runWithLocale, type ProjectPluginSurfacePorts } from "@molis-ai/molis-work-app-local-host";

/**
 * The Coding page as the project's running instance draws it, from the library as the Host opens it: the plugin's
 * own view reading its own store. A plugin that did not start, or whose page is not registered, answers with a note that says so
 * (`role="alert"`), as the stage's unavailable shell does.
 */
/**
 * The note above, as against the page: the page itself has `role="alert"` lines of its own (its dialogs' empty error lines), so
 * "Coding did not open" is this note, and "Coding opened" is the page's layout being there.
 */
export const CODING_UNAVAILABLE = /<section class="mw-empty" role="alert">/;
export const CODING_OPENED = /class="coding-layout"/;

export async function codingView(ports: ProjectPluginSurfacePorts): Promise<string> {
  const record = await ensureProjectPlugins(ports);
  const problem = projectPluginProblem(record, ports.store, CODING_PLUGIN_ID);
  const alert = (message: string) => `<section class="mw-empty" role="alert"><p>${ports.escapeHtml(message)}</p></section>`;
  if (problem || !record.platform) return alert(problem?.reason ?? record.error ?? "Coding 插件未能启动");
  const contribution = record.platform.supervisor.contribution(CODING_PLUGIN_ID);
  const view = contribution?.kind === "app" ? contribution.views?.find(entry => entry.descriptor.contribution_id === CODING_UI_CONTRIBUTION_ID) : undefined;
  if (!view) return alert("Coding 页面未注册");
  return runWithLocale("zh", () => view.render({ contribution_id: CODING_UI_CONTRIBUTION_ID, surface: "workbench", model: { route_prefix: "", primitives: { escape: ports.escapeHtml } } }));
}
