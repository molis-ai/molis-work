# T353 B/C 当前接续准备（一审线2，只读）

状态：准备完成，未执行同步、构建、测试或发布。B 可从实际 main 做普通同步；没有必须先采用 T384/T385/T387/T146 的代码依赖，但正式 writer 要由根交接共享登记/资源窗口。当前快照没有 B 的新窗口释放记录，不能把技术可合并说成已经获得写锁。C 仍必须等 B 实际采用。

## 冻结输入与本轮证据

- 实际本地 `origin/main` M=`6729a2d4655caa603daa369f99884e09c4726bde`；协调 HEAD、各 scoped 路径与只读 merge 原输出见 [source-evidence.json](source-evidence.json)。本轮未 fetch，不称此本地值为后续永久有效的远端末端；根派 writer 前再 fresh 冻结 M。
- B #1682：H=`81955aa9303011ec0f38ecbdf2b507fc23824fe2`，open、base main；C #1683：H=`07592e0fc36375b8d191d24ceafbd5e58d36d403`，open、base `task/T353-b-prb`，C 已吸收的 B 仍是旧 `8a92616826de9925580566fdd375f3b5c2921133`，不是当前 B。两 PR 头均以本轮连接器 GET 回读。
- accepted WO：协调 `tasks/T-353.md`；BOARD 当前行仍是 B 待自身 Full、C 待 B。T384 accepted WO 明确不把 T353B 塞进四片承载，不构成“B 必须等四片采用”的新依赖。
- B 当前 H [CI 41237845572](https://github.com/molis-ai/molis-work/actions/runs/41237845572) 本轮 GET：completed/success；17 jobs 为15 success、2 skipped，其中 Verify、SI 1/2及2/2、Product 1/2及2/2都 success。按 H 查询 workflows 只返回这一条 CI，未见此 H 的 Full。旧正文“SI 待结”已过时，不能据此重复排普通 CI。

## B 能否现在同步：技术结论与具体窗口

在临时 Git object directory 中执行只读 `merge-tree --write-tree --name-only M B`，临时对象随后删除，没有写仓库 objects/refs/index。结果 exit1，**唯一内容冲突为 `scripts/gates/page-assets.mjs` 的一次性许可表**。预算 JSON 自动合并；M 从 B 已吸收的 `edb257e0…` 前进后，与 B 30路径的交集也只有 gate 与预算这两份文件。因此不存在尚待别线解决的消费者源码冲突。

对冻结四线逐个取 merge-base(M,H) 后的实际 diff，交集如下；完整 hunk 见 [scoped-intersections.diff.txt](scoped-intersections.diff.txt)。

| 在途线 / 冻结 H | 与 B 的实际关系 | 对 B 的限制 |
| --- | --- | --- |
| T384 #1712 `4404e142662cbd7895f46c1c6df6e5efe5e6e135` | 共 gate、workspace registry、预算三路径。T384 gate 是 workbench.js `[1150291,1150615]`；B 是 Jelly `[76866,76899]`。registry：T384 删 desktop 两项及 workbench Goals capabilities；B 加 knowledge 的 SDK extraWorkspaceDependencies，hunk 不同。预算亦不同资源行。 | 同路径的共享窗口需根串行交接；不是 SDK 消费者对四片实现的依赖。不能合未采用 T384 来“解”B。 |
| T385 #1713 `44efe84d925b7f01e6f8f837c0bf284471ae7659` | 10路径与 B 无交集。 | 没有观察到须等待它的代码或资源锁。它的 Full 不替代 B Full。 |
| T387 #1714 `3862de92dee5683543fef60d669750053562e330` | 10路径与 B 无交集。 | 同上；不用等其 Full 或采用才能同步 B。 |
| T146 #1676 `c35ad3036b7ed2e296d5b1b6fce383546b1dafb9` | 只共预算 JSON：T146 settings.css `904914→827276`；B Jelly `76866→76899`，不同 hunk。 | 只需根协调预算文件的串行写入窗口，不是样式功能依赖。 |

现行 `PARALLEL-DEVELOPMENT.md` §2要求共享枢纽解冲突保留双方条目并重跑 boundary/health；协调 README §10 的同枢纽单任务锁仍适用。当前 BOARD/WO 未向 B 交接新窗口。因此给根的可执行判断是：**可以现在派一次从实际 M 的普通同步，前提是明确交出 gate、registry 与 Jelly 预算行窗口；无需等三条无关 Full 完成，也无需规定四条全部采用。** 如果根选择让 T384/T146 先落地或继续持锁，B 就等这两个具体窗口交回，再接实际新 M。冻结进 CI 本身不自动等于锁已释放。

本次只核指定四线，没有全局 PR/MISC 扫描；根仍负责派单时的 fresh 全局锁审计。不得把本报告解释成其他在途线全部无锁。

## B 最小完整同步与验证合同（后续 writer 执行）

1. 根确认准确 B H、实际采用的 M 和窗口后，原普通分支正常 merge M；不 rebase/force，不吸收四条未采用候选，不造承载分支。保留 M 的资源/登记变化、B 的 knowledge SDK 依赖及全部消费者改法。
2. 唯一预见冲突按**本次实际 merge-base 的预算**重绑 Jelly +33B。当前 M 的 Jelly仍76866，原 `[76866,76899]`成立；删除已消费的旧 Coding 许可和当前 Images 历史许可，不恢复旧 form/workbench额度。若 T384 先采用，它的 workbench许可也已消费，不作为 B 的新额度带回；若尚未采用，不预填它。只保留当次仍需要且已批准的许可，不改门禁算法/limits/新审批政策。实际新 M 若改了 Jelly基数或最终增量不同，交根重新裁定，不能照抄此 tuple。
3. 冻结最终 H，核30路径/各 hunk与旧 B的一致性、M变化及冲突解法。当前 M推进只碰B的两资源文件，28非资源路径可沿用既有证据；gate有意清理历史许可后，整份 patch-id 不应被要求机械相同。重新读 kernel→SDK→contracts、knowledge package/lock/registry一致性；若任何消费者、helper、依赖输入或测试发生实质变化，只补其实际受影响证据。
4. 一次匹配整体 build（按机器 build槽）；然后 boundary、health `--base`、diff check，以及三个已有完整 gate相关文件：`tests/page-assets-budget.test.ts`、`tests/health-gates-lint.test.ts`、`tests/health-gates-spec-coverage.test.ts`。按公共runner/jobs1，完整文件、不筛选、不重试；这承接历史 gate处理的三文件范围，不重跑旧33/14文件矩阵。
5. 匹配产物实测48项 served资源，和准确 M的有效 served原件逐项比较。当前M预算48项共7,469,195B，若有效 matching实测核对一致，B预期仅Jelly+33B，总7,469,228B；这只是预算推算，**不是本轮实测**。没有匹配M捕获时才补基线测量，不为旧快照重复 build。保留 main其它资源变动，不能整份还原B旧预算。page-assets gate对准确 merge-base通过；无新增资源。
6. fetch后 secrets、正常推送后准确头普通CI；full=true，根安排该最终B自己的 Full，核实际 checkout/tree及适用job终态。最终Full须覆盖旧失败的完整 `alchemist-workbench.e2e.test.ts` 及有关文件，不用再先重复本地6/6或凭其代替Full。若最终H变化按实际增量重核，不循环重跑已有效证据。

以上是最小增量建议，不覆盖项目明确要求的必跑项；新增源码/依赖/资产差异时按实际README/affected补必要范围，不借“沿用”省掉新增风险验证。

## 可沿用与必须保留的旧边界

- 根已正式核收 [6548916513](https://github.com/molis-ai/molis-work/pull/1682#issuecomment-6548916513)：旧/当前各自main的30文件稳定patch-id同 `85c1ee0c84609d7be1f7112fd05d5ac28edc1302`；28路径同blob。旧独立14完整文件238/238与K/P负控、静态二审，只按未变范围沿用，不冒称新树重新执行。原件：[main-reuse报告](/private/tmp/t353b-main-reuse/REPORT.md)、[独立238报告](/private/tmp/t353b-verify/REPORT.md)。作者旧33文件508与当前两完整Alchemist6/6各保原头/署名。
- 旧 Full [41233823797](https://github.com/molis-ai/molis-work/actions/runs/41233823797) 仍失败：事件旧B `8a926168…`，实际checkout `0ddf16ee079cd2398709f8765b7fef0460f10588`、tree `baef23ba47c4c6a2c1a75a63e1e9390d0a57129d`；6 shard成功、1失败、9取消；失败shard两文件通过、Alchemist首跑及retry失败，其余98文件未跑或停止。提示/进度分项诊断不足，T366是否唯一根因仍UNKNOWN。新B含T366和局部6/6不能抹掉此失败，也不能把T366的Full当B Full。[原归因报告](/private/tmp/t353b-full-triage/REPORT.md)。
- 既有合法UTF-16、实际限额及已接受的非法串/lingguang request_id差异保持，不新增退化参数保证；PDF零余量旧新均空，不扩SDK合同。工程通过不签产品/真实Home/用户验收。

## C 只在 B 实际采用后继续

1. 先由根回读 B进入main的实际提交与补丁；C保持自身PR/归属，不提前retarget或合未采用载体。随后从C准确现头正常merge实际main，base改main；核相对main仅自身8路径及必要冲突解法，不把继承B显示为C自有范围。
2. C本头独立新版gate证据**已齐**，不再提出“尚缺tail/empty负控”：完整原gate的G0→小写无锚tail拒绝→G1→真实源码grep空结果assert.fail→G2均有原件，没改断言/门禁；见 [t353c-verify](/private/tmp/t353c-verify/REPORT.md)。作者32完整文件395/395已独立解析；8自有blob与19份业务链映射有证据。恢复/断言区分力在输入未变范围沿用，不重复两变异或旧32/81/369矩阵。
3. 同步后匹配build、依赖四处一致性、boundary/health、实际源码扫描与完整 `whole-units-gate.test.ts` 必须核最终树；T384若先采用可能改变被扫描文件/路径，按实际增量处理允许项，不能照旧正文“只剩SDK两行”或把旧context-bus行号搬来。gate源码/拒绝条件若未变，已有两负例不机械重做。三业务链(todo/Pages request_id160 UTF-16单元、artifacts join后4000与searchRevision)保原已接受语义；输入变化再补针对证据。
4. C相对已采用B预期无自有资源变化；资源数字用最终实测，不能复制7,492,990等旧总数。普通CI及C最终准确头自己的Full必须核齐；A/B/承载Full不代替C。
5. 旧739/754与15安装/沙箱失败没有逐文件干净main基线对照，仍UNKNOWN，不认“已证明基线”。旧正文ASCII request_id、旧头/scan/计数等由后续授权writer/根整理，不改变真实合同或补签用户验收。

本轮止于本准备件；未改作者树、源码、refs/index、协调、GitHub、CI控制、真实Home或凭据；未构建/测试，merge预测只使用可删除的临时对象库。没有启动持续CI观察。
