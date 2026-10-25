import { renderCatalogExamples } from "../catalog-examples.js";
import { icon, renderButton, renderDirectoryRow, renderStatusMark } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ICON_LIBRARY, PLUGIN_ICON } from "../icons.js";
import { renderStateRingCatalog } from "./status-ring-catalog.js";
import { renderProjectMonogram } from "../monogram.js";
import { MW_ACTION_TONES, MW_CONTENT_MARKS, MW_CONTENT_SURFACES, MW_HUES, MW_STATUS_TONES, MW_SURFACES, MW_TYPE_TONES } from "../palette.js";
import { renderBarContext, renderBarStatus, renderBrief, renderBriefFocus, renderBriefRecent, renderBriefSection, renderBriefStatus, renderCaption, renderFileGroup, renderFileRow, renderGoalTrack, renderSteps, renderWordmark } from "./arrival.js";
import { section, mark, specimen } from "./catalog-parts.js";
import { CATALOG_CLIENT_SCRIPT } from "../page-clients.js";
import { choiceSection, composeSection } from "./catalog-compose.js";
import { advancedFieldSection, badgeSection, buttonSection, calendarSection, feedbackSection, fieldSection, formSection, groupsSection, menuSection, overlaySection, separatorSection, tabsSection } from "./catalog-controls.js";
import { directorySection, layoutSection } from "./catalog-layout.js";

export const PRIMITIVE_CATALOG_IDS = [
  "accordion", "alert", "alert-dialog", "autocomplete", "avatar", "badge", "breadcrumb", "button",
  "calendar", "card", "checkbox", "checkbox-group", "collapsible", "combobox", "command", "context-menu",
  "date-picker", "dialog", "directory", "drawer", "empty", "field", "fieldset", "form", "frame", "group", "input",
  "input-group", "kbd", "label", "menu", "meter", "number-field", "otp-field", "pagination", "popover",
  "preview-card", "progress", "radio-group", "scroll-area", "select", "separator", "sheet", "sidebar",
  "skeleton", "slider", "spinner", "switch", "table", "tabs", "textarea", "toast", "toggle", "toggle-group",
  "toolbar", "tooltip",
] as const;


