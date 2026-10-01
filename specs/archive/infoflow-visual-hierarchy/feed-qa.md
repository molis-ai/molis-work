# Feed 工作台视觉验收

## 验收环境

- 项目：`project-aeb51deb-e335-403b-80cc-387e20e0e000`
- 独立验证服务：`http://127.0.0.1:4184`
- 数据：本地真实 Gmail、GitHub 与 RSS Feed，共 299 个 Item。

## 检查结果

### `visual-feed-hierarchy`

- 详情使用单一 paper 阅读面：14px 圆角、soft shadow、`30px 34px 38px` 桌面内边距。
- 标题和摘要保持消息主层级；来源、作者、时间、已读和去向退居紧凑元信息。
- 当前去向从彩色卡片改为文档分隔行，只在状态文字上使用语义颜色。
- 正文、标签和随 Item 保存的资料在同一阅读面内以分隔线组织，没有新增嵌套卡片。
- 桌面截图：`.impeccable/review/infoflow-feed-visual-desktop.png`

### `visual-feed-responsive-states`

- 在窄屏覆盖下，浏览器有效视口为 576×656（低于 760px 断点）。
- `body.clientWidth === body.scrollWidth === 576`，无页面级水平溢出。
- 详情容器在窄屏为 12px 圆角、`22px 16px 28px` 内边距。
- 加入 Inbox、保存为资料、升格为 Goal、忽略四个现有操作的最小高度均为 44px。
- 已实际完成“Feed 列表 → 选择另一条 Item → 详情”路径；299 个真实 Item 仍可浏览。
- 窄屏截图：`.impeccable/review/infoflow-feed-visual-narrow.png`

### `visual-feed-behavior-regression`

- `npm run build`：通过。
- `node --import tsx --test --test-name-pattern="Web view derives understandable Goal states" tests/web.test.ts`：通过，1/1。
- `node --import tsx --test tests/feed.test.ts`：通过，6/6。
- 真实页面仍展示查看来源、打开原文、加入 Inbox、保存为资料、升格为 Goal和忽略操作；本次没有修改对应数据属性和事件路径。
- 浏览器控制台 error/warn：0。

## 结论

Feed 工作台的阅读层级、响应式路径和现有业务操作满足本子 Goal 的三个验收条件，可以进入 Runtime 自检与 Molis Work 收口。
