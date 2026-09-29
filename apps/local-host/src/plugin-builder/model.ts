import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { hostTextGeneration, type HostTextOptions } from '../host-complete-text.js';
import type { TextModelSelection } from '../configured-models.js';
import type { CapabilityImplementations, PluginModelCaller } from './capabilities.js';
import { PROMPT_ID, resolvePluginPrompt, type PluginPromptSource } from './prompts.js';

/** The Studio selects a model; the shared Host binding owns execution, credentials and cancellation. */
export function createPluginModelGeneration(options: Pick<HostTextOptions, 'resolveInference'> & {
  homeDirectory: string;
  selection(): TextModelSelection | null;
  declaredPrompts(pluginId: string, caller: PluginModelCaller | undefined): Promise<PluginPromptSource>;
}): CapabilityImplementations['generate'] {
  return async (pluginId, input, signal, beforeDispatch, caller) => {
    signal.throwIfAborted();
    let instruction: string;
    if (input.prompt !== undefined) {
      if (!PROMPT_ID.test(input.prompt)) throw new Error('模型要求的 id 只能是小写字母、数字和连字符');
      const source = await options.declaredPrompts(pluginId, caller);
      await beforeDispatch?.();
      signal.throwIfAborted();
      instruction = resolvePluginPrompt(options.homeDirectory, pluginId, input.prompt, source).body;
    } else if (input.instructions) instruction = input.instructions;
    else throw new Error('调用模型时要指明用哪一段已声明的要求（prompt）');
    signal.throwIfAborted();
    const selection = options.selection();
    if (!selection) throw new ActionError('actions.connection_required', '插件要调用模型，但还没有配置可用的文字模型');
    const generate = hostTextGeneration({ ...options, selection });
    if (!generate) throw new ActionError('actions.connection_required', '所选文字模型已不可用，请重新检查模型设置');
    const result = await generate(input.input || '（没有输入内容）', { system: instruction, signal, beforeDispatch,
      timeoutMs: 110_000, maxOutputTokens: 8192 });
    return { text: result.value };
  };
}
