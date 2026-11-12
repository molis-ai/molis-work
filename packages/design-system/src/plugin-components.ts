import { t, tryOwnedTextRef } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SandboxJson, SandboxPluginContract, SandboxSchema, SandboxVisibleText } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { TextRef, UiComponentIntent, UiComponentSpec, UiSlotDescriptor } from '@molis-ai/molis-work-contracts/platform/ui';
import type { SandboxUiContribution } from '@molis-ai/molis-work-plugin-sdk';
import { isDestructivePluginOperation, literalPluginWord } from './plugin-surface-text.js';
import { BASELINE_SPEC } from './baseline.js';
import { PLUGIN_PRESENTATION_STYLES } from './plugin-presentation-client.js';

/** A part's component: a UI catalog id (see PLUGIN_COMPONENTS), or a kind from before parts came from the catalog. */
export type PluginComponentKind = string;
export type PluginComponentIntent = UiComponentIntent;
export const PLUGIN_COMPONENT_PROP_KEYS = ['title', 'description', 'submitLabel', 'requiredText', 'emptyText', 'idField', 'titleField', 'textField', 'roleField', 'hintLevelField', 'citationsField', 'columns'] as const;
export const PLUGIN_COMPONENT_WORD_KEYS = ['title', 'description', 'submitLabel', 'requiredText', 'emptyText'] as const;
export type PluginInputValue = { source: 'literal'; value: SandboxJson }
  | { source: 'form'; field: string; prefill?: { componentId: string; field: string } }
  | { source: 'selection'; componentId: string; field: string };
export interface PluginOperationBinding { operationId: string; input: Record<string, PluginInputValue>; outputPath?: string }
export interface PluginComponentProps {
  title?: SandboxVisibleText;
  description?: SandboxVisibleText;
  submitLabel?: SandboxVisibleText;
  /** Visible feedback when a required form field is missing; native validation remains authoritative. */
  requiredText?: SandboxVisibleText;
  emptyText?: SandboxVisibleText;
  idField?: string;
  titleField?: string;
  textField?: string;
  roleField?: string;
  hintLevelField?: string;
  citationsField?: string;
  /** `values` names how a field's values read, e.g. { "true": "已打卡", "false": "未打卡" }. */
  columns?: Array<{ field: string; label: SandboxVisibleText; values?: Record<string, SandboxVisibleText> }>;
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
  surfaceSlot?: Pick<UiSlotDescriptor, 'slot_id'>;
}
export interface PluginComponentNode extends PluginComponentPlan { kind: PluginComponentKind }
/** One catalog entry in the form consumed by the Builder and the standard board. */
export type PluginComponentMetadata = Omit<UiComponentSpec, "name" | "description"> & {
  readonly name: string;
  readonly description: string;
};
export type PluginCatalogGroup = UiComponentSpec["group"];

export const PLUGIN_COMPONENTS: readonly UiComponentSpec[] = BASELINE_SPEC.components;

export function componentText(ref: TextRef, read: (key: string) => string = t.text): string {
  return "literal" in ref ? ref.literal : read(ref.key);
}

/** The design model consumes words, whereas the browser receives the same declarations as TextRefs. */
export function pluginComponentCatalog(): readonly PluginComponentMetadata[] {
  return PLUGIN_COMPONENTS.map(projectComponentMetadata);
}

export function projectComponentMetadata({ name, description, ...row }: UiComponentSpec): PluginComponentMetadata {
  return { ...row, name: componentText(name), description: componentText(description) };
}

