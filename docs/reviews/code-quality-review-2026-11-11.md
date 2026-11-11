# 最新代码质量复审（2026-11-11）

修复状态：本报告所列问题已在 2026-11-11 的修复批次中处理，逐项状态与未修项见同目录 `code-quality-fixes-2026-11-11.md`。

状态：一次性只读复审报告。审查对象为 `origin/main` `2630160877`（2026-11-11 15:17 UTC，PR #2028）；基线为 `5945c0271a`（2026-11-08 13:07 UTC，即工作树最初切出的位置）。本轮**未改产品代码、未提交、未推送**；只跑了只读门禁与报告脚本，未跑全量测试、浏览器用例与真实 Home。

## 0. 结论摘要

- **P0：0 条。** 没找到会导致 main 不可用、数据损坏或可直接利用的安全缺陷。
- **P1：5 条**，集中在「评审/验证证据缺失」与两处「声称完成但验收未达成」：金样覆盖面 UPG2-04、Coding 自动技能 SKP-10、账号身份隔离拒绝无测试、最终头全量证据不完整、评审证据系统性缺失。
- **P2：约 20 条**：重复/硬编码的第二来源、清理回退、门禁例外卡线新增、文档状态句过时、页面资源许可占位评审、每项目多一次查询等。
- **P3：约 12 条**：小重复调用、启发式门禁读法、命名与注释残留、同类文案未一并处理等。

**总体判断：技术底子好，流程证据弱。** 窗口内边界与防腐方向正确（`pnpm boundary:check` 0 errors；只许减的数字全部持平；门禁只加不减；主要清理真删净），大功能也大多带验收编号与测试；但合并前证据链有系统性缺口：**45 个 PR 中 27 个 PR 上没有任何评论/评审记录，只有 8 个按 §10.1 写了七行结论**，个别 PR 的记录还写成「评审台审过（待）」，个别批次在「合入前没做全 PR 评审」被批次文件自认。加上两处「验收文字完成、实际缺口保留」的需求，本窗口不能按「全部验收通过」采信。

## 1. 范围与方法

### 1.1 审查窗口

从基线到 `origin/main` 共 **45 个提交 = 45 个 PR**（squash 后一 PR 一提交），其中代码/合同/测试 PR 34 个、纯文档 PR 11 个。整窗 **2,396 个文件 +125,484 / −16,668 行**，新增 153 个 `src` 文件、82 个 `*.test.*` 文件，删除 19 个文件；BACKLOG 新增 71 条、删除 5 条。

主要 PR：第 05 批 #1979（714 文件）、第 07 批 #1981/#1990、第 08 批 #1936/#1984/#1997、第 09 批 #2015/#2019、第 10 批 #1991/#2002、第 11 批 #2016/#2027、第 20 批 #2000/#2014、第 22 批合同 #1876/#1888、第 24 批 #2024/#2028、第 36 批 #1995、账号 V2 #2013/#2021/#2025、D0038 #1982、日评 A-1/#1999、日评 A54/#2004、安全验收 #1994/#2008/#2011/#2012。

### 1.2 做法与证据

- 6 个只读并行复审，按 PR/路径分工：账号与会话安全、存储/升级链/金样、场景与合同、技能包/能力包/证据合同、工作台/统一输入、门禁/清理/记账与防腐横向。
- Lead 横向核对：45 个 PR 的 body / comments / reviews、必需 CI（Verify）结论、各批 Full suite 运行、nightly 记录、批次文件与 spec 状态句、BACKLOG 删条、门禁与例外文件变更。
- 只读实跑：`pnpm boundary:check`（66 包、0 errors）、`node scripts/check-health-gates.mjs --base 5945c0271a`（exit 0，所有只许减的数字与基线持平）、`check-secrets --base 5945c0271a`（exit 0）、`dom-events`（0 失败）、`generate-versions --check`、`verify-release-versions`、`check-spec-coverage`（报告型）。
- 环境说明：本机 Node v24.14.0（仓库要求 24.15.x，engine 仅警告，不算缺陷）；GitHub 上最新 main 的 Full suite 有一次因 runner 无法解析 `security.ubuntu.com`（apt 装字体）而失败，属于环境失败，不是产品失败。

### 1.3 局限

- 未跑全量/浏览器/真实 Home/真实 Auth；未重放金样；未构建桌面端。
- #1979（714 文件）、#2004（487 文件）、#2013（100 文件 +11k 行）、#2015（322 文件）、#1999（221 文件）按关键路径逐行 + 抽样，不是全部逐行。
- 用户验收、认领板 issue、会话内讨论不在本次证据范围；PR 评审证据只按 GitHub PR 评论判断。

## 2. 需求符合性（逐批/逐主题）

