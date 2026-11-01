# PG045 只读接续结论

负责人：Codex 起草线；候选/WAIT，不占号。核定已采用 main `3fd857792a27352030ac8f3544a3b57d418febc1`。[旧候选书](CANDIDATE.md)及其窄审修订已充分覆盖最小后继，无须另写整书。

现行 accepted 依据是 privileges PG045 行及 pg046 slice §2.2 的 T120 补充：三类集成统一取钥等 T066 后另片。当前 `builtin-integrations.ts` 给 GitHub/Gmail 传 credential_ref；前者直读 SecretStore，后者自解 OAuth；Catalog 已走 `resolveApiConnection`，但工厂仍须传真实 Home。真实缺口仍是四个 Host 适配器/清单加 GitHub provider 的异步取钥端口，沿既有 Home＋connectionId＋本次 control，保协议/结果和可信预览注入，不新增服务。

T066 是有明确出处的最终 OAuth 合同前置；T065 是其父片/通用 OAuth 底座，随最终采用重核，不能提前当 main。T121 不构成全局合同前置：main 已有 per_record→connector.pull→registry→Feed提交；其账号界面、resolver旧出口删除和测试差分按 owner 交接后合成，不要求整片先采用。

本轮22个 open PR 文件核锁：四Host文件、GitHub provider及主要单测无交集；resolver被#1669/#1672/#1677占用，旧书只读复用；GitHub index/README被#1672占用，Feed运行测试被#1677/#1663占用，共享文档另串行。无交集不代表已授writer，派单时再核实时头与未提交认领。

Alchemist GitHub pulse已用resolver，按BL376绕过；Images取钥属Host生图服务/PG102，均不扩入本片。旧书真实Feed提交、撤权/改绑晚到零写入验收保留，按最终输入及有效证据定增量；尚无新增产品决定或资源需求。本轮未实施或构建。


## 2026-11-01 11:55Z 统筹执行窗口：T396

用户已要求增加未出PR及特权清理并行线。原CANDIDATE已审合同不变，正式分配T396、甲档/full=true，四项验收对应RAC2861～2864。负责人：Codex辅助开发线pg045_unified_keys（本轮实施；原工程稿owner保留）。T065/T066父条件调整为：等待T395合成源码准确冻结后，独立树普通合该准确父即可实施；发布与实际采用仍在T395之后。不得消费未冻结WIP或自己解除真实共享锁。

允许原四Host工厂/适配器、GitHub provider与确需的类型出口、原具名测试；resolver/OAuth/registry实现只读复用。对T402的Feed manifest/plugin/query-actions/ui不写；feed-runtime-plugin测试仅新增本片生产connector持久化正反例、保T402自有段，最终根串行合两段。T395的GitHub index/README与SI以冻结头为准，只改本片所需出口/行。完整四项必须一起交，不为并行拆成三个提供方小PR；旧有效父证据沿用，必要真实交错与零写入验收保留，不重新铺矩阵。当前可先核现行工厂及写独立适配器草稿；父未冻结不修改生产源码。

2026-11-01 12:02Z：T395源码父已准确冻结为a5d425e5f11df62a5ac62829d60d005b65234ad7，正式交实施。用户模型纠正后由Sol6.1Max子代理t396_sol接续已有五文件WIP，保原代码/验收与作者职责；未改resolver，T068来源MCP窗口互不写四工厂。