/** For each intent, the catalog components that can express it, most usual first (the rule's choice when Jev is absent). */
const PREFERENCE: Record<PluginComponentIntent, string[]> = {
  heading: ['frame'], description: ['card', 'alert', 'badge'], input: ['form', 'sheet', 'dialog'], action: ['button', 'alert-dialog'],
  collection: ['directory', 'card', 'table', 'accordion', 'calendar'], reading: ['accordion', 'card'], conversation: ['directory', 'card'],
  evidence: ['table', 'accordion'], schedule: ['calendar', 'table', 'directory'], feedback: ['alert'],
};
const componentsByKind = new Map(PLUGIN_COMPONENTS.map(component => [component.kind, component]));
const implementedParts = new Set(Object.values(PREFERENCE).flat());
for (const component of PLUGIN_COMPONENTS) {
  if ((component.use === 'part') !== implementedParts.has(component.kind)) throw new Error('组件装配登记与实际实现不符：' + component.kind);
}
for (const kind of implementedParts) {
  if (!componentsByKind.has(kind)) throw new Error('实际装配的组件未登记：' + kind);
}
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
  if (!operation) return fail('操作不存在：' + binding.operationId);
  if (operation.read_protocol !== undefined) return fail('平台读取协议不能绑定到页面组件：' + binding.operationId);
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
function checkSurfaceSlot(part: PluginComponentPlan, contract: SandboxPluginContract, ui: SandboxUiContribution | undefined) {
  const slot = part.surfaceSlot;
  if (!plain(slot) || Object.keys(slot).length !== 1 || !ui?.slots.some(entry => entry.slot_id === slot.slot_id)
    || part.intent !== 'reading' || !part.read || part.submit) return fail('对象挂载位必须引用本页已声明的 slot_id，只可绑定读取');
  const operation = contract.operations.find(item => item.id === part.read!.operationId);
  if (!operation || operation.kind !== 'query' || operation.read_protocol !== undefined || operation.external
    || operation.effects.model?.includes('invoke') || operation.effects.imageGeneration?.includes('generate'))
    return fail('对象挂载位只能读取本插件的普通查询');
  const answer = pluginSchemaAt(operation.output, part.read.outputPath);
  const item = answer?.type === 'array' ? answer.items : undefined;
  if (item?.type !== 'object' || item.additionalProperties !== false || Object.keys(item.properties ?? {}).length !== 2
    || !['kind', 'id'].every(key => item.properties?.[key]?.type === 'string' && item.required?.includes(key))) {
    fail('对象挂载位的查询输出必须是 { kind, id } 引用数组');
  }
}

