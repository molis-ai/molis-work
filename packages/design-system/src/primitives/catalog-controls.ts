// The catalog board's control specimens: buttons, fields, forms, feedback, overlays, menus and tabs.
import { icon } from "../icons.js";
import { renderButton } from "./button.js";
import { renderCalendar, renderDatePicker } from "./calendar.js";
import { renderAutocomplete, renderCheckbox, renderCheckboxGroup, renderField, renderFieldset, renderForm, renderInput, renderInputGroup, renderLabel, renderMeter, renderNumberField, renderOtpField, renderRadio, renderRadioGroup, renderSelect, renderSlider, renderSwitch, renderTextarea, renderToggle } from "./field.js";
import { renderAlert, renderAvatar, renderBadge, renderEmpty, renderKbd, renderProgress, renderSeparator, renderSkeleton, renderSpinner, renderToast } from "./feedback.js";
import { renderAccordion, renderBreadcrumb, renderCollapsible, renderCombobox, renderPagination, renderTabs, renderToggleGroup, renderToolbar } from "./navigation.js";
import { renderAlertDialog, renderCommand, renderContextMenu, renderDialog, renderDrawer, renderMenu, renderMenuItem, renderHint, renderPopover, renderPreviewCard, renderSheet, renderTooltip } from "./overlay.js";
import { mark, section, specimen } from "./catalog-parts.js";

export function buttonSection(): string {
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
  return section("button", "Button", `<div class="mw-catalog__specimens">
      ${specimen("主操作", `${primary}${secondary}${ghost}`)}
      ${specimen("破坏性", `${danger}${dangerOutline}`)}
      ${specimen("文字 / 图标", `${link}${iconBtn}`)}
      ${specimen("状态", `${loading}${disabled}${disabledSecondary}`)}
      ${specimen("尺寸", `<div class="mw-catalog__sizes">${sizes}</div>`)}
    </div>`);
}

export function fieldSection(): string {
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
  return section("field", "Field / Input / Textarea / Select", `<div class="mw-catalog__specimens">
      ${mark("field", specimen("默认", input))}
      ${mark("input", specimen("错误", invalid))}
      ${specimen("禁用", disabledField)}
      ${mark("textarea", specimen("多行", textarea))}
      ${mark("select", specimen("选择", select))}
      ${mark("label", specimen("独立标签", renderLabel({ text: "独立标签" })))}
      ${mark("checkbox", specimen("选择控件", checks))}
      ${mark("input-group", specimen("输入组合", group))}
      ${mark("fieldset", specimen("字段组", fieldset))}
    </div>`);
}

export function groupsSection(): string {
  return section("groups", "Checkbox Group / Radio Group / Switch", `<div class="mw-catalog__specimens">${mark("checkbox-group", specimen("多选组", renderCheckboxGroup({
      legend: "完成依赖",
      body: renderCheckbox({ name: "g1", label: "设计系统" }) + renderCheckbox({ name: "g2", label: "浏览器验证" }),
    })))}${mark("radio-group", specimen("单选组", renderRadioGroup({
      legend: "视图",
      name: "catalog-view",
      items: [{ value: "list", label: "列表", checked: true }, { value: "board", label: "看板" }],
    })))}${mark("switch", specimen("开关", renderSwitch({ name: "catalog-switch-2", label: "显示已归档", checked: false })))}</div>`);
}

export function advancedFieldSection(): string {
  return section("advanced-field", "Number / OTP / Slider / Meter / Autocomplete", `<div class="mw-catalog__specimens">
      ${mark("number-field", specimen("数字", renderNumberField({ name: "priority", value: 50, min: 0, max: 100 })))}
      ${mark("otp-field", specimen("验证码", renderOtpField({ name: "otp" })))}
      ${mark("slider", specimen("滑杆", renderSlider({ name: "density", value: 28, min: 24, max: 44, label: "密度" })))}
      ${mark("meter", specimen("计量", renderMeter({ value: 64, label: "子项进度" })))}
      ${mark("autocomplete", specimen("建议", renderAutocomplete({
      placeholder: "搜索 Goal",
      items: `<button type="button" role="option">统一控件语言</button><button type="button" role="option">产品主链</button>`,
    })))}
    </div>`);
}

export function formSection(): string {
  const primary = renderButton({ label: "保存", variant: "primary" });
  const secondary = renderButton({ label: "取消", variant: "secondary" });
  const input = renderField({
    label: "目标名称",
    required: true,
    hint: "一句话说明要完成什么",
    control: renderInput({ name: "catalog-title", placeholder: "例如：统一控件语言", required: true }),
  });
  const form = renderForm({
    header: `<div><h2>表单壳</h2><p>固定标题与操作，字段内部滚动。</p></div>`,
    body: input,
    footer: `${secondary}${primary}`,
    className: "mw-catalog-form",
  });
  return section("form", "Form", form);
}

export function badgeSection(): string {
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
    action: `<div class="mw-empty__actions">${renderButton({ label: "从模板新建", icon: "library", variant: "secondary" })}${renderButton({ label: "导入已有文档", icon: "upload", variant: "secondary" })}</div>`,
  });
  return section("badge", "Badge / Alert / Empty", `<div class="mw-catalog__specimens">
      ${mark("badge", specimen("状态标", badges))}
      ${mark("alert", specimen("提示", alerts))}
      ${mark("empty", specimen("空态 · 一个首要动作", empty))}
      ${specimen("空态 · 几个起点", emptyStarts)}
    </div>`);
}

