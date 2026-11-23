import { renderCatalogExamples } from "../catalog-examples.js";
import { escapeHtml, icon, renderButton, renderDirectoryRow, renderStatusMark, t, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ICON_LIBRARY } from "../icons.js";
import { baselineToken } from "../baseline.js";
import { renderStateRingCatalog } from "./status-ring-catalog.js";
import { renderProjectMonogram } from "../monogram.js";
import { MW_ACTION_TONES, MW_CONTENT_MARKS, MW_CONTENT_SURFACES, MW_HUES, MW_STATUS_TONES, MW_SURFACES, MW_TYPE_TONES } from "../palette.js";
import { renderBarContext, renderBarStatus, renderBrief, renderBriefFocus, renderBriefRecent, renderBriefSection, renderBriefStatus, renderCaption, renderFileGroup, renderFileRow, renderGoalTrack, renderSteps, renderWordmark } from "./arrival.js";
import { section, mark, specimen } from "./catalog-parts.js";
import { CATALOG_CLIENT_SCRIPT } from "../page-clients.js";
import { choiceSection, composeSection } from "./catalog-compose.js";
import { advancedFieldSection, badgeSection, buttonSection, severityGridSection, calendarSection, feedbackSection, fieldSection, formSection, groupsSection, menuSection, overlaySection, separatorSection, tabsSection } from "./catalog-controls.js";
import { directorySection, layoutSection } from "./catalog-layout.js";
import { COMPOSER_STYLES } from "../composer-styles.js";
import { COMPOSER_BOARD_STYLES, commandsSection, composerSection, menuDescSection, micSection, type Say } from "./catalog-composer.js";
import { keepEditsSections, KEEP_EDITS_BOARD_STYLES } from "./catalog-keep-edits.js";
import { noteSection, sourceLadderSection } from "./catalog-source-ladder.js";
import { buttonGroupSection, CATALOG_PATTERN_STYLES, dataTableSection, dropZoneSection, rowsSection, statSection, tagInputSection } from "./catalog-patterns.js";
import { lookSections } from "./catalog-appearance.js";
import { APPEARANCE_BOARD_STYLES } from "./catalog-appearance-styles.js";
import { PRESENTATION_BOARD_STYLES, presentationSection, type CatalogPresentationPlugin } from "./catalog-presentation.js";
import { PRESENTATION_FORM_STYLES } from "../styles/presentation.js";
import { componentText, PLUGIN_COMPONENTS } from "../plugin-components.js";
import { SKILL_SELECTION_BOARD_STYLES, skillLineSection, skillWhySection } from "./catalog-skill-selection.js";
import { itemChoiceSection, itemDetailsSection, listDetailSection, SKILL_PACK_BOARD_STYLES, statusLinkSection } from "./catalog-skill-packs.js";
import { CAPABILITY_PACK_BOARD_STYLES, adoptBarSection, askRowSection, cellGridSection, detailTrailSection, iconCountsSection, itemGroupSection, leaveBarSection, nowBlockSection, placeholderListSection, replayGridSection, stateRowsSection, stickyDetailSection, textCountSection, usageSection } from "./catalog-capability-packs.js";
import { WORK_RECORDS_BOARD_STYLES, categoryBarSection, kindMarkSection } from "./catalog-work-records.js";
import { LANGUAGE_BOARD_STYLES, languageSection, motionGrammarSpecimens, pairingSection, zonesSection } from "./catalog-language.js";
import { RECOVERY_BOARD_STYLES, recoverySections } from "./recovery-parts.js";
import { CODING_BASICS_BOARD_STYLES, codingBasicsSection } from "./coding-basics.js";
import { HOME_PAGE_ADOPTION_BOARD_STYLES, homePageAdoptionSections } from "./catalog-home-page-adoption.js";

export const PRIMITIVE_CATALOG_IDS = PLUGIN_COMPONENTS.map(({ kind }) => kind);
const catalogComponents = new Map(PLUGIN_COMPONENTS.map(component => [component.kind, component]));


/** A chapter starts where this mark stands among the sections; the index puts its name over the sections that follow. */
const chapter = (name: string) => `<!--chapter:${name}-->`;
/** The index's group heading; the workbench heads its own sections with the same one. */
export const catalogIndexGroup = (name: string) => `<p class="mw-catalog__index-group" data-catalog-group>${escapeHtml(name)}</p>`;

