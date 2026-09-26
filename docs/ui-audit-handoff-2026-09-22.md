# Molis Work UI 修复交接给 Grok

历史审计说明：本文路径和行号对应 2026-09-22 快照。Functions 编辑器现已迁至 `apps/workbench/src/functions`，旧插件目录不再存在；当前迁移与验证以 `specs/action-architecture/migration.md` 为准。

## 接手目标与当前状态

请逐项修复本次审计发现的 8 个明确问题：6 项已在界面复现，2 项已核对源码触发链、尚未做写入复现。修复后做针对性工程验证与可见界面复验，按每一项的真实证据交付，不把“测试通过”写成“全产品体验通过”。

用户先要求端到端检查视觉、UI、布局、动效与交互，随后要求“直接一个个修掉”，最后指定由 Grok 接手，本 Agent 只写交接。**尚未开始实现，没有代码补丁、没有新增或修改测试，没有为修复启动构建或重启服务。** 本次写入仓库的交付物只有这份文档；此前截图和审计报告在仓库外。

建议顺序：先修 #1 分屏、#2 Inbox 键盘、#3 Functions 输入保留，再修 #4 搜索、#5 标题、#6 菜单、#7 快捷键、#8 弹层定位。可以按局部改动推进，不需要新框架、全局重构或整套视觉换版。

## 工作区与权限边界

- 仓库：`/Users/oreal/adeptify-home/repos/molis-work`。
- 最近核对分支：`main`；HEAD：`f25ea171271ce3cfb417e19621de90194141fafd`。接手时重新核对。
- 工作区已有大量未提交改动，覆盖 Feed、Inbox、Pages、Functions、工作台等；审计时也有其他任务持续修改。这些都不是本次修复产生的改动。先记录当前 diff 与文件状态，再做局部修改；不要 reset、clean、整文件覆盖或全量暂存。
- 用户授权的是修复与验证。没有授权提交、推送、合并、发布、安装覆盖用户 App、调用付费模型、向第三方发送内容或删除用户数据。
- 测试可使用独立临时 home 和代表性 fixture；不要为复现修改用户日常数据、连接器权限或实际业务记录。
- 正式设计依据是 `DESIGN.md`、`docs/design/taste.md` 和 `/__ui/catalog`。旧 UI renewal Demo 已停止作为迭代依据。
- 本文行号是交接时的定位线索；接手时以函数名和当前实现核对，不机械覆盖。

## 修复清单与验收

### #1 · P1 · 插件列表分屏后跳回首页【已实操复现】

**复现：** 在 4176 的“研究信息闭环验证”项目进入 Goals 列表，点击“布局与分屏 → 向右分屏”。1280 × 800 下两边均显示项目首页日期与事项，左侧 Goals 仍高亮。两个 iframe 的 URL 都包含 `panePlugin=goals`，标题也为 Goals。

**代码链：**

- `apps/workbench/src/scripts/client/tab-workspace.ts:59–78`：嵌入式窗格 `restore()` 已正确恢复 `panePlugin`。
- `apps/workbench/src/scripts/client/initialization.ts:260–266`：恢复后，普通导航继续调用 `tabWorkspace.landAtProjectRoot()`，没有排除嵌入式窗格。
- `apps/workbench/src/tab-workspace-ops.ts:132–145`：没有 item 标签的插件视图被重置为 Home。
- `tab-workspace.ts:1308` 已导出 `isEmbedded()`，可复用。

**最小方向：** 限制顶层项目首页落点逻辑的适用范围，保留 iframe 的恢复结果。不要删除顶层正常打开项目时回首页的行为。

**验收：** Goals 列表分屏后两个窗格仍为 Goals；关闭一个窗格后保持当前页面；既有 Goal 详情分屏、普通打开项目、刷新和前进后退不回归。补查 Feed/Inbox 列表的同类路径——它们目前只是同根因推断，未在审计中实操确认。

### #2 · P1 · Inbox 事项缺少正常键盘入口【已实操复现】

**复现：** 进入 Inbox，未鼠标选中时全部 5 个事项按钮均为 `tabindex=-1`；正常 Tab 顺序无法进入事项。鼠标选中后只有当前项为 0，没有配套方向键遍历逻辑。

**位置：** `plugins/native/inbox/src/ui.ts:118` 初始全部 -1；`apps/workbench/src/scripts/client/navigation-inbox.ts:28–33` 收起时全部 -1；同文件 `48–53` 选择时仅当前项为 0。

