# T065 下一步最小同步计划（只读准备）

状态：准备完成，交回根；未接实现 writer。T065 接续归开发线2，T386 仍归开发线4。T389 `13767116bd339558596e13ad6b36a3a3ed19f3cc` 的修复树保持冻结。本计划补已有 accepted 同步方案，不重审 OAuth、不另建实现 spec。

## 结论与真正等待项

**T065 的非资源同步可以立即获派执行，不需要等 T386/T389 功能采用。** 推荐从已有 prepared `df4d3f92` 正常吸收根冻结的实际 main；当前无冲突。只把最后的资源下降冻结排在根选定的同资源增长之后，不把整单标为 WAIT。

为减少重复构建和重新发资源许可，建议根采用顺序为 **T389 实际采用 → T386 正常吸收该 main、重新核精确资源并实际采用 → T065 最后资源冻结**。按此建议，最后需要等的是 **包含已采用 T389 的 T386 实际 main 提交**；T065 的同步、文档/依赖核对和旧证据映射可先做。此顺序是本计划建议，尚不是采用事实或新增授权。若根选择相反顺序，等待项仅换成最后一个实际进入 main 的同 workbench 资源增长；若根决定先完成 T065，也可以，但之后 T389/T386 的旧 tuple 必须重新绑定，不是功能依赖阻塞。

不能把 T386/T389 的候选、synthetic merge 或两份许可相加当实际 main，也不等待其它无路径/资源关系的整个在途大单。T377、T208、T362、T379 等旧“待采用”描述已不能作为新的全单等待理由；最终以根冻结 M 的祖先和实测为准。

## 准确输入与当前 main 差集

| 输入 | SHA |
| --- | --- |
| 原 PR #1669 H（未访问 GH，本地原头） | `94861f093ab3971c6370b824cdd2bfcc30caf14d` |
| 已准备 N；parents 为 H 和旧 M | `df4d3f92dde968062a232bd5ceb5f402da8dec5f` |
| 旧 M，已过时 | `8a46c2cb7c596ffec0241dcfcfcfb3cf7552f987` |
| 本轮根指定 M；本地 origin/main 同值 | `08642dcb92dbdad029d990813da56682d6864a23` |
| T386 当前配套资源后的本地 H | `cb931d6537276952d716b6ca3c3b2b225b222406` |
| T389 冻结 H | `13767116bd339558596e13ad6b36a3a3ed19f3cc` |

主检出本地 `main` 仍是旧祖先 `08c9933d…`，不是本轮采用基点；本计划没有用它替换根指定 M，也没有 fetch/改 ref。`inputs.json`、`readback.json` 保存区分。

旧 M→指定 M 共202个变动路径，但与 T065 原38路径只有4处交集：`docs/releases/CHANGELOG.md`、`docs/system/SECURITY-INVARIANTS.md`、`specs/BACKLOG.md`、`tooling/gates/page-assets.json`。不把其它198条 main 变动当 T065 新实现。

- 从 prepared N 正常 merge M：隔离 `merge-tree` exit0，无文本冲突，自动 tree `821a083d48be82fcbf8f37860a7c54b8b64490cc`。相对 M 仍只有 T065 的37个非资源路径，无越界 delta。
- 原37个非资源 blob 中34个仍与原 H 完全相同（含4个既有删除）；其余3个正是上列文档，自动合入 main 的新增内容。S-37/S-95/S-101 及 BL-914 行与原 H 相同；main 的 S-55/60/66/91/103 与 T148 Changelog 等增量同时保留。不存在需重写本单语义的冲突。
- 若从原 H 重做，而不是继续 prepared N：只有账本冲突，stage1/2/3分别是旧共同基点/T065旧下降/当前M账本。应取当前 M **完整账本**，不选旧1149861或1150080；其余三文档自动合并。已有 N 是 H 的后代，继续 N 可保持后续普通 fast-forward 推送条件，不需要 rebase/force。

原件：`merge-summary.json`、`prepared-merge-tree.log`、`original-merge-tree.log`、`prepared-blobs.json`、`prepared-automatic-vs-M.diff`、`scoped-doc-merge.diff`、`doc-preservation.json`。这些 tree 只是静态合成，不是实现提交、构建或运行证据。