/** Extra chapter supplied by a host board (replaces regex splicing on rendered HTML). */
export interface CatalogExtraChapter {
  readonly title: string;
  readonly linksHtml: string;
  readonly sectionsHtml: string;
  readonly count: number;
}

/**
 * Section index derived from the rendered sections, so a new section cannot be left out of it. Chapters include any
 * host-supplied extraChapters, and filter chips + search narrow the sidebar without regex patching.
 */
function catalogIndex(sections: string, say: Say, extraChapters: readonly CatalogExtraChapter[] = []): string {
  const specimens = new Set([...sections.matchAll(/data-primitive="([^"]+)"/gu)].map(([, id]) => id));
  for (const kind of PRIMITIVE_CATALOG_IDS) {
    if (!specimens.has(kind)) throw new Error(`组件板缺少 ${kind} 的标本。`);
  }
  const entries = [...sections.matchAll(/<!--chapter:([^>]+)-->|<section class="mw-catalog__section" id="([^"]+)"[^>]*><h2>([^<]+)<\/h2>/g)];
  const chapterNames: string[] = [];
  const coreLinks = entries.map(([, group, id, title]) => {
    if (group) {
      chapterNames.push(group);
      return catalogIndexGroup(group);
    }
    const component = catalogComponents.get(id!);
    const short = component ? escapeHtml(componentText(component.name, say)) : title!.split(" / ")[0];
    const description = component ? escapeHtml(componentText(component.description, say)) : title;
    return `<a href="#${id}" title="${description}">${short}</a>`;
  }).join("");
  const extraLinks = extraChapters.map((extra) => {
    chapterNames.push(extra.title);
    return `${catalogIndexGroup(extra.title)}${extra.linksHtml}`;
  }).join("");
  const coreCount = entries.filter(([, group]) => !group).length;
  const totalCount = coreCount + extraChapters.reduce((sum, item) => sum + item.count, 0);
  const chips = [
    `<button type="button" class="mw-catalog__chip is-active" data-catalog-chapter="" aria-pressed="true">全部</button>`,
    ...chapterNames.map((name) => `<button type="button" class="mw-catalog__chip" data-catalog-chapter="${escapeHtml(name)}" aria-pressed="false"> ${escapeHtml(name)} </button>`),
  ].join("");
  const find = `<div class="mw-catalog__index-find"><input class="mw-input" type="search" data-catalog-find placeholder="找标本" aria-label="在目录里找标本" autocomplete="off"><div class="mw-catalog__chips" role="group" aria-label="章节筛选">${chips}</div></div>`;
  return `<nav class="mw-catalog__index" data-catalog-index aria-label="控件目录" style="grid-row: 1 / span ${totalCount}">${find}${coreLinks}${extraLinks}<p class="mw-catalog__index-none" data-catalog-none hidden>没有这个名字的标本</p></nav>`;
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
  return section("palette", "色板", `<div class="mw-catalog__specimens">
    ${specimen("平面", `<div class="mw-swatch-row">${surfaces}</div>`)}
    ${specimen("字", `<div class="mw-swatch-row">${type}</div>`)}
    ${specimen("动作与强调", `<div class="mw-swatch-row">${action}</div>`)}
    ${specimen("状态", `<div class="mw-swatch-row">${status}</div>`)}
    ${specimen("色相 · 只用于状态标记与内容类型", `<div class="mw-swatch-row">${hues}</div>`)}
    ${specimen("内容平面", `<div class="mw-swatch-row">${content}</div>`)}
    ${specimen("内容标记", `<div class="mw-swatch-row">${marks}</div>`)}
  </div>`);
}

function typefaceSection(say: Say): string {
  return section("typeface", say("workbench.env.font"), `<div class="mw-catalog__specimens">
    ${specimen("字重角色", `<div class="mw-type-sample">
      <p class="mw-type-sample__display">今天的工作</p>
      <p class="mw-type-sample__title">打磨 Molis Work 的第一印象</p>
      <p class="mw-type-sample__item">让信息流更适合专注阅读 · Feed 已连接</p>
      <p class="mw-type-sample__body">把布局、文字和每一次交互收成一个完整的体验。Molis Work keeps goals, sessions and sources on one surface.</p>
      <p class="mw-type-sample__caption">星期一，9 月 28 日 · 3 / 5 完成依据</p>
      <p class="mw-type-sample__mono"><code>pnpm --filter ./packages/design-system run build</code></p>
    </div>`)}
    ${specimen("F1 字体栈 · Inter Variable + 思源黑体 400 / 500 / 600", `<div class="mw-type-sample">
      <p class="mw-type-sample__item">Inter Variable · Noto Sans SC (400 / 500 / 600) <span class="mw-type-sample__caption">跨平台一致主字体 · 禁止伪粗体</span></p>
      <p class="mw-type-sample__item">PingFang SC · Hiragino Sans GB · Microsoft YaHei UI <span class="mw-type-sample__caption">生僻字系统兜底</span></p>
      <p class="mw-type-sample__caption">正文 13px / 1.58 · 中文 0 字距 · 英文 :lang(en) -0.011em · 数字 tabular-nums · text-autospace: normal</p>
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
    ["--dur-stagger", "60ms", "错开：几张卡片一起到达时，微弱流动节奏（至多四张）"],
  ].map(([token, value, role]) => `<tr><td><code>${token}</code></td><td>${value}</td><td>${role}</td></tr>`).join("") +
    // The curves' values are read from the baseline, the one place they are written (POLISH-33).
    [["ease-quint", "到达、移动、展开、离开，以及比 32px 大的东西按下后回来"], ["ease-spring", "只用于 32px 以内的小东西：小键回弹、勾选落定、开关滑块"]]
      .map(([name, role]) => `<tr><td><code>--${name}</code></td><td>${escape(baselineToken(name!).replace(/^[^:]*:\s*|;\s*$/gu, ""))}</td><td>${role}</td></tr>`).join("");
  const monograms = [["Molis Work 示例项目", "project-demo"], ["增长实验", "project-growth"], ["Research", "project-research"], ["品牌手册", "project-brand"], ["Onboarding", "project-onboard"]]
    .map(([name, id]) => `<span class="mw-craft-mono">${renderProjectMonogram(name, id, escape)}<span>${escape(name)}</span></span>`).join("");
  return section("craft", "空间 · 层次 · 动效", `
    <div class="mw-catalog__specimens">
      ${specimen("空间 · 桌面、工作面与常驻底栏", `<div class="mw-craft-space" aria-hidden="true"><i class="mw-craft-space__dir"></i><div class="mw-craft-space__main"><i class="mw-craft-space__tabs"></i><div class="mw-craft-space__sheet"><b></b><b></b><b></b></div></div><div class="mw-craft-space__bar"><i></i><em></em><i></i></div></div>`)}
      ${specimen("层次：工作面、抬升与浮层", `<div class="mw-craft-row">${lifts}</div>`)}
      ${specimen("圆角", `<div class="mw-craft-row">${radii}</div>`)}
      ${specimen("动效时长", `<div class="mw-lang-scroll"><table class="mw-table mw-craft-motion"><thead><tr><th>Token</th><th>时长</th><th>用在哪里</th></tr></thead><tbody>${motion}</tbody></table></div>`)}
      ${specimen("试一下", `<div class="mw-craft-row">
        ${renderButton({ label: "按一下", variant: "primary" })}
        ${renderButton({ label: "重放到达", variant: "secondary", attrs: { "data-craft-demo": "rise" } })}
        ${renderButton({ label: "新条目落地", variant: "secondary", attrs: { "data-craft-demo": "land" } })}
        ${renderButton({ label: "完成这一条", variant: "secondary", attrs: { "data-craft-demo": "celebrate" } })}
      </div>
      <div class="mw-craft-stage" data-craft-demo-target><span class="mw-craft-stage__title">让第一次使用的人顺利完成一轮目标协作</span><span class="mw-object-status mw-object-status--in_progress" data-craft-demo-status>${icon("play")}<span>正在推进</span></span></div>`)}
      ${specimen("项目徽标 · 首字母 + 由 id 决定的色", `<div class="mw-craft-row">${monograms}</div>`)}
      ${specimen("标签 · 提示", `<div class="mw-craft-row mw-craft-strip"><span class="mw-craft-tab">${icon("home")}<span>项目主页</span></span><span class="craft-tip mw-craft-tip" data-shown>Inbox<kbd>⌥5</kbd></span></div>`)}
      ${specimen("Inset Grouped · 对齐六律（同心圆角、22px 首行光学轴、44px 发丝线、图标+色彩优先、平滑内嵌抽屉）", `<div class="mw-section-well" style="max-width:560px"><div class="mw-inset-group">
        <div class="mw-inset-row" data-catalog-inset-row data-open="false">
          <span class="mw-inset-row__lead mw-glyph-status mw-status--progress" title="进行中">${icon("play")}</span>
          <div class="mw-inset-row__body">
            <p class="mw-inset-row__title">统一工作台 4 套皮肤与 F1 Sans+CJK 字重体系</p>
            <div class="mw-inset-row__signals"><span class="mw-signal"><i class="mw-signal-dot mw-status--progress"></i>4 皮肤 AA 达标</span><span class="mw-signal">${icon("file")}22 文件</span></div>
          </div>
          <span class="mw-inset-row__end"><span class="mw-num">2m</span><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-catalog-inset-toggle>展开</button></span>
          <div class="mw-inset-row__drawer"><div><p class="mw-catalog__hint" style="padding-top:4px">正文与展开抽屉严守同一条 --text-start（44px）竖直基线，发丝线永不切断左侧图标。</p></div></div>
        </div>
        <div class="mw-inset-row" data-catalog-inset-row data-open="false">
          <span class="mw-inset-row__lead mw-glyph-status mw-status--done" title="已完成">${icon("check")}</span>
          <div class="mw-inset-row__body">
            <p class="mw-inset-row__title">零页面刷新感连续动效（FLIP + 0fr→1fr + 墨迹渗入流式）</p>
            <div class="mw-inset-row__signals"><span class="mw-signal"><i class="mw-signal-dot mw-status--done"></i>67 / 67 通过</span><span class="mw-signal">${icon("clock")}7.04 MB</span></div>
          </div>
          <span class="mw-inset-row__end"><span class="mw-num">刚刚</span><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-catalog-inset-toggle>展开</button></span>
          <div class="mw-inset-row__drawer"><div><p class="mw-catalog__hint" style="padding-top:4px">所有状态默认由图标与色彩表达，长说明收进按需展开抽屉，不抢占首屏扫读注意力。</p></div></div>
        </div>
      </div></div>`)}
    </div>`);
}

/** One row of the icon inventory: a plugin (or surface of the workbench), its name, and the glyph it draws. */
export interface CatalogPluginIcon {
  readonly id: string;
  readonly name: string;
  readonly icon: PluginIconName;
}

/** The icon inventory: which glyph each plugin and each state uses, and the four sizes. The plugin rows are given by the workbench, from the Manifests. */
function iconInventorySection(pluginIcons: readonly CatalogPluginIcon[], say: Say): string {
  const plugins = pluginIcons.map(({ name, icon: glyph }) => `<li>${icon(glyph)}<span><strong>${name}</strong><code>${glyph}</code></span></li>`).join("");
  const sizes = [[12, "2", "说明文字、计数旁"], [14, "2", "行内、菜单、按钮"], [16, "2", "按钮、行首、标签"], [20, "1.6", "Dock、常驻入口、空态纸张"]]
    .map(([size, stroke, use]) => `<li><span class="mw-icon-size" style="--s:${size}px">${icon("target")}</span><span><strong>${size}px</strong><small>描边 ${stroke} · ${use}</small></span></li>`).join("");
  return section("icon-inventory", "图标清单", `
    <div class="mw-catalog__specimens">
      ${specimen("插件", `<ul class="mw-icon-inventory">${plugins}</ul>`)}
      ${specimen("尺寸与描边", `<ul class="mw-icon-inventory mw-icon-inventory--sizes">${sizes}</ul>`)}
      ${specimen("空态纸张", `<div class="mw-craft-row"><div class="mw-empty"><span class="mw-empty__mark">${icon("clipboard")}</span><strong>还没有问卷</strong><p>新建一份，预览填写，再看结果。</p></div></div>`)}
      ${specimen("加载 · 超过 250ms 才出现", `<div class="mw-craft-row"><p class="mw-loading" role="status">正在读取问卷…</p></div><p class="mw-catalog__hint">结构已知的列表与卡片用静态占位（Skeleton）；结构未知或一次性的等待用这一行。</p>`)}
      ${specimen("读取失败 · 总有下一步", `<div class="mw-craft-row"><div class="mw-empty mw-empty--error" role="alert"><span class="mw-empty__mark">${icon("circle-alert")}</span><strong>列表暂时读不到</strong><p>本地服务没有响应。</p>${renderButton({ label: say("common.control.retry"), variant: "secondary" })}</div></div>`)}
    </div>`);
}

/** Every motion in the product, one specimen each, all on the four durations and two curves. */
function motionSection(say: Say): string {
  const demo = (id: string, label: string) => renderButton({ label, variant: "secondary", size: "sm", attrs: { "data-motion-demo": id } });
  return section("motion", "动效标本", `
    <div class="mw-catalog__specimens mw-motion-grid">${motionGrammarSpecimens(say)}
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
function arrivalSection(say: Say): string {
  const monogram = renderProjectMonogram("FlyLeaf-V0.1", "flyleaf", (value) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char));
  const goals = [["明确使用场景", "done"], ["确认首版范围", "done"], ["完成阅读页原型", "done"], ["连接笔记链路", "done"], ["打磨首次使用", "doing"], ["邀请首批内测", "todo"]] as const;
  const track = renderGoalTrack({ goals: goals.map(([title, state]) => ({ title, state })), label: "4 / 6 个目标完成" });
  const next = renderBriefSection({ title: "接下来", body: `<div class="mw-brief__list">${renderDirectoryRow({ title: "检查空白状态与导入材料的完整路径", caption: "目标「打磨首次使用」", density: "meta", status: say("workbench.assistant-delivery.progress"), statusTone: "progress", statusIcon: "status-progress" })}${renderDirectoryRow({ title: "确认首批内测名单", caption: "12 人", density: "meta", status: "等你确认", statusTone: "attention", statusIcon: "status-needs-you" })}</div>` });
  const recent = renderBriefSection({ title: "最近", body: renderBriefRecent([{ when: "昨天 22:14", text: "更新了《阅读页交互说明》" }, { when: "9月29日", text: "加入 4 份用户访谈记录" }]) });
  const brief = renderBrief({
    kicker: `${renderBriefStatus({ label: say("workbench.assistant-delivery.progress"), tone: "progress", glyph: "status-progress" })}<span>最近打开 2 小时前</span>`,
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
  return section("arrival", "到达 / Arrival", `
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

/**
 * `plugins` fills the icon inventory's plugin rows; the design system keeps no list of plugins (PG-075), so omitted means none.
 * `say` is the page's translator: the sections written through it (the unified input's parts) follow the board's language.
 * `delivery` is the running send's name (补充) by its stable key, where the page has the platform's words.
 * `presentationLocale` is supplied by the board's Host entry, which has the workbench's owned text environment installed.
 */
function platformFeedbackSection(): string {
  return section("platform-feedback", "平台行为反馈原语 / Platform Feedback", `<div class="mw-catalog__specimens">
    ${specimen("molisBusy · 250ms 静默阈值（单按钮锁、不冻整页）", `<div class="mw-catalog__row">
      ${renderButton({ label: "快速保存 (120ms · 无闪)", variant: "secondary", attrs: { "data-fb-busy": "fast" } })}
      ${renderButton({ label: "慢请求 (950ms · 过阈转圈)", variant: "primary", attrs: { "data-fb-busy": "slow" } })}
      <span class="mw-catalog__hint" style="width:auto" data-fb-busy-status>点击观察快速操作不闪烁、慢操作过 250ms 才出转圈</span>
    </div>`)}
    ${specimen("molisToast · 三档时长 + 悬停暂停 + Undo + --helm-h 避让", `<div class="mw-catalog__row">
      ${renderButton({ label: "短提示 (2.6s)", variant: "secondary", size: "sm", attrs: { "data-fb-toast": "short" } })}
      ${renderButton({ label: "警告提示 (4.2s)", variant: "secondary", size: "sm", attrs: { "data-fb-toast": "warning" } })}
      ${renderButton({ label: "错误提示 (7.0s)", variant: "danger-outline", size: "sm", attrs: { "data-fb-toast": "error" } })}
      ${renderButton({ label: "可撤销提示 (Undo)", variant: "secondary", size: "sm", attrs: { "data-fb-toast": "undo" } })}
    </div>`)}
    ${specimen("molisAutosave · 五态自动保存 (idle → dirty → saving → saved | error)", `<div class="mw-catalog__row" data-fb-autosave-box>
      <input class="mw-input" style="max-width:260px" data-fb-autosave-input value="默认工作区说明" aria-label="自动保存示例">
      <label class="mw-check-row"><input type="checkbox" class="mw-check" data-fb-autosave-fail><span>模拟保存失败</span></label>
      <span class="mw-badge mw-badge--neutral" data-fb-autosave-status>已同步</span>
      ${renderButton({ label: "重试", variant: "ghost", size: "sm", attrs: { "data-fb-autosave-retry": "", hidden: true } })}
    </div>`)}
    ${specimen("molisOptimisticToggle · 即时切换与失败回滚", `<div class="mw-catalog__row" style="gap:20px 24px">
      <label class="mw-check-row" style="min-height:44px;align-items:center"><span class="mw-switch"><input type="checkbox" data-fb-opt-ok><span class="mw-switch__track"></span></span><span>正常切换（成功保持）</span></label>
      <label class="mw-check-row" style="min-height:44px;align-items:center"><span class="mw-switch"><input type="checkbox" data-fb-opt-fail><span class="mw-switch__track"></span></span><span>模拟失败（自动回滚 + Toast）</span></label>
    </div>`)}
    ${specimen("状态环原位流转 & 危险确认框 & 日期/时间增强器", `<div class="mw-catalog__row">
      <span class="mw-catalog__row" style="gap:6px"><svg class="mw-state-ring" data-mw-state="running" data-fb-ring-demo aria-hidden="true"></svg><span data-fb-ring-label>running</span></span>
      ${renderButton({ label: "切换状态", variant: "secondary", size: "sm", attrs: { "data-fb-ring-next": "" } })}
      ${renderButton({ label: "危险确认 (tone: danger)", variant: "danger", size: "sm", attrs: { "data-fb-confirm-danger": "" } })}
      <input type="date" data-mw-date value="2026-11-21" style="width:156px" aria-label="日期示例">
      <input type="time" data-mw-time value="09:30" style="width:124px" aria-label="时间示例">
    </div>
    <dialog class="mw-dialog mw-dialog--alert" data-fb-danger-dialog data-tone="danger">
      <form class="mw-form mw-dialog__shell" method="dialog">
        <header class="mw-form__header"><h2>彻底删除示例项目？</h2></header>
        <div class="mw-form__body"><p>项目文件与历史记录将立即移除且无法恢复。</p></div>
        <footer class="mw-form__footer">
          ${renderButton({ label: "取消", variant: "ghost", attrs: { "data-dialog-close": "" } })}
          ${renderButton({ label: "确认删除", variant: "danger", attrs: { "data-dialog-close": "" } })}
        </footer>
      </form>
    </dialog>`)}
  </div>`);
}

const CATALOG_EXTRA_STYLES = `
  .mw-catalog__chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .mw-catalog__chip {
    min-height: 22px; padding: 0 7px; border: 1px solid var(--line); border-radius: 6px;
    background: transparent; color: var(--muted); font: inherit; font-size: 11px; cursor: pointer;
    transition: background-color var(--dur-hover, 130ms) var(--ease-quint), color var(--dur-hover, 130ms) var(--ease-quint), border-color var(--dur-hover, 130ms) var(--ease-quint);
  }
  .mw-catalog__chip:hover { color: var(--ink); background: var(--nav-hover); }
  .mw-catalog__chip.is-active { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong, var(--accent)); font-weight: 500; }
`;

export function renderPrimitiveCatalog(options: {
  readonly plugins?: readonly CatalogPluginIcon[];
  readonly say?: Say;
  readonly delivery?: string;
  readonly presentationLocale?: string;
  readonly presentationPlugins?: readonly CatalogPresentationPlugin[];
  readonly extraChapters?: readonly CatalogExtraChapter[];
} = {}): string {
  const say = options.say ?? t;
  const extraChapters = options.extraChapters ?? [];
  // Chapters, in the order a designer reads the board: the language first, then what it is made of, then what is built from it.
  const sections = `
    ${chapter("设计语言")}
    ${languageSection(say)}
    ${paletteSection()}
    ${pairingSection(say)}
    ${typefaceSection(say)}
    ${lookSections(say)}
    ${craftSection()}
    ${zonesSection(say)}
    ${motionSection(say)}
    ${chapter("图标与状态")}
    ${iconSection()}
    ${micSection(say)}
    ${iconInventorySection(options.plugins ?? [], say)}${renderStateRingCatalog()}
    ${badgeSection(say)}
    ${severityGridSection()}
    ${statSection()}
    ${chapter("控件")}
    ${buttonSection(say)}
    ${buttonGroupSection()}
    ${choiceSection(say)}
    ${fieldSection()}
    ${groupsSection()}
    ${advancedFieldSection()}
    ${tagInputSection()}
    ${formSection(say)}
    ${dropZoneSection(say)}
    ${composerSection(say, options.delivery)}
    ${commandsSection(say, options.delivery)}
    ${calendarSection()}
    ${tabsSection(say)}
    ${separatorSection()}
    ${chapter("反馈与浮层")}
    ${feedbackSection()}
    ${platformFeedbackSection()}
    ${keepEditsSections(say)}
    ${sourceLadderSection(say)}
    ${noteSection(say)}
    ${overlaySection(say)}
    ${menuSection(say)}
    ${menuDescSection(say, options.delivery)}
    ${chapter("列表与条目")}
    ${directorySection(say)}
    ${rowsSection(say)}
    ${itemChoiceSection(say)}
    ${itemDetailsSection(say)}
    ${listDetailSection(say)}
    ${statusLinkSection(say)}
    ${skillLineSection(say)}
    ${skillWhySection(say)}
    ${nowBlockSection(say)}
    ${itemGroupSection(say)}
    ${cellGridSection(say)}
    ${detailTrailSection(say)}
    ${iconCountsSection(say)}
    ${stateRowsSection(say)}
    ${usageSection(say)}
    ${stickyDetailSection(say)}
    ${textCountSection(say)}
    ${leaveBarSection(say)}
    ${adoptBarSection(say)}
    ${replayGridSection(say)}
    ${askRowSection(say)}
    ${placeholderListSection(say)}
    ${kindMarkSection(say)}
    ${categoryBarSection(say)}
    ${dataTableSection(say)}
    ${layoutSection(say)}
    ${chapter("模式与场景")}
    ${arrivalSection(say)}
    ${recoverySections(say)}
    ${codingBasicsSection(say)}
    ${homePageAdoptionSections(say)}
    ${composeSection(say)}
    ${renderCatalogExamples(section)}
    ${options.presentationLocale ? presentationSection(options.presentationLocale, options.presentationPlugins) : ""}`;
  const extraSections = extraChapters.map((item) => item.sectionsHtml).join("\n");
  return `<div class="mw-catalog">
    ${catalogIndex(sections, say, extraChapters)}
    <style>${CATALOG_EXTRA_STYLES}${COMPOSER_STYLES}${CATALOG_PATTERN_STYLES}${COMPOSER_BOARD_STYLES}${KEEP_EDITS_BOARD_STYLES}${APPEARANCE_BOARD_STYLES}${SKILL_PACK_BOARD_STYLES}${SKILL_SELECTION_BOARD_STYLES}${CAPABILITY_PACK_BOARD_STYLES}${WORK_RECORDS_BOARD_STYLES}${LANGUAGE_BOARD_STYLES}${RECOVERY_BOARD_STYLES}${CODING_BASICS_BOARD_STYLES}${HOME_PAGE_ADOPTION_BOARD_STYLES}${options.presentationLocale ? PRESENTATION_FORM_STYLES + PRESENTATION_BOARD_STYLES : ""}</style>
    ${sections}
    ${extraSections}
  </div>
  <script>${CATALOG_CLIENT_SCRIPT}</script>`;
}
