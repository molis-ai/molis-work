# 系统搜索

在当前项目与个人范围里搜索已接入插件的真实内容：经共同动作目录发现各插件声明的搜索来源，按各自版本维护可重建的本地索引，并只把调用者当前能读取的来源交给调用者。它不读取任何插件的私有库，也不另建权限。

包名：`@molis-ai/molis-work-service-search`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

用户在工作台搜“预算”：Host 的 `search.query` 系统动作把调用者上下文交给 `SearchService.query`。服务用调用者自己的权限发现目录里的搜索来源（`molis.search.entries.v1`），对标记过变化或超过新鲜期的来源，以本机用户身份做增量同步（先比集合版本，再比每个条目的版本，只读变化的正文），在时间预算内查询索引，返回对象引用、摘要、命中位置与各来源状态。点击结果时 `search.open` 用原插件的对象读取器重新核对。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | `SearchService`：来源发现、同步、失败恢复、查询聚合、打开核对 |

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
  - 查询结果与摘要只来自调用者当前可用的来源；正文由读取器提供的种类还要求调用者能用该读取器。
  - 建索引用 Host 提供的本机用户上下文，结果不随提问者变化；被停用的插件不在索引里留内容。
  - 一次同步失败不删除已有条目；删除只在完整列出之后发生。
  - 索引可以整个删掉重建，重建后结果与删前一致。
- 改动后必跑：`node scripts/run-tests.mjs tests/system-search.test.ts`
- 相关手册：[docs/horizontal/search.md](../../docs/horizontal/search.md)、[specs/system-search/spec.md](../../specs/system-search/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/services/search`
- Migration Goals: `goal-reorg-f2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
