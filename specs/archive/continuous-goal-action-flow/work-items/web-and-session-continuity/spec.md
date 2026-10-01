# Work Item：Web 短状态与 Session 连续性

## depends_on

`action-projection-and-migration`、`lifecycle-and-revisions`。

## 允许修改

`src/web/**`、`src/projects/**`、必要的 `src/sessions/**`、Web/Session/Momentum 测试；保留工作区既有 Runtime 头部 diff。

## 输出

六状态唯一 mapper、一个主 CTA 和一行说明、mutation 局部回执更新、表单 dirty guard/live region、唯一 workspace 自动恢复与 focus 排序。

## 验收与验证

- 所有入口只显示六个短状态或独立处置状态。
- mutation 不 reload，Decision 卡片即时消失，外部 poll 不覆盖表单。
- 桌面/移动、键盘、焦点和 live region 测试通过。
- `tests/web.test.ts tests/desktop-tui.test.ts tests/goal-momentum.test.ts` 通过。
