# 最终架构与包重组审计

日期：2026-09-08。审计对象为当前工作区的最终生产实现、清理修复及配套文档；没有 commit/push 或公开发布。范围以 [总需求书](spec.md)、已确认的 Outbox 后置决定及 [Cutover 工作计划](cutover-work-plan.md) 为准。验收证据详见 [统一验证记录](cutover-validation.md)。

结论：本次“迁移现有能力”的要求通过，完成等级为内部完整与本地可安装发布候选。`contract-only` 包和 `partial` 包中的未来契约不算已实现；服务端、Team、Outbox 与公证等明确后置项如下标为不适用。不是整个长期产品路线图全部完成。

## 初始要求逐项核对

| 初始要求 | 结论 | 当前代码、行为与证据 |
| --- | --- | --- |
| §1–3 重组目标、保持已有功能、避免扩展新产品 | 通过 | 旧实现退出；npm consumer、Web/CLI/MCP 同项目完成 Goal 闭环、Native App、重启恢复与安装回滚均实测。四个实际缺陷修复后复验；未增加新功能域。 |
| §4 User/Team/Project 产品身份与所有权 | 通过（本地范围） | Projects Module 拥有身份和 membership；Local Host 组合文件生命周期；Private Work Context 拥有 Runtime 绑定。projects-module、project-catalog、workspace-project-actions、session-project-binding-router 回归覆盖持久化和项目隔离。board_id 仅为既有协议兼容。 |
| §4 Team 权限、受限项目、成员管理的实际产品 | 不适用 | 已明确后置，identity-team-access / Server 不注册假 Provider；不把分包说成 Team 已可用。 |
| §5 16 个事实 owner | 通过 | 16 Module 物理包和 Contract subpath；Goals/Feed/Source/Signal/Execution/Evidence/Governance/Artifact/Session 事实各归其 Module，SSOT-MATRIX 对 contract-only 和 partial 分别说明。 |
| §6 Goals、Artifacts 一等 Native Plugin；稳定引用与缺失 consumer | 通过 | Native Goals/Artifacts 与 Module 分离；Artifact 版本引用与本地安全读取回归；plugin-sample.e2e 真实外部样例，Native App 实看未安装 consumer 的原始内容回退。合成 QA Artifact 有明确标注。 |
| §7 Context Ledger、关系归属与私有信息 | 通过 | Context Ledger 拥有类型化关系，Session/Handoff 关联由私有 owner 经公开 API 保存；session-ledger-migration、handoff-ledger-migration、session-content-privacy、plugin-private-storage 验证。 |
| §8.1–8.4 Module / Horizontal / Plugin / Kernel 分工、调用依赖 | 通过 | Entry → Local Host → Native 用例 → Module public API → owner Repository。Kernel/Plugin Runtime 持能力与授权机制，Provider 协议归 Integration；check-package-boundaries 和带反例的 boundary tests 无错误。 |
| §8.5 Local / Server / Remote 边界表达 | 通过（Contract） | 完整包地图区分本地装配与交换/Team 边界；Server/Exchange 不反向复制本地状态机。实际 Server/Remote 部署不在现有迁移范围。 |
| §8.6–8.7 UI Contribution 与一级 Native Plugin | 通过 | Workbench/UI Host/Design System 提供壳、Slot、注册和视觉基础；Native Plugin 提供产品 UI。Chrome 导航、Plugin 样例与实际 Native 窗口验证；390px Feed 详情实看，无假静态页面代替行为。 |
| §9 Exchange Server 的实际存储、转发与多端部署 | 不适用 | 本次确立边界与 Contract，未来交换服务不属于当前重组实现。 |
| §10 当前可靠写入、事务与持久化 | 通过 | Module 拥有业务 schema，Storage 提供技术连接/事务/Journal，Host 同连接装配。goals-command-module、feed-upgrade、feed-receive-chain、governance-collaboration-module、execution-module 等覆盖回滚/幂等/并发/恢复；UI 与 CLI/MCP 的同库事实核对通过。 |
| §10 新 Outbox/同步投递能力 | 不适用 | 用户已确认后置；保留既有事务与事件行为，未以重组要求擅自实现新 Outbox。 |
| §11 物理包地图、Contracts 分发、App 组合 | 通过 | 48 workspace 包、30 public Contract subpath；各包 manifest/README/build/typecheck 和图门禁通过；新包由真实入口消费。Contract-only 不返回伪成功。 |
| §12 初始源码职责映射与 caller 退出 | 通过 | src 仅 index.ts、sdk-types.ts、sdk-store.ts、cli/main.ts、mcp/server.ts、web/server.ts；旧 v1/feed/projects/sessions/desktop/install 目录实现退出。0 compatibility allowlist。0.1.x 根 SDK 出口转到唯一 owner，迁移矩阵列明兼容范围。 |
| §13 Huge Class 职责治理 | 通过 | 原 Coordinator、Store、renderer、server 不再存在；Native 应用按契约、执行、工作状态、验证等职责分开，Host GoalProjectApplication 只装配/转发。复审当前大文件而非只检查旧名单，详见 HUGE-CLASS-MIGRATION；长文案/CSS 没有机械拆碎。 |
| §13 调用链和无业务旁路 | 通过 | SQL/Repository 归对应事实 owner；Host 提供同库技术事务，App 不复制状态规则，Module 无跨 Module 实现依赖、Plugin 无 Plugin 实现依赖；静态禁区与真实错误/权限/重启行为共同验证。 |
| §14 开发文档与就近 README | 通过 | SSOT-MATRIX、ARCHITECTURE、PACKAGE-BOUNDARIES、MIGRATION、HUGE-CLASS-MIGRATION、相关 Module/Horizontal/Platform 和中英文开发入口已同步。旧阶段记录明确标历史，当前 caller 描述更新。 |
| §15–16 未来策略与撤回假设 | 通过 | 保留 User/Team → Project、轻量 Exchange 和四层职责；未恢复 Space、全能 Server、任意 Plugin 私有状态同步或通用 Manager。未来自动化/通知/团队策略未伪装落地。 |
| §17–18 迁移前置门槛与逐包 Contract 方法 | 通过 | 初始 owner/包边界/拆分图/文档矩阵先确认，串行垂直切片各有工作计划、验证与退出记录；最终运行包图和反例检查，非仅人工约定。 |
| §19 Foundation 当前能力 | 通过 | Storage、Kernel、Plugin Runtime/SDK、UI Host、Design System、Test Kit 的现有实现被正式 caller 消费；Plugin 样例/授权撤销/私有存储/Artifact 实测。观察平台完整实现、Exchange 等仍保持 contract-only。 |
| §20 Module 当前能力 | 通过 | 现有 Goal/Feed/Session/Execution/Evidence/Decision/Artifact/Project 行为迁至唯一 owner，各模块恢复/事务和跨入口测试通过；Actions、Automation、Team/Sync 的新增产品行为不适用。 |
| §21 Horizontal 当前能力 | 通过 | Connector/Listener/Runtime 负责连接、cursor/lease/delivery、进程/流恢复等技术状态；Native Feed/Work/Goals 做业务判断。真实 PTY、Source 重试、Session 中断/恢复回归通过；通用 Scheduler 后置。 |
| §22 Plugin 与 Adapter | 通过 | Provider 协议/OAuth/scope/cursor 就近在 Integration，Native 用例消费 Contract，Host 绑定可信身份、技术 Adapter 和事务。Provider fixture 及真实 RSS 路径、Plugin 样例通过。未重做 Gmail/GitHub 外部 OAuth 授权。 |
| §23 App / Tooling / 发布入口 | 通过 | 一个 Local Host 装配，多入口协议适配；Root 仅 launch/SDK。Tooling 就近、示例不进入生产包树；全新 npm 消费和正式 DMG 安装启动验证，源移走后 MCP 仍可运行。 |
| §24 先开发 → 真实 E2E → 清理 → 复验 → 总审 | 通过 | 统一验证报告记载人工 UI+公共后端、实测缺陷、最终修复、755 项完整运行与唯一旧断言定向复验、Native/安装及最终环境清理。未将源码/单测当人工旅程。 |

