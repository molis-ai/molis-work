# Goal 事件改造：实施与交接

2026-09-09。用户已授权开始生产开发，并要求当前 Session 调度、本机 Grok CLI 使用 Grok 4.6 / xhigh 执行；明确不使用 ForkLight。总需求见 [spec.md](spec.md)，界面参照本目录独立原型。

## 交付目标

完成等级 **4：内部完整**：真实 Goal 的定义/规划、事件上报、当前结果、用户介入、历史阅读、异常和重启接续能在本地内部试用。发布、外部账号写入、安装到用户正在使用的应用及正式用户数据库迁移不在本次自动执行范围内；本地测试库和隔离演示项目用于验证。

原型已经证明布局与交互方向，不能代替生产证据。生产实现沿现有 workspace 包边界，不新增笼统协调器或第二套业务事实源。无用代码清理是最终验收条件。

## 工作顺序

| 工作项 | 输出 | 依赖 | 状态 |
| --- | --- | --- | --- |
| 01 事件事实与恢复 | 持久定义、版本、事件、要求报告、分页与重启读取；真实 SQLite 验证 | 无 | 已验收 |
| 02 产品入口与 Runtime | Host/Native Goals 公开应用入口、MCP、规划采用与 Skill；一个新 Goal 的真实闭环 | 01 | 已验收 |
| 03 状态效果与介入 | 可信用户决定、授权复用、Concern 处理、反证、显式收尾与父目标整合；明确新旧状态 owner | 02 | 已验收 |
| 04 GoalDetail 与历史切换 | 新版界面接入真实读写，历史映射/旧入口切换，关键桌面和窄屏路径 | 03 | 已验收 |
| 05 清理与内部验收 | 删除失效代码、依赖和过时文档；迁移、异常恢复、真实完整链路验证 | 04 | 已验收 |

各项进入执行前建立自包含 Work Item spec。共享源码有依赖，默认串行；同一时刻只有一个 Grok writer。主 Session 在其执行时只读源码，处理独立的需求和验收记录。任务失败先定位根因，再续接或修订工作项，不直接换模型完成其代码。

## 执行方式

通过 Grok CLI 的 `--prompt-file` 提交单项工作，显式指定 `--model grok-4.6 --reasoning-effort xhigh --no-subagents`。保留 CLI 会话 ID、运行日志路径与结果摘要；日志是诊断材料，不复制到产品或作为业务真相。是否使用指定模型与档位以实际运行回执为准。

Grok 在当前仓库执行每项允许范围，主 Session 负责检查 diff、运行有针对性的独立验收，并给出下一项输入。没有本会话之外的 Agent 编排器，也不创建新的用户可见 Codex 任务。不提交或推送 Git。

## 初始状态

- 代码分支最初为 `main`；已有未跟踪的本目录设计产物。
- 既有 `desktop/20260902-022934.jpg` 删除与本任务无关，保持原样。
- Node v24.14.0、pnpm 11.9.0；改动前 `pnpm build` 通过，日志 `/private/tmp/molis-work-events-baseline-build.log`。
- Grok CLI 已安装并登录，模型列表缓存含 `grok-4.6`；普通沙箱内模型列表联网被 DNS/网络限制阻止，实际执行需要获准的网络访问。

## 验收记录

按工作项追加实际命令、结果、CLI 会话和必要保留项。未实现、未运行和失败不得写为通过。

**最终状态（2026-09-10）：01–05 均已验收，本次改造达到等级 4：内部完整。** 下文早期未验收文字保留执行过程，以各项最终验收及 [总验收](acceptance.md) 为当前结论。改动尚未提交、推送、安装或发布。

### 04 首轮独立复核

直接 Grok CLI 会话 `37da0e01-5bb2-4e3b-bd24-ccde4a1ebee5` 首轮已交回。主独立 build / boundary 通过，定向回归 104 pass / 0 fail / 0 skip；额外真实 HTTP、旧示例库和 pointer-click/断线注入分别复现错误收尾动作、分页/来源不一致、不可达表单、正文缺失、重复写入及阅读选择丢失。详见 [04 review](work-items/04-goal-detail/review.md)。本项未验收，同一 CLI 会话续接修正，不进入 05。

同会话首轮修正交回后，主独立 build / boundary 仍通过；本次新增事件与旧回归组合为 78 pass / 1 fail / 0 skip，失败暴露旧 toast 等待导致的隐藏点击。原 HTTP/旧历史及多数基础浏览器路径已通过，但组合复核仍发现特殊字段控制碰撞、首屏外选择和筛选丢失、5000 条静默截断、未知报告的错误满足文案、空白 Goal 进展依据游标和 POST 响应丢失恢复问题。详见 [04 review-2](work-items/04-goal-detail/review-2.md)。全新 Grok 只读 finish review 与功能复核合并为下一批修正，04 未验收、05 未开始。

