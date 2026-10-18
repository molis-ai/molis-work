# ALC-RES 实现独立复核

2026-10-18。复核对象：`wt-alchemist-runtime`，HEAD `5fcd5e052` 加当前 ALC-RES 未提交实现。只读生产代码与测试、核对原始日志；未运行构建、浏览器或全量测试，未改 A 工作树。RES08 正在按 root 已确认缺口窄补，本文不能作为该补丁的验收。

结论：本次后端审阅未发现新增 Blocker/P1。可交由主会话在最终冻结版本核对构建、合同快照与集成门禁。RES08 的原预算、已预约、剩余及“未知调用可能已收费、继续可能重复收费”提示仍须补齐并验收后，才能称整个 RES 完成。

## 核对的关键行为

- `local-runtime` 移除启动时身份、设置、Pulse 默认值写入与 recoverExpired；动作执行器只给 command 初始化，runContinue 则在类别权限检查、确认与当前权限检查之后初始化。查询与打开不会使历史 queued/running 自动执行。worker 只消费内存显式 acceptance。
- `JobResumption` 对类别保留 generate 或 collect，actor 来自本轮调用上下文；旧 input.actorId 不决定继续者。探索确认包含当前模型选择身份与 Taste 版本，ready_to_persist 不重新发现模型。worker 同步预留防重复，pending 不领租约。
- `LocalWorker` 每次领取、续租与提交都核对原 authority；提交在同一 SQLite immediate transaction 内复核 lease owner/expiry，迟到失败也不追加失败记录。stop 同时关闭 acceptance 并撤销 active，lifecycle 等 drain、worker、action 完成后关库。
- Lens 的 call_started 全历史是累计预约账本；call_dispatched 只回退到安全 checkpoint，不减计数。所有新请求和格式纠错先持久化预约，重试不重置 budget。四类未知调用均有独立恢复用例，历史缺项、改预算与过期 dispatch marker 拒绝继续。
- MCP retain 从首次 authorized caller 的 allowed_actions 固定权限来源动作 id/version/provider/permissions，再与最新授权及目录求交；新授予同权限动作不能替换已撤的原来源。HTTP 把请求 signal 放在当次 control，正常响应结束不反向取消 accepted background；acceptance 之前断连仍拒绝。
- SEL 原真实 runtime 路径携带 per-call AsyncLocalStorage guard：DNS 后、TLS 写正文前、后续请求、opaque mutation、secret mutation、content write 均检查当前原 authority。搜索与 Studio shutdown 的等待保留。
- WorkReuse reconcile 将源 job 的 guard 带给 linkConsumption 接收方，并以同一 lease commit 更新 pending receipt。生产 WorkReuse Host 仍未注入，不能宣称生产外部成果引用闭环已实现；当前证据是 fixture 接收方实际调用 guard 后写 ledger，已覆盖迟到撤权无外部边、无 receipt 更新。

## 已查看的证据

- `/tmp/alchemist-search-authority-tests.log`：8/8，HTTP 正常响应保留任务、接收前断连；MCP 回包后完成与固定来源撤权；真实 SEL 路径 DNS/TLS/response/extract 暂停撤权。最后四项不等待 worker 轮询，直接观察连接/正文计数、opaque rows 与 content files 不变。
- `/tmp/alchemist-resumption-integration.log`：10/10，零业务初始化、当前 Taste/actor/模型确认、ready 去重、类别权限及四类未知调用继续累计。
- `/tmp/alchemist-resumption-unit.log`：12 文件 47/47，包含 acceptance、租约、恢复、服务及 WorkReuse 迟到链接。
- 已读 `security-invariants-alchemist-resumption.test.ts`、`explicit-acceptance.test.ts`、`lens-budget-history.test.ts`、resumption integration 和 WorkReuse revocation/fixture；测试不是只数结构，走生产 worker/SQL/authority 路径并检查副作用。
- writer 提供 `/tmp/alchemist-search-build.log`、`/tmp/alchemist-pulse-authority.log`、`/tmp/search-effect-authority.log`、`/tmp/alchemist-resumption-ui.log`；UI 原有 1/1 不能替代待补 RES08 预算提示的最终验收。
- scoped `git diff --check` 无输出。未重复跑已有效用例。

## 交付边界

主会话仍须在最终 UI 补丁与合同快照冻结后对照实际版本裁决；共享 contracts/kernel/storage 变化的集成构建/全量/health/API/actions/assets 不能由这些定向日志替代。已知 Pulse 巨大单元与 API 快照问题归 writer/root 处理，本复核不放宽门禁。未发起 PR、未合并、未操作真实 Home。

## RES08 预算提示窄补独立复核（2026-10-18）

本节覆盖后续新增的 inspect/read ledger 分工、ResumeView/schema、客户端提示与对应测试，取代上文“预算/收费提示尚未实现”的代码状态；其余后端不重审。结论：本片未发现 Blocker/P1 或必须修改项。真实浏览器复验仍在排队，本节是代码与已存在定向日志的审阅结论，不是最终 UI 实操通过。

- 原 budget.limit、reserved=合法 call_started 条数、remaining=limit-reserved 均由同一 ledger parser 派生，没有第二份持久化计数。中文“已预约”与英文 Reserved 不宣称已扣费；未知提示明确“可能已收费；继续可能重复收费”，且仍计入原预算、不增加预算。
- inspectLensProgress 只把 exhausted 变成可展示状态；readLensProgress 继续在需要新调用且预算耗尽时拒绝。view 使用 inspect 分支，submit、等待后再次校验、worker claim 前均使用默认严格分支，前端隐藏确认按钮不承担执行权限或预算校验。
- 合法 call_dispatched 才给 unknownCall，四类 operation 保持严格枚举。损坏计数、预算不匹配、缺失预约或无效 checkpoint 在 parser 内失败，view 不返回猜测的 budget=0，也不会允许提交。
- 原计划 modelId 从绑定 plan 取出；界面只用同一 id 查 label，找不到就显示原 id，不改为当前默认模型。探索模型/Taste 的既有 confirmation 行为保持。
- remaining=0 并不一律拒绝：已成功 collecting_complete 且 limit=1 的安全 checkpoint 可完成 partial report，无新 search/generate/listModels；unknown collecting 且 limit=1 则仍拒绝。这与原执行 handler 的分支一致。
- 已读新增测试：四类 unknown 的 view 精确数字与原模型；unknown exhausted 的 view/submit 一致且数据库事实不变；安全零调用完成且预约数保持1。原始 `/tmp/alchemist-resume-budget-tests.log` 为 11/11。e2e 源码新增 1/1/0 耗尽摘要与 8/3/5 可继续摘要、重复收费提示、原模型、查看不派发、桌面手机截图断言；尚未把未运行结果算作通过。

未写 A、未运行构建/测试/浏览器/全量。最终仍需 root 核对新版 UI 实操结果，以及按实际 bundle 与已接受合同更新处理资源/API/actions 门禁。