## 调用链、依赖与 README 的最小变化

T065 的设置浏览器脚本/设置投影 → `web-connectors-settings`/目录/公开方法 → `connector-api-oauth`/`connector-access`/targets → `withConnectorConnections`/共享refresh/发送与拒绝/回调规则这一限定链中，**本单拥有的生产、合同/API快照和测试 blob 均保原 H**；`CALL-CHAINS.md` 本单 blob 也保持。

有一处不能沿旧报告写成“所有连接依赖未变”：当前 main 给 `apps/local-host/src/connector-connection-store.ts` 新增 `forgetConnectorPluginBindings` 桥，并给 `horizontal/connector-host/src/connection-store.ts` 和 index 新增/导出 `forgetPluginBindings`，用于 BL-491 沙箱安装图片 namespace 的清理。现有 `withConnectorConnections`、类已有方法、事务/回调及 T065 的 require/refresh 路径未改。这是新导出/调用方的加法，不能把整个模块/dist 说成同 blob；也无证据要求重开 T065 OAuth 设计。详见 `additive-connector-dependency.diff`。

其余本次限定核对的共享 refresh/send/refusal/protocol/lifecycle/store、activation/authorization-commit、agent-host、SDK oauth、connector-host 合同、test-kit、oauth-network/feed-library 夹具、pnpm-lock、根 package.json 和 run-tests 均无旧M→M delta（`critical-area-check.json`、`dependency-check.json`；限定查询，不冒称全仓调用图审计）。

工作台共享客户端的新差异仅 `settings-directory.ts`：T362 从现行目录行读 Manifest 声明的 address query/hash，既有声明优先，另供插件页参数白名单；T065 `connectors-settings.ts` 与 callbackHost/Path 本体不改。新组合须保 main 这段逻辑，不能从旧 bundle 整段回盖。原 T065 设置/回调证据不等于此新组合已经实操。`shared-client-delta.diff` 留实际 hunk。

local-host、workbench、connector-host、contracts、integration catalog 五份 README 的「开发要求」旧M→M **完全相同**。workbench 仅前面的 Goals 渲染器/终端路由说明更新，不新增本次同步的测试义务；不因换阶段机械再跑全部旧66文件或工作台全部清单。`readme-delta.diff`、`readme-contracts.json` 保存现行命令及适用条件。未来若采用 T386，则吸收其 README/S30 精确新行；T065 S37/95/101 不覆盖 S30。

## T386 / T389 对资源窗口的具体影响

| 快照 | workbench.js | plugin-frame.js | 性质 |
| --- | ---: | ---: | --- |
| 旧 M8a46 账本 | 1150291 | 190838 | prepared N 仍沿用它 |
| prepared N 的旧实测 | 1150080 | 190838 | 当时唯一下降211B；当前组合不可直接复用数值 |
| 当前 M0864 账本 | 1150615 | 190838 | 新同步先完整沿 M |
| T389 H137671 实测/精确许可 | 1150714 (+99) | 190838 | 相对共同基点db29，仅workbench变，47项字节/hash相同 |
| T386 Hcb931 已写许可/预算 | 1151174 (+559) | 191017 (+179) | 六个业务blob与f204实测输入相同，之后只有README/S30/两资源配套变化；不是含T389的组合 |

两候选的 workbench tuple **都从1150615出发，却给出不同 ceiling**。它们自身正常合成只在 `scripts/gates/page-assets.mjs` 和 `tooling/gates/page-assets.json` 冲突，业务源码无冲突（`future-merge-summary.json`）。谁后采用，谁必须从真正已采用 main 重新测量和获精确资源窗口，不能择一旧 ceiling 覆盖另一项，也不能相加当实测。T386 的 plugin-frame 新值必须完整保留在之后 T065 账本里。

T065 prepared N 与 T386 或 T389 分别静态合成均无文本冲突；T065 与 T386 的原范围交集是 SI 和账本（S30 与本单行不同），与 T389 只有账本。故没有要求等待两者才能同步本单源码的证据。

未来 T065 下降只用最终真实 main + T065 的 matching whole build实测48响应后由标准 updater冻结；**不能用当前1150615−211、候选1151174−211或旧1150080写账本**。T065本身不需要新增长许可；`page-assets.mjs` 默认完整沿最终M，不为顺手清已消费许可擅改。根若要求本片清理 consumed tuple，另给该脚本的具体行窗口，算法/阈值/新许可不动。此任务本轮无任何预算写入。

