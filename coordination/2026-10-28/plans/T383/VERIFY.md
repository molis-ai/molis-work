# T383 第二阶段独立验证

**约定独立验证通过，无当前必修项。** 准确 H=`95ef66c1ef3a174eacbf0260e0f98adc4f19fe0f`，tree=`0c73ae94dbca46e247d4c7f99b5d73873957e8a7`。根确认作者无占位、收尾冻结后才复制产物和执行。独立 detached 副本核 [scoped.diff](raw/scoped.diff) 仅 Pages 测试 +14/-1，最终文件与作者final-test及SHA一致；其余两例与原文相同。复用前重算生产digest，与manifest同为 `c75b962c1bff4d1f6eccdb3e12e3c022e32b2c6e5523b22272f80631d83c11dd`；1158个symlink无作者树回链，见 [clone.json](raw/clone.json)、[binding.json](raw/binding.json)。

最终**无诊断/无hook**完整 `tests/pages-actions.e2e.test.ts` 一次自然执行：jobs1/retries0/verbose，**4/4、fail/skip/cancel/todo均0，35.766秒，exit0**。[tests.log](raw/tests.log)、[result.json](raw/result.json) 保全部原始输出。两宽度先保child正文/已保存及owner正文断言，再按刚保存id/version等真实父Pages context存在、同id/version、unsaved非true且无draft_text，随后走原reload。恢复、命名、冲突、长草稿上下文和只读例的原断言均通过；未改30秒期限、产品或共享fixture。

已只读核作者 proof.diff、proof.log 与 proof-summary：暂扣真实clean消息时，两宽度旧child/owner前置均满足，父仍同id且unsaved、有draft，新谓词假，生产beforeunload对合成可取消事件preventDefault；放行原消息后新谓词真、guard不再拦。raw事实与summary解析相同，见 [review-checks.json](raw/review-checks.json)。该确定性反证与作者受控4/4保持作者来源，本线没有重跑proof或初轮；合成事件不等于原生dialog或历史超时复现。

公共槽目录在改TMPDIR前解析并显式传入。完整测试前后同一公共holder PID6322、label=`T383-independent-final`，覆盖子进程执行；[cleanup.json](cleanup.json) 确认槽释放、4份fixture/profile自然消失、wrapper均退出、无本线存活进程、九隔离目录清理、作者与独立树干净。系统HOME/CFFIXED/XDG、file后端、ad-hoc配置、专用Chrome带mock-keychain/basic password store；Foundation Home/Library/cache实测隔离，但其NSTemporaryDirectory仍为系统路径，不签全部原生临时路径隔离。附带Computer helper签名读取未得到有效bundle证明（复制源亦为空壳，Pages路径未调用），不把ad-hoc配置冒作全部helper签名实测；原件保留于raw/helper-signature.txt。

独立 [affected.json](raw/affected.json) 为full=[]、仅本完整browser文件；测试同步范围下full=false合理。工程检查沿作者冻结原件，本线未重建或重复门禁。初轮私有机器槽不合格永久保留；历史两次Linux30秒超时因果仍UNKNOWN。当前只证明父保存同步合同和本机最终完整文件，不签Linux首败消失、CI/Full、真实Home或用户验收；外部采用由根按准确H结算。
