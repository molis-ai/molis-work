# W5-10 C3：Gmail 巨大单元等价拆分

状态：本 Gmail 区域的源码拆分与定向工程验证完成，待 Claude 首评、独立 TEST、统一 full 与集成。Codex（实现 1）保留 C1 完整 owner，原各片留在准确固定 PR 上审验与落地；本区域不代表 C3 整体或整条防腐线完成。

准确基线 `584112c65477baf907620d86657d1582d92e9eda`。开工时 21 个 open PR 的完整路径均无 Gmail；206 个本仓工作树对 Gmail 源码均无未提交或未跟踪改动，协调表没有具体 Claude Gmail writer 认领。收尾鲜核 23 个 open PR 仍无 Gmail 路径。两份触及巨大单元表的在途实际 patch 只改 agent-host 段，无 Gmail 变更行。本片只改 Gmail 四个目标文件、必要的同包私有模块、直接回归/README、本 slice 及巨大单元表的 Gmail 对应行。新增公开端口回归不依赖 live/macOS、5 项约 0.5 秒，按现行 CI 子集规则只加入该文件一行；鲜读 #1240/#1064 的清单 patch，均不在 Gmail 段，不改其他清单项。

使用现行 `check-health-gates.mjs` 的 AST 测量代码，在该基线上实测五个巨大单元：pending factory 178 行、token lifecycle factory 168 行、OAuth factory 177 行、provider factory 177 行及 provider 文件 910 行。表内旧的 170/198/957 不是本次基线。现行阈值为文件不超过 800 行、函数不超过 150 行；类不超过 300 行/25 方法，本片不引入类或例外。测量原件在 `/tmp/molis-verify-2026-10-24/c3-gmail-giants/units-before.json`。

三个 OAuth factory 保留装配职责，把现有内嵌函数提到同文件模块级，显式传入原 Ports、配置函数和同一实例的 pending/token 方法。每次实例仍持有自己的依赖，原动态 secret 读取、方法接收者、函数引用的捕获时刻、默认 fetch 和时钟读取位置不变，不提升可变状态到模块级。刷新比较原 refresh token、同步 `beforePersist`、写入 access/refresh/expiry 之间的顺序保持；授权完成仍先消耗对应 state、网络交换、核邮箱身份，再同步取得 refs 与写凭据。

Provider 的配置快照和 usable-token 闭包仍按实例装配；health/sync 的操作移成模块级函数，显式依赖保留原接收者和调用时序。完整/增量同步及请求路径归同包私有同步模块，邮件映射/路由分类归私有消息模块，确定性夹具归私有夹具模块。沿用原 profile→list/history→detail 顺序、分页/详情界限、游标推进与失败边界；fixture 只在原明确开关下使用。移动函数同时降到阈值内，保持单一实现，不增加通用框架或公共子路径。

不改公开 exports/方法参数返回结构、动作/Manifest、OAuth 安全授权/刷新/取消/secret 范围、分页与数据语义、错误内容或降级策略。不做 OAuth 迁移，也不接静态 Catalog 例外、design-system/ac-giants、Memory、scheduler 或其他横向区域；不调整门禁、阈值、例外、共享 baseline 或真实 Home/账号。

- **RAC-124**：pending factory 降到阈值；现行 PKCE/state、时间、redirect、client 身份拒绝和单次取消保持，两实例不串用 Secret Ports，原可变存储方法的 `this` 保持。
- **RAC-125**：token lifecycle factory 降到阈值；读取/一次刷新/refresh-token 复查/同步 `beforePersist`/写入次序保持，拒绝不写凭据，不出现跨实例或跨连接 token。
- **RAC-126**：OAuth factory 降到阈值；原创建参数、挑战值、独立 pending 状态与取消、邮箱 refs 解析和凭据提交顺序保持，不添加异步间隙。
- **RAC-127**：provider factory 降到阈值；health 与 sync 继续调用原实例 resolver，保留 opts 方法接收者、fetch 的原调用方式和按次重新取 token，实例状态与时钟调用不串用。
- **RAC-128**：provider 文件及新私有单元均在阈值内；公开生产入口继续得到同样的邮件映射、范围/分页上限、完整记录与游标进度，错误/取消不被重解释，API 快照无 diff。

