import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { projectDirectoryActions } from "@molis-ai/molis-work-contracts/modules/projects";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { WebRequestContext } from "./web-route-table.js";

/**
 * A plugin page adds a folder the person picked as an input of its project, or makes one of its folders the output (the 「设为输出」 beside
 * an input-only refusal), through the trusted Host workspace service only, after the person confirmed it in the shell's own dialog;
 * identity and permissions come from the bound page. Which folder the page shows is the page's own state (specs/shared-sources-and-surfaces
 * §4): there is no setting to select it here any more.
 */
export async function changePageWorkspace(context: WebRequestContext, project: LocalHostProjectReference | undefined,
  body: Record<string, unknown>, shown?: () => Promise<readonly string[]>): Promise<unknown> {
  const page = pluginPageRequest(context.request);
  if (!page || !project || page.project_id !== project.project_id || !context.request.headers["x-molis-context-page"])
    throw new ActionError("actions.forbidden", "工作目录操作需要当前项目页面");
  if (!body || Object.keys(body).some(key => !["operation", "value"].includes(key)) || (body.operation !== "add" && body.operation !== "set_output")
    || typeof body.value !== "string" || !body.value.trim() || body.value.length > 4096) throw new ActionError("actions.input_invalid", "工作目录请求无效");
  const beforeEffect = async () => {
    page.assertCurrent();
    const entry = PLATFORM_PLUGIN_REGISTRATIONS.find(item => item.manifest.plugin_id === page.plugin_id);
    if (shown && entry && !(await shown()).includes(entry.project_plugin_id)) throw new ActionError("actions.plugin_disabled", "此项目未启用该插件");
    page.assertCurrent();
  };
  const control = { signal: page.signal, beforeEffect, assert_authority_current: page.assertCurrent };
  const actions = bindLocalWebActions(context.localHost, project, ["projects:settings"]);
  // The person adds it from what they see now: the revision is read in the same request, so a change in between is a conflict, not lost.
  const current = await actions.invoke(projectDirectoryActions.get, {}, control);
  if (body.operation === "set_output") {
    // A folder that is not the project's is refused by `set_output` itself, under its own code.
    const workspaceId = body.value;
    await actions.invoke(projectDirectoryActions.setOutput, { workspace_id: workspaceId, expected_revision: current.revision }, control);
    return { workspace: { workspace_id: workspaceId } };
  }
  const path = body.value.trim();
  const after = await actions.invoke(projectDirectoryActions.addInput, { workspace_path: path, expected_revision: current.revision }, control);
  const added = after.directories.find(item => !current.directories.some(before => before.workspace_id === item.workspace_id))
    ?? after.directories.find(item => item.canonical_path === path);
  return { workspace: { workspace_id: added?.workspace_id ?? null } };
}