| 批次 / 主题 | PR | 需求来源 | 结论 | 主要缺口 |
| --- | --- | --- | --- | --- |
| 05 升级链/金样/SQLite/目录/呈现 | #1979、#1998 | batches/05、upgrade-continuity、sqlite-driver-switch、shared-sources-and-surfaces | 大部分落地：U1 段连续、失败回放、打开只拒绝不升级、SQLD 适配语义、旧驱动/旧脚本删净、版本单源一致 | **P1-2 金样覆盖面 UPG2-04 未达成**；P2-9 清理回退与 BL 自相矛盾；P2-10 删库/改名无门禁 |
| 07 工作台导航与资料接入 | #1981、#1990 | batches/07 | 落地；07-1 导航、N53/N54、审计修复与请求数证据齐 | **P1-1 记录写「评审台审过后合入」，但 PR #1990 无评审台结论、资源许可 review 仍写「待评审」** |
| 08 技能包 | #1936、#1984、#1997 | batches/08、skill-packs | 落地；有最终头 CI/Full 成功记录、独立 C/D 合审；内容包只声明、安装走插件平台 | #1997 无 PR 评审记录（P2）；无其他需求缺口 |
| 09 能力包与助理/Coding 接点 | #2015、#2019 | batches/09、capability-pack | 主体落地：聚合不存储、执行走原机制、五类各有主人上报、工具全集一处、SkillRef 比对键收成 SDK 一份、旧 302 与旧方法库删净 | **P1-3 SKP-10 Coding「自动」档未接通**；**P1-1 合入前未做全 PR 评审（批次文件自认）**；P2-1 `horizontal/kit` 硬编码宿主 provider id；P2-19「旧存储全删」表述与合同稿冲突 |
| 10 统一输入公共组件 | #1991、#2002 | batches/10、unified-input-voice | 落地；一份组件、三入口、资源许可齐 | **P1-1 #2002 零评审即合入**，且其资源许可 review 声称「由本 PR 评审台再核」；P2-11 状态句未更新 |
| 11 三入口统一输入 | #2016、#2027 | batches/11、unified-input-voice | 落地；4 轮评审台结论在 PR 评论里；最终头 Full 32 分片全绿 | P2-2 K5 待办来源名英文界面不翻译；P2-11 状态句仍写「待合入」 |
| 20 场景公共合同/成员版本 | #2000、#2014 | batches/20、scene-and-page-contract | 落地；合同唯一来源、成员版本原子观察/ABA/冲突拒绝、Full 证据完整 | **P1-1 #2014 零评审**；P2-6 成员版本使每项目/每页多一次 `project_events` 查询；P2-15 技能导入预览版本可能与确认安装版本不一致；P2-16 跨轨 08 确认缺失 |
| 22 Sessions/外部工具合同 | #1876、#1888 | batches/22 | 落地；外部工具运行时名单 4 份全部由登记表派生、旧手写名单删净、AST 防回流；Sessions 读/写分界与设计一致 | 无 P1/P2（该批尚未完成，无收尾检查属正常） |
| 24 Prologue 采用与证据合同 | #2024、#2028 | batches/24、PWA-144 | 落地；EVD 编号有测试、等级/缺口/按版本失效/幂等重放/来源过滤逐条对上；旁路表删净、`hostBoundSession` 收成 SDK 一份 | **P1-1 #2028 零评审**；P1-5 #2028 改源码但最终头 Full 为环境失败未重跑；P2-8 两个新巨大单元例外恰卡阈值 +1 |
| 36 角色层级合同 | #1995 | batches/36 | 落地；角色合同唯一类型源，20 批只增量消费 | 无（批次未完成，无收尾检查属正常） |
| 账号 V2 / 会话安全 | #2013、#2021、#2025、#1982 | unified-account、D0038、security-invariants | 方向与主体证据成立：V2 安装身份唯一会话、Home 借用锁原租约、V1 删除、页面控制令牌出 HTML 改 HttpOnly+同源+一次性键；#2021/#2025 根因与修复对得上 | **P1-1 #2013 零评审**；**P1-4 两处身份隔离拒绝无测试/无表登记**；P2-3 sync-worker 夹具仍 mock V1；P2-4 身份 DTO 丢 email；P2-5 native-attach 两套实现 |
| 日评修复（A-1、A54） | #1999、#2004 | daily-quality-low-a1、2026-11-08 日评 | 抽样项代码与拒绝测试在位（D0056/D0294/D0103/D0124/D0335/D0206/D0337 等） | **P1-1 两个 PR 均零评审**；P2-8 卡线巨大单元例外；P2-9 清理回退；P3 `check-package-boundaries` 存在性过滤 |
| 安全验收补齐 | #1994、#2008、#2011、#2012 | daily-quality-d0033/d0039/d0244 | 测试为真实断言，无空断言/跳过；#2008/#2012 的拒绝与恢复证据合格 | #1994 等无 PR 评审记录（并入 P1-1） |

> 结论口径：**符合 = 需求条目的实现与证据同时成立**；证据不足但没有实现缺陷的，记流程问题；「验收文字说完成、代码/门禁还留缺口」的，记需求问题（P1）。

## 3. 代码边界

**做对的（已核）：**
- `pnpm boundary:check`：66 包、19,220 条 import、74 个合同 subpath，0 errors；窗口内 `limits.json` 未动，`APP_IMPORT_ALLOWLIST`/层间例外没有净放宽（新增的 app 引入点计数只会更严）。
- 模型调用边界：`@prologue/sdk` 的真正 import 只在 `horizontal/agent-host/src/**`；`packages/contracts/src/platform/plugin-agent.ts:140` 只是一句注释。
- 事实单源：`SkillRef` 比对键只在 `packages/plugin-sdk/src/skill-ref.ts:8`；`hostBoundSession` 只在 `packages/plugin-sdk/src/actions.ts:48`；工具全集只在 `horizontal/agent-host/src/tool-catalog.ts`；外部工具登记表是运行时名单唯一来源。
- 驱动边界：`better-sqlite3` 只剩 Alchemist（`plugins/native/alchemist/package.json:36`）；项目库都是 `node:sqlite`。
- 内置插件装配：健康门禁里「以内置插件命名的宿主文件 / `registerProvider(` / 宿主能力」等数字与基线持平；本窗口没有新增宿主私路。
- DOM 事件：`dom-events` 门禁 0 失败，窗口新增事件均有登记、有发有听。

