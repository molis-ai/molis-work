import { renderPluginPresentationExample } from '../plugin-presentation-example.js';
import { icon, ICON_LIBRARY, PLUGIN_ICON, STATUS_ICON } from "../icons.js";
import { renderProjectMonogram } from "../monogram.js";
import {
  MW_ACTION_TONES,
  MW_CONTENT_MARKS,
  MW_CONTENT_SURFACES,
  MW_HUES,
  MW_STATUS_TONES,
  MW_SURFACES,
  MW_TYPE_TONES,
} from "../palette.js";
import { renderButton } from "./button.js";
import { renderCalendar, renderDatePicker } from "./calendar.js";
import {
  renderAutocomplete,
  renderCheckbox,
  renderCheckboxGroup,
  renderField,
  renderFieldset,
  renderForm,
  renderInput,
  renderInputGroup,
  renderLabel,
  renderMeter,
  renderNumberField,
  renderOtpField,
  renderRadio,
  renderRadioGroup,
  renderSelect,
  renderSlider,
  renderSwitch,
  renderTextarea,
  renderToggle,
  renderChoice,
} from "./field.js";
import {
  renderAlert,
  renderAvatar,
  renderBadge,
  renderEmpty,
  renderKbd,
  renderProgress,
  renderSeparator,
  renderSkeleton,
  renderSpinner,
  renderToast,
} from "./feedback.js";
import {
  renderDirectoryHeading,
  renderDirectoryPanel,
  renderDirectoryRow,
} from "./directory.js";
import {
  renderCard,
  renderFrame,
  renderGroup,
  renderScrollArea,
  renderSidebar,
  renderTable,
} from "./layout.js";
import {
  renderAccordion,
  renderBreadcrumb,
  renderCollapsible,
  renderCombobox,
  renderPagination,
  renderTabs,
  renderToggleGroup,
  renderToolbar,
} from "./navigation.js";
import {
  renderAlertDialog,
  renderCommand,
  renderContextMenu,
  renderDialog,
  renderDrawer,
  renderMenu,
  renderMenuItem,
  renderHint,
  renderPopover,
  renderPreviewCard,
  renderSheet,
  renderTooltip,
} from "./overlay.js";

export const PRIMITIVE_CATALOG_IDS = [
  "accordion", "alert", "alert-dialog", "autocomplete", "avatar", "badge", "breadcrumb", "button",
  "calendar", "card", "checkbox", "checkbox-group", "collapsible", "combobox", "command", "context-menu",
  "date-picker", "dialog", "directory", "drawer", "empty", "field", "fieldset", "form", "frame", "group", "input",
  "input-group", "kbd", "label", "menu", "meter", "number-field", "otp-field", "pagination", "popover",
  "preview-card", "progress", "radio-group", "scroll-area", "select", "separator", "sheet", "sidebar",
  "skeleton", "slider", "spinner", "switch", "table", "tabs", "textarea", "toast", "toggle", "toggle-group",
  "toolbar", "tooltip",
] as const;

function section(id: string, title: string, body: string): string {
  return `<section class="mw-catalog__section" id="${id}" data-primitive="${id}"><h2>${title}</h2>${body}</section>`;
}

/** Section index derived from the rendered sections, so a new section cannot be left out of it. */
function catalogIndex(sections: string): string {
  const entries = [...sections.matchAll(/<section class="mw-catalog__section" id="([^"]+)"[^>]*><h2>([^<]+)<\/h2>/g)];
  const links = entries.map(([, id, title]) => {
    const short = title.split(" / ")[0];
    return `<a href="#${id}" title="${title}">${short}</a>`;
  }).join("");
  return `<nav class="mw-catalog__index" data-catalog-index aria-label="控件目录" style="grid-row: 1 / span ${entries.length}">${links}</nav>`;
}

function mark(id: string, body: string): string {
  return `<div data-primitive="${id}">${body}</div>`;
}

function specimen(label: string, body: string): string {
  return `<figure class="mw-catalog__specimen"><figcaption>${label}</figcaption><div class="mw-catalog__row">${body}</div></figure>`;
}

function swatch(token: string, label: string, role: string, fillToken?: string): string {
  const fill = fillToken
    ? `<i class="mw-swatch__fill" style="background: var(${fillToken})"></i>`
    : "";
  return `<div class="mw-swatch"><i class="mw-swatch__chip" style="background: var(${token})"></i>${fill}<span>${label}</span><small>${role}</small></div>`;
}

function paletteSection(): string {
  const surfaces = MW_SURFACES.map((item) => swatch(item.token, item.label, item.role)).join("");
  const type = MW_TYPE_TONES.map((item) => swatch(item.token, item.label, item.role)).join("");
  const action = MW_ACTION_TONES.map((item) => swatch(item.token, item.label, item.role)).join("");
  const hues = MW_HUES.map((hue) => swatch(`--hue-${hue.id}`, hue.label, hue.role, `--hue-${hue.id}-fill`)).join("");
  const status = MW_STATUS_TONES.map((item) => swatch(item.token, item.label, item.role)).join("");
  const content = MW_CONTENT_SURFACES.map((item) => swatch(item.token, item.label, item.role)).join("");
  const marks = MW_CONTENT_MARKS.map((mark) => swatch(`--mark-${mark.id}`, mark.label, mark.role, `--mark-${mark.id}-fill`)).join("");
  return section("palette", "色板", `<p class="mw-catalog__hint">珍珠灰桌面上一张连续的白色工作面；石墨是主操作与选中，铜色只标焦点、链接和进行中。插件不带身份色，颜色只表达状态与选中。</p><div class="mw-catalog__specimens">
    ${specimen("平面", `<div class="mw-swatch-row">${surfaces}</div>`)}
    ${specimen("字", `<div class="mw-swatch-row">${type}</div>`)}
    ${specimen("动作与强调", `<div class="mw-swatch-row">${action}</div>`)}
    ${specimen("状态", `<div class="mw-swatch-row">${status}</div>`)}
    ${specimen("色相 · 只用于状态标记与内容类型", `<div class="mw-swatch-row">${hues}</div>`)}
    ${specimen("内容平面", `<div class="mw-swatch-row">${content}</div>`)}
    ${specimen("内容标记", `<div class="mw-swatch-row">${marks}</div>`)}
  </div>`);
}

function typefaceSection(): string {
  return section("typeface", "字体", `<p class="mw-catalog__hint">系统无衬线与平台自带中文字体（Apple 为 SF 与苹方，Windows 为 Segoe UI 与微软雅黑）；Inter Variable 与 Noto Sans SC 只作离线后备，字重不合成。正文 400，控件与条目 500，标题 600；代码、终端与 diff 用等宽。</p><div class="mw-catalog__specimens">
    ${specimen("字重角色", `<div class="mw-type-sample">
      <p class="mw-type-sample__display">今天的工作</p>
      <p class="mw-type-sample__title">打磨 Molis Work 的第一印象</p>
      <p class="mw-type-sample__item">让信息流更适合专注阅读 · Feed 已连接</p>
      <p class="mw-type-sample__body">把布局、文字和每一次交互收成一个完整的体验。Molis Work keeps goals, sessions and sources on one surface.</p>
      <p class="mw-type-sample__caption">星期一，9 月 28 日 · 3 / 5 完成依据</p>
      <p class="mw-type-sample__mono"><code>pnpm --filter ./packages/design-system run build</code></p>
    </div>`)}
  </div>`);
}

