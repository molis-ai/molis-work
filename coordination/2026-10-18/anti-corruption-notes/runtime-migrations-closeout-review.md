# Runtime migrations closeout review

结论：本轮收尾差异未发现 Blocker / P1 或当前必须修复的问题。

范围：只读核对 wt-model-selection（HEAD 3196d6e1e）的 35 文件收尾差异；未修改 M/S，未启动构建、测试或浏览器批次。主 Session 同时更新的 spec 措辞不作为独立运行证据。

- Images 与 Jelly 的 schema 文本逐字比对 HEAD 均相同，version 仍为 1；IMAGES_DATABASE / JELLY_DATABASE 是各自唯一声明。原 Home 清理/离线打开引用同一对象，目录的 Runtime database 声明没有并列 home_store 注册，物理库路径仍为 images/images.db、jelly/jelly.db。
- images.jobs.start 当前声明、绑定、动作快照和 MCP 用例统一为 v2；当前权限包含 model:invoke，scheduling 为 concurrent。MCP 用例明确拒绝 v1，且读权限拒绝断言针对当前 v2；没有用失效旧版本替代权限验证。
- page-assets 一次性额度从实际 main 的 1,110,187 到 1,112,375，净增 2,188 = Todo 28 + Lingguang 2,231 − 集成减少 71。仅精准基线可使用额度；测试仍拒绝多 1 字节、其他资源、再次增长和旧已消费基线。这是已授权增量重定基，不是新增额度。
- S-13 至 S-18 从各两行合成各一行。按代码反引号引用与测试标题片段提取，旧两行引用集合全部保留；材料权限边界独立编号 S-38，对应测试标题同步。安全测试命令和产品子集增加新 Runtime 用例。
- 发布清单和数据文档使用现行数据库声明；路线文档区分本地候选与 main 合入状态。路由快照补充新 Runtime 路径，未删除旧入口探针。

工程运行证据由主 Session 提供并沿用，本次未机械重跑：整体 build 3、health/API/boundary/assets 检查通过；必跑 135 文件最初的 Images MCP 版本与发布声明两项已修复并通过；补充 103 文件中 assistant-thread-reply 的 ECONNRESET 原代码重跑 3/3 通过；5 个 Chrome 文件 19 用例通过。这些证据不扩大为用户本人验收或剩余 Shelf AI 改造完成。
