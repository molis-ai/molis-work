# 首页从上往下排，不要上下劈开

状态：完成。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是本次体验变更的唯一需求书。

## 背景目标

去掉「打开 Goals」之后，首页被 `.home-launch { margin: auto auto 0 }` 撕成两截：上面日期/引语/月历，中间一大块空白，底下孤零零的禁用输入框。对照 Linear Issues：内容从顶往下排，空就空在下面，不在中间造一个洞。

完成等级 3。只改构图，不把首页改成 Issue 列表。

## 当前行为与问题证据

- `.project-home-content` 是 `min-height: 100%` 的纵向 flex；`.home-launch` 用 `margin-top: auto` 把快捷方式和 composer 顶到视口底。
- 实屏：日期在上，输入框贴底，中间空白；composer 比日期栏更宽（740 vs 670），还有一圈投影，像没接上的聊天条。

## 范围与非目标

做：

- 日期、月历、引语、快捷方式、禁用输入框收成一列，顶对齐。
- launch 与 context 同宽（670px）。
- 禁用输入框不再用投影把自己做成页面主 CTA；高度收到工具条一档。
- 空出来的纸面留在这一列下面。

不做：

- 不删引语、月历、快捷方式、禁用 Agent 输入。
- 不把首页改成 Goal/Issue 列表。
- 不改自动播放、目录、插件条。

## 使用场景

1. 打开首页：先看到今天和那句话，快捷方式和输入框跟在后面，中间没有一条走廊。
2. 窗口很高：多出来的是下面的纸，不是上下两坨之间的洞。
3. 窄屏：同一列，只是月历落到日期下面。

## 方案

去掉 launch 的 `margin-top: auto`。context 与 launch 同宽。composer 去掉投影、高度约 52px，圆角仍用现有 23px token。

## 文件边界

- `apps/workbench/src/styles/project-home.ts`
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`
- `tests/project-home-start.e2e.test.ts` 截图随构图更新

## 验收

1. 首页内容顶对齐；日期块和输入框之间没有靠 flex 撑开的空白。**通过**（4180 gap 36px；composer 52px；e2e 断言 gap 28–48、高度 ≤56）。
2. 快捷方式仍在输入框上方；输入仍禁用。**通过**（截图与 e2e）。
3. 桌面与 390 窄屏都不是上下劈开。**通过**（e2e 含 390 截图；桌面 4180 空纸在下面）。

## 验证命令

```
npx tsc -p apps/workbench/tsconfig.json
node --import tsx --test --test-concurrency=1 tests/project-home-start.e2e.test.ts
```

4180 预览用现有 `--home /Users/didi/.molis-work`。
