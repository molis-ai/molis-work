# 快捷方式回到项目首页

状态：完成。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次位置变更的唯一需求书。它覆盖：

- `specs/directory-shortcuts/spec.md` 里「快捷方式在左侧目录」；
- `specs/directory-plugin-sections/spec.md` 里「快捷方式在分段下面一起滚、不收进插件」。

存储、校验、外链、弹窗语义仍以 `specs/poetic-project-home/spec.md` 为准。目录分段语法仍以 `specs/directory-plugin-sections/spec.md` 为准，只不再挂快捷方式。

## 背景与问题

目录改成插件分段之后，快捷方式仍是壳层专属块：市场下面一块小标题列表。它看起来像插件内容，又不是插件，在 Goals 等页也能改外链，和首页启动区脱节。用户要求从目录移走，放到项目首页那个页面里。

## 当前行为与问题证据

- `renderDirectoryShortcuts` 画在 `.directory-content-scroll` 里、账号页脚之上。
- `.immersive-home` 没有添加入口；`tests/project-home-start.e2e.test.ts` 断言首页没有 `[data-home-shortcut-add]`。
- 客户端把 `project-home-shortcuts` 绑在 `[data-directory-shortcuts]`。
- 诗意首页原构图是：日期/引语/月历在上，圆形快捷方式紧贴禁用输入框。

## 范围与非目标

### 范围

- 左侧目录不再渲染快捷方式分区、小标题或添加入口。
- 项目首页启动区恢复圆形快捷方式：空态只有「添加快捷方式」，已有项是图标+名称，可编辑/移除；紧挨日期/月历下方，再下面是禁用输入框。不把启动区钉在页面底部。
- 弹窗、`molis-work:home-shortcuts:{project_id}`、URL 校验、按项目隔离、Web 新页 / 桌面系统浏览器打开，全部保持原契约。
- 弹窗继续用现有 Coss 控件语言（不是迁目录前那套钴蓝主按钮）。
- 目录中区只滚插件分段；项目头和账号底栏仍不滚。

### 非目标

- 不做成 native 插件、不进市场、不在右边开母标签。
- 不改 Goal 真相源、不跨设备同步。
- 不改日期、月历、引语自动播放、禁用 Agent 输入。
- 不重做首页诗意构图的其他部分。

## 使用场景

1. 打开项目：右边首页在输入框上方能看到添加快捷方式；左边目录只有首页、已启用插件、市场和账号，没有「快捷方式」分区。
2. 点添加、填名称和 https 地址、保存：首页出现该项，刷新后仍在，仍按当前项目隔离。
3. 切到 Goals：目录里看不到快捷方式；回到首页仍能打开、编辑、移除。
4. 窄屏首页同样能添加；不必先拉开目录抽屉。

## 方案与关键决策

1. **回家，不进插件。** 快捷方式是首页启动区的一部分，不是目录段，也不是 `BUILTIN_PROJECT_PLUGIN_IDS`。
2. **恢复圆形井，不搬目录行。** 88px 列、43px 圆图标，紧贴输入框；不用目录行高/链接语法。
3. **只有首页能改。** 不再在 Goals 等页露出列表。这是位置变更的可接受损失。
4. **数据不动。** 已有 localStorage 项原样出现在首页。

## 输入输出与依赖

- 输入：当前项目 `project_id`、已有 `molis-work:home-shortcuts:{project_id}`。
- 输出：首页快捷方式 DOM/CSS、目录不再包含该分区。
- 依赖：现有 `project-home-shortcuts` 客户端、native 外链通道、Coss 弹窗样式。

## 文件 / 模块边界

- `apps/workbench/src/project-home.ts`、`styles/project-home.ts`
- `apps/workbench/src/scripts/client/project-home.ts`
- `apps/workbench/src/immersive-shell.ts`、`goals-page-renderer.ts`
- `apps/workbench/src/styles/immersive-navigation.ts`、`linear-density.ts`
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`
- `specs/directory-plugin-sections/spec.md`、`specs/directory-shortcuts/spec.md`
- 测试：`tests/project-home-start.e2e.test.ts`、`tests/desktop-tui.test.ts`、`tests/immersive-directory.e2e.test.ts`、`tests/chrome-inner-scroll.test.ts`

## 验收标准

1. `.immersive-home` 有 `.home-shortcuts`、`[data-home-shortcut-add]`；启动区在日期/月历下面，顺序为快捷方式 → 禁用输入。
2. 目录没有 `[data-directory-shortcuts]`；插件分段之后直接是账号页脚。
3. `[data-home-shortcut-add]` / `[data-home-shortcut-link]` / `[data-home-shortcut-edit]` / `[data-home-shortcut-dialog]` 仍驱动添加/编辑/移除/校验。
4. 存储键仍是 `molis-work:home-shortcuts:{project_id}`；取消不写；无效 URL 留在弹窗。
5. 切到 Goals 后目录看不到快捷方式；浅色/深色/窄屏首页可读可点。
6. 定向测试通过。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
pnpm --filter @molis-ai/molis-work-app-workbench typecheck
node --import tsx --test --test-concurrency=1 \
  tests/desktop-tui.test.ts \
  tests/chrome-inner-scroll.test.ts \
  tests/project-home-start.e2e.test.ts \
  tests/immersive-directory.e2e.test.ts
```

Chrome e2e 需要非沙箱。隔离试用必须 `--home` 临时目录，禁止 `pnpm web` 打默认 home。不为演示写入用户项目快捷方式。

## 假设与开放问题

- 假设用户要的是诗意首页原来那组圆形入口，不是目录行搬到首页。
- 弹窗视觉跟当前工作台 Coss 控件，不回退迁目录前的钴蓝主按钮。

## 验证结果

| 项 | 结果 |
| --- | --- |
| 1 首页有圆形添加，顺序为快捷方式 → 禁用输入 | 通过。e2e 与 4180 演示项目：`.home-shortcuts` / `[data-home-shortcut-add]` 在 `.home-launch` 里，输入框在其下。 |
| 2 目录没有快捷方式分区 | 通过。DOM 无 `[data-directory-shortcuts]`；Goals 页目录只有首页/插件/市场/账号。 |
| 3 添加/编辑/移除/校验仍由原 data 属性驱动 | 通过。`tests/project-home-start.e2e.test.ts` 持久化、无效 URL、失败重试、移除。4180 只打开弹窗后取消。 |
| 4 存储键与取消不写 | 通过。键仍是 `molis-work:home-shortcuts:{project_id}`；4180 取消后 `localStorage` 仍为 null。 |
| 5 切 Goals 后目录无快捷方式；浅/深/窄屏可读 | 通过。home-start 与 footer 截图；添加文案单行。 |
| 6 定向测试 | 通过。workbench build/typecheck；`desktop-tui`（含共享工作台项）、`chrome-inner-scroll`、`project-home-start` 3/3、`immersive-directory`。Grok CLI 仍跳过。 |

4180 未写入用户或演示项目快捷方式。
