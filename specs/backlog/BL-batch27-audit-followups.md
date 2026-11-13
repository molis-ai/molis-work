# BL-batch27-audit-followups

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-batch27-audit-followups | 第 27 批合后独立审计留下的工程观察项：① BL-131 原条的判断 POST 后整舞台约 1.6～2.5 秒 CPU（这次只关了重复读取）；② BL-096 作者一半仍取外部 `sourceName`，没有清洗/回归（标签与旧数据一半已关）；③ BL-091/103 之外，平台自己渲染的文字（步骤行、回执）是否还露内部标识没有排查；④ B27SRC-05 的 Coding 真实 Host 半行/未闭合/回改/重开，B27SRC-07 长快照同条件性能（没有同名测试）；⑤ BFP-02/03 的 CPU/内存/堆/请求/错误分段；⑥ Jelly 真实用户规模、HTTP、页面耗时与峰值；⑦ B27-UN-05 的 1440/键盘/项目插件，B27-IMG-02/04 的真实 JPEG、峰值与撤权分组；⑧ 最终头 Full/C/只读复核与 `27.md` 数字回填；⑨ Full 03695 的 17 个红例（含 `feed-feedback`、`pages-find`、`todo-draft-recovery` 等待 triage）；⑩ `batch-27.json` 的 `reason`/`review` 文字仍写“没有新资源/合计 12,264”，与 `assets` 的 13,907 新资源不一致；adopted allowance 不能改，留到下一次页面资源许可时更正 | 第 27 批合后审计（2026-11-12），见 `27.md` 收尾检查与本次审计修复 | 明确后续做 | 这些是合入后独立审计发现的证据/验证缺口；已修的代码与记录（AGENTS 升级段例外、27.md 合入记录、VUX-33 助理 CR、goals golden、导航标签、文档矛盾）见本次修复提交 | 无 | 中 | 27 统筹（工程证据）；Full/C/本人验收另见 BL-batch27-acceptance |

## 子项与去处

子项与去处：

- **① Inbox 判断 POST/整舞台 CPU**：`batch27-feed-inbox-performance` 自写“留空闲机复测，不在本次改动”；BL-131 已删。补同条件 CPU/整舞台测量；放不进本批就重开一条 BL。E／Inbox、判断服务维护人。
- **② Feed 作者 `sourceName`**：标签与旧数据已关；作者值来自外部 provider，无清洗/回归。低优先级观察；若上游再给内部值，按缺陷另记。E／Feed。
- **③ 平台渲染文字的内部标识**：关闭 BL-091/103 时只按用户 10-16 的模型措辞决定；平台步骤行/回执未排查。抽查步骤行与回执；有内部标识就按缺陷修。A／助理、平台诊断。
- **④ B27SRC-05／B27SRC-07**：B27SRC-05 只在 `__ui/catalog` 用生产 painter 测，缺真实 Host 的半行/未闭合/闭合缩短/回改/重开；B27SRC-07 没有同名测试，只有 Node 解析微基准。05 交 56 的真实 Host 剩余项，07 补同条件浏览器反馈/可操作/完成、内存、请求；真实规模可并 56。E／Coding、56。
- **⑤ BFP-02/03**：用例名覆盖三项，实际只断言读取次数与提示顺序。补 CPU/内存/堆/HTTP 响应分段/错误统计；改前基线可复跑。E／Inbox、56。
- **⑥ Jelly 真实规模**：只有合成库数字；临时测量目录已删。补测量脚本/日志，或明确只作合成证据；真实规模写进 56。E／Jelly、56。
- **⑦ B27-UN-05/B27-IMG-02/04**：1440/键盘/项目插件、真实 JPEG/峰值/撤权分组未做。补验收证据后再请本人验收。27 统筹、D 轨。
- **⑧ Full/C/只读复核与数字**：Full 在 `03695` 红、最终头未复跑；C/只读不在最终头；27.md 已补合入记录。最终头重跑 Full、C/只读复核；数字已回填。统筹、C 轨、评审台。
- **⑨ Full 03695 的 17 个红例**：`project-settings-navigation`（旧标签）和 `goals-page-golden`（golden）已由 main #2017 修，本分支不再改；`409b` 的 4 个文件（ui-text-page/workbench-language/assistant-island/plugin-permissions-http）要复跑；仍需 triage 的 27 相关红例至少 `feed-feedback`、`pages-find`、`todo-draft-recovery`、`project-management-navigation`、`code-scale`、`ppt-client-bundle`、`remaining-forms-viewport`、`assistant-context-strip`、`style-has-scope`。最终头重跑 Full。统筹、E 轨。
- **⑩ `batch-27.json` 文字不一致**：`reason`/`review` 写“没有新资源、合计 12,264”，但 `assets` 含 13,907 的新资源；`page-assets` 门禁明确禁止改已采用的 allowance，所以本 PR 不碰该文件，留到下一次页面资源许可时更正。统筹、页面资源主人。
