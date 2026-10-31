# T122 两文档补证独立核验

结论：**通过，未发现必须返工项。** 两文档准确记录验证线3在冻结77头的23/23及其覆盖边界，b056只核抵未变输入，没有将后继头或#1696冒称实跑。新增“信号草稿”措辞正确。full=false；本次纯文档核验不需要重跑23项或新增构建/工程测试。实际PR/CI/采用由根另结。

负责人：Codex验证线3。本线是77头原运行的执行者，本轮未参与文档写作，独立核对作者提交与自己保存的原件；不是重新代署二审线4的工程裁定。

## 所审准确提交

- H：`0b92852f43c95877cd2828f18bd1889f00a76ba7`。
- parent/base：`b0567bf545a74b858e4fdeddd5e66432b1065b21`。
- tree：`ba74cb90e88e11f3e59d91af6a00f37385d7d3be`。
- 作者工作树 `/private/tmp/t122-evidence-doc/wt` HEAD=H、干净。此时已经有提交，不以未提交候选替代。
- 独立由Git重新读取base→H，恰两文件+14/-4，完整patch与scoped.diff逐字节一致；没有源码、配置、门禁或其它文档改动。

## 证据与文字对应

1. 再读 `/private/tmp/t122-runtime-verify/execution/` 的home/integration/connections完整raw及result，准确运行头均为 `77f4fd172a380648535ac0f101bb2d6c8654c1bd`、tree=`3cb7aa56dbad61d21340788b3f5df86f83cbc4d4`，匹配源码/构建digest=`6c87c8169b59b765060a3148941b8e6e13ecab0b2e0ee6ad861ffe98c2e4c3e8`。6/6、9/9、8/8，fail/skip/cancel/todo均0，完整文件各一次、jobs1/retries0，和两文档/PR正文一致。文档作者没有改署成自己的实跑。
2. Home文件的真实签名包安装/登记/拉取/停用/重启/队列，以及origins仅API的边界写准。integration文件的config UTF8边界、真实runner/cursor、**信号草稿**、非法返回拒绝、stop/revoke覆盖写准；没有扩成Feed信号库落盘或页面可见，也没有把直接构造runner的case说成签名安装。
3. call-connections明确区分用户cancel保已发refresh的轮换凭据、不写配置/连接记录，与runner.stop不保存回答；两者不再发送后续数据请求。符合原测试实际本机TLS断言，不是“所有取消后所有写入为零”。
4. 独立从不可变Git对象复核source-binding.json列出的13路径：77→b056→文档H逐blob全部相同。该事实只支持这些配置/安装/登记/连接与测试输入沿用，文档明确没有在b056重跑，也没有声称整个依赖树或任意未来main都等价。与原§7.3的dc544历史13文件相同口径分别记录，不混淆两个比较起点。
5. #1696明确仍为原只读文档采用；T134原Linux skip、历史UNKNOWN、S104原独立采用来源均保留，没有倒填历史跳过。原配置/队列表中的“本轮未跑”在§7.3开头限定的原#1696读取上下文内保留，后续77工程补证单列，未把历史改写。
6. T141初装/升级origins实际设置DOM、Home升级，BL691/整个PG046，BL692～694、PG045、真实外部服务与本人验收仍开放。此次记录不会提前关闭后继实现或体验验收。

## 文档检查原件

已回读作者措辞修正后的 `doc-gates-precommit.log`：仓库实际 `scripts/gates/doc-gates.mjs:docGateProblems`，7793 tracked files，problems=[]。该入口真实包含brokenLinks/brokenCitations/spec等适用文档规则；本提交对该门禁及依赖没有diff。作者current-head/REPORT记录该检查后没有内容变化，提交patch与本次核对的最终文本一致，可作为作者的适用文档gate证据引用；本线未将它改署为独立重跑，也不把它称作完整health/build通过。

新增PG046→BL530 §7.3相对链接路径和标题锚点与现行仓库heading slug规则一致。对准确base→H另执行git diff --check，exit0。PR-BODY-DRAFT的数字、执行者、冻结头、b056核抵和未验范围与提交一致。

本轮只读作者树/Git和已有证据，唯一写入本VERIFY.md；没有改作者文档、refs、coord、GitHub，没有构建、产品测试或重复23例。无需因本次文档审验另起工程批。
