import type { PluginComponentNode } from './plugin-components.js';
import type { PluginPresentation } from './plugin-presentation.js';
import { PLUGIN_COMPONENT_STYLES } from './plugin-components.js';
import { PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT } from './plugin-component-program.js';
import { resolveCatalogSay, type CatalogSay } from './primitives/catalog-parts.js';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';

// Static zh test-fixture exports kept intact for tests/fixtures/plugin-composition.ts (imported outside workbench locale context).
// `/__ui/catalog` renders exclusively via `buildReading*(say)` in `renderPluginPresentationExample(say)`.
export const readingContract: SandboxPluginContract = {
  version: /* @version format.sandbox.contract */ 1, pluginId: 'test.reading', revision: "reading-v1", entities: [], acceptance: [],
  pages: [{ id: 'home', title: '阅读摘记', regions: [{ id: 'main', title: '摘记', operationIds: ['notes.list', 'notes.add', 'notes.remove'] }] }],
  operations: [
    { id: 'notes.list', kind: 'query', input: { type: 'object', properties: { query: { type: 'string', description: '摘记' } } }, output: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' }, source: { type: 'string' } } } }, effects: {}, examples: [], errors: [] },
    { id: 'notes.add', kind: 'command', input: { type: 'object', properties: { title: { type: 'string', description: '标题', maxLength: 100 }, text: { type: 'string', description: '摘记正文', maxLength: 4000 }, source: { type: 'string', description: '来源' } }, required: ['title', 'text'] }, output: { type: 'object' }, effects: {}, examples: [], errors: [] },
    { id: 'notes.remove', kind: 'command', input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, output: { type: 'object' }, effects: {}, examples: [], errors: [] },
  ],
};
export const readingNodes: PluginComponentNode[] = [
  { id: 'heading', pageId: 'home', regionId: 'main', intent: 'heading', purpose: '读过的文字，留下自己的想法', props: { title: '阅读摘记', description: '读过的文字，留下自己的想法' }, kind: 'frame' },
  { id: 'notes', pageId: 'home', regionId: 'main', intent: 'collection', purpose: '浏览与阅读摘记', props: { titleField: 'title', textField: 'text', idField: 'id', emptyText: '还没有摘记，写下第一段触动你的文字', columns: [{ field: 'source', label: '来源' }] }, kind: 'directory', read: { operationId: 'notes.list', input: { query: { source: 'form', field: 'query' } } } },
  { id: 'editor', pageId: 'home', regionId: 'main', intent: 'input', purpose: '新建摘记', props: { title: '新建摘记', submitLabel: '保存摘记' }, kind: 'sheet', submit: { operationId: 'notes.add', input: { title: { source: 'form', field: 'title' }, text: { source: 'form', field: 'text' }, source: { source: 'form', field: 'source' } } } },
  { id: 'remove', pageId: 'home', regionId: 'main', intent: 'action', purpose: '删除摘记', props: { submitLabel: '删除这条摘记' }, kind: 'alert-dialog', submit: { operationId: 'notes.remove', input: { id: { source: 'selection', componentId: 'notes', field: 'id' } } } },
];
export const readingPresentation: PluginPresentation = {
  version: /* @version format.plugin.presentation */ 1, pages: [{ pageId: 'home', layout: { layout: 'stack', gap: 'roomy', children: readingNodes.map(node => ({ part: node.id })) } }],
  parts: { notes: { detail: true, density: 'reading', kind: 'directory' }, editor: { kind: 'sheet', emphasis: 'primary' }, remove: { kind: 'alert-dialog' } },
};
export const readingSamples = [
  { id: 'one', title: '把注意力放回眼前的事', source: '阅读札记 · 注意力', text: '一段完整的时间，比许多零碎的空隙更适合深入思考。\n\n今天试着把手机放到另一个房间，只留书、纸和一杯水。读到一半时，想查资料的冲动来了三次。我把问题写在纸边，继续往下读。\n\n等到这一章结束，那些问题有两个已经自己找到了答案。值得保留的习惯：先走完一段路，再回头补地图。' },
  { id: 'two', title: '散步之后，问题变小了', source: '阅读札记 · 日常', text: '把难题暂时留在桌上，出门走一圈。回来时，先写下最小的一步。' },
  { id: 'three', title: '设计也需要安静的地方', source: '阅读札记 · 设计', text: '层次来自每个元素各有位置。留白让相邻的想法可以被分开理解。' },
];

function buildReadingContract(say: CatalogSay): SandboxPluginContract {
  const notes = say('workbench.catalog-board.ex.pp-notes');
  return {
    ...readingContract,
    pages: [{ id: 'home', title: say('workbench.catalog-board.ex.pp-title'), regions: [{ id: 'main', title: notes, operationIds: ['notes.list', 'notes.add', 'notes.remove'] }] }],
    operations: [
      { id: 'notes.list', kind: 'query', input: { type: 'object', properties: { query: { type: 'string', description: notes } } }, output: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' }, source: { type: 'string' } } } }, effects: {}, examples: [], errors: [] },
      { id: 'notes.add', kind: 'command', input: { type: 'object', properties: { title: { type: 'string', description: say('workbench.catalog-board.ex.pp-field-title'), maxLength: 100 }, text: { type: 'string', description: say('workbench.catalog-board.ex.pp-field-text'), maxLength: 4000 }, source: { type: 'string', description: say('workbench.catalog-board.ex.pp-field-source') } }, required: ['title', 'text'] }, output: { type: 'object' }, effects: {}, examples: [], errors: [] },
      { id: 'notes.remove', kind: 'command', input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, output: { type: 'object' }, effects: {}, examples: [], errors: [] },
    ],
  };
}

function buildReadingNodes(say: CatalogSay): PluginComponentNode[] {
  const title = say('workbench.catalog-board.ex.pp-title');
  const subtitle = say('workbench.catalog-board.ex.pp-subtitle');
  const newNote = say('workbench.catalog-board.ex.pp-new-note');
  return [
    { id: 'heading', pageId: 'home', regionId: 'main', intent: 'heading', purpose: subtitle, props: { title, description: subtitle }, kind: 'frame' },
    { id: 'notes', pageId: 'home', regionId: 'main', intent: 'collection', purpose: say('workbench.catalog-board.ex.pp-purpose-notes'), props: { titleField: 'title', textField: 'text', idField: 'id', emptyText: say('workbench.catalog-board.ex.pp-empty'), columns: [{ field: 'source', label: say('workbench.catalog-board.ex.pp-field-source') }] }, kind: 'directory', read: { operationId: 'notes.list', input: { query: { source: 'form', field: 'query' } } } },
    { id: 'editor', pageId: 'home', regionId: 'main', intent: 'input', purpose: newNote, props: { title: newNote, submitLabel: say('workbench.catalog-board.ex.pp-save-note') }, kind: 'sheet', submit: { operationId: 'notes.add', input: { title: { source: 'form', field: 'title' }, text: { source: 'form', field: 'text' }, source: { source: 'form', field: 'source' } } } },
    { id: 'remove', pageId: 'home', regionId: 'main', intent: 'action', purpose: say('workbench.catalog-board.ex.pp-delete-note'), props: { submitLabel: say('workbench.catalog-board.ex.pp-delete-this-note') }, kind: 'alert-dialog', submit: { operationId: 'notes.remove', input: { id: { source: 'selection', componentId: 'notes', field: 'id' } } } },
  ];
}

function buildReadingSamples(say: CatalogSay) {
  return [
    { id: 'one', title: say('workbench.catalog-board.ex.pp-s1-title'), source: say('workbench.catalog-board.ex.pp-s1-source'), text: say('workbench.catalog-board.ex.pp-s1-text') },
    { id: 'two', title: say('workbench.catalog-board.ex.pp-s2-title'), source: say('workbench.catalog-board.ex.pp-s2-source'), text: say('workbench.catalog-board.ex.pp-s2-text') },
    { id: 'three', title: say('workbench.catalog-board.ex.pp-s3-title'), source: say('workbench.catalog-board.ex.pp-s3-source'), text: say('workbench.catalog-board.ex.pp-s3-text') },
  ];
}

/** The catalogue uses the production renderer; this clearly labelled sample never reaches plugin storage. */
export function renderPluginPresentationExample(say: CatalogSay = resolveCatalogSay()): string {
  const contract = buildReadingContract(say);
  const nodes = buildReadingNodes(say);
  const samples = buildReadingSamples(say);
  const view = { contract, nodes, connected: contract.operations.map(operation => operation.id), presentation: readingPresentation };
  const script = `(()=>{let rows=${JSON.stringify(samples).replaceAll('<', '\\u003c')};const view=${JSON.stringify(view).replaceAll('<', '\\u003c')};const root=document.querySelector("[data-presentation-example]");if(!root)return;
    const app=(${PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT})({root,call:async(id,binding,payload)=>{if(binding==="read")return rows.filter(row=>row.title.includes(payload.form.query||""));if(id==="remove"){rows=rows.filter(row=>row.id!==payload.selection.notes.id);return {removed:true}}const row={...payload.form,id:crypto.randomUUID()};rows.unshift(row);return row}});
    const refreshLocale=()=>{if(!globalThis.t?.text)return;
      const title=globalThis.t.text("workbench.catalog-board.ex.pp-title"),notes=globalThis.t.text("workbench.catalog-board.ex.pp-notes"),subtitle=globalThis.t.text("workbench.catalog-board.ex.pp-subtitle"),newNote=globalThis.t.text("workbench.catalog-board.ex.pp-new-note"),sourceLabel=globalThis.t.text("workbench.catalog-board.ex.pp-field-source");
      view.contract.pages[0].title=title;view.contract.pages[0].regions[0].title=notes;
      view.contract.operations[0].input.properties.query.description=notes;
      view.contract.operations[1].input.properties.title.description=globalThis.t.text("workbench.catalog-board.ex.pp-field-title");
      view.contract.operations[1].input.properties.text.description=globalThis.t.text("workbench.catalog-board.ex.pp-field-text");
      view.contract.operations[1].input.properties.source.description=sourceLabel;
      view.nodes[0].purpose=subtitle;view.nodes[0].props.title=title;view.nodes[0].props.description=subtitle;
      view.nodes[1].purpose=globalThis.t.text("workbench.catalog-board.ex.pp-purpose-notes");view.nodes[1].props.emptyText=globalThis.t.text("workbench.catalog-board.ex.pp-empty");view.nodes[1].props.columns[0].label=sourceLabel;
      view.nodes[2].purpose=newNote;view.nodes[2].props.title=newNote;view.nodes[2].props.submitLabel=globalThis.t.text("workbench.catalog-board.ex.pp-save-note");
      view.nodes[3].purpose=globalThis.t.text("workbench.catalog-board.ex.pp-delete-note");view.nodes[3].props.submitLabel=globalThis.t.text("workbench.catalog-board.ex.pp-delete-this-note");
      const localized={
        one:{title:globalThis.t.text("workbench.catalog-board.ex.pp-s1-title"),source:globalThis.t.text("workbench.catalog-board.ex.pp-s1-source"),text:globalThis.t.text("workbench.catalog-board.ex.pp-s1-text")},
        two:{title:globalThis.t.text("workbench.catalog-board.ex.pp-s2-title"),source:globalThis.t.text("workbench.catalog-board.ex.pp-s2-source"),text:globalThis.t.text("workbench.catalog-board.ex.pp-s2-text")},
        three:{title:globalThis.t.text("workbench.catalog-board.ex.pp-s3-title"),source:globalThis.t.text("workbench.catalog-board.ex.pp-s3-source"),text:globalThis.t.text("workbench.catalog-board.ex.pp-s3-text")},
      };
      rows=rows.map(row=>row.id in localized?{...row,...localized[row.id]}:row);
      void app.update(view);};
    document.addEventListener("molis-work:language-changed",refreshLocale);
    void app.update(view);})()`;
  return `<style>${PLUGIN_COMPONENT_STYLES}</style><p class="mw-catalog__hint">${say('workbench.catalog-board.ex.pp-hint')}</p><div data-presentation-example></div><script>${script}</script>`;
}
