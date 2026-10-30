// The catalog board's choice group and composition specimens: the same primitives put together as product pages do.
import { icon, renderAlert, renderButton, renderChoice, renderDirectoryPanel, renderDirectoryRow, renderField, renderForm, renderFrame, renderInput, renderInputGroup, renderScrollArea, renderSelect, renderTextarea } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderToggleGroup, renderToolbar } from "./navigation.js";
import { renderDialog, renderMenu, renderMenuItem } from "./overlay.js";
import { mark, section, specimen } from "./catalog-parts.js";

export function choiceSection(): string {
  return section("choice", "Choice", `<p class="mw-catalog__hint">几个并排的选项：白色小选项，选中后变成石墨并出现勾。用于引导步骤与偏好；很多条目的列表不用它。</p><div class="mw-catalog__specimens">
    ${mark("choice", specimen("按钮 · aria-pressed", `<div class="mw-choice-group" role="group" aria-label="主题" data-catalog-choice-group>${renderChoice({ label: "浅色", icon: "sun", selected: true })}${renderChoice({ label: "深色", icon: "moon" })}${renderChoice({ label: "跟随系统", icon: "system" })}</div>`))}
    ${specimen("链接 · aria-current", `<div class="mw-choice-group" role="group" aria-label="语言">${renderChoice({ label: "简体中文", href: "#choice", selected: true })}${renderChoice({ label: "English", href: "#choice" })}</div>`)}
  </div>`);
}

export function composeSection(): string {
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
  return section("compose", "组合", `<p class="mw-catalog__hint">组件放在一起时依然精致：目录与详情、工具条与筛选、带错误的表单、对话框里的菜单、长内容与嵌套滚动、窄窗口与密度。都可以实际操作。底栏与它的浮层在工作台页面里由 Workbench 组合，见本页末尾。</p><div class="mw-catalog__specimens">
    ${specimen("目录与详情", composeSplit)}
    ${specimen("工具条与筛选", composeToolbar)}
    ${specimen("带错误的表单", composeForm)}
    ${specimen("对话框里的菜单", renderButton({ label: "打开对话框", variant: "secondary", attrs: { "data-catalog-open": "compose-dialog" } }) + composeDialog)}
    ${specimen("长内容与嵌套滚动", composeLong)}
    ${specimen("窄窗口与密度", composeNarrow)}
  </div>`);
}