## 旧实现退出与 SDK 兼容的精确边界

`src/index.ts:2` **仍导出旧名称 `MolisWorkCoordinator`**，具体代码是 `export { GoalProjectApplication as MolisWorkCoordinator, importV3Board } from "@molis-ai/molis-work-app-local-host"`。因此“这个符号已经删除”不成立，本报告不作此声明。另有 `sdk-store.ts` 的 51 行旧读取适配及 `sdk-types.ts` 类型别名。

保留依据是 [Cutover 工作计划](cutover-work-plan.md) 的“根SDK与零caller兼容文件收尾”（453–457 行）：本次重组保持已发布 0.1.x SDK 行为，保留公开别名与只读方法，不能静默破坏该版本消费者。删除这些名称需另行破坏性版本决策。

实际删除的是 `src/v1/coordinator.ts` 的跨领域实现、旧 Store 的 SQL/业务职责以及内部 caller 对这些旧路径的引用。源码搜索没有 `class MolisWorkCoordinator` 或旧 coordinator import；新 `GoalProjectApplication` 装配公开 owner 并具名转发。139 项 SDK/迁移回归覆盖通过根 index 使用旧 API 仍落到新 owner 的同一事实。故 cutover-clean 的结论只表示旧职责/重复事实退出，**不表示所有兼容符号清零**。0 compatibility allowlist 是依赖门禁豁免数量，也不表示没有 SDK 兼容面。

