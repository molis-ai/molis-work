/**
 * Labelled stand-in models for the agent-built plugin studio. Only the models are replaced: the designer proposes two
 * note-taking plugins and the code agent writes a real implementation and tests, which the real gates then check.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BuilderAgentRecord, BuilderAgentRequest } from '@molis-ai/molis-work-contracts/services/agent-host';
import type { AgentBuild } from '@molis-ai/molis-work-plugin-builder';

let delay = 1;
const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (!ms || !delay) { resolve(); return; }
  const timer = setTimeout(resolve, ms * delay); signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new Error('stopped')); }, { once: true });
});
/** Stage one: two product-level proposals in the designer's authoring format. */
function proposal(id: string, title: string, description: string, collection: string, rationale: string) {
  return { id, title, description, rationale, journey: ['写下一条笔记', '在' + collection + '里看到它', '回来时从最新的开始看'],
    operations: [
      { id: 'notes.list', kind: 'query', description: '列出笔记（最新在前）', input: {}, output: [{ id: 'string', text: 'string' }] },
      { id: 'notes.add', kind: 'command', description: '保存一条笔记', input: { text: 'string(1..500) 笔记' }, output: { id: 'string' } },
    ],
    pages: [{ id: 'home', title, parts: [
      { id: 'title', intent: 'heading', purpose: '说明这个插件' },
      { id: 'editor', intent: 'input', purpose: '写一条笔记', uses: 'notes.add' },
      { id: 'notes', intent: 'collection', purpose: '浏览笔记', uses: 'notes.list' },
    ] }] };
}
const PROPOSALS = [
  proposal('quick', '随手记', '想到就写，最新的在最上面。', '列表', '录入最短：一个输入框加一个按时间倒序的列表。'),
  proposal('board', '笔记墙', '把笔记摊开成卡片，方便一眼扫过。', '卡片墙', '适合回看：卡片并排，扫读更快。'),
];
const DESIGN = JSON.stringify({ summary: '两个方向：录入最快的列表，和便于回看的卡片墙。', candidates: PROPOSALS });
/** Stage two: the chosen proposal in full. */
function detail(chosen: string, title?: string) {
  const base = PROPOSALS.find(item => item.id === chosen) ?? PROPOSALS[0]!, name = title ?? base.title;
  return JSON.stringify({ summary: '细化「' + name + '」：四项功能、五个组件、四条验收。', design: { title: name, description: base.description, journey: base.journey,
    operations: [
      { id: 'notes.list', kind: 'query', description: '列出笔记（最新在前）', input: {}, output: [{ id: 'string', text: 'string', 'expansion?': 'string' }], effects: { storage: ['read'] }, examples: [{ input: {}, output: [] }] },
      { id: 'notes.add', kind: 'command', description: '保存一条笔记', input: { text: 'string(1..500) 笔记' }, output: { id: 'string' }, effects: { storage: ['read', 'write'] }, examples: [{ input: { text: '第一条笔记' }, includes: {} }] },
      { id: 'notes.remove', kind: 'command', description: '删除一条笔记', input: { id: 'string' }, output: { removed: 'boolean' }, effects: { storage: ['read', 'write'] }, examples: [{ input: { id: 'missing' }, output: { removed: false } }] },
      { id: 'notes.expand', kind: 'command', description: '让模型把一条笔记展开成具体的说明', input: { id: 'string' }, output: { id: 'string', expansion: 'string' }, effects: { storage: ['read', 'write'], capabilities: ['model.generate'] }, errors: [{ code: 'not_found', description: '笔记不存在' }], examples: [{ input: { id: 'missing' }, error: 'not_found' }] },
    ],
    pages: [{ id: 'home', title: name, parts: [
      { id: 'title', intent: 'heading', purpose: '说明这个插件', props: { title: name, description: base.description } },
      { id: 'editor', intent: 'input', purpose: '写一条笔记', props: { submitLabel: '保存' }, submit: 'notes.add' },
      { id: 'notes', intent: 'collection', purpose: '浏览笔记', props: { title: '全部笔记', idField: 'id', titleField: 'text', columns: [{ field: 'expansion', label: '展开' }], emptyText: '还没有笔记，写下第一条吧。' }, read: 'notes.list' },
      { id: 'expand', intent: 'action', purpose: '让模型展开一条笔记', props: { submitLabel: '展开' }, submit: { op: 'notes.expand', input: { id: 'selection:notes.id' } } },
      { id: 'remove', intent: 'action', purpose: '删除一条笔记', props: { submitLabel: '删除' }, submit: { op: 'notes.remove', input: { id: 'selection:notes.id' } } },
    ] }],
    acceptance: [{ id: 'write-and-see', description: '写下一条笔记后立刻能看到', steps: ['fill editor.text = 今天学到了间隔复习', 'submit editor', 'expect notes 今天学到了间隔复习'] },
      // Runs after a case that wrote data: passes only because every case starts from an empty preview.
      { id: 'empty', description: '没有笔记时给出提示', steps: ['page home', 'reload', 'expect notes 还没有笔记，写下第一条吧。'] },
      { id: 'expand', description: '模型把一条笔记展开（验收时由替身代答）', steps: ['fill editor.text = 间隔复习', 'submit editor', 'select notes 间隔复习', 'submit expand', 'expect notes ［模型替身］间隔复习'] },
      { id: 'remove', description: '删掉写错的一条', steps: ['fill editor.text = 留着这条', 'submit editor', 'fill editor.text = 写错了', 'submit editor', 'select notes 写错了', 'submit remove', 'expect-not notes 写错了', 'expect notes 留着这条'] }] } });
}
/** A real implementation for each fixture operation; the gates check it like any agent's code. */
const CODE: Record<string, { source: string; tests: string }> = {
  'notes.list': {
    source: `import type { SandboxJson, SandboxSdk } from '@molis/plugin-sdk';
export default async function operation(_input: SandboxJson, sdk: SandboxSdk): Promise<SandboxJson> {
  const rows = await sdk.storage.list('note:');
  return rows.sort((a, b) => (a.key < b.key ? 1 : -1)).map(row => row.value);
}
`,
    tests: `import type { SandboxTest } from '@molis/plugin-sdk';
export const tests: SandboxTest[] = [
  async (_sdk, call, assert) => { assert.same(await call({}), []); },
];
`,
  },
  'notes.add': {
    source: `import type { SandboxJson, SandboxSdk } from '@molis/plugin-sdk';
export default async function operation(input: SandboxJson, sdk: SandboxSdk): Promise<SandboxJson> {
  const { text } = input as { text: string };
  const count = await sdk.storage.get('count');
  const next = (typeof count === 'number' ? count : 0) + 1;
  await sdk.storage.set('count', next);
  const id = 'n' + String(next).padStart(6, '0');
  await sdk.storage.set('note:' + id, { id, text: text.trim() });
  return { id };
}
`,
    tests: `import type { SandboxTest } from '@molis/plugin-sdk';
export const tests: SandboxTest[] = [
  async (sdk, call, assert) => {
    assert.includes(await call({ text: '  第一条  ' }), { id: 'n000001' });
    assert.same(await sdk.storage.get('note:n000001'), { id: 'n000001', text: '第一条' });
  },
];
`,
  },
  'notes.expand': {
    source: `import type { SandboxJson, SandboxSdk } from '@molis/plugin-sdk';
export default async function operation(input: SandboxJson, sdk: SandboxSdk): Promise<SandboxJson> {
  const { id } = input as { id: string };
  const note = await sdk.storage.get('note:' + id) as { id: string; text: string } | null;
  if (!note) throw Object.assign(new Error('笔记不存在'), { code: 'not_found' });
  const { text } = await sdk.capability.call('model.generate', { instructions: '把这条笔记展开成一两句具体的说明', input: note.text }) as { text: string };
  await sdk.storage.set('note:' + id, { ...note, expansion: text });
  return { id, expansion: text };
}
`,
    tests: `import type { SandboxTest } from '@molis/plugin-sdk';
export const tests: SandboxTest[] = [
  async (sdk, call, assert) => {
    await sdk.storage.set('note:n000001', { id: 'n000001', text: '间隔复习' });
    assert.same(await call({ id: 'n000001' }), { id: 'n000001', expansion: '［模型替身］间隔复习' });
    await assert.rejectsCode(() => call({ id: 'missing' }), 'not_found');
  },
];
`,
  },
  'notes.remove': {
    source: `import type { SandboxJson, SandboxSdk } from '@molis/plugin-sdk';
export default async function operation(input: SandboxJson, sdk: SandboxSdk): Promise<SandboxJson> {
  const { id } = input as { id: string };
  const key = 'note:' + id;
  if ((await sdk.storage.get(key)) === null) return { removed: false };
  await sdk.storage.delete(key);
  return { removed: true };
}
`,
    tests: `import type { SandboxTest } from '@molis/plugin-sdk';
export const tests: SandboxTest[] = [
  async (sdk, call, assert) => {
    await sdk.storage.set('note:n000001', { id: 'n000001', text: '写错了' });
    assert.same(await call({ id: 'n000001' }), { removed: true });
    assert.same(await sdk.storage.get('note:n000001'), null);
    assert.same(await call({ id: 'n000001' }), { removed: false });
  },
];
`,
  },
};
export const FIXTURE_MODEL = '预览替身 · 固定输出，非真实模型';
function record(request: BuilderAgentRequest, output: string): BuilderAgentRecord {
  const now = new Date().toISOString();
  return { id: randomUUID(), role: request.role, promptVersion: request.promptVersion, contractRevision: request.contractRevision, instruction: request.instruction,
    input: request.task, output, configuredModel: FIXTURE_MODEL, reportedModels: [], phase: 'completed', startedAt: now, finishedAt: now, activity: [], usage: [] };
}
async function fixtureAgent(build: AgentBuild) {
  return {
    async run(request: BuilderAgentRequest): Promise<BuilderAgentRecord> {
      if (request.role === 'designer') {
        const task = JSON.parse(request.task) as { mode: string; proposal?: { id: string }; current?: { title?: string }; request?: string };
        await pause(task.mode === 'propose' ? 1400 : 1800, request.signal);
        if (task.mode === 'propose') return record(request, DESIGN);
        if (task.mode === 'detail') return record(request, detail(task.proposal?.id ?? 'quick'));
        // A labelled stand-in revision: only the name changes, so working code and parts are kept.
        const named = /改成[「“"]?([^」”"，。]+)/.exec(task.request ?? '')?.[1];
        return record(request, detail(PROPOSALS.find(item => item.title === task.current?.title)?.id ?? 'quick', named ?? task.current?.title));
      }
      const task = JSON.parse(request.task) as { implementation: string; tests: string };
      for (const id of request.operationIds ?? []) {
        const code = CODE[id]; if (!code || !build.directory) throw new Error('替身只会写示例笔记插件的操作');
        await pause(900, request.signal);
        await mkdir(join(build.directory, 'src', 'operations'), { recursive: true });
        await writeFile(join(build.directory, task.implementation), code.source);
        request.onActivity?.({ type: 'file', name: 'write', path: task.implementation, detail: task.implementation });
        await pause(500, request.signal);
        await writeFile(join(build.directory, task.tests), code.tests);
        request.onActivity?.({ type: 'file', name: 'write', path: task.tests, detail: task.tests });
        const result = await request.checks?.([id], request.signal ?? new AbortController().signal);
        request.onActivity?.({ type: 'check', name: 'plugin-checks', detail: JSON.stringify(result).slice(0, 400) });
      }
      return record(request, 'implemented');
    },
    async close() {}, async records() { return []; },
  };
}

/** `pace` scales the stand-in model latency; 0 answers at once (tests), 1 feels like a real run (preview). */
export function agentStudioFixture(pace = 1) {
  delay = pace;
  return {
    models: async () => [{ provider_id: 'fixture', model_id: 'fixture-prologue', label: FIXTURE_MODEL }],
    /** Stands in for the person's real model when they try or use the plugin; checks and acceptance use the catalog stand-in. */
    generate: async (_pluginId: string, input: { instructions: string; input: string }) => { await pause(600); return { text: '（预览替身模型）' + input.input + '：先回忆，再对照。' }; },
    agents: (build: AgentBuild) => fixtureAgent(build),
    choice: { selectionAvailable: () => true, async choose(question: { candidates: readonly { key: string }[] }) {
      await pause(700);
      const keys = question.candidates.map(item => item.key);
      return { choice: keys.includes('cards') ? 'cards' : keys[0]!, model: 'fixture-jev（预览替身）', elapsedMs: 700, confidence: 0.8 };
    } },
  };
}
