# BL-project-arrival-goals-direct-read

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-project-arrival-goals-direct-read | `apps/local-host/src/project-arrival-http.ts` 经 `goalsHostActions` 直接读 Goals 拼项目简介，宿主替一个插件取数；应改走组合服务或 Goals 的公开读取动作 | [第 15 批评审台意见 S6](https://github.com/molis-ai/molis-work/pull/2017#issuecomment-6823945201)；[第 15 批核账](../post-anticorruption-roadmap/reference/batches/15.md) | 明确后续做 | 第 15 批的范围是项目首页与各位置，打开项目的简介页没有换 | 组合服务（第 15 批已合入后） | 中 | 宿主（C 轨） |
