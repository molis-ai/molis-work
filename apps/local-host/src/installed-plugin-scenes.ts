import { randomUUID } from 'node:crypto';
import { ActionError, type ActionSceneBinding, type ActionSceneDefinition, type ActionSceneHandlerBinding } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginStartContext } from '@molis-ai/molis-work-contracts/platform/plugin';

/** Each configurable target belongs to the installation that executes the scene, in this project. */
export function installedPluginScene(scene: ActionSceneDefinition, context: PluginStartContext): ActionSceneHandlerBinding {
  const storage = context.services?.storage;
  const key = 'scene-binding:' + scene.scene_id;
  const current = () => { const raw = storage?.get(key) ?? null;
    return { raw, binding: raw === null ? null : JSON.parse(raw) as ActionSceneBinding }; };
  const conflict = () => new ActionError('actions.conflict', '这个场景的设置已经变化，请重新打开');
  return {
    scene_id: scene.scene_id, version: scene.version,
    bindings: () => {
      const { binding } = current();
      return binding ? [binding] : [];
    },
    targets: () => [{ binding_id: scene.scene_id, title: scene.title, revision: current().binding?.revision ?? null }],
    async bind(caller, binding, options) {
      if (!storage?.compareAndSet || binding.binding_id !== scene.scene_id || binding.scene_id !== scene.scene_id || binding.scene_version !== scene.version
        || binding.project_id !== context.project_id || options && options.provider_id !== context.provider_id) throw conflict();
      const { raw, binding: previous } = current();
      if (options && options.expected_revision !== (previous?.revision ?? null)) throw conflict();
      await options?.before_write?.();
      await caller.beforeEffect();
      context.requireGrant('storage:private');
      const updated: ActionSceneBinding = { binding_id: scene.scene_id, scene_id: scene.scene_id, scene_version: scene.version,
        project_id: context.project_id!, title: scene.title, function: binding.function, enabled: binding.enabled, revision: randomUUID() };
      if (!storage.compareAndSet(key, raw, JSON.stringify(updated))) throw conflict();
    },
    async consume(caller, _input, result, execution) {
      await caller.beforeEffect();
      const { binding } = current();
      if (!binding?.enabled || binding.revision !== execution.binding.revision) throw conflict();
      return result;
    },
  };
}
