# 去掉首页「打开 Goals」

状态：完成。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是本次体验变更的唯一需求书。

## 背景目标

项目首页 launch 区有一颗「打开 Goals」按钮。用户要去掉它，并清掉只为它服务的代码。进 Goals 继续走左侧插件/目录，不在首页再放一颗入口。

完成等级 3。

## 当前行为与问题证据

- `apps/workbench/src/project-home.ts` 在 `.home-launch` 里渲染 `button.button.home-goals-entry`（`data-work-surface-open="goal"`，文案「打开 Goals」）。
- 实屏：按钮在禁用 Agent 输入框上方，宽约 134px、高 32px。
- 左侧插件条和目录已经能打开 Goals。

## 范围与非目标

做：

- 去掉该按钮及其 CSS、Coss 选择器、英文词条。
- 首页不再出现 `.home-goals-entry` / 「打开 Goals」。
- e2e 改走插件条进 Goals；不再断言这颗按钮的 44px。
- 更新 `DESIGN.md` 与 surface 对首页入口的描述。

不做：

- 不改日期、月历、引语自动播放、禁用 Agent 输入。
- 不删 `data-work-surface-open` 这套通用导航（目录、插件条、Session 里的「去 Goals」仍在）。
- 不改 Goals 插件本身。
- 不重做首页构图，不补新的首页入口。

## 使用场景

1. 停在首页：只有日期、月历、引语和禁用的 Agent 输入，没有「打开 Goals」。
2. 要进 Goals：点左侧插件条或目录里的 Goals。

## 方案

从 `renderProjectHome` 删掉该按钮。`.home-launch` 只保留 composer 和「Agent 尚未开放」。相关样式和 i18n 一并删除。

## 文件边界

- `apps/workbench/src/project-home.ts`
- `apps/workbench/src/styles/project-home.ts`
- `apps/workbench/src/i18n/en.ts`
- `packages/design-system/src/styles/coss-controls.ts`
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`
- `tests/project-home-start.e2e.test.ts`

## 验收

1. 首页 DOM 没有 `.home-goals-entry`，看不到「打开 Goals」。**通过**（4180：`entry:false`；截图无该按钮；无障碍树无「打开 Goals」）。
2. Agent 输入仍禁用；引语自动播放仍在。**通过**（4180 `agentDisabled:true`；e2e 主用例通过）。
3. 插件条 Goals 仍能打开 Goals 工作面。**通过**（e2e 点 `[data-plugin-id=goals]`；4180 点左侧 Goals 标题变为 Goals）。
4. 源码和 Coss 里没有 `.home-goals-entry` / `L("打开 Goals")`。**通过**（工作区检索仅剩测试的否定断言和本 spec）。

## 验证命令

```
npx tsc -p packages/design-system/tsconfig.json
npx tsc -p apps/workbench/tsconfig.json
node --import tsx --test --test-concurrency=1 tests/project-home-start.e2e.test.ts
```

Chrome e2e 需要非沙箱。4180 预览用现有 `--home /Users/didi/.molis-work`。
