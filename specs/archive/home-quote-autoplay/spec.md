# 首页引语自动播放

状态：完成。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是本次体验变更的唯一需求书。

## 背景目标

项目首页「工作间隙的一句话」现在靠「换一句」手动轮换。用户要去掉这个按钮，改成上面自动播放。

完成等级 3。

## 当前行为与问题证据

- `apps/workbench/src/project-home.ts` 在引语区渲染 `button.text-button.home-quote-next`（`data-home-quote-next`，文案「换一句」）。
- `apps/workbench/src/scripts/client/project-home.ts` 只在点击该按钮时 `rotate`；`setInterval(..., 30000)` 只同步日期/月历。
- `tests/project-home-start.e2e.test.ts` 断言 `quotes never rotate on a timer`，并用点击推进 13 条引语。
- 实屏：按钮在引语下方，打断阅读，也不符合「自己换」的预期。

## 范围与非目标

做：

- 去掉「换一句」按钮及其样式、Coss 选择器、英文词条。
- 首页可见且标签页可见时，约 8 秒自动切下一条；减动效直接切，其余保留 160ms 淡出。
- 鼠标悬停或焦点在引语区时暂停，方便点出处链接。不新增暂停按钮。
- 离开首页（含切到 Goals）不推进；回到首页后从当前句继续。
- 布局高度仍按最长句预留，换句不跳动。

不做：

- 不改日期、月历、打开 Goals、禁用 Agent 输入。
- 不发明暂停/步进控件（`data-quote-pause` / `data-quote-step` 仍不得出现）。
- 不改 13 条原文、出处和 Adeptify 迁移顺序。
- 不把自动播放扩到 Feed/Inbox 或其他表面。

## 使用场景

1. 停在首页：大约每 8 秒换一句，没有「换一句」按钮。
2. 鼠标停在引语或 Tab 到出处链接：先不换，移开后再按节奏换。
3. 切到 Goals 再回来：还是离开前那一句，不会在背后悄悄转完一轮。
4. 系统减动效：立刻切，没有淡出。

## 方案

工厂脚本对 `rotate` 加 8000ms `setInterval`。可见条件与月历同步一致：`!document.hidden`、`desktopSurface === "home"`、home 未 `hidden`。引语区 `:hover` 或内部焦点时跳过本次。`fading` 期间不叠切。无单独暂停 UI。

## 文件边界

- `apps/workbench/src/project-home.ts`
- `apps/workbench/src/scripts/client/project-home.ts`
- `apps/workbench/src/styles/project-home.ts`
- `apps/workbench/src/i18n/en.ts`
- `packages/design-system/src/styles/coss-controls.ts`
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`
- `tests/project-home-start.e2e.test.ts`

## 验收

1. DOM 中没有 `[data-home-quote-next]` / 「换一句」。**通过**（4180：`button:false`；截图无该按钮）。
2. 8000ms 定时器在首页可见时推进引语；减动效立即切，普通动效先 `is-changing` 再换字。**通过**（e2e 劫持 8000；4180 约 8s 从 index 5 切到 6）。
3. 引语区焦点/悬停时定时器不推进；切走 Goals 时定时器不推进。**通过**（e2e 焦点保持；4180 在 Goals 停留 8.5s 仍为 index 8，回首页仍为 8）。
4. 换句不改变 `.home-context` 高度（最长句预留仍在）。**通过**（e2e 中英轮换高度差 <1px）。
5. 窄屏 44px 只约束「打开 Goals」，不再给已删除的换句按钮留目标。**通过**（e2e 只断言 `.home-goals-entry`）。

## 验证命令

```
npx tsc -p packages/design-system/tsconfig.json
npx tsc -p apps/workbench/tsconfig.json
node --import tsx --test --test-concurrency=1 tests/project-home-start.e2e.test.ts
```

Chrome e2e 需要非沙箱。4180 预览用现有 `--home /Users/didi/.molis-work`。

## 假设

- 8 秒够读完最长英文句；不提供手动节奏设置。
- 暂停只靠悬停/焦点，用户不需要看见暂停控件。
