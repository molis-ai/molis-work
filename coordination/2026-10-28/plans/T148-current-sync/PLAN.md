# T148 / #1654 冻结 main 最小同步计划

状态：**只读准备完成，尚未落 merge/build/test。** 本线为根指定的 T148 唯一 writer；按本次接棒的条件授权核到测试 blob 和 shared-shell 输入变化，先交此计划，暂停依赖这些输入的合成与验证，待根审最小补验后接续。没有业务冲突、没有自行增加完整复审/Full，也没有动 T143 或 PR1a 作者树。

## 1. 任务与证据来源

当前协调目录未找到独立 `tasks/T-148` 文件。正式旧受理 6542075373 和独立二审均明确当时没有独立 T148.md；因此沿用准确 H 的 accepted 任务书 `specs/repository-anti-corruption/slices/platform-terminal-launch.md` §6/7，以及正式裁 6548428638/6548548260，不把文件缺失变成新的批准门或新建重复 spec。

已读完整原件：`/private/tmp/t148-main-sync/REPORT.md`、`/private/tmp/t148-increment-verify/REPORT.md`、`/private/tmp/t148-increment-second/REPORT.md`，及当前 PR 正文、正式裁与核收评论。它们已有等价“正常 merge、只核真实增量”的计划，本计划仅补此次冻结 M 的实际差异。