/** Soft Workbench space, depth, corners, motion and the few moments that get one. */
function craftSection(): string {
  const escape = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
  const lifts = [["--sheet-shadow", "工作面：几乎看不见"], ["--lift-1", "当前 Dock 项 · 分段滑块"], ["--lift-2", "输入条 · 内层抬升"], ["--lift-3", "菜单 · 对话框 · Toast"]]
    .map(([token, role]) => `<div class="mw-craft-lift" style="box-shadow: var(${token})"><code>${token}</code><small>${role}</small></div>`).join("");
  const radii = [["--r-tag", "6"], ["--r-control", "8"], ["--r-row", "10"], ["--r-card", "12"], ["--r-sheet", "14"], ["--r-composer", "15"], ["--r-dialog", "16"]]
    .map(([token, px]) => `<div class="mw-craft-radius" style="border-radius: var(${token})"><code>${token}</code><small>${px}px</small></div>`).join("");
  const motion = [
    ["--dur-press", "130ms", "按下：缩到 .97 再弹回；悬停变色"],
    ["--dur-move", "250ms", "状态移动：分段滑块、选中、展开箭头"],
    ["--dur-arrive", "420ms", "内容到达：上浮 7px 同时淡入"],
    ["引导步骤", "130 + 420ms", "离开向后淡出 130ms，进入按方向滑入 420ms"],
    ["--dur-moment", "640ms", "只属于完成与落地的一刻"],
  ].map(([token, value, role]) => `<tr><td><code>${token}</code></td><td>${value}</td><td>${role}</td></tr>`).join("") +
    `<tr><td><code>--ease-quint</code></td><td>cubic-bezier(.22, 1, .36, 1)</td><td>到达、移动、展开、离开——除按下回弹外的一切</td></tr><tr><td><code>--ease-spring</code></td><td>cubic-bezier(.2, 1.35, .4, 1)</td><td>只用于按下后的回弹与勾选落定</td></tr>`;
  const monograms = [["Molis Work 示例项目", "project-demo"], ["增长实验", "project-growth"], ["Research", "project-research"], ["品牌手册", "project-brand"], ["Onboarding", "project-onboard"]]
    .map(([name, id]) => `<span class="mw-craft-mono">${renderProjectMonogram(name, id, escape)}<small>${escape(name)}</small></span>`).join("");
  return section("craft", "空间 · 层次 · 动效", `<p class="mw-catalog__hint">珍珠灰桌面承载标题栏与常驻底栏；工作是一张连续的白色工作面，插件目录是工作面里的一列。普通内容靠间距、字重与少量分隔线组织；只有抬升的东西——输入条、当前 Dock 项、菜单、对话框、Toast——才有柔和阴影，浮层不再同时画描边。按下回弹，状态 250ms 过渡，内容到达时上浮淡入；减少动态效果时全部静止。</p>
    <div class="mw-catalog__specimens">
      ${specimen("空间 · 桌面、工作面与常驻底栏", `<div class="mw-craft-space" aria-hidden="true"><i class="mw-craft-space__dir"></i><div class="mw-craft-space__main"><i class="mw-craft-space__tabs"></i><div class="mw-craft-space__sheet"><b></b><b></b><b></b></div></div><div class="mw-craft-space__bar"><i></i><em></em><i></i></div></div>`)}
      ${specimen("层次：工作面、抬升与浮层", `<div class="mw-craft-row">${lifts}</div>`)}
      ${specimen("圆角", `<div class="mw-craft-row">${radii}</div>`)}
      ${specimen("动效时长", `<table class="mw-table mw-craft-motion"><thead><tr><th>Token</th><th>时长</th><th>用在哪里</th></tr></thead><tbody>${motion}</tbody></table>`)}
      ${specimen("试一下", `<div class="mw-craft-row">
        ${renderButton({ label: "按一下", variant: "primary" })}
        ${renderButton({ label: "重放到达", variant: "secondary", attrs: { "data-craft-demo": "rise" } })}
        ${renderButton({ label: "新条目落地", variant: "secondary", attrs: { "data-craft-demo": "land" } })}
        ${renderButton({ label: "完成这一条", variant: "secondary", attrs: { "data-craft-demo": "celebrate" } })}
      </div>
      <div class="mw-craft-stage" data-craft-demo-target><span class="mw-craft-stage__title">让第一次使用的人顺利完成一轮目标协作</span><span class="goal-status goal-status--in_progress" data-craft-demo-status>${icon("play")}<span>正在推进</span></span></div>`)}
      ${specimen("项目徽标 · 首字母 + 由 id 决定的色", `<div class="mw-craft-row">${monograms}</div>`)}
      ${specimen("位置芯片 · 标签 · 提示", `<div class="mw-craft-row mw-craft-strip"><button type="button" class="tab-view-chip" data-plugin="goals" aria-current="page">${icon("target")}<span>Goals</span></button><span class="tab-view-divider" aria-hidden="true"></span><span class="mw-craft-tab">${icon("home")}<span>项目首页</span></span><span class="craft-tip mw-craft-tip" data-shown>Inbox<kbd>⌥5</kbd></span></div>`)}
    </div>`);
}

/** The icon inventory: which glyph each plugin and each state uses, and the four sizes. */
function iconInventorySection(): string {
  const PLUGIN_NAMES: Record<string, string> = { home: "项目首页", goals: "Goals", sessions: "Sessions", inbox: "Inbox", feed: "Feed", schedule: "Schedule", workflows: "工作流程", pages: "Pages", form: "Forms", dataset: "Dataset", ppt: "PPT", artifacts: "Artifacts", images: "图片", jelly: "Jelly", cognia: "Cognia", shelf: "Shelf", lingguang: "灵光", coding: "Coding", characters: "Characters", experiments: "实验", alchemist: "炼金术士", "plugin-builder": "插件创作", market: "插件市场", files: "Files", git: "Git", diff: "Diff", "text-stats": "Text stats" };
  const plugins = Object.entries(PLUGIN_ICON).map(([id, glyph]) => `<li>${icon(glyph)}<span><strong>${PLUGIN_NAMES[id] ?? id}</strong><code>${glyph}</code></span></li>`).join("");
  const STATE_NAMES: Record<string, [string, string]> = { todo: ["待开始", "idle"], progress: ["进行中", "progress"], waiting: ["等待", "idle"], "needs-you": ["需要你", "attention"], blocked: ["受阻", "blocked"], done: ["完成", "done"], cancelled: ["取消", "idle"] };
  const states = Object.entries(STATUS_ICON).map(([id, glyph]) => `<li><span class="mw-status mw-status--${STATE_NAMES[id]?.[1] ?? "idle"} mw-status--plain">${icon(glyph)}<span>${STATE_NAMES[id]?.[0] ?? id}</span></span><code>${glyph}</code></li>`).join("");
  const sizes = [[12, "2", "说明文字、计数旁"], [14, "2", "行内、菜单、按钮"], [16, "2", "按钮、行首、标签"], [20, "1.6", "Dock、常驻入口、空态纸张"]]
    .map(([size, stroke, use]) => `<li><span class="mw-icon-size" style="--s:${size}px">${icon("target")}</span><span><strong>${size}px</strong><small>描边 ${stroke} · ${use}</small></span></li>`).join("");
  return section("icon-inventory", "图标清单", `<p class="mw-catalog__hint">全站一套 Lucide 线性图标，24 栅格，不混填充图标。每个插件一个互不重复的图标，Dock、插件切换、标签、市场、空态与搜索用同一个；状态图标语义固定，颜色只来自状态色调。</p>
    <div class="mw-catalog__specimens">
      ${specimen("插件", `<ul class="mw-icon-inventory">${plugins}</ul>`)}
      ${specimen("状态", `<ul class="mw-icon-inventory mw-icon-inventory--states">${states}</ul>`)}
      ${specimen("尺寸与描边", `<ul class="mw-icon-inventory mw-icon-inventory--sizes">${sizes}</ul>`)}
      ${specimen("空态纸张", `<div class="mw-craft-row"><div class="mw-empty"><span class="mw-empty__mark">${icon("clipboard")}</span><strong>还没有问卷</strong><p>新建一份，预览填写，再看结果。</p></div></div>`)}
      ${specimen("加载 · 超过 250ms 才出现", `<div class="mw-craft-row"><p class="mw-loading" role="status">正在读取问卷…</p></div><p class="mw-catalog__hint">结构已知的列表与卡片用静态占位（Skeleton）；结构未知或一次性的等待用这一行。</p>`)}
      ${specimen("读取失败 · 总有下一步", `<div class="mw-craft-row"><div class="mw-empty mw-empty--error" role="alert"><span class="mw-empty__mark">${icon("circle-alert")}</span><strong>列表暂时读不到</strong><p>本地服务没有响应。</p>${renderButton({ label: "重试", variant: "secondary" })}</div></div>`)}
    </div>`);
}