**需要收口的：**
1. **P2-1 `horizontal/kit` 把宿主提供方 id 写成字面量**：`horizontal/kit/src/index.ts:38-39` 的 `"system.connectors"`、`"plugin-install"` 与 `apps/local-host/src/connector-account-actions.ts:30`、`apps/local-host/src/plugin-install-actions.ts:14` 是两份；`KIT_SYSTEM_REPORTERS` 没有测试引用。改一处名字不会编译失败，会让包头/连接条目静默消失。建议把 id 收进 contracts 或由宿主注入，并加「表键都在已登记提供方里」的测试。
2. **P2-4 身份 DTO 丢 email**：`apps/local-host/src/personal-auth.ts:73` 固定 `emails:[]`，而 `apps/workbench/src/browser/account-menu.ts:72` 仍读 `emails` 显示邮箱；e2e 都 mock 了 emails，真实 V2 登录后邮箱会退回占位文案。若 Auth V2 合同确实没有 email，界面与合同要一起改；若只是 DTO 漏字段，补上（待真实 Auth 复核）。
3. **P2-5 native-attach 两套实现**：`apps/workbench/src/arrival/shell.ts:146-150` 与 `apps/workbench/src/browser/personal-account.ts:175-181` 各写一遍；一处比较 `browser=1` 会话、一处不比较，容易一处修一处漏。建议合成一份浏览器侧函数。
4. **P2-3 sync-worker 夹具过期**：`server/src/sync/identity.rs:47-62` 已改为读 `data.user.userId`、`data.user.issuer`、`data.session.applicationId`，而 `apps/sync-worker/test.mjs:29`、`apps/sync-worker/testing.mjs:15` 仍 mock `{data:{userId,applicationId}}`；该套件不在根 CI（由 `examples/personal-sync-tools` 的 test 脚本单独跑），当前等于不可信。
5. **P2-10 删库/改名没有门禁**：`scripts/gates/store-schemas.mjs:16-17` 自己写「库消失意味着什么由另一个门禁回答」，但该门禁不存在；删掉 descriptor + HOME-DATA 行 + CHECKLIST 行后，旧 Home 库文件会被孤儿化、永不升级、无提示。升级连续性需求要求「删库也要进升级链」，建议补登记行或门禁。
6. **P3 `check-package-boundaries.mjs:565,881` 用 `existsSync` 过滤**：文件缺失时跳过而不是失败（原行为是 read 抛错即失败），轻微放宽；建议只在测试草稿仓库跳过。

## 4. 冗余与清理

**做对的（抽核）：**
- #1987：码元比较器合成 SDK 一份（`packages/plugin-sdk/src/json-value.ts`），`isObject`/`escapeAttr` 副本删净。
- #2028：`goalReportTrust` 旁路表全仓 0 引用；`hostBoundSession` 收成 SDK 一份，宿主与 Goals 共用；`local-host-caller.ts` 只剩纯函数。
- #2019：三份 `SkillRef` 比对键合成一份；`/settings/skills` 302 与两处调用点删净；四个只在本文件用的导出降级。
- #1979：旧 `scripts/golden/module-sources.mjs`、`stored-releases.mjs` 删除且无残留；`better-sqlite3` 依赖删净。
- #2004：`apps/local-host/src/demo-feed-library.ts`、`apps/desktop/src/adapters/sqlite-panels.ts` 已删、`listOwnerGoalIds` 0 处。
- 健康门禁的兼容标记 8、旧名 0、测试引用包内部 398、巨大单元 48 全登记，全部与基线持平；窗口内删的 5 条 BACKLOG 都有完成证据（不是为合 PR 删待办）。
- 新增的 153 个源码文件基本都有职责说明，未发现「旧路径换名再写一份」的整批回潮。

