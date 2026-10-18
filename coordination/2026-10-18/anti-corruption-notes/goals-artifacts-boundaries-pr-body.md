Goals、Artifacts 与 ProcessItems 的生产调用已经走业务服务，但包入口和服务对象仍公开 Repository，调用方可绕过命令/查询入口。这片删除两个存储类的包导出，把三个 Module 的 Repository 留在构造局部，将只读 Goals 查询服务与成果/过程项服务的 Repository 改为私有字段。

依赖前片 `5b1493e28`（Projects/Governance），本片 head `0a1a9f7c3`；仍为本地候选，等待既定两片 PR 队列。唯一需求书为 `specs/repository-anti-corruption/spec.md` 的 W5-08-MOD-03/04。没有改变 SQL、事务、版本结构、错误或 Host 装配，既有业务服务 API 保持，内部服务构造参数类型保留；没有新增 testing 子路径、内部导入或门禁例外。

验证：整体构建、boundary、完整 merge-base health（含 64 份 API 快照、2,506 声明）、下降快查、页面资源通过。两包 README 必跑和相关 Goal 生命周期/规划/CLI-MCP、成果/过程项消费及动作合同快照共 36 文件 295 条通过，零失败/跳过。现有用例新增断言证明两个类不再导出，Module 及返回服务均无公开 repository，同时保留原幂等、拒绝和持久化断言。

Module Repository/Store 公开项 16→9（两片累计相对 main 21→9）；页面资源 25 项、7,475,661 B，本片增量 0。无页面行为改动。属于共享核心，完整回归交统筹 CI；按用户约定未跑本机全量。日志 `/tmp/molis-goals-artifacts-*.log`，文件清单 `/tmp/molis-goals-artifacts-files.json`。
