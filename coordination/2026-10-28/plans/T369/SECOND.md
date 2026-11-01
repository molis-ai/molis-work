# T369 丙档独立二审

结论：**准确H的丙档独立二审通过，无Blocker/P1或当前必须修改/补跑项。** 作者最终REPORT及独立验证线3的REPORT/checks已齐并核收；代码、变异区分力和原件边界一致。独立线仅核收原件，未重跑，保持来源；CI/采用由根另结。对象为accepted `tasks/T-369.md`及已采用M的执行差量。

M=`15ad4f397018241c8b31625aff8014b89259f239`；H=`89119b9c07c0910f39cfc42beb3fc729c6ee1808`；tree=`41a185430f6e9411b8949530c6b1cdd11eb6270b`。实际父为M，作者树干净；唯一新增`tests/mcp-connection-change-refusal.test.ts`167行、blob=`b0a6723dd8319d598df42c18b356291318c95f5b`，实际Git diff与scoped.diff逐字相同。无生产/fixture/合同/资源/门禁修改，无私有src/dist导入、any或双重断言。

**RAC-2764/2765测试有效。** openTestHome经真实HTTP建项目与grant，Host registry注册真实action；先以tools/list断言公开helper生成的tool存在，随后才arm。公开terminalPanels.insert经真实catalog.commit建合法记录；`019a-b2`满足当前唯一session格式。runner代理只截公开aliasSession与commit，其他方法绑定原对象；aliasSession实际执行且按精确panel/runtime/session识别。commit先await真实事务成功，再get读回同panel/project及host_session_id，之后才entered/release，SQLite事务不持锁等控制端。M的生产顺序仍是捕获connection→权限检查→await该alias→find action→引用复查→authorizedActions/dispatch，故不是首次目录请求或被吞actions.missing构造的假entered。

pending立即转换为可观察Outcome，无未处理拒绝；entered后才将公开runtimeConnection设null，runtimeContextHost未改。释放后先断handler=0，再断真实ActionError的精确`mcp.context_changed/invalid`；普通旧signal的Error不会满足。相同夹具正常对照在屏障内handler=0，释放后返回固定JSON且handler=1；拒绝后设回合法新连接，再入同一屏障并成功一次，证明恢复。finally释放全部gate、等待pending、close MCP；公共fixture随后关HTTP/Host并删Home。

边界：alias真实持久化及其已有项目绑定发生在entered之前，拒绝例保留这一前置事实；handler=0只证明action dispatch未发生，不能扩签本次调用所有平台写均为0。代理是对真实commit返回的受控延迟，不是零替身，也没有启动PTY/Runtime程序。目标拒绝通过公开callTool函数层验证；setup真实HTTP与handleMessage发现不等于该拒绝走了MCP wire/HTTP/stdio。

**RAC-2766区分力成立。** mutation.patch只有action分支连接比较后的那一个raiser由context_changed换tool_unknown，未删除比较/分支、未改其它raiser/signal/错误表。mutant-test.log为新完整文件1过1失败：正常对照绿；拒绝例已通过前置handler=0和ActionError判断，唯一失败在code/kind deepEqual，实际`mcp.tool_unknown/not_found`而非期待值。恢复源码、匹配build后同文件2/2通过。首次mutant build因依赖/隔离HOME状态失败，保留原件；成功匹配构建后才跑变异，不将失败构建或早期类型错误冒作业务红。故障副本已恢复/移除，最终提交无生产变异。

作者固定三完整文件为新2/2、mcp-error-kinds6/6、action-gateway13/13，共21/21，零skip/cancel/todo；恢复新完整文件2/2另记，不重复累计。阶段raw没有各自打印最终H；测试与恢复记录发生在H提交前，归作者最终候选内容及后续scoped/final-binding映射，**不改写成当时已checkout H**。H与生产M无差分，复用T384产物的生产摘要/manifest均`1daeedd848e8d1a5f41a444f4df57771d828db9a4fd9fd329a2ae20f581b65a5`，公开包解析在作者自有树，最终源码/构建绑定有据；source digest本身不覆盖测试字节，测试来源仍依完整diff/作者报告/最终blob。独立准确H核收另结，不据此机械重跑旧矩阵。

boundary errors=[]、health对M、imports 0/1710混用、fresh-fetch→secrets167行均过；affected仅新增unit、full=[]/uncovered=[]，full=false合理。约4秒的新文件可交根作为product subset候选，Linux稳定性须由真实CI判断，当前不扩写共享清单。cleanup记录全部pending终态、Home/tmp无打开句柄后删除、故障源恢复；没有模型/真凭据/真实Home4207/浏览器/PTY启动。原生helper签名和全部Foundation临时路径未实测，不能扩大本次环境结论。

**T390未来边界。** 只读`/private/tmp/t390-alias-id/T-390.md`仍是未注册候选，拟将非法trim后session的校验前移到alias/bind写前；本测试用合法`019a-b2`，不测试非法值写副作用，也不关闭该缺口。T369不因T390候选等待采用或先改生产；若T390以后实际改变alias入口/依赖，按新M精确核本测试/屏障和合法正常对照，旧构建/动态不能称新输入已验，不复制T148矩阵或将非法ID问题塞进本单。

本二审只读合同、实际代码/Git、作者REPORT、正常/变异/恢复/构建/门禁/绑定/cleanup原件并作字节比较；仅写本报告，未build/test、修改作者/生产/refs/GH/coord。只核T340这个raiser子项，不关闭其他错误码出口、未来T390或整体产品验收。

终核补充：已全文读`/tmp/t369-verify/REPORT.md`及checks.json。独立线另算最终生产digest、核本树公开包解析及src/dist目标raiser已恢复，normal21/负控1绿1红/恢复2的核收与本二审一致；同样保留提交前原执行的元数据限制、空typecheck-final日志仅凭作者报告结论的来源，不冒作独立实跑或逐日志自带H。RAC2764～2766限定证据均可核收；full=false成立，普通Verify/适用SI/实际采用与product-subset Linux资格尚未签。
