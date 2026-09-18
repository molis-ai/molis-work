# 新建 Session 的 Goal / Runtime 下拉

状态：执行完成。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是本次体验变更的唯一需求书。

## 背景目标

新建 Session 弹层里，「当前 Goal」和「Runtime」用的是原生 `<select class="mw-select">`。关闭态可以画成纸面控件，**打开后的选项列表仍是操作系统菜单**，和同一弹层里已经自定义过的「工作目录」不一致。

目标：这两个字段打开后也是工作台自己的选项列表。完成等级 3。

## 当前行为与问题证据

- `plugins/native/work/src/ui/render.ts` 的 `data-session-add-goal` / `data-session-add-runtime` 是可见 `<select>`。
- `appearance: none` 只作用于关闭态；macOS / Chrome 的打开列表无法按产品皮肤绘制。
- 同弹层 `data-session-workspace-menu` 已经是 `<details>` + 纸面 listbox。

## 范围与非目标

做：

- 新建 Session 弹层的 Runtime、当前 Goal：可见控件是纸面触发器 + 选项列表。
- 隐藏的 `[data-session-add-runtime]` / `[data-session-add-goal]` 仍是程序与 e2e 的真相源；读写 `.value`、监听 `change`、提交 `runtime_id` / `current_goal_id` 不变。
- 默认仍是第一个 Runtime、暂不关联 Goal。

不做：

- 不改关系弹层、Handoff、Goals 新建、Frame 筛选等其它原生 select。
- 不改创建 / 关联 Session 的 API 与确认提交语义。
- 不改用户真实库。

## 使用场景

1. 点「新建 Session」，「当前 Goal」关闭态显示「暂不关联 Goal」，点开是纸面列表，不是系统菜单。
2. 选一个 Goal：触发器文案变成该 Goal 标题；提交仍带这个 `current_goal_id`。
3. 程序或 e2e 给隐藏 select 赋值并派发 `change`：可见文案同步。

## 方案与关键决策

原生 select 打开列表无法换肤，所以不能只靠 `mw-select`。沿用本弹层工作目录的 `<details>` 列表，不新做 popover 系统。

选项写进隐藏 select 的 `<option>`，可见按钮与之对应。点选项：写入 `.value`、派发 `change`、收起列表。`form.reset()` 后同步触发器。

## 文件边界

- `plugins/native/work/src/ui/render.ts`
- `plugins/native/work/src/ui/session-add-client.ts`
- `plugins/native/work/src/ui/styles.ts`
- 必要时 `apps/workbench/src/styles/surface-language.ts`（弹层里字号与并排网格）
- 测试：`tests/work-session-ui.test.ts`、`tests/session-web.test.ts`

## 验收标准

1. 新建 Session 里点「当前 Goal」或「Runtime」，打开的是工作台纸面列表，不是系统默认 select 菜单。
2. `[data-session-add-goal]`、`[data-session-add-runtime]` 仍存在且 `hidden`；空 Goal 选项文案仍是「暂不关联 Goal」。
3. 选择 Goal / Runtime、确认、提交的请求字段与现网一致。
4. 已有 association e2e 仍可通过给隐藏 select 赋值驱动表单。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-work build
node --import tsx --test --test-concurrency=1 tests/work-session-ui.test.ts tests/session-web.test.ts
```

真实数据验证走本机 `http://127.0.0.1:4174`，home 为 `~/.molis-work`。

## 假设与开放问题

- 关系弹层、Handoff 的 select 仍是系统菜单；本次不处理，除非同一弹层路径再次出现。
