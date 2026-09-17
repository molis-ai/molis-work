# Coss 原语组件库

## 背景与目标
工作台视觉已按 Linear × Coss 对齐，但控件和外壳仍有两套语言：`mw-*` 原语只覆盖了第一批表单/浮层，Coss 其余原语、Sidebar/Frame 等布局、以及 `document-action` / `text-button` / `.button` 仍各写一套。

目标：一次性补齐 Coss 官方组件表上的全部原语（产品暂未用到的也进 Catalog 与 helper），把外壳和布局映射到同一套 `mw-*`，并把产品里还在用的旧控件 class 收掉。完成等级 3：真实页面接通并浏览器验证；不宣称原生安装包。

## 当前行为与问题
- UI 合同仍是 HTML 字符串（`UiContribution.render()` → `UiMountResult.html`）。
- 已有 Button / Field / Sheet / Dialog 等约 30 个 `mw-*`；Calendar、Drawer、Sidebar、Table、OTP 等按旧计划 later。
- Goal 文档、规划库、Session、Frame 选择器、设置折叠、标签右键菜单仍用 `document-action`、`text-button`、`.button`、`icon-button`、`planning-primary-action`。
- 目录、插件轨、工作区、Home 月历是独立几何，没有布局原语契约。

## 范围与非目标
范围：
1. Coss 官方 Components 全表进 `mw-*` CSS + HTML helper + `/__ui/catalog`（hooks 除外）。
2. 外壳/布局原语落地，并替换现有壳层 class：Sidebar、Frame、Group、Card、Breadcrumb、Scroll Area、Drawer；工作标签右键改为 Context Menu；设置折叠改为 Accordion/Collapsible；Home 月历改为 Calendar。
3. 产品里仍在用的旧控件 class 全部改为 `mw-*`（含 Goal 文档动作、事件表单、规划库、Feed/Inbox 残留、Session、Frame 选择器、设置与项目删除、插件市场）。

非目标：不迁 React / Tailwind / Coss 包；不改领域写入、MCP、凭据、插件 Slot 合同（仍返回 HTML）；不重做 Goal 画布节点交互与依赖算法；不把 Home 作曲家改成可用 Agent。

## 使用场景
作者和 Agent 在 Catalog 核全部 Coss 原语的变体/状态/主题。用户在目录、标签、Goal/Feed/Session、设置、Home 月历上碰到同一套控件与外壳。

