import { icon, ICON_LIBRARY } from "../icons.js";
import {
  MW_ACTION_TONES,
  MW_CONTENT_MARKS,
  MW_CONTENT_SURFACES,
  MW_HUES,
  MW_PLUGINS,
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
  const plugins = MW_PLUGINS.map((plugin) => swatch(`--plugin-${plugin.id}`, plugin.label, plugin.hue)).join("");
  const status = MW_STATUS_TONES.map((item) => swatch(item.token, item.label, item.role)).join("");
  const content = MW_CONTENT_SURFACES.map((item) => swatch(item.token, item.label, item.role)).join("");
  const marks = MW_CONTENT_MARKS.map((mark) => swatch(`--mark-${mark.id}`, mark.label, mark.role, `--mark-${mark.id}-fill`)).join("");
  return section("palette", "色板", `<div class="mw-catalog__specimens">
    ${specimen("平面", `<div class="mw-swatch-row">${surfaces}</div>`)}
    ${specimen("字", `<div class="mw-swatch-row">${type}</div>`)}
    ${specimen("动作", `<div class="mw-swatch-row">${action}</div>`)}
    ${specimen("色相", `<div class="mw-swatch-row">${hues}</div>`)}
    ${specimen("插件", `<div class="mw-swatch-row">${plugins}</div>`)}
    ${specimen("状态", `<div class="mw-swatch-row">${status}</div>`)}
    ${specimen("内容平面", `<div class="mw-swatch-row">${content}</div>`)}
    ${specimen("内容标记", `<div class="mw-swatch-row">${marks}</div>`)}
  </div>`);
}

function typefaceSection(): string {
  return section("typeface", "字体", `<div class="mw-catalog__specimens">
    ${specimen("Inter Variable + Noto Sans SC", `<div class="mw-type-sample">
      <p class="mw-type-sample__latin">Inter Variable · Regular</p>
      <p class="mw-type-sample__zh">目标推进 · 置物架 · 会话</p>
      <p class="mw-type-sample__mix">Molis Work 把目标和会话放在同一张工作台上</p>
    </div>`)}
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

  const sheet = renderSheet({
    labelledBy: "catalog-sheet-title",
    title: "新建目标",
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

  return `<div class="mw-catalog">
    ${paletteSection()}
    ${typefaceSection()}
    ${iconSection()}
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
      ${mark("empty", specimen("空态", empty))}
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
    })))}${mark("collapsible", specimen("折叠", renderCollapsible({ summary: "补充说明与验收条件", body: "<p>可稍后补。</p>" })))}${mark("combobox", specimen("组合框", renderCombobox({
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
    })))}</div>`)}
  </div>
  <script>
    document.querySelectorAll("[data-catalog-open]").forEach((button) => {
      button.addEventListener("click", () => {
        const kind = button.getAttribute("data-catalog-open");
        document.querySelector("[data-catalog-demo='" + kind + "']")?.showModal();
      });
    });
    document.querySelectorAll("dialog[data-catalog-demo] [data-dialog-close]").forEach((button) => {
      button.addEventListener("click", () => button.closest("dialog")?.close());
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