## 自动检查与可复现入口

- `NODE_NO_WARNINGS=1 pnpm test`：最终生产代码完整构建与 755 项执行；754 通过、1 旧字面断言失败；更新该断言后定向复验 1 通过。没有宣称另一次全量 755/755。
- `pnpm workspace:typecheck`、`node scripts/check-package-boundaries.mjs`：通过，0 豁免、0 边界错误。
- `node --test --test-concurrency=1 packages/test-kit/tests/*.test.mjs tests/*.test.mjs`：23 通过；覆盖禁止依赖反例。
- `node tests/npm-distribution-smoke.mjs <clean-consumer>`：最终打包后的原生模块、安装/升级/回滚/恢复/卸载通过。
- `env -u APPLE_SIGNING_IDENTITY pnpm desktop:build:macos`：App/DMG/zip/ad-hoc 签名通过，真实临时安装与 Native 启动见统一报告。

## 清理与交付

真实用户 Home 没有升级；临时 Native 验收结束已恢复原 4173 服务。最终 4197 测试服务停止，整个隔离测试 Home 删除，包括误读取账号后落入测试库的 50 条通知副本及测试凭据。详细事实和收据见统一报告。

当前没有未解决的本次迁移缺陷。未来功能、Apple 公证/公开发布及现用安装升级不在本轮完成声明内。Molis Work 的父子 coverage 历史版本提示应单独按正式协议核对，不通过修改数据库或降低验收规则来消除。


## 正式验收状态

2026-09-08 14:19 UTC，Cutover 的 Evidence `evidence-6758ff00-482d-4d0e-9db8-3dbaf9f04a60` 经 self_verifier Review `review-fbec8d02-b66f-4903-af65-892e8eb135fe` 通过。重新读取 canonical Contract：Cutover 为 valid/satisfied、display_status=completed，且无 active Claim/Run；根 Goal 也已 valid/satisfied、progress=verified。

根 Goal 仍显示历史 `coverage_revision_stale` 澄清提示，因此其 UI display_status 为 continue，不能声称整棵树没有提示。这是父子覆盖版本登记待核对；本轮没有另改已确认 Contract 或直接修改数据库来消除提示。它不改变当前 fulfillment=satisfied 的事实，也不表示需重做已经验收的开发。

自动审批曾因 SDK 旧名称仍存在而拒绝第一次 Review；补充精确代码、既有兼容范围和“旧实现/旧符号”区别后重新提交成功，未删除兼容 API 来绕过检查。
