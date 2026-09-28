# 全量切换前审查

2026-09-06。只读审查与执行准备，不是 Cutover 已执行或产品验收通过。沿用总 spec §24 和已接受 Cutover Contract；不改 Goal、依赖、完成标准或生产代码。

## 当前判断与实证

正式 Available cursor1256：Cutover 被 DD 父项未完成、assurance 未完成阻塞。范围提案 `goal-tree-proposal-0500bb62-7509-4934-abf0-0bb3d36e8249` 和 DD 提案仍需各自明确决定，自动 goal 续接不是批准。本次未领取或执行受阻 Cutover。

实际运行 `node scripts/check-package-boundaries.mjs`：48 packages、519 sources、1606 imports、71 dependency edges、30 Contract subpaths、10 compatibility entries、4 legacy huge files、0 errors。这里只证明现有迁移期门禁通过。脚本 `checkCompatibilityAllowlist` 允许列明退出责任的大文件继续存在；`checkSourceImports` 主要检查目标 packages。不能把通过当作旧实现清零。

使用 TypeScript AST 检查仓库内静态相对 import/export，并逐段读取关键实现。下表行数按换行拆分统计；caller 数量去除测试，未把文件名、行数或搜索无结果当作退出证明。

| 剩余路径 | 行数 / 生产调用者 | 实际仍承担的职责及退出方向 |
| --- | --- | --- |
| `src/v1/coordinator.ts` | 2678 / 7 个文件 | 构造多个 Module/Plugin，仍实现 Ready/Available/Explain、work-state、Policy/Impact/Review/completion 组合判断。构造归 Local Host；跨模块用例与只读投影归 Goals Plugin，领域判断归各 Module。不能只迁一个同体积的 Coordinator。 |
| `src/v1/store.ts` | 778 / 9 个文件 | 连接/事务、跨 owner schema 升级、snapshot/event/idempotency 及旧 Query 转发。保留原同连接原子性，迁移脚本由各事实 owner 维护，Host 只装配；旧 Store 类型和实例最终退出。 |
| `src/projects/catalog.ts` | 1797 / 5 个不同文件 | Projects API 外仍有 Runtime binding、个人规划方法 SQL、项目文件创建/删除、旧数据库初始化及 Desktop 转发。Project/Private Work Context/Goals/Local Host/Desktop 各接自己的职责。 |
| `src/feed/store.ts` | 751 / 6 个文件 | 除公开 Module 转发外，仍直接读写 Feed 导入回执、读取迁移回执和写旧 events；配合 Connector/Source/Relay import caller 切换。不能把所有剩余内容统称无行为 facade。 |
| `src/web/render.ts` | 2255 / 4 个文件 | 多数 UI 已挂 owner，但仍有 Human Review、事件历史、进度/Companion/Quick Record、Onboarding/Settings 模板和组合。分别归 Goals 应用 UI、Workbench 组合或 Desktop Shell，不能全部塞进 Goals Module。 |
| `src/web/server.ts` | 3221 / executable + 18 个测试文件 | 真正 HTTP 生命周期、认证、请求路由、资源/缓存/调度和页面构建；1833 行仍经 `withProject` 解包 `{store, coordinator}`。Local Host 负责正式数据组合和有限 Capability；Workbench 负责 HTTP/UI transport 与页面组合，保留原错误、响应头和清理顺序。 |

`src/web/server.ts` 没有其他生产文件的静态 import，并不等于无 caller：root bin 和脚本仍把它作为进程入口。root `package.json` 仍有 `dist/{cli,mcp,web}` bin、`src/` 开发命令和 `dist/index.js` export，必须连同安装 staging、Tauri bundled runtime、外部消费者一起切换。

重要调用链：

- CLI/MCP 已消费 Host Capability，但 `src/local-host/composition.ts:67` 仍创建旧 Store/Coordinator；不能仅凭入口薄化宣布实现退出。
- `src/projects/catalog.ts:1471` 也构造旧 Store/Coordinator 用于新项目初始化，1496 行另开旧 Store 检查历史 Board。Host 注释“唯一构造点”不能替代这些真实 caller 的审查。
- `src/v1/execution-validation-ports.ts:42` 把旧 Store 放进应用 Ports；Claim/Run/Verification 文件和 work-state 查询还消费它。迁应用前需把存储访问缩为具名 Query/Command、事务及幂等端口，不能通过给新包传入旧 Store 隐藏依赖。
- `src/projects/catalog.ts:319–353` 直接管理个人方法表；这与项目级 Goals 方法边界不同，需保留 personal/project 优先级和历史数据，不得删除而只保留项目级方法。
- `src/feed/store.ts:191/472/600` 的回执/事件仍有数据语义；Relay 导入完成、幂等、错误状态和旧事件历史都属于迁移验收。

## 开发顺序与边界

正式前置完成后，在原 Cutover 范围内串行实施，复用现有 owner 和公共契约：

1. 把剩余存储、schema、事件/幂等和 Project provisioning 的真实所有权定清；保留现有同连接事务、数据格式、加密密钥及回滚，不新增 Outbox、在线备份或 Server 产品。
2. 迁剩余调度/完成/执行验收用例及 Host 装配，切断旧 Store 暴露；以当前生产行为和原回归验证身份、租约、重复提交、错误顺序、恢复及状态一致性。
3. 迁 Catalog/Feed 的剩余应用与技术适配，逐一切换列出的实际 caller；按公共 API 核对数据库、事件、正文和重开后状态。
4. 完成 Web transport、页面 read model、剩余模板与 Desktop/App 组合；清除 `{store, coordinator}` 注入和 `src/` 间接回流。每步验证对应页面和异常恢复。
5. 切换公开 entrypoint、开发命令、构建/安装/bundle 与测试引用。只有全部正式 caller 已切换，才删除对应旧实现；后续整理清除闲置聚合、样式与文档历史。不可把整个 `src/` 换名搬入 Local Host。
6. 全部开发结束后，执行下方完整用户前后端旅程；根据发现做代码清理/缺陷修正；再次完整验证受影响旅程，最后对初始架构逐项总审。

