# 项目资料

同步消费合同：可信 project-data / plugin-installation 来源在原文/状态读取前经 ActionClient.captureSources 一次捕获整批，最后同步核验后才返回正文、目录或写入整理结果。目录/定位/整理控制的可选 assertCurrent 交给模型最终发送点；未完成本次异步核验时拒绝。整理结算每次先新捕获再查状态，不用跨整个模型等待的旧 stamp 否决原合同允许的同内容归档结算。插件 guard 只补充观察精确注册、Runtime 当前状态/授权及公开命令标记；不代表同步重做 Catalog 授权，原异步 prepare/invoke/revalidation 仍负责该权限，后台或外部写入不在命令标记证明内。

Assistant 组合端口：catalog/tally 的 KnowledgeDispatchGuard 可携 sourceCapture={client,scopes}，只含本 guard 已选择的可信 project-data / plugin-installation 来源、原可信 reader context 和准确动作引用。它仅供 Node 内部在全部材料异步核验开始前合并一次总 captureSources；禁止序列化、落盘或传给模型，不授予权限，也不替代状态、版本与单项原卡检查。来源不在同一 Host/原注册不可解析时拒绝，不退回逐 guard 断言。组合尾检先运行总来源 guard，再逐项运行纯 assertCardsCurrent（原 provider/source key/retention 身份、排除状态及实际展示字段），最后不再调用外部授权；单项 assertCurrent 保持来源 guard → 纯原卡检查。纯检查不重新捕获、不授权、不以 null 身份证明连续性。整理的 control.assertCurrent 在来源/权限同步否决后复核原 pending 卡的归属、排除状态和人工字段；定位控制同样在总来源 guard 后纯核每份原卡与原分节笔记。最终网络等待期间的排除或编辑必须拒绝继续使用旧材料，不能仅凭原文未变放行；这不改变已派出请求的分类或额度记账。

系统资料本人关联合同：adoption/retention 使用判别 source_identity，Knowledge 私库 4；bind-preview/bind@2、cards/edit/exclude@4。系统 context 与 summary 均核原 owner 当前版本；未知身份完整保留，关联不自动整理。版本核对按本次 card/piece，不永久冻结 adoption.source_revision。

本人关联预览短合同：`knowledge.card.bind-preview@2` 只读同项目、同 subject 的当前目录候选，返回精确 provider/source key、可信来源身份与内容版本及安全展示字段；没有可用候选返回空数组，真实读取、取消或授权失败报错。预览不对账、不写卡、不调用模型。Host 的完整绑定/预览职责共享来源复核，限定候选 provider 后仍由原对象读取协议验证正文版本；同 provider 多读取器仍拒绝歧义。预览返回前复核原卡、目录与权限，真正 bind 仍重新校验全部前置条件。HTTP 为 `POST /api/knowledge/bind-preview` 与 `POST /api/knowledge/bind`；actor/project 只来自原认证调用上下文。相关回归为 `tests/legacy-memory-adoption.test.ts`、`tests/knowledge-http.test.ts`、`tests/knowledge-cards.test.ts`。

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

通用来源保留：卡片继续保存原摘要、人工编辑和正文版本，不持久化第二份归档状态。管理页、检索、目录、计数和正文读取都经当前 owner 状态查询；当前不可用时隐藏并保留，同项目/对象/提供方/可信来源身份明确删除后才清卡及 FTS。换代不能给旧卡改绑。

恢复操作在原卡上消费一次：已知同正文的 ready/failed/over_quota 保留，pending 与第一次见到的恢复内容变为 listed，不自动整理。旧卡 R1 落后于已知归档和恢复 R2 时，清除旧机器派生内容、保留人工编辑并设为 listed。未知归档版本则完整保留旧内容，listed 等本人整理。有实际正文的 listed 卡可由用户明确整理；summary 来源仍不能整理。已消费操作不会把后续明确整理重新压回 listed，已知恢复后的正文变化可重新 pending；未知版本与本人采用的 listed 保持手动整理。Knowledge 严格存储 baseline 4，生产不迁移旧卡格式。

