import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERACTION_TEXTURE_STYLES,
  listedIconNames,
  registeredIconNames,
  PRIMITIVE_STYLES,
  VISUAL_FOUNDATION_STYLES,
  PRIMITIVE_CATALOG_IDS,
  renderAlertDialog,
  renderButton,
  renderDirectoryPanel,
  renderDirectoryRow,
  renderField,
  renderHint,
  renderInput,
  renderPrimitiveCatalog,
  renderSlider,
  renderSheet,
} from "@molis-ai/molis-work-design-system";

test("primary button emits mw classes, data-slot, and escaped attributes", () => {
  const html = renderButton({
    label: `保存 "草稿"`,
    variant: "primary",
    attrs: { "data-create-submit": true },
  });
  assert.match(html, /class="mw-btn mw-btn--primary mw-btn--sm"/);
  assert.match(html, /data-slot="button"/);
  assert.match(html, /data-create-submit/);
  assert.match(html, /保存 &quot;草稿&quot;/);
  assert.doesNotMatch(html, /disabled/);
});

test("loading button stays disabled and keeps a spinner slot", () => {
  const html = renderButton({ label: "保存", loading: true });
  assert.match(html, /data-loading/);
  assert.match(html, /disabled/);
  assert.match(html, /data-slot="button-loading-indicator"/);
});

