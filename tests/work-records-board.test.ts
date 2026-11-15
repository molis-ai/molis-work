import assert from "node:assert/strict";
import test from "node:test";
import {
  WORK_RECORDS_BOARD_STYLES,
  WORK_RECORD_STYLES,
  renderCategoryBar,
  renderKindMark,
  renderPrimitiveCatalog,
} from "@molis-ai/molis-work-design-system";
import { withPageText } from "./fixtures/page-text.js";

// 29 work records (docs/design/work-records/README.md「组件板新增」, decided 2026-11-04): the kind-coloured mark and the category
// bar as shared renderers, their component-board sections in Chinese and English, semantic tokens only, and forced-colors rules.

const SECTIONS = ["kind-mark", "category-bar"] as const;
const sectionOf = (html: string, id: string) => {
  const start = html.indexOf(`<section class="mw-catalog__section" id="${id}"`);
  assert.ok(start >= 0, `section ${id}`);
  const next = html.indexOf(`<section class="mw-catalog__section"`, start + 10);
  return next >= 0 ? html.slice(start, next) : html.slice(start);
};

test("OCL-02 OCL-11: renderKindMark draws the five --mark-* hues alongside distinct icons and falls back to neutral mw-mark", () => {
  const neutral = renderKindMark({ icon: "database" });
  assert.match(neutral, /^<span class="mw-mark" data-slot="mark" aria-hidden="true"><svg[^>]*><use href="#icon-database"><\/use><\/svg><\/span>$/);
  assert.doesNotMatch(neutral, /data-hue|mw-mark--/);

  for (const [hue, glyph] of [["blue", "edit"], ["plum", "sparkles"], ["slate", "history"], ["ochre", "workflow"], ["clay", "eye"]] as const) {
    const html = renderKindMark({ icon: glyph, hue });
    assert.match(html, new RegExp(`class="mw-mark mw-mark--${hue}" data-slot="mark" data-hue="${hue}" aria-hidden="true"`));
    assert.match(html, new RegExp(`<use href="#icon-${glyph}"></use>`));
  }
});

test("OCL-09: renderCategoryBar draws positive segments proportionally while keeping zero-value items in the legend", () => {
  const full = renderCategoryBar({
    label: "按种类的占用",
    segments: [
      { hue: "blue", label: "你的操作", value: 0.12, formatted: "0.12 GB" },
      { hue: "plum", label: "AI 做的事", value: 0.96, formatted: "0.96 GB" },
      { hue: "slate", label: "内容的变化", value: 0, formatted: "0.00 GB" },
      { hue: "muted", label: "附件与图片", value: 0.3, formatted: "0.30 GB" },
    ],
  });
  assert.match(full, /<div class="mw-cat-bar" data-slot="category-bar"><div class="mw-cat-bar__track" role="img" aria-label="按种类的占用">/);
  assert.equal([...full.matchAll(/class="mw-cat-bar__seg"/gu)].length, 3, "only positive segments take space in the track");
  assert.equal([...full.matchAll(/<li data-hue="/gu)].length, 4, "all categories stay in the legend");
  assert.match(full, /<li data-hue="slate"><span>内容的变化<\/span><b>0\.00 GB<\/b><\/li>/);

  const empty = renderCategoryBar({
    label: "Usage <empty>",
    segments: [
      { hue: "blue", label: "Your actions", value: 0, formatted: "0 MB" },
      { hue: "muted", label: "Files & images", value: -1, formatted: "0 MB" },
    ],
  });
  assert.match(empty, /aria-label="Usage &lt;empty&gt;"/);
  assert.doesNotMatch(empty, /mw-cat-bar__seg/, "an empty bar draws no track segments");
  assert.match(empty, /<span>Files &amp; images<\/span><b>0 MB<\/b>/);
});

test("OCL-02 OCL-09: the board renders #kind-mark and #category-bar in order, in both languages, using tokens only", () => {
  const board = withPageText("zh", [], () => renderPrimitiveCatalog());
  const positions = SECTIONS.map((id) => board.indexOf(`id="${id}"`));
  assert.ok(positions.every((at, index) => at > 0 && (index === 0 || at > positions[index - 1]!)), "both sections appear in order");
  assert.match(sectionOf(board, "kind-mark"), /种类色标记/);
  assert.match(sectionOf(board, "category-bar"), /分类条/);

  const english = withPageText("en", [], () => renderPrimitiveCatalog());
  assert.match(sectionOf(english, "kind-mark"), /Kind-coloured mark/);
  assert.match(sectionOf(english, "category-bar"), /Category bar/);
  for (const id of SECTIONS) {
    const plain = sectionOf(english, id).replace(/<style>[\s\S]*?<\/style>/gu, "");
    assert.deepEqual(plain.match(/[㐀-鿿]+/gu) ?? [], [], `no Chinese left in ${id}`);
  }

  for (const css of [WORK_RECORD_STYLES, WORK_RECORDS_BOARD_STYLES]) {
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|\d+ms|cubic-bezier/iu, "colours and motion come from tokens only");
  }
  assert.match(WORK_RECORD_STYLES, /forced-colors:\s*active/u, "forced-colors rules keep borders and fills visible");
});
