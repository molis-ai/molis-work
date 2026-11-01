# T369 独立只读核收

**约定证据核收通过，无当前必须修改或补跑项。** H=`89119b9c07c0910f39cfc42beb3fc729c6ee1808`，tree=`41a185430f6e9411b8949530c6b1cdd11eb6270b`，唯一父M=`15ad4f397018241c8b31625aff8014b89259f239`。直接回读作者树clean，Git diff仅新增167行 `tests/mcp-connection-change-refusal.test.ts`，逐字等于保存scoped.diff，diff check通过。依据为现行唯一WO及最终真实源码/原件，未沿旧WAIT状态停工；本线没有build/test、重演变异、改refs/源码/GH或新增矩阵。

RAC-2764：已读现行 `callToolResult` 顺序和新文件全部代码。测试用公开包、真实test-home Host/catalog及HTTP grant，先通过真实tools/list确认目标action；LocalMcpServer仅传前五个构造参数，走嵌入alias链。runner代理不替换授权/发现/dispatch，其他方法bind真实receiver；alias包装先实际调用并观察精确panel/runtime/session。commit包装先await真实catalog.commit，再公开get读回host_session_id与project_id，之后才entered并等待release，故不把任意catalog/commit当alias、不持写事务等待，也不伪造alias成功。控制端明确在entered及handler=0之后才把公开runtimeConnection置null。释放后先验handler仍0，再要求真实ActionError及精确 `mcp.context_changed/invalid`，普通abort错误不能混过此oracle。

RAC-2765：相同真实屏障不换连接，释放后固定结果等于正常JSON、handler恰1；拒绝例随后恢复一个合法连接引用，再进入同一alias屏障、释放后结果正确、handler=1。pending立即挂fulfilled/rejected转换，不留未观察拒绝；finally释放全部gate、等待pending、关闭MCP，既有test-home hook再关闭HTTP/Host并删Home。源码与作者 [three-files.log](/private/tmp/t369-evidence/three-files.log) 对应：新增2/2、mcp-error-kinds6/6、action-gateway13/13，合计21/21，零fail/cancel/skip/todo，完整文件未筛例。它们是作者执行，本线核原件，没有改署为独立实跑。

RAC-2766：独立核 [mutation.patch](/private/tmp/t369-evidence/mutation.patch) 只有目标action引用比较后的一行raiser由context_changed换tool_unknown，比较、其它raiser、signal、测试均未改。最终fault构建日志实报local-host重建、根编译/pty构建完成；[mutant-test.log](/private/tmp/t369-evidence/mutant-test.log) 为1绿1红，唯一失败在新测试:154的code/kind deepEqual：实际`mcp.tool_unknown/not_found`，期望`mcp.context_changed/invalid`。该断言之前的handler=0已过，正常对照仍绿，证明击中本题抛出处而非另一路abort。恢复构建实报local-host重建，随后 [restored-test.log](/private/tmp/t369-evidence/restored-test.log) 完整2/2、零skip。故障树已不存在；恢复时status只剩未提交的新测试，不能误写为当时已是最终H clean。最终提交后当前H才clean。

构建/输入绑定：独立重算当前生产source digest为 `1daeedd848e8d1a5f41a444f4df57771d828db9a4fd9fd329a2ae20f581b65a5`，与manifest、reuse/final-binding相同；local-host/desktop/mcp/plugin-sdk公开包实际解析均落 `/private/tmp/t369-dev` 自有dist。当前src和dist的目标raiser均已恢复context_changed；保存diff、fault构建及实际错误值共同支持变异确实被测试消费。完整运行发生于最终内容提交前，raw本身未逐次内嵌最终commit SHA；绑定来自最终测试内容/行号、scoped diff、作者执行上下文、构建原件与final-binding，不把每份日志描述为自带H证明。见本线 [checks.json](checks.json)。

门禁原件：boundary errors=[]、health对准确M通过、imports --chains为0混用；affected只新unit文件、full=[]，结合纯测试diff，full=false合理。fresh fetch原件与secrets对M扫描167行通过。严格tsc首次指出夹具字段/推断/字面量问题，最终修正；初次变异构建因pnpm状态/隔离HOME失败，后经离线安装和固定store才成功构建并测试，原失败不抹去，也未拿它冒作产品先红。空的typecheck-final.log本身只支持无输出，成功结论保作者报告归属。无需重复有效三文件、旧矩阵或变异。

清理按fixture finally及作者cleanup记录核收，当前证据homes/tmp及故障树确已不存在；原产物保留。公共槽、系统HOME/CFFIXED/XDG/file/ad-hoc按作者执行记录与根已核环境保来源，本线没有现场再跑或制造新的持槽证明；不承诺所有Foundation原生临时路径或helper签名已实测。未触真实Home4207/Keychain/模型/浏览器。

这是公开callTool函数层拒绝与恢复证据；setup真实HTTP/grant不等于目标错误走了MCP wire/HTTP/stdio。仅补T340这个raiser子项，不关闭其它抛出处或产品验收。普通CI/Verify、适用SI与最终采用仍由根按H结算；新文件可作快速product-subset候选，但Linux稳定性未由本机结果证明，未改共享清单。T386原独立归属保持。
