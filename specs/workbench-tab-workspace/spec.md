# 工作台：Chrome 分组标签 + VS Code 分栏

状态：开发中。完成等级 **4：内部完整**。不宣称可发布。不改用户真实库、不发布、不安装新 App。

**标签打开与分组：** 单击添加、不替代以 `specs/additive-tabs/spec.md` 为准；插件默认页不开标签以 `specs/plugin-default-no-tab/spec.md` 为准；用户手动分组以 `specs/chrome-tabs-preview-groups/spec.md` 为准。本文件仍管分栏、首页默认、市场/设置独占。

本文件是这次主屏分栏行为的需求书。它取代：

- `specs/directory-plugin-switcher/spec.md` 里「点插件 = 把右边整页换成该插件」；
- `specs/workbench-frame-container/spec.md` 里「Goal 画布钉住为默认主表面、点插件离开 Frame」。

左边插件分段目录以 `specs/directory-plugin-sections/spec.md` 为准。Goal 关系画布、原 `.goal-canvas-open` 工作框、各插件列表与领域事实不另做一套。

## 背景目标

进项目后默认不该是 Goal 画布。主屏要像 Chrome 管标签、像 VS Code 管分栏：插件条切工作面，每个打开的 item 一张标签；用户可以把某一张拖到旁边同时看，也可以留下空栏。

## 当前行为与问题

- 打开项目按合同应是诗意首页，但主屏组织仍是「一个插件独占」或「画布钉在 Container 第一条」。
- 点插件会换掉整块主区，不能把 Goals 画布和某条 Session 并排。
- Frame 容器把画布当成永远钉住的桌面；首页不是与画布平级的工作。
- 旧 Project Tabs 只记得最多 8 个 Goal 标签，不是插件组，也不能分栏。

## 范围与非目标

### 做

- 进项目：右边默认项目首页。
- 点插件条只切该插件默认工作面，不新增母标签；标签只留给首页和已打开的 item。
- 点任何一个 item：在当前焦点栏开一张标签；一个 item 在同一栏不复制。
- 同一 item 可以同时出现在多栏（两份视图，同一身份）。
- 用户自由拆栏、关栏、留空栏。拖到主屏左 / 右 / 上 / 下边缘拆出新栏。
- 首页可关；整个主屏一张标签都不剩时，自动把首页开回来。
- 刷新 / 换项目：按项目记住组、打开的 item、栏的划分、每栏当前标签。
- 窄屏：不分栏，仍是一组标签；拖边缘不拆栏。
- 插件市场、系统设置、项目设置、来源配置仍独占主屏；返回后标签和分栏都在。

### 不做

- 新开系统窗口。
- 分栏布局同步到其他设备。
- 用户自选插件组颜色。
- 改 MCP / Goal 事件协议、Runtime 所有权、各插件列表的领域行为。
- 把 Frame 做成左目录插件或市场可卸载项。
- 发布或改用户真实库做演示。

## 使用场景

1. 打开项目：左边首页为当前，下面空着；右边一条标签，是首页。
2. 点 Goals：工作区是画布，条上不出现「画布」标签；首页若没关就还在条上，且不是当前。
3. 点某个 Goal：多一张该 Goal 的标签，打开现有工作面（终端、信息、时间线）。再点 Goals 插件回到画布，Goal 标签还在。
4. 点 Sessions 再点某条 Session：Sessions 组用自己的颜色，条上可以同时有 Goals 组和 Sessions 组。
5. 把某张 Goal 标签拖到右侧边缘：右边长出一栏，两边同时看。原栏可以继续留着同一 Goal 的另一张，也可以只把这张挪过去——拆栏默认在新栏再开一张（VS Code split），拖到已有栏是挪过去，除非按住复制修饰键再开一张。
6. 某栏里把标签全关：栏还在，空着，可以从左边打开或把标签拖进来；用户也可以把这栏关掉。
7. 关掉 item 标签回到该插件默认面；默认面本身没有可关的标签。
8. 若条上还有首页，关光 item 后首页仍在、当前是插件默认面。没有任何插件默认面、标签也关光时，首页自动回来。
9. 刷新：回到同一项目时，组、item、分栏和焦点还在。Goal 深链：打开 Goals 组并激活该 Goal 标签（落在焦点栏；若该 Goal 已在某栏打开，优先亮那一栏）。
10. 打开插件市场：主屏换成市场；关掉后刚才的标签和分栏回来。

## 方案与关键决策