资料管理的 `knowledge.cards`、`knowledge.card.edit`、`knowledge.card.exclude` 返回合同含保留绑定、本人采用事实与可整理状态，现版本为 v3；固定旧引用不再解析，不保留同版本兼容壳。普通 Agent 读取合同不把这些管理字段交给模型。

整理沿现有模型派出检查复核原授权、来源身份、正文版本和 active 状态；已派出的结果在归档后仅可结算到仍匹配且未经人工修改的原卡。这个结果不会触发第二次模型请求。

后台逐项核对在每份资料和剩余卡片前让出一次 I/O 轮次，避免连续权限查询阻塞 HTTP。每次等待后先检查关闭与项目移除；卡片相对本轮观察或来源查询前发生任何变化，就放弃该项旧结果，保留人工编辑、新卡和当前来源修订。最后读取、比较及写入同步完成；不缓存目录或权限，不改变后台触发时间和整理规则。交错与公平性回归见 `tests/knowledge-reconcile-fairness.test.ts`。

没有保留绑定的资料可由 Host 每轮准备一次本人上下文，再逐项同步查看当前注册声明。存在匹配的保留协议、项目已关闭或检查失败，都保留原卡；仅确实无协议时按普通资料规则处理。检查不采用旧目录、不读取正文、不调用协议、不补安装代，检查到写入间不等待。准备失败整轮不写，未接此能力仍走原逐项查询；带保留字段（包括空安装代）的卡和模型整理始终走原授权路径。

### 旧资料卡本人采用（2026-10-27，实施合同）

Knowledge 私库升 4，原 SQLite 表不变。限期 tests/fixtures/coding-knowledge-maintenance.mjs 将 1 的卡完整保留并标为未知身份，2/3 的真实插件代保真转为 plugin-installation，生产不升级旧库。未知绑定卡仅在本人管理入口显示；检索、Agent、自动整理拒绝。本人明确关联当前来源时，核真实 provider/source/subject/source_identity/revision，提交前复核当前权限及完整原卡。

原卡同事务保存目标与 adoption={operation_id,actor_id,source_revision,source_identity}，无新回执表或阶段。actor 取调用上下文，source_identity 取可信现目录；输入只是预期值。同 operation/actor/完整目标（含 source_identity）重放只读，换目标拒绝。有 retention 协议须同代；普通来源用 adoption.source_identity 守来源实例，不把 unavailable 降成 unsupported。关联后 listed，旧机器摘要原样供管理但不当当前摘要交给检索/Agent，人工字段保留，只能本人显式 organize，对账不能自动排队。

恢复 revision=null 同样零自动模型并保留旧卡/人工字段，以 listed 待手动整理，不借用 restoration_operation_id 表示采用。cards/edit/exclude@4、本人 bind@2；沿原 beforeEffect/同步尾检/Store 事务，取消、撤权、来源或原卡变化不写。UI 留主任务。验收涵盖真实 SQLite 重启重放、换代、拒绝、模型零调用及邻居保留。

资料批量资格消费（MEM-KNOWLEDGE-BATCH-01/02）：`visible` 先按原来源、权限和完整原卡准备资格，返回的谓词仅判断本次 membership，不逐卡重读整批。每个消费阶段必须在选择/生成结果后、返回或跨等待/副作用之前调用 `assertCurrent`；该尾检先运行原来源 guard，再比较全部原 shown 卡的完整 JSON，包含当前页与候选选择之外的卡。search/list/catalog/tally、管理列表沿原尾检；grep 的 cut 候选选择和管理修改首次选择后补尾检。修改仍在 beforeEffect 后重新取得 fresh 资格，未绑定卡的本人管理完整比较与 DispatchGuard 均不变。没有跨请求缓存，没有删减授权、归档、安装代或原卡检查。直接回归：`tests/knowledge-retention-policy.test.ts`、`tests/knowledge-system-source-capture.test.ts`。
