# BL-home-events-endpoint-unused

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-home-events-endpoint-unused | `/api/home/events` 与 `/api/home/events/open`（`apps/local-host/src/home-dock-http.ts`，`web-request.ts` 里的只读放行）已没有工作台客户端调用：第 15 批删了旧首页客户端；核对外部调用方后删路由、只读放行和它的用例 | [第 15 批评审台意见 S6](https://github.com/molis-ai/molis-work/pull/2017#issuecomment-6823945201)；[第 15 批核账](../post-anticorruption-roadmap/reference/batches/15.md) | 明确后续做 | 删前要确认没有 MCP、桌面壳或测试之外的调用方 | — | 低 | 宿主（C 轨） |