| 对象 | 含义 |
| --- | --- |
| 组 | 一个已打开的插件。颜色固定。组名是色条加彩色字，点一下折叠组里的页标签；它不是一张页。 |
| 插件默认面 | 点左边插件切到的工作面，**不占标签**。Goals 是画布；其它插件是铺满列表。画布与看板用页面右上角开关切换，不进标签条。见 `specs/plugin-default-no-tab/spec.md`。 |
| 工作区标签 | 单栏放在 titlebar。分栏后每栏自己一条标签，不再把焦点栏抬到整条 titlebar。 |
| 标题栏 Container Tab | 只在 Goal Frame 打开时出现（画布 / 看板 / 已开 Frame）。此时工作区标签让位。 |
| Item 标签 | 一条插件内容。Goal / Session / Feed / Inbox / Artifact 各用现有主表面。 |
| 栏 | VS Code 编辑器组。可空；可关；同一 item 可在多栏各有一张。 |
| 首页 | 独立标签，不是插件组。进项目默认；可关；关光弹回。 |

点左边列表的 item：焦点栏没有这张身份就新开；已有同身份则激活，不叠第二张。分屏后另一栏可以再开一份。

组颜色用 Calm Desktop token，按插件定死（Goals / Sessions / Inbox / Feed / Artifacts），不进设置。

现有 Frame 画布 Tab 不再钉死为进项目默认。Goal 卡片上的原展开（工作框）仍可用；主屏组织改成插件默认面 + item 标签 + 分栏。

## 输入输出与依赖

- 输入：当前项目已启用插件、各插件 item、现有画布与工作面、本地 UI 状态。
- 输出：按项目持久化的标签工作台状态（组、item、栏划分、每栏活动标签）。
- 依赖：现有 directory 目的地、Goals 画布、各插件 work surface、`documents-state` 一类按项目本地状态。

## 文件 / 模块边界

允许改：工作台壳层标签与分栏（`apps/workbench` 的 immersive-shell、frame-container / 其继任者、immersive-navigation、events-secondary、documents-state、相关样式）、`DESIGN.md` 的 Project Tabs / 主屏规则、本 spec 指向的测试。

不改：Goal / Session / Feed 领域写入、MCP、onboarding 业务、项目选择页到达面。

## 验收

1. 打开项目只见首页标签，不是画布。
2. 点插件打开该插件主表面，不新增母标签。不一样的 item 才新增、一样的只激活、分屏允许重复，见 `specs/additive-tabs/spec.md` 与 `specs/plugin-default-no-tab/spec.md`。单栏时工作区标签在 titlebar；分栏后每栏自己一条。画布/看板在 Goals 默认面右上角切换。标题栏不叠 Goal 画布/看板。
3. 条上可同时停着首页和已打开的 item；用户组由手动创建，切 Tab 不拆掉其他标签。
4. 可拆栏、可留空栏、可关栏；同一 Goal 能同时在两栏打开。关到只剩一栏时铺满主区，不留下半屏空白。
5. 关 item 不拆其它标签；关光最后一张且没有插件默认面时首页自动出现。
6. 刷新后按项目恢复用户组 / 预览与普通标签 / item / 分栏 / 焦点。市场和设置独占后能回到原布局。
7. 390 不分栏；Light / Dark 用户组颜色可读。`prefers-reduced-motion` 下无位移花活。

## 验证

```bash
pnpm exec tsx --test --test-concurrency=1 \
  tests/tab-workspace-ops.test.ts \
  tests/workbench-tab-workspace.e2e.test.ts \
  tests/workbench-frame-container.e2e.test.ts \
  tests/chrome-inner-scroll.test.ts \
  tests/desktop-tui.test.ts \
  tests/visual-foundation.test.ts
```

浏览器：进项目 → 开 Goals 画布 → 打开一个 Goal → 再开一条 Session → 拖出分栏 → 留空栏 → 关到弹回首页 → 刷新恢复。窄屏只验标签、不验分栏。

## 假设与开放问题

- 拆栏数量实现按 VS Code 常见编辑器组，最多三栏；若要无限拆，开发前改这一条。
- 拖到已有栏默认是挪动；从边缘拆栏默认在新栏再开一张。复制修饰键跟系统常见习惯（VS Code 为按住 Alt 拖）。
- 空栏的空态只提示从左边打开或拖入标签，不编造内容。
- 原 Frame Block 画布不是这次的主路径；不在本次验收里复活「往 Frame 里拖 Block」。
