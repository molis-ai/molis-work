# 插件默认页不打开标签

状态：可验收。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件修正 `specs/workbench-tab-workspace/spec.md` 与 `specs/archive/additive-tabs/spec.md` 里「点插件 = 开母标签」的合同。分栏几何、item 标签、首页标签仍以那两份为准。

## 背景目标

左边插件条是工作面切换，不是再开一张页。Goals 的画布、Sessions / Feed / Inbox / Shelf / Artifacts 的铺满列表都是插件默认页，不该在 titlebar 占一张「画布」「Shelf」之类的母标签。标签只留给真正打开的内容：首页，以及某条 Goal / Session / Feed / Inbox / Artifact。

## 当前行为与问题证据

点插件条会 `openPlugin` → `kind: "mother"`。Goals 母标签文案是「画布」，其它插件用插件名。4174 上点 Goals / Shelf / Artifacts 后 titlebar 出现这些默认页标签。

## 范围与非目标

做：

- 点插件条、+ 菜单里的打开插件、深链里的 `openPlugin`：切到该插件默认工作面，**不新增、不激活母标签**。已有首页和 item 标签留着，当前不高亮任何标签。
- 已持久化或条上还在的母标签，打开或恢复时丢掉；若当时正看着母页，改成插件默认面。
- 点某一条内容仍开 item 标签（规则仍见 additive-tabs）。
- 再点同一插件条：回到该插件默认面（铺满列表 / 画布），item 标签还在。
- 首页仍是标签。点首页插件或首页标签才回首页。
- 前进后退：插件默认面作为一条历史（不是标签 id）。
- 分栏时插件默认面可以单独占一栏（iframe），不必先有母标签。

不做：

- 不恢复斜体预览、不改手动分组、固定、市场/设置独占。
- 不改各插件列表/画布的领域行为。
- 不提交、不改用户真实库。

## 使用场景

1. 进项目只有「项目首页」。点 Goals：工作区是画布，条上仍只有首页，且首页不是当前。
2. 再点一个 Goal：多一张 Goal 标签并激活。再点 Goals：画布回来，Goal 标签还在、不再是当前。
3. 点 Shelf / Artifacts：工作区是铺满列表，条上不出现 Shelf / Artifacts 标签。
4. 点 Sessions 再点一条 Session：出现该 Session 标签。再点 Sessions：回到列表，Session 标签还在。
5. 刷新：母标签不会回来；上次若在插件默认面，仍是默认面。

## 方案与关键决策

- `pane.viewPlugin` 记住当前插件默认面；`activeTabId === null` 表示正在看默认面，不是某一张标签。
- `openPlugin(plugin)` 非 home：设 `viewPlugin`、清空当前标签、丢掉该栏母标签。home 仍开/激活首页标签。
- `openItem` 仍插入 item 标签，并记下 `viewPlugin`，关掉最后一张 item 后可以回到该插件默认面。
- 历史栈里插件默认面用 `plugin:{id}`，不是标签 id；前进后退按这个切面。

## 输入输出与依赖

输入：现有标签工作台状态、插件条点击、+ 菜单。输出：同一套 item 标签与分栏，默认面不再占标签。依赖：现有 work surface 挂载。

## 文件 / 模块边界

- `apps/workbench/src/tab-workspace-ops.ts`
- `apps/workbench/src/scripts/client/tab-workspace.ts`
- `specs/workbench-tab-workspace/spec.md`、`specs/archive/additive-tabs/spec.md` 里与母标签打开相关的句子
- 测试：`tests/tab-workspace-ops.test.ts`、`tests/workbench-tab-workspace.e2e.test.ts` 及点母标签返回画布的 e2e

## 验收标准

1. 点 Goals / Sessions / Feed / Inbox / Shelf / Artifacts：`document.body.dataset.desktopSurface` 是对应工作面；条上没有 `data-tab-kind=mother`；首页标签若还在则不是 `aria-current`。
2. 点一条 Goal / Session 后有 item 标签；再点该插件条，item 还在，当前不是这张 item，工作区是默认面。
3. 点首页标签回到首页；关光所有标签后首页会回来（没有任何插件默认面在看时）。
4. 刷新后母标签不会作为标签恢复。
5. 完成等级 3。不改用户真实库。

## 验证命令

```
node --import tsx --test --test-concurrency=1 \
  tests/tab-workspace-ops.test.ts \
  tests/workbench-tab-workspace.e2e.test.ts \
  tests/compact-icon-tabs.e2e.test.ts
```

浏览器：4174 进项目 → 点 Goals（条上无画布）→ 打开一个 Goal → 再点 Goals → 点 Shelf / Artifacts（条上无这两张）→ 回首页。

## 假设与开放问题

- 默认面没有选中标签时，titlebar 可以没有 `aria-current`；当前插件只由左边插件条表达。
- 分栏复制默认面时新栏也是默认面，不复制一张假母标签。