/** Every motion in the product, one specimen each, all on the four durations and two curves. */
function motionSection(): string {
  const demo = (id: string, label: string) => renderButton({ label, variant: "secondary", size: "sm", attrs: { "data-motion-demo": id } });
  return section("motion", "动效标本", `<p class="mw-catalog__hint">时长只用 130 / 250 / 420 / 640ms，曲线只用 --ease-quint 与 --ease-spring；只动 transform 与 opacity。刷新、重绘、切回页面不重放入场；动画中点击与键盘照常响应；减少动态效果时全部关闭，状态照常切换。</p>
    <div class="mw-catalog__specimens mw-motion-grid">
      ${specimen("按压回弹 · 130ms spring", `<div class="mw-craft-row">${renderButton({ label: "按住再松开", variant: "primary" })}</div>`)}
      ${specimen("悬停 · 130ms", `<div class="mw-motion-rows"><button type="button" class="mw-motion-row">移上来看洗底</button><button type="button" class="mw-motion-row">同一种灰，全站一致</button></div>`)}
      ${specimen("菜单展开 · 250ms", `<details class="mw-motion-menu"><summary class="mw-btn mw-btn--secondary mw-btn--sm">打开菜单</summary><div class="mw-menu"><button type="button" class="mw-menu__item">重命名</button><button type="button" class="mw-menu__item">移动到…</button></div></details>`)}
      ${specimen("弹窗进出 · 250ms", `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("dialog", "打开对话框")}</div><dialog class="mw-dialog" data-motion-dialog><p>对话框从控件方向升起，关闭时原路退下。</p><div class="mw-craft-row">${renderButton({ label: "关闭", variant: "primary", attrs: { "data-motion-close": "" } })}</div></dialog></div>`)}
      ${specimen("侧板滑入 · 420ms", `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("sheet", "打开侧板")}</div><dialog class="mw-dialog mw-sheet" data-motion-sheet><p>侧板从右缘滑入，关闭时滑回。</p><div class="mw-craft-row">${renderButton({ label: "关闭", variant: "primary", attrs: { "data-motion-close": "" } })}</div></dialog></div>`)}
      ${specimen("标签切换 · 250ms", `<div class="mw-motion-tabs" role="tablist"><button type="button" class="tab-item" aria-selected="true" data-motion-tab>概览</button><button type="button" class="tab-item" data-motion-tab>终端</button></div>`)}
      ${specimen("分段滑块 · 250ms", `<div class="mw-toggle-group" data-slot="toggle-group" data-seg-thumb role="group"><button class="mw-toggle is-current" type="button" aria-pressed="true">全部</button><button class="mw-toggle" type="button" aria-pressed="false">未读</button><button class="mw-toggle" type="button" aria-pressed="false">已保存</button></div>`)}
      ${specimen("列表首次到达 · 420ms，逐行 ≤12", `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("arrive", "重放到达")}</div><ol class="mw-motion-list" data-motion-list><li>第一行</li><li>第二行</li><li>第三行</li><li>第四行</li><li>第五行</li></ol></div>`)}
      ${specimen("行展开收起 · 250ms", `<details class="mw-motion-row-detail mw-disclosure"><summary>展开这一行</summary><p>内容从上方落定；收起立即完成，不拉动其他行。</p></details>`)}
      ${specimen("页面 / 插件切换 · 130ms", `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("switch", "切换页面")}</div><div class="mw-motion-pages"><section data-motion-page>Goals 页面</section><section data-motion-page hidden>Feed 页面</section></div></div>`)}
      ${specimen("Toast · 250ms", `<div class="mw-craft-row">${demo("toast", "显示提示")}</div>`)}
      ${specimen("完成时刻 · 640ms", `<p class="mw-catalog__hint">见上方「试一下 → 完成这一条」：状态换成完成、一次落定，不循环。</p>`)}
    </div>`);
}

function iconSection(): string {
  const groups = ICON_LIBRARY.map((group) => {
    const items = group.icons.map((name) => `<li>${icon(name)}<span>${name}</span></li>`).join("");
    return `<div class="mw-icon-lib__group"><h3>${group.label}</h3><ul>${items}</ul></div>`;
  }).join("");
  return section("icons", "图标", `<div class="mw-icon-lib">${groups}</div>`);
}

