# BL-framed-area-tidy

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-framed-area-tidy | 两处小整理：① `apps/workbench/src/browser/plugin-frame/framed-area.ts` 导出了只在本文件里用的 `FRAMED_AREA_LIMIT`、`FRAMED_AREA_MIN_WIDTH`、`FRAMED_AREA_WIDE_FROM`、`FRAMED_AREA_STEADY_MS` 和 `FramedAreaOptions`，`task-grants-area.ts` 的 `TASK_GRANTS_UNAVAILABLE` 也是这样；② 设置路由的 `list` 在 `installationOf` 里每个安装各调一次 `withProject`，安装多了可以合成一次 | [第 18 批收尾检查](https://github.com/molis-ai/molis-work/pull/1929#issuecomment-6711192888) | 明确后续做 | ① 要等第 13 批 ④c-2 用上 `framed-area.ts` 才知道哪些该导出；② 现在安装数少，量不大。等下一次碰这几个文件的 PR 顺手做 | 第 13 批 ④c-2 | 低 | D 轨 |
