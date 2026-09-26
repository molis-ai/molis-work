import { ActionError, type ActionDefinition, type ActionView, type BoundActionClient, type WorkflowContentBinding,
  type WorkflowContentRole, type WorkflowItemRef, type WorkflowPayload, type WorkflowStartItem } from "@molis-ai/molis-work-contracts/platform/actions";
import type { WorkflowsRoutePorts, WorkflowStationInfo } from "./route-handlers.js";

const required: readonly WorkflowContentRole[] = ["list", "read", "receive"];
const key = (view: ActionView) => `${view.provider.provider_id}\0${view.action.workflow_content!.id}`;
const definition = (view: ActionView): ActionDefinition => ({ ...view, provider_id: view.provider.provider_id });

/** The consumer understands the content protocol, never a provider's plugin ID or implementation. */
export function createWorkflowContentPorts(actions: BoundActionClient): Pick<WorkflowsRoutePorts,
  "stations" | "resolveStation" | "listStartItems" | "createBlank" | "read" | "receive"> {
  const directory = async () => (await actions.discover()).filter(view => view.action.workflow_content?.protocol === 1);
  const group = (views: readonly ActionView[]) => {
    const groups = new Map<string, ActionView[]>();
    for (const view of views) groups.set(key(view), [...(groups.get(key(view)) ?? []), view]);
    return [...groups.values()];
  };
  const bindingFor = (views: readonly ActionView[]): WorkflowContentBinding => {
    const roles: Partial<Record<WorkflowContentRole, ActionView>> = {};
    for (const view of views) {
      const role = view.action.workflow_content!.role;
      // More than one version/implementation needs an explicit migration, never an implicit latest selection.
      if (roles[role]) throw new ActionError("workflows.ambiguous", "同一站点有多份能力版本，需要明确选择后再使用");
      roles[role] = view;
    }
    for (const role of required) if (!roles[role]) throw new ActionError("workflows.unavailable", `这个站点缺少已授权的 ${role} 能力`);
    return { provider_id: views[0]!.provider.provider_id,
      actions: Object.fromEntries(Object.entries(roles).map(([role, view]) => [role, { capability_id: view.capability_id, version: view.version }])) };
  };
  const resolve = async (plugin: string, saved?: WorkflowContentBinding): Promise<WorkflowContentBinding> => {
    const views = await directory();
    if (saved) {
      for (const role of required) if (!saved.actions[role]) throw new ActionError("workflows.unavailable", `保存的站点缺少 ${role} 能力引用`);
      for (const [role, ref] of Object.entries(saved.actions)) {
        const view = views.find(view => view.provider.provider_id === saved.provider_id && view.capability_id === ref.capability_id
          && view.version === ref.version && view.action.workflow_content!.id === plugin && view.action.workflow_content!.role === role);
        if (!view) throw new ActionError("workflows.unavailable", `已保存的${{ list: "内容列表", read: "读取", receive: "接收", create: "空白创建" }[role]}能力 v${ref.version} 不可用；原引用已保留，请检查插件或重新配置该站点`);
        // Optional blank creation does not disable existing content handoffs.
        if (role !== "create" && !view.availability.available) throw new ActionError("workflows.unavailable", view.availability.reason);
      }
      return saved;
    }
    const matches = group(views).filter(group => group[0]!.action.workflow_content!.id === plugin);
    if (!matches.length) throw new ActionError("workflows.unavailable", `${plugin} 的内容能力未注册或未获授权`);
    if (matches.length !== 1) throw new ActionError("workflows.ambiguous", `${plugin} 有多个提供方，不能自动替换`);
    const binding = bindingFor(matches[0]!);
    return resolve(plugin, binding);
  };
  const invoke = async <T>(plugin: string, role: WorkflowContentRole, input: unknown, binding?: WorkflowContentBinding): Promise<T> => {
    const saved = await resolve(plugin, binding);
    const ref = saved.actions[role];
    if (!ref) throw new ActionError("workflows.unavailable", "这个站点不能从空白开始");
    const view = (await directory()).find(view => view.provider.provider_id === saved.provider_id
      && view.capability_id === ref.capability_id && view.version === ref.version);
    if (!view) throw new ActionError("workflows.unavailable", `能力 ${ref.capability_id} 已失效；原引用已保留`);
    const result = await actions.invoke(definition(view), input);
    if ((role === "create" || role === "receive") && (result as WorkflowItemRef).plugin !== plugin) {
      throw new ActionError("workflows.invalid_result", "内容能力返回了另一个站点的引用");
    }
    return result as T;
  };
  return {
    stations: async () => {
      const views = await directory();
      const groups = group(views);
      return groups.map(entries => {
        const station = entries[0]!.action.workflow_content!;
        const info: WorkflowStationInfo = { plugin: station.id, label: station.title, icon: station.icon, supported: true,
          can_start_blank: entries.some(view => view.action.workflow_content!.role === "create" && view.availability.available) };
        try {
          if (groups.filter(other => other[0]!.action.workflow_content!.id === station.id).length > 1) throw new Error("存在多个同名站点，无法自动选择");
          bindingFor(entries);
          const unavailable = entries.find(view => view.action.workflow_content!.role !== "create" && !view.availability.available);
          if (unavailable && !unavailable.availability.available) throw new Error(unavailable.availability.reason);
          return info;
        } catch (error) {
          return { ...info, supported: false, reason: error instanceof Error ? error.message : "站点不可用" };
        }
      });
    },
    resolveStation: async station => ({ ...station, content: await resolve(station.plugin, station.content) }),
    listStartItems: plugin => invoke<readonly WorkflowStartItem[]>(plugin, "list", {}),
    createBlank: (plugin, title, content) => invoke<WorkflowItemRef>(plugin, "create", { title }, content),
    read: (item, content) => invoke<WorkflowPayload>(item.plugin, "read", { item_id: item.item_id }, content),
    receive: (plugin, payload, context, content) => invoke<WorkflowItemRef>(plugin, "receive", { payload, context }, content),
  };
}
