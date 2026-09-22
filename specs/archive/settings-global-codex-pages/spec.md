# 全局设置正文对齐项目设置 Codex 节奏

状态：已落地。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次视觉对齐的唯一需求书。壳模型仍以 `specs/archive/settings-directory-panel/spec.md` 为准。项目设置卡片节奏以 `specs/settings-codex-surface/spec.md` 为准。

## 背景与目标

工作台右边的项目设置已经是浅画布 `--page`、760px 栏、白卡片、左文案右控件。全局设置（外观 / AI 与执行工具 / 规划方法 / 诊断）还停在旧文档：内容栏纸底或旧 `diagnostics-summary` / `launcher-section` 列表，叹号提示还会掉到栏底。看起来不像同一套偏好页。

目标：全局设置四个分类在工作台 exclusive stage（以及独立 `/settings*` 正文栏）与项目设置共用同一套容器、背景和行交互。

## 当前行为与问题证据

- `.settings-content` 被 quiet-paper / SETTINGS_STYLES 设成 `--paper`、旧文档 padding；诊断页用 `diagnostics-summary` + `launcher-section`，行是 60px 列表加左侧勾，不是 `settings-setting-row`。
- 标题旁 `mw-hint` 在不支持 CSS anchor 时落到视口底部，诊断页底部出现整段「如何生效」正文。
- 外观已用 `settings-section` + setting-row；诊断 / Runtime 没有。

## 范围与非目标

### 做

- 诊断、AI 与执行工具改成 `settings-section` + `settings-setting-row` + 与「常规」相同的 `settings-data-disclosure`。
- 诊断分区对齐「常规」：第一张卡是本页主信息、不加组标题；「启动入口」是带 h2 的第二区；「Web 常驻服务」用和「项目管理」相同的标题 + 说明 + 按钮区，不把长状态塞进 setting-row。
- 外观 / Runtime / 诊断的卡片直接挂在标题下面，不再包一层 `.settings-body`。规划、说明、规则编辑仍用 `.settings-body` 做滚动。
- `.settings-stage` / `body.settings-page` 内容栏背景 `--page`，去掉 quiet-paper 的纸底、内描边和 8px 外边距。深色主题下 `.settings-document` 也不再铺一层 `--paper` 底（那条底色边就是它）。
- 叹号提示关闭时不占布局；打开时贴在标题旁，不钉在页面底部。
- 规划方法继续走已有 `work-planning` / `planning-catalog` 卡片，确认画布与栏宽一致。

### 不做

- 不改诊断读取、Web 常驻服务、Runtime 预览确认的领域契约。
- 不改目录分类、exclusive 壳、保存 API。
- 不重做账号管理。

## 使用场景

1. 工作台点全局齿轮，切到诊断：标题在 760px 栏顶；第一张卡是安装状态/版本/项目数/本机路径，没有「Molis Work 本体」小标题；「启动入口」和「Web 常驻服务」各是一张带组标题的卡。常驻服务的冲突说明是段落，不是挤在行右侧的状态。点「本机路径」展开方式和项目「本地数据」一样。
2. 切到 AI 与执行工具：每个 Runtime 是卡片里的一行加可展开路径，不是 92px 大记录块。
3. 外观、规划方法：画布和卡片与项目设置同一套。
4. 标题旁叹号可点开，正文底部不再出现那一段说明。

## 方案与关键决策

1. **同一套容器，不给全局设置另做皮肤。** HTML 改用项目设置已有的 section/row/disclosure。
2. **画布是 `--page`，卡片是 `--paper`。** 全局正文不再铺一层纸底。
3. **提示是标题控件，不是页脚。**
4. **诊断分区跟「常规」同一套语法。** 页标题管第一张卡；只有后续不同职责才加 h2。操作区复用 `project-manager-danger`，不另做皮肤。

## 输入输出与依赖

- 输入：现有全局设置 HTML/CSS、项目设置卡片样式。
- 输出：四个分类在 stage 里可扫、可点、视觉与「常规」一致。
- 不改用户库。

## 文件 / 模块边界

- `apps/workbench/src/settings-renderer.ts`、`styles/project-settings-page.ts`、`i18n/en.ts`
- `packages/design-system/src/styles/primitives.ts`
- `specs/settings-codex-surface/spec.md`
- 测试：`tests/project-settings-stage.test.ts`

## 验收标准

1. 诊断 HTML 含 `settings-section` 与 `settings-setting-row`，不再用 `diagnostics-summary` / `launcher-section`。第一张卡没有「Molis Work 本体」h2；「Web 常驻服务」使用 `project-manager-danger`。外观 / Runtime / 诊断没有 `.settings-body` 包裹层。
2. 工作台 `[data-work-surface=settings] .settings-content` 背景为 `--page`；卡片为 `--paper`、12px 圆角。
3. 诊断切到「常规」再回来，标题仍在栏顶（沿用分类切换滚顶合同）。
4. 关闭状态下 `.mw-hint__tooltip` 不出现在内容流里。
5. 定向测试通过。完成等级 3 只在浏览器里四个分类都像项目设置之后宣称。

## 验证命令

```
node --import tsx --test --test-concurrency=1 \
  tests/project-settings-stage.test.ts \
  tests/visual-foundation.test.ts
```

Chrome 用 4180 预览，不打用户库。
