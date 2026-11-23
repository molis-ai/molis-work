# 门禁自测的 60 个历史 PR 对照

## 采用前的真实 PR 等待

以 11 月 23 日 14:25 北京时间为截止点，按每个 PR 最终源提交第一次触发主 CI 的时间倒序取样，先分组再读取 Verify 耗时。283 个有最终 head 运行的 PR 中，174 个命中共享核心、装配、存储、跨包等全量条件或是集成批次，13 个另外在最终 head 触发了 PR Full，43 个只改文档或设计资料，3 个只改基础设施；其余连续 50 个普通代码 PR 构成对照组。未合入的 PR 同样按实际文件或源提交分类。改动范围按当时的代码路径和仓库的 affected-tests 规则回放，判断与测试耗时无关。

这 50 个 PR 的最终 head 均有成功的 Verify，5 个用到了第二次尝试。中位为 **16 分 40 秒**，P90 为 **35 分 54 秒**。达到 40% 降幅须将同口径中位降到 **10 分钟或更短**，并降低 P90。首次 CI 创建和首次 Verify 成功完成之间的等待全部计入，每个 PR 只占一票。P90 取排序后的第 45 个。上线后取同样范围的前 50 个，列出仍在等或持续失败的 PR，并检查样本构成、同时运行的 Full 和队列负载。覆盖 11 月上中旬不同配置的这组长期数据，另按相近配置和负载复核。[逐个 PR 的最终提交、运行链接和起止时间](2026-11-23-pr-wait-before.csv)

## 同一提交的安全与重试

同期另取截止点前连续 30 个高风险或额外触发 Full 的 PR。13 个在源提交记录里等齐了 Verify 和成功的 PR Full，从首次 CI 到两项都成功的中位为 65 分 02 秒，P90 为 98 分 15 秒。另有 7 个有 PR Full 运行但没有成功记录，10 个未找到同一 head 的 PR 事件 Full。手动运行和按已知主线红灯获准的情况需要另行核对。最近 30 次合并组合中，26 次 Verify 通过、4 次失败，从组合工作流创建到通过的 26 次中位为 28 分 41 秒，P90 为 39 分 06 秒。

入队时刻另从各 PR 的 GitHub 时间线取得。同一组 30 次组合检查涉及 25 个 PR，按每个组合检查前最近一次实际入队到 Verify 成功计算，26 次成功组合的中位为 29 分 21 秒，P90 为 52 分 04 秒。队列重建可能让同一个 PR 有多条组合记录。

采用后固定取样顺序。持续失败、关闭而未通过、仍在排队的 PR 均占原来的样本位置。达标判断把尚未取得 Verify 成功的等待暂按无穷长计入排序；再报告已通过样本的实耗和未完成数。采用前后分别核对改动类型和负载。首个 runner 分到机器的等待在上述普通代码 PR 中位为 3 秒，P90 为 86 秒；同一个 PR 的下游作业还可能分别排队。