export function validatePluginComponentPlans(value: unknown, contract: SandboxPluginContract, ui?: SandboxUiContribution): PluginComponentPlan[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) fail('需要 1–100 个界面零件');
  const seen = new Set<string>();
  for (const raw of value as unknown[]) try {
    if (!plain(raw) || Object.keys(raw).some(key => !['id', 'pageId', 'regionId', 'intent', 'purpose', 'props', 'read', 'submit', 'surfaceSlot'].includes(key))) fail('未知零件属性');
    const part = raw as unknown as PluginComponentPlan;
    if (!IDENTIFIER.test(part.id) || seen.has(part.id)) fail('零件标识重复或不合法'); seen.add(part.id);
    if (!contract.pages.some(page => page.id === part.pageId && page.regions.some(region => region.id === part.regionId))) fail('零件引用了不存在的页面或区域');
    if (!PREFERENCE[part.intent as PluginComponentIntent] || typeof part.purpose !== 'string' || !part.purpose.trim() || part.purpose.length > 600) fail('用途无效');
    if (!plain(part.props)) fail('props 必须是对象');
    const unknown = Object.keys(part.props).filter(key => !(PLUGIN_COMPONENT_PROP_KEYS as readonly string[]).includes(key));
    if (unknown.length) fail('不支持 props 属性：' + unknown.join('、') + '；可用：' + PLUGIN_COMPONENT_PROP_KEYS.join('、'));
    for (const [key, val] of Object.entries(part.props)) {
      if (key === 'columns') continue;
      const invalid = (PLUGIN_COMPONENT_WORD_KEYS as readonly string[]).includes(key)
        ? (typeof val !== "string" && tryOwnedTextRef(val, contract.pluginId) === null || literalPluginWord(val as SandboxVisibleText).length > 2000) : typeof val !== 'string' || val.length > 2000;
      if (invalid) fail('零件文本配置无效：' + key);
    }
    if (part.props.columns !== undefined && (!Array.isArray(part.props.columns) || part.props.columns.length > 24 || part.props.columns.some(column => !plain(column) || Object.keys(column).some(key => !['field', 'label', 'values'].includes(key)) || !FIELD.test(column.field) || typeof column.label !== "string" && tryOwnedTextRef(column.label, contract.pluginId) === null || literalPluginWord(column.label).length > 120
      || column.values !== undefined && (!plain(column.values) || Object.keys(column.values).length > 24 || Object.values(column.values).some(value => typeof value !== "string" && tryOwnedTextRef(value, contract.pluginId) === null || literalPluginWord(value).length > 60))))) fail('表格列配置无效');
    const allowed = contract.pages.find(page => page.id === part.pageId)!.regions.find(region => region.id === part.regionId)!.operationIds;
    for (const binding of [part.read, part.submit]) if (binding && !allowed.includes(binding.operationId)) fail('操作不属于这个区域');
    if (part.read) checkBinding(part.read, contract, true);
    if (part.submit) checkBinding(part.submit, contract, false);
    if (part.surfaceSlot !== undefined) checkSurfaceSlot(part, contract, ui);
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
  const mounts = new Set((value as PluginComponentPlan[]).filter(part => part.surfaceSlot).map(part => part.id));
  for (const part of value as PluginComponentPlan[]) for (const binding of [part.read, part.submit]) for (const source of Object.values(binding?.input ?? {})) {
    const id = source.source === 'selection' ? source.componentId : source.source === 'form' ? source.prefill?.componentId : undefined;
    if (id && !seen.has(id)) fail('选择来源组件不存在：' + id);
    if (id && mounts.has(id)) fail('对象挂载位不提供选中输出：' + id);
  }
  return structuredClone(value) as PluginComponentPlan[];
}
export function pluginComponentChoices(part: PluginComponentPlan, contract: SandboxPluginContract): UiComponentSpec[] {
  if (part.surfaceSlot) return PLUGIN_COMPONENTS.filter(item => item.kind === 'surface-slot');
  const operation = contract.operations.find(item => item.id === part.read?.operationId);
  const schema = operation?.read_protocol === undefined ? operation?.output : undefined;
  const output = part.read ? pluginSchemaAt(schema ?? { type: 'null' }, part.read.outputPath) : undefined;
  const items = output?.type === 'array' ? output.items : undefined;
  // A calendar needs records that carry a date; a confirmation fits an action that cannot be undone.
  const dated = items?.type === 'object' && Object.entries(items.properties ?? {}).some(([name, spec]) => spec.type === 'string' && (spec.format === 'date' || spec.format === 'date-time' || /date|day|日期/i.test(name)));
  const destructive = isDestructivePluginOperation(part.submit?.operationId)
    || /删除|移除|清空|撤销|丢弃/u.test(literalPluginWord(part.props.submitLabel) + literalPluginWord(part.props.title) + part.purpose);
  return PREFERENCE[part.intent].map(kind => componentsByKind.get(kind)!).filter(item => {
    if (!item.intents.includes(part.intent)) return false;
    if (item.data === 'array' && output?.type !== 'array') return false;
    if (item.kind === 'calendar' && !dated) return false;
    if (item.kind === 'alert-dialog' && !destructive) return false;
    if (item.kind === 'alert' && part.intent === 'description' && output?.type !== 'string') return false;
    if (item.kind === 'badge' && !['string', 'number', 'integer', 'boolean'].includes(output?.type ?? '')) return false;
    return true;
  });
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

/**
 * Layout glue for generated plugins. The components themselves are the UI catalog's (`mw-*`, from the product
 * stylesheet the plugin page loads), so a plugin looks and themes like the rest of Molis Work; this only places them.
 */
export const PLUGIN_COMPONENT_STYLES = `
.pc-view{color:var(--ink);min-width:0;container-type:inline-size;font:13px/1.6 var(--font);-webkit-font-smoothing:antialiased}
.pc-view *{box-sizing:border-box}.pc-view [hidden]{display:none!important}.pc-view :is(h1,h2,h3,p,dl,dd){margin:0}
.pc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.pc-icon{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.pc-tabs{margin:0 0 24px}
.pc-page{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:32px;align-items:start}.pc-region{min-width:0;display:flex;flex-direction:column;gap:24px}
.pc-node{position:relative;min-width:0;scroll-margin-top:24px}
.pc-part-head{margin-bottom:8px}.pc-part-title{font-size:15px;font-weight:600;color:var(--ink)}.pc-part-description{color:var(--muted);margin:-4px 0 12px!important;max-width:72ch;white-space:pre-wrap}
.pc-app-head{display:flex;align-items:center;gap:16px;padding:0!important;border:0!important;background:none!important}.pc-app-head .mw-frame__heading{flex:1;min-width:0}
.pc-app-head h1{font-size:24px;font-weight:600;letter-spacing:-.025em;line-height:1.3;overflow-wrap:anywhere}.pc-app-description{color:var(--muted);margin-top:4px!important;font-size:13px}
.pc-app-actions{display:flex;gap:8px;flex:none}
.pc-mark{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;flex:none;background:var(--rail);color:var(--ink-soft)}.pc-mark .pc-icon{width:20px;height:20px;stroke-width:1.7}
/* Inside the workbench the tab chip already names the plugin: the stage keeps its one-line purpose and its new buttons. */
[data-framed] .pc-app-head .pc-mark,[data-framed] .pc-app-head h1{display:none}[data-framed] .pc-app-description{margin:0!important}
.pc-figures{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:12px}
.pc-stat{min-width:0;padding:16px 16px;animation:craft-rise var(--dur-arrive) var(--ease-quint) both}.pc-stat>dt{font-size:12px;color:var(--muted);margin-bottom:4px}
.pc-stat>dd{font-size:24px;font-weight:600;letter-spacing:-.02em;line-height:1.25;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.pc-stat[data-words]>dd{font-size:13px;font-weight:500;line-height:1.55;letter-spacing:0}
.pc-figures-wide{grid-column:1/-1}.pc-figures-wide>dd{font-size:13px;font-weight:400;letter-spacing:0}.pc-figures-nested{margin-top:8px}
.pc-bars{display:grid;gap:8px;margin-top:8px}.pc-bar{display:grid;grid-template-columns:minmax(56px,max-content) minmax(40px,1fr) auto;gap:12px;align-items:center;font-size:13px}.pc-bar>span{color:var(--ink-soft,var(--ink))}.pc-bar>strong{font-weight:600;font-variant-numeric:tabular-nums}
.pc-answer{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.75;max-width:72ch}.pc-answer-card .mw-card__panel{padding-top:0}
.pc-form-fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr));grid-auto-flow:row dense;gap:12px 16px}.pc-form-fields:empty{display:none}
.pc-field-wide{grid-column:1/-1}.pc-field-choice .mw-toggle-group{flex-wrap:wrap}.pc-field-check{align-self:end;min-height:32px}
.pc-form-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:12px}
.pc-form-panel{padding:16px 16px!important}
.pc-compact .pc-form-panel{display:flex;align-items:flex-end;flex-wrap:wrap;gap:12px 16px}.pc-compact .pc-form-fields{flex:1 1 360px;display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px 16px}.pc-compact .pc-form-fields>*{flex:1 1 170px}.pc-compact .pc-field-choice{flex:0 1 auto}.pc-compact .pc-form-actions{margin:0}
.pc-inline .pc-form-panel{padding:8px!important}.pc-inline-group{display:flex;align-items:center;gap:8px}.pc-inline-group>.mw-field{flex:1;min-width:0}.pc-inline-group .mw-input{border-color:transparent;box-shadow:none;background:transparent}
.pc-bare .pc-form-panel{padding:0!important}.pc-bare .pc-form-actions{justify-content:flex-start;margin:0}
.pc-toolbar{display:flex;align-items:center;gap:12px 16px;flex-wrap:wrap;margin:0 0 12px;padding:0;border:0;background:none}
.pc-filter{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;flex:1 1 auto;min-width:0}.pc-filter-item{display:flex;align-items:center;gap:8px;min-width:0}.pc-filter-label{font-size:12px;color:var(--muted);white-space:nowrap}
.pc-search{flex:1 1 220px;max-width:340px}.pc-search .pc-icon{color:var(--faint);margin-left:8px}.pc-filter-item:has(.pc-search){flex:1 1 220px;max-width:340px}.pc-filter-item .pc-search{width:100%}
.pc-tools{display:flex;align-items:center;gap:4px;margin-left:auto}.pc-count{font-size:12px;color:var(--faint);margin-right:4px}.pc-count[data-count]:not([data-count=""])::before{content:"共 " attr(data-count) " 条"}
.pc-output{min-width:0}
.pc-directory{display:flex;flex-direction:column;border:0;border-radius:0;background:transparent;overflow:visible}
.pc-directory>.pc-record,.pc-agenda-items>.pc-record{display:flex;align-items:center;gap:8px;padding:4px 12px 4px 4px;border-radius:var(--r-row,10px);background:var(--paper);box-shadow:0 0 0 1px var(--line),0 1px 3px color-mix(in srgb,var(--shadow-color,#000) 6%,transparent)}.pc-directory>.pc-record+.pc-record,.pc-agenda-items>.pc-record+.pc-record{margin-top:8px}
.pc-row{display:flex!important;align-items:center;gap:12px;flex:1;min-width:0;height:auto!important;min-height:52px;padding:12px 12px!important;cursor:default;white-space:normal!important;background:none!important}
.pc-row .mw-dir-row__copy{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}.pc-row .mw-dir-row__headline strong{font-size:15px;font-weight:500;white-space:normal;overflow-wrap:anywhere}
.pc-record[data-selectable]{cursor:pointer;transition:background-color var(--dur-move) var(--ease-quint)}.pc-record[data-selectable]:hover{background:var(--nav-hover)}.pc-record[aria-current=true]{background:var(--nav-active)!important;box-shadow:none}
.pc-record-text{color:var(--ink-soft,var(--ink));white-space:pre-wrap;overflow-wrap:anywhere}.pc-record-note{display:block;font-size:13px;color:var(--ink-soft,var(--ink));white-space:pre-wrap;overflow-wrap:anywhere}
.pc-record-meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;font-size:12px;color:var(--muted)}.pc-meta-label{color:var(--faint);margin-right:4px}.pc-meta-number{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}.pc-view time{white-space:nowrap}
.pc-record-figure{flex:none;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.pc-row-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;flex:none}.pc-row-actions .pc-row-action.pc-row-action[data-pc-select]{border-color:color-mix(in srgb,var(--accent) 34%,transparent);background:var(--accent-soft);color:var(--accent-strong,var(--accent))}.pc-row-actions .pc-row-action.pc-row-action[data-pc-select]:hover:not(:disabled){background:color-mix(in srgb,var(--accent) 18%,var(--paper));color:var(--accent-strong,var(--accent))}.pc-row-actions .pc-row-action.pc-row-action[data-danger]{border-color:color-mix(in srgb,var(--red) 30%,transparent);color:var(--red)}.pc-row-actions .pc-row-action.pc-row-action[data-danger]:hover:not(:disabled){background:var(--red-soft,color-mix(in srgb,var(--red) 10%,transparent));color:var(--red)}
.pc-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:16px}
.pc-card-grid>.pc-record{display:flex;flex-direction:column;min-width:0;transition:box-shadow var(--dur-move),transform var(--dur-move)}.pc-card-grid>.pc-record:hover{box-shadow:var(--lift-2);transform:translateY(-1px)}
.pc-card-grid .mw-card__description{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap}.pc-card-grid .mw-card__panel{display:grid;gap:8px;flex:1}
.pc-add-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:128px;border:1.5px dashed var(--line-strong,var(--line));border-radius:var(--r-card,12px);background:none;color:var(--muted);font:inherit;cursor:pointer;transition:border-color 130ms,color 130ms}.pc-add-tile:hover{border-color:var(--blue);color:var(--blue)}.pc-add-tile .pc-icon{width:20px;height:20px}
.pc-table td[data-number]{text-align:right}.pc-table td:last-child .pc-row-actions{justify-content:flex-end}.pc-table tbody tr:first-child td:first-child{font-weight:500}
.pc-accordion>.pc-record>summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.pc-fold-title{font-weight:500}.pc-accordion .mw-collapsible__body{display:grid;gap:8px}
.pc-reading .pc-record-text{font-family:"Songti SC","Noto Serif CJK SC",serif;font-size:17px;line-height:2;max-width:46ch;color:var(--ink)}
.pc-conversation .pc-record[data-role=user]{margin-left:auto;max-width:86%}
.pc-agenda{display:grid;gap:16px}.pc-agenda-day{display:grid;grid-template-columns:64px minmax(0,1fr);gap:12px;align-items:start}
.pc-agenda-date{display:flex;flex-direction:column;align-items:center;padding-top:8px}.pc-agenda-date strong{font-size:24px;font-weight:600;line-height:1.1}.pc-agenda-date span{font-size:12px;color:var(--muted)}
.pc-agenda-items{display:flex;flex-direction:column;border:0;border-radius:0;background:transparent}
.pc-fields{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 12px;font-size:13px}.pc-fields dt{color:var(--muted)}.pc-fields dd{overflow-wrap:anywhere}
.pc-empty{min-height:0;padding:32px 16px}
.pc-skeleton{display:grid;gap:12px}.pc-skeleton .mw-skeleton{display:block;height:44px;border-radius:10px}.pc-skeleton[data-idle] .mw-skeleton{animation:none;opacity:.6}
.pc-working{margin-top:12px;font-size:13px;color:var(--muted)}
.pc-success{margin-top:12px;animation:craft-rise var(--dur-move) var(--ease-quint);transition:opacity var(--dur-move) var(--ease-quint)}.pc-success.is-leaving{opacity:0}.pc-success::before{content:"✓ "}
.pc-error{margin-top:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.pc-dialog-error{flex:1 1 100%;margin:0}
.pc-kind-form>.pc-output:not(:empty),.pc-kind-button>.pc-output:not(:empty){margin-top:12px;animation:craft-rise var(--dur-arrive) var(--ease-quint)}
.pc-inspect{color:var(--blue);background:transparent;border:0;font:12px/1.4 inherit;cursor:pointer;padding:4px}.pc-node[data-inspected=true]{outline:1px solid var(--blue);outline-offset:7px}
@container (max-width:560px){.pc-app-head h1{font-size:20px}.pc-mark{width:40px;height:40px}.pc-stat>dd{font-size:20px}.pc-page{gap:16px}.pc-directory>.pc-record{flex-wrap:wrap}.pc-directory>.pc-record>.pc-row-actions{padding:0 12px 12px}.pc-search,.pc-filter-item:has(.pc-search){max-width:none}.pc-card-grid{grid-template-columns:1fr}.pc-agenda-day{grid-template-columns:48px minmax(0,1fr)}}
@media (prefers-reduced-motion:reduce){.pc-view *{animation:none!important;transition:none!important}}
` + PLUGIN_PRESENTATION_STYLES;
