# BL-schedule-reads-actions-render-alert

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-schedule-reads-actions-render-alert | Schedule 那条「读不到」提示里的重试按钮，样式是自己写的 `.schedule-reads__actions`（`plugins/native/schedule/src/ui.ts`、`styles.ts`）。它是 `.rk-`、`.gr-`、`.sk-`、`.wb-alert-actions` 之后第五份本地写的动作槽。等平台的 `renderAlert({ actions })` 合入，改用它，和第 08 批删 `#alert-actions` 一起做 | [第 18 批收尾检查](https://github.com/molis-ai/molis-work/pull/1929#issuecomment-6711192888) | 明确后续做 | 平台的动作槽还没合入 main | #1913（第 05 批） | 低 | E 轨 |