## 方案与关键决策
- 公共契约仍是带 `mw-*` class 的 HTML。Coss / shadcn Nova·Mira 只当语法与密度参考；不装它们的包。
- 密度继续 Mira：默认 `sm` 28px，表单主操作 `lg` 36px，窄屏/粗指针 44px。Nova 不做成第二套皮肤。
- Primary 仍是 Action 近黑/近白。
- Sheet：桌面贴工作区右缘的临时编辑。Drawer：窄屏从边缘盖住工作区（目录用左侧 Drawer；Catalog 另给底边示例）。Dialog：居中确认/搜索。Alert Dialog：破坏性确认。
- Sidebar：插件轨 `mw-sidebar--rail` + 目录 `mw-sidebar--directory`；主区是 Sidebar 的 inset，用 `mw-frame`。几何仍由现有 grid 负责，token 与分隔线走原语。
- Frame：标签工作区与各 plugin stage 的内容框（header / panel / footer），不是重做分栏算法。
- Group：成组的图标按钮（历史前后、标题栏工具）。
- Card：插件市场条目、设置摘要、Home 快捷方式。画布节点保持现有卡片形态，不改成仪表盘卡片墙。
- Breadcrumb：有层级的返回路径（规划方法详情返回、设置路径），不恢复顶部第二导航。
- Scroll Area：目录滚动、标签内容、Sheet/Form 字段区。
- Accordion：项目设置折叠栈（多项可同时开，与现在 details 行为一致）。
- Context Menu：工作标签/分组右键；保留现有 popover 定位与键盘。
- Calendar：Home 月历与 Catalog 共用周一为周首的月网格；Date Picker 是 Input + Calendar 弹出。
- 旧 class 迁移完成后，CSS 不再为 `.button-primary` 等业务名定义填充；测试断言 `mw-*`。迁移期允许 HTML 暂时同时带旧名，但本轮交付时产品标记应已去掉旧名。
- 控件质量底线：每个交互原语有 hover / focus-visible / active / disabled（异步再加 loading）。字段焦点与工作台同一套 1px + 3.5px halo。禁用主按钮保持 Action 填充，只用透明度，不得画成次按钮；加载中主按钮同样保持 Action，spinner 用 currentColor。按钮、勾选、选择框 `appearance: none`，不吃系统灰底。通用 `button:focus-visible` 与全局 `input` 化妆品不得盖掉 `mw-*`，也不得把 `type=range` / `.mw-slider` 画成文本框。Slider 是 28px 热区 + 4px 轨：已走进度 `--action`，未走 `--control-fill`；拇指是 16px `--paper` 圆点（与 Switch 同一抬起阴影），焦点 halo 画在拇指上。Input Group / Number Field 只有外壳描边，内部控件无边框。Catalog 按标本组展示真实 sm 密度，不把整页按钮抬到触控 44px。Catalog 虽复用设置页 stylesheet，标本区必须自己滚动，不能被 `settings-page` 的 `overflow: hidden` 裁死。
- 目录/容器质感：Directory 是 `--nav-bg` 连续栏，不是描边卡片；行贴紧、分组标题上 10 / 下 4；标题 13/450，选中 550 + `--ink`；副文与计数 12/400 `--faint`。状态标 12/400 家族色，Lucide 12px + 文案，无第二层盒子。选中是 `--nav-active` + 2px `--ink` 条，含行尾动作。工具行是插件名加图标动作。Sidebar+Frame 在 Catalog 里是裁切的工作台，不是三列零件盒：48 插件轨 / 240 目录 / 纸面，切片高 440；纸面是主平面，目录只放当前插件的短列表。轨与目录同 `--nav-bg`，两道栏缝都是 `--line`，纸面 `--paper`；轨按钮 36×32 / 8px，当前插件色。Frame 页眉 16/550，动作是文字链不是胶囊。圆角：行 8、控件 10、分组纸面/外壳 12；贴边 Sheet 与 Goal 主区仍方角。容器内部不再用横线切页眉页脚或表格行，靠色阶和间距分区；外轮廓 hairline 与栏/纸面色阶保留。Card 12px 分组纸面 + hairline，不加投影。间距走 4/8/12/16/24/32。

## Coss 原语与产品映射

| Coss | 根 class | 产品替换 |
| --- | --- | --- |
| Accordion | `mw-accordion` | 项目设置折叠栈、设置 disclosure |
| Alert | `mw-alert` | 表单错误/状态 |
| Alert Dialog | `mw-dialog--alert` | 回收站、归档确认、删项目 |
| Autocomplete | `mw-autocomplete` | Catalog + 搜索建议壳 |
| Avatar | `mw-avatar` | Catalog；账号处可复用 |
| Badge | `mw-badge` | 状态标 |
| Breadcrumb | `mw-breadcrumb` | 规划详情返回链 |
| Button | `mw-btn` | 全部主次/危险/链接/图标按钮 |
| Calendar | `mw-calendar` | Home 月历 |
| Card | `mw-card` | 市场条目、设置摘要、Home 快捷方式 |
| Checkbox / Checkbox Group | `mw-check` / `mw-check-group` | 表单多选 |
| Collapsible | `mw-collapsible` | 表单补充段 |
| Combobox | `mw-combobox` | 选择 + 输入 |
| Command | `mw-command` | 搜索 palette 壳 |
| Context Menu | `mw-menu--context` | 标签/分组右键 |
| Date Picker | `mw-date-picker` | Catalog；日期字段可接 |
| Dialog | `mw-dialog` | 居中确认 |
| Drawer | `mw-drawer` | 窄屏目录覆盖 |
| Empty | `mw-empty` | 空列表 |
| Field / Fieldset / Form | `mw-field` / `mw-fieldset` / `mw-form` | 表单 |
| Frame | `mw-frame` | 插件主区 / 标签内容框 |
| Group | `mw-group` | 成组工具按钮 |
| Input / Input Group / Textarea / Select | `mw-input` / `mw-input-group` / `mw-textarea` / `mw-select` | 字段 |
| Kbd | `mw-kbd` | 快捷键 |
| Label | `mw-label` | 独立标签 |
| Menu | `mw-menu` | 下拉菜单 |
| Meter | `mw-meter` | Catalog |
| Number Field | `mw-number` | 优先级等数字 |
| OTP Field | `mw-otp` | Catalog |
| Pagination | `mw-pagination` | Catalog；时间线“更早”可视为简化页 |
| Popover | `mw-popover` | 弹出层 |
| Preview Card | `mw-preview-card` | Catalog |
| Progress | `mw-progress` | 进度 |
| Radio Group | `mw-radio-group` | 单选组 |
| Scroll Area | `mw-scroll` | 目录与主区滚动 |
| Separator | `mw-separator` | 分隔 |
| Sheet | `mw-sheet` | Goal/Feed/Session 贴边编辑 |
| Sidebar | `mw-sidebar` | 插件轨 + 目录 |
| Skeleton / Spinner | `mw-skeleton` / `mw-spinner` | 加载 |
| Slider | `mw-slider` | Catalog |
| Switch | `mw-switch` | 开关 |
| Table | `mw-table` | Catalog；设置版本表可接 |
| Tabs | `mw-tabs` | 内容区页签（含来源详情） |
| Toast | `mw-toast` | 短反馈 |
| Toggle / Toggle Group | `mw-toggle` / `mw-toggle-group` | 分段选择 |
| Toolbar | `mw-toolbar` | 工具条 |
| Tooltip | `mw-tooltip` | 悬停说明 |