**还需要清的：**
1. **P2-9 清理回退与自相矛盾的 BL**：`tooling/gates/secret-allowlist.txt:42-43` 的两条「重新生成前的旧金样密文」被 #1998 删过、又被 #2004 加回；`specs/backlog/BL-b05-gate-residues.md` 说 `scripts/verify-release-versions.mjs:300` 仍列已删文件，其实同一 PR 已清；`specs/upgrade-continuity/upgrade-chain-design.md:200` 仍写名单里留着那两个名字。需要说明加回原因（若为历史扫描需要）或恢复删除，并把 BL 改成当前事实。
2. **P2-8 两个新巨大单元例外恰卡阈值 +1 行**：`tooling/gates/giant-exceptions/horizontal/connector-host/src/connection-store.ts.json` 301 行（阈值 300）、`packages/im-ui/src/views.ts.json` 151 行（阈值 150），随无评审的 #2004 加入。要么拆/减几行，要么在 PR 里说清这 1 行是内聚必需。
3. **P2-13 快照删除缺复核**：`tooling/gates/actions/*.tsv` 删 39 行、`tooling/gates/api/**` 删 221 行声明，随 #2004/#2015/#2013 合入；CI 只保证「源码=快照」，不保证调用方都迁完。建议抽查 Coding `run.start` 合并与旧方法库消费者是否真无残留。
4. **P3 其他小残留**：`apps/local-host/src/local-host.ts:84` 同一表达式调 `hostBoundSession(caller)` 两次；`scripts/gates/store-versions.mjs:172` 纯数字版本常量时可能在整文件里取错 `upgrades` 对象；`tests/upgrade-chain-registry.test.ts:1-2` 注释过期；`docs/system/GLOSSARY.md:213` 仍写已删的 `/settings/skills` 跳转；Coding 标识符仍叫 `methodChoices`/`methodSelections`/`methods.ts`，收尾只登记了界面文字；Coding 新文件 `composer-mount.ts` 与既有 `mount-composer.ts` 仅词序不同。

## 5. 防腐专项

### 5.1 门禁与例外审计结论：没有放宽，方向正确

逐项核了窗口内所有门禁/CI/例外文件（`git diff 5945c0271a..HEAD -- .github/ scripts/gates/ scripts/check-health-gates.mjs scripts/check-package-boundaries.mjs tooling/gates/ package.json`）：

| 项 | 结论 | 说明 |
| --- | --- | --- |
| `limits.json` | 不变 | 窗口内无 diff |
| CI `Verify` | 变严 | `needs` 增加 `golden-replay`、`golden-replay-third-party`；merge queue 分支存在性检查沿用既有写法 |
| 金样回放作业 | 变严（挡合并）+ 夜间 | 新增 `golden-replay`（Linux）、`golden-replay-third-party`（macOS 条件）、`golden-replay-nightly.yml`（不挡合并、失败开 issue） |
| 金样覆盖面门禁 | 新绝对规则，但有 `uncovered` 理由出口 | 见 5.3 UPG2-04 |
| 库结构/版本门禁 | 变严 | 新增 `store-schemas.mjs`、`store-schema-snapshot.mjs`、`schemas/stores.tsv`；同版本改结构失败、升版本要段与旧版本金样 |
| SQLite 驱动例外 | 变严 | 例外数据化、fail-closed，并从 `packages/storage` + Alchemist 收窄到只剩 Alchemist |
| app 引入点计数 | 变严 | 逐文件数 import/export/动态 import/require/import type，新文件从 0 开始，有拒绝测试 |
| `reviewedServerComposition` | 代码内一次性例外 | 净效果 allowlist 2→1 且只接受一种过渡、有 4 条拒绝测试；但「用户已批准」只出现在 PR body 与日评文档，无可核的用户评论 |
| `secret-allowlist` | 中性（合成测试数据） | 新增均为金样合成密文（manifest 有 `test_key`）；2 条有用户 2026-11-08 批准记录；窗口扫描 exit 0 |
| `version-exceptions` | 中性（登记式） | `entry` 例外 28→41，全部是「合同已声明、提供方未登记」且带「登记后删」理由；有 stale 双向检查 |
| 页面资源许可 | 中性（按规则） | 24 个新许可；4 个真有用户批准；每资源 ≤10KB 或用户批准；但 3 个 review 仍是「待评审/待核对」占位 |
| 巨大单元例外 | 需评审 | 2 个新增恰卡阈值 +1 行（见 P2-8）；其余是既有单元尺寸更新 |
| 健康门禁数字 | 持平 | `check-health-gates --base 5945c0271a` exit 0；兼容标记 8/8、旧名 0、测试引用 398、巨大单元 48 |
| 密钥扫描 | 通过 | `check-secrets --base 5945c0271a` 扫窗口 45 提交 exit 0 |

**结论：没有把任何数字门槛调大、没有关规则、没有删 CI 步骤、没有跳过测试、没有 allowlist 净放宽。** 可被「写理由」绕过的只剩数据文件（`golden-coverage.uncovered`、`version-exceptions`、页面资源许可的 `review` 字段），都是要人评审的数据，不是自动放行。

### 5.2 防腐原则抽查（做对的）

- 能力只注册一次：动作合同快照 `action-contract-snapshot` 通过；Coding 旧方法库动作删除后快照同步减少。
- 插件同等待遇：能力包只经动作汇总，没有为某个插件开宿主私路；内容包只声明、安装/信任/卸载复用插件平台。
- 可信身份从上下文来：本轮新增的身份/证据合同都从调用上下文取；`agent.evidence.check@1` 只给事实不执行。
- 一张表一个主人：表主人门禁通过；窗口内新增的表登记在 `tooling/gates/table-owners.json`。
- 兼容逻辑：`CONTRACT-CHANGES.md`「当前保留机制」没有被窗口新增读取兼容；兼容标记计数持平。
- 清理：窗口内被替代的旧入口/旧导出/旧脚本大多同片删除（见第 4 节）。

### 5.3 防腐与需求交叉的两处硬缺口

