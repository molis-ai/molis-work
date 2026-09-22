# Characters

独立个人角色管理插件。拥有编辑界面、发布前的内容预览和项目发布操作；草稿与停用/删除状态由 Characters Module 的公开接口提供，固定正文、版本与来源由既有 Artifact 服务保存。调用方只得到精确版本引用，不能从浏览器请求注入正文或扩大权限。

通过真实 Plugin Runtime 启动，Host 注入本人草稿端口与当前项目 Artifact 客户端。插件不打开数据库、不导入 Module 或其他插件实现。无 Keychain、模型和执行状态。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `coding-c12`
- SSOT: `specs/coding-plugin/spec.md` §0 C12；`docs/SSOT-MATRIX.md`
- 管理与发布已通过正式插件入口在隔离预览实操：草稿恢复、并发冲突保留、固定版本与重复发布。Coding 精确版本选择、停用阻止新执行、在跑任务冻结与固定报告已实操；真实 MiniMax 同条件对照尚未证明减少人工负担，行为质量和完整验收继续推进。
