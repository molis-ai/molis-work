# BL-batch27-audit-followups

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-batch27-audit-followups | 第 27 批合后独立审计留下的工程观察项：① BL-131 原条的判断 POST 后整舞台约 1.6～2.5 秒 CPU（这次只关了重复读取）；② BL-096 作者一半仍取外部 `sourceName`，没有清洗/回归（标签与旧数据一半已关）；③ BL-091/103 之外，平台自己渲染的文字（步骤行、回执）是否还露内部标识没有排查；④ B27SRC-05 的 Coding 真实 Host 半行/未闭合/回改/重开，B27SRC-07 长快照同条件性能（没有同名测试）；⑤ BFP-02/03 的 CPU/内存/堆/请求/错误分段；⑥ Jelly 真实用户规模、HTTP、页面耗时与峰值；⑦ B27-UN-05 的 1440/键盘/项目插件，B27-IMG-02/04 的真实 JPEG、峰值与撤权分组；⑧ 最终头 Full/C/只读复核与 `27.md` 数字回填；⑨ Full 03695 的 17 个红例（含 `feed-feedback`、`pages-find`、`todo-draft-recovery` 等待 triage）；⑩ `batch-27.json` 的 `reason`/`review` 文字仍写“没有新资源/合计 12,264”，与 `assets` 的 13,907 新资源不一致；adopted allowance 不能改，留到下一次页面资源许可时更正 | 第 27 批合后审计（2026-11-12），见 `27.md` 收尾检查与本次审计修复 | 明确后续做 | 这些是合入后独立审计发现的证据/验证缺口；已修的代码与记录（AGENTS 升级段例外、27.md 合入记录、VUX-33 助理 CR、goals golden、导航标签、文档矛盾）见本次修复提交 | 无 | 中 | 27 统筹（工程证据）；Full/C/本人验收另见 BL-batch27-acceptance |

2026-11-13 14／27 收口 PR 做了 ①③⑦ 的能做部分、核了 ⑧⑨，逐项去处见下。

## 子项与去处

- **① Inbox 判断 POST/整舞台 CPU**：已测并修一部分（2026-11-13）。改前每次更新约 29 万次同步读安装记录（5 次更新 145 万次），起因是每次授权与可用性检查都在目录遍历之外重读；现在一次同步检查算一次 directory pass（`assertCurrent`、`effectGuard`、注册表的 availability、场景读回调的检查、网页调用的授权建立），宿主的依赖解析一次检查共用一份目录。读安装记录降 79%，本机 p50 4.5→3.9 秒，CPU 节流 3 倍下用例通过（p50 6.2 秒）。剩下的大头是每条事项仍要好几次整目录 discover，转 [BL-inbox-update-blocks-host](BL-inbox-update-blocks-host.md)。
- **② Feed 作者 `sourceName`**：不变，低优先级观察；若上游再给内部值，按缺陷另记。E／Feed。
- **③ 平台渲染文字的内部标识**：已排查（2026-11-13，只读子代理 + 复核）。修了一处：步骤行没有对应词的步骤（运行时工具、MCP 工具、`model-switch`、`approval` 等）原样显示工具名，现在说「处理了一步」。余下三处要条件才出现，没改：读/改/建议的目标在动作标题表里查不到时退回能力 id（`assistant-present.ts`，卸载、撤权、模型拼错 id、标题表建好后才装的能力）；镜像审批失败时一行 `approval` 加效果 id（`prologue-run-store.ts`）；停止原因认不出时原样附在句后（`assistant-present.ts`）。输入回执的「记录」一栏列输入号、问题号、工具调用号是有意的出处记录，不算泄漏。前三条留助理面板，A／助理。
- **④ B27SRC-05／B27SRC-07**：不变，05 交 56 的真实 Host 剩余项，07 的同条件浏览器测量并 56。E／Coding、56。
- **⑤ BFP-02/03**：Inbox 一项补了读次数与节流对照（见 ①）；CPU/内存/堆/HTTP 分段统计仍没有。E／Inbox、56。
- **⑥ Jelly 真实规模**：不变，只作合成证据，真实规模写进 56。E／Jelly、56。
- **⑦ B27-UN-05/B27-IMG-02/04**：B27-UN-05 工程侧已补（见 BL-batch27-acceptance ⑥）。B27-IMG-02 补了真实 JPEG（1.5 MiB 非整段尾、2 MiB 与 PNG 同批），每批仍一次供应商请求，并记下 Host 进程峰值（本机同进程上限约多 191 MiB）；worker 峰值、最大报文的数字和 B27-IMG-04 撤项目许可/发布者的分组栅栏还没做（这几种撤销都经同一个 `beforeEffect`／controller）。27 统筹、D 轨。
- **⑧ Full/C/只读复核与数字**：27 的代码已在 main；main 上的全量（#2046 之后）只红在三条产品 BL 和 surface-cross-positions，其中与本批有关的只有 Inbox 一条（①）。公共合同台 C 对最终头的合审仍没做。统筹、C 轨。
- **⑨ Full 03695 的 17 个红例**：已由 #2046 逐个分清（测试一侧修好，产品缺陷记 BL-feed-wake-resets-page、BL-assistant-card-press-scrolls、BL-inbox-update-blocks-host），本条不再单独跟。
- **⑩ `batch-27.json` 文字不一致**：不变，留到下一次页面资源许可时更正。统筹、页面资源主人。
