# 插件舞台文档编辑器内滚

状态：可验收。完成等级 **3：功能可用**。承接 `specs/fixed-chrome-inner-scroll/spec.md`：窗口壳 `overflow: hidden`，标题钉住，正文在自己的容器里滚。

## 背景目标

Functions / Form 打开一条后，右侧编辑器比视口高时能滚到页脚动作；顶栏（返回、标题、删除）不动。

## 当前行为与问题证据

`http://127.0.0.1:4180/projects/project-c7a2c189-4fbd-400f-a60e-dcdf555938af` 打开 Functions 详情：页面滚不动，底部「样例 / 试跑 / 发布」被裁掉。

实测：宽屏 `data-expanded="true"` 时 `.plugin-stage-workspace` 是 `overflow: hidden`（给内部 flex 详情定高）。`.functions-editor` / `.form-workspace` 却是 `flex: none; overflow: visible`，内容 1226px、容器 938px，没有滚动层。Dataset / PPT / 灵光编辑器已是 `flex: 1; min-height: 0; overflow: auto`。

临时把 `.functions-editor` 改成同样规则后：`scrollTop` 增加、顶栏 `top` 不变、页脚可见。

## 范围与非目标

做：Functions、Form 的舞台正文成为滚动容器，顶栏钉住。

不做：改窗口 overflow 合同、改主从展开逻辑、重做编辑器视觉、改 Dataset/PPT/灵光（已符合合同）。

## 方案

跟 Dataset / 灵光同一套：文档编辑器 `flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain`。workspace 继续 `overflow: hidden`，detail bar `flex: none`。

## 验收

1. Functions 详情：三栏 `.functions-col` 可滚，`.plugin-stage-detail-bar` 位置不变，`documentElement/body.scrollTop === 0`，页脚动作可见。
2. Form 编辑器：`.form-workspace` 同样可滚，顶栏钉住。
3. 工作台样式里不再给这两个编辑器写 `overflow: visible` 或 `flex: none`。

验证：`pnpm exec tsx --test --test-concurrency=1 tests/chrome-inner-scroll.test.ts`；浏览器打开 Functions 长表单滚到底。
