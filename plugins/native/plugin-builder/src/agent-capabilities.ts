/**
 * The plugin platform's own capabilities (the `plugin-platform` provider in the project's action catalog; everything
 * else a generated plugin calls is another provider's action). The host implements each one; the plugin only sees
 * `sdk.capability.call(id, input)` and only for ids the person approved at installation.
 *
 * Every capability has a fixed stand-in: tests, contract examples, sandbox checks and interface acceptance use it,
 * so they are repeatable and cost nothing. The person's own trial in the studio and the installed plugin use the
 * real capability.
 */
import type { ActionExecutionPolicy } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SandboxJson, SandboxSchema } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';

export interface StudioCapability {
  id: string;
  /** Short name shown with the plugin. */
  title: string;
  /** What the person approves at installation, in their words. */
  consent: string;
  /** For the designer and the code agent: what it does, its limits and its stand-in. */
  description: string;
  input: SandboxSchema;
  output: SandboxSchema;
  /** Deterministic answer used wherever the real capability must not run. */
  standIn(input: SandboxJson): SandboxJson;
  /** Provider-owned limits, also published in the unified action directory. */
  execution: ActionExecutionPolicy;
}

export const MODEL_STAND_IN_PREFIX = '［模型替身］';
const field = (value: SandboxJson, key: string) => value && typeof value === 'object' && !Array.isArray(value) ? value[key] : undefined;

export const STUDIO_CAPABILITIES: readonly StudioCapability[] = [
  {
    id: 'model.generate',
    title: '调用模型',
    consent: '用你配置的文字模型生成内容（费用计入你的模型服务）',
    description: '让用户配置的文字模型按一段已声明的要求（prompt）处理 input，返回 {"text": 模型的回答}。适合总结、出题、改写、提问引导。'
      + '一次调用通常几秒到几十秒；只有文字，没有工具、不能联网、看不到插件存储以外的数据。'
      + '给模型的要求先在调用它的操作文件里声明：export const prompts = [{ id: "summary", title: "要点提炼", purpose: "把笔记提炼成三条要点", body: "只输出三条中文要点……" }]（全部是字面量，id 在插件内唯一），'
      + '调用时写 sdk.capability.call("model.generate", { prompt: "summary", input })，prompt 是字面量 id；用户能在设置里看到并修改这些要求，所以不要在代码里拼接要求文字，也不要传 instructions。'
      + 'body 要写清楚模型只输出什么、什么格式、多长，例如「只输出一个启发式问题，不超过 50 字，不要编号、不要解释、不要给答案」；不写清楚时模型常会给出多条、带编号和说明的长文。'
      + '需要结构化结果时在 body 里写清格式，并在代码里容错解析（解析失败时保留原文）。每次调用的变化部分都放进 input。'
      + '检查、示例和界面验收里由固定替身代答：text = "' + MODEL_STAND_IN_PREFIX + '" + input 的前 40 个字；用户试用和安装后才是真实模型。',
    input: { type: 'object', additionalProperties: false, required: ['prompt', 'input'], properties: {
      prompt: { type: 'string', minLength: 1, maxLength: 40, description: '已声明的要求的 id（小写字母、数字、连字符）' },
      input: { type: 'string', maxLength: 40000, description: '要处理的内容' } } },
    output: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } },
    standIn: input => ({ text: MODEL_STAND_IN_PREFIX + String(field(input, 'input') ?? '').slice(0, 40) }),
    execution: { timeout_ms: 120_000, cost: 'metered', max_calls_per_minute: 20 },
  },
];

export const studioCapability = (id: string) => STUDIO_CAPABILITIES.find(item => item.id === id);