先整体构建基线，核原有效覆盖并补公开入口的接收者、闭包状态及顺序回归，再按职责移动，重建后跑同一有效测试集合。包 README 必跑 `tests/gmail-oauth.test.ts`、`tests/feed-connectors.test.ts`、`tests/integration-pagination.test.ts`，按实际影响补必要测试；用同一现行 AST 测量和准确 merge-base health 交下降证据。边界、类型、API 快照、实际 diff 与 fresh-fetch 后逐提交 secrets 一并核验；公共构建槽、专用测试资源、Claude 唯一 full 排期保持，不另起 full。不在功能 PR 刷共享 baseline，由最终批统一处理。最终一个完整非 Draft 区域 PR 交流水线、Claude 首评与独立 TEST，必要修复由专职按固定新头接续；不以工程结果冒真实 Gmail 账户连通或本人验收。

2026-10-24 工程验证：**RAC-124–128 通过**。四个 factory 实测分别 178→8、168→8、177→14、177→63 行，provider 文件 910→263 行；新同步/映射/夹具文件为 446/176/38 行，最大函数 93/53/11 行；Gmail 巨大单元 5→0，无新例外。43 个原函数/方法主体按 AST 打印器对照基线，除显式依赖传递外一致；原 usable-token 闭包与配置捕获留在 Provider 工厂内。这只作为移动的辅助核验，业务证据来自公开生产入口回归。

2026-10-30 注：RAC-124–126 说的 pending、token lifecycle、OAuth 三个 factory 随 W5-11 第 6 片（T-064）删除——Gmail 改走声明式的通用 OAuth 流程，包里不再有 OAuth 代码；这三条的行为（PKCE/state 与过期、单次取消、读取与一次刷新、复查与提交次序）改由通用流程的现行测试守住（`tests/gmail-oauth.test.ts`、`tests/security-invariants-oauth-shared-refresh.test.ts`），RAC-127/128 仍在 `tests/gmail-factory-boundaries.test.ts`。

原 README 三文件及新增公开入口 5 项先在原实现通过。拆分后 README 与实际影响面的 11 文件 **96/96** 通过，新增 CI 清单相关文件再 **19/19** 通过，合计 12 文件 115 项，无跳过或重试。覆盖现有错误/分页恢复、Feed/Source/同步权限，以及新增实例、接收者、刷新交错、同步提交与请求顺序回归。离线安装、基线/拆分后/最终指纹的整体构建、Gmail typecheck、新测试 strict TypeScript、相关 8 文件 Biome、包边界均通过。准确 `--base origin/main` 的 merge-base 仍为 `584112c6`，健康门禁通过：全仓巨大单元 96→91，仅该指标下降；72 份 API 快照匹配。Gmail 导出键及声明双向类型赋值通过；公开声明中仅 start 的可选参数因 bind 多了等价的 `| undefined` 写法，参数、返回与公开出口不变。源码、Manifest、contracts/SDK API 及动作快照没有合同变化。

实际 affected-tests 给 12 个非浏览器文件和一个 live 浏览器文件；上述非浏览器集合全部通过。暂存后仍因 Provider 移走 543 行代码建议 full，交 Claude 在固定候选上统一安排，未自行启动。live 浏览器需真实 Gmail 账户，未运行；不触碰真实 Home、安装或账号。共享 baseline 留最终批刷新，spec coverage 仅作报告不充当验收门槛。原始日志、前后测量与差异保存在 `/tmp/molis-verify-2026-10-24/c3-gmail-giants/`，最终固定 head 与推送前密钥扫描另随 PR 交付。
