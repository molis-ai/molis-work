# Light Goal Tab 可读性修复

> 归档（2026-10-01，合入后梳理）：判定为**已被取代**。src/web 时代的 Light 标签样式，已由后续改版取代。没有剩余事项。

## 背景与目标

Light 模式下打开多个 Goal 后，顶部 Goal Tab 被横向 flex 布局持续压缩，标题列最终缩到不可见，只剩状态圆点和当前 Tab 的底部选中线。用户无法分辨已打开的 Goal，也无法可靠选择目标。

本修复达到完成等级 3（功能可用）：保留现有 Light/Dark 视觉和最多八个 Tab 的行为，让每个 Goal Tab 在多 Tab 场景仍保有可读宽度，容器空间不足时使用现有横向滚动能力。

## 范围与非目标

- 为桌面 Goal Tab 设置稳定的最小可读宽度，并阻止 flex shrink 把标题压到零。
- 保留标题省略、状态圆点、关闭按钮、选中线、键盘语义和横向滚动。
- 不改变 Goal 状态颜色、Tab 上限、持久化、打开/关闭逻辑或窄屏 Companion。
- 不重做工作台顶栏，也不修改 Goal 标题内容。

## 方案与边界

- `src/web/visual-foundation.ts`：在现有 `.desktop-work-tab` 规则中增加固定 flex basis；宽度随桌面视口在 136–190px 间变化，Tab 多时由 `.desktop-work-tabs` 横向滚动承载。
- `tests/visual-foundation.test.ts`：锁定 Tab 不再收缩以及 Tab 容器仍可横向滚动的样式契约。

## 验收标准

- Light 模式打开多个 Goal 时，每个 Tab 至少显示状态圆点和一段可辨认的标题，不再退化为纯圆点。
- 超过顶栏可用宽度时横向滚动，不压缩标题列。
- Light 继续使用扁平选中线；Dark 继续使用原有 paper surface。
- 关闭、选择、键盘语义、最多八个 Tab 和窄屏行为不变。

## 验证

```bash
pnpm typecheck
node --import tsx --test tests/visual-foundation.test.ts tests/web.test.ts
git diff --check
```

补充桌面 Light/Dark 多 Tab 的渲染检查；若本机运行数据无法复现多 Tab，则以源代码契约测试和现有用户截图作为本次边界证据，并明确视觉验证缺口。