产品第二栏列表不是 Coss 表项，用 `mw-dir` / `mw-dir-row`（compact 28px / meta 36px）。Sidebar 是目录栏外壳；Directory 是栏内列表。合同见 [`specs/directory-list-primitive/spec.md`](../directory-list-primitive/spec.md)。

不做 Coss hooks（`useMediaQuery`、`useCopyToClipboard`）。

## 输入输出与依赖
输入：现有 token、Lucide 图标、插件 HTML、Workbench 壳、Coss 组件表。
输出：扩展后的 `PRIMITIVE_STYLES`、`render*` helpers、Catalog、替换后的壳层与插件标记。
依赖：`@molis-ai/molis-work-design-system`。

## 文件与模块边界
允许：`specs/coss-primitive-library/`、`packages/design-system/src`、`apps/workbench/src`、`apps/local-host/src` 路由、`plugins/native/**` 的 UI 标记、对应测试与样式。
禁止：改 Goal/Feed/Session 写入语义、MCP、凭据、插件 Slot 合同。

## DOM / class 契约
前缀 `mw-`。根节点带 `data-slot`（Coss 名的 kebab-case）。状态：hover / focus-visible / active / disabled；表单加 `aria-invalid` 与 error；异步按钮 `data-loading` 且 `disabled`。

日历周首为周一，与现行 Home 月历一致。OTP 输入后焦点右移。Number Field 步进按钮不改 `min`/`max` 以外的值。Drawer 与 Sheet 都用原生 `<dialog>`，保留 Escape 与焦点返回。

## 验收
1. Catalog `/__ui/catalog` 为上表每个 Coss 组件列出至少一种真实变体，浅/深色可切换。
2. 工作台壳层：插件轨 + 目录带 `mw-sidebar`，主区带 `mw-frame`，目录滚动带 `mw-scroll`；窄屏目录表现为 Drawer（scrim + 边缘覆盖），桌面 Sheet 仍贴右缘。
3. Home 月历使用 `mw-calendar`；月份切换与“今天”行为保持现有 e2e。
4. 标签右键菜单带 `mw-menu mw-menu--context`；固定/关闭等动作不变。
5. 产品 HTML 不再出现作为控件皮肤的 `document-action`、`text-button`、`goal-primary-action`、`planning-primary-action`、独立 `.button` / `.button-primary` / `.icon-button`（布局钩子 class 除外）。
6. 主次按钮、空态、表单底栏、确认框继续走 `mw-btn` / `mw-form` / `mw-dialog`。
7. `pnpm --filter @molis-ai/molis-work-design-system typecheck` 与定向测试通过；浏览器核 Catalog、Home 月历、Goal 文档动作条、目录窄屏、标签右键。

## 验证命令
```
pnpm --filter @molis-ai/molis-work-design-system typecheck
pnpm --filter @molis-ai/molis-work-design-system build
pnpm --filter @molis-ai/molis-work-app-workbench typecheck
node --import tsx --test --test-concurrency=1 tests/primitives.test.ts tests/coss-control-language.test.ts tests/visual-foundation.test.ts tests/goals-dialogs-ui.test.ts tests/work-session-ui.test.ts tests/project-home-start.e2e.test.ts tests/compact-icon-tabs.e2e.test.ts
```
浏览器打开隔离实例的 `/__ui/catalog`、项目 Home、Goal 文档、窄屏目录。

## 假设
不提交、不发布、不替换用户运行服务。画布节点几何保持现契约。