**P1-2 UPG2-04「金样覆盖面」没有真正达成。**
- `tooling/gates/golden-coverage.json` 的 `uncovered` 有 19 条；按 `docs/system/HOME-DATA.md` 的「必备份」列复算，18 条属于必备份（`agent-runtime/checkpoints/`、`computer/settings.json`、`computer/records/`、`feed/evidence/blobs/**`、`git-operation-details.json`、`images/assets/`、`runtime-config-backups/<runtime>/<plan>.bak`、`runtime-integrations/<runtime>.json`、`spaces/<spaceId>/sync/device.json` 等），且绝大多数没有登记对应的 BL/负责人（仅 `computer/settings.json` 有 `BL-golden-computer-settings`）。
- 门禁 `scripts/gates/golden-homes.mjs:62-75` 只校验 uncovered 的理由长度 ≥10 个字符就放行；而设计 `specs/upgrade-continuity/golden-replay-design.md:124` 的 UPG2-04 行写「每个必备份的库和带版本的文件，在最新一份金样里都存在；少一项就失败」，验收编号 UPG2-04（同文件 :160）同样写「都有」。
- 结论：规范、验收文字与门禁实际口径三者不一致；按验收文字，U2 不能算「已实现」。建议三选一：①逐条补金样（能离线生成的）；②由用户/合同台批准 uncovered 例外并改 UPG2-04 措辞，每条挂 BL 负责人；③把 `uncovered` 从「理由任意」改成「必须带 BL 编号与负责人」，由门禁核。

**P1-3 SKP-10 Coding「自动」档没有接通。**
- `plugins/native/coding/src/executor.ts:70` 一轮只带 `mergedSkills(delegated, savedSkills)`，设成「自动」且适用于 Coding 的技能不进一轮；`specs/backlog/BL-coding-skill-auto.md` 自己写「部分实现 / 高 / C2 轨（执行会话待分配）」，来源是第 09 批收尾检查。
- `specs/skill-packs/spec.md:116`（SKP-10）要求「启用后默认允许 AI 按适用条件自动选用」；`batches/09.md` 收尾检查自认「SKP-10 在 Coding 一侧没做到」，但**没有用户批准顺延的记录**，也没列进批次偏离表。按批次收尾规则，本批带来的需求缺口应在合入前修完或由用户批准顺延。

## 6. 流程与证据（本次最系统的问题）

### 6.1 PR 评审证据

45 个 PR 的 GitHub `reviews` 全部为空；评审靠 PR 评论。统计：

- **27/45 个 PR 0 评论**：#1980、#1982、#1985、#1986、#1988、#1989、#1992、#1994、#1998、#2002、#2003、#2004、#2005、#2006、#2007、#2008、#2011、#2012、#2013、#2014、#2015、#2018、#2019、#2021、#2025、#2027、#2028。
- **只有 8 个 PR 有完整 §10.1 七行结论**：#1981、#1876、#1888、#1936、#1984、#1991、#1995、#2024。
- 有实质评审台评论但不是七行格式：#2016（4 轮「要修/审过」）、#2000（收尾记录）、#1990（3 条协调/状态）、#1979（统筹/评审记录）。
- 有评论但无评审结论：#1999（8 条跨批交接）、#1987（全量/协调）。

重点缺口（按体量/红线）：
- #2015（第 09 批全批，322 文件 +10,196/−2,035）：批次文件 `specs/post-anticorruption-roadmap/reference/batches/09.md` 的「收尾检查 · 2026-11-11」自认「#2015 合入前没做，合入后由主会话补做，发现的问题在收尾 PR 里修」。
- #2004（487 文件 +22,769/−1,173）：0 评论 0 评审，却改了门禁脚本、巨大单元例外、大量清理。
- #2013（Auth V2，100 文件 +11,452/−2,037）：0 评论 0 评审，却移除了 V1 登录路径、改了 `server/src/sync/identity.rs`、新增 `pnpm dev/start:test/start:prod` 脚本与账号环境引导。
- #2003（门禁改动）：0 评论；`reviewedServerComposition` 是把一次性过渡写死在门禁代码里，批准只有作者自述。
- #2028（改了共享核心 `packages/plugin-sdk`）：0 评论。
- 记录与实际不符（比「没评审」更严重）：`specs/post-anticorruption-roadmap/reference/batches/07.md:115` 写「评审台审过后合入」，但 #1990 只有 3 条协调评论、无评审台结论，且 `tooling/gates/page-asset-allowances/07-audit-fixups.json:3` 的 review 仍写「待本修复 PR 的评审台审；合入前改成审过评论链接」；#2002 的 body 写「评审台结论（待评审）」，`tooling/gates/page-asset-allowances/10-audit-fix.json:3` 却写「由本 PR 评审台再核」。
- 违反：`specs/post-anticorruption-roadmap/reference/development-workflow.md` §10.1（每个 PR 七行结论，有一条「问题」就挡合并）、§11.1（全 PR 评审即收尾检查）、决定 31/34。

### 6.2 最终头全量证据

