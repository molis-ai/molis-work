# T122 冻结当前组合的独立Mac补验

结论：根批准的三个完整文件已按顺序各执行一次，**23/23通过，fail/skip/cancel/todo均0，retries=0**。本轮补齐的是准确冻结main上的这些Mac工程路径，不是文档PR #1696的新产品实现，也不签设置DOM、真实外部服务或用户验收。没有失败，未启动额外基线树、变异、诊断补丁或扩大测试。

负责人：Codex验证线3（本轮独立执行）。冻结H=`77f4fd172a380648535ac0f101bb2d6c8654c1bd`，tree=`3cb7aa56dbad61d21340788b3f5df86f83cbc4d4`。main后来前进不改变本轮绑定；没有同步/重跑更新main。

## 本轮实际结果

| 顺序 | 完整原文件 | 结果 | 原始运行时长 |
| --- | --- | --- | ---: |
| 1 | tests/sandbox-integration-home.test.ts | 6/6 | 6803 ms |
| 2 | tests/sandbox-integration.test.ts | 9/9 | 1979 ms |
| 3 | tests/security-invariants-call-connections.test.ts | 8/8 | 1877 ms |

每份均经全机公共browser槽，`node scripts/run-tests.mjs --jobs 1 --retries 0 --verbose <完整文件>`；只有前一份完整exit0才启动后一份。无name筛选、无case剪裁、无失败自动重跑。没有启动Chrome，这三份是Node集成测试，browser仅为协调槽名。

第一份真实临时Ed25519签名source包，经公开预览/确认、Home Runtime与真实SandboxRunner：验证API精确origins、冲突与预览后抢占拒绝、安装/登记/拉取、停用再启用、卸载留人的连接、Host重启恢复；RAC1001-QUEUE真实registry等待中观察旧attach=false、新attach=true，最终disable无残留。结果仍是API origins，不冒作人能在设置界面看见。

第二份实跑RAC895-CONFIG的ASCII/中文UTF8序列化恰好限额与超限，超限bind拒绝且沙箱calls=0；四项Mac通过真实runner验证合法poll/cursor/信号草稿、无效pull整轮拒绝、无临时connection服务拒绝、stop/revoke后旧调用不再发送。这一文件直接构造bundle/runner的case不改称经过签名安装；真实签名入口由第一份证明。

第三份完整覆盖slot/origin/read-only/调用结束/DNS后current拒绝，以及两项真实broker refresh：

- 用户取消：已发送refresh不取消传输，仅保存轮换access/refresh/expiry；配置与连接updated_at不变，不再发送第二个数据请求。
- runner.stop：已发送refresh收到回答后，凭据、配置、连接记录均保持原值；不再发送第二个数据请求。

两者各自原断言实际通过，没有把cancel和stop写成相同语义。请求走原fixture的真实TLS transport，openssl仅生成本次临时自签证书；逻辑github.com/api.github.com等经testServer/lookup指向127.0.0.1随机端口。用的是临时文件凭据，不登录GitHub、不调用外部厂商或模型，不变更原测试映射/生产profile/worker。

## 隔离、构建和输入绑定