- [6548919129 增量二审采用](https://github.com/molis-ai/molis-work/pull/1654#issuecomment-6548919129)：原 28 冲突、72 路径、open/list@2 与 close/prompt@1，固定旧 @1 拒绝；无 Blocker/P1 或新必修。
- [6549221088 独立增量采用](https://github.com/molis-ai/molis-work/pull/1654#issuecomment-6549221088)：准确 H 独立整体构建，非 update API/actions，完整 goals-terminal 4/4 与 web-route-table 2/2；作者其余 39 例保原来源。CI41239003651 的实际合并树只比 H 多三份状态文档，CI 与 H 运行分开记录。
- 本轮 fresh PR/远端仍 H，PR open/unmerged、mergeable=true；CI41239003651 已 completed/success，仅补终态 metadata，不另签 Full。原件见 [source-metadata.json](source-metadata.json)。

## 2. 冻结对象与实际合成

| 对象 | 准确值 |
| --- | --- |
| 原树/分支 | `/private/tmp/t148-main-sync-tree` / `task/T148-ca`，开工干净 |
| H | `4d6f5766dc1a7323433d104405591fb74cd1f3d2`，tree `81e85687f467f650c034b07d98a27a0d2ec072ec` |
| 冻结 M | `8a46c2cb7c596ffec0241dcfcfcfb3cf7552f987`，T377 实际采用的 main |
| merge-base B | `edb257e0bea26929e6e909360e05a49041d9b414` |
| 隔离自动合成树 | `591be0f06cba3ac5b0c213ac544ad363a06eb880`，merge-tree exit0，无文本冲突 |

只用 `GIT_OBJECT_DIRECTORY=/private/tmp/t148-current-sync/objects` 和共享对象库的只读 alternate 做 merge-tree；没有 checkout、改 refs/index/作者树，也没有 fetch 或安装。没有取 T377 未合候选。最终执行仍应正常 merge 该冻结 M，不追新 main 或把 PR synthetic merge 当采用。

实际 H→自动合成树共吸收 **55 路径**，完整列表与实际 patch 均已保留，不仅看 PR 文件数或 mergeable：

- [55 路径列表](absorbed-main-name-status.log)、[完整 H→自动树差异](automatic-vs-H.diff)、[B→M 全差异](main-since-base.diff)。
- [本单 H 原 scoped diff](H-scoped.diff)、[自动树对 M](automatic-vs-M.diff)、[合成日志](merge-tree.log)。

## 3. 72 自有路径：69 原 blob，3 处自动吸收 main

**72/72 路径的原自有有序增删行，与新 M→自动树的自有增删行全部相同。** [逐文件补丁映射](self-delta-mapping.json)。其中 69 路径整个 blob 同 H；另 3 个整个文件 blob 因 main 新增内容不同，不能写“72 blob 全相同”或默认满足本次条件授权：

| 相交路径 | 实际 main 增量 | T148 原补丁保留 |
| --- | --- | --- |
| `docs/system/EXTENSION-POINTS.md` | T378 澄清 registration/PG067/翻译的现行入口与历史成本表 | 原终端配方入口改名/旧描述删除仍原样；不回盖 main 新说明 |
| `tests/ci-product-subset.txt` | 新增 `tests/alchemist-host.test.ts` | 原删除 desktop-launch-args 清单行保留，不重加或删除其它 owner 用例 |
| `tests/desktop-tui.test.ts` | 一行断言跟随 T377：`setDesktopWorkSurface` 第四参 `intent = "open"` | T148 的 Goals 路由/PTY只附着/旧服务删除等全部有序补丁不变；此文件测试 blob 确实变化 |

三处完整差异见 [three-intersections.diff](three-intersections.diff)，没有待手修的冲突标记。若根接续，自动合成结果应可直接正常 merge；不得整文件取旧 H、还原 T377 的签名/新断言，或以旧断言不匹配为由改生产函数。

## 4. 关键合同、调用方与测试输入

[dependency-checks.json](dependency-checks.json) 核 H→自动树的 39 组相关路径，无差异：contracts/SDK/Runtime/storage/test-kit、horizontal runtime-host，Goals 包的声明/handlers/HTTP、终端服务/记录/运行时配方、PTY、MCP 三调用方、catalog/schema/删除、工作台 terminal 客户端、全部 fixtures、原作者七文件及相关安全/删除文件、runner、根 package/lock/类型配置。

因此 open/list@2、close/prompt@1、固定旧 @1 不自动改引用、三处会话格式拒绝、PTY只附着、清理与事务语义、S103/Backlog/旧表仅DDL均保原样。API、动作与 route 快照也同 H。原 45/45、独立 6/6、版本先红、旧 48/M1/旧变异及各层二审都可保原对象及未变范围，不重跑或改署为未来 N 已执行。

额外 Host 输入 **不是零变化**：[project-service-input.diff](project-service-input.diff) 是 main 已采用的 `plugin-projects-service.ts` 错误边界：`projects.existing` 的未知目录错误记 Host log，并收窄为 `actions.unavailable`；既有 ActionError 原样抛出。它由 installed-plugin-host 平台装配消费；终端服务自身仍直接调 catalog 的 terminalPanels / workspace 方法，相关代码不变。这支持沿用终端核心证据，但不能宣称整个 Host 相同或用旧测试背签该错误分支。

与终端外壳组合直接相关的实际新增输入是 T377 三个 shared client：reopen 清失败提示、restore 传 `"restore"`、导航函数增加默认 `intent="open"` 并避免数据刷新重试失败 surface。它们原本不在 T148 自有源路径，却改变 `desktop-tui` 消费的 CLIENT_SCRIPT；该一行断言同步是实质输入变化，本线依根条件停在 PLAN。不会将其扩成 T148 新产品需求或重审 T377 全部功能。

## 5. 建议根核定的最小接续

建议按以下增量口径接续：保留自动合成的 72/72 自有补丁，按 T377 已采用原件沿用 shared-shell 行为；不本机重跑原七文件45、独立两文件6、旧48或变异。新组合对 `desktop-tui.test.ts` 的覆盖优先核**未来准确 N 的现有 CI 完整文件原件**，含真实 checkout/tree、build、完整执行行及 fail/skip/retry/bail；不以旧35/36或源代码扫描替代实际执行。

若根判断还需本机动态补证，仅点名**原完整 `tests/desktop-tui.test.ts` 一份**，先按当前实际内容核 PTY/login shell/fake CLI 隔离路线与授权，再 jobs1/browser-jobs1/retries0 执行，结果按实际记录；不筛 case、不换入口、不追加矩阵。旧报告 HOLD 仅保历史证据边界，不从历史另造永久禁测，也不据此自行绕过当前授权。本计划尚未运行该文件，测试数量不预填。

根接受增量处置后，原条件授权中的工程部分依次执行：

1. fresh 核 H/远端/dirty/占用及原 CI 终态；保护唯一 writer 与 PR1a 分树。正常 `git merge --no-ff M`，不 rebase/force；新 N/tree 应绑定上述自动树。任何新冲突或实际输入再变，停相关步给根准确差异。
2. 在本次临时系统 HOME/CFFIXED/Foundation 路径，白名单环境、file SecretStore、首次 `MOLIS_HELPER_SIGNING_IDENTITY=-`、专用 Chrome/profile 配置，frozen/offline 安装及匹配整体 `pnpm build`。不复制其它工作树 dist。使用 pnpm11 的实际 `PNPM_CONFIG_*` 私有 store/offline 配置，先读回配置，避免隐式切 store；公共 build 槽，不继承真实 key/代理/NODE_OPTIONS。
3. matching build 后 `node scripts/check-package-boundaries.mjs`；`node scripts/check-health-gates.mjs --base M`（含 API/测试导入图，不重复单独跑）；现成非 update `node scripts/gates/action-contract-snapshot.mjs`。只核现行快照一致，不无因重生成。
4. `node scripts/gates/page-assets.mjs --base M` 及只读 report，核**实际 served 48 项逐项等于 M**，无新增/删除、discovery miss 或 slack；有任何新 delta 先报根，不改预算/许可/门禁，不取得资源写窗口。
5. fresh `git fetch origin main` 后逐提交 secrets（仍声明冻结合入 M，不跟随 fetch 再 merge）、scoped diff check、最后 H/N/tree/clean/远端回读，交本地候选与原件。若 fetch 的 main 已前进，明确其与冻结 M 的区别，不静默改范围。

不自动安排任何本机 Full、GitHub 操作或推送。full=true 原标记与旧 carrier 的证据范围保留；组合 CI/Full 沿根现有结算，不由本计划另加一轮 Full 门槛。真实 Home4207/Keychain/日常 Chrome/真实 CLI账号/中文输入/最终 App及用户验收不触碰。

## 6. 资源与当前停止点

[resources.json](resources.json)：自动合成树的账本与门禁脚本均完整沿 M，静态预算 **48 项、7,469,175 B**，对 M **零差异**。这只是静态输入结论，尚未 matching build 或实际 served；不能把旧作者资源测量移记为本轮。

本轮没有落 merge、改作者树/ref/index、安装、构建、测试、生成快照、写 GH/coord，或碰真实 Home/凭据。临时对象只留在本目录 objects。原树仍 H、干净；T143 不再动。没有许可做旧表 DDL 清理、迁移或产品语义变更；旧表、RAC2566/2567后片、BL637/911/913等保既有归属与未完边界。

**交根裁定的唯一增量：本次虽无冲突且 72/72 自有补丁等价，但 shared-shell 和 desktop-tui 测试输入已变，是否按上述“沿用 T377 原件 + 新组合 CI 完整 desktop-tui”口径接续。根核最小验证前，不自行合成/构建或追加本机测试。**
