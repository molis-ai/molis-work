# T353-B 当前普通同步：独立加强二审

负责人：Codex二审线1，gpt-6.1-sol。依据为accepted T-353 WO、根的准确gate/registry/B预算窗口及本目录PLAN。

**最终本地结论：【二审 T-353 PR-B】@`2de956e7ac3b4ad1ef7df936b2e48b5b5ee72d09` 本地增量二审可合，无Blocker/P1或必须返工项。作者最终报告/清理及独立复核实质证据已核收；不签新CI/Full或采用。发布前fresh secrets、同头Verify/适用SI与B自己的成功Full仍由根结算，C继续WAIT B实际采用。**

## 准确绑定与实际差异

- 旧B=`81955aa9303011ec0f38ecbdf2b507fc23824fe2`；M=`6729a2d4655caa603daa369f99884e09c4726bde`。
- 新H=`2de956e7ac3b4ad1ef7df936b2e48b5b5ee72d09`，tree=`c532693846cc5ceba57bcfcdcbdd826f95689650`，双亲依次旧B、M。直接回读作者树HEAD及origin/main相符，status为空。
- 本线从Git独立重算：旧B相对其base `edb257e0…`与M→H均为相同30路径；剔除资源gate/账本后，28个路径的完整tree条目与旧B逐项一致，含workflow旧bounded-cut的相同删除状态。不是把28项全部称为纯消费者文件。M其它改动在新树保留，没有混入未采用T384/T146候选。

实际唯一内容冲突为许可表。M→H的gate差异只删除Images历史额度/注释，添加根批准的Jelly `[76866,76899]`；旧Coding许可没有带回，form/workbench也没有恢复。独立比较门禁文本：完整许可说明/表区域之外与M逐字相同，算法、APPROVED_NEW_ASSETS、merge-base及增长/缺失/变小拒绝逻辑未改。预算JSON相对M唯一一行Jelly76,866→76,899，其余47条不动；不能把清旧许可导致的完整patch-id不等写成业务补丁不等或机械要求重跑旧矩阵。

## 跨层依赖与沿用范围

SDK/contracts整包从旧B→H没有diff。kernel的`action-settlement`直接取SDK `/whole-units`，`contextual`经kernel一行转出取同一入口；SDK package仅依赖contracts，子入口指向正确dist。helper的四个导出保持，独立源码检查无import/动态import/require/转出依赖。knowledge的package、lock importer与workspace registry三处SDK声明一致；没有倒置到SDK依赖kernel或复制另一份实现。

作者列出的27个具名helper/声明/依赖/测试输入，本线逐项以Git重核均同旧B，包括K/P生产接缝所对应原用例、SDK subpath与Alchemist两文件。这只证明已列范围，未说整个main运行依赖不变；实际新组合仍需自己的CI/Full。

旧独立238/238及K/P负控继续归准确`8a926168…`和原执行者；作者33文件508、旧B81955两完整Alchemist6/6各保原来源。K首次TS6133未执行不算有效红；有效K/P分别只在RAC-2701/RAC-1971原断言红且恢复绿的区分力可在未变输入范围继承。不重评未变K1–K5或重跑旧33/14矩阵。合法UTF-16/code point限额、错误及已接受非法串/lingguang request_id差异、PDF零余量限制均保留，不追加grapheme或任意参数等价保证。

## 已读作者本轮原件

本节是核作者原件，**本二审没有执行构建、测试或门禁**。

| 原件 | 已核结果与限定 |
| --- | --- |
| `raw/build-result.json`及安装/build日志 | 准确H/tree、整体build exit0；source_digest `6eb53b614e790842bbf9d94d12d169b9573f3e4a5b28354b45cb5a2bd6d46452`，构建manifest与实际输入摘要匹配 |
| 三完整gate文件原始日志 | page-assets-budget171/171、health-gates-lint69/69、health-gates-spec-coverage67/67，共307/307，jobs1/retries0，无skip/fail/cancel；执行绑定H/tree正确 |
| `raw/gates-summary.json`与对应日志 | boundary、准确M的health、test-imports、diff、page-assets均exit0；固定M的secrets222行仅属本地预检查，不能替代根推前fresh fetch后的扫描 |
| `candidate-assets.json`与capture代码/日志 | 在准确clean H、匹配digest上调用生产`serveWorkbenchAsset`得到48个200响应体；不是裸client stat或新网络HTTP/视觉实操 |