### 01 事件事实与恢复

- 分支：`feature/goal-event-timeline`。
- 直接 CLI 会话：`4f3ddf25-435f-435b-8cef-9cd2ca56e8ff`；显式参数 `--model grok-4.6 --reasoning-effort xhigh --no-subagents`。
- 工作项：[01-event-facts/spec.md](work-items/01-event-facts/spec.md)。调用时提供允许修改范围、禁止真实用户数据迁移、测试与交回要求。
- 本地诊断输出：`/private/tmp/molis-work-grok/01-events.ndjson`、`/private/tmp/molis-work-grok/01-stderr.log`。
- 首轮实现已返回，主 Session 复核复现类型绑定未校验、特殊字段 ID 原型读取问题；同一 CLI 会话续接修复，记录 `/private/tmp/molis-work-grok/01-correction.ndjson`。修复后独立定向测试 12 pass / 0 fail（包含原有 Command/Lifecycle），日志 `/private/tmp/molis-work-grok/01-accepted-tests.log`。
- Grok 报告构建和边界检查通过。主 Session 的独立构建起初被 pnpm 无 TTY 的自动依赖重装预检查阻止，原因是 `enableGlobalVirtualStore` 的环境值差异；以本进程 `pnpm_config_verify_deps_before_run=warn` 保留现有依赖并运行实际构建/边界检查，均通过，`errors: []`。日志 `/private/tmp/molis-work-grok/01-accepted-build.log`、`01-accepted-boundary.log`。未修改依赖或 lockfile。
- 验收：类型/历史恢复通过；要求支持→反证/未知及 Human 来源边界通过；非法输入/跨归属/整批回滚通过；同请求重放、冲突及双连接旧版本拒绝通过；新库/非空旧库升级与重复打开通过；分页与特殊字段恢复通过。01 内无未完成项；UI、正式状态和产品入口仍待后续项。

### 02 产品入口与 Runtime

- 工作项：[02-runtime-entry/spec.md](work-items/02-runtime-entry/spec.md)。依赖 01 已验收。
- 直接 CLI 会话：`4e992b95-709f-4838-b109-b87db9e12e83`；Grok 4.6 / xhigh / no-subagents。新会话读取自包含 spec 和现有公开实现，不复制前项整段聊天。
- 本地诊断输出：`/private/tmp/molis-work-grok/02-events.ndjson`、`02-stderr.log`。首轮已交回，自报构建、8 个集成测试和边界检查通过；尚未验收。
- 主 Session 使用实际构建后的公开 Module/Native Goals API 与临时 SQLite 独立复现：55 条报告状态只读到第 49 条；第二 Goal 采用同名模板要求冲突；采用后省略规划追加局部类型失败；模板升级后原配置请求重试失败；Runtime 支持报告隐藏人工确认差距。另确认缺稳定 Session 时仍生成 runtime 级身份、多规划未处理等价合并。已补齐 02 验收条目，并在同一 CLI 会话续接修复；诊断输出 `02-correction-events.ndjson` / `02-correction-stderr.log`。
- 修复后主 Session 独立构建通过；真实 Host/MCP、SQLite、重启及身份边界回归 22 pass / 0 fail / 0 skipped；边界检查 `errors: []`。日志 `02-accepted-build.log`、`02-accepted-tests.log`、`02-accepted-boundary.log`。另独立重跑原复现，最新报告、跨 Goal 默认要求、追加类型、模板升级重放、人工确认差距和缺失 Session 拒绝均通过，重放无新增事件。
- 02 已验收。新增 Module 端口 `configureRequested(input, resolveAdoption)` 在同一事务内按原请求幂等、解析采用和配置；`listLatestReports` 为有界最新读取。Native `GoalEventApplication` 保持 createIntent/readState/configure/report/listEvents/readEvent，供 03 接入。
- 明确边界：Goal 保存实际采用类型与要求及其来源，不另存未采用默认要求的完整历史模板；后续模板变化时仍可追加本地定义，但不能把未采用的旧默认要求当作已保存约定。正式状态/用户决定及 UI 留在对应工作项。

### 03 状态效果与介入

**最终状态：已验收。** 主独立 build、41 tests（0 fail / 0 skip）、boundary errors=[]，四组真实入口复现通过；冻结时钟回归覆盖同毫秒失败。显式 effects 规范化后作为唯一语义且匹配 scope；同范围后来的可信决定更新当前有效结果，旧 cite 不能覆盖新拒绝。最终日志 `03-accepted-{build,tests,boundary}.log`、`03-effects-full-events.ndjson`，复现 `03-review-{repro,gates,upgrade,effects}*`。03 无剩余事项，继续 04 生产 UI。以下保留过程中的问题与修正记录。

