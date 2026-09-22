# 01 约定、人工验收与版本演化

状态：主验收通过，2026-09-10。depends_on：无。主需求：[../../spec.md](../../spec.md)。处理审查 F1/F2/F9，为后续统一入口/MCP 提供新事实合同。

## 输入、输出和范围

输入：总 spec 的 A 段、当前 GoalEventApplication/GoalEventFacts/GoalEventState、Governance 可信决定、MCP/HTTP 适配、上一轮隔离反例。输出：真实约定修订/人工验收/类型演化可用，任何结果变化不得保持旧完成结论；正式收尾的必要版本不可省略。

先读相关调用，不扫全仓。在编码前给主一个短 technical-plan.md：typed delta 如何表达；当前要求修订与退休的存储/版本；Runtime 引用对具体变化的可信授权；哪些变化撤销哪些旧支持/完成；Web/用户直接操作如何接入；精确文件与针对性命令。不要写生产代码直到主在同一 CLI 会话给出执行消息。此步骤是主内部契约裁决，不是用户审批。

允许修改（执行阶段）：packages/contracts/src/modules/{goal-events,goal-event-state,goals,governance-collaboration}.ts；modules/goals/src/event-* 及相应 exports/migration；modules/governance-collaboration/src/event-decisions/provenance/schema；plugins/native/goals/src/goal-event-application.ts、相关 entry/http/event-document/event-history 文件；apps/mcp/src/goal-event-{tools,commands}.ts、tool-schemas.ts；apps/local-host/src/project-migrations.ts、必要事件身份/注册适配；tests 中这些行为的实际回归。确有公共合同新增文件允许在同模块新增，保持现有结构；不得扩展成新总协调器。

不处理本项外：所有新建入口、树提案 Run 清理、全局 MCP 删除、工作发现/恢复、Skill/README 重写由后项串行处理。当前 public caller 因本项必填字段变化需要同步的可以更新，但不借机重写未涉及行为。主 specs/progress 不由 writer 改，技术方案写本项 technical-plan.md 供主审阅。

## 必须证明的行为

1. 旧反例：已完成的新 intent 替换非空 outcome，未获具体变更授权时 Runtime 拒绝、无副作用；可信用户同意后成功修订且旧完成退出生效。不能仅在 accepted Goal 触发限制。
2. 正式 close 缺失 agreement version 或基于旧约定/配置拒绝、无部分写入；正确版本能保存未成立完成报告或产生真实完成，区分 recorded/completion_applied。
3. 新人工要求在 Module/MCP/HTTP 保存并读回；Runtime supports、未知、未回答/拒绝不能完成；可信接受、仍适用的支持与其它要求满足后才能显式完成。不要靠解析 statement 自然语言设门禁。
4. 针对验收要求的 pending request 阻塞相应收尾，普通建议不全局阻塞；新要求、决定范围和效果一一匹配。未知控制字段显式拒绝。
5. 新版本可改字段显示名、用途/必填/类型或移除字段，旧记录仍按旧版本完整可读；禁止同版本重写。采用规划退出当前使用不删来源历史。
6. 当前要求有明确修订/退休路径；修订使其原支持/人工结论按实际影响过期，未涉及的要求不受影响。降低/退休要求及人工责任变更需要对具体 delta 的真实用户授权，不能重用对另一份 delta/Goal 的批准。
7. 正式变更/批准/重试与并发真实交错：拒绝后无新事实；重试不重复；过期请求不能覆盖；重启后授权范围与当前状态一致。
8. 最小 UI 改动仍在现有规划/要求/决定表单内：用户看得到改什么、为什么、人工要求和错误；桌面/窄屏可用。视觉沿用根 DESIGN，不新开布局方案；UI 验收在合同稳定后由主执行。

## 验证与交回

### 独立验收后的明确裁决（2026-09-10）

初次 writer 定向 49 项通过，但主公共 MCP/HTTP 反例仍发现以下问题，修复后才能验收。以下也消除上次执行消息「未点名要求支持保留」的歧义：

