# BL-b44c-studio-images

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b44c-studio-images | 创作台画方案配图（`apps/local-host/src/plugin-builder/studio-images.ts`）借项目里图片插件的动作（`images.connections.list`、`images.jobs.*`）与权限名（`images:*`），是平台点名插件；改成找声明了 `image_generation` 的插件（目录里的 `offers`），或直接走平台的图片服务。G1 具名例外名单里按「推迟项」登记 | 第 44C 批 G1 终点（[44c.md](../post-anticorruption-roadmap/reference/batches/44c.md#batch-44c-record)） | 明确后续做 | 改的是创作台出图的路径，44C 不改创作台行为 | 无 | 低 | 待分配 |
