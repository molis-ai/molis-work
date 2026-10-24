# ACA005：搜索披露前核对原精确授权

状态：实现及作者定向工程验证完成，候选待独立审验与真实合入。实际 owner 为修复 1；流水线已在 C2 短修、C1 RAC114 固定交付并释放后正式 START。本文承接协调分支 `CODEX-TASKS.md` 的同一 accepted WO；行为以本文为准，协调表只维护分工、依赖和证据。

## 问题、目标和边界

固定 `c4a40b84e31461b43745df83a6af343c33142975` 的正确构建上，真实 stdio MCP 经常驻 Host 的 HTTP 动作网关查询搜索。公开注册的扩展来源正在等待真实 HTTP listing 时，通过生产设置路由分别撤销 source、reader 的精确授权；撤权已返回，原查询仍在途，随后原响应仍带正文。新查询没有该结果，本人查询仍能找到索引。这证明了可扩展平台来源的实际路径，不声称内置 Form 的同步 listing 有同一等待。修前原始证据为 `/tmp/molis-verify-2026-10-24/aca-real-mcp/` 的 handoff、result 和 probe；原计时不足的运行不算证据。

搜索必须在真实等待结束后、披露正文和 locator 之前，核对本次调用最初使用的 source、reader 精确授权。原授权撤销后，同值重新授权、新 reader、peer 保留的共享 permission 都不能救活旧请求；新受理的合法请求和本人的索引继续工作。不得删除索引、关闭全部来源、改业务数据或弱化正文命中断言来掩盖问题。

不改变 MCP 工具名、action id、可信身份或权限政策，不创建新 callback/授权平台，不加入 Assistant generation、不夹带其他 nonblock，不操作真实 Home、4207、Keychain 或凭据。#1207 是 Goals provider lookup，#1208 是公开本机用户 context 出口调整，均未覆盖 grant schema；本片测试不依赖其待删除的私有出口。

## 生产方案与持久合同

沿现有 `validate_authority` 和同步 `assert_authority_current` 传递原授权，不增加共享合同 callback。MCP 入口固定原精确 client/project/capability/version/provider 对应的授权代次，复核时同时检查当前权限、availability、transport 与原 signal。retained/background 的同一 hook 消费者保持同一原实例；不能通过重新取新授权恢复旧调用。

原 `mcp-settings-store` 管理 owner 在既有串行、原子写入处为持久行生成非敏感 `generation`。代次只是授权实例身份，不授予权限。管理请求和业务输入不能选择它；输入事实与持久行区分。首次显式记录、enabled 切换或权限集合语义变化才换代；同事实幂等提交和权限顺序变化保留原代次，无关行不变。多项授权继续一次原子保存，坏记录和重复记录保持 fail closed，不静默去重，也不使用整个文件的 revision 误杀无关调用。

默认开放仍沿现政策。受理时没有该精确记录则固定 absence，最终必须仍然无显式记录且满足原默认规则。现管理写入撤销和重开会保留 disabled/new enabled 行，不新增 reset/delete 回 absence 的路径。若发现实际产品存在这种删除入口，先以确切路径交 root 裁定最小同 owner 事实。

搜索保留本次原可用来源及其实际使用的原 reader，等待后做异步复核，最后同步核全部相关原授权，再查询索引、构造响应；尾检与披露之间没有未覆盖的 await。多个原合法 reader 可使用其中仍有效者，不能换成新 reader。个人空间使用其原 owner、原 scope 的授权，本人索引同步继续独立于提问者授权。

配置 `config/mcp-tools.json` 从 v2 升为 v3，运行时严格只读 v3；v2、坏配置拒绝且零写，不在正常读取中迁移。产品发布版本不变。按既有离线维护合同，仅在临时 Home/副本演练一次性 v2→v3 的 list/apply：保留全部原 client/ref/permissions/enabled 事实，由 owner 建立各行新代次，原件外置备份、失败可恢复，重复 apply 不换代。脚本留会话临时目录，不加入产品迁移链。真实 Home 的维护需另按现合同授权；将 v3 维护前置交 W5-17/统一发布维护线，并同步 HOME-DATA。

## 模块范围

- `horizontal/search/src/index.ts` 的查询披露边界及必要同包内部 helper、README 不变量。
- `apps/local-host/src/mcp-settings-store.ts`、`mcp-action-grants.ts`、`mcp-action-client.ts`，以及实际需要同步的 background、设置/usage、类型消费者；不为测试新增导出。
- 新的正式搜索授权回归及现 MCP grant、设置、配置完整性、effect/background 的必要用例；只经当前公开 Host、MCP、HTTP/test-kit 入口。
- 本 slice、HOME-DATA、既有安全不变量的相应描述和拒绝测试引用。共用 BACKLOG、baseline、预算等生成物由最终合成批处理，不反复合主线修纯共享文件冲突，不改门禁。

