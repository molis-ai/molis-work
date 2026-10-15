import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';

export function memoryStorage(): PluginPrivateStorage {
  const values = new Map<string, string>();
  return {
    get: key => values.get(key) ?? null,
    set: (key, value) => { values.set(key, value); },
    delete: key => values.delete(key),
    compareAndSet: (key, expected, value) => { if ((values.get(key) ?? null) !== expected) return false; values.set(key, value); return true; },
  };
}

export function proposal(id: string, title: string) {
  return { id, title, description: '记下想法并随时回看', rationale: '最短的录入与浏览路径', journey: ['写一条笔记', '在列表里看到它'],
    operations: [
      { id: 'notes.list', kind: 'query', description: '列出笔记', input: {}, output: [{ id: 'string', text: 'string' }] },
      { id: 'notes.add', kind: 'command', description: '添加笔记', input: { text: 'string(1..200) 笔记' }, output: { id: 'string' } },
    ],
    pages: [{ id: 'home', title, parts: [
      { id: 'title', intent: 'heading', purpose: '说明插件' },
      { id: 'editor', intent: 'input', purpose: '写一条笔记', uses: 'notes.add' },
      { id: 'notes', intent: 'collection', purpose: '浏览笔记', uses: 'notes.list' },
    ] }] };
}

export function detail(title: string) {
  return JSON.stringify({ summary: '细化完成', design: { title, description: '记下想法并随时回看', journey: ['写一条笔记', '在列表里看到它'],
    operations: [
      { id: 'notes.list', kind: 'query', description: '列出笔记', input: {}, output: [{ id: 'string', text: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
      { id: 'notes.add', kind: 'command', description: '添加笔记', input: { text: 'string(1..200) 笔记' }, output: { id: 'string' }, effects: { storage: ['write'] }, examples: [{ input: { text: '第一条' }, includes: {} }] },
    ],
    pages: [{ id: 'home', title, parts: [
      { id: 'title', intent: 'heading', purpose: '说明插件', props: { title } },
      { id: 'editor', intent: 'input', purpose: '写一条笔记', props: { submitLabel: '添加' }, submit: 'notes.add' },
      { id: 'notes', intent: 'collection', purpose: '浏览笔记', props: { idField: 'id', titleField: 'text' }, read: 'notes.list' },
    ] }],
    acceptance: [{ id: 'add-note', description: '添加后能在列表里看到', steps: ['fill editor.text = hello', 'submit editor', 'expect notes hello'] }] } });
}

export function experience() {
  const sketch = proposal('quick', '快记');
  return JSON.stringify({ summary: '以浏览已有内容为主，随手录入不中断浏览', journey: sketch.journey, pages: sketch.pages,
    scenarios: [{ task: '写入后继续浏览', content: '先读《理解媒介》，再记下一个问题。', expected: '保存后能找到记录并继续新建' }] });
}

export function finding(change = '调整密度', screenshot = 'sample') {
  return { scope: 'presentation', screenshot, pageId: 'home', partId: 'notes', evidence: '正文排列过密', impact: '难以连续阅读', property: 'appearance.density', change };
}

export function detailUsing(title: string, capability?: string) {
  const answer = JSON.parse(detail(title));
  if (capability) answer.design.operations[1].effects.capabilities = [capability];
  return JSON.stringify(answer);
}

export function proposalsUsing(capability: string) {
  const answer = JSON.parse(PROPOSALS);
  for (const candidate of answer.candidates) { candidate.operations[1].description = '给目标写一句本周进展'; candidate.operations[1].effects = { storage: ['write'], capabilities: [capability] }; }
  return JSON.stringify(answer);
}

export function detailWithFour(title: string) {
  const answer = JSON.parse(detail(title));
  answer.design.operations.push(
    { id: 'notes.count', kind: 'query', description: '统计笔记', input: {}, output: { count: 'integer' }, effects: { storage: ['read'] }, examples: [{ input: {}, output: { count: 0 } }] },
    { id: 'notes.latest', kind: 'query', description: '最新一条', input: {}, output: [{ id: 'string', text: 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] });
  answer.design.pages[0].parts.push({ id: 'count', intent: 'description', purpose: '笔记数', read: 'notes.count' }, { id: 'latest', intent: 'collection', purpose: '最新', read: 'notes.latest', props: { idField: 'id', titleField: 'text' } });
  return JSON.stringify(answer);
}

export function composition(gap = 'roomy') {
  return JSON.stringify({ summary: '先浏览内容，新建收进侧栏', presentation: { version: 1, pages: [{ pageId: 'home', layout: { layout: 'stack', gap, children: [{ part: 'title' }, { part: 'notes' }, { part: 'editor' }] } }], parts: { notes: { kind: 'directory', density: 'reading', detail: true }, editor: { kind: 'sheet', emphasis: 'primary' } } } });
}

export const PROPOSALS = JSON.stringify({ summary: '两种录入方式', candidates: [proposal('quick', '快记'), proposal('board', '笔记板')] });

export const CAPABILITY_WORDS = '只从合法候选中选最适合这项功能的一个能力；同样合适时选已经启用的、主线设计原本选的。';

export const COMPONENT_WORDS = '结合整页布局与相邻部件，从合法候选中选择组件。优先保留界面设计的偏好，不破坏主次与交互，不改变属性或合同。';

export async function until<Build extends { phase: string; error?: string | null }>(workflow: { store: { require(id: string): Build } }, id: string, done: (build: Build) => boolean, timeoutMs = 5_000): Promise<Build> {
  const started = Date.now();
  for (;;) {
    const build = workflow.store.require(id);
    if (done(build)) return build;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out in phase ${build.phase}: ${build.error ?? ''}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

export const GOALS_CATALOG = [
  { id: 'goals.note', title: '记录目标便笺', source: 'Goals', description: '在目标上附一条便笺', effect: 'write', input: { type: 'object' } },
  { id: 'goals.progress.record', title: '记录目标进展', source: 'Goals', description: '记录目标的一次进展', effect: 'write', input: { type: 'object' } },
  { id: 'goals.list', title: '目标目录', source: 'Goals', description: '列出项目目标', effect: 'read', input: { type: 'object' } },
  { id: 'goals.archive.set', title: '设置目标归档状态', source: 'Goals', description: '归档或恢复目标', effect: 'write', input: { type: 'object' } },
  { id: 'pages.list', title: '文档列表', source: 'Pages', description: '列出文稿', effect: 'read', input: { type: 'object' } },
  { id: 'inbox.entry.status', title: '更新事项状态', source: 'Inbox', description: '按版本更新事项', effect: 'write', input: { type: 'object' } },
  // A project's directory is large; common words weigh little against it.
  ...Array.from({ length: 40 }, (_, index) => ({ id: 'alchemist.item' + index, title: '记录一条炼金素材 ' + index, source: '炼金术士', description: '素材', effect: 'write', input: { type: 'object' } })),
];
