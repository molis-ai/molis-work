import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { projectSettingsCapabilities, projectWorkspaceActions } from "@molis-ai/molis-work-contracts/modules/projects";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { WebRequestContext } from "./web-route-table.js";

/** Only the trusted Host workspace service can reach this route. Identity and permissions come from the bound page. */
export async function changePageWorkspace(context: WebRequestContext, project: LocalHostProjectReference | undefined,
  body: Record<string, unknown>, shown?: () => Promise<readonly string[]>): Promise<unknown> {
  const page = pluginPageRequest(context.request);
  if (!page || !project || page.project_id !== project.project_id || !context.request.headers["x-molis-context-page"])
    throw new ActionError("actions.forbidden", "工作目录操作需要当前项目页面");
  if (!body || Object.keys(body).some(key => !["operation", "value"].includes(key)) || !["add", "select"].includes(String(body.operation))
    || typeof body.value !== "string" || !body.value.trim() || body.value.length > 4096) throw new ActionError("actions.input_invalid", "工作目录请求无效");
  const beforeEffect = async () => {
    page.assertCurrent();
    const entry = PLATFORM_PLUGIN_REGISTRATIONS.find(item => item.manifest.plugin_id === page.plugin_id);
    if (shown && entry && !(await shown()).includes(entry.project_plugin_id)) throw new ActionError("actions.plugin_disabled", "此项目未启用该插件");
    page.assertCurrent();
  };
  const control = { signal: page.signal, beforeEffect, assert_authority_current: page.assertCurrent };
  const actions = bindLocalWebActions(context.localHost, project, ["projects:settings"]);
  if (body.operation === "add") {
    const result = await actions.invoke(projectWorkspaceActions.add, { workspace_path: body.value }, control);
    return { workspace: { workspace_id: result.workspace.workspace_id } };
  }
  await actions.invoke(projectSettingsCapabilities.selectBrowsingWorkspace, [body.value], control);
  return {};
}
