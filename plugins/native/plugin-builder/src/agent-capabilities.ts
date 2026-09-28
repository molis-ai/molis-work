/**
 * Platform capabilities a generated plugin may declare. The host implements each one; the plugin only sees
 * `sdk.capability.call(id, input)` and only for ids the person approved at installation.
 *
 * Every capability has a fixed stand-in: tests, contract examples, sandbox checks and interface acceptance use it,
 * so they are repeatable and cost nothing. The person's own trial in the studio and the installed plugin use the
 * real capability.
 */
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
  /** Longest a single call may take; the host raises the plugin's operation limits to fit it. */
  timeoutMs: number;
  /** Changes something outside the plugin: the studio trial gets the stand-in, only the installed plugin writes. */
  writes?: boolean;
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
    // `instructions` is what plugins generated before prompts were declared still send; new builds fail the checks with it.
    input: { type: 'object', additionalProperties: false, required: ['input'], properties: {
      prompt: { type: 'string', minLength: 1, maxLength: 40, description: '已声明的要求的 id（小写字母、数字、连字符）' },
      instructions: { type: 'string', minLength: 1, maxLength: 8000, description: '（旧插件）直接写在代码里的要求' },
      input: { type: 'string', maxLength: 40000, description: '要处理的内容' } } },
    output: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } },
    standIn: input => ({ text: MODEL_STAND_IN_PREFIX + String(field(input, 'input') ?? '').slice(0, 40) }),
    timeoutMs: 120_000,
  },
  {
    id: 'goals.list',
    title: '读取项目目标',
    consent: '读取这个项目的目标（标题和状态）',
    description: '列出这个项目里未归档的目标：[{"id","title","status"}]，最多 100 个，只读。status 是目标的工作状态。'
      + '检查、示例和界面验收里由固定替身代答：[{"id":"goal-demo","title":"示例目标","status":"active"}]；用户试用和安装后是真实目标。',
    input: { type: 'object', additionalProperties: false, required: [], properties: {} },
    output: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'title', 'status'], properties: {
      id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' } } } },
    standIn: () => [{ id: 'goal-demo', title: '示例目标', status: 'active' }],
    timeoutMs: 10_000,
  },
  {
    id: 'goals.note',
    title: '给目标记便笺',
    consent: '在这个项目的目标里记下便笺（不改变目标状态，也不替你做决定）',
    description: '把一段文字记到指定目标的历史里：input {"goalId": 目标 id（来自 goals.list）, "text": 便笺}，返回 {"recorded": true}。便笺不会推进目标状态。'
      + '检查、示例、界面验收和创作台试用里由替身代答 {"recorded": true}，安装后才真正写入。',
    input: { type: 'object', additionalProperties: false, required: ['goalId', 'text'], properties: {
      goalId: { type: 'string', minLength: 1, maxLength: 200 }, text: { type: 'string', minLength: 1, maxLength: 4000 } } },
    output: { type: 'object', additionalProperties: false, required: ['recorded'], properties: { recorded: { type: 'boolean' } } },
    standIn: () => ({ recorded: true }),
    timeoutMs: 10_000,
    writes: true,
  },
  {
    id: 'reminders.add',
    title: '到点提醒',
    consent: '到你设定的时间在收件箱里提醒你（提醒的文字由这个插件填写）',
    description: '请平台在指定时间提醒用户：input {"at": 带时区的时间（用 new Date(...).toISOString()）, "text": 提醒文字（1–200 字）, "repeat"?: "none"|"daily"|"weekly"}，返回 {"reminderId"}。'
      + '到点后提醒出现在用户的收件箱，点开回到这个插件；到点时不运行插件代码。时间要在一年以内、不能已经过去；每个插件最多同时有 200 个提醒。要能取消就把 reminderId 存下来。'
      + '检查、示例、界面验收和创作台试用里由替身代答 {"reminderId": "reminder-demo"}，安装后才真正设置。',
    input: { type: 'object', additionalProperties: false, required: ['at', 'text'], properties: {
      at: { type: 'string', format: 'date-time', description: '提醒时间' }, text: { type: 'string', minLength: 1, maxLength: 200, description: '提醒文字' },
      repeat: { type: 'string', enum: ['none', 'daily', 'weekly'] } } },
    output: { type: 'object', additionalProperties: false, required: ['reminderId'], properties: { reminderId: { type: 'string' } } },
    standIn: () => ({ reminderId: 'reminder-demo' }),
    timeoutMs: 10_000,
    writes: true,
  },
  {
    id: 'reminders.cancel',
    title: '取消提醒',
    consent: '取消它自己设过的提醒',
    description: '取消这个插件之前设的一个提醒：input {"reminderId"}，返回 {"cancelled": boolean}；不是它设的、或者只提醒一次且已经提醒过的返回 false。替身代答 {"cancelled": true}。',
    input: { type: 'object', additionalProperties: false, required: ['reminderId'], properties: { reminderId: { type: 'string', minLength: 1, maxLength: 100 } } },
    output: { type: 'object', additionalProperties: false, required: ['cancelled'], properties: { cancelled: { type: 'boolean' } } },
    standIn: () => ({ cancelled: true }),
    timeoutMs: 10_000,
    writes: true,
  },
  {
    id: 'schedules.add',
    title: '定时执行',
    consent: '按设定的时间自动运行它自己的一项功能（结果可以放进收件箱）',
    description: '请平台按时间自动运行这个插件自己的一项功能：input {"operation": 这个插件自己的一项功能 id, "at": 第一次运行的带时区时间（new Date(...).toISOString()）, "repeat"?: "none"|"daily"|"weekly", "input"?: 给那项功能的输入（对象）, "inbox"?: true 时把结果放进收件箱}，返回 {"scheduleId"}。'
      + '到点时平台在隔离环境里运行那项功能，权限和用户点按钮时一样；inbox 为 true 时，结果里的 text（没有就用 summary）作为一条收件箱事项，点开回到这个插件。项目当时没打开的，打开后补跑。时间要在一年以内；每个插件最多同时有 20 个定时。要能取消就把 scheduleId 存下来。'
      + '检查、示例、界面验收和创作台试用里由替身代答 {"scheduleId": "schedule-demo"}，安装后才真正设置。',
    input: { type: 'object', additionalProperties: false, required: ['operation', 'at'], properties: {
      operation: { type: 'string', minLength: 1, maxLength: 120, description: '这个插件自己的功能 id' }, at: { type: 'string', format: 'date-time', description: '第一次运行的时间' },
      repeat: { type: 'string', enum: ['none', 'daily', 'weekly'] }, input: { type: 'object', description: '给那项功能的输入' }, inbox: { type: 'boolean', description: '把结果放进收件箱' } } },
    output: { type: 'object', additionalProperties: false, required: ['scheduleId'], properties: { scheduleId: { type: 'string' } } },
    standIn: () => ({ scheduleId: 'schedule-demo' }),
    timeoutMs: 10_000,
    writes: true,
  },
  {
    id: 'schedules.cancel',
    title: '取消定时',
    consent: '取消它自己设过的定时执行',
    description: '取消这个插件之前设的一个定时执行：input {"scheduleId"}，返回 {"cancelled": boolean}；不是它设的、或者只运行一次且已经运行过的返回 false。替身代答 {"cancelled": true}。',
    input: { type: 'object', additionalProperties: false, required: ['scheduleId'], properties: { scheduleId: { type: 'string', minLength: 1, maxLength: 100 } } },
    output: { type: 'object', additionalProperties: false, required: ['cancelled'], properties: { cancelled: { type: 'boolean' } } },
    standIn: () => ({ cancelled: true }),
    timeoutMs: 10_000,
    writes: true,
  },
];

export const studioCapability = (id: string) => STUDIO_CAPABILITIES.find(item => item.id === id);
/** What the designer sees: ids, descriptions and schemas, no host behavior. */
export const studioCapabilityCatalog = () => STUDIO_CAPABILITIES.map(({ id, title, description, input, output }) => ({ id, title, description, input, output }));
