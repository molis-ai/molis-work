# 系统搜索

在当前项目与个人范围里搜索已接入插件的真实内容：经共同动作目录发现各插件声明的搜索来源，按各自版本维护可重建的本地索引，并只把调用者当前能读取的来源交给调用者。它不读取任何插件的私有库，也不另建权限。

包名：`@molis-ai/molis-work-service-search`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

用户在工作台搜“预算”：Host 的 `search.query` 系统动作把调用者上下文交给 `SearchService.query`。服务用调用者自己的权限发现目录里的搜索来源（`molis.search.entries.v1`），对标记过变化或超过新鲜期的来源，以本机用户身份做增量同步（先比集合版本，再比每个条目的版本，只读变化的正文），在时间预算内查询索引，返回对象引用、摘要、命中位置与各来源状态。点击结果时 `search.open` 用原插件的对象读取器重新核对。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | `SearchService` 保留实例状态、生命周期与授权查询；同文件函数负责索引同步、正文读取、来源与状态投影 |
| [src/references.ts](src/references.ts) | 可引用的对象：`findReferenceCandidates`（`search.references` 动作，按种类在调用者的项目里找、每个都向对象主人重读）与 `confirmReferences`（宿主在带引用的回答交给运行之前逐个再读，安全不变量 S-26）。上下文条的落点取候选也走这一对 |

合同在 `@molis-ai/molis-work-contracts/services/search`（消费合同与索引端口）和 `@molis-ai/molis-work-contracts/platform/actions`（插件实现的搜索来源协议）。索引持久化由 `@molis-ai/molis-work-storage` 的 `openTextSearchIndex` 实现，Host 装配在 [apps/local-host/src/search-actions.ts](../../apps/local-host/src/search-actions.ts)。

## 接入与边界

插件只声明搜索来源动作与对象读取器即可接入，Host 与本服务都不改。索引是派生缓存：可删除重建，不作为任何业务事实。

工作区依赖：`@molis-ai/molis-work-contracts`。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-service-search typecheck
pnpm --filter @molis-ai/molis-work-service-search build
```

## 开发要求

- 负责：搜索来源发现、索引首次构建与增量比对、删除清理、失败与重启恢复、查询排序去重与聚合、按调用者权限过滤、打开前核对。
- 不负责：插件的存储与业务规则、对象正文的解释、权限的授予、可信身份的来源、会话与助理交互。
- 公开入口：`@molis-ai/molis-work-service-search`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/services/search`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同与同目录适配端口；不决定业务状态（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 只经动作目录调用插件声明的动作，不读取插件私有库；来源由协议声明发现，不维护名单。
  - 查询结果与摘要只来自调用者当前可用的来源；正文由读取器提供的种类还要求调用者能用该读取器。 等待索引之后、披露正文与定位信息之前，异步复核并同步尾检本次原 source/reader 授权；重新授权或新 reader 不救活旧请求（ACA005），个人空间仍核其原 owner 的 scope。
  - 建索引用 Host 提供的本机用户上下文，结果不随提问者变化；被停用的插件不在索引里留内容。
  - 一次同步失败不删除已有条目；删除只在完整列出之后发生。
  - 打开时对象读取器报任何错（已加密锁定、只有文件引用、暂时不可读，或插件自己抛的普通错误）都只说明“现在读不到”：随后一律再问来源自己的完整列出，列出里仍有就返回 `unavailable` 并保留索引条目，没有才返回 `missing` 并移出索引。读取器报错的错误码与措辞都不作判断依据。
  - 索引可以整个删掉重建，重建后结果与删前一致。
  - 可引用的候选与提交前的复核用同一次读取：调用者的权限、对象主人的读取器（`resolveActionSubject`），索引里的条目、页面或模型给的标题都不算数；只给调用者自己项目里的与 Home 范围的对象。
- 改动后必跑：`node scripts/run-tests.mjs tests/system-search.test.ts tests/search-references.test.ts tests/security-invariants-object-references.test.ts`
- 相关手册：[docs/horizontal/search.md](../../docs/horizontal/search.md)、[specs/archive/system-search/spec.md](../../specs/archive/system-search/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

声明 `subject-retention` 的来源在每次返回命中和打开结果时，按原项目、提供方、对象和可信安装代查询当前状态；归档与不可用都隐藏，只有同一代明确返回 `deleted` 才清索引。索引的 `revision` 仍是列表刷新版本；`content_revision` 保存正文读口给出的版本。`retention_json` 只绑定可信安装代，不缓存归档状态；缺少安装代不承接保留内容。正文版本与绑定字段落在 Search schema 3，可重建缓存不迁移旧格式。
