# 项目资料

项目里所有 Agent 共用的资料目录与读取：经系统搜索找到资料，向资料所属插件读原文，按分节或位置一段段读，在几份资料里逐行查找。一律用调用者自己的授权；本服务不保存正文，卡片只是指路。需求与分期见 [specs/archive/project-knowledge/spec.md](../../specs/archive/project-knowledge/spec.md)。

包名：`@molis-ai/molis-work-service-knowledge`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Agent 像在代码库里找东西一样一步步找（spec §6.2）：`knowledge.list` 看项目里有什么，`knowledge.search` 按词拿卡片，`knowledge.grep` 找确切的行（不点名资料就查全项目，也可只要哪几份有、各几行），`knowledge.outline` 看分节树，`knowledge.read` 按节（连同子节）或从某一行起读原文；`knowledge.locate` 让项目的文字模型看几份资料的分节树、按问题选节（`src/locate.ts`）；`knowledge.glob` 找工作目录里的文件。Host（[apps/local-host/src/knowledge-actions.ts](../../apps/local-host/src/knowledge-actions.ts)）把这些动作注册成提供方 `system.knowledge`，与系统搜索同一处装配。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | `KnowledgeService`：查找、结构、读取、逐行查找 |
| [src/text.ts](src/text.ts) | 分节（Markdown 标题，没有标题时按段落切）、读取范围、逐行查找；都是纯函数 |
| [src/related.ts](src/related.ts) | 宽松召回：索引正文与卡片文字两份「有其中一些词」的排序按名次合起来（spec §6.4） |
| [src/locate.ts](src/locate.ts) | `knowledge.locate`：把分节树交给模型选节，只收回确实存在的节（spec §6.4） |
| [src/errors.ts](src/errors.ts) | `knowledgeErrors` |

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。

```bash
pnpm --filter @molis-ai/molis-work-service-knowledge typecheck
pnpm --filter @molis-ai/molis-work-service-knowledge build
```

## 开发要求

- 负责：资料的查找结果（卡片）、按所属插件现在的正文给出分节、按分节或位置读原文、在指定资料里逐行查找；只在调用者自己的项目里。
- 不负责：插件的表与正文（各插件的对象读取器）、索引（`horizontal/search`）、权限授予（动作服务与各入口）、模型调用（以后的整理经 `horizontal/agent-host`）。
- 公开入口：`@molis-ai/molis-work-service-knowledge`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/services/knowledge`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同；系统搜索由 Host 作为端口传入，不 import 搜索包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 每次读取都向所属插件的对象读取器读，带调用者的授权（`retainActionAuthority`）；所属插件的拒绝保留它自己的错误码，不改写成别的。
  - 只读调用者自己项目里的资料；没有项目的调用者被拒绝（`knowledge.scope`），查找结果里不带个人或别的项目的内容。
  - 卡片只有标题、来源和命中附近不超过 160 字的一小段，不当作原文；原文只经 `knowledge.read` 返回，并标明 `layer: "original"` 和实际读到的版本。
  - 逐行查找只认字面文字，不接受正则，一次最多 20 份资料，每行最多 400 字。
  - 不保存任何正文或读取结果。
- 后台整理逐份读取当前来源和排除状态；项目删除先取消整理，再由存储清除记录，晚到目录和模型结果不写回。同轮 read/grep 在授权复核后同步分配额度并保存回执，拒绝的调用不花额度。交错回归见 `tests/knowledge-cards.test.ts`、`tests/knowledge-reads.test.ts`、`tests/security-invariants-knowledge-lifecycle.test.ts`。
- 改动后必跑：`node scripts/run-tests.mjs tests/knowledge-service.test.ts tests/security-invariants-knowledge.test.ts`
- 相关手册：[specs/archive/project-knowledge/spec.md](../../specs/archive/project-knowledge/spec.md)、[docs/horizontal/knowledge.md](../../docs/horizontal/knowledge.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

通用来源保留：卡片继续保存原摘要、人工编辑和正文版本，不持久化第二份归档状态。管理页、检索、目录、计数和正文读取都经当前 owner 状态查询；当前不可用时隐藏并保留，同项目/对象/提供方/可信安装代明确删除后才清卡及 FTS。换代不能给旧卡改绑。

恢复操作在原卡上消费一次：同正文的 ready/failed/over_quota 保留，pending 与第一次见到的恢复内容变为 listed，不自动整理。旧卡 R1 落后于归档和恢复的 R2 时，清除旧机器派生内容、保留人工编辑并设为 listed。有实际正文的 listed 卡可由用户明确整理；summary 来源仍不能整理。已消费操作不会把后续明确整理重新压回 listed，恢复后的正文变化可重新 pending。Knowledge 严格存储 baseline 2，不迁移旧卡格式。

资料管理的 `knowledge.cards`、`knowledge.card.edit`、`knowledge.card.exclude` 返回合同含保留绑定与可整理状态，现版本为 v2；固定旧 v1 的引用不再解析，不保留同版本兼容壳。普通 Agent 读取合同不把这些管理字段交给模型。

整理沿现有模型派出检查复核原授权、安装代、正文版本和 active 状态；已派出的结果在归档后仅可结算到仍匹配且未经人工修改的原卡。这个结果不会触发第二次模型请求。

后台逐项核对在每份资料和剩余卡片前让出一次 I/O 轮次，避免连续权限查询阻塞 HTTP。每次等待后先检查关闭与项目移除；卡片相对本轮观察或来源查询前发生任何变化，就放弃该项旧结果，保留人工编辑、新卡和当前来源修订。最后读取、比较及写入同步完成；不缓存目录或权限，不改变后台触发时间和整理规则。交错与公平性回归见 `tests/knowledge-reconcile-fairness.test.ts`。
