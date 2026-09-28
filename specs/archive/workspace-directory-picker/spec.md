# 工作目录用系统窗口选择

状态：执行完成。完成等级 **3：功能可用**。

本文件是这次体验变更的唯一需求书。

## 背景目标

Workspace 里「关联这台电脑上的目录」现在是一个文本框，占位符是「这台电脑上的绝对路径」。人必须自己粘贴路径。这里要改成点一下就弹出这台电脑的目录选择窗口，选中的绝对路径再用于关联。

## 当前行为与问题证据

- `plugins/native/workspace/src/ui.ts` 的 `data-workspace-add` 表单用 `<input name="path" placeholder="这台电脑上的绝对路径">`。
- `apps/workbench/src/scripts/client/coding-companions.ts` 把 `input.value` 作为 `workspace_path` 提交到 `POST /api/workspaces`。
- 关联接口要求本机绝对路径。浏览器的 `<input type="file">` 和 `showDirectoryPicker()` 都拿不到这条路径。

## 范围与非目标

做：

- 该表单不再提供可编辑路径框。点「选择目录」后，由本机宿主打开系统目录选择窗口。
- 选中后在按钮下方显示路径；取消则不改已选路径。
- 仍须勾选「确认将此目录关联到当前项目」再提交。提交载荷仍是 `workspace_path` + `user_confirmed: true`。
- 已有 e2e 仍可给隐藏的 `name="path"` 赋值后提交。

不做：

- 不改 Coding「或者关联新目录」、新建 Session「选择其他目录」、路径修复接口的手动输入。
- 不改关联、选择、解除的项目成员语义。
- 不在浏览器里用文件上传代替绝对路径。

## 使用场景

1. 打开 Workspace，还没有目录。点「选择目录」，系统窗口出现。选一个文件夹后，页面显示该绝对路径。勾选确认，点「关联目录」，目录进入列表。
2. 在系统窗口点取消：不关联，已有选择保留；还没选过时说明未选择。
3. 窗口已经开着又点一次：不另开第二个窗口，说明窗口已经打开。
4. 没选目录就提交：不发关联请求，提示先选择目录。

## 方案与关键决策

宿主 `POST /api/workspaces/pick` 在跑着 Web 的这台电脑上打开系统目录窗口（macOS 用 `osascript` 的 `choose folder`），把选中的绝对路径返回页面。页面只展示，不让手改。这样浏览器安全限制不会把路径丢掉。

同一时刻只开一个窗口。返回值必须是现存目录的绝对路径；取消、超时、命令不存在都不是成功选择。

## 输入输出与依赖

- 输入：当前项目页面上的点击。无路径参数。
- 输出：`{ path }`、`{ cancelled: true }`，或明确错误句。
- 依赖：本机图形会话能弹出系统窗口。无图形会话时说明打不开，不退回文本框。

## 文件与模块边界

- `plugins/native/workspace/src/ui.ts`：表单。
- `apps/workbench/src/scripts/client/coding-companions.ts`：点击、展示、提交前校验。
- `apps/workbench/src/styles/coding-companions.ts`：选中路径的样式。
- `plugins/native/work/src/http/workspaces.ts`：`/api/workspaces/pick`。
- `apps/local-host/src/directory-picker.ts`：系统窗口。
- `apps/local-host/src/web-work-session.ts`：把窗口接到 HTTP。

## 验收标准

1. 表单上没有「这台电脑上的绝对路径」输入框，有「选择目录」。
2. 选择成功后页面显示绝对路径，提交仍走原来的关联接口。
3. 取消、未选择提交、窗口已打开、选中的不是目录，都有明确结果，且不会写入项目。
4. 命令以参数数组执行，不经过 shell。

## 验证命令

- `node scripts/run-tests.mjs tests/workspace-directory-picker.test.ts`
- 浏览器打开 Workspace：确认按钮与路径展示；用页面内替换的选择结果走完展示，不在验收时留下系统窗口。

## 假设与开放问题

- 假设一骏要的是目录窗口，不是选单个文件。字段原意是工作目录。
- Coding 会话里的另一处绝对路径输入本次不动。
