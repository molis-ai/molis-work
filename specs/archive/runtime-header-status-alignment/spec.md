# Runtime 头部状态标签与对齐修复

> 归档（2026-10-01，合入后梳理）：判定为**已被取代**。Runtime 头部已随终端改入 work 插件重做。没有剩余事项。

## 背景与目标

切换到 Runtime 工作模式后，Goal 状态以裸文本出现在头部右侧的独立 Grid 列中，而“返回聚焦”按钮又通过绝对定位占据同一区域。结果是状态远离 Goal 标题和操作按钮、没有复用产品统一状态标签，也无法与右侧操作对齐。

本次达到 **Level 3：功能可用**。Runtime 头部继续显示当前 Goal、绑定关系、实时状态和返回入口，但重新组织为清晰的左右两组，并保证切换 Goal 后状态标签同步更新。

## 当前行为与证据

- `renderTuiPane` 使用 `<small data-tui-owner-status>` 输出状态，因此没有 `.goal-status` 的边框、底色、tone 和尺寸。
- `.tui-owner` 使用两列 Grid；状态进入右列，绑定信息横跨两列。
- `.tui-focus-return` 使用绝对定位，状态和按钮没有共同的布局轴。
- `pty-client.ts` 切换 Goal 时只更新状态文字，不更新对应的 `goal-status--*` tone class。

## 范围

### 包含

- 把 Runtime 头部拆成左侧 Goal 信息组和右侧状态/返回操作组。
- 复用统一 `goal-status` 标签样式。
- 切换 Goal 时同步状态文案、说明与 tone class。
- 保持桌面宽屏、较窄 Runtime 容器和移动端现有导航行为。
- 增加渲染与客户端状态同步回归测试。

### 不包含

- 不修改 Goal 状态推导、Runtime/终端行为或领取逻辑。
- 不重做 Focus 页、终端标签栏或移动端底部导航。
- 不改变“返回聚焦”的动作和文案。

## 方案与模块边界

- `src/web/render.ts`：输出语义化的 Runtime 头部分组；在 Goal 变更事件中携带 canonical status key；继续复用 `renderStatus`。
- `src/web/visual-foundation.ts`：右侧操作组使用正常 Flex 对齐，不再依赖绝对定位；窄容器允许信息组收缩且保持操作可见。
- `src/web/pty-client.ts`：Goal 切换时更新标签文字、说明与 tone class。
- `tests/web.test.ts`：覆盖状态标签结构、右侧操作组和状态 key 同步。

## 验收标准

1. Runtime 头部的状态使用 `.goal-status.goal-status--<status>`，不再是裸 `<small>`。
2. 状态标签与“返回聚焦”处于同一个右侧操作组，垂直居中；按钮不再绝对定位。
3. 左侧仍显示 Goal 标题与“绑定到 Goal”，长标题可截断且不会挤掉右侧操作。
4. 切换 Goal 时，状态文案、title 和 `goal-status--*` class 同步变化。
5. 760px 以下继续隐藏桌面“返回聚焦”按钮，由现有移动端导航负责切换；布局无水平溢出。
6. TypeScript 类型检查和 Web/desktop TUI 定向测试通过。

## 验证

1. `pnpm typecheck`
2. `node --import tsx --test tests/web.test.ts tests/desktop-tui.test.ts`
3. `node /Users/yijunwang/.agents/skills/impeccable/scripts/detect.mjs --json --scope layout src/web/render.ts src/web/visual-foundation.ts src/web/pty-client.ts`
4. 在开发页面验证桌面 Runtime 宽屏与窄屏头部的标签样式、基线和 Goal 切换。

## 假设

- 用户所说的“状态标签”指 Goal 工作台已有的 `goal-status` 视觉与语义，而不是新增另一套 Runtime 状态组件。
- Runtime 顶部右侧应作为一个操作组：先状态、后返回入口；Goal 身份与绑定信息留在左侧。
