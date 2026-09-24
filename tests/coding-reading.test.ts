import assert from "node:assert/strict";
import test from "node:test";

import {
  STICK_THRESHOLD_PX,
  atBottom,
  onContentAppended,
  onReaderScrolled,
} from "@molis-ai/molis-work-plugin-coding";

/** 贴底时跟随新内容；人往上翻读历史时不要把滚动抢走。 */

const bottom = { offset: 900, viewport: 100, content: 1000 };
const readingUp = { offset: 200, viewport: 100, content: 1000 };

test("在底部时跟随新内容", () => {
  const decision = onContentAppended({ position: bottom, pinned: true });
  assert.equal(decision.follow, true);
  assert.equal(decision.show_jump_to_latest, false);
});

test("人往上翻之后，新内容不抢滚动，而是给一个回到最新的入口", () => {
  const decision = onContentAppended({ position: readingUp, pinned: false });
  assert.equal(decision.follow, false, "读历史读到一半被拽到底，等于没法读");
  assert.equal(decision.show_jump_to_latest, true);
});

test("钉住时，内容在上次绘制后变长到视口以下，也继续跟随", () => {
  const grownBelowFold = { offset: 900, viewport: 100, content: 1400 };
  assert.equal(onContentAppended({ position: grownBelowFold, pinned: true }).follow, true, "晚到的审查卡片不能让对话停在半截");
});

test("就算位置在底部，只要钉住被解除也不自动跟随", () => {
  const decision = onContentAppended({ position: bottom, pinned: false });
  assert.equal(decision.follow, false, "钉住只能由读者自己回到底部来恢复");
});

test("差一点点到底仍算在底部——阈值之内不折腾", () => {
  assert.equal(atBottom({ offset: 900 - STICK_THRESHOLD_PX + 1, viewport: 100, content: 1000 }), true);
  assert.equal(atBottom({ offset: 900 - STICK_THRESHOLD_PX - 1, viewport: 100, content: 1000 }), false);
});

test("读者滚回底部就重新钉住", () => {
  assert.equal(onReaderScrolled(readingUp), false);
  assert.equal(onReaderScrolled(bottom), true);
});

test("内容比视口还短时永远算在底部", () => {
  assert.equal(atBottom({ offset: 0, viewport: 500, content: 200 }), true);
});
