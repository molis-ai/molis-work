import type { SandboxJson, SandboxPluginContract, SandboxSchema } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';

export type PluginComponentKind = 'heading' | 'text' | 'form' | 'button' | 'list' | 'cards' | 'table' | 'reader' | 'chat' | 'matrix' | 'calendar' | 'notice';
export type PluginComponentIntent = 'heading' | 'description' | 'input' | 'action' | 'collection' | 'reading' | 'conversation' | 'evidence' | 'schedule' | 'feedback';
export type PluginInputValue = { source: 'literal'; value: SandboxJson }
  | { source: 'form'; field: string; prefill?: { componentId: string; field: string } }
  | { source: 'selection'; componentId: string; field: string };
export interface PluginOperationBinding { operationId: string; input: Record<string, PluginInputValue>; outputPath?: string }
export interface PluginComponentProps {
  title?: string;
  description?: string;
  submitLabel?: string;
  emptyText?: string;
  idField?: string;
  titleField?: string;
  textField?: string;
  roleField?: string;
  hintLevelField?: string;
  citationsField?: string;
  /** `values` names how a field's values read, e.g. { "true": "已打卡", "false": "未打卡" }. */
  columns?: Array<{ field: string; label: string; values?: Record<string, string> }>;
}
export interface PluginComponentPlan {
  id: string;
  pageId: string;
  regionId: string;
  intent: PluginComponentIntent;
  purpose: string;
  props: PluginComponentProps;
  read?: PluginOperationBinding;
  submit?: PluginOperationBinding;
}
export interface PluginComponentNode extends PluginComponentPlan { kind: PluginComponentKind }
export interface PluginComponentMetadata {
  kind: PluginComponentKind;
  intent: PluginComponentIntent;
  name: string;
  description: string;
  data: 'none' | 'value' | 'array';
}
export const PLUGIN_COMPONENTS: readonly PluginComponentMetadata[] = [
  { kind: 'heading', intent: 'heading', name: '标题', description: '页面标题与简短说明', data: 'none' },
  { kind: 'text', intent: 'description', name: '正文', description: '阅读一段正文或操作结果', data: 'value' },
  { kind: 'form', intent: 'input', name: '表单', description: '按合同字段录入与修改，失败保留输入', data: 'none' },
  { kind: 'button', intent: 'action', name: '操作按钮', description: '执行当前选择对应的单项操作', data: 'none' },
  { kind: 'list', intent: 'collection', name: '列表', description: '逐条阅读并选择记录', data: 'array' },
  { kind: 'cards', intent: 'collection', name: '卡片', description: '并排浏览和比较记录', data: 'array' },
  { kind: 'table', intent: 'collection', name: '表格', description: '密集比较多个字段', data: 'array' },
  { kind: 'reader', intent: 'reading', name: '原文阅读', description: '按稳定小节锚点阅读、选择原文引用', data: 'array' },
  { kind: 'chat', intent: 'conversation', name: '对话', description: '显示有出处的多轮对话，与输入区分别更新', data: 'array' },
  { kind: 'matrix', intent: 'evidence', name: '证据矩阵', description: '展示后端返回的证据层次，逐行查看', data: 'array' },
  { kind: 'calendar', intent: 'schedule', name: '日期清单', description: '按日期显示到期事项与选择入口', data: 'array' },
  { kind: 'notice', intent: 'feedback', name: '状态提示', description: '显示操作结果或可恢复的问题', data: 'value' },
];
const IDENTIFIER = /^[a-z][a-z0-9_.-]{0,99}$/;
const FIELD = /^[a-zA-Z_][a-zA-Z0-9_.-]{0,99}$/;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const fail = (message: string): never => { throw new Error('界面合同无效：' + message); };
export function pluginSchemaAt(schema: SandboxSchema, path?: string): SandboxSchema | undefined {
  if (!path) return schema;
  let current: SandboxSchema | undefined = schema;
  for (const part of path.split('.')) {
    if (forbidden.has(part)) return undefined;
    current = current?.type === 'object' ? current.properties?.[part] : undefined;
  }
  return current;
}
export function pluginValueAt(value: unknown, path?: string): unknown {
  if (!path) return value;
  for (const key of path.split('.')) {
    if (forbidden.has(key) || !plain(value) || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}
function checkBinding(binding: PluginOperationBinding, contract: SandboxPluginContract, reading: boolean) {
  if (!plain(binding) || Object.keys(binding).some(key => !['operationId', 'input', 'outputPath'].includes(key))) fail('操作绑定包含未知属性');
  const operation = contract.operations.find(item => item.id === binding.operationId);
  if (!operation) fail('操作不存在：' + binding.operationId);
  if (reading && operation!.kind !== 'query') fail('自动读取只能绑定查询操作');
  if (operation!.input.type !== 'object' || !plain(binding.input)) fail('界面操作的输入必须是对象');
  for (const [name, source] of Object.entries(binding.input)) {
    if (!Object.hasOwn(operation!.input.properties ?? {}, name)) fail('操作没有输入字段：' + name);
    if (!plain(source) || !['literal', 'form', 'selection'].includes(source.source as string)) fail('输入来源无效；组件尚未提供 event 输入');
    if (source.source === 'literal') {
      if (Object.keys(source).some(key => !['source', 'value'].includes(key)) || !Object.hasOwn(source, 'value')) fail('常量输入无效');
      const spec = operation!.input.properties![name]!, value = source.value, kind = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      const fits = (!spec.enum || spec.enum.some(item => JSON.stringify(item) === JSON.stringify(value)))
        && (spec.type === kind || spec.type === 'integer' && Number.isInteger(value) || spec.type === 'object' && kind === 'object');
      if (!fits) fail('常量「' + JSON.stringify(value) + '」不是 ' + operation!.id + ' 的 ' + name + ' 能接受的值' + (spec.enum ? '（只能是 ' + spec.enum.map(item => String(item)).join('/') + '）' : '')
        + (typeof value === 'string' && /^(form|selection|prefill)\b/.test(value) ? '；它像是想引用表单或选中的记录：由用户填写写成 "form"，取选中记录写成 "selection:组件.字段"'
          : '；要按当前记录推算（例如切到下一个状态），就让这个操作只收 id，在代码里算'));
    } else if (Object.keys(source).some(key => !['source', 'field', ...(source.source === 'selection' ? ['componentId'] : ['prefill'])].includes(key)) || typeof source.field !== 'string' || !FIELD.test(source.field) || source.field.split('.').some(key => forbidden.has(key))) fail('输入字段路径无效');
    if (source.source === 'selection' && (typeof source.componentId !== 'string' || !IDENTIFIER.test(source.componentId))) fail('选择来源必须指定组件');
    if (source.source === 'form' && source.prefill && (!plain(source.prefill) || Object.keys(source.prefill).some(key => !['componentId', 'field'].includes(key)) || !IDENTIFIER.test(source.prefill.componentId) || !FIELD.test(source.prefill.field))) fail('预填来源无效');
    // A read's form fields are a filter the person sets above the records, re-read on every change.
    if (reading && source.source === 'form' && source.prefill) fail('筛选字段不能预填');
    if (source.source === 'form' && source.field.includes('.')) fail('表单字段必须使用单层标识，嵌套值使用 JSON 字段');
  }
  for (const key of operation!.input.required ?? []) if (!Object.hasOwn(binding.input, key)) fail('缺少必需输入的绑定：' + key + '（' + operation!.id + ' 要求 ' + key + '；按钮只带选中记录的字段，要用户给值就用表单，或把它改成可选）');
  if (binding.outputPath !== undefined && (typeof binding.outputPath !== 'string' || !pluginSchemaAt(operation!.output, binding.outputPath))) fail('输出字段路径无效');
  return operation!;
}
export function validatePluginComponentPlans(value: unknown, contract: SandboxPluginContract): PluginComponentPlan[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) fail('需要 1–100 个界面零件');
  const seen = new Set<string>();
  for (const raw of value as unknown[]) try {
    if (!plain(raw) || Object.keys(raw).some(key => !['id', 'pageId', 'regionId', 'intent', 'purpose', 'props', 'read', 'submit'].includes(key))) fail('未知零件属性');
    const part = raw as unknown as PluginComponentPlan;
    if (!IDENTIFIER.test(part.id) || seen.has(part.id)) fail('零件标识重复或不合法'); seen.add(part.id);
    if (!contract.pages.some(page => page.id === part.pageId && page.regions.some(region => region.id === part.regionId))) fail('零件引用了不存在的页面或区域');
    if (!PLUGIN_COMPONENTS.some(item => item.intent === part.intent) || typeof part.purpose !== 'string' || !part.purpose.trim() || part.purpose.length > 600) fail('用途无效');
    if (!plain(part.props) || Object.keys(part.props).some(key => !['title', 'description', 'submitLabel', 'emptyText', 'idField', 'titleField', 'textField', 'roleField', 'hintLevelField', 'citationsField', 'columns'].includes(key))) fail('未知零件配置');
    for (const [key, val] of Object.entries(part.props)) if (key !== 'columns' && (typeof val !== 'string' || val.length > 2000)) fail('零件文本配置无效');
    if (part.props.columns !== undefined && (!Array.isArray(part.props.columns) || part.props.columns.length > 24 || part.props.columns.some(column => !plain(column) || Object.keys(column).some(key => !['field', 'label', 'values'].includes(key)) || !FIELD.test(column.field) || typeof column.label !== 'string' || column.label.length > 120
      || column.values !== undefined && (!plain(column.values) || Object.keys(column.values).length > 24 || Object.values(column.values).some(value => typeof value !== 'string' || value.length > 60))))) fail('表格列配置无效');
    const allowed = contract.pages.find(page => page.id === part.pageId)!.regions.find(region => region.id === part.regionId)!.operationIds;
    for (const binding of [part.read, part.submit]) if (binding && !allowed.includes(binding.operationId)) fail('操作不属于这个区域');
    if (part.read) checkBinding(part.read, contract, true);
    if (part.submit) checkBinding(part.submit, contract, false);
    if (['input', 'action', 'conversation'].includes(part.intent) && !part.submit) fail('交互零件需要提交操作');
    if (['collection', 'reading', 'conversation', 'evidence', 'schedule'].includes(part.intent) && !part.read) fail('内容零件需要读取操作');
    if (!pluginComponentChoices(part, contract).length) fail('组件池没有能表达这个需求的合法组件：' + part.id
      + (part.read && ['collection', 'reading', 'conversation', 'evidence', 'schedule'].includes(part.intent) ? '（它读的 ' + part.read.operationId + ' 返回的不是列表；合计、统计这类返回对象的内容用 description 显示成一组带说明的数字）' : ''));
  } catch (error) {
    // Name the part, so whoever wrote it can find it.
    const id = plain(raw) && typeof raw.id === 'string' ? raw.id : '';
    if (!id || !(error instanceof Error) || error.message.includes('组件 ' + id)) throw error;
    throw Object.assign(new Error(error.message.replace(/^(界面合同无效：)?/, (prefix: string) => prefix + '组件 ' + id + '：')), { code: (error as { code?: unknown }).code });
  }
  for (const part of value as PluginComponentPlan[]) for (const binding of [part.read, part.submit]) for (const source of Object.values(binding?.input ?? {})) {
    const id = source.source === 'selection' ? source.componentId : source.source === 'form' ? source.prefill?.componentId : undefined;
    if (id && !seen.has(id)) fail('选择来源组件不存在：' + id);
  }
  return structuredClone(value) as PluginComponentPlan[];
}
export function pluginComponentChoices(part: PluginComponentPlan, contract: SandboxPluginContract): PluginComponentMetadata[] {
  const output = part.read ? pluginSchemaAt(contract.operations.find(item => item.id === part.read!.operationId)?.output ?? { type: 'null' }, part.read.outputPath) : undefined;
  return PLUGIN_COMPONENTS.filter(item => item.intent === part.intent && (item.data !== 'array' || output?.type === 'array'));
}
export function validatePluginComponentNodes(nodes: PluginComponentNode[], plans: PluginComponentPlan[], contract: SandboxPluginContract) {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) fail('已装配零件重复'); ids.add(node.id);
    const plan = plans.find(part => part.id === node.id);
    if (!plan || !pluginComponentChoices(plan, contract).some(choice => choice.kind === node.kind)) fail('装配了候选之外的组件');
    const { kind: _kind, ...attributes } = node;
    if (JSON.stringify(attributes) !== JSON.stringify(plan)) fail('装配不能改写主线配置');
  }
}
/** Host resolves the real operation from the frozen node, never a client-supplied operation id. */
export function resolvePluginComponentCall(node: PluginComponentNode, bindingId: 'read' | 'submit', payload: unknown) {
  const binding = node[bindingId];
  if (!binding) fail('这个零件没有该操作');
  if (!plain(payload) || Object.keys(payload).some(key => !['form', 'selection', 'event'].includes(key))) fail('事件输入无效');
  const sources = payload as Record<string, unknown>;
  const input: Record<string, SandboxJson> = {};
  for (const [field, source] of Object.entries(binding!.input)) {
    const value = source.source === 'literal' ? source.value : pluginValueAt(source.source === 'selection' ? pluginValueAt(sources.selection, source.componentId) : sources.form, source.field);
    if (value !== undefined) input[field] = value as SandboxJson;
  }
  return { operationId: binding!.operationId, input };
}

