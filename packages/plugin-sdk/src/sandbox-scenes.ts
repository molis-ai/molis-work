import { createHash } from 'node:crypto';
import type { ActionSceneDefinition } from '@molis-ai/molis-work-contracts/platform/actions';
import { pluginErrors } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';

export const sandboxSceneId = (buildId: string, localId: string) => 'signed.' + buildId + '.' + localId;
const short = (value: unknown, limit: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= limit;

/** One signed declaration defines both the configurable project slot and the rule offered by Functions. */
export function sandboxScenes(contract: SandboxPluginContract, buildId: string): ActionSceneDefinition[] {
  const scenes = contract.scenes ?? [];
  const invalid = () => pluginErrors.declaration_invalid('判断场景需要独立编号、使用地点、选择指引和选项，并由本包项目操作使用');
  if (!Array.isArray(scenes) || scenes.length > 16) throw invalid();
  const ids = new Set<string>();
  const result = scenes.map((scene): ActionSceneDefinition => {
    if (!scene || !short(scene.id, 40) || !/^[a-z][a-z0-9_-]*$/.test(scene.id) || ids.has(scene.id)
      || !short(scene.title, 80) || !short(scene.description, 400) || !short(scene.trigger, 200) || !short(scene.instructions, 4000)
      || !short(scene.subject_kind, 128) || !/^[a-z][a-z0-9_:-]*$/.test(scene.subject_kind)
      || !Array.isArray(scene.options) || !scene.options.length || scene.options.length > 32
      || scene.options.some(option => !option || !short(option.key, 64) || !/^[a-z][a-z0-9_.]*$/.test(option.key) || !short(option.description, 400))) throw invalid();
    const keys = scene.options.map(option => option.key);
    if (new Set(keys).size !== keys.length) throw invalid();
    ids.add(scene.id);
    const sceneId = sandboxSceneId(buildId, scene.id);
    return { scene_id: sceneId, version: /* @version scene.sandbox.behavior-recommendation */ 1, title: scene.title, description: scene.description, trigger: scene.trigger, scope: 'project',
      subject_kinds: [scene.subject_kind], permissions: ['scenes:use'], configuration_permissions: ['storage:private'],
      input_schema: { type: 'object', properties: { content: { type: 'string', minLength: 1, maxLength: 8000 } }, required: ['content'], additionalProperties: false },
      result_type: /* @version type.molis.behavior-recommendation "molis.behavior-recommendation.v{version}" */ "molis.behavior-recommendation.v1",
      result_schema: { type: 'object', properties: { status: { enum: ['ok', 'needs_review'] }, suggested_behavior_ids: { type: 'array', items: { enum: keys } } }, required: ['status', 'suggested_behavior_ids'] },
      recommendation_labels: Object.fromEntries(scene.options.map(option => [option.key, option.description])),
      default_rule: { function_key: 'scene_' + createHash('sha256').update(sceneId).digest('hex').slice(0, 40), name: scene.title,
        instructions: scene.instructions, subject_kinds: [scene.subject_kind], options: scene.options } };
  });
  const used = new Set(contract.operations.flatMap(op => op.effects.scenes ?? []));
  if ([...used].some(id => !ids.has(id)) || [...ids].some(id => !used.has(id))) throw invalid();
  return result;
}