**最小方向：** 沿用普通按钮导航，让所有可见事项正常进入 Tab 顺序；同步处理初始渲染、选择、收起和刷新。核对 role/aria 与实际交互匹配，不引入没有完整键盘支持的 listbox 模式。

**验收：** 首次进入、打开详情再返回、列表刷新后，Tab/Shift+Tab 都可遍历可见事项，Enter/Space 可打开；折叠组和隐藏项不获焦点；焦点指示可见，鼠标仍正常。不能据此宣称 VoiceOver 已通过。

### #3 · P1 · Functions 保存失败后覆盖用户输入【源码链确认，先用隔离数据复现】

**触发：** 编辑草稿，清空名称后停顿超过自动保存的 280ms；后端拒绝空名称。随后列表 GET 成功且当前记录仍存在时，旧记录被重新填回表单。409 冲突也经过同一错误分支。

**代码链：** `plugins/native/functions/src/client.ts:897–901` → `queueSave()`（778–781）→ `saveDraft()`（764–775）→ catch 中 `loadList({ remount: true })` → `loadList()` 第 745 行 `fillEditor(next)` → 第 664/665/670/676 行覆盖名称、key、说明与选项。名称约束在 `modules/functions/src/store.ts:781–784`。

**准确边界：** 全断网且列表 GET 也失败时不会重挂载；同一记录的试跑输入框有 `switching` 判断，不是所有字段都会丢失。

**最小方向：** 保存失败时保留本地输入与明确错误提示；将服务端刷新与编辑表单重置分开。保留并发版本校验，不要通过自动替换 revision 并悄悄覆盖他人版本来“解决”409。核对请求期间切换记录的影响，避免旧请求结果写入新选中的表单。

**验收：** 校验失败、409、网络失败时输入都保留；校验错误可纠正后继续保存；409 不静默覆盖服务端修改；切换记录不会被晚返回请求串写。用独立草稿测试，无需模型调用。

**测试注意：** `tests/list-silent-refresh.test.ts:62–67` 目前刻意断言异常分支有 `remount: true`。它保护的是旧实现，不是正确的输入保留行为。更新这个过时断言，并增加能观察“失败后字段仍是用户输入”的行为回归，不要只改正则让测试绿。

### #4 · P2 · Pages 全局搜索重复结果【已实操复现】

**复现：** 搜索“Jev 的三个待验证问题”，同一文档出现两次，占据 ⌘1、⌘2。只读数据库核对该标题只有一条记录。4176 实际发出的脚本也包含下列逻辑。

**位置：** `plugins/native/pages/src/client.ts:243–252` 外层 article 与内层 button 共用 `data-page-id`；`apps/workbench/src/plugin-workbench.ts:90` 的选择器是 `[data-page-id]`；`apps/workbench/src/scripts/client/global-search.ts:109–121` 未去重。

**最小方向：** 收窄 Pages 的搜索入口到实际打开文档的按钮；结果按插件和记录 ID 去重，去重在数量截断前完成。核对收藏入口的同 ID 重复，不要按标题去重，否则会吞掉不同文档。

**验收：** 同一 ID 仅出现一次；两个不同 ID 的同名文档都保留；收藏与普通目录同时出现时不重复；点击和快捷键均打开正确文档，空查询与结果数量上限正常。

### #5 · P2 · Inbox 长标题宽度异常【已实操复现】

**复现：** 1920 × 902 打开 Jev 事项，详情约 920px 宽，标题却约 262.4px，长中文标题折成四行，右侧大量空白。计算样式为 `max-width:26ch`；同一材料在 Feed 中没有这个窄栏问题。

**位置：** `packages/design-system/src/styles/directory-ledger.ts:437–441` 的通用 `.feed-detail-header h1` 限制；`apps/workbench/src/styles/detail-reading.ts:25–28` 没有重置该限制。Feed 已在 `apps/workbench/src/styles/immersive-directory.ts:193–195` 做局部重置。还需注意 `linear-density.ts` 的字号覆盖。

**最小方向：** 在 Inbox 详情范围内修正 header 与 h1 的宽度约束，保留现有阅读宽度；不要修改整个产品的标题字号或全局排版。

**验收：** 宽窗口标题利用合理的详情宽度；960px、分屏与窄窗口长标题仍可换行、不横向溢出；Feed 与其他详情不受影响。留同尺寸修复前后截图。

### #6 · P2 · Pages“更多”不能 Escape 关闭【已实操复现】

**复现：** 打开既有 Pages 文档 → 更多 → Escape；菜单仍显示，`aria-expanded` 仍为 true。