export const PLUGIN_COMPONENT_STYLES = `
.pc-fields{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 10px;margin:4px 0 0;font-size:13px}.pc-fields dt{color:#737985}.pc-fields dd{margin:0;overflow-wrap:anywhere}
.pc-view{color:var(--pb-ink,#232831);font:14px/1.65 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;min-width:0;container-type:inline-size}.pc-tabs{display:flex;gap:8px;border-bottom:1px solid #e9e9ed;padding-bottom:12px;margin-bottom:28px;overflow-x:auto}.pc-tabs button{white-space:nowrap;background:transparent;border:0;border-radius:6px;padding:8px 14px;color:inherit;cursor:pointer}.pc-tabs [aria-selected=true]{background:#272c32;color:white}.pc-page{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:32px}.pc-region{min-width:0}.pc-node{margin:0 0 26px;scroll-margin-top:24px}.pc-node>header{display:flex;gap:10px;justify-content:space-between;align-items:start}.pc-node h2{font-size:20px;font-weight:600;line-height:1.4;margin:0 0 12px;letter-spacing:-.02em}.pc-node h1{font-size:29px;font-weight:600;line-height:1.4;margin:0 0 12px;letter-spacing:-.025em}.pc-node h1,.pc-node h2{min-width:0;overflow-wrap:anywhere}.pc-node p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 14px;max-width:72ch}.pc-status{font-size:11px;color:#596476;white-space:nowrap}.pc-status[data-connected=true]{color:#237457}.pc-field{display:grid;gap:6px;margin-bottom:15px;min-width:0}.pc-field>span{font-size:13px;color:#4b535e}.pc-field input,.pc-field textarea,.pc-field select{font:inherit;color:inherit;padding:10px 12px;border:1px solid #dedfe3;background:var(--pb-canvas,#fff);border-radius:6px;box-sizing:border-box;width:100%;min-height:42px;caret-color:#397bfa}.pc-field textarea{resize:vertical;min-height:110px}.pc-field input[type=checkbox]{width:20px;min-height:20px}.pc-submit,.pc-row-action{font:inherit;cursor:pointer;padding:9px 14px;background:#272c32;color:#fff;border:0;border-radius:7px;min-height:40px}.pc-row-action{background:#f3f3f4;color:#232831}.pc-view button:disabled{opacity:.5;cursor:default}.pc-view :focus-visible{outline:2px solid #397bfa;outline-offset:3px}.pc-view ::selection{background:#dbe8ff}.pc-output{min-width:0}.pc-empty{padding:18px 0;color:#626a76}.pc-error{color:#a34632;white-space:pre-wrap;margin:10px 0}.pc-success{color:#237457;margin:10px 0}.pc-record{padding:16px 0;border-bottom:1px solid #e9e9ed}.pc-record h3{font-size:16px;font-weight:550;margin:0 0 8px}.pc-record[aria-current=true]{background:#edf3ff}.pc-row-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.pc-figures{font-size:14px;gap:6px 14px}.pc-figures-wide{grid-column:1/-1}.pc-figures>dd{font-variant-numeric:tabular-nums}.pc-figures .pc-table{font-size:13px}.pc-filter{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:0 0 14px}.pc-filter .pc-field{margin:0;flex:1 1 160px;max-width:280px}.pc-table td .pc-row-action+.pc-row-action{margin-left:8px}.pc-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:16px}.pc-cards .pc-record{border:1px solid #e9e9ed;border-radius:7px;padding:16px}.pc-table-wrap{overflow:auto}.pc-table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}.pc-table th,.pc-table td{border-bottom:1px solid #e9e9ed;text-align:left;vertical-align:top;padding:12px 10px;max-width:360px;overflow-wrap:anywhere}.pc-table th{font-weight:600;color:#56606d}.pc-reader .pc-record{padding:20px 0}.pc-reader .pc-record p{font-family:"Songti SC","Noto Serif CJK SC",serif;font-size:18px;line-height:2;max-width:48ch}.pc-reference{font:12px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;color:#596476}.pc-chat .pc-record{border:0;margin-bottom:14px;padding:12px 0}.pc-chat .pc-record[data-role=user]{padding-left:18px}.pc-chat .pc-record h3{font-size:12px;color:#626a76}.pc-node[data-inspected=true]{outline:1px solid #397bfa;outline-offset:7px}.pc-inspect{color:#397bfa;background:transparent;border:0;font:12px/1.4 inherit;cursor:pointer;padding:3px}.pc-view [hidden]{display:none!important}@container(max-width:640px){.pc-page{grid-template-columns:1fr;gap:18px}.pc-node h1{font-size:25px}.pc-reader .pc-record p{font-size:17px}}@media(prefers-reduced-motion:reduce){.pc-view *{scroll-behavior:auto!important}}
`;