- 开始前核到T377已有最后构建/门禁记录，共享build/browser槽均空，未抢占其在用槽。每次由共享系统TMPDIR中的machine-slot先取得槽，之后子进程才切到本任务HOME/CFFIXED/XDG/TMPDIR；没有另造私槽。完整outer命令及shared_TMPDIR保存在各log。
- 从空字典建立环境allowlist；Node绝对路径 `/Users/yijunwang/.nvm/versions/node/v24.14.0/bin/node`，本轮实际v24.14.0、ABI137、darwin/arm64，pnpm11.9.0。临时系统Home、MolisHome、配置/缓存、Swift/Clang缓存均归本目录；file SecretStore，空加密/secret环境值，npm用户及global config=/dev/null，禁用git用户/系统配置和提示。不继承日常模型、账号/token/代理环境。
- 首次路径probe/安装/构建起即显式MOLIS_HELPER_SIGNING_IDENTITY=-，采用现成adhoc构建分支；没有Keychain查询/真实凭据操作，没有真实Home/4207或账号配置读取。
- 本轮Foundation/Node路径probe通过：原生Home、Library、Caches、Application Support以及Node Home/tmp均在本任务范围。Foundation NSTemporaryDirectory仍是OS用户系统临时目录，**未被TMPDIR隔离**，原始输出与false标志保留；不宣称所有系统临时路径隔离。三测试stage/Home由Node tmpdir创建，不执行原生Computer helper操作。
- `pnpm install --frozen-lockfile --offline --store-dir /Users/yijunwang/Library/pnpm/store` exit0；自有detached树整体pnpm build exit0，约129.7秒。63包构建及根产物全部完成；保留xterm相关4条build warning和SQLite experimental warning，不写“零警告”。没有借用作者dist。
- lock SHA256=`750c45694af6d8d31271a8d8b4493a41a0d4d37fbc3035d1bbd512670de9ad02`。
- 三次测试前分别通过公开computeBuildSourceDigest实算并与manifest比较，均为 `6c87c8169b59b765060a3148941b8e6e13ecab0b2e0ee6ad861ffe98c2e4c3e8`。manifest生成时间2026-10-31T22:57:13.750Z。准确head/tree、三个测试blob、Node、命令、环境、matching digest、exit和运行后git status都在各result JSON；前后树干净，无tracked修改。

本轮文件blob：Home=`b3cfababb95c2c091222dc92979b64bf675933ed`；sandbox-integration=`ebdc2879d6bec0da373e7cc6335a1ee1ba55ec57`；call-connections=`fa0a5b320c192fd41c50a746ab2f2c5e98501f3c`。

## 可以据此更新什么，仍不能关闭什么

当前H上原Linux跳过的2/4/6项现在有这次Mac完整实跑覆盖；原Linux报告仍应保留当时skip，不倒填为通过。T346旧B/H各Home6/6、#1295原修复/采用、T134原独立/CI/Full仍按原头与来源保留，本次23不混入它们，也不改历史UNKNOWN归因。

PLAN中“当前三文件暂无可抵Mac全文件”的缺口由本次执行补齐到**H**。这不是新main无限沿用承诺；后续涉及registry/安装/连接控制链的变化仍按实际增量核证。没有运行新的Full/CI，也没有控制CI、标签或合并队列。

T141仍负责初装/升级origins真实DOM、Home source升级/声明刷新/来源变更确认及失败补偿；本轮未开发或验证升级，不关闭整条BL691/PG046。未来T141可引用本轮未变范围，但其新行为仍需自己的完整证据。S104的另一发布者/安装拒绝沿原独立采用证据，本次三文件不冒成重新跑全T134。BL692/693/694、PG045与真实外部额度/超时、用户验收均另账。

## 清理与证据路径

三个测试后的git status均空；归属路径的node/sandbox-exec/swift/helper/python进程检查为空。随后正常移除本次detached工作树，并删除本次user/tmp/config/cache/data/state/build-home/clang-cache/swift-cache；剩余目录列表为空。最终共享build/browser槽空。没有按进程名称批杀、没有操作其他会话树或进程；原作者/保护分支未动。

原件位于 `/private/tmp/t122-runtime-verify/execution/`：

- `paths.log`、`paths-result.json`：实际隔离路径与原生tmp限制。
- `install.log`/`install-result.json`、`build.log`/`build-result.json`、`build-manifest.json`。
- `home.log`/`home-result.json`、`integration.log`/`integration-result.json`、`connections.log`/`connections-result.json`：完整原文件stdout/stderr、计数、退出码和匹配绑定。
- `final-binding.json`、`cleanup.json`：汇总只为导航，原始日志仍为结果依据。

`run-stage.py`保留实际隔离/串行条件脚本；不在仓库源码内。PLAN与先前Git差异原件保留历史。执行中没有改源码、coord或GitHub，没有读取真实Home/key/账号配置，没有发版或签整单产品验收。
