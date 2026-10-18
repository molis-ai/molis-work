Runtime 项目绑定的 Repository 原先由 Host 直接构造并保存。本片把绑定命令、创建并绑定、删除绑定事实的装配移回 private-work-context，移除 Repository 的公开出口；Host 继续负责项目目录创建与补偿，原确认、事务、幂等和事件语义保持。

旧边界门禁硬编码要求上述 Repository 出口。用户已批准随本片改为要求 owner 工厂并拒绝旧出口，同时保留直接 SQL 和大小限制，把新装配文件纳入大小检查；3 条正反向门禁用例覆盖这次调整。该门禁与新装配必须同时切换。

- 整体构建、boundary、完整 merge-base health/API、动作快照及页面资源检查通过。
- README/受影响回归共 102 文件 1,109 条通过，其中 Chrome 2 文件 20 条；门禁补丁后另验证相邻边界 5 文件 16 条，零失败/跳过。
- Module Repository/Store 出口 9→8，Host catalog 类 289→278 行；页面资源增量 0。
- 不改 SQL、库版本、现存文件格式、对外动作合同或真实 Home；内部包装配调用方已同步，不增加兼容层。

唯一需求与验收：specs/repository-anti-corruption/spec.md 的 W5-08-CTX-01～04。依赖本地前两片 Module 边界收口，尚未推送；共享核心全量交统筹 CI。整条 W5-08/W5/W6 仍未完成。
