import assert from "node:assert/strict";
import test from "node:test";
import {
  ARRIVAL_CAPTION_PHRASES,
  ARRIVAL_COMPONENT_STYLES,
  ARRIVAL_MOTION_CLIENT_SCRIPT,
  renderBarContext,
  renderBarStatus,
  renderBrief,
  renderBriefFocus,
  renderBriefSection,
  renderButton,
  renderCaption,
  renderFileGroup,
  renderFileKind,
  renderFileRow,
  renderGoalTrack,
  renderPrimitiveCatalog,
  renderSteps,
  renderWordmark,
} from "../packages/design-system/src/index.js";

// The arrival components (specs/project-arrival-flow): what the opening, Welcome, the project chooser and the
// new-project journey share. Their markup and rules are the board's, so a page cannot drift from them.

test("the wordmark is one decorative span per letter under one accessible name", () => {
  const html = renderWordmark();
  assert.match(html, /role="img" aria-label="Molis Work"/);
  assert.equal(html.match(/class="mw-wordmark__l"/g)?.length, "Molis Work".length);
  assert.match(html, /&nbsp;/, "the space keeps its width");
  assert.match(html, /<i class="mw-wordmark__caret" aria-hidden="true"><\/i>/);
  assert.doesNotMatch(renderWordmark({ text: "<b>" }), /<b>/, "letters are escaped");
});

test("the caption is a pausable button that carries its phrases and its labels", () => {
  const html = renderCaption({ label: "暂停标题动画", playLabel: "播放标题动画", title: "点按暂停或播放" });
  assert.match(html, /^<button type="button" class="mw-caption"/);
  assert.match(html, /aria-pressed="false" aria-label="暂停标题动画"/);
  assert.match(html, /data-label-play="播放标题动画"/);
  const phrases = JSON.parse(/data-phrases="([^"]*)"/.exec(html)![1]!.replaceAll("&quot;", '"')) as string[][];
  assert.deepEqual(phrases, ARRIVAL_CAPTION_PHRASES.map((pair) => [...pair]));
  assert.equal(phrases.length, 8);
  // A and I stay; only what follows them moves.
  assert.equal(html.match(/<span class="mw-caption__ini">[AI]<\/span>/g)?.length, 2);
});

test("short-line progress marks what is done and the one step in view", () => {
  const html = renderSteps({ total: 4, current: 2, label: "引导进度" });
  assert.equal(html.match(/<li/g)?.length, 4);
  assert.equal(html.match(/class="is-done"/g)?.length, 2);
  assert.equal(html.match(/aria-current="step"/g)?.length, 1);
  assert.match(html, /aria-label="引导进度"/);
});

test("the goal track draws one segment per goal and thins its labels when crowded", () => {
  const goals = ["a", "b", "c"].map((title, index) => ({ title, state: (["done", "doing", "todo"] as const)[index]! }));
  const html = renderGoalTrack({ goals, label: "1 / 3 个目标完成" });
  assert.deepEqual([...html.matchAll(/data-s="(\w+)"/g)].map((match) => match[1]), ["done", "doing", "todo"]);
  assert.match(html, /role="img" aria-label="1 \/ 3 个目标完成"/);
  assert.doesNotMatch(html, /is-dense/);
  const crowded = renderGoalTrack({ goals: Array.from({ length: 8 }, (_, index) => ({ title: `g${index}`, state: "todo" as const })), label: "0 / 8" });
  assert.match(crowded, /is-dense/);
});

test("the bar's context and status blocks name the thing and keep the spinner the shared one", () => {
  const context = renderBarContext({ mark: "<i></i>", title: "FlyLeaf", caption: "预览中 · 回车进入" });
  assert.match(context, /<strong>FlyLeaf<\/strong><small>预览中 · 回车进入<\/small>/);
  assert.match(renderBarContext({ mark: "", title: "无", caption: "x", none: true }), /mw-bar-context__mark is-none/);
  const busy = renderBarStatus({ spin: true, title: "正在整理", caption: "可以离开" });
  assert.match(busy, /role="status" aria-live="polite"/);
  assert.match(busy, /class="mw-spinner"/, "the loading indicator is the shared spinner, not a second one");
  assert.match(renderBarStatus({ glyph: "shield", title: "已选 3 份" }), /<svg/);
  assert.doesNotMatch(renderBarStatus({ title: "只有一行" }), /<small>/);
});