export function renderPrimitiveCatalog(): string {
  const primary = renderButton({ label: "保存", variant: "primary" });
  const secondary = renderButton({ label: "取消", variant: "secondary" });
  const ghost = renderButton({ label: "更多", variant: "ghost", icon: "more" });
  const danger = renderButton({ label: "删除", variant: "danger" });
  const dangerOutline = renderButton({ label: "移入回收站", variant: "danger-outline" });
  const link = renderButton({ label: "打开链接", variant: "link" });
  const iconBtn = renderButton({ label: "关闭", variant: "ghost", size: "icon", icon: "x", iconOnly: true });
  const loading = renderButton({ label: "保存中", variant: "primary", loading: true });
  const disabled = renderButton({ label: "不可用", variant: "primary", disabled: true });
  const disabledSecondary = renderButton({ label: "次操作不可用", variant: "secondary", disabled: true });
  const sizes = ["sm", "md", "lg"].map((size) => renderButton({ label: size, variant: "secondary", size: size as "sm" | "md" | "lg" })).join("");

  const input = renderField({
    label: "目标名称",
    required: true,
    hint: "一句话说明要完成什么",
    control: renderInput({ name: "catalog-title", placeholder: "例如：统一控件语言", required: true }),
  });
  const invalid = renderField({
    label: "失败示例",
    error: "需要填写名称后才能创建。",
    control: renderInput({ name: "catalog-invalid", invalid: true, value: "" }),
  });
  const disabledField = renderField({
    label: "只读名称",
    hint: "已从上级 Goal 带入，不能改。",
    control: renderInput({ name: "catalog-disabled", value: "统一控件语言", disabled: true }),
  });
  const textarea = renderField({
    label: "要得到的结果",
    control: renderTextarea({ name: "catalog-outcome", placeholder: "完成后可观察的结果" }),
  });
  const select = renderField({
    label: "所属上级 Goal",
    control: renderSelect({
      name: "catalog-parent",
      optionsHtml: `<option value="">作为独立 Goal</option><option value="a">产品主链</option>`,
    }),
  });
  const checks = `${renderCheckbox({ name: "catalog-dep", label: "收尾前需要前置完成", checked: true })}${renderCheckbox({ name: "catalog-dep-off", label: "不可用依赖", disabled: true })}${renderRadio({ name: "catalog-radio", value: "a", label: "选项 A", checked: true })}${renderRadio({ name: "catalog-radio", value: "b", label: "选项 B" })}${renderSwitch({ name: "catalog-switch", label: "启用定时拉取", checked: true })}`;
  const group = renderInputGroup({
    start: icon("search"),
    control: renderInput({ type: "search", placeholder: "搜索 Goal、Feed、Session" }),
  });
  const fieldset = renderFieldset({
    legend: "执行前置",
    hint: "只有确实要等对方完成后才能收尾时才选择。",
    body: renderCheckbox({ name: "catalog-fs", label: "设计系统原语" }),
  });
  const form = renderForm({
    header: `<div><h2>表单壳</h2><p>固定标题与操作，字段内部滚动。</p></div>`,
    body: input,
    footer: `${secondary}${primary}`,
    className: "mw-catalog-form",
  });

  const badges = ["neutral", "info", "success", "warning", "danger"]
    .map((tone) => renderBadge({ label: tone, tone: tone as "neutral" | "info" | "success" | "warning" | "danger" }))
    .join("");
  const alerts = renderAlert({ title: "保存失败", body: "连接中断，草稿仍在，可以重试。", tone: "danger" })
    + renderAlert({ title: "已保存配置", body: "拉取计划单独生效。", tone: "success" });
  const empty = renderEmpty({
    icon: "terminal",
    title: "这个项目还没有 Session",
    body: "启动一条新的工作会话，或关联已有的 Runtime 会话。",
    action: renderButton({ label: "新建 Session", icon: "plus", variant: "primary" }),
  });
  const emptyStarts = renderEmpty({
    icon: "note",
    title: "还没有文档",
    body: "先建一篇，在纸面上写；也可以从模板或已有文件开始。",
    action: `<div class="mw-empty__actions">${renderButton({ label: "从模板新建", icon: "library", variant: "ghost" })}${renderButton({ label: "导入已有文档", icon: "upload", variant: "ghost" })}</div>`,
  });

  const sheet = renderSheet({
    labelledBy: "catalog-sheet-title",
    title: "新建 Goal",
    description: "贴工作区右缘。取消不写入。",
    body: input,
    footer: `${secondary}${primary}`,
    attrs: { "data-catalog-demo": "sheet" },
  });
  const dialog = renderDialog({
    labelledBy: "catalog-dialog-title",
    title: "确认操作",
    description: "居中紧凑确认。",
    body: `<p>只整理 Molis Work 记录，不删除 Runtime 原生内容。</p>`,
    footer: `${secondary}${primary}`,
    attrs: { "data-catalog-demo": "dialog" },
  });
  const alertDialog = renderAlertDialog({
    labelledBy: "catalog-alert-title",
    title: "移入回收站",
    description: "该操作可恢复。",
    body: `<p>Goal 历史会保留。</p>`,
    footer: `${secondary}${danger}`,
    attrs: { "data-catalog-demo": "alert" },
  });
  const drawer = renderDrawer({
    labelledBy: "catalog-drawer-title",
    title: "目录",
    description: "窄屏从左缘覆盖工作区。",
    body: `<p>Goals / Feed / Session</p>`,
    footer: secondary,
    attrs: { "data-catalog-demo": "drawer" },
  });
  const calendar = renderCalendar({ year: 2026, month: 8, today: "2026-09-17", selected: "2026-09-10" });
  const datePicker = renderDatePicker({
    name: "catalog-date",
    value: "2026-09-17",
    calendar: { year: 2026, month: 8, today: "2026-09-17", selected: "2026-09-17", compact: true },
  });
  const catalogDirTools = renderButton({ label: "筛选", variant: "ghost", size: "icon", icon: "filter", iconOnly: true })
    + renderButton({ label: "搜索", variant: "ghost", size: "icon", icon: "search", iconOnly: true });
  const catalogDirRows = renderDirectoryRow({
    title: "全部",
    caption: "所有来源的流水",
    icon: "rss",
    count: 12,
    density: "meta",
  }) + renderDirectoryHeading("拉取任务") + renderDirectoryRow({
    title: "设计观察",
    caption: "10 分钟前",
    status: "运行中",
    statusTone: "progress",
    statusIcon: "check",
    icon: "refresh",
    count: 4,
    density: "meta",
    current: true,
    trailing: renderButton({ label: "任务配置", variant: "ghost", size: "icon", icon: "more", iconOnly: true }),
  }) + renderDirectoryRow({
    title: "runtime / 本地会话",
    caption: "本地 Runtime",
    status: "可查看",
    statusTone: "idle",
    statusIcon: "ready",
    icon: "refresh",
    count: 2,
    density: "meta",
  }) + renderDirectoryRow({
    title: "确认对象边界",
    caption: "你手工加入",
    status: "待处理",
    statusTone: "attention",
    statusIcon: "bell",
    icon: "refresh",
    count: 1,
    density: "meta",
  });
  const catalogDirectory = renderDirectoryPanel({
    pluginId: "catalog",
    label: "Feed",
    listLabel: "目录示例",
    listRole: "none",
    tools: catalogDirTools,
    body: catalogDirRows,
    add: { label: "添加任务" },
  });
  const catalogCompact = renderDirectoryPanel({
    pluginId: "catalog-compact",
    label: "Sessions",
    listLabel: "会话",
    listRole: "none",
    body: renderDirectoryRow({
      title: "runtime / 本地会话",
      status: "可查看",
      statusTone: "idle",
      statusIcon: "ready",
      density: "compact",
      current: true,
    }) + renderDirectoryRow({
      title: "确认对象边界",
      status: "待处理",
      statusTone: "attention",
      statusIcon: "bell",
      density: "compact",
    }) + renderDirectoryRow({
      title: "quarterly-planning-notes-and-a-very-long-session-name",
      status: "可查看",
      statusTone: "idle",
      statusIcon: "ready",
      density: "compact",
    }),
    add: { label: "新建 Session" },
  });
  const catalogDirectoryEmpty = renderDirectoryPanel({
    pluginId: "catalog-empty",
    label: "Feed",
    listLabel: "空目录",
    listRole: "none",
    body: "",
    empty: renderEmpty({
      icon: "rss",
      title: "还没有拉取任务",
      body: "添加一个来源后，新内容会出现在这里。",
    }),
    add: { label: "添加任务" },
  });
  const yieldOps = renderButton({ label: "复制", variant: "ghost", size: "icon", icon: "copy", iconOnly: true })
    + renderButton({ label: "隐藏", variant: "ghost", size: "icon", icon: "x", iconOnly: true })
    + renderButton({ label: "删除副本", variant: "ghost", size: "icon", icon: "trash", iconOnly: true });
  const catalogYield = renderDirectoryPanel({
    pluginId: "catalog-yield",
    label: "材料",
    listLabel: "行让位",
    listRole: "none",
    body: renderDirectoryRow({
      title: "试用示例.pdf",
      icon: "file",
      density: "compact",
      fileName: true,
      yield: true,
      trailing: yieldOps,
    }) + renderDirectoryRow({
      title: "quarterly-planning-notes-and-a-very-long-working-copy-filename.pdf",
      icon: "file",
      density: "compact",
      current: true,
      fileName: true,
      yield: true,
      trailing: yieldOps,
    }),
  });
  const catalogShellDirectory = renderDirectoryPanel({
    pluginId: "catalog-shell",
    label: "Feed",
    listLabel: "目录示例",
    listRole: "none",
    tools: catalogDirTools,
    body: renderDirectoryRow({
      title: "全部",
      caption: "所有来源的流水",
      icon: "rss",
      count: 12,
      density: "meta",
    }) + renderDirectoryHeading("拉取任务") + renderDirectoryRow({
      title: "设计观察",
      caption: "10 分钟前",
      status: "运行中",
      statusTone: "progress",
      statusIcon: "check",
      icon: "refresh",
      count: 4,
      density: "meta",
      current: true,
      trailing: renderButton({ label: "任务配置", variant: "ghost", size: "icon", icon: "more", iconOnly: true }),
    }) + renderDirectoryRow({
      title: "确认对象边界",
      caption: "你手工加入",
      status: "待处理",
      statusTone: "attention",
      statusIcon: "bell",
      icon: "refresh",
      count: 1,
      density: "meta",
    }),
    add: { label: "添加任务" },
  });
  const catalogShell = `<div class="mw-catalog-shell">${mark("sidebar", renderSidebar({
    variant: "rail",
    body: renderButton({ label: "Goals", variant: "ghost", size: "icon", icon: "target", iconOnly: true, attrs: { "data-plugin-id": "goals" } })
      + renderButton({
        label: "Feed",
        variant: "ghost",
        size: "icon",
        icon: "rss",
        iconOnly: true,
        attrs: { "aria-current": "page", "data-plugin-id": "feed" },
      })
      + renderButton({ label: "Sessions", variant: "ghost", size: "icon", icon: "terminal", iconOnly: true, attrs: { "data-plugin-id": "sessions" } }),
  }) + renderSidebar({
    variant: "directory",
    body: catalogShellDirectory,
  }))}${mark("frame", renderFrame({
    title: "设计观察",
    description: "运行中 · 当前任务的流水",
    action: renderButton({ label: "添加已有内容", variant: "link", size: "sm" }),
    panel: "<p>第一次打开这条任务时，人会先扫目录里哪一条是当前的，再落到纸面上的流水。</p><p>栏留在灰色里，正文自己发亮。页眉和正文靠间距分开，不要再画一条线把它们切成两块。</p>",
  }))}</div>`;

  /* Compositions: the same primitives put together the way product pages put them together. */
  const composeRows = [
    ["打磨 Molis Work 的第一印象", "进行中 · 今天", "progress"],
    ["让信息流更适合专注阅读", "待确认 · 昨天", "attention"],
    ["从已有资料开始一个项目", "草稿 · 9 月 25 日", "idle"],
  ].map(([title, caption, tone], index) => renderDirectoryRow({
    title, caption, icon: "target", density: "meta", current: index === 0, statusTone: tone as "progress" | "attention" | "idle",
    attrs: { "data-compose-item": title, "data-compose-caption": caption },
  })).join("");
  const composeSplit = `<div class="mw-compose mw-compose--split" data-compose-split>
    <div class="mw-compose__list">${renderDirectoryPanel({ pluginId: "compose-list", label: "目标", listLabel: "目标", listRole: "none", body: composeRows, add: { label: "新建目标" } })}</div>
    <div class="mw-compose__detail">${renderFrame({
      title: "打磨 Molis Work 的第一印象",
      description: "进行中 · 今天",
      action: renderButton({ label: "记录进展", variant: "primary", size: "sm", icon: "plus" }),
      panel: `<p data-compose-body>让布局、文字和每一次交互收成一个完整的体验。选左边任一条，右边随之切换；选中的行是一块中性的底色，不是彩色描边。</p>`,
    })}</div>
  </div>`;
  const composeFilterMenu = renderMenu({
    items: renderMenuItem({ label: "只看进行中", iconName: "check" }) + renderMenuItem({ label: "含已归档", iconName: "archive" }) + renderMenuItem({ label: "清除筛选", iconName: "x" }),
  });
  const composeToolbar = `<div class="mw-compose mw-compose--toolbar">${renderToolbar({ body: `
    <div class="mw-compose__search">${renderInputGroup({ start: icon("search"), control: renderInput({ type: "search", placeholder: "搜索标题、来源" }) })}</div>
    ${renderToggleGroup({ label: "视图", items: [{ value: "list", label: "列表", current: true }, { value: "board", label: "看板" }, { value: "canvas", label: "画布" }] })}
    <div class="mw-compose__anchor">${renderButton({ label: "筛选", variant: "secondary", icon: "filter", attrs: { "data-compose-menu-toggle": "", "aria-expanded": "false", "aria-haspopup": "menu" } })}<div class="mw-compose__menu" data-compose-menu hidden>${composeFilterMenu}</div></div>
    <span class="mw-compose__spacer"></span>
    ${renderButton({ label: "新建", variant: "primary", icon: "plus" })}` })}</div>`;
  const composeForm = renderForm({
    header: `<div><h2>添加来源</h2><p>提交前就地说明哪里需要修正，草稿不丢。</p></div>`,
    body: renderAlert({ title: "还不能保存", body: "网址和拉取频率需要修正。", tone: "danger" })
      + renderField({ label: "来源网址", error: "这不是有效的网址。", control: renderInput({ name: "compose-url", value: "example", invalid: true }) })
      + renderField({ label: "名称", hint: "显示在目录里。", control: renderInput({ name: "compose-name", value: "设计观察" }) })
      + renderField({ label: "说明", control: renderTextarea({ name: "compose-note", placeholder: "为什么关注这个来源" }) }),
    footer: `${renderButton({ label: "取消", variant: "secondary" })}${renderButton({ label: "保存", variant: "primary" })}`,
    className: "mw-catalog-form",
  });
  const composeDialog = renderDialog({
    labelledBy: "compose-dialog-title",
    title: "移动到",
    description: "对话框里的选择与菜单，都从触发它的控件长出来。",
    body: renderField({ label: "目标项目", control: renderSelect({ name: "compose-project", optionsHtml: `<option>Molis Work 示例项目</option><option>增长实验</option><option>Research</option>` }) })
      + `<div class="mw-compose__anchor mw-compose__anchor--inline">${renderButton({ label: "更多操作", variant: "secondary", icon: "more", attrs: { "data-compose-menu-toggle": "", "aria-expanded": "false", "aria-haspopup": "menu" } })}<div class="mw-compose__menu" data-compose-menu hidden>${renderMenu({ items: renderMenuItem({ label: "复制链接", iconName: "link" }) + renderMenuItem({ label: "移入回收站", iconName: "trash", danger: true }) })}</div></div>`,
    footer: `${renderButton({ label: "取消", variant: "secondary", attrs: { "data-dialog-close": "" } })}${renderButton({ label: "移动", variant: "primary" })}`,
    attrs: { "data-catalog-demo": "compose-dialog" },
  });
  const composeLong = `<div class="mw-compose mw-compose--long">${renderScrollArea({
    className: "mw-compose__scroll",
    body: `<h3>长内容</h3><p>工作面内部各自滚动：外层滚正文，内层的代码块和附件列表各管各的，滚到尽头不会带动外面。</p>
      <pre class="mw-compose__code"><code>pnpm --filter ./packages/design-system --filter ./apps/workbench run build && node dist/web/server.js --port 4251 --home ~/.molis-work</code></pre>
      ${renderScrollArea({ className: "mw-compose__nested", body: Array.from({ length: 12 }, (_, index) => `<p>附件 ${index + 1} · 设计手记-${index + 1}.pdf</p>`).join("") })}
      ${Array.from({ length: 6 }, (_, index) => `<p>第 ${index + 1} 段：页眉和正文靠间距分开，行与行贴紧，组和组才拉开。连续的白色工作面里，层次先靠字重与字号，再靠少量分隔线。</p>`).join("")}`,
  })}</div>`;
  const composeNarrow = `<div class="mw-compose mw-compose--narrow" data-compose-narrow>
    <div class="mw-compose__density"><span>密度</span><div class="mw-choice-group" role="group" aria-label="界面密度">${renderChoice({ label: "标准", icon: "rows", selected: true, attrs: { "data-density-option": "standard" } })}${renderChoice({ label: "紧凑", icon: "list", attrs: { "data-density-option": "compact" } })}</div></div>
    <div class="mw-compose__resizable">${renderToolbar({ body: `${renderButton({ label: "新建", variant: "primary", icon: "plus" })}${renderButton({ label: "筛选", variant: "secondary", icon: "filter" })}${renderButton({ label: "工作规划", variant: "ghost", icon: "workflow" })}` })}${renderDirectoryPanel({ pluginId: "compose-narrow", label: "目标", listLabel: "目标", listRole: "none", body: composeRows })}</div>
    <p class="mw-catalog__hint">拖动右下角改变宽度：窄于 420px 时工具条只留图标，名称仍是可访问名称。</p>
  </div>`;
  const choiceSection = section("choice", "Choice", `<p class="mw-catalog__hint">几个并排的选项：白色小选项，选中后变成石墨并出现勾。用于引导步骤与偏好；很多条目的列表不用它。</p><div class="mw-catalog__specimens">
    ${mark("choice", specimen("按钮 · aria-pressed", `<div class="mw-choice-group" role="group" aria-label="主题" data-catalog-choice-group>${renderChoice({ label: "浅色", icon: "sun", selected: true })}${renderChoice({ label: "深色", icon: "moon" })}${renderChoice({ label: "跟随系统", icon: "system" })}</div>`))}
    ${specimen("链接 · aria-current", `<div class="mw-choice-group" role="group" aria-label="语言">${renderChoice({ label: "简体中文", href: "#choice", selected: true })}${renderChoice({ label: "English", href: "#choice" })}</div>`)}
  </div>`);
  const composeSection = section("compose", "组合", `<p class="mw-catalog__hint">组件放在一起时依然精致：目录与详情、工具条与筛选、带错误的表单、对话框里的菜单、长内容与嵌套滚动、窄窗口与密度。都可以实际操作。底栏与它的浮层在工作台页面里由 Workbench 组合，见本页末尾。</p><div class="mw-catalog__specimens">
    ${specimen("目录与详情", composeSplit)}
    ${specimen("工具条与筛选", composeToolbar)}
    ${specimen("带错误的表单", composeForm)}
    ${specimen("对话框里的菜单", renderButton({ label: "打开对话框", variant: "secondary", attrs: { "data-catalog-open": "compose-dialog" } }) + composeDialog)}
    ${specimen("长内容与嵌套滚动", composeLong)}
    ${specimen("窄窗口与密度", composeNarrow)}
  </div>`);

  const sections = `
    ${paletteSection()}
    ${typefaceSection()}
    ${iconSection()}
    ${iconInventorySection()}
    ${craftSection()}
    ${motionSection()}
    ${choiceSection}
    ${composeSection}
    ${section("plugin-composition", "插件页面组合", renderPluginPresentationExample())}
    ${section("button", "Button", `<div class="mw-catalog__specimens">
      ${specimen("主操作", `${primary}${secondary}${ghost}`)}
      ${specimen("破坏性", `${danger}${dangerOutline}`)}
      ${specimen("文字 / 图标", `${link}${iconBtn}`)}
      ${specimen("状态", `${loading}${disabled}${disabledSecondary}`)}
      ${specimen("尺寸", `<div class="mw-catalog__sizes">${sizes}</div>`)}
    </div>`)}
    ${section("field", "Field / Input / Textarea / Select", `<div class="mw-catalog__specimens">
      ${mark("field", specimen("默认", input))}
      ${mark("input", specimen("错误", invalid))}
      ${specimen("禁用", disabledField)}
      ${mark("textarea", specimen("多行", textarea))}
      ${mark("select", specimen("选择", select))}
      ${mark("label", specimen("独立标签", renderLabel({ text: "独立标签" })))}
      ${mark("checkbox", specimen("选择控件", checks))}
      ${mark("input-group", specimen("输入组合", group))}
      ${mark("fieldset", specimen("字段组", fieldset))}
    </div>`)}
    ${section("groups", "Checkbox Group / Radio Group / Switch", `<div class="mw-catalog__specimens">${mark("checkbox-group", specimen("多选组", renderCheckboxGroup({
      legend: "完成依赖",
      body: renderCheckbox({ name: "g1", label: "设计系统" }) + renderCheckbox({ name: "g2", label: "浏览器验证" }),
    })))}${mark("radio-group", specimen("单选组", renderRadioGroup({
      legend: "视图",
      name: "catalog-view",
      items: [{ value: "list", label: "列表", checked: true }, { value: "board", label: "看板" }],
    })))}${mark("switch", specimen("开关", renderSwitch({ name: "catalog-switch-2", label: "显示已归档", checked: false })))}</div>`)}
    ${section("advanced-field", "Number / OTP / Slider / Meter / Autocomplete", `<div class="mw-catalog__specimens">
      ${mark("number-field", specimen("数字", renderNumberField({ name: "priority", value: 50, min: 0, max: 100 })))}
      ${mark("otp-field", specimen("验证码", renderOtpField({ name: "otp" })))}
      ${mark("slider", specimen("滑杆", renderSlider({ name: "density", value: 28, min: 24, max: 44, label: "密度" })))}
      ${mark("meter", specimen("计量", renderMeter({ value: 64, label: "子项进度" })))}
      ${mark("autocomplete", specimen("建议", renderAutocomplete({
      placeholder: "搜索 Goal",
      items: `<button type="button" role="option">统一控件语言</button><button type="button" role="option">产品主链</button>`,
    })))}
    </div>`)}
    ${section("form", "Form", form)}
    ${section("badge", "Badge / Alert / Empty", `<div class="mw-catalog__specimens">
      ${mark("badge", specimen("状态标", badges))}
      ${mark("alert", specimen("提示", alerts))}
      ${mark("empty", specimen("空态 · 一个首要动作", empty))}
      ${specimen("空态 · 几个起点", emptyStarts)}
    </div>`)}
    ${section("feedback", "Toast / Spinner / Skeleton / Progress / Kbd / Avatar", `<div class="mw-catalog__specimens">
      ${mark("toast", specimen("短反馈", renderToast({ message: "已保存" })))}
      ${mark("spinner", specimen("加载", renderSpinner({ label: "加载中" })))}
      ${mark("skeleton", specimen("占位", renderSkeleton()))}
      ${mark("progress", specimen("进度", renderProgress({ value: 40, label: "子项进度" })))}
      ${mark("kbd", specimen("快捷键", renderKbd("⇧F10")))}
      ${mark("avatar", specimen("头像", renderAvatar({ label: "一骏" })))}
    </div>`)}
    ${section("separator", "Separator", renderSeparator())}
    ${section("calendar", "Calendar / Date Picker", `<div class="mw-catalog__specimens">${specimen("月历 · 今天描边，选中近黑", calendar)}${mark("date-picker", specimen("日期字段", datePicker))}</div>`)}
    ${section("overlay", "Dialog / Sheet / Alert Dialog / Drawer", `<p class="mw-catalog__hint">Sheet 贴右缘；Dialog 居中；Drawer 窄屏从边缘覆盖；Alert Dialog 用于破坏性确认。</p>
      <div class="mw-catalog__specimens">${specimen("打开浮层", `
        ${renderButton({ label: "打开 Sheet", variant: "secondary", attrs: { "data-catalog-open": "sheet" } })}
        ${renderButton({ label: "打开 Dialog", variant: "secondary", attrs: { "data-catalog-open": "dialog" } })}
        ${renderButton({ label: "打开 Alert", variant: "danger-outline", attrs: { "data-catalog-open": "alert" } })}
        ${renderButton({ label: "打开 Drawer", variant: "secondary", attrs: { "data-catalog-open": "drawer" } })}
      `)}</div>
      ${mark("sheet", sheet)}${mark("dialog", dialog)}${mark("alert-dialog", alertDialog)}${mark("drawer", drawer)}`)}
    ${section("menu", "Menu / Context Menu / Popover / Tooltip / Command / Preview Card", `<div class="mw-catalog__specimens">${mark("menu", specimen("菜单", renderMenu({
      items: renderMenuItem({ label: "固定标签", iconName: "check" }) + renderMenuItem({ label: "关闭", iconName: "x", danger: true }),
    })))}${mark("context-menu", specimen("右键菜单", renderContextMenu({
      items: renderMenuItem({ label: "固定标签", iconName: "lock" }) + renderMenuItem({ label: "关闭标签", iconName: "x", danger: true }),
    })))}${mark("popover", specimen("弹出层", renderPopover({ body: "项目切换", preview: true })))}${mark("tooltip", specimen("标题旁说明", renderHint({ id: "catalog-hint", label: "如何生效", text: "只发送当前生效版本。" })) + specimen("短标签", renderTooltip({ text: "当前 Goal" })))}${mark("command", specimen("命令面板", renderCommand({
      labelledBy: "catalog-command",
      placeholder: "搜索并跳转",
      groups: `<button type="button" role="option">Goals · 统一控件语言</button>`,
    })))}${mark("preview-card", specimen("预览", renderPreviewCard({ title: "统一控件语言", body: "Goal · 进行中 · 下一步：收口旧按钮 class。" })))}</div>`)}
    ${section("tabs", "Tabs / Toolbar / Toggle / Collapsible / Combobox / Accordion / Pagination / Breadcrumb", `<div class="mw-catalog__specimens">${mark("tabs", specimen("页签", renderTabs({
      label: "来源详情",
      tabs: [{ id: "overview", label: "概览", selected: true }, { id: "schedule", label: "定时拉取" }],
    })))}${mark("toolbar", specimen("工具条", renderToolbar({ body: primary + ghost })))}${mark("toggle", specimen("开关按钮", renderToggle({ label: "钉住", pressed: true })))}${mark("toggle-group", specimen("分段", renderToggleGroup({
      label: "视图",
      items: [{ value: "list", label: "列表", current: true }, { value: "board", label: "看板" }, { value: "canvas", label: "画布" }],
    })))}${mark("collapsible", specimen("折叠", renderCollapsible({ summary: "补充说明与验收条件", body: "<p>可稍后补。</p>" })))}${specimen("披露 · 设置区里的次要内容", `<details class="mw-disclosure"><summary>调整选项与高级设置</summary><p class="mw-catalog__hint">系统三角隐藏，12px 折角向右，展开后转向下。</p></details>`)}${mark("combobox", specimen("组合框", renderCombobox({
      placeholder: "选择 Goal",
      items: `<button type="button" role="option">产品主链</button>`,
    })))}${mark("accordion", specimen("手风琴", renderAccordion({
      items: [
        { summary: "项目说明", body: "<p>项目是内容范围。</p>", open: true },
        { summary: "工作规则", body: "<p>领取门槛只约束之后的工作。</p>" },
      ],
    })))}${mark("pagination", specimen("分页", renderPagination({ page: 2, pages: 5 })))}${mark("breadcrumb", specimen("路径", renderBreadcrumb({
      items: [{ label: "规划方法", href: "#" }, { label: "工作类型" }, { label: "当前方法" }],
    })))}</div>`)}
    ${section("directory", "Directory Panel / Row", `<p class="mw-catalog__hint">目录行 hover 是 180ms 让位，不是一块跟着鼠标走的底片。长标题在标题槽里省略，行尾状态完整留下；带行尾动作的行用 <code>yield</code>，静止不预留动作槽。</p>
      <div class="mw-catalog__specimens">${specimen("目录栏", `<div class="mw-catalog-dir-stage"><div class="mw-catalog-dir">${catalogDirectory}</div></div>`)}${specimen("单行", `<div class="mw-catalog-dir-stage"><div class="mw-catalog-dir">${catalogCompact}</div></div>`)}${specimen("行让位", `<div class="mw-catalog-dir-stage is-yield"><div class="mw-catalog-dir">${catalogYield}</div></div>`)}${specimen("空态", `<div class="mw-catalog-dir-stage"><div class="mw-catalog-dir">${catalogDirectoryEmpty}</div></div>`)}</div>`)}
    ${section("layout", "Sidebar / Frame / Group / Card / Scroll Area / Table", `<div class="mw-catalog__specimens">${specimen("栏与内容框", catalogShell)}${mark("group", specimen("成组工具", renderGroup({
      label: "历史",
      body: renderButton({ label: "上一步", variant: "ghost", size: "icon", icon: "back", iconOnly: true })
        + renderButton({ label: "下一步", variant: "ghost", size: "icon", icon: "arrow", iconOnly: true }),
    })))}${mark("card", specimen("卡片", renderCard({
      title: "快捷方式",
      description: "打开常用入口。",
      body: "<p>添加快捷方式后显示在这里。</p>",
      footer: renderButton({ label: "添加", variant: "secondary", size: "sm" }),
    })))}${mark("scroll-area", specimen("内部滚动", renderScrollArea({
      className: "mw-catalog-scroll",
      body: "<p>目录超过这一屏高度后，只在栏内滚动，外面的工作区不动。</p><p>第二段用来把滚动条唤醒：行与行仍然贴紧，组和组才拉开。</p><p>纸面用发丝线围住，不是描边玩具盒。</p><p>再往下还有一屏，确认 overflow 真的发生。</p>",
    })))}${mark("table", specimen("表格", renderTable({
      head: ["Goal", "状态", "下一步"],
      rows: [["统一控件语言", "进行中", "收口旧 class"], ["Home 月历", "可用", "接 Calendar"]],
    })))}</div>`)}`;
  return `<div class="mw-catalog">
    ${catalogIndex(sections)}
    ${sections}
  </div>
  <script>
    document.addEventListener("click", (event) => {
      const motion = event.target.closest("[data-motion-demo], [data-motion-close], [data-motion-tab]");
      if (motion) {
        const kind = motion.dataset.motionDemo;
        if (motion.hasAttribute("data-motion-close")) motion.closest("dialog")?.close();
        if (motion.hasAttribute("data-motion-tab")) motion.parentElement.querySelectorAll("[data-motion-tab]").forEach((tab) => tab.setAttribute("aria-selected", String(tab === motion)));
        if (kind === "dialog") document.querySelector("[data-motion-dialog]")?.showModal();
        if (kind === "sheet") document.querySelector("[data-motion-sheet]")?.showModal();
        if (kind === "arrive") { const list = document.querySelector("[data-motion-list]"); list.classList.remove("is-arriving"); void list.offsetWidth; list.classList.add("is-arriving"); }
        if (kind === "switch") document.querySelectorAll("[data-motion-page]").forEach((page) => { page.hidden = !page.hidden; });
        if (kind === "toast") { const toast = document.querySelector(".toast") || Object.assign(document.body.appendChild(document.createElement("div")), { className: "toast" }); toast.textContent = "已保存"; toast.classList.add("is-visible"); setTimeout(() => toast.classList.remove("is-visible"), 1600); }
        return;
      }
      const demo = event.target.closest("[data-craft-demo]");
      if (!demo) return;
      const target = document.querySelector("[data-craft-demo-target]");
      const status = document.querySelector("[data-craft-demo-status]");
      if (!target || !status) return;
      if (demo.dataset.craftDemo === "rise") { target.classList.remove("is-rising"); void target.offsetWidth; target.classList.add("is-rising"); }
      if (demo.dataset.craftDemo === "land") globalThis.molisCraft?.land(target);
      if (demo.dataset.craftDemo === "celebrate") {
        const done = status.classList.toggle("goal-status--completed");
        status.classList.toggle("goal-status--in_progress", !done);
        status.querySelector("span").textContent = done ? "已完成" : "正在推进";
        if (done) globalThis.molisCraft?.celebrate(target);
      }
    });
    (() => {
      const scroller = document.querySelector(".mw-catalog");
      const links = new Map([...document.querySelectorAll("[data-catalog-index] a")].map((link) => [link.getAttribute("href").slice(1), link]));
      if (!scroller || !links.size || !("IntersectionObserver" in window)) return;
      const mark = (id) => links.forEach((link, key) => {
        if (key === id) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
      const observer = new IntersectionObserver((entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) mark(visible.target.id);
      }, { root: scroller, rootMargin: "0px 0px -72% 0px" });
      document.querySelectorAll(".mw-catalog__section[id]").forEach((section) => observer.observe(section));
      mark(links.keys().next().value);
    })();
    document.querySelectorAll("[data-catalog-open]").forEach((button) => {
      button.addEventListener("click", () => {
        const kind = button.getAttribute("data-catalog-open");
        document.querySelector("[data-catalog-demo='" + kind + "']")?.showModal();
      });
    });
    document.querySelectorAll("dialog[data-catalog-demo] [data-dialog-close]").forEach((button) => {
      button.addEventListener("click", () => button.closest("dialog")?.close());
    });
    document.querySelectorAll("[data-catalog-choice-group]").forEach((group) => {
      group.addEventListener("click", (event) => {
        const chosen = event.target.closest(".mw-choice");
        if (!chosen) return;
        group.querySelectorAll(".mw-choice").forEach((item) => item.setAttribute("aria-pressed", String(item === chosen)));
      });
    });
    document.querySelectorAll("[data-compose-split]").forEach((split) => {
      split.addEventListener("click", (event) => {
        const row = event.target.closest("[data-compose-item]");
        if (!row) return;
        split.querySelectorAll("[data-compose-item]").forEach((item) => {
          item.classList.toggle("is-selected", item === row);
          if (item === row) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
        });
        const frame = split.querySelector(".mw-compose__detail .mw-frame");
        const heading = frame?.querySelector("h2");
        const caption = frame?.querySelector(".mw-frame__heading p");
        if (heading) heading.textContent = row.getAttribute("data-compose-item");
        if (caption) caption.textContent = row.getAttribute("data-compose-caption");
        frame?.classList.remove("is-rising"); void frame?.offsetWidth; frame?.classList.add("is-rising");
      });
    });
    const closeMenus = (except) => document.querySelectorAll("[data-compose-menu]").forEach((menu) => {
      if (menu === except) return;
      menu.hidden = true;
      menu.parentElement?.querySelector("[data-compose-menu-toggle]")?.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-compose-menu-toggle]");
      if (toggle) {
        const menu = toggle.parentElement?.querySelector("[data-compose-menu]");
        if (!menu) return;
        const open = menu.hidden;
        closeMenus(menu);
        menu.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
        if (open) menu.querySelector("[role=menuitem], button")?.focus();
        return;
      }
      if (!event.target.closest("[data-compose-menu]")) closeMenus(null);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const open = [...document.querySelectorAll("[data-compose-menu]")].find((menu) => !menu.hidden);
      if (!open) return;
      event.preventDefault();
      closeMenus(null);
      open.parentElement?.querySelector("[data-compose-menu-toggle]")?.focus();
    });
    document.querySelectorAll(".mw-otp").forEach((root) => {
      const cells = [...root.querySelectorAll("input")];
      cells.forEach((input, index) => {
        input.addEventListener("input", () => { if (input.value) cells[index + 1]?.focus(); });
        input.addEventListener("keydown", (event) => {
          if (event.key === "Backspace" && !input.value) cells[index - 1]?.focus();
        });
      });
    });
    document.querySelectorAll(".mw-number").forEach((root) => {
      const input = root.querySelector("input");
      root.querySelectorAll("[data-number-step]").forEach((button) => {
        button.addEventListener("click", () => {
          const step = Number(button.getAttribute("data-number-step"));
          const min = input.min === "" ? -Infinity : Number(input.min);
          const max = input.max === "" ? Infinity : Number(input.max);
          const next = Math.min(max, Math.max(min, Number(input.value || 0) + step));
          input.value = String(next);
        });
      });
    });
    document.querySelectorAll(".mw-calendar").forEach((root) => {
      if (root.closest(".mw-date-picker")) return;
      root.querySelectorAll("[data-calendar-step]").forEach((button) => {
        button.addEventListener("click", () => {
          const delta = Number(button.getAttribute("data-calendar-step"));
          let year = Number(root.getAttribute("data-calendar-year"));
          let month = Number(root.getAttribute("data-calendar-month")) + delta;
          if (month < 0) { year -= 1; month = 11; }
          if (month > 11) { year += 1; month = 0; }
          root.setAttribute("data-calendar-year", String(year));
          root.setAttribute("data-calendar-month", String(month));
          const title = root.querySelector("[data-calendar-title]");
          if (title) title.textContent = year + "年" + (month + 1) + "月";
        });
      });
    });
    document.querySelectorAll(".mw-date-picker").forEach((root) => {
      const popup = root.querySelector(".mw-calendar");
      const input = root.querySelector("[data-date-picker-input]");
      const open = () => popup?.classList.add("is-open");
      root.querySelector("[data-date-picker-open]")?.addEventListener("click", open);
      input?.addEventListener("focus", open);
      popup?.querySelectorAll(".mw-calendar__day").forEach((day) => {
        day.addEventListener("click", () => {
          const cell = day.closest("td");
          if (input && cell) input.value = cell.getAttribute("data-date") || "";
          popup.classList.remove("is-open");
        });
      });
    });
    document.querySelectorAll(".mw-catalog [data-slot=toggle-group]").forEach((group) => {
      group.querySelectorAll(":scope > button").forEach((button) => {
        button.addEventListener("click", () => {
          group.querySelectorAll(":scope > button").forEach((item) => {
            const on = item === button;
            item.classList.toggle("is-current", on);
            item.setAttribute("aria-pressed", String(on));
          });
        });
      });
    });
    document.querySelectorAll(".mw-catalog .is-yield [data-slot=directory-row]").forEach((row) => {
      row.addEventListener("click", () => {
        const list = row.closest(".mw-dir");
        list?.querySelectorAll("[data-slot=directory-row]").forEach((item) => {
          item.classList.toggle("is-selected", item === row);
          if (item === row) item.setAttribute("aria-current", "page");
          else item.removeAttribute("aria-current");
        });
      });
    });
  </script>`;
}
