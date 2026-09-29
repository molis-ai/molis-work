import { PLUGIN_COMPONENTS, PLUGIN_PRESENTATION_GUIDE, type PluginComponentIntent } from '@molis-ai/molis-work-design-system';
import type { AgentProposal, AgentDesign } from './agent-model.js';
import type { SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { parseModelJson } from './validation.js';

interface ExperiencePage { id: string; title: string; parts: Array<{ id: string; intent: PluginComponentIntent; purpose: string; uses?: string | string[] }> }

/** The product sketch, without expanded bindings or invented preview data. */
export function proposalSketch(proposal: AgentProposal) {
  const { contract, parts } = proposal.preview;
  return { id: proposal.id, title: proposal.title, description: proposal.description, rationale: proposal.rationale, journey: proposal.journey,
    operations: contract.operations.map(({ id, kind, description, input, output, effects }) => ({ id, kind, description, input, output, ...(effects.capabilities?.length ? { effects: { capabilities: effects.capabilities } } : {}) })),
    pages: contract.pages.map(page => ({ id: page.id, title: page.title, parts: parts.filter(part => part.pageId === page.id).map(part => ({ id: part.id, intent: part.intent, purpose: part.purpose, uses: part.read?.operationId ?? part.submit?.operationId })) })) };
}

export function experienceTask(brief: string, proposal: AgentProposal) {
  return { mode: 'experience', brief, proposal: proposalSketch(proposal),
    components: PLUGIN_COMPONENTS.filter(component => component.use === 'part'), controls: PLUGIN_PRESENTATION_GUIDE.controls,
    output: '返回 {summary,journey,pages,scenarios}。summary 说明主任务、主内容/动作和取舍；journey 是用户路径的文字数组；pages 是 [{id,title,parts:[{id,intent,purpose,uses?}]}]，uses 是已有操作 id 或 id 数组，一块草图可表达列表及行内动作，完整设计再拆成运行时绑定。可增减或重组草图部件，不能增删操作或扩权。scenarios 是 [{task,content,expected}]：task 是需验证的任务，content 是具体逼真的合成内容（JSON 值，可用文字、记录对象或数组，空数据可用 []），expected 是可观察的结果。阅读提供有段落和结尾的完整正文，比较提供有差异的数值，操作提供连续操作的场景；遵守给定字段约束。只写当前任务需要的场景，不穷举。尚未生成绑定、验收脚本或布局 JSON。' };
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const required = (value: unknown, name: string, max = 2000): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(name + ' 需要非空文字（最多 ' + max + ' 字）');
  return value;
};

/** Kept with a design as context, not a second binding or acceptance contract. */
export function validateExperience(value: unknown): NonNullable<AgentDesign['experience']> {
  if (!object(value) || Object.keys(value).some(key => !['summary', 'scenarios'].includes(key))) throw new Error('体验上下文只包含 summary 和 scenarios');
  const summary = required(value.summary, 'summary');
  if (!Array.isArray(value.scenarios) || !value.scenarios.length) throw new Error('scenarios 需要代表性使用场景');
  if (JSON.stringify(value).length > 24_000) throw new Error('体验上下文超过 24000 字，请合并重复场景、保留代表性内容');
  const scenarios = value.scenarios.map((scenario, index) => {
    if (!object(scenario) || Object.keys(scenario).some(key => !['task', 'content', 'expected'].includes(key))) throw new Error('场景 ' + index + ' 只包含 task、content、expected');
    const encoded = JSON.stringify(scenario.content);
    if (encoded === undefined || encoded.length > 6000) throw new Error('content 需要具体的 JSON 示例数据（最多 6000 字）');
    return { task: required(scenario.task, 'task', 500), content: scenario.content as SandboxJson, expected: required(scenario.expected, 'expected', 1000) };
  });
  return { summary, scenarios };
}

/** The UI owns the sketch at this point; business operations and capability choices remain untouched. */
export function acceptExperience(output: string, proposal: AgentProposal) {
  const value = parseModelJson(output);
  if (!object(value) || Object.keys(value).some(key => !['summary', 'journey', 'pages', 'scenarios'].includes(key))) throw new Error('体验设计只返回 summary、journey、pages、scenarios');
  const experience = validateExperience({ summary: value.summary, scenarios: value.scenarios });
  if (!Array.isArray(value.journey) || !value.journey.length || value.journey.length > 20) throw new Error('journey 需要完整用户路径');
  value.journey.forEach(step => required(step, 'journey', 1000));
  if (!Array.isArray(value.pages) || !value.pages.length || value.pages.length > 12) throw new Error('pages 需要页面草图');
  const ids = new Set<string>(), pageIds = new Set<string>(), used = new Set<string>();
  const operations = proposal.preview.contract.operations, intents = new Set(PLUGIN_COMPONENTS.flatMap(component => component.intents));
  for (const page of value.pages) {
    if (!object(page) || Object.keys(page).some(key => !['id', 'title', 'parts'].includes(key)) || !Array.isArray(page.parts) || !page.parts.length || page.parts.length > 50) throw new Error('页面只包含 id、title 和非空 parts');
    const id = required(page.id, 'page.id', 100); required(page.title, 'page.title', 120);
    if (pageIds.has(id)) throw new Error('页面 id 重复：' + id); pageIds.add(id);
    for (const part of page.parts) {
      if (!object(part) || Object.keys(part).some(key => !['id', 'intent', 'purpose', 'uses'].includes(key))) throw new Error('草图部件只包含 id、intent、purpose、uses');
      const partId = required(part.id, 'part.id', 100); required(part.purpose, 'purpose', 1000);
      if (ids.has(partId)) throw new Error('部件 id 重复：' + partId); ids.add(partId);
      if (!intents.has(part.intent as PluginComponentIntent)) throw new Error('intent 不在组件目录内：' + String(part.intent));
      const references = part.uses == null || part.uses === '' ? [] : Array.isArray(part.uses) ? part.uses : [part.uses];
      for (const reference of references) {
        if (typeof reference !== 'string' || !operations.some(operation => operation.id === reference)) throw new Error('草图部件 ' + partId + ' 引用了不存在的操作：' + JSON.stringify(reference) + '；只能引用 ' + operations.map(operation => operation.id).join('、'));
        used.add(reference);
      }
      if (part.uses == null || part.uses === '') delete part.uses;
    }
  }
  for (const operation of operations) if (!used.has(operation.id)) throw new Error('不能丢掉已选功能：' + operation.id + ' 需要一个可到达的界面部件');
  // Keep semantic groups intact. The detailed design owns splitting them into actual parts and bindings.
  const journey = value.journey as string[];
  return { proposal: { ...proposal, journey }, sketch: { ...proposalSketch(proposal), journey, pages: value.pages as unknown as ExperiencePage[] }, experience };
}
