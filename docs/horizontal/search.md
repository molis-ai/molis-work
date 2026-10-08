# Search

**白话：** 在当前项目与个人范围里找到插件里的真实内容，并告诉调用者去哪里打开；它不理解内容是什么意思，也不决定谁能读。

**类别：** 平台产品服务（[系统架构 §3](../system/ARCHITECTURE.md)）。哪些来源进索引、查询只返回调用者能用的来源、打开前怎样核对，是跨插件的产品策略，放在这里；但搜索不拥有任何插件的业务事实，对象是否存在、正文是什么总向所有者读。位置暂不变动，仍在 `horizontal/search`。

**提供：** 搜索来源发现（动作目录里按输入输出类型识别：索引来源是 `molis.search.entries.window.v1` 与 `molis.search.entries.page.v1`；按需查询的来源 `molis.search.query.request.v1` 与 `molis.search.query.hits.v1` 在产品里没有生产方，已定删除，见决定 19 与 [CALL-CHAINS §7](../system/CALL-CHAINS.md)）、可重建的本地全文索引（中日韩单字与双字、拉丁词前缀）、按集合版本与条目版本的增量同步、失败保留与重试、停用与卸载清理、按调用者权限过滤的查询、打开前的对象核对。系统动作 `search.query`、`search.open`、`search.status`、`search.rebuild`（提供方 `system.search`）。

**技术状态：** `{home}/search/search.db`：来源的集合版本、同步时间与错误；每个条目的版本、标题、允许持久化的摘要与正文、打开位置。全部可以删除后从各插件重建。

**不拥有：** 插件的表与业务规则、对象正文的解释（归各插件的对象读取器）、权限授予（归动作服务与各入口的授权）、可信身份、会话与助理交互。

**当前来源与 Goal：** `horizontal/search`，索引适配 `packages/storage` 的 `openTextSearchIndex`，Host 装配 `apps/local-host/src/search-actions.ts`。见 `specs/archive/system-search/spec.md`。
