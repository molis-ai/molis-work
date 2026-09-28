import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { hostTextGeneration, type HostTextOptions } from '../host-complete-text.js';
import type { TextModelSelection } from '../configured-models.js';
import type { CapabilityImplementations } from './capabilities.js';

/** The Studio selects a model; the shared Host binding owns execution, credentials and cancellation. */
export function createPluginModelGeneration(options: Pick<HostTextOptions, 'resolveInference'> & {
  homeDirectory: string;
  selection(): TextModelSelection | null;
}): CapabilityImplementations['generate'] {
  return async (_pluginId, input, signal, beforeDispatch) => {
    signal.throwIfAborted();
    const selection = options.selection();
    if (!selection) throw new ActionError('actions.connection_required', '插件要调用模型，但还没有配置可用的文字模型');
    const generate = hostTextGeneration({ ...options, selection });
    if (!generate) throw new ActionError('actions.connection_required', '所选文字模型已不可用，请重新检查模型设置');
    const result = await generate(input.input || '（没有输入内容）', { system: input.instructions, signal, beforeDispatch,
      timeoutMs: 110_000, maxOutputTokens: 8192 });
    return { text: result.value };
  };
}
