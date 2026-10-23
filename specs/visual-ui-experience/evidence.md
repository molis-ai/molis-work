# 视觉与交互：逐项证据（VUX-41）

[spec](spec.md) 的五十项验收逐项分开记三种状态（2026-10-22，第九十三片生成，随各片更新）：

- **工程**：测试名或注释里写着这个编号的用例（`tests/` 下的文件，略去 `.test.ts`；一个文件可能证明几项）。「—」是没有单列用例的项，原因写在最后一列。
- **真实场景**：用真实模型、隔离 Home 走过的用户动线。第八十九片的第一次（项目选择页与项目页的助理动线）与第一百零八片的第二、第三次（项目页中文深色与英文浅色，含停止、步骤失败与模型自己重试、侧栏六组）；插件页、Coding、附件与拖入还没在真实场景里走成。
- **本人验收**：都未做。

测试通过只说明工程那一栏；标了「人工」的项，工程只做到规则、样式、测试与组件板对照，观感留给人眼。

| 编号 | 类型 | 工程（测试文件） | 真实场景 | 本人验收 | 留下的 |
| --- | --- | --- | --- | --- | --- |
| VUX-01 | 人工 | `assistant-rich-lists.e2e` | 未走 | 未做 | 行宽、余量与密度的观感 |
| VUX-02 | 人工 | — | 未走 | 未做 | 信息层级的观感；没有可量的断言，靠 [人工] 与场景复查 |
| VUX-03 | 人工 | `geometry-boundaries.e2e` | 未走 | 未做 | 明暗字重校准的观感、真机字体 |
| VUX-04 | 人工 | `chinese-layers.e2e`、`chinese-walkthrough.e2e`、`stream-text.e2e`、`text-wrap.e2e` | 未走 | 未做 | 孤字尾行的观感 |
| VUX-05 | 工程 | `chinese-layers.e2e`、`chinese-walkthrough.e2e`、`narrow-surfaces.e2e`、`truncation-tip.e2e` | 未走 | 未做 | — |
| VUX-06 | 工程 | `hover-actions.e2e`、`pages-size-keys.e2e` | 未走 | 未做 | — |
| VUX-07 | 人工 | `geometry-boundaries.e2e` | 未走 | 未做 | 阴影层级、细线在缩放下的观感 |
| VUX-08 | 工程 | `assistant-side-groups.e2e`、`assistant-surroundings`、`board-assistant.e2e`、`soft-workbench-refinement`、`visual-mechanisms.e2e` | 第一次（第八十九片：侧栏四组有真实内容）；第一百零八片走过 | 未做 | — |
| VUX-09 | 工程 | `assistant-side-groups.e2e`、`assistant-surroundings`、`board-assistant.e2e` | 第一次（第八十九片，只走了非编程） | 未做 | — |
| VUX-10 | 工程 | `board-assistant.e2e` | 未走 | 未做 | 执行级证据（模型实际读了什么）只到「已附加/可用」 |
| VUX-11 | 工程 | `assistant-usage.e2e` | 未走 | 未做 | 账户额度与重置要 Prologue 提供 |
| VUX-12 | 工程 | `assistant-chooser-open-result.e2e`、`assistant-late-view.e2e`、`assistant-stop-settles.e2e`、`assistant-open-object.e2e`、`missing-item-feedback.e2e` | 第一次（第八十九片：选择页的结果打开）；第一百零八片走过 | 未做 | 无权限、部分成功 |
| VUX-13 | 工程 | `assistant-process-info.e2e`、`board-assistant.e2e`、`soft-workbench-refinement`、`coding-process-fold.e2e` | 第一百零八片走过（项目页、中英文） | 未做 | 每行的影响摘要（要改合同）、按计划步骤或子任务分组 |
| VUX-14 | 人工 | `assistant-rich-lists.e2e`、`soft-workbench-refinement`、`stream-text.e2e` | 第一次（第八十九片：流式与重开一字不差）；第一百零八片走过 | 未做 | 模糊量与时长的观感 |
| VUX-15 | 工程 | `stream-text.e2e` | 第一次（第八十九片：回答的列表） | 未做 | — |
| VUX-16 | 工程 | `assistant-attachment-chips.e2e`、`composer-steady.e2e`、`field-fit.e2e`、`form-question-reflow.e2e`、`lingguang-actions`、`soft-workbench-refinement` | 第一次（第八十九片：草稿在失败与重载后仍在） | 未做 | IM 长高后的位置（#919） |
| VUX-17 | 工程 | `assistant-mention.e2e` | 未走 | 未做 | 「/」菜单与情境选择的候选归统一输入 |
| VUX-18 | 工程 | `assistant-attachment-chips.e2e`、`board-assistant.e2e`、`drop-zone.e2e` | 未走 | 未做 | 「处理中」仍由附件 owner 显示；真实 WKWebView 拖入 |
| VUX-19 | 工程 | `artifact-clipboard.e2e`、`im-follow-copy.e2e`、`product-experience-polish.e2e`、`shelf-client-boundaries.e2e`、`visual-mechanisms.e2e`、`visual-review-consumers.e2e` | 未走 | 未做 | — |
| VUX-20 | 工程 | `assistant-retry-countdown.e2e`、`assistant-stop-settles.e2e`、`prologue-stream` | 第一百零八片走过（项目页、中英文） | 未做 | 行为归 UIV/RCPT，它们的用例（如 `assistant-input-receipts.e2e`、`agent-input-delivery`）守着送达、失败与草稿；限流倒计时按运行时的时刻（第一百零二片）；真实服务的限流没有遇到 |
| VUX-21 | 人工 | `form-question-reflow.e2e` | 未走 | 未做 | 咬合与回弹的观感 |
| VUX-22 | 工程 | `assistant-side-groups.e2e`、`visual-mechanisms.e2e` | 未走 | 未做 | — |
| VUX-23 | 工程 | `pages-size-keys.e2e`、`split-divider.e2e`、`tab-reorder-preview.e2e` | 未走 | 未做 | — |
| VUX-24 | 工程 | `split-divider.e2e`、`tab-split-drop` | 未走 | 未做 | — |
| VUX-25 | 人工 | `panel-entry.e2e` | 未走 | 未做 | 标题紧凑、按任务打开的观感；居中对话框不判方向 |
| VUX-26 | 工程 | `agent-studio.e2e`、`assistant-scroll-follow.e2e`、`coding-question-card.e2e`、`im-follow-copy.e2e`、`scroll-follow.e2e` | 未走 | 未做 | — |
| VUX-27 | 工程 | `overflow-fade.e2e`、`soft-workbench-refinement`、`visual-review-consumers.e2e` | 第一百零八片走过（项目页、中英文） | 未做 | — |
| VUX-28 | 工程 | `keyboard-groups.e2e` | 未走 | 未做 | — |
| VUX-29 | 工程 | `hover-actions.e2e`、`overlay-placement.e2e`、`dialog-submit-rules.e2e` | 未走 | 未做 | 灵光「丢掉」与 Dataset「删除」的询问框、Pages 模板选择格仍是确认后先关上再发；插件框架的遮罩没有退场淡出 |
| VUX-30 | 工程 | `chinese-walkthrough.e2e`、`english-walkthrough.e2e`、`narrow-surfaces.e2e`、`text-wrap.e2e` | 未走 | 未做 | — |
| VUX-31 | 工程 | `busy-feedback.e2e`、`load-geometry.e2e`、`save-failure.e2e`、`stale-detail.e2e`、`late-list-responses.e2e`、`optimistic-failure.e2e` | 未走 | 未做 | Todo 的 `loadWorks`、Schedule 的 `refreshStage` 与 Goals、Workflows、Form、Images、Alchemist 的重读未逐处查 |
| VUX-32 | 工程 | `issue-draft-preview.e2e`、`media-zoom-board.e2e`、`visual-mechanisms.e2e` | 未走 | 未做 | — |
| VUX-33 | 工程 | `assistant-text-html.e2e`、`code-diff-reader.e2e`、`code-diff-scale.e2e`、`code-incremental-colour`、`code-incremental.e2e`、`code-rows-geometry.e2e`、`code-scale.e2e`、`coding-changeset-http`、`diff-patch`、`diff-plugin` | 未走 | 未做 | Assistant 40k 以上的代码图、CSS 缩放下制表约 2 px；Diff 插件不着色（着色器要先移进 SDK） |
| VUX-34 | 人工 | `desktop-drag-regions.e2e` | 未走 | 未做 | macOS 真机的拖拽、全屏与缩放留白 |
| VUX-35 | 工程 | `action-directory-pass`、`local-web-actions`、`pages-assistant-surfaces.e2e`、`style-has-scope` | 未走 | 未做 | 真实 Home 规模下的复测 |
| VUX-36 | 工程 | `action-directory-pass`、`code-diff-scale.e2e`、`code-scale.e2e`、`code-turn-style.e2e`、`has-anchors.e2e`、`hidden-surfaces-quiet.e2e`、`plugin-market-upgrade.e2e`、`repeat-no-accumulation.e2e`、`assistant-repeat-no-accumulation.e2e`、`style-has-scope`、`visual-foundation` | 未走 | 未做 | 流式一轮从开始到结束的反复没量 |
| VUX-37 | 工程 | `action-directory-pass` | 未走 | 未做 | — |
| VUX-38 | 工程 | `style-custom-properties`（语义参数有声明） | 未走 | 未做 | 同源的其余部分靠门禁与共有组件守着（插件 SDK、包边界、`pnpm boundary:check`） |
| VUX-39 | 工程 | `board-assistant.e2e`、`board-conditions.e2e`、`board-overflow.e2e`、`board-specimens.e2e`、`media-zoom-board.e2e` | 未走 | 未做 | Shelf 的视频与音频没有自己的行（生产里也不分）；Coding 时间线没有板上样张 |
| VUX-40 | 工程 | `chinese-layers.e2e`、`chinese-walkthrough.e2e`、`coding-board-origins.e2e`、`coding-mcp-settings-client`、`coding-route-locale`、`coding-run-control-contract`、`coding-state-rings.e2e`、`coding-timeline.e2e`、`coding-commit-draft`、`diff-git-english-sentences`、`english-surfaces.e2e`、`english-walkthrough.e2e`、`fill-message`、`local-web-actions`、`narrow-surfaces.e2e`、`translation-check` | 第一百零八片走过（项目页、中英文） | 未做 | 提交草稿是否按指定语言写要在真实场景里看；Agent 审阅卡片归字体皮肤语言书 §6.1 |
| VUX-41 | 工程 | — | 未走 | 未做 | 本表即证据；真实场景两轮与本人验收未做 |
| VUX-42 | 工程 | `visual-mechanisms.e2e` | 未走 | 未做 | — |
| VUX-43 | 工程 | `assistant-retry-countdown.e2e`、`board-specimens.e2e`、`coding-timeline.e2e` | 未走 | 未做 | 倒数的观感（固定宽度 `MM:SS` 已测） |
| VUX-44 | 工程 | `visual-mechanisms.e2e` | 未走 | 未做 | — |
| VUX-45 | 工程 | `visual-mechanisms.e2e` | 未走 | 未做 | 真机字体切换 |
| VUX-46 | 工程 | `status-ring`、`visual-order-details.e2e`、`visual-order.e2e` | 第一次（第八十九片：选择页与引导进了秩序审计） | 未做 | — |
| VUX-47 | 工程 | `visual-order-details.e2e`、`visual-order.e2e` | 同上 | 未做 | — |
| VUX-48 | 工程 | `visual-order-details.e2e`、`visual-order.e2e` | 同上 | 未做 | — |
| VUX-49 | 工程 | `visual-order-details.e2e`、`visual-order.e2e` | 同上 | 未做 | — |
| VUX-50 | 工程 | `visual-order-details.e2e`、`visual-order.e2e` | 同上 | 未做 | — |
