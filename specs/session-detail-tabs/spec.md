# Sessions 详情改为标签

## 背景目标

Sessions 详情下方把执行内容、当前关系和 Goal 关联历史并排成两栏。窄工作区里执行内容被挤窄，右侧卡片又占一列。把它改成标签，一次只看一块。

## 当前行为与问题证据

`plugins/native/work/src/ui/render.ts` 的 `goal-focus-layout project-operation-layout` 是两列：左栏 `session-execution`，右栏 `当前关系` + `关联历史`。桌面样式固定 `1fr + 270–303px`。

## 范围与非目标

做：只改 Sessions 详情该区域的信息架构和样式；默认停在「执行内容」；标签切换不重新读取 Runtime。

不做：不改标题区、加载原 Session、Handoff、关系弹窗、内容读取 API；不改 Goals 的 `goal-focus-layout`。

## 方案

三个标签：执行内容、当前关系、关联历史。视觉对齐来源详情的分段标签。身份与归档留在「当前关系」。

## 验收

- 详情有 tablist，默认「执行内容」可见，另外两块 `hidden`。
- 点击标签只切换当前 Session 文档内的面板，不丢已读时间线。
- 桌面与窄屏都是单列，不再并排右栏。