基线复用来自T146准确M的真实独立base检出/build/capture，经T385/T387保全转交；已读来源记录、detached M创建日志及base捕获，不能把T146候选样式结果当main。直接解析其48项原capture与本次H capture：集合相同，**47项字节数及SHA-256相同**，唯一Jelly从76,866→76,899（+33 B）。总数M7,469,195→H7,469,228 B，与两份Git预算和gate结果一致，许可精确命中；无新资源。这里复算的是原始capture数据，未在本线重测资源，也未拿未采用T384的7,469,519 B作基线。

作者控制比较曾因只剔除旧说明、未剔除新Jelly说明而拒绝相等，后更正为完整许可区比较；本线已用真实diff及区外文本核清。它是比较器范围的恢复，不是产品首败或新的门禁放宽，原记录保留。

## 收口状态与最终边界

1. 作者最终REPORT、cleanup及FINAL-STATE已齐。重新回读HEAD/tree/M及clean状态准确；source_digest仍为前述6eb53b61…，没有收尾期间新增代码或运行。清理原件记录参数/cwd匹配为空、runtime无开放文件、无本任务slot holder、未停止他人进程，九个指定临时目录已移除；本线另外只读确认九路径均不存在。保留干净作者树、依赖及匹配产物，writer窗口已交回。旧“执行中”占位不再是待项。
2. 已全文读 `/private/tmp/t353b-current-verify/REPORT.md` 及独立Git/构建摘要/资源/日志复算原件；又回读其最新终结版，现已明确“独立只读增量终核通过”，作者最终REPORT/cleanup/FINAL-STATE已由该线独立补核，无本范围Blocker/P1。它独立重算源码fingerprint为6eb53b61…，与H源码、manifest、build/gates/gate-tests及capture相符；307/307来自独立解析**作者**原始完整日志，不是新独立动态执行。两线均不改署作者来源。本轮“一审线2”承担的是独立验证，不虚构甲档FIRST，也不由本二审代改其报告或发布签名。
3. 根另结推前fresh secrets、最终H普通Verify/适用SI与B自己的Full。旧头CI41237845572成功不倒签到H；无本线GH操作。

旧Full `41233823797`保持失败：事件`8a926168…`、实际checkout`0ddf16ee079cd2398709f8765b7fef0460f10588`、tree`baef23ba47c4c6a2c1a75a63e1e9390d0a57129d`；6 shard success、1 failure、9 cancelled，Alchemist首跑/retry均失败，失败shard其余98文件未跑或停止。分项诊断不足，T366是否唯一根因仍UNKNOWN；不能因已含T366、局部6/6或别线Full而改绿。最终新Full需覆盖该完整文件及其余适用范围，仍由根核实际checkout/tree和结果。

C继续WAIT B实际采用；不提前retarget、合C或更新其任务归属。本地审验不等于真实Home、最终产品或用户验收。本轮仅写本REPORT，无源码/索引/refs/GH/共享协调写入，无build/test/browser/模型或Full操作。

## 终签

**【二审 T-353 PR-B】@`2de956e7ac3b4ad1ef7df936b2e48b5b5ee72d09` 可合（本地增量二审通过，仓库合入仍待§8）。** tree=`c532693846cc5ceba57bcfcdcbdd826f95689650`，双亲为旧B81955、准确M6729；本线最终回读不变。

本次加强核对落在真实新差异：保main的30路径合成、28个未变非资源结果、kernel→SDK→contracts与knowledge三处依赖一致、gate许可区外算法逐字不变、Jelly准确+33B及其余47资源字节/hash同M、匹配整体build和三完整gate文件307/307、实际隔离/清理。未发现应追加业务修复或重跑旧33/14矩阵的差异。旧238/508、K/P及Alchemist6/6均保原头与执行者；旧Full失败、取消/未跑与T366因果UNKNOWN保持。

根仍须在实际发布头上完成fresh-fetch后的secrets、Verify、适用SI、新B自身Full及checkout/tree核验，之后才按§8采用并回读main。根告知的新Full调度暂停属于根的排程，不改变本地二审结论，也不产生B Full豁免。本线没有触发/重跑/取消CI或作新的全量结论。

— Codex二审线1，gpt-6.1-sol。终签仅核已齐最后原件，无新增动态运行或产品/GH/refs写入。