## 验收

| 编号 | 可观察结果 |
| --- | --- |
| ACA005-01 | 未撤对照经真实 stdio MCP→HTTP Host→扩展 owner pending fetch 正常返回正确 hit 和独特正文；本人仍能查到原索引事实。 |
| ACA005-02 | source、reader 分别单项撤权；撤权返回时同一查询仍 pending，释放真实 owner 后最终拒绝或不含被撤内容、正文、locator，peer 的共享 permission 不能代替。 |
| ACA005-03 | source、reader 的 revoke→同值 regrant 均不能救旧请求，新受理查询成功；新 grant/reader 不能替换原授权，多原合法 reader 的有效原授权仍可用。 |
| ACA005-04 | 首次记录、enabled 切换、权限集合变化换代；幂等/权限换序保代，无关 grant 编辑不打断合法请求；多项原子写与重复/坏行拒绝有实际状态断言。 |
| ACA005-05 | 原默认开放的 absence→撤→显式重开不恢复旧调用，新合法调用仍按现政策可用。 |
| ACA005-06 | 跨进程使用 v3；v2/坏配置零写拒绝；临时副本 list/apply 保留授权事实、外置原件与失败恢复、重复不换代，正常读路径不迁移。 |
| ACA005-07 | 原身份、项目、精确 provider、取消、失败及 retained/background 消费者保持拒绝边界；最终尾检后无未覆盖 await，测试资源有界退出、按本次资源清理。 |

## 验证和交付

先以正式用例在未修生产路径取可复现红例，再实施最小修复。测试使用隔离 Home、公开注册 owner 的实际 HTTP fetch 和生产设置授权/撤权，不修改 caller 数组，不在生产 policy 中插人工 pause，不删正文/索引断言。stdio pending 期间不通过排队的 listTools 假装证明交错；明确断言撤权返回时旧查询仍未完成。

新工作树先整体 `pnpm build`，源改后再整体构建。公共 build/browser 槽遵守机器排程；本片不需浏览器，不自行 full。运行搜索包要求的 `tests/system-search.test.ts`、`tests/search-references.test.ts`、`tests/security-invariants-object-references.test.ts`，新正式回归、实际 MCP 配置/授受/effect/background 用例及 local-host README 的适用必跑检查；相关拒绝边界按 `pnpm test:security` 合同交统一排程。记录每个原始命令、退出、红绿和未运行边界，静态/health 对实际 base 核，推送前 fetch 与 `pnpm secrets:check`。

非 Draft 固定 PR/head、scoped diff、本文和原始证据直接交 REVIEW、TEST、流水线及 root；固定交付即释放 writer/build/browser，不等待审验、CI、merge 占槽。独立审验、实际 merge SHA 与包含证据齐全后才闭环，工程通过不代替真实场景验证或一骏验收。

## 作者验证记录（2026-10-24）

原始日志在 `/tmp/molis-verify-2026-10-24/`，命令与完整交接随固定 PR 提供。`aca005-red-warm.log` 使用正确 baseline 构建的 c609 dist：3 个合法对照通过，6 个真实旧响应正文断言失败，零 skip/cancel；早期未进入等待或 cleanup 失败的夹具运行不算红证据。修后 `aca005-build-final.log` 整体构建退出 0，两个受影响包的最终类型检查退出 0。

首轮 local-host/Search README 与直接消费者共 77 文件：76 文件通过，唯一失败是发布清单仍写 v2；已同步清单和防腐总 spec §4.1 的必要维护行。随后只重跑受新增 reader 取舍、配置清单和构建指纹影响的 10 文件，68/68 通过，含正式真实 MCP 12/12（零 skip/cancel/retry）。原 MCP grant/effect/background 等未变化的有效证据复用，未机械重跑整轮。

ACA005-01～05 的真实 stdio/HTTP 回归通过，覆盖两项单撤、同值重授、peer、新 reader、默认开放、幂等/无关授权、其他种类 reader 与受理前已合法 reader；ACA005-04 的管理 owner 代次、原子写与拒绝用例通过；ACA005-06 的副本维护以真实只读目录制造发布失败，核原件零改、外置原件及恢复、重复代次不变，通过；ACA005-07 的现有身份/尾检/取消回归及新真实 MCP retained/background 原代次拒绝用例通过。

boundary、对 merge-base 的 health、资源预算检查通过；新增正式搜索授权用例已加入 `test:security`。完整 `pnpm test:security`（含浏览器）与 full 未在本片另起，交固定候选的统一安全/全量排程；独立 REVIEW、TEST、CI、实际合入及真实 Home v3 维护均不以作者通过代替。未执行真实 Home/Keychain 操作。
