# T390 候选书独立只读审阅

**结论：需补实一处验收；最小实现方向可保留。** 已核准确main `15ad4f397018241c8b31625aff8014b89259f239` 的公开合同、alias/linker/MCP调用链、现有catalog/终端测试与Full选择规则。本轮只审书，未注册任务或占用RAC-2834～2836，未运行或写源码/coord/GH/refs。

## 必修：RAC-2835的合法同值对照必须区分“重新alias/bind”和“提前no-op”

现稿只写“合法同值再次报告仍保持原alias/bind能力”。若仅对同一panel连续调用两次，再检查alias/binding仍在原项目，即使作者误把 `current.host_session_id === session` 一起前移到写入之前，测试仍会全绿：第一次已留下所需状态，第二次没有真正证明这些操作还会发生。

请在同一RAC-2835明确一个可区分的公开入口场景，不增加新矩阵：

1. 在项目B的panel B上，经真实commit/aliasSession保存合法session S，保留B的host_session_id=S及updated_at。
2. 经同一公开owner入口，把S报告到项目A的另一panel A，使S的alias和runtime绑定真实转向A；不用SQL造这个前置状态。
3. 再向panel B报告同一个S，可同时带现行允许的边缘空白。要求alias重新指向B、公开resolveRuntimeContext重新得到B项目；B的host_session_id仍为trim后的S、updated_at保持同值分支原行为。关闭catalog后只读核确切runtime/S alias行，重开后核绑定仍成立。

这个场景能在“合法同值提前return”的错误实现上稳定失败，同时覆盖现行trim、真实alias与binding的保留，不需新增产品API、表写入夹具或第二套格式谓词。原RAC-2836的非法值先红/恢复写后检查证明保留，不要求为本条再扩大变异批次。

## 其余关键边界无需新增必修

现行 `aliasSession` 确实在格式检查前addAlias/bind；公开 `aliasTerminalSession` 为Promise<void>，旧RAC-2565只要求非法值不进入resume，未规定此处必须抛新错误。将**trim后非法格式**的 `return current` 放在现有missing/空值检查之后、now/addAlias/bind之前，保留合法同值写后判断，符合本候选的最小收紧；不必改MCP/linker、runtime_id格式、actor/project来源、错误码或公开类型。空白/缺panel的现有错误与优先顺序保持。

真实状态修改继续走公开catalog与表owner；当前类确无alias查询器。闭库后在临时catalog上用现有better-sqlite3只读、参数化SELECT作持久化后置断言，可沿现有project-deletion-service测试模式；不扩成生产读者、不用SQL创建/改绑alias，不直接读写runtime模块的绑定表，binding仍由公开resolve核验。无需为测试新增产品查询API。

`full=false`已标预测且有依据：现行selector比较新旧DDL字符串，而非见到文件含DDL就判storage；本次拟议顺序hunk不改schema/共享核心/装配。最终仍由实际diff及项目规则确认，不能预签。T369只改自己的连接变化测试；本书不接管屏障或错误语义，组合时按真实输入变更核抵其证据的约束正确。

补入上述同值反例后，可交根决定接受同书和分配writer；本报告不是实现验证或采用结论。

— Codex独立书审，gpt-6.1-sol。
