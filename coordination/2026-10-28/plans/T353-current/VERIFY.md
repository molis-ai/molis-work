# T353 PR-B 本轮独立增量终核（一审线2）

状态：**本轮独立只读增量终核通过，未发现本范围Blocker/P1；作者最终REPORT、cleanup与FINAL-STATE均已补核。** 本线只做只读独立复算与原件核验，没有build/test/GitHub/refs写入，不冒称独立动态运行。新H的CI、Full和实际采用不在本报告签认范围。

## 准确绑定与实际改动

- M：`6729a2d4655caa603daa369f99884e09c4726bde`；旧B H0：`81955aa9303011ec0f38ecbdf2b507fc23824fe2`。
- 候选N：`2de956e7ac3b4ad1ef7df936b2e48b5b5ee72d09`；tree：`c532693846cc5ceba57bcfcdcbdd826f95689650`。
- 本线Git对象复算parents恰为H0、M，merge-base(M,N)=M；相对M为原30路径、+79/−135。工作树只读观察HEAD=N、`git status --porcelain`为空。没有把作者H/路径清单当作独立证明。
- 28个非资源路径结果blob逐项同H0，含workflows旧`bounded-cut.ts`两边均删除。没有新增消费者源码、自有测试或依赖接口变动；M原变化保持。资源许可清理使整份补丁不再机械等同旧patch-id，属已授权冲突解法。
- 本线读取实际kernel action-settlement直取SDK，contextual经一行whole-units转出取相同SDK入口；SDK whole-units零import/require/转出依赖，公开四函数，SDK package仅依赖contracts。knowledge package/README/lock importer/registry一致。SDK/contracts整包H0→N无变化，另27份声明/helper/相关测试输入逐项同blob，旧14独立文件从原运行头8a926到N亦同blob。[独立Git与输入复算](independent-git.json)

## 冲突与资源

本线逐字比较N与M：page-assets gate的一次性许可区域以外完全相同，算法未改；limits/baseline/Biome配置同M。只留Jelly `[76866,76899]`；已消费Coding/Images许可及注释移除，未恢复旧form/workbench、未纳入未采用T384额度。预算JSON相对M仅Jelly变动，48项集合一致。

本线未运行capture；读取并核验作者真实serve捕获脚本/原命令、最终N匹配构建信息，以及T146准确M匹配参考树create/build/capture原件（经T385/T387保存，在作者`raw/M-resource-source/`）。该来源明确绑定M6729，不借T383旧产物。独立逐项重算结果：

| 项目 | 准确M | 候选N |
| --- | --- | --- |
| 实际捕获资源数 | 48 | 48 |
| 实际总字节 | 7,469,195 | 7,469,228 |
| Jelly JS | 76,866 | 76,899 |
| 其余47项 | 两侧字节及SHA256全部相同 | 无新资源 |

N捕获、page-assets原始JSON报告与两侧预算逐项一致；discoveryMisses=[]；准确M gate原件exit0。不是只比较预算总数后认定实测。M来源留存文件已逐一与原保存摘要核对；没有为已有有效M捕获重复构建。[独立48项复算](independent-assets.json)

## 作者本轮有效执行原件的独立核验

匹配整体build原件exit0、Node24.14.0/ABI137。作者`run.py`在执行前后核HEAD/clean，记录head/tree/lock与构建摘要；整体build命令及slot记录明确。本线另外按现行fingerprint算法**只读重算文件内容**，所得 `6eb53b614e790842bbf9d94d12d169b9573f3e4a5b28354b45cb5a2bd6d46452` 与当前源码、build manifest、build/gates/gate-tests结果及serve capture全部一致；未运行仓库生产代码或重新构建。[独立构建绑定核对](independent-build-binding.json)

独立解析作者完整`raw/gate-tests.log`的每文件入口及node:test尾部，不只采信其test-summary：

