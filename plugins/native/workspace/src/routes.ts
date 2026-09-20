import type { PluginRouteBinding, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";

/** Selection is a browsing preference, never a new project membership or Run permission. */
export function workspaceRoutes(context: PluginStartContext): PluginRouteBinding[] {
  const services = context.services;
  const list = async () => {
    if (!services?.capabilities) throw new Error("宿主尚未提供工作目录入口");
    return services.capabilities.invoke(projectsCapabilities.listWorkspaces, []);
  };
  return [
    { route_id: "workspace.state", async handle() {
      try {
        const workspaces = await list();
        const saved = services?.storage?.get("selected-workspace");
        return { status: 200, body: {
          workspaces: workspaces.map(item => ({ workspace_id: item.workspace_id, name: item.display_name, available: item.realpath_verified })),
          selected: workspaces.some(item => item.workspace_id === saved) ? saved : workspaces.length === 1 ? workspaces[0]!.workspace_id : null,
        } };
      } catch { return { status: 503, body: { error: "无法读取工作目录，请重试" } }; }
    } },
    { route_id: "workspace.select", async handle(request) {
      try {
        const id = (request.body as { workspace_id?: unknown })?.workspace_id;
        const workspace = (await list()).find(item => item.workspace_id === id && item.realpath_verified);
        if (!workspace || !services?.outputs || !services.storage) return { status: 403, body: { error: "请选择当前项目已授权且可用的工作目录" } };
        services.outputs.publish({ port: "workspace", content: { kind: "inline", payload: {
          workspace_id: workspace.workspace_id, name: workspace.display_name, handle: workspace.workspace_id,
        } } });
        services.storage.set("selected-workspace", workspace.workspace_id);
        return { status: 200, body: { workspace_id: workspace.workspace_id } };
      } catch { return { status: 400, body: { error: "无法选择工作目录，请重试" } }; }
    } },
  ];
}
