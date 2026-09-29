import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { pluginComponentChoices, type PluginComponentPlan } from './plugin-components.js';

/** A renderer contract requirement, not a callable business capability. */
export const PLUGIN_PRESENTATION_CAPABILITY = { capability_id: 'ui.plugin-presentation', version: 1 } as const;

/** Presentation references existing parts; it never duplicates operations or grants authority. */
export type PluginLayout = { part: string } | {
  layout: 'stack' | 'split' | 'grid';
  gap?: 'tight' | 'normal' | 'roomy';
  ratio?: 'equal' | 'main-left' | 'main-right';
  children: PluginLayout[];
};
export interface PluginPartAppearance {
  kind?: string;
  density?: 'compact' | 'normal' | 'reading';
  measure?: 'full' | 'reading';
  emphasis?: 'primary' | 'secondary';
  /** The collection also presents its selected record in a reading pane. */
  detail?: boolean;
}
export interface PluginPresentation {
  version: 1;
  pages: Array<{ pageId: string; layout: PluginLayout }>;
  parts: Record<string, PluginPartAppearance>;
}

const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const error = (reason: string): never => { throw new Error('页面设计无效：' + reason); };
const keys = (value: Record<string, unknown>, allowed: string[]) => { for (const key of Object.keys(value)) if (!allowed.includes(key)) error('不支持属性 ' + key); };
const option = (value: unknown, values: readonly unknown[], name: string) => { if (value !== undefined && !values.includes(value)) error(name + ' 应为 ' + values.join('/')); };

/** Strict at the model boundary; old designs simply have no presentation. */
export function validatePluginPresentation(value: unknown, parts: readonly PluginComponentPlan[], contract: SandboxPluginContract): PluginPresentation {
  if (!plain(value)) return error('需要完整对象');
  keys(value, ['version', 'pages', 'parts']);
  if (value.version !== 1) return error('不支持的呈现版本');
  if (!Array.isArray(value.pages) || value.pages.length !== contract.pages.length || !plain(value.parts)) return error('每个页面需要一个布局和 parts 配置');
  const pageIds = new Set<string>(), referenced = new Set<string>();
  let count = 0;
  function visit(node: unknown, pageId: string, depth: number): void {
    if (!plain(node)) return error('每个布局节点必须是对象；引用写成 {"part":"组件id"}，不能直接写组件id字符串');
    if (depth > 8 || ++count > 300) return error('布局过深或节点过多');
    if ('part' in node) {
      keys(node, ['part']);
      const part = parts.find(part => part.id === node.part);
      if (!part || part.pageId !== pageId || referenced.has(part.id)) return error('组件引用不存在、跨页或重复：' + String(node.part));
      referenced.add(part.id); return;
    }
    keys(node, ['layout', 'gap', 'ratio', 'children']);
    if (!['stack', 'split', 'grid'].includes(String(node.layout))) return error('布局只支持 stack/split/grid');
    option(node.gap, ['tight', 'normal', 'roomy'], 'gap'); option(node.ratio, ['equal', 'main-left', 'main-right'], 'ratio');
    if (node.ratio && node.layout !== 'split') return error('只有 split 使用 ratio');
    if (!Array.isArray(node.children) || !node.children.length || (node.layout === 'split' && node.children.length !== 2)) return error('布局需要子节点，split 恰好两组');
    for (const child of node.children) visit(child, pageId, depth + 1);
  }
  for (const page of value.pages) {
    if (!plain(page)) return error('页面需要对象');
    keys(page, ['pageId', 'layout']);
    if (typeof page.pageId !== 'string' || pageIds.has(page.pageId) || !contract.pages.some(item => item.id === page.pageId)) return error('页面标识无效或重复');
    pageIds.add(page.pageId); visit(page.layout, page.pageId, 0);
  }
  if (referenced.size !== parts.length) return error('布局遗漏组件：' + parts.filter(part => !referenced.has(part.id)).map(part => part.id).join('、'));
  const primary = new Set<string>();
  for (const [id, raw] of Object.entries(value.parts)) {
    const part = parts.find(part => part.id === id);
    if (!part || !plain(raw)) return error('组件配置不存在：' + id);
    keys(raw, ['kind', 'density', 'measure', 'emphasis', 'detail']);
    option(raw.density, ['compact', 'normal', 'reading'], 'density'); option(raw.measure, ['full', 'reading'], 'measure');
    option(raw.emphasis, ['primary', 'secondary'], 'emphasis'); option(raw.detail, [true, false], 'detail');
    if (raw.kind !== undefined && !pluginComponentChoices(part, contract).some(choice => choice.kind === raw.kind)) return error(id + ' 不支持组件 ' + String(raw.kind));
    if (raw.emphasis === 'primary') {
      if (!part.submit || primary.has(part.pageId)) return error('每页最多一个主操作，且必须绑定命令');
      primary.add(part.pageId);
    }
    if (raw.detail && (part.intent !== 'collection' && part.intent !== 'reading' || !part.read || !part.props.idField)) return error('详情只能来自有稳定 id 和读取绑定的集合');
  }
  return value as unknown as PluginPresentation;
}

/** Shared authoring vocabulary, included beside the actual component catalog. */
export const PLUGIN_PRESENTATION_GUIDE = {
  version: 1,
  layout: 'pages: [{pageId, layout}]; layout 是 {part: 组件id} 或 {layout: stack|split|grid, gap?: tight|normal|roomy, ratio?: equal|main-left|main-right, children: [layout]}。split 恰好两组：equal 左右 1:1，main-left 第一组占 2/3，main-right 第二组占 2/3；按主内容所在组选择，不按组件排列先后猜主次。窄屏按 children 顺序堆叠。每个组件恰好引用一次，包括记录操作；不能新增 divider 等部件。',
  appearance: 'parts: {组件id: {kind?: 合法候选, density?: compact|normal|reading, measure?: full|reading, emphasis?: primary|secondary, detail?: boolean}}。detail 给集合增加选中记录的正文面，窄屏进入详情后可返回。每页最多一个 primary 命令。',
  controls: {
    overlayLabels: 'Sheet/Dialog 的入口按钮和面板标题取该输入部件 props.title，未设置才取 submitLabel；面板内提交只取 submitLabel。例如 editor.title=写一条摘记，editor.submitLabel=保存摘记。heading 的 submitLabel 不创建任何按钮；引导和空态应引用真实入口名称。',
    recordActions: '宿主将记录动作放到每条记录上；点击行内动作会先选中被点击的记录，再执行绑定或打开确认。因此 selection 输入不要求用户先点选择按钮。G7 中 select 是定位目标记录，不能据此推断用户必须两步操作。',
    readingPreview: '组合 Directory 有内置详情或独立正文读取其选中记录时，目录正文最多两行、合并视觉空白；完整内容保留在阅读面。没有全文路径则不裁切。单篇正文保留段落。',
    feedback: '宿主在操作返回后显示短暂的已保存/已删除/已完成反馈，约 3.4 秒清除，减少动效时也清除。这不是记录状态字段，截图可能正好捕获它。',
  },
  principles: '先决定人在看什么、主操作在哪里，再组合区域。阅读正文占主区，录入可用 sheet/dialog 收起。已有正文部件时，目录不再开启 detail；摘要不当全文。单篇文章返回对象时，必须配置 titleField/textField/columns，避免把文章字段画成统计卡片。快速动作重紧凑与反馈，比较数据重对齐。只用主题 token；不要为装饰堆卡片或重复宿主标题。',
} as const;