主 CI 在实际检出 `5da393adb3` 时通过，Full 在相同合并提交的升级登记测试失败。在隔离检出中离线构建同一提交，原运行器报出 Goals 存储的 UPG1-12 升级链断言；保留历史产品、构建和测试，只换成候选测试运行器并启用 PR Full 的排除项、分片、重试和遇错停止，首次和重试都在同一断言失败，进程返回 1。[主 CI](https://github.com/molis-ai/molis-work/actions/runs/44018178741) · [失败分片](https://github.com/molis-ai/molis-work/actions/runs/44020786315/job/133829513622)

GitHub 在部分重试中会给沿用的成功作业分配新的作业 ID 和轮次，保留实际起止时间及原构建产物。逐片核对一条三轮 Full，第二轮沿用了 12 片，第三轮沿用了 16 片，最终 24 片通过，共用首轮的构建产物。候选汇总脚本通过 GitHub 的作业及产物接口验过这条记录，也验过另一条保留构建、补完全部 24 片的记录。在第一条记录的本地副本中，移走某一片的证据，或把构建换成稍后重新执行的一次，汇总均拒绝旧结果。[三轮部分重试](https://github.com/molis-ai/molis-work/actions/runs/45159915790) · [保留首轮构建的重试](https://github.com/molis-ai/molis-work/actions/runs/45139628462)

三个已完成的安全全量各提供八个分片，用其中在三次都首遍稳定通过的 437 个文件估计权重，再在另三次独立运行的实测文件耗时上回放。最长安全分片预计分别为 369→331、377→335、340→353 秒。两次独立的 24 分片 Full 使用这份权重后，预计最长分片分别为 1,054→1,116、1,137→1,247 秒。保留原来的共享权重。以上回放只估计有稳定计时文件的片内调度，排队、安装和缺失计时未计入。[安全运行之一](https://github.com/molis-ai/molis-work/actions/runs/45071134756) · [Full 对照之一](https://github.com/molis-ai/molis-work/actions/runs/45116411116)

在同一台 Mac、Node 24.15.0 和单测试进程下，文档引用、merge-base、结构三份自测共 253 项。原样运行用时 476.6 秒，只启用当前作业的临时 Node 编译缓存为 338.1 秒。随后让文档和 merge-base 两份夹具直接恢复已实测的干净基线，完整门禁批次中三份文件的执行时间分别为 103.7、89.7、92.6 秒；每个变异仍调用实际门禁并检查拒绝。另五份安全回归在同机依次用时 121.4、116.1 秒（缓存关、开，各一次）。安全清单中有三个文件既被通配符选中、又被点名，去重前 459 项，去重后 456 项，不同文件的集合逐项相同。

## 历史改动选测

2026-11-23，北京时间。最近连续的 30 个 PR 中，修订后仍须运行全部自测的从 23 个减到 10 个。另取前六天的 30 个 PR 验证，只从 24 个减到 23 个。两组共 14 个 PR 减少了自测文件，45 个相同，1 个因为包依赖多选了一个文件。60 个 PR 的文件数中位数，两版都是 48。

## 采样和口径

- 最近一组选主线合并顺序连续的 30 个 PR，截至 `5bfd52b87b`，合并时间为 11 月 22 日 11:01 至 23 日 05:45。原先跑全套的 23 个中，12 个同时改了存储版本登记所在的 `CONTRACT-CHANGES.md`，有些还改了其他关键文件。
- 另一组在修改选择规则前确定。11 月 16 至 21 日，每天在主线第一父链上按合并时间排序，从当天首尾及中间等距位置取 5 个。每天可选的 PR 数依次是 13、7、18、28、20、24。两组的 PR 没有重叠。
- 每个 PR 单独检出其合并提交，用仓库现有的受影响测试索引比较它与第一父提交的差异。两版处理相同输入，计数包含成功构建后必跑的两个安全自测。只改普通文档时两个步骤都跳过。每个历史提交都能找到完整的 48 个自测。
- 本机计时固定用一个已构建的工作树、Node 24.15.0、pnpm 11.9.0 和一个测试进程。从工作流中启动固定安全自测与所选规则自测，到相应进程退出，累加两步的墙钟时间。历史提交提供变更输入，实际执行的是该固定工作树里的测试。

## 同机实际计时

上一版在 #2248 的完整 48 个自测上用了 18 分 04 秒。最初流程在同机运行相同 48 个文件用了 16 分 28 秒。下表每一行各执行一次。

| PR 与改动 | 上一版文件数 | 本次文件数 | 本次自测耗时 |
| --- | ---: | ---: | ---: |
| [#2248](https://github.com/molis-ai/molis-work/pull/2248) Skill 设置、宿主和合同快照 | 48 | 15 | 6 分 11 秒 |
| [#2242](https://github.com/molis-ai/molis-work/pull/2242) 设计 Skill 文档 | 48 | 3 | 3.2 秒 |
| [#2112](https://github.com/molis-ai/molis-work/pull/2112) 合入与版本登记文档 | 48 | 5 | 39.6 秒 |
| [#2187](https://github.com/molis-ai/molis-work/pull/2187) 跨模块修改，含 CI 工作流 | 48 | 48 | 18 分 11 秒 |

## 最近连续 30 个 PR 的 GitHub 记录

25 个 PR 在原有线上流程中执行了完整自测，自测步骤的中位用时为 14 分 17 秒。下面逐个给出当时成功运行中这几步的合计时间，以及 Gates 和其他成功前置作业谁最后结束。核对的是主 CI 的 Verify，另有独立的 Full 和视觉检查。4 个运行经过重试。

这次少跑文件的 13 个 PR 中，9 个当时最后等 Gates，另外 4 个分别等安全、产品或登录回归。例如 #2208 的产品分片比 Gates 晚 3 分 11 秒结束。其他作业的运行和排队时间相同时，单独缩短 Gates 对这次 Verify 的完成时间没有收益。新配置的 GitHub 端到端耗时仍待实际运行验证。

| PR | 原流程文件 | 上一版文件 | 本次文件 | 线上原自测 | 最后结束的前置作业 |
| --- | ---: | ---: | ---: | ---: | --- |
| [#2248](https://github.com/molis-ai/molis-work/pull/2248) | 48 | 48 | 15 | [14 分 17 秒](https://github.com/molis-ai/molis-work/actions/runs/45071134756/job/137359156495) | Gates 晚 15 分 10 秒 |
| [#2247](https://github.com/molis-ai/molis-work/pull/2247) | 48 | 48 | 48 | [14 分 27 秒](https://github.com/molis-ai/molis-work/actions/runs/45065993757/job/137343117966) | Gates 晚 16 分 11 秒 |
| [#2240](https://github.com/molis-ai/molis-work/pull/2240) | 48 | 48 | 25 | [19 分 17 秒](https://github.com/molis-ai/molis-work/actions/runs/45057418341/job/137335195048) | Gates 晚 51 分 30 秒 |
| [#2249](https://github.com/molis-ai/molis-work/pull/2249) | 48 | 8 | 8 | [14 分 49 秒](https://github.com/molis-ai/molis-work/actions/runs/45059107556/job/137322661193) | 安全回归 (5/8) 晚 2 分 13 秒 |
| [#2243](https://github.com/molis-ai/molis-work/pull/2243) | 48 | 48 | 48 | [11 分 51 秒](https://github.com/molis-ai/molis-work/actions/runs/45057407360/job/137317506102) | 安全回归 (8/8) 晚 10 分 57 秒 |
| [#2246](https://github.com/molis-ai/molis-work/pull/2246) | 0 | 0 | 0 | [跳过](https://github.com/molis-ai/molis-work/actions/runs/45057937758/job/137318081454) | Gates 晚 4 分 58 秒 |
| [#2244](https://github.com/molis-ai/molis-work/pull/2244) | 48 | 48 | 10 | [12 分 12 秒](https://github.com/molis-ai/molis-work/actions/runs/45055976701/job/137312095992) | Gates 晚 10 分 57 秒 |
| [#2230](https://github.com/molis-ai/molis-work/pull/2230) | 48 | 48 | 12 | [12 分 22 秒](https://github.com/molis-ai/molis-work/actions/runs/45055521544/job/137310896804) | Gates 晚 12 分 00 秒 |
| [#2231](https://github.com/molis-ai/molis-work/pull/2231) | 48 | 48 | 48 | [14 分 19 秒](https://github.com/molis-ai/molis-work/actions/runs/45038934394/job/137262539458) | Gates 晚 17 分 31 秒 |
| [#2242](https://github.com/molis-ai/molis-work/pull/2242) | 48 | 48 | 3 | [14 分 42 秒](https://github.com/molis-ai/molis-work/actions/runs/45048582763/job/137289570368) | Gates 晚 15 分 16 秒 |
| [#2233](https://github.com/molis-ai/molis-work/pull/2233) | 48 | 48 | 8 | [19 分 12 秒](https://github.com/molis-ai/molis-work/actions/runs/45046403881/job/137282898697) | Gates 晚 21 分 58 秒 |
| [#2241](https://github.com/molis-ai/molis-work/pull/2241) | 0 | 2 | 2 | [跳过](https://github.com/molis-ai/molis-work/actions/runs/45047518537/job/137286293136) | Gates 晚 7 分 56 秒 |
| [#2219](https://github.com/molis-ai/molis-work/pull/2219) | 48 | 48 | 48 | [11 分 17 秒](https://github.com/molis-ai/molis-work/actions/runs/45046272255/job/137282421127) | Gates 晚 9 分 25 秒 |
| [#2235](https://github.com/molis-ai/molis-work/pull/2235) | 48 | 48 | 48 | [14 分 17 秒](https://github.com/molis-ai/molis-work/actions/runs/45037497046/job/137255377565) | Gates 晚 15 分 23 秒 |
| [#2237](https://github.com/molis-ai/molis-work/pull/2237) | 48 | 8 | 8 | [11 分 32 秒](https://github.com/molis-ai/molis-work/actions/runs/45035646815/job/137249915840) | Gates 晚 4 分 58 秒 |
| [#2238](https://github.com/molis-ai/molis-work/pull/2238) | 48 | 48 | 17 | [19 分 37 秒](https://github.com/molis-ai/molis-work/actions/runs/45033905419/job/137244413718) | Gates 晚 15 分 37 秒 |
| [#2232](https://github.com/molis-ai/molis-work/pull/2232) | 48 | 48 | 16 | [13 分 46 秒](https://github.com/molis-ai/molis-work/actions/runs/45030437348/job/137235046989) | Gates 晚 7 分 50 秒 |
| [#2236](https://github.com/molis-ai/molis-work/pull/2236) | 0 | 2 | 2 | [跳过](https://github.com/molis-ai/molis-work/actions/runs/45025146015/job/137217602634) | Gates 晚 8 分 13 秒 |
| [#2229](https://github.com/molis-ai/molis-work/pull/2229) | 48 | 48 | 11 | [17 分 56 秒](https://github.com/molis-ai/molis-work/actions/runs/45022308532/job/137208973609) | Gates 晚 13 分 27 秒 |
| [#2234](https://github.com/molis-ai/molis-work/pull/2234) | 0 | 3 | 3 | [跳过](https://github.com/molis-ai/molis-work/actions/runs/45018954639/job/137198130444) | 安全回归 (5/8) 晚 55.0 秒 |
| [#2209](https://github.com/molis-ai/molis-work/pull/2209) | 48 | 48 | 48 | [12 分 16 秒](https://github.com/molis-ai/molis-work/actions/runs/45010796571/job/137179521215) | 产品回归 (2/6) 晚 7 分 46 秒 |
| [#2203](https://github.com/molis-ai/molis-work/pull/2203) | 48 | 48 | 48 | [18 分 19 秒](https://github.com/molis-ai/molis-work/actions/runs/44993475825/job/137120182391) | Gates 晚 14 分 42 秒 |
| [#2223](https://github.com/molis-ai/molis-work/pull/2223) | 48 | 48 | 21 | [17 分 12 秒](https://github.com/molis-ai/molis-work/actions/runs/44976872592/job/137070064673) | 安全回归 (8/8) 晚 2 分 20 秒 |
| [#2222](https://github.com/molis-ai/molis-work/pull/2222) | 48 | 48 | 48 | [11 分 18 秒](https://github.com/molis-ai/molis-work/actions/runs/44994119658/job/137123254895) | Gates 晚 5 分 14 秒 |
| [#2208](https://github.com/molis-ai/molis-work/pull/2208) | 48 | 48 | 5 | [16 分 01 秒](https://github.com/molis-ai/molis-work/actions/runs/44982419988/job/137087435225) | 产品回归 (5/6) 晚 3 分 11 秒 |
| [#2218](https://github.com/molis-ai/molis-work/pull/2218) | 48 | 48 | 14 | [16 分 01 秒](https://github.com/molis-ai/molis-work/actions/runs/44986648510/job/137106810328) | 登录回归 晚 2 分 51 秒 |
| [#2228](https://github.com/molis-ai/molis-work/pull/2228) | 48 | 48 | 14 | [12 分 18 秒](https://github.com/molis-ai/molis-work/actions/runs/44984618236/job/137104278240) | 登录回归 晚 7 分 16 秒 |
| [#2226](https://github.com/molis-ai/molis-work/pull/2226) | 48 | 48 | 48 | [11 分 50 秒](https://github.com/molis-ai/molis-work/actions/runs/44977616055/job/137072601678) | 安全回归 (3/8) 晚 7 分 14 秒 |
| [#2227](https://github.com/molis-ai/molis-work/pull/2227) | 0 | 2 | 2 | [跳过](https://github.com/molis-ai/molis-work/actions/runs/44981277492/job/137083036207) | Gates 晚 9 分 05 秒 |
| [#2221](https://github.com/molis-ai/molis-work/pull/2221) | 48 | 48 | 48 | [11 分 14 秒](https://github.com/molis-ai/molis-work/actions/runs/44974149498/job/137060913145) | Gates 晚 1 分 11 秒 |

## 前六天另外 30 个 PR

这组的 30 个 PR 中，1 个从 48 个文件减为 5 个。#2149 的包依赖让它从 10 个变成 11 个。修改公共 CI、原生代码、安全规范或未映射输入的 PR 仍保留全部自测。下表直接列出合并差异，便于复核每个输入。

| 日期（北京时间） | PR | 上一版文件 | 本次文件 |
| --- | --- | ---: | ---: |
| 11-16 | [#2092](https://github.com/molis-ai/molis-work/pull/2092) | 48 | 48 |
| 11-16 | [#2096](https://github.com/molis-ai/molis-work/pull/2096) | 48 | 48 |
| 11-16 | [#2099](https://github.com/molis-ai/molis-work/pull/2099) | 48 | 48 |
| 11-16 | [#2102](https://github.com/molis-ai/molis-work/pull/2102) | 48 | 48 |
| 11-16 | [#2097](https://github.com/molis-ai/molis-work/pull/2097) | 48 | 48 |
| 11-17 | [#2106](https://github.com/molis-ai/molis-work/pull/2106) | 48 | 48 |
| 11-17 | [#2109](https://github.com/molis-ai/molis-work/pull/2109) | 48 | 48 |
| 11-17 | [#2105](https://github.com/molis-ai/molis-work/pull/2105) | 48 | 48 |
| 11-17 | [#2104](https://github.com/molis-ai/molis-work/pull/2104) | 48 | 48 |
| 11-17 | [#2112](https://github.com/molis-ai/molis-work/pull/2112) | 48 | 5 |
| 11-18 | [#2113](https://github.com/molis-ai/molis-work/pull/2113) | 48 | 48 |
| 11-18 | [#2115](https://github.com/molis-ai/molis-work/pull/2115) | 48 | 48 |
| 11-18 | [#2126](https://github.com/molis-ai/molis-work/pull/2126) | 0 | 0 |
| 11-18 | [#2128](https://github.com/molis-ai/molis-work/pull/2128) | 2 | 2 |
| 11-18 | [#2131](https://github.com/molis-ai/molis-work/pull/2131) | 48 | 48 |
| 11-19 | [#2132](https://github.com/molis-ai/molis-work/pull/2132) | 0 | 0 |
| 11-19 | [#2133](https://github.com/molis-ai/molis-work/pull/2133) | 48 | 48 |
| 11-19 | [#2149](https://github.com/molis-ai/molis-work/pull/2149) | 10 | 11 |
| 11-19 | [#2152](https://github.com/molis-ai/molis-work/pull/2152) | 48 | 48 |
| 11-19 | [#2163](https://github.com/molis-ai/molis-work/pull/2163) | 48 | 48 |
| 11-20 | [#2164](https://github.com/molis-ai/molis-work/pull/2164) | 48 | 48 |
| 11-20 | [#2157](https://github.com/molis-ai/molis-work/pull/2157) | 48 | 48 |
| 11-20 | [#2151](https://github.com/molis-ai/molis-work/pull/2151) | 48 | 48 |
| 11-20 | [#2174](https://github.com/molis-ai/molis-work/pull/2174) | 48 | 48 |
| 11-20 | [#2180](https://github.com/molis-ai/molis-work/pull/2180) | 2 | 2 |
| 11-21 | [#2181](https://github.com/molis-ai/molis-work/pull/2181) | 2 | 2 |
| 11-21 | [#2187](https://github.com/molis-ai/molis-work/pull/2187) | 48 | 48 |
| 11-21 | [#2192](https://github.com/molis-ai/molis-work/pull/2192) | 48 | 48 |
| 11-21 | [#2199](https://github.com/molis-ai/molis-work/pull/2199) | 48 | 48 |
| 11-21 | [#2183](https://github.com/molis-ai/molis-work/pull/2183) | 48 | 48 |

两组共 60 次按 PR 比较，除门禁自测的模式和文件清单外，选择器写给工作流的其余 13 个输出均一致，覆盖安全和产品的模式、分片和文件选择，以及登录、原生和升级回放的选择。
