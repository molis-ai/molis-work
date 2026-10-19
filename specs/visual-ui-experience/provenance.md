# 来源与许可记录

状态：参考记录（2026-10-19）。负责人：Codex。本文件用于追溯设计研究和许可，不定义产品需求；完整目标、取舍与验收仍以 [spec](spec.md) 为准。按用户要求，来源名称与地址独立保存在这里，不放回需求正文或 Goal Prompt。

## 固定来源与查阅范围

- 仓库：[Caho1/open-claude-ui](https://github.com/Caho1/open-claude-ui)。本次研究固定在提交 [`2834bc158a4849f21c97cbb2e0b10525f6e646f1`](https://github.com/Caho1/open-claude-ui/tree/2834bc158a4849f21c97cbb2e0b10525f6e646f1)，不以其之后的默认分支内容替换本次依据。
- 可操作参考：[视觉演示站](https://claude-storybook.bystanderss.chatgpt.site/)，2026-10-18 查阅了排版、控件、附件、消息、动效等样例。网站没有已核实的固定版本标识；它用于观察表达，不能替代固定源码、Molis 生产行为或性能证据。
- 材料分为文档主张、示例实现、演示运行三类。它们不互相证明；组件名称、作者对成熟度的描述和演示中的成功状态，都不作为生产验收结论。现有 HTTP 基线来自 Molis 的隔离测量，与这些参考材料无关。

以下路径均相对于上述固定仓库提交。章节编号对应其 `docs/` 下的文档；组件来自 `code-examples/`。研究已在 2026-10-18 逐项对照，2026-10-19 再核对文件目录与许可。

| 对应本项目机制 | 已阅读的主要材料 | 提炼与边界 |
| --- | --- | --- |
| design-principles、layout-centering、type-optics、geometry-boundaries | `docs/01-设计哲学与设计令牌体系.md`、`docs/02-基础原子组件与交互控件.md`；`CdsButton.tsx`、`ChatMessageBubbles.tsx` | 内容优先、阅读版心、光学对齐、同心圆角与边界层次；保留 Molis 的颜色、字阶、四档图标与命中区，不整体搬入样例设计系统。 |
| bezier-timing、spring-interruption、disclosure-segmented | `docs/04-动效物理学、着色器与环境光影.md`；`ClaudeMotionPresets.ts`、`ThinkingAccordion.tsx`、`SegmentedControl.tsx` | 贝塞尔、阻尼比、连续中断与实测滑块；参数是校准样本，文档与代码的弹簧命名并不完全一致，不能仅凭名称选值。 |
| stream-rendering、composer-mentions、assistant-information、feedback-lifecycle | `docs/03-会话核心流与指令交互引擎.md`；`ChatMessageBubbles.tsx`、`ChatComposer.tsx`、`RichComposerWithMentions.tsx`、`AttachmentCard.tsx`、`ModelSwitcherWithTokenGauge.tsx`、`StatusIndicators.tsx` | 字素显现、输入几何、材料呈现与状态反馈；发送、草稿、附件、模型和权限仍来自本项目对应 owner，不采用演示名单或定时成功。 |
| drag-split、scroll-ownership、overflow-fade | `DraggableSessionList.tsx`、`ArtifactsSplitPaneResizer.tsx`、`useClaudeScrollPinning.ts`、`ScrollFadeContainer.tsx` | 拖动阈值、分屏边界、底部跟随与溢出提示；文档描述不等于示例已经实现，跨 iframe 的遮罩必须真正接收指针事件，冷却结束不能抢回阅读位置。 |
| media-affine、preview-readiness | `docs/05-视听多媒体与产物交互物理学.md`；`MediaLightboxViewer.tsx`、`useClaudeSharedElementTransition.ts`、`EpitaxyIframeBridge.tsx` | 实际图像矩形、共享元素与仿射缩放、资源和内容就绪的区别；不引入示例权限模型，不把消息自报的用户激活当授权。 |
| code-diff、adaptive-focus、render-lifecycle | `CodeBlock.tsx`、`StreamingDiffViewer.tsx`、`ContainerResponsiveBar.tsx`、`useClaudeRovingFocus.ts`、`ConfirmationDialog.tsx` | 行高与定位、容器适配、焦点和生命周期；不采用 trim 原始代码、复制未完成先报成功、将全文重解析称为增量等行为。 |
| adoption-boundaries | `docs/08-AI-Agent-前端-UI-与动效开发指南.md`、`docs/09-Claude-Desktop-2.0-全量版本更新深度逆向分析.md` 及以上材料 | 仅选与本目标相关的机制；持续环境光、背景模糊、新协作拓扑、多窗口等未成为本任务功能。 |

## 许可与本次使用状态

固定提交的 [LICENSE](https://github.com/Caho1/open-claude-ui/blob/2834bc158a4849f21c97cbb2e0b10525f6e646f1/LICENSE) 为 MIT，版权声明为 `Copyright (c) 2026 Caho1`，已于 2026-10-19 读取核对。使用其代码或实质性部分时须保留版权与许可通知；不能仅用本文件的一句来源说明替代所需通知。

本 PR 只提炼需求、机制和校准参数，没有导入该仓库的组件实现、依赖、字体、图标或图片。今后实际采用代码时，在对应代码或依赖记录中标明原始文件、固定提交、修改范围，并随产物保留适用的完整许可通知；当次核对具体文件及附带资产，不把仓库许可证扩大解释为任何第三方品牌或演示站素材的许可。

演示站素材没有单独核实许可，本次也没有导入其素材。上述代码中的缺陷和未采用项只用于解释取舍，不代表已在 Molis 修复或验证；生产验证状态仍见 spec 与 [基线记录](baseline.md)。
