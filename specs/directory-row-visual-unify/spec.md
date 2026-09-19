# 目录行视觉统一

## 背景与目标

第二栏已经共用 `mw-dir` / `DirectoryRow` 外壳，但 Feed / Sessions / Inbox / Artifacts / 设置 的行仍各自挂旧 class。工作台和插件 CSS 继续按这些 class 画卡片、蓝色选中、不同行高和内边距，看起来不像同一栏。

目标：目录 Item 只走 `mw-dir-row` 的视觉。完成等级 **3：功能可用**。不宣称可发布。

## 当前行为与问题证据

对照第二栏：

| 目录 | 行标记 | 实际观感 |
| --- | --- | --- |
| Sessions | `mw-dir-row` + `project-record-row` | 插件 CSS 仍按 92px 卡片、浅蓝选中、纸面阴影写；immersive 再用 `!important` 盖一层 |
| Inbox | `mw-dir-row` + `feed-list-item` | 账本 CSS 按 66px 双列图标行；选中蓝色；hover 直接当成选中底 |
| Feed | `mw-dir-row` + `feed-source-task` | 同一行被 immersive 与 linear-density 写两套 padding（2px 8px / 4px 6px） |
| Artifacts | `mw-dir-row` + `artifact-version-list` 特化 | 额外 `2px 6px` padding，字号再写一遍 |
| 设置 | 裸 `button` | 28px 但无 2px 左边条，当前项字重 550 |

点击、筛选、添加对话框合同未坏。丑的是行本身。

## 范围与非目标

范围：四个有列表的插件 directory 行 class；全局/项目设置分类行；`mw-dir-row` 为唯一行视觉；工作台去掉按旧 class 画目录行的规则；密度变量只打在 `mw-dir-row--compact|meta`；相关单测与定向 e2e；`DESIGN.md` 目录段补一句。

非目标：Goals 树、Feed 主区 `feed-stage-entry`、首页、市场、Feed/Inbox 详情、领域写入、把旧 class 的全局样式整文件删掉（账本/工作目录卡片 CSS 可留着，只要不再打到第二栏行上）。

## 使用场景

打开项目后，Sessions / Inbox / Feed / Artifacts / 设置 的当前行都是：平涂 `--nav-active`、左侧 2px `--ink` 条、标题 13/450（选中 550）。未选中 hover 只有 `--nav-hover`，没有左边条。Session 仍 28px 单行；其余列表 36px 两行，副文 12px。窄屏/粗指针仍用 `--dir-row-h` / `--dir-row-2h` 拉到 44px。行圆角 8px。

## 方案与关键决策

1. **行上不再挂视觉旧 class。** `data-*` 和面板 class（筛选菜单、Feed 任务配置）保留。Inbox 去掉 `feed-list-item`，Sessions 去掉 `project-record-row`，Feed 去掉 `feed-source-task`。
2. **视觉源只在 `PRIMITIVE_STYLES` 的 `.mw-dir-row*`。** 工作台只许用密度 token 改高度，不许改 padding、圆角、选中色。
3. **设置分类改成 DirectoryRow。** 仍用 compact class 与 `data-settings-section` / `data-settings-directory-nav`；和 Sessions 一样 28px、ink 左边条，不再用设置页 CSS 藏条或改成 36px。切分类时同步 `aria-current` 与 `is-selected`。
4. **列表滚动 class 不再当皮肤。** Inbox / Sessions 目录 list 不再加 `feed-item-scroll` / `project-record-scroll`。

## 输入输出与依赖

输入：现有 `DirectoryRow`、四插件 directory HTML、设置目录、immersive/linear CSS。  
输出：同一套行 chrome；测试证明目录 HTML 不再带上述视觉 class。  
依赖：`@molis-ai/molis-work-design-system`。

## 文件 / 模块边界

允许：`specs/directory-row-visual-unify/`、`plugins/native/{feed,work,inbox,artifacts}` 的 directory 标记、`apps/workbench` 设置目录与目录 CSS、`packages/design-system` 仅在目录行 helper/样式需要补齐时、对应测试、`DESIGN.md`。  
禁止：改 Goal 树、Feed 主区 Item 流水、MCP、凭据、Slot 合同。

## 验收

1. Feed / Sessions / Inbox 目录行 class 含 `mw-dir-row`，不含 `feed-source-task` / `project-record-row` / `feed-list-item`。
2. 设置分类仍是 `mw-dir-row--compact`（桌面细指针 28px + ink 条）；点分类仍切换右边文档。
3. Catalog 与真实目录：选中是 ink 左边条 + `--nav-active`，不是蓝色卡片；compact 28、meta 36（桌面细指针）。meta 行第一行是标题和计数，第二行是完整副标题，不被计数或配置按钮叠住。
4. Feed 任务配置、Sessions 新建、Inbox 筛选、Artifact 行点击合同不变。
5. 定向测试通过。隔离浏览器核四插件 + 设置目录。不打用户默认 home。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-design-system typecheck
pnpm --filter @molis-ai/molis-work-plugin-feed typecheck
pnpm --filter @molis-ai/molis-work-plugin-work typecheck
pnpm --filter @molis-ai/molis-work-plugin-inbox typecheck
pnpm --filter @molis-ai/molis-work-plugin-artifacts typecheck
pnpm --filter @molis-ai/molis-work-app-workbench typecheck
node --import tsx --test --test-concurrency=1 tests/primitives.test.ts tests/feed-native-plugin.test.ts tests/inbox-native-plugin.test.ts tests/workspace-directory.test.ts tests/session-directory.test.ts tests/work-session-ui.test.ts tests/artifact-browser.test.ts tests/project-settings-stage.test.ts tests/desktop-tui.test.ts tests/coss-control-language.test.ts
```

## 假设

不提交、不发布、不替换用户运行服务。