**位置：** `plugins/native/pages/src/client.ts:120–130` 已有 `closeMore()`；第 768–778 行的 Escape 分支只处理 move/create。

**最小方向：** 接入现有关闭函数，并将焦点还给触发按钮；留意对话框或其他浮层打开时的事件归属。

**验收：** Escape 隐藏菜单、`aria-expanded=false`、焦点返回“更多”；点击外部关闭和重新打开正常；移动/创建菜单原有 Escape 行为不退化。

### #7 · P2 · Functions 快捷键新建类型回退 Choice【源码链确认，先用隔离数据复现】

**触发：** 新建 Functions 对话框中将焦点放在 Noul 或 Score 按钮，再按 ⌘/Ctrl+Enter。

**代码链：** `plugins/native/functions/src/ui.ts:158` 将类型存于 submit 按钮 value；共享 `packages/design-system/src/styles/micro-interactions.ts:230–237` 调用无参 `form.requestSubmit()`；`plugins/native/functions/src/client.ts:823–828` 读取不到 `event.submitter.value` 就发送 `primitive: "choice"`。共享脚本确实被工作台加载。

**最小方向：** 修复快捷键提交时 submitter 的选择，复用当前有效、属于该表单且未禁用的提交按钮；避免改变其他新建对话框既有的合理默认提交行为。不要只给 Functions 另叠一套互相竞争的全局快捷键。

**验收：** Noul、Choice、Score 在鼠标、普通 Enter/Space、⌘/Ctrl+Enter 下创建类型一致；禁用按钮不能绕过；其他单按钮新建对话框快捷键正常。只建隔离草稿，不发布、不调用模型。

### #8 · P3 · 低高度窗口的分屏菜单越出顶部【已实操复现】

**复现：** 1024 × 340 打开“布局与分屏”，top=-20px，菜单高约 267px，标题顶部被裁切。

**位置：** `apps/workbench/src/scripts/client/tab-workspace.ts:954` 使用 `Math.min(rect.bottom + 6, innerHeight - 360)`，没有顶部下界，并用固定 360px 估高。

**最小方向：** 根据真实弹层尺寸和视口边界定位；极低窗口下约束最大高度并允许菜单内容滚动。不要仅修这一组尺寸而在多窗格菜单变长后再次裁切。

**验收：** 1024 × 340 和正常桌面高度下菜单完整可达；多个窗格时列表变长仍不越界；键盘可到达末项；窄屏禁用分屏的原行为保留。

## 已知候选与未完成覆盖：不当成第 9 个确定问题

- Functions 试跑的 click handler（`client.ts:989–1001`）没有显式忙碌状态或重复点击拦截。用不计费的慢响应 fixture 验证后再决定是否补局部防重；没有证据表明已发生重复收费。
- Forms 窄屏题目行保留五列；实验双列布局在 901–915px 附近可能太挤；长列表可能将插件工具条卷走。均待动态验证。920px 实验输入实际仍在视口内，不能报成已复现溢出。
- Coding、Goals Canvas/看板、Forms/Dataset/PPT 完整编辑与保存恢复、当前版本连续动效与深色模式未完成实操。它们是覆盖缺口，不应凭这份交接扩展为重做所有功能。
- 中文 IME 候选、VoiceOver 连续听感、设备刷新和主观手感仍为 `UNVERIFIED`，需要真人验收。

## 运行基线：先解决“验证的是哪一版”

以下均是 2026-09-22 审计时的观察，不应直接当成接手时仍有效的服务配置：

| 入口 | 当时来源 | 使用边界 |
| --- | --- | --- |
| `http://127.0.0.1:4176` | 主仓库 `dist/web/server.js`，PID 8289，home 为 `/Users/oreal/.codex/previews/molis-feed-loop` | 本次 6 项复现的主要预览 |
| `http://127.0.0.1:4173` | `/Users/oreal/.molis-work/releases/molis-work-0.2.0/dist/web/server.js` | 已安装旧版，不能代表当前源码 |
| 4198 | `/Users/oreal/.codex/worktrees/molis-coding-complete/molis-work` | 其他工作树；只核对过有 47 个 Coding session、2 个 Goal，未实操 |
| 4201 | `/Users/oreal/.codex/worktrees/f09f/molis-work` | 其他工作树；有 19 个 Goal，未用其替代当前版验收 |

主要项目 URL：`http://127.0.0.1:4176/projects/project-43a4e132-96b5-4938-b09f-883de66389c0`，名称“研究信息闭环验证”。审计时 Pages 数量和 Inbox 状态由其他工作发生变化，不能依赖固定计数。

