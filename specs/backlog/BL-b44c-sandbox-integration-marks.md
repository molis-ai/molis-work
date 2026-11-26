# BL-b44c-sandbox-integration-marks

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b44c-sandbox-integration-marks | 签名沙箱集成包也能声明自己的服务图标：现在图标（以及账号、文档、搜索、CLI 驱动）只从宿主构建的驱动清单 `INTEGRATION_DRIVERS` 读（`apps/local-host/src/builtin-drivers.ts`），沙箱包的服务卡没有图标、落回通用图标。方向：把图标放进 Manifest 声明（如 `card` 旁的图标资源），宿主按声明取，内置与沙箱同一条路 | 第 44C 批评审（[44c.md](../post-anticorruption-roadmap/reference/batches/44c.md#batch-44c-record)） | 明确后续做 | 要改 Manifest 合同并定图标资源的格式、大小与安全检查（SVG 清洗），超出 44C 收尾范围 | 无 | 中 | 待分配 |
