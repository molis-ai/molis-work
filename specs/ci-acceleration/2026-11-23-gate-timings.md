# 门禁自测的 60 个历史 PR 对照

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
