import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { EditorState, TextSelection } from "prosemirror-state";
import { pagesSchema as s } from "../plugins/native/pages/src/schema.js";
import { pagesInputRules, confirmCodeFence } from "../plugins/native/pages/src/input-rules.js";

const localRequire = createRequire(new URL('../plugins/native/pages/package.json', import.meta.url));
const { undoInputRule } = localRequire('prosemirror-inputrules');
const { history, undo, redo, closeHistory } = localRequire('prosemirror-history');

function editor(doc = s.node('doc', null, [s.node('paragraph')]), pos = 1) {
  const rules = pagesInputRules();
  const view: any = {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, pos), plugins: [history(), rules] }),
    composing: false,
    dispatch(tr: any) { view.state = view.state.apply(tr); },
  };
  const type = (text: string) => {
    for (const char of text) {
      const { from, to } = view.state.selection;
      const handled = rules.props.handleTextInput!.call(rules, view, from, to, char, () => view.state.tr.insertText(char));
      if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
    }
  };
  return { view, type, rules };
}

test('real input rules consume the pending character, preserve styles and resume plain typing', () => {
  for (const [typed, mark] of [['**粗体**', 'strong'], ['*斜体*', 'em'], ['~~删除~~', 'strike'], ['`代码`', 'code']]) {
    const { view, type } = editor();
    type(typed);
    const text = typed.replace(/[*~`]/gu, '');
    assert.equal(view.state.doc.textContent, text);
    assert.equal(view.state.doc.firstChild.firstChild.marks[0].type.name, mark);
    assert.equal(view.state.selection.from, text.length + 1);
    type('后续');
    assert.equal(view.state.doc.textContent, text + '后续');
    assert.deepEqual(view.state.doc.firstChild.lastChild.marks, [], 'format delimiters end the mark');
  }
});

test('typing links, checklists, quotes and dividers uses the same live plugin path', () => {
  for (const input of ['[ ] ', '[] ', '[x] ', '[X] ']) {
    const { view, type } = editor(); type(input); type('买菜');
    assert.equal(view.state.doc.firstChild.type.name, 'task_list');
    assert.equal(view.state.doc.firstChild.firstChild.attrs.checked, /x/iu.test(input));
    assert.equal(view.state.doc.textContent, '买菜');
  }
  const quote = editor(); quote.type('> 引用');
  assert.equal(quote.view.state.doc.firstChild.type.name, 'blockquote');
  assert.equal(quote.view.state.doc.textContent, '引用');
  for (const input of ['---', '___', '***']) {
    const item = editor(); item.type(input); item.type('继续');
    assert.equal(item.view.state.doc.firstChild.type.name, 'horizontal_rule');
    assert.equal(item.view.state.doc.lastChild.textContent, '继续');
  }
  const link = editor(); link.type('[网站](https://example.com)');
  assert.equal(link.view.state.doc.textContent, '网站');
  assert.equal(link.view.state.doc.firstChild.firstChild.marks[0].attrs.href, 'https://example.com/');
  const url = editor(); url.type('https://example.com 后续');
  assert.equal(url.view.state.doc.firstChild.firstChild.marks[0].type.name, 'link');
  assert.equal(url.view.state.doc.lastChild.lastChild.text, ' 后续');
  assert.deepEqual(url.view.state.doc.lastChild.lastChild.marks, []);
});

test('fence waits for a delimiter, supports language and does not interpret code contents', () => {
  for (const delimiter of [' ', 'Enter']) {
    const { view, type } = editor(); type('```js');
    assert.equal(view.state.doc.firstChild.type.name, 'paragraph');
    if (delimiter === 'Enter') assert.equal(confirmCodeFence(view.state, view.dispatch), true);
    else type(delimiter);
    assert.equal(view.state.doc.firstChild.type.name, 'code_block');
    assert.equal(view.state.doc.firstChild.attrs.language, 'javascript');
    type('**literal**');
    assert.equal(view.state.doc.textContent, '**literal**');
  }
});

test('input rule Backspace restores exact typed syntax; history undo and redo restore transformations', () => {
  for (const input of ['**粗体**', '[ ] ', '---', '[网站](https://example.com)', '```js ']) {
    const { view, type } = editor(); type(input);
    assert.equal(undoInputRule(view.state, view.dispatch), true);
    assert.equal(view.state.doc.firstChild.type.name, 'paragraph');
    assert.equal(view.state.doc.textContent, input);
  }
  const { view, type } = editor(); type('**粗体*');
  const before = view.state.doc.toJSON();
  view.dispatch(closeHistory(view.state.tr));
  type('*');
  const after = view.state.doc.toJSON();
  assert.equal(undo(view.state, view.dispatch), true);
  assert.deepEqual(view.state.doc.toJSON(), before);
  assert.equal(redo(view.state, view.dispatch), true);
  assert.deepEqual(view.state.doc.toJSON(), after);
});

test('shortcut before existing styled text keeps the tail and composition stays literal until committed', () => {
  const tail = s.node('paragraph', null, [s.text('保留', [s.marks.strong.create()])]);
  const { view, type } = editor(s.node('doc', null, [tail]));
  type('[ ] ');
  assert.equal(view.state.doc.textContent, '保留');
  assert.equal(view.state.doc.firstChild.firstChild.firstChild.firstChild.marks[0].type.name, 'strong');
  const composing = editor(); composing.view.composing = true; composing.type('**中文**');
  assert.equal(composing.view.state.doc.textContent, '**中文**');
  assert.deepEqual(composing.view.state.doc.firstChild.firstChild.marks, []);
});


test('DOM replacement input uses its actual range, even when the prior selection differs', () => {
  const doc = s.node('doc', null, [s.node('paragraph', null, [s.text('**x*')])]);
  const { view, rules } = editor(doc, 5);
  const handled = rules.props.handleTextInput!.call(rules, view, 3, 5, 'y**', () => view.state.tr.insertText('y**', 3, 5));
  assert.equal(handled, true);
  assert.equal(view.state.doc.textContent, 'y');
  assert.equal(view.state.doc.firstChild.firstChild.marks[0].type.name, 'strong');
  assert.equal(view.state.selection.from, 2);
});

test('inline mentions and inline code keep their literal syntax intact', () => {
  const mention = s.nodes.page_mention.create({ id: 'page-1', title: '提及' });
  const doc = s.node('doc', null, [s.node('paragraph', null, [s.text('**x'), mention, s.text('y*')])]);
  const item = editor(doc, doc.content.size - 1);
  item.type('*');
  assert.equal(item.view.state.doc.firstChild.textBetween(0, item.view.state.doc.firstChild.content.size, '', '@'), '**x@y**');
  assert.equal(item.view.state.doc.firstChild.child(1).type.name, 'page_mention');
  const code = editor();
  code.view.dispatch(code.view.state.tr.setStoredMarks([s.marks.code.create()]));
  code.type('**code**');
  assert.equal(code.view.state.doc.textContent, '**code**');
  assert.deepEqual(code.view.state.doc.firstChild.firstChild.marks.map((m: any) => m.type.name), ['code']);
});