/** Section index derived from the rendered sections, so a new section cannot be left out of it. */
function catalogIndex(sections: string): string {
  const entries = [...sections.matchAll(/<section class="mw-catalog__section" id="([^"]+)"[^>]*><h2>([^<]+)<\/h2>/g)];
  const links = entries.map(([, id, title]) => {
    const short = title.split(" / ")[0];
    return `<a href="#${id}" title="${title}">${short}</a>`;
  }).join("");
  return `<nav class="mw-catalog__index" data-catalog-index aria-label="控件目录" style="grid-row: 1 / span ${entries.length}">${links}</nav>`;
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
    .map(([name, id]) => `<span class="mw-craft-mono">${renderProjectMonogram(name, id, escape)}<span>${escape(name)}</span></span>`).join("");
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
      ${specimen("标签 · 提示", `<div class="mw-craft-row mw-craft-strip"><span class="mw-craft-tab">${icon("home")}<span>项目首页</span></span><span class="craft-tip mw-craft-tip" data-shown>Inbox<kbd>⌥5</kbd></span></div>`)}
    </div>`);
}

/** The icon inventory: which glyph each plugin and each state uses, and the four sizes. */
function iconInventorySection(): string {
  const PLUGIN_NAMES: Record<string, string> = { home: "项目首页", goals: "Goals", inbox: "Inbox", feed: "Feed", schedule: "Schedule", workflows: "工作流程", pages: "Pages", form: "Forms", dataset: "Dataset", ppt: "PPT", artifacts: "Artifacts", images: "图片", jelly: "Jelly", cognia: "Cognia", shelf: "Shelf", lingguang: "灵光", coding: "Coding", characters: "Characters", alchemist: "炼金术士", "plugin-builder": "插件创作", market: "插件市场", files: "Files", git: "Git", diff: "Diff", "text-stats": "Text stats" };
  const plugins = Object.entries(PLUGIN_ICON).map(([id, glyph]) => `<li>${icon(glyph)}<span><strong>${PLUGIN_NAMES[id] ?? id}</strong><code>${glyph}</code></span></li>`).join("");
  const sizes = [[12, "2", "说明文字、计数旁"], [14, "2", "行内、菜单、按钮"], [16, "2", "按钮、行首、标签"], [20, "1.6", "Dock、常驻入口、空态纸张"]]
    .map(([size, stroke, use]) => `<li><span class="mw-icon-size" style="--s:${size}px">${icon("target")}</span><span><strong>${size}px</strong><small>描边 ${stroke} · ${use}</small></span></li>`).join("");
  return section("icon-inventory", "图标清单", `<p class="mw-catalog__hint">全站一套 Lucide 线性图标，24 栅格，不混填充图标。每个插件一个互不重复的图标，Dock、插件切换、标签、市场、空态与搜索用同一个；状态图标语义固定，颜色只来自状态色调。</p>
    <div class="mw-catalog__specimens">
      ${specimen("插件", `<ul class="mw-icon-inventory">${plugins}</ul>`)}
      ${specimen("尺寸与描边", `<ul class="mw-icon-inventory mw-icon-inventory--sizes">${sizes}</ul>`)}
      ${specimen("空态纸张", `<div class="mw-craft-row"><div class="mw-empty"><span class="mw-empty__mark">${icon("clipboard")}</span><strong>还没有问卷</strong><p>新建一份，预览填写，再看结果。</p></div></div>`)}
      ${specimen("加载 · 超过 250ms 才出现", `<div class="mw-craft-row"><p class="mw-loading" role="status">正在读取问卷…</p></div><p class="mw-catalog__hint">结构已知的列表与卡片用静态占位（Skeleton）；结构未知或一次性的等待用这一行。</p>`)}
      ${specimen("读取失败 · 总有下一步", `<div class="mw-craft-row"><div class="mw-empty mw-empty--error" role="alert"><span class="mw-empty__mark">${icon("circle-alert")}</span><strong>列表暂时读不到</strong><p>本地服务没有响应。</p>${renderButton({ label: "重试", variant: "secondary" })}</div></div>`)}
    </div>`);
}

/** Every motion in the product, one specimen each, all on the four durations and two curves. */
function motionSection(): string {
  const demo = (id: string, label: string) => renderButton({ label, variant: "secondary", size: "sm", attrs: { "data-motion-demo": id } });
  return section("motion", "动效标本", `<p class="mw-catalog__hint">时长只用 130 / 250 / 420 / 640ms，曲线只用 --ease-quint 与 --ease-spring；只动 transform 与 opacity，例外三处：新写出的文字显现时的 filter，拖动标签时让出的空位宽度，折叠按自然高度开合时的内容高度。页面第一次出现时升起一次，之后切回只用 130ms 淡入；刷新、重绘、切回页面不重放入场；动画中点击与键盘照常响应；减少动态效果时全部关闭，状态照常切换。</p>
    <div class="mw-catalog__specimens mw-motion-grid">
      ${specimen("按压回弹 · 130ms spring", `<div class="mw-craft-row">${renderButton({ label: "按住再松开", variant: "primary" })}</div>`)}
      ${specimen("悬停 · 130ms", `<div class="mw-motion-rows"><button type="button" class="mw-motion-row">移上来看洗底</button><button type="button" class="mw-motion-row">同一种灰，全站一致</button></div>`)}
      ${specimen("菜单开合 · 进 250ms，出 130ms", `<details class="mw-motion-menu"><summary class="mw-btn mw-btn--secondary mw-btn--sm">打开菜单</summary><div class="mw-menu"><button type="button" class="mw-menu__item">重命名</button><button type="button" class="mw-menu__item">移动到…</button></div></details>`)}
      ${specimen("弹窗进出 · 进 250ms，出 130ms", `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("dialog", "打开对话框")}</div><dialog class="mw-dialog" data-motion-dialog><p>对话框从控件方向升起，关闭时原路退下。</p><div class="mw-craft-row">${renderButton({ label: "关闭", variant: "primary", attrs: { "data-motion-close": "" } })}</div></dialog></div>`)}
      ${specimen("侧板滑入 · 420ms", `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("sheet", "打开侧板")}</div><dialog class="mw-dialog mw-sheet" data-motion-sheet><p>侧板从右缘滑入，关闭时滑回。</p><div class="mw-craft-row">${renderButton({ label: "关闭", variant: "primary", attrs: { "data-motion-close": "" } })}</div></dialog></div>`)}
      ${specimen("标签切换 · 250ms", `<div class="mw-motion-tabs" role="tablist"><button type="button" class="tab-item" aria-selected="true" data-motion-tab>概览</button><button type="button" class="tab-item" data-motion-tab>终端</button></div>`)}
      ${specimen("分段滑块 · 250ms", `<div class="mw-toggle-group" data-slot="toggle-group" data-seg-thumb role="group"><button class="mw-toggle is-current" type="button" aria-pressed="true">全部</button><button class="mw-toggle" type="button" aria-pressed="false">未读</button><button class="mw-toggle" type="button" aria-pressed="false">已保存</button></div>`)}
      ${specimen("列表首次到达 · 420ms，逐行 ≤12", `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("arrive", "重放到达")}</div><ol class="mw-motion-list" data-motion-list><li>第一行</li><li>第二行</li><li>第三行</li><li>第四行</li><li>第五行</li></ol></div>`)}
      ${specimen("行展开收起 · 250ms", `<details class="mw-motion-row-detail mw-disclosure"><summary>展开这一行</summary><p>内容按自然高度展开、收起，和箭头同一个时钟；途中反向从当前高度接着走。</p></details>`)}
      ${specimen("页面 / 插件切换 · 130ms", `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("switch", "切换页面")}</div><div class="mw-motion-pages"><section data-motion-page>Goals 页面</section><section data-motion-page hidden>Feed 页面</section></div></div>`)}
      ${specimen("Toast · 250ms", `<div class="mw-craft-row">${demo("toast", "显示提示")}</div>`)}
      ${specimen("完成时刻 · 640ms", `<p class="mw-catalog__hint">见上方「试一下 → 完成这一条」：状态换成完成、一次落定，不循环。</p>`)}
    </div>`);
}

/** The parts the opening, the Welcome questions, the project chooser and the new-project journey share. */
function arrivalSection(): string {
  const monogram = renderProjectMonogram("FlyLeaf-V0.1", "flyleaf", (value) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char));
  const goals = [["明确使用场景", "done"], ["确认首版范围", "done"], ["完成阅读页原型", "done"], ["连接笔记链路", "done"], ["打磨首次使用", "doing"], ["邀请首批内测", "todo"]] as const;
  const track = renderGoalTrack({ goals: goals.map(([title, state]) => ({ title, state })), label: "4 / 6 个目标完成" });
  const next = renderBriefSection({ title: "接下来", body: `<div class="mw-brief__list">${renderDirectoryRow({ title: "检查空白状态与导入材料的完整路径", caption: "目标「打磨首次使用」", density: "meta", status: "进行中", statusTone: "progress", statusIcon: "status-progress" })}${renderDirectoryRow({ title: "确认首批内测名单", caption: "12 人", density: "meta", status: "等你确认", statusTone: "attention", statusIcon: "status-needs-you" })}</div>` });
  const recent = renderBriefSection({ title: "最近", body: renderBriefRecent([{ when: "昨天 22:14", text: "更新了《阅读页交互说明》" }, { when: "9月29日", text: "加入 4 份用户访谈记录" }]) });
  const brief = renderBrief({
    kicker: `${renderBriefStatus({ label: "进行中", tone: "progress", glyph: "status-progress" })}<span>最近打开 2 小时前</span>`,
    title: "FlyLeaf-V0.1",
    description: "让阅读、笔记与灵感连成一条线：读到的段落直接变成笔记，笔记再长成新的创作。",
    focus: renderBriefFocus({ label: "当前目标", count: "<b>4</b> / 6 完成", title: "打磨首次使用", body: "检查空白状态、导入材料和创建项目的完整路径。", track }),
    sections: [next, recent],
  });
  const files = renderFileGroup({
    glyph: "folder", title: "文件夹 · 文稿", caption: "~/文稿/FlyLeaf 资料 · 最近 30 天 · 含子目录", count: "2/3",
    check: { checked: false, mixed: true }, status: renderStatusMark({ label: "已授权", tone: "done", icon: "status-done", plain: true }),
    rows: [
      renderFileRow({ name: "首版功能范围.md", size: "12 KB", state: '<span class="mw-file-row__state">未读取</span>', check: { checked: true } }),
      renderFileRow({ name: "用户访谈-0926.pdf", size: "412 KB", state: '<span class="mw-file-row__state">未读取</span>', check: { checked: true } }),
      renderFileRow({ name: "竞品笔记.md", size: "9 KB", state: '<span class="mw-file-row__state">未读取</span>', check: { checked: false } }),
    ],
    note: "另有 2 项因时间、类型或访问范围未列入。",
  });
  const added = renderFileGroup({
    glyph: "file", title: "单独选的文件", caption: "系统选择器选中的文件",
    remove: { label: "移除 单独选的文件" },
    rows: [renderFileRow({ name: "FlyLeaf 品牌说明.pdf", size: "524 KB", remove: { label: "移除 FlyLeaf 品牌说明.pdf" } }), renderFileRow({ name: "首屏文案.md", size: "4 KB", remove: { label: "移除 首屏文案.md" } })],
  });
  return section("arrival", "到达 / Arrival", `<p class="mw-catalog__hint">打开 Molis Work 时几个画面共用的部件：开场、Welcome 的提问、项目选择页和新建项目引导，外加同一条底栏里随画面变化的内容。外框（桌面、白色工作面、底栏）不动，换画面只换里面的东西。字标和字幕的动效只动 opacity 与 transform，减少动态效果时直接显示结果。</p>
    <div class="mw-catalog__specimens">
      ${mark("wordmark", specimen("字标 · 打字机", `<div class="mw-arrival-demo">${renderWordmark({ attrs: { "data-arrival-wordmark": true } })}${renderButton({ label: "重播", variant: "secondary", size: "sm", attrs: { "data-arrival-demo": "wordmark" } })}</div>`))}
      ${mark("caption", specimen("AI 字幕 · A / I 常驻，词组变换", renderCaption({ label: "暂停标题动画", playLabel: "播放标题动画", title: "点按暂停或播放" })))}
      ${mark("steps", specimen("进度短线 · 已完成、当前、未到", `<div class="mw-arrival-bar-strip">${renderSteps({ total: 6, current: 2, label: "引导进度" })}</div>`))}
      ${specimen("按钮 · 标明回车键", `${renderButton({ label: "继续", variant: "primary", size: "lg", key: "↵" })}${renderButton({ label: "返回项目", variant: "ghost", size: "lg", icon: "back" })}`)}
      ${mark("bar-context", specimen("底栏 · 左：正在看的是谁", `<div class="mw-arrival-bar-strip">${renderBarContext({ mark: monogram, title: "FlyLeaf-V0.1", caption: "预览中 · 回车进入" })}</div>`))}
      ${mark("bar-status", specimen("底栏 · 中：正在发生什么", `<div class="mw-arrival-bar-strip">${renderBarStatus({ spin: true, title: "正在整理工作脉络", caption: "可以离开，回来后接着整理" })}${renderBarStatus({ glyph: "shield", title: "已选 11 份 · 1.5 MB", caption: "开始后读取正文并发给所选模型整理" })}</div>`))}
      ${mark("goal-track", specimen("目标条 · 一段一个目标", `<div class="mw-arrival-wide">${track}</div>`))}
      ${mark("file-list", specimen("材料清单 · 勾选与分组勾选", `<div class="mw-arrival-wide">${files}${added}</div>`))}
      ${mark("brief", specimen("项目简介 · 目录与详情的详情", `<div class="mw-arrival-brief">${brief}</div>`))}
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
  const sections = `
    ${paletteSection()}
    ${typefaceSection()}
    ${iconSection()}
    ${iconInventorySection()}${renderStateRingCatalog()}
    ${craftSection()}
    ${motionSection()}
    ${arrivalSection()}
    ${choiceSection()}
    ${composeSection()}
    ${renderCatalogExamples(section)}
    ${buttonSection()}
    ${fieldSection()}
    ${groupsSection()}
    ${advancedFieldSection()}
    ${formSection()}
    ${badgeSection()}
    ${feedbackSection()}
    ${separatorSection()}
    ${calendarSection()}
    ${overlaySection()}
    ${menuSection()}
    ${tabsSection()}
    ${directorySection()}
    ${layoutSection()}`;
  return `<div class="mw-catalog">
    ${catalogIndex(sections)}
    ${sections}
  </div>
  <script>${CATALOG_CLIENT_SCRIPT}</script>`;
}
