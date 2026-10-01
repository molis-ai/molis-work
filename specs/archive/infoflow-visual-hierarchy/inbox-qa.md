# Inbox 工作台视觉验收

## 验收环境

- 项目：`project-aeb51deb-e335-403b-80cc-387e20e0e000`
- 独立验证服务：`http://127.0.0.1:4184`
- 数据：本地真实 Inbox，共 96 个待处理或历史引用；覆盖 Goal 决定与来源规则命中。

## 检查结果

### `visual-inbox-hierarchy`

- 真实 Inbox 引用详情使用与 Feed、Goal 一致的单一 paper 工作面，并以 `feed-detail--attention` 明确行动语义。
- “下一步”在处理上下文中视觉前置，值使用 14px/680 字重；“为什么进入 Inbox”、关联对象和当前状态随后以文档行组织。
- Inbox 标识只使用克制的 amber 语义色；正文、标签和资料仍在同一工作面内连续展开，没有新增嵌套卡片。
- 桌面截图：`.impeccable/review/infoflow-inbox-visual-desktop.png`

### `visual-inbox-responsive-states`

- 在窄屏覆盖下，浏览器有效视口为 576×656（低于 760px 断点）。
- `body.clientWidth === body.scrollWidth === 576`，无页面级水平溢出。
- 详情容器在窄屏为 12px 圆角、`22px 16px 28px` 内边距。
- 查看原消息、升格为 Goal、完成、忽略四个现有操作的最小高度均为 44px。
- 已实际完成“Inbox 列表 → 选择另一条引用 → 详情”路径；96 个真实引用仍可浏览。
- 窄屏截图：`.impeccable/review/infoflow-inbox-visual-narrow.png`

### `visual-inbox-behavior-regression`

- `npm run build`：通过。
- `node --import tsx --test --test-name-pattern="Web view derives understandable Goal states" tests/web.test.ts`：通过，1/1。
- `node --import tsx --test tests/feed.test.ts`：通过，6/6。
- 真实页面仍展示查看原消息、升格为 Goal、完成和忽略操作；本次没有修改对应数据属性、revision 或事件路径。
- 浏览器控制台 error/warn：0。

## 结论

Inbox 工作台的待处理行动层级、响应式路径和现有业务操作满足本子 Goal 的三个验收条件，可以进入 Runtime 自检与 Molis Work 收口。