- 更换非空 outcome 涉及整个结果语境，全部当前要求的旧支持和人工结论过期，历史保留；不能只 reopen 后立即沿用全部旧证明重新完成。仅修订某一要求时才保留其它要求的支持。此语义与原 technical-plan 第 46 行一致。
- agreement_change 请求必须保存请求时的原结果和受影响要求承诺。批准时核对这份原文，不能临时快照成后来改过的要求；相关承诺变过则拒绝该旧请求的批准（无部分可信决定写入）。无关类型发布仍不使其失效。不可用「当前还存在同 ID」代替原承诺核对。
- 批准表单不得预选授权。约定变更使用清楚、互斥、必须主动选择的批准/拒绝动作，避免任意业务选项和实际授权效果相矛盾；不从 option_id 或自然语言猜测效果。展示请求时原结果→拟改结果、原要求→拟改要求及具体要求的人工验收变化，退休用可读原文而非仅 ID。旧请求过期时明确提示刷新或重新请求。

独立证据：`/private/tmp/molis-work-flow-cleanup/01-acceptance.mjs` 是严格验收；`01-diagnostic.mjs` 只将各场景隔离以继续收集失败，日志 `01-diagnostic.log` 已证明场景 1 旧支持仍 true、场景 5 过期批准仍可退休新要求。不得放宽严格验收断言。主不编辑生产代码。

主审阅技术方案后的执行裁决（以下优先于 technical-plan.md 中冲突的表述）：

- 任何已有要求的 statement 实际变化均视为保护性变更，避免 Runtime 用改写文字降低承诺；不使用自然语言强弱分类。false→true 可直接提高门禁，但必须使该要求旧支持/结论过期；true→false 需要具体变更授权。
- 人工接受后，更新的 `unknown` 与 `contradicts` 均不能维持当前满足。没有任何当前要求仍不满足最低结果约定。已有完成在任一实际约定变更（含新增/修订/退休要求）后退出当前生效；仅配置/类型变化不撤销无关支持。空操作不产生新的约定版本或历史事件，明确拒绝即可。
- 具体变更授权比较 typed 业务 delta，排除 expected 版本、cited_decision_id、幂等键等传输字段。用户授权须绑定原约定及受影响要求的实际承诺；无关类型发布、规划采用或其它不改这些承诺的配置更新不使授权失效。应用时仍校验调用者给出的当前 config/agreement 版本，相关绑定变化必须使旧授权失效。无需增加 hash 或授权跟踪协议。
- 可信用户直接修改沿用现有 Host 注入身份。Runtime 不能自填用户身份；从 pending request 批准时，效果与 typed delta 必须来自该请求，不能加宽或替换。未知嵌套控制字段与顶层同样拒绝。
- 当前 legacy acceptance criterion 在本项只保持必要读取，不建立第二套修订模型；其一次数据切换由 WI02 明确定义。本项不借此扩展旧执行逻辑。

build 与 boundary；定向至少包含 tests/goal-events.test.ts、goal-events-state.test.ts、mcp-goal-events-state.test.ts、goal-event-http.test.ts 及实际新增场景。新增/修改测试必须触发生产公共路径，断言状态与副作用，不能只验证 schema/对象存在。全仓留最终04，不在本项重复。

交回：实际接口/数据迁移变化、删除/替换理由、实际测试结果、日志与未完成项。主另用独立临时 SQLite/MCP/HTTP 复现，不以 writer 自报代表通过。临时日志目录 /private/tmp/molis-work-flow-cleanup/，前缀01-。

## 主验收记录

- 通过：构建、包边界、五文件 52 项定向回归（0 fail / 0 skip）。日志 `01-correction-{build,boundary,tests}.log`。
- 通过：主严格 MCP/HTTP 反例全部九组；更换结果后旧支持/完成退出，版本拒绝无写入，人工责任与 pending 用途，未知嵌套字段，要求修订/退休和 v1 原文，具体 delta/无关配置/幂等，过期请求批准拒绝且无部分 Governance 决定，Host/SQLite 重启。日志 `01-acceptance-correction.log`。
- 通过：首次建库即记录用户决定，同键重放与重启。日志 `01-first-open-correction.log`。
- 通过：独立 Chrome 真实点击桌面批准、390px 拒绝；前后原文可读、无横向溢出；打开表单后另一用户修改要求，旧批准拒绝无写入，刷新显示过期，可拒绝旧请求后继续。日志 `01-ui-final.log`；截图 `01-approval-{1440,390}.png`、`01-approval-stale-390.png` 已目视检查。
- 本项边界：新事件要求已验证；旧 criterion 的单向迁入由02接续。全仓、各旧入口删除后的回归、完整产品主链在04。本项通过不代表整个9项整改完成。