4176 的 `dist/.molis-work-build.json` 生成于 17:43:11，服务 17:53:20 启动。manifest 的源码摘要 `ebf4f3ee…` 与核查时重算 `0bb3c3f8…` 不同；至少 19 处源码较新，部分 dist 文件又晚于进程启动。**即使刷新浏览器，也不能确认服务加载了所有最新代码。**

修复验证应使用与修复源码一致的完整构建和新的独立进程/端口；保留他人的运行服务与数据。如果另建 checkout，必须带入本次相关未提交基线，不能只取 HEAD 而丢失正在工作的实现。根目录 `pnpm build` 会清理并重建多处 dist，执行前避免与其他构建任务互相覆盖。

## 工程验证入口

项目使用 Node >=24、pnpm、TypeScript、node:test；根 package.json 的 `build` 会构建工作区、根入口及终端资源。许多测试通过包名导入 dist，不能修改 src 后直接运行旧 dist 并称修复通过。

可复用的现有测试：

- `tests/tab-workspace-ops.test.ts`：保留顶层落点与标签状态语义。
- `tests/workbench-tab-workspace.e2e.test.ts`：补插件列表分屏恢复及低高度弹层场景。
- `tests/inbox-native-plugin.test.ts`、`tests/immersive-directory.e2e.test.ts`：Inbox 行渲染与目录交互。
- `tests/pages-plugin.test.ts`、`tests/goals-tree.e2e.test.ts`：Pages 与搜索入口，按现有结构选择合适回归位置。
- `tests/list-silent-refresh.test.ts`、`tests/functions-plugin.test.ts`：Functions 刷新和提交；失败输入保留需要行为测试。
- `tests/fixtures/goal-browser.ts`：现有独立临时 home 与浏览器 fixture；找不到 Chrome 会 skip，skip 不能报告为产品通过。可配置 `MOLIS_WORK_TEST_CHROME`。

在已经构建一致的环境中，可按修改面选择运行（不是声称这些命令已执行）：

```sh
node --import tsx --test --test-concurrency=1 tests/tab-workspace-ops.test.ts tests/inbox-native-plugin.test.ts tests/pages-plugin.test.ts tests/functions-plugin.test.ts tests/list-silent-refresh.test.ts
node --import tsx --test --test-concurrency=1 tests/workbench-tab-workspace.e2e.test.ts tests/immersive-directory.e2e.test.ts
```

UI 工具遵循接手环境允许的浏览器方式。上轮浏览器连接后期反复超时，主审计页尺寸曾成功恢复，但当前版媒体模拟未成功；这些是工具故障，不是产品卡顿证据。不要重复无变化的失败调用，也不要把工具等待算入产品耗时。

## 截图与交付要求

完整审计报告：[视觉与交互审计](/Users/oreal/.codex/visualizations/2026/09/22/01a0c887-cc94-7cc1-8ecd-5cefb8bed388/视觉与交互审计.md)。该目录在本机仓库之外；如果接手环境拿不到附件，按上文步骤在隔离预览重新复现即可，不假称已经看过截图。

| 问题 | 原始截图 |
| --- | --- |
| 分屏跳首页 | [split-loses-goals.png](/Users/oreal/.codex/visualizations/2026/09/22/01a0c887-cc94-7cc1-8ecd-5cefb8bed388/split-loses-goals.png) |
| 搜索重复 | [search-duplicate-pages.png](/Users/oreal/.codex/visualizations/2026/09/22/01a0c887-cc94-7cc1-8ecd-5cefb8bed388/search-duplicate-pages.png) |
| Inbox 标题 | [inbox-title-desktop.png](/Users/oreal/.codex/visualizations/2026/09/22/01a0c887-cc94-7cc1-8ecd-5cefb8bed388/inbox-title-desktop.png) |
| Pages Escape | [pages-more-after-escape.png](/Users/oreal/.codex/visualizations/2026/09/22/01a0c887-cc94-7cc1-8ecd-5cefb8bed388/pages-more-after-escape.png) |
| 低高度菜单 | [layout-menu-1024x340.png](/Users/oreal/.codex/visualizations/2026/09/22/01a0c887-cc94-7cc1-8ecd-5cefb8bed388/layout-menu-1024x340.png) |

交付时按 #1–#8 逐项写明：改了什么、工程验证结果、在哪个构建/端口实操、仍有哪些未知。检查自己新增的 diff 是否混入他人改动；给视觉项保留相同窗口尺寸的对照截图。没有完成的项写明具体阻塞，不用测试数量代替端到端行为；等待真人验收不阻塞其余独立修复。