- 批级 PR 的 Full suite 大多有绿：#1979（run 42514565847 success）、#1984（最终头 Full 成功，批次文件记录 32/32 分片、1861/1861 文件）、#1991（42586514230 success）、#2000（42679898041 success）、#2016（43013907766 success）、#2024（42988678115 success）、#1995、#1936 的合同 PR 也绿。
- 例外：
  - **P1-5 #2013 账号 V2**：Full suite 运行只有 cancelled/failure（account 分支没有绿的 Full）；`specs/unified-account/spec.md:3` 自己写「最终 PR 全量回归仍未完成，不能声明全仓全绿」——诚实，但说明这是带着未完成全量验证合入的安装身份改动。
  - **P1-5 #2028 第 24 批收尾**：改了源码（`packages/plugin-sdk/src/actions.ts`、`apps/local-host/src/local-host.ts`、`plugins/native/goals/*`），其 Full suite run 43025815955 因 runner apt 网络失败而红，之后没有重跑就合入；#2024 的绿 Full 绑定的是上一头。
  - #2015 按 6.1 的流程缺口处理：合入后补做、问题在 #2019 修。
- **main 的 nightly Full suite 近 6 次 4 红**：2026-11-08（head `500d868df3`）shard 18 `tests/code-scale.e2e.test.ts` 首跑与重试均失败；2026-11-10（head `bac5d62b9e`）shard 19 `tests/home-restore-cli.test.ts` 的 RAC-2915 子测两次 30s 超时；最近一次绿是 11-10 00:32。11-11 手动全量因 apt 网络失败（环境）。`tests/quarantine.json` 仍是空的，偶发文件没有按 AGENTS 要求登记 owner 与到期日（P2-17）。

### 6.3 文档与记账

- 大多数批次文件按 §11.1 写了收尾五问：07（`batches/07.md:105-109`）、08、09、10、11、20、24；内容抽查属实（不虚报「已评审」的除 #1990 一处）。
- 状态句过时（P2-11）：`specs/README.md:72` 能力包仍「尚未实现」而 spec 已「已实现（#2015）」；`specs/unified-input-voice/spec.md:3`、`implementation-plan.md`、`docs/design/unified-input/README.md:3` 仍写第 11 批「待合入/batch 分支」而 #2016 已合入；`specs/daily-quality-low-a1/spec.md:3` 与 `specs/README.md:54` 仍「实施中/PR 检查中」而 #1999 已合入且无合入记录；`specs/daily-quality-d0038/spec.md:3` 与 `specs/README.md:9` 仍「执行中」而 #1982 已合入。
- 纯文档 PR 仍单独开：窗口内有 #1983、#1985、#1986、#1988、#1992、#1993、#1996、#2005、#2007、#2018、#2027 共 11 个纯文档 PR，与决定 31「文档不单独开 PR，随本批 PR 合入；合入提交号随下一批 PR 补」的字面要求不一致（P2-12）。其中 #2027 是第 11 批收尾文档，也正好漏改了 6.3 的状态句。

## 7. 问题清单

### P0（0）

无。

### P1（5，详见对应小节）

| 编号 | 问题 | 证据 | 违反 | 建议 |
| --- | --- | --- | --- | --- |
| P1-1 | 评审证据系统性缺失；个别记录把「待评审」写成「已审过」 | 6.1；`gh pr view <n> --json comments,reviews`；`batches/07.md:115`、`tooling/gates/page-asset-allowances/07-audit-fixups.json:3`、`10-audit-fix.json:3`、`batches/09.md` 收尾检查 | development-workflow §10.1/§11.1、决定 31/34 | 对 0 评论的批次/产品/安全/门禁 PR 在批次文件或 PR 评论补七行结论（或写明用户免审范围）；改正「已审过」的记录；#2003 的批准记录补用户原话/链接 |
| P1-2 | UPG2-04 金样覆盖面未达成，门禁用「理由」放行 | `tooling/gates/golden-coverage.json` 19 条 uncovered（18 条必备份）；`scripts/gates/golden-homes.mjs:62-75`；`specs/upgrade-continuity/golden-replay-design.md:124,160`；`docs/system/HOME-DATA.md` | upgrade-continuity §6/§9 UPG2-04 | 补金样或由用户批准例外并改验收措辞；uncovered 必须挂 BL 编号/负责人，门禁核 |
| P1-3 | SKP-10 Coding「自动」档未接通，无用户批准顺延 | `plugins/native/coding/src/executor.ts:70`；`specs/backlog/BL-coding-skill-auto.md`；`specs/skill-packs/spec.md:116`；`batches/09.md` | skill-packs SKP-10、batches/09 9-5 | 本批补接或记录用户批准顺延 + 第 12 批前置 |
| P1-4 | 账号身份隔离两处新增拒绝无测试、安全不变量表未登记 | `apps/local-host/src/account-host.ts:107`（借用会话只许 BIND/REPLACE）、`:141`（借用会话 Home 的 logout 409）；`grep tests/ scripts/` 无对应断言 | AGENTS「改安全边界要同步改表和测试」；SECURITY-INVARIANTS | 补两条拒绝测试并登记不变量表 |
| P1-5 | 最终头全量证据不完整 | #2013 无绿 Full（`specs/unified-account/spec.md:3` 自认）；#2028 改源码后 Full 环境失败未重跑（run 43025815955） | 决定 31「全量在最终头」、AGENTS 构建与测试 | 对 #2013/#2028 补最终头 Full 或记录用户豁免；#2028 重跑一次 |

### P2（约 20，按主题归并）

