import { pluginSchemaAt, validatePluginComponentPlans } from '@molis-ai/molis-work-design-system';
import type { AgentDesign } from './agent-model.js';
import type { SandboxEffects, SandboxSchema } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function parseBuilderJson(text: string): unknown { const clean = text.trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, ''); return JSON.parse(clean); }
export function contractEffects(design: AgentDesign): SandboxEffects {
  const effects: SandboxEffects = {};
  for (const operation of design.contract.operations) for (const [key, values] of Object.entries(operation.effects)) {
    const field = key as keyof SandboxEffects; (effects as Record<string, string[]>)[field] = [...new Set([...(effects[field] ?? []), ...values])].sort();
  }
  return effects;
}
/** A schema error in words the designer can act on: which operation, which field, what to write. */
function explainContract(error: unknown, contract: unknown): string {
  const message = error instanceof Error ? error.message : String(error), missing = /missing (\w+)/.exec(message)?.[1];
  const operations = (object(contract) && Array.isArray(contract.operations) ? contract.operations : []) as Array<{ id?: string; input?: { required?: string[]; properties?: Record<string, { enum?: unknown[] }> }; examples?: Array<{ input?: unknown }> }>;
  if (/outside enum/.test(message)) for (const operation of operations) for (const [index, example] of (operation.examples ?? []).entries())
    for (const [field, value] of Object.entries(object(example.input) ? example.input : {})) {
      const allowed = operation.input?.properties?.[field]?.enum;
      if (allowed && !allowed.includes(value)) return '操作 ' + operation.id + ' 第 ' + (index + 1) + ' 个示例的 ' + field + ' 是「' + String(value) + '」，不在 ' + allowed.join('/') + ' 之内；所有操作和示例要用同一组取值';
    }
  if (missing) for (const operation of operations) if (operation.input?.required?.includes(missing) && operation.examples?.some(example => !object(example.input) || !(missing in example.input)))
    return '操作 ' + operation.id + ' 的示例输入缺少必填字段 ' + missing + '：可以不填的字段写成 "' + missing + '?"（例如筛选条件），否则在示例里给出它';
  return '功能合同不成立：' + message;
}
export function validateAgentDesign(input: unknown, capabilities: readonly string[], resources: readonly string[], validateContract: (contract: unknown) => void): AgentDesign {
  if (!object(input) || Object.keys(input).some(key => !['id', 'title', 'description', 'rationale', 'journey', 'contract', 'parts', 'acceptance'].includes(key))) throw new Error('方案包含未知属性');
  for (const field of ['id', 'title', 'description', 'rationale']) if (typeof input[field] !== 'string' || !input[field] || (input[field] as string).length > 4000) throw new Error('方案缺少有效的' + field);
  if (!Array.isArray(input.journey) || input.journey.length < 1 || input.journey.length > 20 || input.journey.some(item => typeof item !== 'string' || item.length > 1000)) throw new Error('用户旅程不完整');
  try { validateContract(input.contract); } catch (error) { throw new Error(explainContract(error, input.contract)); }
  const design = input as unknown as AgentDesign;
  for (const operation of design.contract.operations) {
    for (const capability of operation.effects.capabilities ?? []) if (!capabilities.includes(capability)) throw new Error('项目能力目录中没有：' + capability);
    for (const resource of operation.effects.resources ?? []) if (!resources.includes(resource)) throw new Error('没有这个已授权资源：' + resource);
  }
  design.parts = validatePluginComponentPlans(design.parts, design.contract);
  // A field taken from another part must exist there: in the records a collection lists, or in the result of the
  // command a form ran. Otherwise it stays empty and neither the person nor acceptance can go on.
  for (const part of design.parts) for (const binding of [part.read, part.submit]) for (const [field, source] of Object.entries(binding?.input ?? {})) {
    const from = source.source === 'selection' ? source.componentId : source.source === 'form' ? source.prefill?.componentId : undefined;
    if (!from) continue;
    const wanted = source.source === 'selection' ? source.field : source.source === 'form' ? source.prefill!.field : '';
    if (from === part.id) throw new Error('组件 ' + part.id + ' 的 ' + field + ' 不能取自它自己；由用户填写就直接写 "form"');
    const origin = design.parts.find(item => item.id === from)!;
    const query = origin.read && design.contract.operations.find(item => item.id === origin.read!.operationId);
    const command = origin.submit && design.contract.operations.find(item => item.id === origin.submit!.operationId);
    const listed = query ? pluginSchemaAt(query.output, origin.read!.outputPath) : undefined;
    const has = (schema?: SandboxSchema) => schema?.type === 'object' && !!pluginSchemaAt(schema, wanted);
    if (!has(listed?.type === 'array' ? listed.items : listed) && !has(command?.output))
      throw new Error('组件 ' + part.id + ' 的 ' + field + ' 取自 ' + from + '.' + wanted + '，但 ' + from + (query ? ' 列出的记录' : ' 的命令结果') + '里没有 ' + wanted + '：把 ' + wanted + ' 加进 ' + (query ?? command)?.id + ' 的 output，或者改成由用户填写');
  }
  if (!Array.isArray(design.acceptance) || design.acceptance.length < 1 || design.acceptance.length > 30) throw new Error('缺少可运行的浏览器验收');
  const ids = new Set<string>();
  for (const test of design.acceptance) {
    if (!object(test) || Object.keys(test).some(key => !['id', 'description', 'steps'].includes(key)) || !design.contract.acceptance.some(item => item.id === test.id) || ids.has(test.id)) throw new Error('浏览器验收必须引用唯一的合同用例'); ids.add(test.id);
    if (typeof test.description !== 'string' || !Array.isArray(test.steps) || !test.steps.length || test.steps.length > 100 || !test.steps.some(step => ['expect', 'expectAbsent', 'expectValue', 'expectOrder'].includes(step.action))) throw new Error('浏览器用例需要具体操作与断言');
    for (const [position, step] of test.steps.entries()) {
      const where = '验收「' + test.id + '」第 ' + (position + 1) + ' 步：';
      if (!object(step) || !['page', 'fill', 'submit', 'select', 'expect', 'expectAbsent', 'expectValue', 'expectOrder', 'reload'].includes(step.action)) throw new Error('不支持的浏览器步骤');
      const permitted = { page: ['action', 'pageId'], fill: ['action', 'componentId', 'field', 'value'], submit: ['action', 'componentId'], select: ['action', 'componentId', 'recordId', 'text'], expect: ['action', 'componentId', 'text'], expectAbsent: ['action', 'componentId', 'text'], expectValue: ['action', 'componentId', 'field', 'value'], expectOrder: ['action', 'componentId', 'texts'], reload: ['action'] }[step.action];
      if (Object.keys(step).some(key => !permitted.includes(key))) throw new Error('浏览器步骤属性无效');
      if (step.action === 'reload') continue;
      if (step.action === 'page') { if (!design.contract.pages.some(page => page.id === step.pageId)) throw new Error('验收引用不存在的页面'); continue; }
      const part = design.parts.find(item => item.id === step.componentId); if (!part) throw new Error(where + '没有组件 ' + step.componentId + '（组件有 ' + design.parts.map(item => item.id).join('、') + '）');
      if (step.action === 'submit' && !part.submit) throw new Error(where + '组件 ' + part.id + ' 没有提交操作，不能 submit');
      if (step.action === 'fill' || step.action === 'expectValue') {
        const fields = [part.read, part.submit].flatMap(binding => Object.values(binding?.input ?? {})).flatMap(source => source.source === 'form' ? [source.field] : []);
        if (!fields.includes(step.field)) throw new Error(where + '组件 ' + part.id + ' 没有可填写的字段 ' + step.field + '（' + (fields.length ? '它的字段是 ' + fields.join('、') : '它没有可填写的字段') + '）。按条件筛选列表时，在 collection 的 read 里写 {"op": 查询, "input": {"字段": "form"}}，再 fill 列表组件.字段');
        if (!['string', 'boolean'].includes(typeof step.value)) throw new Error(where + '填写的值只能是文字或 true/false');
      }
      if (step.action === 'select' && !(typeof step.recordId === 'string' && step.recordId) && !(typeof step.text === 'string' && step.text)) throw new Error('选择验收需要记录id或记录上显示的文字');
      if ((step.action === 'expect' || step.action === 'expectAbsent') && (typeof step.text !== 'string' || !step.text)) throw new Error('验收需要非空的预期可见文字');
      if (step.action === 'expectOrder' && (!Array.isArray(step.texts) || step.texts.length < 2 || step.texts.some(item => typeof item !== 'string' || !item))) throw new Error('顺序验收至少需要两段可见文字');
    }
  }
  if (design.contract.acceptance.some(item => !ids.has(item.id))) throw new Error('每个合同验收都必须有浏览器步骤');
  return structuredClone(design);
}
