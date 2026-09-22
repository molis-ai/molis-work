# Characters

个人 Character 草稿与启用状态的唯一写入方。草稿跨项目复用，按本人隔离；修改与状态变更使用修订检查，删除保留墓碑。

公开入口提供查询、草稿命令和同步发布回调。Artifact 的固定正文、版本、来源仍由原 Artifacts Module 拥有；本模块只在确认草稿仍有效时，将固定内容交给 Host 注入的发布者，不直接依赖或写入另一个业务模块。

允许依赖 Characters Contract、Node SQLite/文件系统；禁止依赖插件、App Shell、Agent Runtime 或另一个 Module 的实现。仓库实现不从公开入口导出。当前无遗留角色数据迁移，不创建默认人格。

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `coding-c12`
- Contract: `@molis-ai/molis-work-contracts/modules/characters`
- SSOT: `specs/coding-plugin/spec.md` §0 C12
- 管理发布通过独立插件接入，Coding 选择、Host/SDK 冻结、停用阻止新执行与固定报告已实操。真实模型对照保留尚未改善人工负担的证据；行为质量和完整验收未完成，不把数据层通过当作 C12 完成。
