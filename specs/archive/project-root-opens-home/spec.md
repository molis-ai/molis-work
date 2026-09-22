# 打开项目根地址落在首页，而不是上次的插件空舞台

## 背景目标

打开 `http://127.0.0.1:4180/projects/<id>/` 应看到项目首页。现在会恢复成上次的插件舞台（Functions），标签栏只剩「项目首页」，右侧编辑器是空的，看起来像页面卡住。

完成等级：功能可用。刷新（reload）仍保留当时的工作区。

## 当前行为与问题证据

- 该 URL 的 HTML/CSS/JS 本身很快（约 30ms / 10ms），不是请求挂起。
- 标签状态可写成：`tabs=[项目首页]`、`activeTabId=null`、`viewPlugin=functions`。这是 `openPlugin("functions")` 的合法状态：插件没有 mother 标签。
- 用这份状态打开项目根地址后，标题是 `Functions · Molis Work`，标签栏只有未选中的「项目首页」，Functions 列表在左、编辑区空白。
- 点「项目首页」会把 `activeTabId` 设回去，但 **不清理 `viewPlugin`**，下次再打开根地址又回到空的 Functions。
- 无 tab workspace 时，新鲜进入项目根会强制 `workSurface=home`；有 tab workspace 时没有对等逻辑。

## 范围与非目标

做：

- 新鲜进入（`navigate`，不是 reload / back_forward）项目根且没有 item 标签时，落到首页。
- 点「项目首页」清掉 `viewPlugin`。

不做：

- 改插件「无 mother 标签」的产品约定。
- 缩 CSS/JS、改 SQLite busy、改 Functions 编辑器本身。
- 刷新时丢掉正在看的插件舞台。

## 使用场景

1. 上次停在 Functions（未打开某一条），地址栏再打开项目根 → 项目首页，今日事件可见。
2. 刷新仍停在 Functions 的同一页。
3. 工作区里有 Goal/文档等 item 标签 → 新鲜进入也保留这些标签。
4. 点标签栏「项目首页」→ 首页，且之后再打开根地址仍是首页。

## 方案与关键决策

插件舞台存在 `viewPlugin`、不进标签栏，这是既有合同。卡住来自「项目根 URL 被当成工作区恢复」加上「点首页不清 `viewPlugin`」。

项目根的新鲜进入：没有 item 标签时 `landAtProjectRoot()`，各 pane 清 `viewPlugin` 并选中首页标签。有 item 标签则不动。reload / back_forward 不调用。

`activateInPane`：`kind === "home"` 时 `viewPlugin = null`。点击标签走同一条规则。

## 输入输出与依赖

- 输入：navigation type、pane 的 `viewPlugin` / `tabs`。
- 输出：localStorage `molis-work-tab-workspace:<projectId>`，以及当前 `data-work-surface`。
- 依赖：现有 `createTabWorkspaceOps`、`CLIENT_INITIALIZATION_SCRIPT`。

## 文件/模块边界

- `apps/workbench/src/tab-workspace-ops.ts`：`activate` / `landAtProjectRoot`。
- `apps/workbench/src/scripts/client/tab-workspace.ts`：点击激活与 `landAtProjectRoot` 出口。
- `apps/workbench/src/scripts/client/initialization.ts`：第二次 `restore()` 之后，新鲜进入项目根时调用。
- `tests/tab-workspace-ops.test.ts`：上述合同。

## 验收标准

- `openPlugin("functions")` 后 `landAtProjectRoot()` → `viewPlugin` 为空，当前标签是首页。
- 有 item 标签时 `landAtProjectRoot()` 不改当前 item。
- `openPlugin("functions")` 再 `activate` 首页标签 → `viewPlugin` 为空。
- 初始化脚本在非 reload 的项目根调用 `landAtProjectRoot`。
- 浏览器打开该项目根 URL：标题含「项目首页」，`data-desktop-surface=home`。

## 验证命令

```
pnpm exec tsx --test tests/tab-workspace-ops.test.ts
```

浏览器：打开 `http://127.0.0.1:4180/projects/project-c7a2c189-4fbd-400f-a60e-dcdf555938af/`（navigate，非刷新）。

## 假设与开放问题

假设用户说的「卡住」就是这份空白 Functions 舞台，而不是主线程死锁。若修完后仍有转圈，再查 SQLite / Keychain。
