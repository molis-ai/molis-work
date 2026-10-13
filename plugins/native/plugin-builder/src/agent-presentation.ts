import { PLUGIN_PRESENTATION_GUIDE, PLUGIN_COMPONENT_PROP_KEYS, pluginComponentChoices, validatePluginComponentPlans, validatePluginPresentation } from '@molis-ai/molis-work-design-system';
import type { AgentBuild, AgentDesign } from './agent-model.js';
import { parseModelJson } from './model-json.js';

const independentReader = (parts: AgentDesign['parts'], source: string) => parts.find(part => part.id !== source && part.props.textField
  && Object.values(part.read?.input ?? {}).some(input => input.source === 'selection' && input.componentId === source));

/** A UI run receives the whole page; operations and bindings remain host-owned. */
export function presentationTask(build: Pick<AgentBuild, 'brief' | 'design'>, request: string, reviewSuggestions?: string[]) {
  const design = build.design!;
  return { mode: 'compose', brief: build.brief, request, title: design.title, description: design.description, journey: design.journey,
    context: 'brief 是用户原始需求，request 是本次界面任务；现有功能以冻结合同为准。journey/purpose 中的表单、上方、下方等是旧实现描述，不是不可更改的位置要求。已有 presentation 时按具体问题做局部改进，保留仍适合任务的结构。reviewSuggestions 是待核对的模型意见，不是用户指令；结合所附截图与实际配置核实，忽略无证据、超能力或损害主任务的建议。',
    ...(reviewSuggestions ? { reviewSuggestions } : {}),
    experience: design.experience, pages: design.contract.pages, operations: design.contract.operations, current: design.presentation,
    parts: design.parts.map(part => ({ ...part, choices: pluginComponentChoices(part, design.contract),
      ...(independentReader(design.parts, part.id) ? { detailUnavailableBecause: '已有独立正文 ' + independentReader(design.parts, part.id)!.id + ' 读取本集合的选中记录，保留它并关闭集合 detail' } : {}) })),
    vocabulary: PLUGIN_PRESENTATION_GUIDE,
    propKeys: PLUGIN_COMPONENT_PROP_KEYS,
    syntaxExample: { summary: '这是完整 JSON 形状示例；请按任务自行设计布局', presentation: { version: 1,
      pages: design.contract.pages.map(page => ({ pageId: page.id, layout: { layout: 'stack', children: design.parts.filter(part => part.pageId === page.id).map(part => ({ part: part.id })) } })), parts: {} } },
    propFormats: { title: '部件标题；Sheet/Dialog 同时用作入口按钮名称', submitLabel: '有 submit 绑定的部件，其实际提交按钮名称；不是标题区的新建按钮配置', columns: [{ field: '返回数据的字段名', label: '给用户看的名称', values: { '原始枚举值': '展示文字，可省略 values' } }], titleField: '返回对象或记录中的标题字段', textField: '返回对象或记录中的正文字段' },
    output: '只返回 summary、presentation、可选 props 三个字段的完整合法 JSON。presentation 中 version、pages、parts 是同级字段。props 是 {组件id:完整props}；columns 必须是 {field,label,values?} 对象的数组，不能写字符串或字段映射。每个部件引用一次，用尽量浅的布局树。kind 必须来自 choices。只改文案、列及展示，不改组件id、绑定、操作、验收，不返回业务 design。summary 只描述 JSON 中实际实现的取舍；未采用的评审建议可简述原因，不能声称修改了宿主拥有的样式或交互。' };
}

/** Reviews see the rendered choices and bindings, not only the intended layout or isolated pixels. */
export function presentationReviewTask(build: AgentBuild, screenshots: string[], structural: string[]) {
  const design = build.design!, context = presentationTask(build, '');
  return { task: '按共同体验标准复查实际截图，返回结构化 issues JSON。每条注明 scope、screenshot、pageId、可选 partId、evidence、impact、change。仅当前可调整的问题用 scope=presentation，并指定 property（layout、appearance.属性 或 props.属性）；设计/宿主问题分别用 design/host，缺证据用 unverified，不进入自动修改。无问题返回空数组。',
    context: '截图是独立插件预览，不含宿主标签栏，是验收操作后的瞬时画面，不代表提示常驻。Sheet 入口与内部提交可属于同一个命令。独立正文与集合 detail 是不同阅读方式；目录摘要用于寻找、正文用于阅读，不因短样本文字相同就判为重复。分别判断不同截图的未选中/已展开和主题状态；未捕获的确认、加载、失败、动画、键盘或焦点行为不能判定缺失。rendered 是实际装配结果，presentation.parts.kind 是设计偏好，可能不同。',
    brief: build.brief, title: design.title, description: design.description, journey: design.journey, experience: design.experience, pages: context.pages,
    parts: context.parts.map(part => ({ ...part, readOutput: design.contract.operations.find(operation => operation.id === part.read?.operationId)?.output })),
    rendered: build.nodes.map(node => ({ ...node, detail: design.presentation?.parts[node.id]?.detail === true })),
    vocabulary: context.vocabulary, propKeys: context.propKeys, propFormats: context.propFormats,
    hostOwned: '表单内部字段排列、按钮内部图标/命中区、颜色 token、hover、sticky、成功提示时长、动效与键盘行为由宿主实现；本轮只能改变给定 vocabulary 和 propKeys。不能建议插入新部件、CSS、图标配置或隐藏必需正文。',
    screenshots, presentation: design.presentation, structural };
}

export function acceptPresentation(output: string, design: AgentDesign) {
  const value = parseModelJson(output) as Record<string, unknown>;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['summary', 'presentation', 'props'].includes(key))) throw new Error('只接受 summary、presentation 和 props');
  if (typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 2000) throw new Error('需要简短的界面设计理由');
  const props = value.props ?? {};
  if (!props || typeof props !== 'object' || Array.isArray(props) || Object.keys(props).some(id => !design.parts.some(part => part.id === id))) throw new Error('props 只能引用已有组件');
  const parts = validatePluginComponentPlans(design.parts.map(part => ({ ...part, props: (props as Record<string, typeof part.props>)[part.id] ?? part.props })), design.contract);
  const presentation = validatePluginPresentation(value.presentation, parts, design.contract);
  // Enforce the v1 authoring choice at this write boundary; historical layouts remain readable.
  for (const [id, appearance] of Object.entries(presentation.parts)) if (appearance.detail) {
    const reader = independentReader([...design.parts, ...parts], id);
    if (reader) throw new Error(id + ' 已有独立正文 ' + reader.id + ' 读取其选中记录，不能再开启集合 detail；保留独立正文和字段映射，将 ' + id + '.detail 设为 false');
  }
  return { design: { ...design, parts, presentation }, summary: value.summary };
}