test("a file's kind is its extension, in the colour of its kind", () => {
  assert.match(renderFileKind("访谈-0926.pdf"), /mw-file-kind--pdf" data-slot="file-kind">PDF</);
  assert.match(renderFileKind("README"), /mw-file-kind--txt/, "no extension reads as plain text");
  assert.match(renderFileKind(".env"), /mw-file-kind--txt/);
  assert.match(renderFileKind("a.b.markdown"), /mw-file-kind--mark" data-slot="file-kind">MARK</, "long extensions are cut to four");
});

test("a file row is a choice when it has a checkbox, and removable on demand", () => {
  const chosen = renderFileRow({ name: "a.md", size: "12 KB", check: { checked: true, attrs: { "data-scope-item": "m1" } } });
  assert.match(chosen, /<label class="mw-file-row__label"><input class="mw-check" type="checkbox" checked data-scope-item="m1">/);
  const removable = renderFileRow({ name: "a.md", remove: { label: "移除 a.md", attrs: { "data-act": "remove" } } });
  assert.match(removable, /aria-label="移除 a\.md"[^>]*data-act="remove"/);
  assert.match(removable, /<span class="mw-file-row__label">/);
  assert.match(renderFileRow({ name: "a<b>.md" }), /a&lt;b&gt;\.md/);
});

test("a file group shows its mixed state and its rows", () => {
  const html = renderFileGroup({ glyph: "folder", title: "文件夹 · 文稿", count: "1/3", check: { checked: false, mixed: true }, rows: [renderFileRow({ name: "a.md" })], note: "另有 2 项未列入。" });
  assert.match(html, /<label class="mw-file-group__head"><input class="mw-check" type="checkbox" data-mixed>/);
  assert.match(html, /<ul class="mw-file-list"><li class="mw-file-row"/);
  assert.match(html, /mw-file-group__note">另有 2 项未列入。/);
  assert.match(ARRIVAL_COMPONENT_STYLES, /\.mw-check:indeterminate, \.mw-check\[data-mixed\]/, "mixed shows without script");
});

test("the brief reads title, description, focus and sections in one article", () => {
  const html = renderBrief({
    kicker: "<span>进行中</span>", title: "FlyLeaf", description: "一句话。",
    focus: renderBriefFocus({ label: "当前目标", count: "<b>4</b> / 6 完成", title: "打磨首次使用", track: "<ol></ol>" }),
    sections: [renderBriefSection({ title: "接下来", body: "<p>x</p>" })],
  });
  assert.match(html, /<article class="mw-brief" data-slot="brief" aria-labelledby="brief-title">/);
  assert.match(html, /<h1 class="mw-brief__title" id="brief-title">FlyLeaf<\/h1>/);
  assert.match(html, /mw-brief__desc">一句话。/);
  assert.match(html, /mw-brief__cols"><section class="mw-brief__sec"><h2>接下来<\/h2>/);
  const missing = renderBrief({ kicker: "", title: "新项目", descriptionMissing: "还没有项目描述。" });
  assert.match(missing, /mw-brief__desc is-missing/);
  assert.match(renderBriefFocus({ label: "", title: "还没有目标", body: "x", empty: {} }), /mw-brief__focus is-empty/);
});

test("a primary button can name the key it answers to, and an icon-only one never does", () => {
  assert.match(renderButton({ label: "继续", key: "↵", size: "lg" }), /<span data-slot="button-label">继续<\/span><kbd class="mw-btn__key" aria-hidden="true">↵<\/kbd><\/button>/);
  assert.doesNotMatch(renderButton({ label: "发送", iconOnly: true, key: "↵" }), /mw-btn__key/);
});

test("arrival styles stay on the shared scales: tokens for motion, opacity and transform only", () => {
  const css = ARRIVAL_COMPONENT_STYLES;
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, "no literal colours");
  assert.doesNotMatch(css, /linear-gradient/, "the foundation bundle's gradient count is fixed");
  for (const match of css.matchAll(/transition\s*:\s*([^;}]+)/g)) {
    assert.doesNotMatch(match[1]!, /(?<![\w-])(width|height|margin|padding|top|left|right|bottom|gap|font-size)(?![\w-])/, match[0]);
  }
});

test("the motion script rests under reduced motion and automation, and types by the Club's rhythm", () => {
  assert.match(ARRIVAL_MOTION_CLIENT_SCRIPT, /prefers-reduced-motion: reduce/);
  assert.match(ARRIVAL_MOTION_CLIENT_SCRIPT, /navigator\.webdriver === true/);
  assert.match(ARRIVAL_MOTION_CLIENT_SCRIPT, /pace === 'ritual' \? 170 : 90/);
  assert.match(ARRIVAL_MOTION_CLIENT_SCRIPT, /typingStarts = 450/);
  assert.match(ARRIVAL_MOTION_CLIENT_SCRIPT, /window\.molisArrival = \{/);
  // Only opacity and transform are animated.
  const keyframes = [...ARRIVAL_MOTION_CLIENT_SCRIPT.matchAll(/\.animate\(\[([^\]]*)\]/g)].map((match) => match[1]!);
  for (const frames of keyframes) assert.doesNotMatch(frames, /\b(width|height|left|top|margin|padding)\s*:/, frames);
});

test("the component board lists the arrival components, each with a specimen", () => {
  const html = renderPrimitiveCatalog();
  assert.match(html, /<section class="mw-catalog__section" id="arrival" data-primitive="arrival"><h2>到达 \/ Arrival<\/h2>/);
  for (const id of ["wordmark", "caption", "steps", "bar-context", "bar-status", "goal-track", "file-list", "brief"]) {
    assert.match(html, new RegExp(`data-primitive="${id}"`), id);
  }
});