| 编号 | 问题 | 证据 | 建议 |
| --- | --- | --- | --- |
| P2-1 | `horizontal/kit` 硬编码宿主 provider id，与宿主常量两份，`KIT_SYSTEM_REPORTERS` 无测试绑定 | `horizontal/kit/src/index.ts:38-39` vs `apps/local-host/src/connector-account-actions.ts:30`、`plugin-install-actions.ts:14` | 收进 contracts 或注入；加表键测试 |
| P2-2 | K5 待办来源名英文界面不翻译 | `apps/local-host/src/composer-sources-http.ts:33` 原样返回；`plugins/native/todo/src/search.ts:15` 标题「待办」；`plugins/native/todo/src/en.ts:18` 翻译未用；合同 `packages/contracts/src/platform/composer.ts:20` 要求翻译；`tests/todo-composer-source.e2e.test.ts:37` 只断言中文 | 宿主按页面语言翻译并补英文 e2e |
| P2-3 | sync-worker 夹具仍 mock V1 身份响应 | `server/src/sync/identity.rs:47-62` vs `apps/sync-worker/test.mjs:29`、`testing.mjs:15`；该套件不在根 CI | 同片更新夹具并明确是否纳入 CI |
| P2-4 | 身份 DTO 丢 email，账号菜单邮箱退回占位 | `apps/local-host/src/personal-auth.ts:73`；`apps/workbench/src/browser/account-menu.ts:72` | 与真实 Auth 核合同：补 DTO 或改界面/e2e 不再 mock |
| P2-5 | native-attach 两套实现 | `apps/workbench/src/arrival/shell.ts:146-150`、`browser/personal-account.ts:175-181` | 合成一份 |
| P2-6 | 成员版本使每项目/每页多一次 `project_events` 查询 | `modules/projects/src/project-records-repository.ts:76`、`apps/local-host/src/project-plugin-membership.ts:37`、`web-project-context.ts:74`；`batches/20.md:46` 自述 | 按批次记录后续在 owner 内合并；先记 BL |
| P2-7 | 3 个页面资源许可 review 仍是占位；批次记录却说「评审台审过」 | `tooling/gates/page-asset-allowances/07-audit-fixups.json:3`、`2026-11-09-b09-board.json`、`2026-11-10-b09-kit-page.json`；策略只查非空 | 补评审链接；策略要求 review 含 URL/日期且不含「待」 |
| P2-8 | 2 个新巨大单元例外恰卡阈值 +1 行，随无评审 PR 加入 | `tooling/gates/giant-exceptions/horizontal/connector-host/src/connection-store.ts.json`（301/300）、`packages/im-ui/src/views.ts.json`（151/150） | 拆/减几行或说明必要性；后续新增先看是否刚过线 |
| P2-9 | 清理回退与 BL 自相矛盾 | `tooling/gates/secret-allowlist.txt:42-43`（#1998 删、#2004 加回）；`specs/backlog/BL-b05-gate-residues.md`、`BL-golden-assertions-weak.md`；`specs/upgrade-continuity/upgrade-chain-design.md:200` | 说明加回原因或重删；BL/设计改成当前事实 |
| P2-10 | 删库/改名无门禁 | `scripts/gates/store-schemas.mjs:16-17` 自认「另一个门禁」，实际不存在 | 加登记行或门禁；与升级连续性绑定 |
| P2-11 | 状态句过时 4 处 | 6.3 所列 `specs/README.md:72`、`specs/unified-input-voice/spec.md:3` 等 | 随合入改状态句并指 PR/提交 |
| P2-12 | 纯文档 PR 单独开（11 个），与决定 31 字面要求不一致 | 6.1/6.3 所列 #1983/#1985/#1986/#1988/#1992/#1993/#1996/#2005/#2007/#2018/#2027 | 统一口径：要么承认「收尾记录 PR」为例外并记录，要么并回批次 PR |
| P2-13 | action/API 快照删行缺调用方迁移复核 | `tooling/gates/actions/*.tsv` −39、`tooling/gates/api/**` −221；随 #2004/#2015/#2013 | 抽查 Coding `run.start`、Sessions、旧方法库消费者残留 |
| P2-14 | 技能导入预览与确认安装版本可能不一致 | `apps/local-host/src/skill-import.ts:124-126` 读元数据 vs `:161-169` 读封存密钥 | 预览用与确认同一读取路径 |
| P2-15 | #2014 自述缺跨轨 08 确认记录 | #2000 把 08 的私有签名路径换成 `plugins.local_packages.sign@1`，仓库内无 08 侧确认 | 补复核记录或在 batches/08 登记 |
| P2-16 | #2013 新增开发/账号环境脚本与 V1 删除无评审复核 | `package.json:36-38`、`scripts/start-account-environment.mjs`、`scripts/account-environments.mjs` | 补一次只读评审抽查 V1 残留 |
| P2-17 | main nightly 近 6 次 4 红，偶发未登记 quarantine | `tests/code-scale.e2e.test.ts`（11-08 两次失败）、`tests/home-restore-cli.test.ts` RAC-2915（11-10 两次 30s 超时）；`tests/quarantine.json` 为空 | 修超时或按规矩登记 owner/到期日；nightly 重跑 |
| P2-18 | AGENTS 的 SDK 共用工具清单两种做法 | `/skill-ref` 由 #2019 直接改 AGENTS；`hostBoundSession`（`packages/plugin-sdk/src/index.ts:60`）未加，PR 说等评论稿 | 按第 14 批规矩补 AGENTS 文字并补记授权 |
| P2-19 | 09 批「旧存储全删」表述与合同稿冲突 | `batches/09.md:40`、#2015 body；`specs/capability-pack/contract-design.md:245-248,161` | 改成「旧键不再读取，存量不清理（已知遗留）」并改旧键名 |
| P2-20 | version-exceptions 的 entry 例外 28→41，依赖「登记后删」自律 | `tooling/gates/version-exceptions.json`；stale 双向检查仅 `tests/version-source.test.ts:65-66` | 按批次列出到期清单，批次完成即清 |

