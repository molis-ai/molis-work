import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from 'prosemirror-state';
import { pagesSchema as s } from '../plugins/native/pages/src/schema.js';
import { rowGapAt } from '../plugins/native/pages/src/floating.js';
import { dragRows, previewSpan } from '../plugins/native/pages/src/reorder.js';
import { moveSpan } from '../plugins/native/pages/src/commands.js';

const p = (text: string) => s.node('paragraph', null, [s.text(text)]);

test('a pointer between callout paragraphs drops into the callout, preserving text order', () => {
  const doc = s.node('doc', null, [p('移动块'), s.node('callout', null, [p('首段'), p('次段')]), p('末段')]);
  const rows = dragRows(doc);
  const bounds = [[60, 88], [100, 260], [112, 140], [180, 248], [280, 308]];
  const geometry = rows.map((row, index) => ({ indent: row.indent, top: bounds[index][0], bottom: bounds[index][1] }));
  const gap = rowGapAt(170, geometry);
  assert.equal(gap, 3, 'parent height must not eclipse the second child');
  assert.ok(previewSpan(doc, rows[0].pos, rows[0].pos, gap, 1));
  let state = EditorState.create({ doc });
  assert.equal(moveSpan(rows[0].pos, rows[0].pos, gap, 1)(state, tr => { state = state.apply(tr); }), true);
  assert.equal(state.doc.firstChild!.type.name, 'callout');
  assert.deepEqual(state.doc.firstChild!.content.content.map(node => node.textContent), ['首段', '移动块', '次段']);
  assert.equal(state.doc.lastChild!.textContent, '末段');
});

test('nested-list parent hit area ends before the child, while a leaf keeps its midpoint', () => {
  const rows = [{ top: 20, bottom: 200, indent: 1 }, { top: 50, bottom: 80, indent: 2 }, { top: 90, bottom: 120, indent: 2 }, { top: 220, bottom: 248, indent: 1 }];
  assert.equal(rowGapAt(30, rows), 0);
  assert.equal(rowGapAt(55, rows), 1);
  assert.equal(rowGapAt(85, rows), 2);
  assert.equal(rowGapAt(240, rows), 4);
});
