# BL-surface-composition-review-followups

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-surface-composition-review-followups | 第 15 批跨批合审的不挡合并项：①（C2）`PROJECT_INSTALLATION` 是安装一侧的身份 schema，现从 `services/surface-composition` 公开，搬到 `platform/plugin-trust`；②（C3）SDK 公开签名里用到两个没导出的类型 `Identity`（`sandboxReadProtocolAction` 参数）与 `PresentationControl`（`PresentationFormValues.actions`），导出或内联；③（D2）组件板的 `surface-slot` 标本改用 `renderPresentationForm` 画实际挂载出的样子，加「读不到＋重试」状态，并让组件板分节与 `ui-spec.json` 的分组一致；④（D3）插件页内挂载位与讨论位的浏览器用例补中英 × 深浅 × 三档宽度；⑤（CI 修复时发现）呈现检查（`assertSurfacePresentation`）读不到某个已装插件的 Manifest 就整体拒绝，同一项目里所有声明了呈现的插件都启动不了：核对 `molis-work plugin dev` 等不存发行物的安装路径是否会落到这里，必要时只拒绝那一个来源 | [C 轨合审](https://github.com/molis-ai/molis-work/pull/2017#issuecomment-6825868089)、[D 轨合审](https://github.com/molis-ai/molis-work/pull/2017#issuecomment-6825868784)（评审台代做，用户 2026-11-12 定） | 明确后续做 | 不挡合并；①②改公开合同与 SDK API，要单独评审 | — | 中 | 合同（C 轨）、组件板（D 轨） |
