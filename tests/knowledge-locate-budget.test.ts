import assert from "node:assert/strict";
import test from "node:test";
import { locateSections, type KnowledgeLocateDraftInput } from "@molis-ai/molis-work-service-knowledge";
import { knowledgeActions, type KnowledgeOutline, type KnowledgeSection } from "@molis-ai/molis-work-contracts/services/knowledge";
import * as modelPrompts from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { assertActionInput } from "@molis-ai/molis-work-kernel";

// T-132: the section trees `knowledge.locate` shows the model go after the instruction as data, and the Host's text model port takes
// at most 180,000 characters (code points) of data (`MODEL_DATA_MAX_CHARS`, apps/local-host/src/host-complete-text.ts). At their
// limits five trees outgrow that, and the port refused the whole call. Whole sections go in while they fit; the rest are counted.
const DATA_CHARS = 180_000;
const chars = (text: string) => [...text].length;

function tree(id: string, count: number, title: (index: number) => string, summary: (index: number) => string | null): KnowledgeOutline {
  const sections: KnowledgeSection[] = Array.from({ length: count }, (_, index) => ({ anchor: `h${index + 1}`, title: title(index), level: 1, parent: null,
    start: index * 100, line: index * 3 + 1, length: 100, summary: summary(index) }));
  return { subject: { kind: "page", id }, revision: `${id}@1`, title: `资料 ${id}`, length: count * 100, owner_truncated: false, sections };
}
async function locate(trees: KnowledgeOutline[], question = "库房着火第一步做什么？") {
  const shown: KnowledgeLocateDraftInput[] = [];
  const found = await locateSections({ question, subjects: trees.map(item => item.subject) },
    async subject => trees.find(item => item.subject.id === subject.id)!, async input => { shown.push(input); return { sections: [] }; });
  assert.equal(shown.length, 1);
  return { found, shown: shown[0]!, data: JSON.stringify(shown[0]) };
}
// What one more section of a piece would add to the data: its JSON, and a comma when the piece already has one.
const cost = (input: KnowledgeLocateDraftInput, piece: number, section: KnowledgeSection) =>
  chars(JSON.stringify({ anchor: section.anchor, title: section.title, level: section.level, summary: section.summary })) + (input.pieces[piece - 1]!.sections.length ? 1 : 0);

test("RAC-2496 five trees at their limits go to the model as whole sections that fit the port's data, and the rest are counted", async () => {
  // Five pieces of 300 sections, each heading 60 characters and each note 200: over 460,000 characters of data. Organizing writes notes
  // for at most 60 sections a piece today (about 233,000 then); locate does not rely on that.
  const trees = ["p1", "p2", "p3", "p4", "p5"].map(id => tree(id, 300, index => `${id} 第${index + 1}节`.padEnd(60, "标"), index => `摘要 ${id}/${index + 1} `.padEnd(200, "述")));
  const { found, shown, data } = await locate(trees);
  assert.ok(chars(data) <= DATA_CHARS, `the data is ${chars(data)} characters, more than the port takes`);
  let given = 0;
  for (const [index, piece] of shown.pieces.entries()) {
    const sections = trees[index]!.sections;
    // Each piece shows the start of its tree, every section whole: heading and note as they are.
    assert.deepEqual(piece.sections, sections.slice(0, piece.sections.length).map(({ anchor, title, level, summary }) => ({ anchor, title, level, summary })));
    assert.ok(piece.sections.length > 0, `${piece.title} shows at least its first section`);
    given += piece.sections.length;
    // Nothing more was left out than had to be: the next section of this piece would not have fit.
    const next = sections[piece.sections.length];
    if (next) assert.ok(chars(data) + cost(shown, piece.piece, next) > DATA_CHARS, `${piece.title} could have shown section ${next.anchor}`);
  }
  assert.ok(given < 1500);
  assert.equal(found.omitted, 1500 - given, "every section not shown is counted");
});

test("RAC-2497 the data is measured in characters, so text of two-unit characters is not left out for its UTF-16 length", async () => {
  // About 166,000 characters of data but nearly 300,000 UTF-16 units: everything fits.
  const wide = (count: number) => "𠀀".repeat(count);
  const trees = ["p1", "p2", "p3"].map(id => tree(id, 220, () => wide(60), () => wide(140)));
  const { found, shown, data } = await locate(trees);
  assert.ok(data.length > DATA_CHARS && chars(data) <= DATA_CHARS, `${data.length} units, ${chars(data)} characters`);
  assert.deepEqual(shown.pieces.map(piece => piece.sections.length), [220, 220, 220]);
  assert.equal(found.omitted, 0);
});

test("RAC-2498 omitted is always given: zero when everything fits, and sections past a tree's first 300 are counted", async () => {
  const small = await locate([tree("p1", 3, index => `节 ${index + 1}`, () => "一句摘要")]);
  assert.equal(small.found.omitted, 0);
  assert.deepEqual(small.found.sections, []);
  const long = await locate([tree("p1", 310, index => `节 ${index + 1}`, () => null), tree("p2", 2, index => `节 ${index + 1}`, () => null)]);
  assert.deepEqual(long.shown.pieces.map(piece => piece.sections.length), [300, 2]);
  assert.equal(long.found.omitted, 10, "the ten sections the model never saw are counted");
  // The first piece does not take the room the others need: sections go in by turns, every piece shows its first ones.
  const huge = await locate(["p1", "p2", "p3", "p4", "p5"].map(id => tree(id, 300, () => "长".repeat(120), () => "述".repeat(200))));
  for (const piece of huge.shown.pieces) assert.ok(piece.sections.length > 0, `${piece.title} shows at least its first section`);
  const counts = huge.shown.pieces.map(piece => piece.sections.length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `sections go in by turns: ${counts.join(", ")}`);
});

test("RAC-2499 knowledge.locate@3 answers with omitted, and its output schema refuses an answer without it", async () => {
  assert.equal(knowledgeActions.locate.version, 3, "a new output field is a new version: a reference pinned to @2 keeps the old contract");
  assert.equal(modelPrompts.MODEL_DATA_MAX_CHARS, DATA_CHARS, "locate measures against the port's own data bound");
  const schema = knowledgeActions.locate.action.output_schema!;
  const { found } = await locate([tree("p1", 2, index => `节 ${index + 1}`, () => "一句摘要")]);
  assert.doesNotThrow(() => assertActionInput(schema, found));
  const { omitted: _omitted, ...older } = found;
  assert.throws(() => assertActionInput(schema, older), "the @2 shape, without omitted, is not this version's answer");
  assert.throws(() => assertActionInput(schema, { ...found, omitted: -1 }));
});
