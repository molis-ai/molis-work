# 画布中心的工作台原型

这是独立的完成等级 2「可交互原型」，用于体验与讨论，尚未作为产品正式设计验收。当前版本展示现有 Molis Work 的两层目录行为、按项目添加插件，以及 Goals 画布内的固定工作框；视觉参考 Linear 的紧凑层级与低饱和中性色。

全部操作只保留在当前页面内存中，刷新即重置。安装、对话、成果更新与终端均为模拟，不下载插件、不调用 AI、不连接 Runtime，也不修改真实项目数据或已安装 App。Sessions、Feed、Artifacts 只展示导航和示例内容。

## 启动

在项目根目录运行：

```sh
python3 -m http.server 64520 --bind 127.0.0.1 --directory docs/design/immersive-workbench
```

打开 [本地原型](http://127.0.0.1:64520/)。服务仅监听本机，终端按 `Ctrl+C` 停止。

## 建议体验

1. 打开左上角项目弹层，在 Molis Work 与「灵感收集」间切换。项目头部固定；根层只列当前项目已安装的插件，每行包含图标、名称、说明和进入箭头。
2. 点击 Goals，同一栏上方出现「项目目录」返回箭头和纯文字插件标签，下方是搜索与 Goal Tree。现有四个插件同排显示，选中项呈轻微浮起的圆角卡片；内容放不下时可横向滚动，左右按钮出现在返回行右侧。点击插件同步切换下方 item 与右侧内容；返回只恢复根层，右侧已打开的工作和草稿保留。
3. 在画布空白处平移、缩放或适应视野，拖动 Goal 节点。虚线表示拆解，带箭头实线表示前置依赖。点击 Goal 展开固定工作框；框不可拖动，左侧目录和顶部栏仍可用。按 `Escape` 收起，回到原画布视角、节点位置和焦点。
4. 在工作框内展开成果、确认引导方向、编辑预期结果与完成要求、写备注或查看时间线。备注仅进入时间线；决定会更新演示文档版本与事件。切换对话和终端，终端可试 `help`、`status`、`clear`。
5. 留下对话草稿或未提交的终端命令，再切换 Goal、插件或项目。每个项目分别保留 Goal 数据、工作状态、模式、草稿和画布位置，并记住上次打开的插件。
6. 从左下角进入全局「插件市场」，浏览 Goals、Sessions、Feed、Artifacts 四种卡片，试用搜索及「当前项目已安装」筛选。点击「添加到项目」，选择目标项目；已安装的项目会阻止重复添加，成功后可前往该项目。
7. 把 Goals 添加到「灵感收集」并前往：首先是本项目的空画布。创建第一个 Goal 后，目录数量同步更新；新 Goal 只有本次创建记录，从「尚未开始」起步，不带入示例成果与旧历史。
8. 切换深浅外观并缩窄窗口。手机目录为抽屉：进入插件时保持打开，选择具体目标或记录后收起；项目安装面板可在窄屏使用。

## 当前视觉与结构

- 默认石墨深色：画布 `#111216`、工作表面 `#191a20`、主文字 `#e8e9ee`、紫色强调 `#a7a6f5`。浅色对应 `#f4f5f8`、`#fff`、`#272932`、`#6262d6`；用细分隔与轻微底色区分区域和选中状态。
- 使用系统字体，正文基准 `13px / 1.55`，终端使用系统等宽字体。插件根层名称 `12px`、说明 `10px`，紧凑但保留两级文字关系。
- 左右顶部共用 `32px` 标题栏，收起按钮、插件标题与右侧操作垂直居中；项目选择在左侧下一行。标题栏内的键盘焦点框位于按钮边界内。
- 应用目录宽 `264px`，视口不超过 `1050px` 时为 `236px`；不超过 `600px` 时改为宽 `264px` 的抽屉。项目头及插件条固定，item 区独立纵向滚动。导航的横向分隔与选中下划线已去掉；11px 纯文字标签中，当前插件使用 6px 圆角、较亮底色和向下的柔和阴影，其余标签保持平整。搜索提示为「搜索目标…」/「搜索内容…」。手机切换插件保持抽屉，选择 item 后才收起。
- 市场卡片默认两列、间距 `16px`、圆角 `10px`；右侧插件内容区不超过 `680px` 时改为单列。安装面板宽 `420px`，受视口宽高约束。
- Goal 节点宽 `274px`、最小高 `158px`、圆角 `12px`。工作框与遮罩限制在右侧画布内，主区承载对话或终端，右栏承载信息与时间线；窄内容区按需覆盖显示右栏。减少动画偏好下直接切换。

这些选择只记录本次探索，不构成全产品设计规范。方向合同见 [index.html](index.html) 的首个 body 注释，行为范围以 [原型 spec](../../../specs/archive/immersive-workbench-design/spec.md) 为准。`navigation.js` / `navigation.css` 管项目菜单、两层目录、市场和模拟安装；`workbench.js` / `workbench.css` 管画布、工作框和按项目分开的演示状态。

## 验证与交接

最新顶部对齐已验证：当前深色预览 `703×936`、浅色桌面 `1560×1083`、浅色手机 `390×844` 的左右顶部均为 `32px`，操作中心一致，项目行从其下方开始。收起/展开目录、插件切换、Goal 展开及手机键盘焦点正常，无裁切、页面横向溢出或浏览器错误。截图：[当前宽度](review/aligned-titlebar-user.png)、[浅色桌面](review/aligned-titlebar-light.png)、[手机](review/aligned-titlebar-mobile.png)。

此前卡片选中态与手机 item 操作验证保留在 spec；`raised-plugin-strip-*.png` 的顶部高度已由当前对齐版替代，卡片底色、圆角和阴影继续保留。

前版纯文字标签的搜索、返回与草稿恢复验证保留在 spec；`quiet-plugin-strip-*.png` 的下划线样式已由当前卡片选中态替代。

此前横向插件栏的行为验证见 [plugin-strip-qa.txt](review/plugin-strip-qa.txt)；该轮带图标和两侧箭头的截图已被最新纯文字标签版替代。

此前市场与两层目录的完整检查见 [linear-navigation-qa.txt](review/linear-navigation-qa.txt)，以下 14 张为该轮历史截图；横向插件栏以最新截图为准：

- 桌面：[根层与画布](review/linear-desktop-canvas.png)、[展开对话](review/linear-desktop-expanded.png)、[Goal 树与终端](review/linear-desktop-tree.png)、[项目菜单](review/linear-project-menu.png)。
- 市场与创建：[插件市场](review/linear-market.png)、[选择安装项目](review/linear-install.png)、[空项目](review/linear-empty-project.png)、[新 Goal](review/linear-fresh-goal.png)。
- 手机：[市场搜索](review/linear-mobile-market.png)、[安装面板](review/linear-mobile-install.png)、[Goal 目录](review/linear-mobile-directory.png)。
- 用户当前宽度：[目录](review/linear-user-529-directory.png)、[市场](review/linear-user-529-market.png)；[浅色树与终端工作框](review/linear-light-canvas.png)沿用截图文件名，内容不是空画布。

[此前独立审阅](review/linear-finish-review.md)结论为 `ship`，仅覆盖当时的等级 2 原型。横向栏另经布局预评估与浏览器验证。源码审阅保留 P2：工作框已打开时切换 Goal，树中高亮可能仍停留在旧目标，留待后续处理。

早期 `qa.txt` 仅保留画布和工作框的历史回归基线；旧导航截图、`project-switch-qa.txt` 的 native select 记录、旧扁平菜单和尺寸说明均已被本版替代，不作为当前导航依据。本原型没有交付摄影或生成图像资产，截图不属于产品图像素材。

真实接入仍需连接 Goal 事件、Artifact 版本与 Runtime 会话，实现实际安装、持久化、执行和状态同步。断线后保留草稿并读回真实状态的恢复能力尚未验证；终端文本不能直接作为权威状态。本次交付不宣称功能可用、内部完整或可发布。