资源原件：T389 `/private/tmp/t389-fix-evidence/response-hash-delta.json`；T386 `/private/tmp/t386-evidence/served-delta.json` 与 `final/checks-binding.json`（旧主REPORT仍记f204，应以当前cb931及配套delta区分）；本目录 `T386-resource.diff`、`T389-resource.diff`、`future-owner-scope.json`。

## 根可派发的两段执行合同（本轮均未执行）

1. **可现在派：正常同步与窄核。** 新隔离树以 prepared N 为起点，fresh核原H/远端、dirty/占用及根最终M；普通 merge 真实 main，不 rebase/force，不导入兄弟候选。保存 parents/tree、34同blob与3文档合成，保所有已采用main变动。当前预计无需人工源码/文档修改；冲突出现便只交真实hunk给根。原四删除不恢复，OAuth/合同/测试不重新实现。原作者树和 prepared 树不直接覆盖。
2. **到根选定资源窗才做：最终冻结/验交付。** 吸收届时实际采用main（建议等含T389的T386），对真实变化重新窄核；隔离系统Home/file secrets/ad-hoc及公共build槽，frozen offline install（无匹配依赖才需要）、整体pnpm build并核source/manifest及本树dist解析。实测全部48响应，标准 `page-assets --update --base <准确M>` 只记真实下降；保其它47/包含T386的frame新值，不放大/留slack。若非预期下降或其它资源变化，带实际差集给根，不另加许可。

后续通常只需本单普通merge和 `tooling/gates/page-assets.json` 的标准实测下降；scripts/gates 仅根另明确时允许。正常merge吸收main不等于授予任意改当前202个main路径。根负责共享文档裁决、GitHub、推送、新头CI/Full与实际采用。

最终工程应核 overall build、boundary、API/actions一致性检查（不因无新合同变更机械刷新快照）、test-import、merge-base health、diff、fresh-fetch后的逐提交secret及实际affected。预算改动使现有完整 `tests/page-assets-budget.test.ts` 有效，按当时完整文件/jobs1/retries0执行，已有相同输入有效原件可窄核抵。没有授权本机Full。

若新main实际hunk、组合构建或CI指出设置relay缺口，由根点名已有非HOLD完整设置文件；不预设重跑旧普通29、作者66/9M或上一同步method-directory/Alchemist1+5。README相同不是免验，沿既有接受同步合同做最小实际增量验证。

## 旧证据可沿用的准确边界

- 原 Notion/shared refresh、同Home/跨Home、workspace等待者、rotation条件写回、别名/loopback拒绝的独立/二审结论保留原 H、owner和原执行来源。34核心非资源blob及其现有被用路径未改，支持旧机制结论；新增binding清理是已采用main加法，不把整包输入签成完全相同。
- 旧CI093同树的19/69/17等仍归该CI；普通29、作者66/9M和先前1+5各保原出处。df4 的 build/boundary/health/680行secret 与48实测只证明**旧M组合**，不改署当前C或未来最终H，旧1150080和−211不能核抵新资源测量。
- 原29/66矩阵不为换头重复；旧本机HOLD和M1/M3/M6 NOT RUN不变成通过，也不建立永久禁令。确需补证由根明确完整文件、隔离与执行范围，禁止筛case/新probe绕过。
- T066父子Full不冒称T065纯头Full；T065 full=true及当前新头CI/Full未运行边界保留。静态merge无冲突、old CI success metadata或matching build不能取代最终组合CI、实际checkout与覆盖核对。

## 本轮完成与保护

只读原仓和三冻结树，原H/ prepared N/ T389 refs及tracked dirty均回读不变（`readback.json`）。没有安装、build、test、实际merge/checkout、索引/ref/GH/CI/真实Home写入。用于规划的merge-tree新对象只在 `/private/tmp/t065-next/objects`，原对象库只作alternate，无refs/commit；这些非采用证据。本目录文件是唯一新写产物。相关memory检索无命中，未依赖旧memory事实。完成即交回，等待根给予下一段明确路径授权。
