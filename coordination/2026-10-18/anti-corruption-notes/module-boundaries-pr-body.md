Projects 与 Governance 已经提供项目查询/修改/生命周期、结构提案记录和可信决定的业务服务，但仍在包入口和 Module 实例上暴露底层 Repository/Store。此片收回三个实现类的导出和两个公开 repository 成员，保持原有内部实例与事务路径；两个直接构造 Governance Store 的测试改走 Module.records。

这是 W5-08 的前两个 Module。库结构、版本、SQL、业务服务签名、Host 装配和动作合同保持；没有新 testing 子路径或包内部导入。两个现有 Module 用例同时断言存储实现不再公开，并继续完成真实项目身份/工作区及提案决定/回滚路径。

验证：整体与 workspace 构建、boundary、merge-base health、API、动作合同和资源通过。相关业务回归 23 文件 186 条、动作合同 1 文件 25 条，共 24 文件 211 条，零失败/跳过。Module Repository/Store 暴露项 21→16，页面资源 25 项共 7,475,661 B，本片增量 0。快查同时反映 main 已有的 Coding 样式行数下降；没有改其源码或门禁规则。没有 UI 行为变更，未重复浏览器；共享核心全量待统筹 CI。

本地候选 `5b1493e2816994bd03c8d5f00e11ef621c9dc5ca`，基于 main `a56a2763d`。当前仅本地准备，不增加第三个在途 PR；发布前同步实际 main 并 fresh fetch/secrets。
