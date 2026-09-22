# 缩窄后的账号区与 Adeptify 名言迁移

状态：已完成，2026-09-13。用户提供底部账号区截图并要求修复缩窄后的样式，同时迁入 Adeptify 全部名言。完成等级 3：本机功能可用。

## 目标、现状与证据

用户截图显示英文 `YijunLocal space` 连在同一行，链接呈默认已访问紫色和下划线。`personal-workbench-v2.ts` 将账号基础 color、text-decoration、头像居中、文字 grid 与设置图标尺寸放在 `min-width:761px` 内；新 immersive 样式只覆盖部分尺寸，因而在 760px 及以下丢失基础布局。当前首页为三个有出处的古典短句，Adeptify 的 `adeptify-next/client-app-adeptify/pc/shell/src/pages/login/BrandPanel.tsx` 提供另十条英文名言。

## 范围与行为

- 在 immersive 导航自己的样式内完整定义底部账号区，不依赖旧桌面断点。姓名/空间说明始终上下排列、继承主题色且无下划线，头像/设置图标居中、不受长文字挤压；文字过长在自身区域省略。桌面、临界宽度、移动抽屉均适用；账号设置链接保持原目标。
- 保留现有 3 条，按原顺序追加 Adeptify 全部 10 条英文原文与原署名（共 13 条）。这是已有产品文案迁移，不新增未经提供的出处链接，也不把原署名当作独立核验结论。中文界面保留迁入内容的英文原文。
- 仍每 5 秒轮换、500ms 淡出/淡入、无轮播按钮；悬停、聚焦、后台和离开首页暂停，减少动态效果时直接切换。
- 较长文案完整换行，轮播区域按当前宽度下最长内容保留空间，轮换不改变日期/月历与输入区位置；切换侧栏宽度和重新显示首页后自然适配。所有名言共用 Grid 单元格，非活动页显式 visibility:hidden、aria-hidden=true 且 inert；仅活动页可见/可聚焦，取消原 hidden 切换以使隐藏页参与尺寸计算。
- 首页布局、月历、快捷方式持久化、禁用 Agent 输入、Goal 与 Runtime 数据均不改变。无网络请求引入，无新依赖，无提交/推送。

## 文件与依赖

Workbench：styles/immersive-navigation.ts、project-home.ts 名言集合与 renderer、styles/project-home.ts、scripts/client/project-home.ts 名言可见性。测试更新现有 project-home-start.e2e，补 761/760/600/390 底部账号真实浏览器回归。必要时机械替换受影响测试中旧首页导航 selector，保留导航语义。最终记录 DESIGN.md、对应 surface 与 sidecar 的本次变化。

## 验收与验证

1. 用生产页面复现 760px 英文深色底部账号断行/颜色问题，修复后验证 761px/760px/600px、390px 抽屉浅深色、中英文以及较窄目录；文字无重叠、无链接下划线、图标居中，设置仍能打开。
2. 实际轮播访问全部 13 条再回到首条；迁入的 10 条内容与 Adeptify 原集合逐条一致。最长英文在 1440/1024/760/390px 均完整显示；轮播高度稳定，不把非活动名言暴露给焦点与读屏。
3. 现有首页日期、月历、快捷方式和禁用输入测试保留通过。
4. `pnpm --filter @molis-ai/molis-work-app-workbench build`；相关 `node --import tsx --test` 浏览器测试。只涉及 Web 展示，不改 native 二进制或重跑 Rust。按既有授权安装 Core/Web 并重启本机服务、隔离预览。

用户截图优先于此前 ship；独立 reviewer 对本次证据给出修正项并在修复后复核。无其他开放需求。

## 验收结果

| 验收项 | 结果与证据 |
| --- | --- |
| 窄屏账号区 | 通过。先在生产页面复现 760px 缺失基础布局；修复后浏览器验证 761/760/600/390px 浅深色、文字分行与主题色、图标位置、设置链接项目上下文。8 张截图位于 `.impeccable/review/home-footer-quotes/`。 |
| 完整迁移与稳定轮播 | 通过。实际 DOM 逐条匹配 Adeptify 全部 10 条原文及署名，完整轮播 13 条并回到首条；字体与布局稳定后验证各宽度轮播高度不变，仅活动页可见且可聚焦。10 张首页长文及移动弹窗截图位于 `.impeccable/review/home-start/`。 |
| 原有首页与导航行为 | 通过。相关四项浏览器测试覆盖首页日期/月历、快捷方式持久化与禁用输入、账号区、目录回归。最终日志：`/private/tmp/molis-work-footer-quotes-tests.log`（目录）、`/private/tmp/molis-work-footer-quotes-final.log`（账号与快捷方式）、`/private/tmp/molis-work-quotes-settled.log`（完整首页轮播）。 |
| 构建与本机交付 | 通过。Workbench build 成功；更新构建清单后完成 Core/Web 本机安装，常驻服务重启成功；原隔离预览地址已重启并刷新。构建、安装、服务日志分别为 `/private/tmp/molis-work-footer-quotes-build-final.log`、`/private/tmp/molis-work-footer-quotes-install.log`、`/private/tmp/molis-work-footer-quotes-service.log`。 |
| 独立复核与边界 | 通过。独立 reviewer 确认账号区、13 条迁移、长文稳定布局三项全部 resolved，disposition: ship。未运行完整 JS/Rust 套件；本次仅改 Web 展示，无 native 变更。无剩余验收项，未提交或推送。 |
