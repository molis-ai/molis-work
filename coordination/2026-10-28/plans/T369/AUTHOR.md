# T369 作者交付（冻结）

约定范围完成，仅新增 `tests/mcp-connection-change-refusal.test.ts`（167行），已本地提交、干净冻结。作者现交回唯一writer；未push/GH/CI/coord，未本机Full。T146等旧树未动，T389未执行。

| 输入/候选 | 准确值 |
|---|---|
| 已采用M | `15ad4f397018241c8b31625aff8014b89259f239` |
| H | `89119b9c07c0910f39cfc42beb3fc729c6ee1808` |
| tree | `41a185430f6e9411b8949530c6b1cdd11eb6270b` |
| 树/分支 | `/private/tmp/t369-dev` · `feature/t369-connection-refusal` |

## 实际覆盖

通过公开Host、真实项目/catalog及真实HTTP grant接线，MCP tools/list先发现fixture action；不传actionServiceUrl/ensureResident。真实terminalPanels记录经公开commit创建，非PTY启动。catalog runner只透明包装公开aliasSession/commit：观察精确panel/runtime/session，调用真实alias，await真实事务成功并读回持久记录后才进入deferred，alias返回仍未settle。其余catalog方法绑定原接收者，授权、发现和dispatch均真实。

- RAC2765：不换连接，同一屏障内handler=0，释放后正常结果、handler=1。
- RAC2764：明确entered后才通过公开setter换连接为null；释放后handler仍0，真实callTool错误精确为`mcp.context_changed/invalid`；恢复合法连接，再走同一真实alias屏障并成功，handler=1。
- RAC2766：独立故障树只把mcp-server action分支的目标raiser换为tool_unknown，其他比较/raiser/signal不动。匹配整体build后新完整文件1绿1红，首败准确为code/kind：实际`mcp.tool_unknown/not_found`，预期`mcp.context_changed/invalid`；前面的handler=0断言已过，正常对照仍绿。恢复源并匹配整体build后2/2通过。

这是公开函数调用层的证据；setup有真实HTTP项目/grant操作，但没有把它宣称为目标拒绝的MCP wire或HTTP/stdio矩阵。

## 结果与原件

| 检查 | 结果/原始输出 |
|---|---|
| 固定三完整文件，jobs1/retries0/verbose | 新文件2/2、mcp-error-kinds 6/6、action-gateway 13/13，合计21/21；`three-files.log` |
| 严格类型检查 | 通过；`typecheck-final.log` |
| 精确变异 | 预期exit1、1/2；`mutation.patch`、`mutant-build-final.log`、`mutant-test.log` |
| 恢复匹配build/新完整文件 | exit0、2/2；`restored-build.log`、`restored-test.log` |
| boundary / merge-base health / imports --chains | 全通过；`boundary.log`、`health.log`、`test-imports.log` |
| affected | 仅新unit文件，full=[]；`affected.json`，full=false仍适用 |
| diff / fetch→secrets | 通过，fresh main仍M，167行；`fetch.log`、`secrets.log` |

作者产物复制自只读T384树。复制前后核生产输入，候选当前digest与manifest均为 `1daeedd848e8d1a5f41a444f4df57771d828db9a4fd9fd329a2ae20f581b65a5`；相关公开包实际解析到自有树，127份依赖/构建目录复制后无来源树回链。见 `clone.json`、`reuse-binding.json`、`final-binding.json`、`scoped.diff`。新测试不改生产输入，作者匹配dist与manifest保留，供独立验证复制；T384原树只读未清。

首次运行时的夹具路径/类型错误已由严格tsc定位并修正，原始`typecheck.log`保留；修正后的三文件批才是最终正常证据。变异首次构建在执行测试前被pnpm复制依赖状态/隔离HOME不匹配阻止（`mutant-build.log`），离线安装且固定现有cache store后匹配构建成功；没有以失败构建跑变异。pnpm缓存路径是显式复用，系统HOME/CFFIXED/XDG、测试TMPDIR、file backend与ad-hoc配置均隔离。没有模型/真凭据、真实Home或Chrome启动；原生helper未被本测试调用，不冒作helper签名或全部Foundation原生临时路径实测。

清理：finally释放所有屏障、等待全部pending再close MCP；既有公开fixture关闭HTTP/Host并删除每份Home。全部工具句柄终态，lsof确认测试tmp/Home无打开文件后移除；故障源码恢复、临时故障树正常移除。`cleanup.json`与`mutant-restored-status.txt`保留。作者树/dist保持，不追加业务矩阵。新文件约4秒，可作为product subset候选，Linux稳定性由根据CI结算，未编辑共享清单。

独立验证线3、二审线5及后续CI/SI/采用由根安排；作者通过不代签这些结论。
