# 来源工作台视觉验收

## 验收环境

- 项目：`project-aeb51deb-e335-403b-80cc-387e20e0e000`
- 独立验证服务：`http://127.0.0.1:4184`
- 数据：本地真实来源目录，包括 Gmail、GitHub 与 RSS 来源。

## 检查结果

### `visual-source-hierarchy`

- 详情区使用单一 paper 容器：14px 圆角、soft shadow、`24px 26px 28px` 桌面内边距。
- 详情 Tab 使用与 Goal 详情一致的紧凑 segmented surface；当前 Tab 使用 paper 背景与 soft shadow。
- 当前状态和主要动作位于事实清单之前；事实使用文档式分隔行，不再嵌套多层卡片。
- 状态颜色只用于来源健康状态和危险操作，没有新增装饰性色块。
- 桌面截图：`.impeccable/review/infoflow-source-visual-desktop.png`

### `visual-source-responsive-states`

- 在窄屏覆盖下，浏览器有效视口为 576×656（低于 760px 断点）。
- `body.clientWidth === body.scrollWidth === 576`，无页面级水平溢出。
- 详情容器在窄屏为 12px 圆角、`20px 16px 24px` 内边距。
- 主要动作最小高度 44px；详情 Tab 全部可达且未产生内部横向溢出。
- 已实际完成“来源列表 → 选择 GitHub → 详情”路径；概览、配置、拉取计划、来源消息、运行状态五个分区均可切换。
- 窄屏截图：`.impeccable/review/infoflow-source-visual-narrow.png`

### `visual-source-behavior-regression`

- `npm run build`：通过。
- `node --import tsx --test --test-name-pattern="Web view derives understandable Goal states" tests/web.test.ts`：通过，1/1。
- `node --import tsx --test tests/feed-sources.test.ts tests/feed.test.ts`：通过，16/16。
- 浏览器控制台 error/warn：0。
- 扩大到 `tests/web.test.ts tests/feed-sources.test.ts tests/feed.test.ts` 时 67 项中 66 项通过；唯一失败为既有 project catalog 文案断言（期望“内容不可读取”），不在本 Goal 的来源工作台改动范围内。

## 结论

来源工作台的层级、响应式路径与既有真实行为满足本子 Goal 的三个验收条件，可以进入 Runtime 自检与 Molis Work 收口。
