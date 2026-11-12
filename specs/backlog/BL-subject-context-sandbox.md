# BL-subject-context-sandbox

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-subject-context-sandbox | 对象的关联原文（Manifest `ui.subject_context`，BL-911）今天只对内置插件兑现：只有 `goal` 一种对象、只经有舞台的运行中实例读，沙箱包的清单由 SDK 严格重建、写不进这项声明。开放给签名沙箱包时要定：沙箱实例怎样应答这一读、原文上限与截断照旧、受众仍只限本人页面（GAS-01～03），并补沙箱一侧的拒绝用例 | [第 27 批收尾检查](../post-anticorruption-roadmap/reference/batches/27.md#收尾检查) 第 2 问；`skills/molis-plugin-dev/ui.md`、`docs/system/EXTENSION-POINTS.md` | 已知缺口 | 与 `stage_data` 只对内置目录兑现同一现状，等第一个要用的沙箱包 | — | 低 | C 轨／Plugin Runtime（执行会话待分配） |
