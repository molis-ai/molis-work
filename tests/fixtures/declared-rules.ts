import type { FunctionsHostOptions } from "@molis-ai/molis-work-app-local-host";
import type { ActionProviderRegistration, ActionSceneDefaultRule, ActionSceneDefinition, ActionSceneHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";

export const DECLARED_RULE_OPTIONS: FunctionsHostOptions = { env: {}, credential: () => null };

export const declaredRule = (function_key: string, overrides: Partial<ActionSceneDefaultRule> = {}): ActionSceneDefaultRule => ({
  function_key, name: "挑下一步", instructions: "看这条该显示哪个按钮。", subject_kinds: ["fixture_item"],
  options: [{ key: "fixture.first", description: "第一个" }, { key: "fixture.second", description: "第二个" }], ...overrides,
});

export const declaredScene = (scene_id: string, default_rule?: ActionSceneDefaultRule): ActionSceneDefinition => ({
  scene_id, version: 1, title: "示例用途", description: "示例用途的说明", trigger: "示例事件", scope: "project", subject_kinds: ["fixture_item"],
  permissions: ["fixture:read"], configuration_permissions: ["fixture:write"], input_schema: { type: "object", properties: {} }, result_schema: { type: "object", properties: {} },
  ...(default_rule ? { default_rule } : {}),
});

/** A provider for a plugin whose scenes are `scenes`; its id is the plugin's. */
export const declaredRegistration = (provider_id: string, scenes: readonly ActionSceneDefinition[]): ActionProviderRegistration => ({
  provider: { provider_id, plugin_id: provider_id, title: "已安装的插件", kind: "plugin" }, definitions: [], handlers: [], scenes,
  scene_handlers: scenes.map(({ scene_id, version }): ActionSceneHandlerBinding => ({ scene_id, version, bindings: () => [], targets: () => [],
    bind: () => undefined, consume: () => ({}) })),
});
