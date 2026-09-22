# 固定顶栏，容器内滚动

状态：已验收。完成等级 3（功能可用）。承接已对齐的窗口 `overflow: hidden` 合同，把滚动从整块 main 下放到真正的内容区。

## 背景目标

窗口壳、顶栏、页面标题、搜索/筛选/工具栏钉住。只有下面的内容区滚：项目卡片、Feed/Sessions/Goals 列表、主区正文、市场卡片等。

## 当前行为与证据

窗口壳已锁死。上一轮把整块 `main.project-index`、`.settings-content`、plugin-stage 子面当成滚动容器，所以「选择一个项目」、设置标题、市场标题和搜索会跟着走。

## 范围与非目标

做：项目列表、设置、工作台首页、Feed、Sessions、Goals、来源、Artifacts、市场。标题/搜索/筛选钉住，内容列表或正文内滚。

不做：重做视觉、改业务/Runtime、重做窗口 overflow 合同、把 Session/Feed 文内标题做成 sticky。

## 方案

保留 `html/body` 的 `100dvh + overflow: hidden`。可滚区域仍是 `min-height: 0; overflow: auto; overscroll-behavior: contain`，但容器改成真正的内容区。

- 项目列表：`main.project-index` 改为 `overflow: hidden`。顶栏、「选择一个项目」、搜索/创建钉住；只有 `.project-index-body`（卡片网格或空态）滚。迁移条和脚注钉在底部。
- 设置：`.settings-content` 改为 `overflow: hidden`。页面标题钉住；标题之后的 `.settings-body` 内滚。
- 工作台：目录侧搜索/筛选钉住，Goals/Feed/Sessions/来源/Artifacts 列表内滚。主区 32px 顶栏钉住；市场标题和搜索钉住、卡片网格内滚；首页/Feed/Sessions/Goals/来源/Artifacts 主区正文在内容容器内滚。

## 验收

1. 项目列表滚动后，顶栏、「选择一个项目」和搜索位置不变；只有卡片网格 `scrollTop` 增加；`documentElement/body.scrollTop === 0`。
2. 设置页（外观、项目管理）顶栏和页面标题不动，只有标题下的正文滚。
3. 工作台首页、Feed、Sessions、Goals、来源、Artifacts、市场：chrome/标题/搜索不动，列表或主区正文在自己的容器里滚。
4. 窄屏项目列表标题和搜索仍固定。

验证：`pnpm exec tsx --test --test-concurrency=1 tests/chrome-inner-scroll.test.ts tests/chrome-inner-scroll.e2e.test.ts tests/visual-foundation.test.ts`。

## 假设

窗口壳合同保持。列表不够高时，测试可在内容滚动容器内插入垫块验证，不写入项目数据。
