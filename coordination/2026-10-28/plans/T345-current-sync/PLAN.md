# T345 #1663 最小同步准备｜开发线3

状态：只读准备完成，未merge/改作者树/分支/refs，未build/test/push/GH写。T362资源窗仍优先等根交最终M；此文不构成T345实施授权。

绑定H=`ec0cc0a8ac1c6320c39e660395e3d6fcf10defd9`，M=`8a46c2cb7c596ffec0241dcfcfcfb3cf7552f987`，B=`717d14f2ab8c9cb1b447003fabb120a70b6d9dd3`。本轮ls-remote核远端task/T345-b=H、main=M；未fetch。自有树实际为`/private/tmp/t345-minimal-sync/wt`、task/T345-b，当前干净；主检出也干净。

隔离临时GIT_OBJECT_DIRECTORY加只读alternates执行merge-tree（临时objects已删除）：exit0，无冲突；预测tree=`2a2097fc710053a5b838cbaeabddd0a99823d5f1`。此tree仅模拟，不是已实施候选。B→H与M→模拟树的完整binary diff逐字节相同，七路径无新增或丢失；binding.json、merge-tree.txt、old-scoped.diff、simulated-scoped.diff为原件。

| 自有路径 | H/模拟树共同blob | 结论 |
| --- | --- | --- |
| `plugins/native/feed/src/content-ledger.ts` | `dc95d811e204c1543e5344a4a589a5a737dadef5` | 同 blob |
| `plugins/native/feed/src/home-plugin.ts` | `4350b805fec3b1e6c8c045fc3e6a6bef2e24dd5b` | 同 blob |
| `plugins/native/feed/src/source-history.ts` | `49f82fc7b0683b7bb4efa6c9779c6539a5e5b101` | 同 blob |
| `specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md` | `7b0e06c04ba1fba876f3815309e3c74a8d8e39b7` | 同 blob |
| `tests/feed-content-ledger.test.ts` | `b7fa308d8ce4857ccd66d4a9c7ffc531f9430a37` | 同 blob |
| `tests/feed-runtime-plugin.test.ts` | `600fe0d5bbad0bb090799137ee30b99580f2f8c1` | 同 blob |
| `tests/fixtures/feed-content-home-v1.sql` | `0ec8c4e97a43f48c3edec08a460311b41c90a79b` | 同 blob |

关键依赖只核真实台账调用链：

- home-plugin从context.services.database取得Home库、transaction(beforeEffect,body)写，evidenceCollector只回收无引用正文；content-ledger-actions的hold/release/reclaim@1保持plugin受众、feed:write及回收权限，holderOf从可信calling_plugin_id/project_id判身份，不接输入项目。此actions文件、manifest/permissions/registration与M前基点B同blob；Manifest仍从FEED_HOME_DATABASE声明Home v1库。
- 项目plugin.ts:123～128先holdContent，再经releaseHeldHistory连接Home reclaim/release和sourcePull.forget；source-history按批次先reclaim、最后release，complete只表搜索记录是否忘记，不能重加旧ledger等待标记。plugin.ts、application-ports.ts、projection.ts、contract/feed.ts、contract/sources.ts、index.ts及直接platform plugin/source-pull/events合同在B→M均同blob。逐项对象ID在binding.json；这是有限直接依赖核读，不冒称所有跨层依赖未变。
- B→M的Feed包增量仅out-rules.ts：platformErrorKind/forbidden调用拒绝传播加强，未触这七条patch路径或台账方法；模拟树保留M改动。T377三个客户端文件及两个测试也与M同blob，已逐项核。

若根随后正式派同步：fresh核H/最终M和唯一writer，正常merge，不rebase/force；重核七blob/patch及上述接缝，匹配整体build与必要health/boundary/secrets、served48资源实测。预计无自有资源增量，但当前未构建，**零delta尚未实测**；不改资源算法/许可，不抢T362或其它资源写窗。若最终M前进，按准确新M重算，不套用本预测tree。

沿用6548957766/6548958522/6548959990的FI-C-07文书、旧63映射及原头组合runtime54/54核收，保持各自原作者/头/来源。当前无新runtime调用链交集，不重演54/63/原M，不把可选actions测试建议升级必修；保持新建v1 Home前提与full=true，最终新头CI/SI/Full另由根安排。本轮没有动态通过或可合声明。