- 工作项：[03-state-and-decisions/spec.md](work-items/03-state-and-decisions/spec.md)。依赖 02 已验收。
- 直接 CLI 会话：`78de56d8-bf63-43c2-bce3-68405a745149`，Grok 4.6 / xhigh / no-subagents；明确单项写入边界、真实用户来源、旧状态 owner 检查和临时数据库验证。
- 诊断输出：`/private/tmp/molis-work-grok/03-events.ndjson`、`03-stderr.log`。首轮构建与指定 32 项测试已通过，writer 正在完成包边界拆分；尚未验收。
- 主 Session 的独立临时 Host/MCP 与 Native/SQLite 复现已确认：拒绝决定可被当作接受风险授权；无效来源可推翻 Concern；旧版本 outcome-only 写入可覆盖；依赖、明确人工验收、现存完成风险及适用待决定未进入收尾门禁；用户拒绝/后续反证与取消恢复状态不一致；无关类型变更误使授权失效；非法 kind 会完成；系统事件历史缺摘要原文且 payload 仍为任意对象。具体反例已追加 03 spec，首轮最终构建后再次独立重跑仍复现，同一 CLI 会话已续接修正，诊断输出 `03-correction-events.ndjson` / `03-correction-stderr.log`。独立脚本与输出在 `/private/tmp/molis-work-grok/03-review-{repro,gates}*`。

- 首轮修正已交回，主独立 build 和原 repro/gates/upgrade 行为通过。指定测试独立为 36 pass / 2 fail，均涉及同毫秒记录按随机 ID 选择旧 closure；新增 effects 接口独立复现效果与 bool 投影分歧、历史拒绝永久阻断、效果超范围。已追加同一 03 spec 并在原 Grok 会话集中续接，03 未验收。

### 04 最终验收（2026-09-10）

已验收。事件事实/字段/有界历史/阅读选择/Goal依据/响应丢失问题已修复；最终定位并修复Host compact正文装配、跨Goal阅读归属、错误整页游标推进、冲突草稿被刷新清空。成功提交测试按本次事件游标与读回完成等待，不再使用旧toast；未保留按工作事件游标跳过整段正文的错误优化。主独立40项相关回归全通过、无跳过；事件组合3条路径及4个实际故障脚本通过，完整build与boundary通过。独立视觉verdict pass判原六项全部resolved，范围限该修正列表。详见[04 acceptance](work-items/04-goal-detail/acceptance.md)。

原生产Grok会话37da0e01-5bb2-4e3b-bd24-ccde4a1ebee5，最后用新鲜上下文865d356e-16eb-4b5e-80d8-ce6d4057e9fc收敛同步与草稿保护；均明确4.6/xhigh。无提交、推送、安装部署或真实用户DB迁移。05开始执行，整体等级4仍待清理、全仓测试和最终文档。

### 05 最终验收（2026-09-10）

已验收。旧五 tab、失效 fragment/records 客户端、无消费者的 context surface、私有辅助函数及独占样式已删除；关系/风险、原资料/输入/输出、原验收明细及 Artifact 精确版本迁入新阅读器。旧草稿仅对未转交 Goal 可编辑，命令层拒绝事件 owner，避免两份约定分歧。Claim/Run、历史事实和 Runtime JSON panels 保留理由按实际消费者列在 [05 spec](work-items/05-cleanup-and-acceptance/spec.md)。

主完整回归 810 pass / 0 fail / 0 skip；其后有限清理用 116 项及两轮各 9 项受影响回归验证，构建和包边界通过。四条真实浏览器迁入路径通过，8 张迁入截图独立审查 disposition: ship，最后原标准两张截图经主复核。中英文产品文档与 Skill 已同步，最终 DESIGN/sidecar 已写入并复核。生产文档收尾 CLI 会话 fa042ada-1a65-443f-a03d-81d6df5df8d4、56e8b918-dd37-4ac1-8252-394c5cb1b681；设计 documenter 会话 4cf932c0-069a-46ae-b6de-ab00ad04f7d2；均直接 Grok 4.6 / xhigh。

隔离 SQLite 的真实本地服务已启动、在浏览器实际打开并刷新验证：[试用目标](http://127.0.0.1:49797/goals/goal-4facb41b-7ac0-41d4-bbd6-588f4a5fec2a)、[空白目标](http://127.0.0.1:49797/goals/goal-09869bf1-26fa-4ca7-8a99-e7f8677f5d95)。详细证据与三项非阻塞视觉细节见 [05 acceptance](work-items/05-cleanup-and-acceptance/acceptance.md)。真实用户数据库未改；安装发布、真人长期试用与性能收益未验收。
