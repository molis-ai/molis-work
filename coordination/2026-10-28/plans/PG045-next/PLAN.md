# PG045 只读接续结论

负责人：Codex 起草线；候选/WAIT，不占号。核定已采用 main `3fd857792a27352030ac8f3544a3b57d418febc1`。[旧候选书](CANDIDATE.md)及其窄审修订已充分覆盖最小后继，无须另写整书。

现行 accepted 依据是 privileges PG045 行及 pg046 slice §2.2 的 T120 补充：三类集成统一取钥等 T066 后另片。当前 `builtin-integrations.ts` 给 GitHub/Gmail 传 credential_ref；前者直读 SecretStore，后者自解 OAuth；Catalog 已走 `resolveApiConnection`，但工厂仍须传真实 Home。真实缺口仍是四个 Host 适配器/清单加 GitHub provider 的异步取钥端口，沿既有 Home＋connectionId＋本次 control，保协议/结果和可信预览注入，不新增服务。

T066 是有明确出处的最终 OAuth 合同前置；T065 是其父片/通用 OAuth 底座，随最终采用重核，不能提前当 main。T121 不构成全局合同前置：main 已有 per_record→connector.pull→registry→Feed提交；其账号界面、resolver旧出口删除和测试差分按 owner 交接后合成，不要求整片先采用。

本轮22个 open PR 文件核锁：四Host文件、GitHub provider及主要单测无交集；resolver被#1669/#1672/#1677占用，旧书只读复用；GitHub index/README被#1672占用，Feed运行测试被#1677/#1663占用，共享文档另串行。无交集不代表已授writer，派单时再核实时头与未提交认领。

Alchemist GitHub pulse已用resolver，按BL376绕过；Images取钥属Host生图服务/PG102，均不扩入本片。旧书真实Feed提交、撤权/改绑晚到零写入验收保留，按最终输入及有效证据定增量；尚无新增产品决定或资源需求。本轮未实施或构建。