test("field wraps a control with label and error without leaking raw markup", () => {
  const html = renderField({
    label: "目标名称",
    error: `<script>alert(1)</script>`,
    control: renderInput({ name: "title", invalid: true }),
  });
  assert.match(html, /class="mw-field"/);
  assert.match(html, /name="title"/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test("sheet is a native dialog with the sheet slot and form regions", () => {
  const html = renderSheet({
    labelledBy: "create-title",
    title: "新建目标",
    body: "<p>fields</p>",
    footer: renderButton({ label: "创建 Goal" }),
    attrs: { "data-create-dialog": true },
  });
  assert.match(html, /<dialog class="mw-sheet"/);
  assert.match(html, /data-slot="sheet"/);
  assert.match(html, /data-create-dialog/);
  assert.match(html, /class="mw-form mw-sheet__shell"/);
  assert.match(html, /id="create-title"/);
});

test("alert dialog uses the alert slot distinct from sheet", () => {
  const html = renderAlertDialog({
    labelledBy: "trash-title",
    title: "移入回收站",
    body: "<p>confirm</p>",
    footer: renderButton({ label: "移入回收站", variant: "danger" }),
  });
  assert.match(html, /data-slot="alert-dialog"/);
  assert.match(html, /mw-dialog--alert/);
  assert.doesNotMatch(html, /data-slot="sheet"/);
});

test("directory row escapes title and preserves plugin attributes", () => {
  const html = renderDirectoryRow({
    title: `设计 "观察"`,
    caption: "运行中",
    density: "meta",
    count: 4,
    current: true,
    attrs: { "data-feed-task-toggle": "src-1" },
    wrapperAttrs: { "data-feed-task": "src-1" },
  });
  assert.match(html, /class="mw-dir-row-wrap"/);
  assert.match(html, /mw-dir-row mw-dir-row--meta directory-list-row is-selected/);
  assert.match(html, /data-slot="directory-row"/);
  assert.match(html, /data-feed-task="src-1"/);
  assert.match(html, /data-feed-task-toggle="src-1"/);
  assert.match(html, /设计 &quot;观察&quot;/);
  assert.match(html, /mw-dir-row__headline/);
  assert.match(html, /mw-dir-row__count">4/);
  assert.match(html, /<small>运行中<\/small>/);
  assert.doesNotMatch(html, /<\/span><\/span><span class="mw-dir-row__count"/);
});

test("directory rows can yield trailing actions and keep a file extension", () => {
  const html = renderDirectoryRow({
    title: "试用示例.pdf",
    icon: "file",
    density: "compact",
    fileName: true,
    yield: true,
    trailing: renderButton({ label: "复制", variant: "ghost", size: "icon", icon: "copy", iconOnly: true }),
  });
  assert.match(html, /mw-dir-row-wrap is-yield/);
  assert.match(html, /mw-dir-row__ops/);
  assert.match(html, /mw-dir-row__stem">试用示例<\/span><span class="mw-dir-row__ext">\.pdf/);
  const url = renderDirectoryRow({
    title: "https://cdn.example.com/file.pdf",
    fileName: true,
    yield: true,
    trailing: renderButton({ label: "复制", variant: "ghost", size: "icon", icon: "copy", iconOnly: true }),
  });
  assert.match(url, /https:\/\/cdn\.example\.com\/file\.pdf/);
  assert.doesNotMatch(url, /mw-dir-row__ext/);
  const reserved = renderDirectoryRow({
    title: "设计观察",
    trailing: renderButton({ label: "任务配置", variant: "ghost", size: "icon", icon: "more", iconOnly: true }),
  });
  assert.match(reserved, /mw-dir-row-wrap"/);
  assert.doesNotMatch(reserved, /is-yield/);
  assert.doesNotMatch(reserved, /mw-dir-row__ops/);
});

test("directory rows show status marks on compact and meta densities", () => {
  const meta = renderDirectoryRow({
    title: "确认对象边界",
    caption: "你手工加入",
    status: "待处理",
    statusTone: "attention",
    statusIcon: "bell",
    density: "meta",
  });
  assert.match(meta, /<small>你手工加入<\/small>/);
  assert.match(meta, /mw-status mw-status--attention mw-status--plain mw-dir-row__status/);
  assert.match(meta, /待处理/);
  const compact = renderDirectoryRow({
    title: "runtime / 本地会话",
    status: "可查看",
    statusTone: "idle",
    statusIcon: "ready",
    density: "compact",
  });
  assert.match(compact, /mw-status mw-status--idle mw-status--plain mw-dir-row__status/);
  assert.match(compact, />可查看</);
  assert.match(compact, /#icon-ready/);
  assert.doesNotMatch(compact, /<small>/);
});

test("directory add can sit above the list", () => {
  const html = renderDirectoryPanel({
    pluginId: "feed",
    listLabel: "拉取任务",
    listRole: "none",
    body: `<button data-feed-task="all">全部</button>`,
    add: { label: "添加任务", attrs: { "data-feed-add-toggle": true } },
    addPlacement: "start",
  });
  assert.ok(html.indexOf("data-feed-add-toggle") < html.indexOf('data-feed-task="all"'));
  const defaultHtml = renderDirectoryPanel({
    pluginId: "sessions",
    listLabel: "会话",
    listRole: "none",
    body: `<button data-session>runtime</button>`,
    add: { label: "新建 Session" },
  });
  assert.ok(defaultHtml.indexOf("新建 Session") > defaultHtml.indexOf("data-session"));
});

test("hint trigger escapes copy and keeps a popover tooltip", () => {
  const html = renderHint({
    id: "settings-hint-x",
    label: `如何生效 "<x>"`,
    text: `<script>alert(1)</script>`,
  });
  assert.match(html, /class="mw-hint"/);
  assert.match(html, /popovertarget="settings-hint-x"/);
  assert.match(html, /id="settings-hint-x"/);
  assert.match(html, /#icon-circle-alert/);
  assert.match(html, /如何生效 &quot;&lt;x&gt;&quot;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test("catalog renders every Coss primitive id", () => {
  const html = renderPrimitiveCatalog();
  for (const id of PRIMITIVE_CATALOG_IDS) {
    assert.match(html, new RegExp(`data-primitive="${id}"`));
  }
  assert.match(html, /data-catalog-demo="sheet"/);
  assert.match(html, /data-catalog-demo="dialog"/);
  assert.match(html, /data-catalog-demo="alert"/);
  assert.match(html, /data-catalog-demo="drawer"/);
  assert.match(html, /data-slot="calendar"/);
  assert.match(html, /data-slot="sidebar"/);
  assert.match(html, /data-slot="frame"/);
  assert.match(html, /mw-dir-row-wrap is-yield/);
  assert.match(html, /mw-dir-row__stem">试用示例/);
  assert.match(html, /mw-dir-row__ext">\.pdf/);
  assert.match(html, /quarterly-planning-notes-and-a-very-long-working-copy-filename/);
  assert.match(html, /figcaption>行让位<\/figcaption>/);
  assert.match(html, /\.mw-catalog \[data-slot=toggle-group\]/);
});

test("visual foundation ships primitive classes after the Coss control layer", () => {
  assert.match(PRIMITIVE_STYLES, /\.mw-btn--primary/);
  assert.match(PRIMITIVE_STYLES, /\.mw-hint__trigger \{/);
  assert.match(PRIMITIVE_STYLES, /\.mw-hint__tooltip \{[\s\S]*background: var\(--paper\)/);
  assert.match(PRIMITIVE_STYLES, /\.mw-hint__tooltip:not\(:popover-open\) \{ display: none/);
  assert.match(PRIMITIVE_STYLES, /\.mw-hint__tooltip \{[\s\S]*left: calc\(anchor\(right\) \+ 10px\)/);
  assert.doesNotMatch(PRIMITIVE_STYLES, /bottom: 24px; left: 50%/);
  assert.match(PRIMITIVE_STYLES, /@media \(max-width: 760px\) \{[\s\S]*\.mw-hint__tooltip:popover-open \{[\s\S]*left: 16px/);
  assert.match(PRIMITIVE_STYLES, /dialog\.mw-sheet/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row\.is-selected::before/);
  assert.match(PRIMITIVE_STYLES, /body\.immersive-workbench \.tree-pane \.mw-dir-row:has\(\.mw-dir-row__icon\)/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row__headline \{/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row-wrap > :not\(\.mw-dir-row\) \{[\s\S]*?position: static/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row--meta \{[\s\S]*height: 36px;/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row--meta \.mw-dir-row__copy small \{[\s\S]*font-size: 12px/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir__label \{/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row\.is-selected \.mw-dir-row__copy strong/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row \.mw-dir-row__status \{[^}]*font-size: 12px/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row \.mw-dir-row__status \{[^}]*font-weight: 400/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row--compact \.mw-dir-row__headline \{ display: contents/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir > \[data-slot="directory-add"\]:first-child,[\s\S]*\.mw-dir__tools \+ \[data-slot="directory-add"\]/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row-wrap:has\(\.is-selected\) \.mw-dir-row,[\s\S]*tree-pane \.mw-dir-row-wrap \.mw-dir-row:is\(:hover, :active, \.is-selected, \[aria-current="page"\]\) \{ background: transparent; \}/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row \{[\s\S]*background-color 180ms var\(--ease-out/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row__copy strong \{[\s\S]*text-overflow: ellipsis/);
  assert.doesNotMatch(PRIMITIVE_STYLES, /\.mw-dir-row__copy strong \{[\s\S]*mask-image:/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row, \.mw-dir-row-wrap, \.mw-dir-row-wrap\.is-yield \.mw-dir-row, \.mw-dir-row-wrap\.is-yield \.mw-dir-row__ops \{ transition: none; \}/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row-wrap\.is-yield:is\(:hover, :has\(\.is-selected\), :has\(\[aria-current="page"\]\)\) \.mw-dir-row \{[\s\S]*padding-right: var\(--dir-yield, 72px\)/);
  assert.match(PRIMITIVE_STYLES, /\.mw-catalog-dir-stage\.is-yield \{ width: 213px; \}/);
  const cossIndex = VISUAL_FOUNDATION_STYLES.indexOf(".mw-btn {");
  const primitiveIndex = VISUAL_FOUNDATION_STYLES.lastIndexOf(".mw-btn");
  assert.ok(cossIndex >= 0);
  assert.ok(primitiveIndex > cossIndex);
});

test("primitive controls keep authored states instead of a class dump", () => {
  assert.match(PRIMITIVE_STYLES, /\.mw-btn \{[\s\S]*appearance: none/);
  assert.match(PRIMITIVE_STYLES, /\.mw-btn:focus-visible \{/);
  assert.match(PRIMITIVE_STYLES, /\.mw-btn--primary:active:not\(:disabled\)/);
  assert.match(PRIMITIVE_STYLES, /\.mw-btn--link \{[\s\S]*color: var\(--ink-soft\)/);
  assert.doesNotMatch(PRIMITIVE_STYLES, /\.mw-btn:disabled \{[^}]*background: var\(--control-fill\)/);
  assert.match(PRIMITIVE_STYLES, /\.mw-btn--primary:disabled,[\s\S]*background: var\(--action\)/);
  assert.match(PRIMITIVE_STYLES, /\.mw-spinner \{[\s\S]*currentColor/);
  assert.doesNotMatch(PRIMITIVE_STYLES, /\.mw-catalog \.mw-btn \{ min-height: 44px/);
  assert.match(PRIMITIVE_STYLES, /\.mw-input:focus-visible, \.mw-textarea:focus-visible, \.mw-select:focus-visible \{[\s\S]*outline-offset: -2px/);
  assert.doesNotMatch(PRIMITIVE_STYLES, /0 0 0 3\.5px/);
  assert.match(PRIMITIVE_STYLES, /\.mw-check, \.mw-radio \{[\s\S]*appearance: none/);
  assert.match(PRIMITIVE_STYLES, /input\.mw-slider \{[^}]*background: transparent/);
  assert.match(PRIMITIVE_STYLES, /input\.mw-slider::-webkit-slider-thumb \{[^}]*background: var\(--paper\)/);
  assert.match(PRIMITIVE_STYLES, /input\.mw-slider::-moz-range-progress \{[^}]*background: var\(--action\)/);
  assert.match(PRIMITIVE_STYLES, /input\.mw-slider:focus-visible::-webkit-slider-thumb/);
  const slider = renderSlider({ name: "density", value: 28, min: 24, max: 44, label: "密度" });
  assert.match(slider, /data-slot="slider"/);
  assert.match(slider, /--slider-progress: 20%/);
  assert.match(slider, /<output>28<\/output>/);
  assert.match(renderPrimitiveCatalog(), /mw-slider-field/);
  assert.match(PRIMITIVE_STYLES, /td\[aria-current="date"\]:not\(\.is-selected\)/);
  const html = renderPrimitiveCatalog();
  assert.match(html, /mw-catalog__specimen/);
  assert.match(html, /保存中/);
  assert.match(html, /次操作不可用/);
  assert.match(html, /2026-09-10/);
  assert.match(html, /mw-catalog-shell/);
  assert.match(html, /还没有拉取任务/);
  assert.doesNotMatch(html, /mw-catalog-sidebar/);
  assert.match(PRIMITIVE_STYLES, /body\.mw-catalog-page \.mw-catalog \{[\s\S]*overflow: auto/);
  assert.match(PRIMITIVE_STYLES, /\.mw-dir-row\.is-selected::before[\s\S]*?background: var\(--ink\)/);
  assert.match(PRIMITIVE_STYLES, /\.mw-catalog-dir-stage \{[^}]*background: var\(--nav-bg/);
  assert.match(PRIMITIVE_STYLES, /\.mw-catalog-dir \{[^}]*background: transparent/);
  assert.match(PRIMITIVE_STYLES, /\.mw-catalog-shell \{[\s\S]*border-radius: var\(--radius-surface/);
  assert.match(PRIMITIVE_STYLES, /\.mw-catalog-shell \{[\s\S]*grid-template-columns: 48px 240px/);
  assert.match(PRIMITIVE_STYLES, /\.mw-catalog-shell \{[\s\S]*height: 440px/);
  assert.match(PRIMITIVE_STYLES, /\.mw-catalog \.mw-sidebar--rail \{[^}]*border-right: 1px solid var\(--line\)/);
  assert.match(PRIMITIVE_STYLES, /\.mw-catalog \.mw-sidebar--directory \{[^}]*border-right: 1px solid var\(--line\)/);
  assert.match(PRIMITIVE_STYLES, /\.mw-catalog \.mw-sidebar--rail \.mw-btn \{[^}]*width: 36px/);
  assert.match(PRIMITIVE_STYLES, /\.mw-catalog \.mw-frame__heading h2 \{[^}]*font-size: 16px/);
  assert.match(html, /添加已有内容/);
  assert.match(html, /mw-btn--link/);
  assert.doesNotMatch(PRIMITIVE_STYLES, /\.mw-catalog \.mw-frame__header \{[^}]*border-bottom/);
  assert.doesNotMatch(PRIMITIVE_STYLES, /\.mw-form__header \{[^}]*border-bottom/);
  assert.doesNotMatch(PRIMITIVE_STYLES, /\.mw-table th, \.mw-table td \{[^}]*border-bottom: 1px/);
});

test("catalog ships a Linear-referenced palette and complete icon library", () => {
  const html = renderPrimitiveCatalog();
  assert.match(html, /id="palette"/);
  assert.match(html, /id="typeface"/);
  assert.match(html, /id="icons"/);
  assert.match(html, /class="mw-swatch"/);
  assert.match(html, /class="mw-icon-lib"/);
  assert.match(html, /Noto Sans SC/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--hue-indigo: #5e6ad2;/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--plugin-goals: var\(--hue-blue\)/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--plugin-tint: var\(--plugin-feed\)/);
  assert.match(INTERACTION_TEXTURE_STYLES, /\.plugin-rail \.immersive-plugin-link svg \{ color: var\(--plugin-tint, var\(--faint\)\)/);
  assert.doesNotMatch(INTERACTION_TEXTURE_STYLES, /\.plugin-rail \.immersive-plugin-link svg \{ color: var\(--faint\)/);
  assert.doesNotMatch(INTERACTION_TEXTURE_STYLES, /\.plugin-rail \.immersive-plugin-link:hover svg \{ color: var\(--ink-soft\)/);
  assert.deepEqual([...listedIconNames()].sort(), [...registeredIconNames()].sort());
  assert.match(html, /<span>inbox<\/span>/);
  assert.match(html, /Indigo/);
  assert.match(html, /Goals/);
  assert.match(html, /内容平面/);
  assert.match(html, /内容标记/);
  assert.match(html, /陶土/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--content-accent: var\(--hue-slate\)/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--mark-clay: #B27460;/);
});

test("empty states and calendars keep copy grouped and readable", () => {
  assert.match(PRIMITIVE_STYLES, /\.mw-empty \{[\s\S]*align-content: start;[\s\S]*color: var\(--ink-soft\)/);
  assert.match(PRIMITIVE_STYLES, /\.frame-empty\.mw-empty \{[\s\S]*justify-content: center;[\s\S]*gap: 12px/);
  assert.match(PRIMITIVE_STYLES, /\.mw-calendar__outside \{ color: var\(--faint\); \}/);
  assert.doesNotMatch(PRIMITIVE_STYLES, /\.mw-calendar__outside \{[^}]*opacity:/);
});