| 完整文件 | 通过 | fail/cancel/skip/todo |
| --- | --- | --- |
| `tests/page-assets-budget.test.ts` | 171/171 | 全0 |
| `tests/health-gates-lint.test.ts` | 69/69 | 全0 |
| `tests/health-gates-spec-coverage.test.ts` | 67/67 | 全0 |
| 合计 | **307/307** | 全0 |

公共`run-tests.mjs`，jobs1/retries0，无名称筛选，3/3完整文件且outer exit0；三文件M→N源码未改。上述是**作者在N上的动态执行、本线独立核原件**，不是本线重跑。[独立日志解析](independent-gate-log-audit.json)

boundary（63包errors=[]）、health对准确M、test-imports（1705进程无source/dist混用）、diff check、page-assets及capture原件exit0；无giant exception变更。冻结M的secrets原件为222行扫描、exit0。该secrets不是发布前fresh fetch后的最终证明，根推送前仍需按自己的发布流程执行，不在本轮虚报已完成。构建原有xterm默认导出warnings及SQLite实验提示保留，不称零告警；本次没有对应源码变更。

## 沿用边界与历史失败

- 旧8a926独立14完整文件238/238（12消费者212、knowledge15、Pages comments11），K截尾→slice仅RAC2701红、P最近线程方向→cutHead仅RAC1971红，恢复绿；初次TS6133不计有效红。对应生产改法及上述指定输入未变，沿用的是已核范围与断言区分力，不改署成N新运行。作者旧33文件508和H0两完整Alchemist6/6分别保原头/执行者，不重复矩阵。
- 源blob及指定输入相同不表示完整main运行树未变。既有UTF-16/code-point限额、合法文本等价与已接受非法串/灵光request_id差异、PDF零余量边界保持，不追加任意退化参数或grapheme保证。
- 旧Full **41233823797仍失败**：事件旧B8a926，实际checkout `0ddf16ee079cd2398709f8765b7fef0460f10588` / tree `baef23ba47c4c6a2c1a75a63e1e9390d0a57129d`；6 shard成功、1失败、9取消，失败shard有2文件通过、Alchemist首跑/retry失败、98未跑或停止。T366是否唯一根因仍UNKNOWN。[旧归因原件](/private/tmp/t353b-full-triage/REPORT.md)。当前包含T366、旧局部6/6或将来N Full成功均不倒填旧结果或根因。
- N自己的普通CI及full=true Full仍由根核准确头与实际checkout/tree、适用jobs；旧H0 CI41237845572 success不代N。最终Full须实际覆盖旧失败完整Alchemist文件，A/T366/其它载体Full不替代B。本报告不签CI/Full/main采用、真实Home、产品实操或用户验收；C仍等B实际采用。

## 最终报告与清理补核

先行终核时作者REPORT/cleanup尚未齐，本线保持未签；收到根明确通知后再读取最终三份原件，没有轮询或重复动态执行。现作者REPORT已标明本地增量完成及writer交回，cleanup在2026-11-01 04:45:16Z记录进程参数/cwd无残留、runtime lsof无开放文件、未停止进程；原始process audit也为空结果。只删除本任务九个runtime子目录，保留源码及匹配ignored依赖/构建产物。本线独立观察这九目录均已不存在，重新只读回读HEAD=N、tree准确、工作树clean，未漂移。[最终状态独立核对](independent-final-state.json)

作者04:44:13Z的ls-remote只读原件记录main=M、远端B仍H0、C仍07592；这是该时刻远端快照，未冒称N已发布。secrets仅签冻结M，发布前fresh-fetch检查仍由根完成。作者披露准备期比较器误报在写入前终止，修正后许可区外逐字一致，本线已独立验证，不属于编译/业务测试失败。

本范围至此签结：30路径/28非资源与指定输入复用、匹配build及三完整gate原件307/307、48项真实资源仅Jelly+33、工程原件与收尾均可核。本线没有重新执行任何作者有效测试或旧矩阵；没有签新H的CI/Full/实际采用。根通知的T385 Full新失败及暂停新Full调度保留其独立归因，不挪成B已失败、已通过或新增本地补测授权。