这不是新建六个 Goal 的要求。步骤共用 Host、schema 和 root entrypoints，默认串行；不扩大并行或建立额外协调机制。样式/翻译数据的大文件需检查内容 owner 与重复来源，不因千行阈值机械拆分。

## 用户行为与后端验证矩阵

| 用户旅程 | 实際操作与需要对账的结果 | 现有起点及证据边界 |
| --- | --- | --- |
| 首启/Project | 空 Home 首启、新项目、旧数据导入、切换、重开、删除取消与错误路径；Catalog/项目 ID、正文/历史和外部工作区保持正确 | `e2e.test.ts`、Project/upgrade tests；最终必须真实页面与干净发布物 |
| Goal 规划与决定 | 浏览器新建 Draft、编辑/校验、树/关系/依赖、Proposal 接受/拒绝/修订、失败重试、archive/trash/restore；查询/事件/Revision 与页面一致 | `goals-*.e2e.test.ts` 的 Chrome 鼠标/表单路径；不能只调用内部决定方法 |
| 执行与验收 | CLI/MCP 领取/Run、浏览器观察、失败/租约/重试、Evidence/Review/修正、父子完成；核对同一项目正式事实及重启恢复 | `proposal-entry-chain.test.ts`、V1/coverage/Local Host tests；补齐真实 UI 与各入口组合 |
| Feed 与 Sources | UI 添加/配置 Source、导入/刷新、读取/归档/恢复、转 Goal、错误/取消/重复/游标恢复；核对 Source/Signal/Feed/Attention 与回执 | Feed receive/module/connectors/native UI tests；外部 Provider 使用受控协议 fixture，明确非真实账户 |
| Work/Session/PTY | 目录发现、Session 创建/打开、真实终端输出、正文/记录、关联/handoff、断线/重开、跨 Project 隔离 | Session workspace/web/content/handoff tests；真实 UI 及 Native Adapter 需另验 |
| Artifacts/上下文 | 真实页面查看精确版本、嵌入、复制/导出、未知/归档/缺 consumer、跨项目拒绝；原 Goal/Evidence 不被隐式改写 | Artifact HTTP 和 clipboard Chrome tests；两类证据不能混称全部浏览器操作 |
| Settings/Plugin | 中英文、主题、窄屏、默认窗口/全屏、安装诊断/重启取消与确认、Plugin 启停/撤权及缺能力反馈 | 实际 App 的 DV4 已有证据；最终合并代码须验证变更链路，VM Bootstrap 单测不是 App 实测 |
| 发布与恢复 | 干净 npm consumer/实际 App 启动、旧版升级、失败回滚、卸载保留/重装、密钥/正文恢复；操作前后 Query 与磁盘正式数据相符 | DV4、`npm-distribution-smoke.mjs`、Home recovery；本次没有再次运行或公开发布 |

每条旅程同时保留输入、用户可见结果、公共 Query、持久化状态、事件/Receipt、重开后的可观察行为。共用临时 Home/项目和隔离服务；使用受控 Provider fixture 不等于省略产品前后端闭环，也不以真实账户写入作为默认验收条件。

## 已识别的测试证明缺口

- `tests/local-host.test.ts:83` 显式注入同一个 Host 给 CLI/MCP，所谓 Workbench-style client 是直接调用 Capability，没有打开浏览器。它证明嵌入式 Host 内部复用与幂等，不能单独证明实际三入口用户旅程。
- `tests/e2e.test.ts:160` 使用 `npm pack --ignore-scripts` 后，把依赖 symlink 回当前仓库，后续采用测试宿主替身。保留其故障/协议回归价值，但干净安装必须使用正式 staging tarball + 无仓库依赖的 consumer，并复用 `npm-distribution-smoke.mjs` 的实际路径。
- `tests/fixtures/goal-browser.ts` 使用真实 Chrome、独立 profile 和坐标点击，但没有 Chrome 时会 skip。最终验收须报告实际运行/跳过，不能把没有浏览器当通过。
- `tests/feed-connectors.test.ts` 中 “live adapter” 注入了 `fetchImpl`；它验证 Provider 协议行为，非真实账号接入。Session workspace 的 native 场景也启动临时 Node app-server fixture，不代表真正 Codex/Tauri 用户路径。
- `tests/artifact-browser.test.ts` 主体是 HTTP 调用与状态断言；浏览器剪贴板和导航另由对应 Chrome 测试提供证据。

## 总审退出条件

逐项对照原要求：唯一事实 owner、Module/Horizontal/Plugin/App 分工、强类型公开 API、无跨 Store SQL/隐藏旧对象注入、无重命名后的 Huge Class、完整 caller/运行入口切换、旧路径与兼容豁免退出、数据/密钥/事件/失败恢复兼容、真实前后端操作与清理后复验、干净发布物/文档命令一致。任何一项证据不足都保留未完成，边界检查全绿不替代以上结论。

当前只完成本审查及迁移期边界检查；没有运行全量测试、真实 UI 或最终 E2E，没有修改生产逻辑，不能据此通过 Cutover。
