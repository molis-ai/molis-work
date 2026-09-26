import { ACTION_REFERENCE_SCHEMA } from "./action-offers.js";
import type { ActionDefinition, ActionReference, ActionSceneDefinition, ActionSceneTarget } from "./actions.js";

export type SceneConfigurationInput = { binding_id: string; expected_revision: string | null; judgment: ActionReference & { provider_id: string } };
const id = { type: "string", minLength: 1 };
const pinnedReference = { ...ACTION_REFERENCE_SCHEMA, required: ["capability_id", "version", "provider_id"] };
const availability = { type: "object", properties: { available: { type: "boolean" }, code: id, reason: { type: "string" } }, required: ["available"] };
export const ACTION_SCENE_TARGETS_SCHEMA = { type: "object", properties: { targets: { type: "array", items: {
  type: "object", properties: { binding_id: id, title: { type: "string" }, href: { type: "string" }, revision: { type: ["string", "null"] },
    scene_id: id, scene_version: { type: "integer", minimum: 1 }, provider_id: id, project_id: { type: ["string", "null"] },
    binding: { type: ["object", "null"] }, availability, configuration_availability: availability },
  required: ["binding_id", "title", "revision", "scene_id", "scene_version", "provider_id", "project_id", "binding", "availability", "configuration_availability"],
} } }, required: ["targets"] } as const;

/** Canonical callable adapters, derived from the scene's own declaration; no separate capability/grant catalog. */
export function sceneConfigurationActions(scene: ActionSceneDefinition) {
  const define = <I, O>(name: string, title: string, permissions: readonly string[], input_schema: Record<string, unknown>, output_schema: Record<string, unknown>, write = false): ActionDefinition<I, O> => ({
    capability_id: `scenes.${name}:${scene.scene_id}`, version: scene.version, operation: write ? "command" : "query", action: {
      title: `${title} · ${scene.title}`, description: `${scene.description}；使用原消费场景的配置与修订号。`,
      kind: write ? "operation" : "query", scope: scene.scope, audiences: ["user", "mcp", "agent", "workflow", "plugin"],
      permissions: [...new Set(permissions)], subject_kinds: [], input_schema, output_schema,
    },
  });
  const input = { type: "object", properties: { binding_id: id, expected_revision: { type: ["string", "null"] }, judgment: pinnedReference },
    required: ["binding_id", "expected_revision", "judgment"], additionalProperties: false };
  const result = { type: "object", properties: { ok: { const: true } }, required: ["ok"], additionalProperties: false };
  return {
    targets: define<{ judgment?: ActionReference & { provider_id: string } }, { targets: readonly ActionSceneTarget[] }>("targets", "读取使用位置", scene.configuration_permissions ?? [],
      { type: "object", properties: { judgment: pinnedReference }, additionalProperties: false }, ACTION_SCENE_TARGETS_SCHEMA),
    enable: define<SceneConfigurationInput, { ok: true }>("enable", "启用判断", [...scene.configuration_permissions ?? [], ...scene.permissions], input, result, true),
    disable: define<SceneConfigurationInput, { ok: true }>("disable", "停用判断", scene.configuration_permissions ?? [], input, result, true),
  };
}