export function feedbackSection(): string {
  return section("feedback", "Toast / Spinner / Skeleton / Progress / Kbd / Avatar", `<div class="mw-catalog__specimens">
      ${mark("toast", specimen("短反馈 · 一种 Toast", `<div class="mw-catalog__toasts">${renderToast({ message: "已保存", tone: "success" })}${renderToast({ message: "已移到回收站", action: { label: "撤销" } })}${renderToast({ message: "没有存上，请重试", tone: "danger" })}</div>`))}
      ${mark("spinner", specimen("加载", renderSpinner({ label: "加载中" })))}
      ${mark("skeleton", specimen("占位", renderSkeleton()))}
      ${mark("progress", specimen("进度", renderProgress({ value: 40, label: "子项进度" })))}
      ${mark("kbd", specimen("快捷键", renderKbd("⇧F10")))}
      ${mark("avatar", specimen("头像", renderAvatar({ label: "一骏" })))}
    </div>`);
}

export function separatorSection(): string {
  return section("separator", "Separator", renderSeparator());
}

export function calendarSection(): string {
  const calendar = renderCalendar({ year: 2026, month: 8, today: "2026-09-17", selected: "2026-09-10" });
  const datePicker = renderDatePicker({
    name: "catalog-date",
    value: "2026-09-17",
    calendar: { year: 2026, month: 8, today: "2026-09-17", selected: "2026-09-17", compact: true },
  });
  return section("calendar", "Calendar / Date Picker", `<div class="mw-catalog__specimens">${specimen("月历 · 今天描边，选中近黑", calendar)}${mark("date-picker", specimen("日期字段", datePicker))}</div>`);
}

export function overlaySection(): string {
  const primary = renderButton({ label: "保存", variant: "primary" });
  const secondary = renderButton({ label: "取消", variant: "secondary" });
  const danger = renderButton({ label: "删除", variant: "danger" });
  const input = renderField({
    label: "目标名称",
    required: true,
    hint: "一句话说明要完成什么",
    control: renderInput({ name: "catalog-title", placeholder: "例如：统一控件语言", required: true }),
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
  return section("overlay", "Dialog / Sheet / Alert Dialog / Drawer", `<p class="mw-catalog__hint">Sheet 贴右缘；Dialog 居中；Drawer 窄屏从边缘覆盖；Alert Dialog 用于破坏性确认。</p>
      <div class="mw-catalog__specimens">${specimen("打开浮层", `
        ${renderButton({ label: "打开 Sheet", variant: "secondary", attrs: { "data-catalog-open": "sheet" } })}
        ${renderButton({ label: "打开 Dialog", variant: "secondary", attrs: { "data-catalog-open": "dialog" } })}
        ${renderButton({ label: "打开 Alert", variant: "danger-outline", attrs: { "data-catalog-open": "alert" } })}
        ${renderButton({ label: "打开 Drawer", variant: "secondary", attrs: { "data-catalog-open": "drawer" } })}
      `)}</div>
      ${mark("sheet", sheet)}${mark("dialog", dialog)}${mark("alert-dialog", alertDialog)}${mark("drawer", drawer)}`);
}

export function menuSection(): string {
  return section("menu", "Menu / Context Menu / Popover / Tooltip / Command / Preview Card", `<div class="mw-catalog__specimens">${mark("menu", specimen("菜单", renderMenu({
      items: renderMenuItem({ label: "固定标签", iconName: "check" }) + renderMenuItem({ label: "关闭", iconName: "x", danger: true }),
    })))}${mark("context-menu", specimen("右键菜单", renderContextMenu({
      items: renderMenuItem({ label: "固定标签", iconName: "lock" }) + renderMenuItem({ label: "关闭标签", iconName: "x", danger: true }),
    })))}${mark("popover", specimen("弹出层", renderPopover({ body: "项目切换", preview: true })))}${mark("tooltip", specimen("标题旁说明", renderHint({ id: "catalog-hint", label: "如何生效", text: "只发送当前生效版本。" })) + specimen("短标签", renderTooltip({ text: "当前 Goal" })))}${mark("command", specimen("命令面板", renderCommand({
      labelledBy: "catalog-command",
      placeholder: "搜索并跳转",
      groups: `<button type="button" role="option">Goals · 统一控件语言</button>`,
    })))}${mark("preview-card", specimen("预览", renderPreviewCard({ title: "统一控件语言", body: "Goal · 进行中 · 下一步：收口旧按钮 class。" })))}</div>`);
}

export function tabsSection(): string {
  const primary = renderButton({ label: "保存", variant: "primary" });
  const ghost = renderButton({ label: "更多", variant: "ghost", icon: "more" });
  return section("tabs", "Tabs / Toolbar / Toggle / Collapsible / Combobox / Accordion / Pagination / Breadcrumb", `<div class="mw-catalog__specimens">${mark("tabs", specimen("页签", renderTabs({
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
    })))}</div>`);
}
