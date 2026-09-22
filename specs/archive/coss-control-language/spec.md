# Coss 控件语言（保留 Calm Desktop 空间）

状态：本切片完成。完成等级 **3：功能可用**。不宣称整站每个历史页面都已扫完，不宣称可发布。

本文件是本次体验变更的唯一需求书。授权来自 2026-09-15：不引入 React / Coss 组件库；诗意首页、石墨目录、Goal 画布等空间保留；按钮、输入、对话框、菜单、标签、圆角、描边统一成 [Coss UI](https://coss.com/ui/docs) 的控件手感。

## 背景与目标

同一产品里控件各画一套：Settings 按钮 4px 蓝描边，工作台主按钮近黑 8px，Session 对话框 7px，Feed 主按钮又被涂成钴蓝。视觉不统一的主因是控件语言分叉，不是缺 React。

目标：在现有 HTML 字符串渲染上，用一套 Coss 式控件合同盖过分叉，用户在设置、对话框、表单和工作台主操作上摸到同一套密度和手感。

## 当前行为与问题证据

- `apps/workbench/src/styles/settings.ts`：`.settings-button` 等 `border-radius: 4px`、蓝字描边、hover 涂 `--blue-soft`。
- `packages/design-system/src/styles/calm-desktop.ts`：主按钮写死 `8px` / `38px`。
- `packages/design-system/src/styles/personal-workbench-v3.ts`：Feed 主按钮改成 `--blue-dark` 填充。
- `plugins/native/work/src/ui/styles.ts`：对话框脚 7px、主按钮 `--ink` 填充，与 Settings 不是一家。
- 工作台 immersive 与 Settings 还各有一套焦点色。

Coss 公开 token（Styling）：`--radius: 0.625rem`（10px）、主色近黑、次级/静音为 ink 约 4% 填充、描边 ink 约 8%（不透明混合）、输入描边约 10%、对话框带浅底影。

## 范围与非目标

### 范围

- 共享 token：`--radius-control: 10px`、`--radius-surface: 12px`、`--control-h: 32px`、半透明描边/填充/阴影/焦点环。目录行仍用 `--radius-item: 6px`。
- 主按钮：近黑 `--action`，10px 圆角，高 32px，不再用钴蓝填充当主按钮。
- 次按钮：ink 4.5% 底 + 8% 描边，墨色字，不要蓝描边蓝字。
- 文本输入 / select / textarea（表单、设置、对话框）：同一高度、圆角、描边；焦点用 ink 环，不再蓝软底。
- 对话框 / 计划确认 / Session 操作框：12px 表面圆角、同一描边和底影、脚按钮走次/主合同。
- 工作台、设置、项目列表三张样式表都以该层收尾，避免 immersive 后置样式把主按钮又涂回钴蓝。

### 非目标

- 不引入 React、Tailwind、Base UI、Coss 组件源码。
- 不改诗意首页构图、引语、月历、23px 输入条、目录行高/选中语法、Goal 画布、终端画布、Tab 工作区拓扑。
- 不把设置改成 Cal.com 后台，不加卡片墙/表格仪表盘。
- 不重做命令面板（全局搜索已接近 Command，只吃共享 token，不压矮搜索条）。
- 不在本切片逐文件清掉全部历史 4–8px 特例；未点名的图标钮、树工具、密度开关保持原几何，以免弄坏点击目标。

## 使用场景

1. 打开全局设置或项目设置：操作按钮是近黑主按钮或浅灰次按钮，输入框 10px 圆角，不再出现 4px 蓝描边。
2. 打开新建 Goal / Session / 删除确认：对话框同一圆角和脚按钮。
3. Feed / Inbox 主操作「加入 Inbox」「完成」与设置里的保存，都是近黑主按钮。
4. 浅色/深色都成立；窄屏对话框仍可全屏，脚按钮触控高度仍由既有 44px 规则覆盖。

## 方案与关键决策

- **空间 vs 控件**：空间继续 Calm Desktop（石墨目录、诗意首页、钴/紫只作链接与画布焦点的既有语义，不强迫改目录）。控件跟 Coss：近黑主操作、浅填充次操作、半透明描边、10/12px 圆角。
- **合同层后置**：新层 `COSS_CONTROL_STYLES` 挂在 visual foundation 末尾，并再挂到 workbench / settings / project-index 样式表最后，覆盖后置的 Feed 钴蓝主按钮。
- **不改 HTML 合同**：继续 `declarative-html`；只改 CSS token 与选择器。

## 输入输出与依赖

- 输入：现有 class（`.button-primary`、`.settings-button`、`dialog` footer、表单控件）。
- 输出：同一 DOM，计算样式符合控件合同。
- 依赖：`packages/design-system`、`apps/workbench` 样式装配、Work plugin 对话框样式。

## 文件 / 模块边界

- `packages/design-system/src/styles/coss-controls.ts`（新）
- `packages/design-system/src/visual-foundation.ts`、`src/styles/foundation.ts`、必要时 `calm-desktop.ts`
- `apps/workbench/src/renderer.ts` 三张 stylesheet 收尾
- `apps/workbench/src/styles/settings.ts`、`workbench.ts`、`project-index.ts`
- `plugins/native/work/src/ui/styles.ts`
- `DESIGN.md` 控件段落
- 测试：`tests/coss-control-language.test.ts`，更新 `tests/visual-foundation.test.ts` 中半径断言

## 验收标准

1. `:root` 提供 `--radius-control: 10px`、`--control-h: 32px`、`--control-border`。**通过** — 隔离 Web 计算样式与 `tests/coss-control-language.test.ts`。
2. `.button-primary` / `.goal-primary-action` 使用 `--action` 填充和 `--radius-control`，工作台 stylesheet 在 immersive 之后仍保持该合同。**通过** — Coss 层挂在 immersive 之后；快捷方式「保存」不再是钴蓝。
3. Settings 的 `.settings-button` 等次按钮不再是 `4px` + `--blue-dark` 描边字。**通过** — 「保存名称 / 重建 demo」为 32px × 10px 浅填充；「删除 demo」为同族危险色。
4. 设置页、项目列表、工作台（含一个对话框）浅色可核对：主/次按钮与输入框同族。**通过** — 隔离 `--home`：`/settings/projects`、导入对话框、项目列表、工作台快捷方式对话框；深色外观页也可切换。
5. 定向测试通过。**通过** — `coss-control-language`、`visual-foundation`、`chrome-inner-scroll`、`project-settings-accordion`、`project-index-arrival`。
6. 诗意首页日期/引语/月历/禁用输入条未改结构。**通过** — `.home-composer` 仍为 76px 高、23px 圆角。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-design-system build
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/coss-control-language.test.ts \
  tests/visual-foundation.test.ts \
  tests/chrome-inner-scroll.test.ts
```

浏览器：隔离 `--home` 启动 Web，打开 `/settings/appearance`、项目列表、工作台首页；禁止打用户默认 home。

## 假设与开放问题

- 假设：用户确认的是「控件 Coss、空间 Calm Desktop」，不是整站换成 Cal.com 皮肤。
- 后续：Goal 事件文档里的次级文字链、历史 5px 表单圆角，可另开切片继续收。
