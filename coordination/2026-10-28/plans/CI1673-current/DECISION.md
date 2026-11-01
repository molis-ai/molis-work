# #1673 当前 main 同步与门禁收紧合同

状态：2026-11-01 09:06Z 根已核原候选、开发准备和独立只读审查，接受下列更窄修订并交开发线4唯一writer；尚未实现/验证。原PR #1673，原H d4f77755a7a8120f429abd3274d25326d65c2d95，准确M f47fa0da4ba7447f94d1cd209e6d69d43b21465c。当前用户授权防腐全线、优先旧Open PR及“门禁/CI只许变严”；10月8日真人决定#14直接支持两周后并入Verify。10月31日新增跳过/手动探针细则未独立定位，不靠PR作者描述扩大授权。

## 最终合同与边界

只收紧现有CI并合准确main：SI/Product加入Verify的必过结果、merge_group运行完整清单、可信已验push复用保持。保M现有PR some定向、whole完整、selector失败/取消/跳过/空或不可信输出回退完整两片行为，不采用原H的whole/失败时跳过优化。Verify只在pull_request且test-selection明确success且对应job mode为none时允许该job skipped；两个job分别核mode。some/whole/空值/未知mode、selection失败取消含残留none或some均不能豁免应跑结果。旧七项永远不因PR豁免。正常merge_group/直推/schedule/dispatch仍须九项success；可信push复用的同SHA/base/workflow/success条件不改。

为让Verify读取可信selector结果与mode，增加对test-selection的直接needs及必要env；它是辅助选择依赖，非一个必须success的产品检查。现有tests/fixtures/ci-workflow.ts的blockingJobs须同queue-check一样排除selector辅助依赖；保T350限时/缺失limit负例及唯一公共解析器，不放宽time limits/允许重复/规则范围。原十四路径加这个必要fixture为最大允许范围；无需变化的原路径不强行保diff。

Linux probe保持M既有schedule和全部manual workflow_dispatch入口、信息作业/预算/并发与超时，不引入H的新linux_probe opt-in或默认false。它是与并入Verify无关的行为变化；本修订不宣称相关10月31日历史决定不存在，只不在此候选采用未核细则。现行spec/文档的本单段落改成这份真实合同，旧H事实留在历史审计，不保互相矛盾的现行说明。

清单保准备中已核并集：当前M Product436/SI271交集28，去重复后Product408/SI271、并集679不丢一项。stage-pages留Product，T390 project-catalog只归SI，已删除desktop-launch-args不恢复。五冲突行里另四项已属于原27，不重复计数；新M变动时按实际集合重算，不以数量当门禁。保S103和所有main贡献，资源/业务源码/合同/limits/分支保护不动。

## 执行与验证

开发4在独立树从原H正常merge M，保完整父历史，不rebase/force。先同步同一spec决定#14/RAC-1760～1765与RAC-1900～1906的现行合同，再改workflow/fixture/配套测试与docs。不得为了绿删断言：旧候选中固定PR故障跳过/手动默认false的期望按本次明确行为修订替换成更严拒绝和既有入口正控；保全部其它断言。

验证必须消费真实workflow job if/真实Verify shell，覆盖：两个mode分别none/some/whole及混合；success+none允许skip；some/whole应跑却skip拒；selector失败/取消/跳过及残留输出不豁免；所有required job failure/cancelled拒；queue/直推/schedule/manual任一两项skip拒；可信push复用正控与伪/残留true拒；M手动探针仍执行；T350辅助依赖和缺limit拒；准确清单并集。按实际相关完整文件执行，至少ci-test-selection、ci-queue-verified、ci-timeouts、ci-product-subset-plan、ci-linux-probe；相关现有ci-product-subset/ci-install随实际影响或CI完整结果核抵。jobs1/retries0公共browser槽、隔离Home/TMP/file secrets；不跑本机Full，不增加产品矩阵。

本单full=false保持，因为CI/规则/名单收紧不改变产品实现；新N需要matching整体build及普通health对M、boundary（内部编译走build槽）、imports/diff与推前freshfetch/secrets。新CI准确H Verify及SI/Product实际执行、队列采用必须由根核原件，不能只看绿色。作者只交冻结N/tree、实际diff、完整原件及失败/清理，root负责push/GH/排队/采用。独立验证与二审在作者之外，原106只保历史来源，不改签新N。真实Home/4207/Keychain/保护分支/CI取消禁区不变。