### P3（约 12，摘要）

- `apps/local-host/src/local-host.ts:84` 重复调用 `hostBoundSession(caller)` 两次。
- `scripts/gates/store-versions.mjs:172` 纯数字版本常量可能取错 `upgrades` 对象。
- `tests/upgrade-chain-registry.test.ts:1-2` 注释过期（库已是 2/3 版）。
- `docs/system/GLOSSARY.md:213` 仍写已删的 `/settings/skills` 跳转。
- `packages/design-system/src/composer-styles.ts:79` 动效字面量 `250ms` 未走 `--dur-*`（沿既有写法）。
- Coding `composer-mount.ts` 与既有 `mount-composer.ts` 词序不同易混。
- UIV-18 在 `tests/composer-bar-receiver.e2e.test.ts` 无编号证据（行为已覆盖）。
- #2006 只修 6 处「半句+冒号」拼标题，同类既有写法未清（多数窗口前既有，建议记 BL）。
- `scripts/check-package-boundaries.mjs:565,881` 的 `existsSync` 过滤（见 3-6）。
- `tooling/gates/page-asset-allowances/daily-quality-medium-20261108.json:3` 的 review 指向已归档 spec 的旧路径。
- 新增测试引用了 spec 未定义的编号：`tests/action-external-tools.test.ts` 引 `BL-955`、`tests/coding-diagnose-timeline.e2e.test.ts` 引 `BL-303`、`tests/design-accessibility-pack.test.ts` 引 `BL-165`（`check-spec-coverage` 报告为 stale-reference，报告型不挡）。
- 批次 22/36 的合同 PR 有七行评论但没有写进批次文件；两批尚未完成，收尾五问可在完成时补，不算缺陷（避免误报）。

## 8. 建议的处置顺序

1. **先补证据，不改代码**（半天）：为 P1-1 的 0 评论 PR 在批次文件/PR 评论补七行结论或用户免审记录；改正「已审过」的两处记录；#2003 补用户批准原话或链接。
2. **再处理两个需求缺口**（P1-2、P1-3）：UPG2-04 与 SKP-10 要么补实现，要么由用户拍板改验收/顺延并登记 BL；这是本次唯一两处「需求说完成、实际未达成」。
3. **补安全与验证证据**（P1-4、P1-5）：账号身份隔离两条拒绝测试 + 安全不变量表；#2013/#2028 最终头全量或用户豁免；nightly 红处按 quarantine 规矩处理。
4. **清理与一致性**（P2）：kit id 单一来源、K5 英文翻译、sync-worker 夹具、secret-allowlist 回退、BL/设计稿矛盾、状态句、页面资源许可 review、巨大单元卡线。
5. **流程收口**（P2）：把「纯文档 PR」「收尾 PR」与决定 31/34 的口径对齐（承认例外并记录，或并回批次 PR）；后续大 PR 合入前强制 PR 评论七行 + 最终头全量。

## 9. 本次确认「做对了」的清单（避免只报问题）

- 边界：`boundary:check` 0 errors；模型调用唯一经 `horizontal/agent-host`；`SkillRef`、`hostBoundSession`、工具全集、外部工具登记表、Skill 目录各自只有一份；`better-sqlite3` 只剩 Alchemist 例外；插件组装门禁数字持平；DOM 事件门禁 0 失败。
- 门禁/防腐：阈值未放宽、CI 只加不减、新增金样/库结构门禁真挡合并、SQLite 驱动例外收窄、密钥扫描通过、健康门禁数字全部持平；窗口内 5 条 BACKLOG 删除都有完成证据。
- 清理：#1987 比较器合成一份；#2028 旁路表与宿主会话判断删净；#2019 302 与三份 SkillRef 键收口；#1979 旧金样脚本/旧驱动删净；#2004 删除 `demo-feed-library`、`sqlite-panels`、`listOwnerGoalIds`。
- 需求与测试：EVD-01…43、SKC-01…13、CPK、SKP 编号大多有测试名/注释；#2016 最终头 Full 32 分片全绿且有 4 轮评审台结论；#1982 页面会话安全（HttpOnly+同源+一次性键+拒绝断言具体零副作用）；#2021/#2025 根因修复与证据一致；#2024 证据合同（等级/缺口/按版本失效/幂等重放/来源过滤）逐条落地；#2006 六句完整译句与英文键齐全。
- CI：所有 PR 的必需检查 `Verify` 均通过（分支保护未被绕过）；批级 PR 的 Full suite 除 6.2 所列例外均有绿记录。

---

附：本次复审的分报告与命令产物随本次会话交付，未入库（会话临时目录，不能作为仓库内的长期引用）。
