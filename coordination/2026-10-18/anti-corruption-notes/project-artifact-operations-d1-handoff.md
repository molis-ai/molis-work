# W5-01 Shelf 公共前置 D1 交接（负责人：Codex；writer 已交回 root）

状态：2026-10-18，实现及本机定向验证完成，源码/测试冻结；未提交、未推送。公共前置功能可用，不代表 Shelf 迁移、整线、CI 全量或发布完成。唯一需求仍为仓库 specs/repository-anti-corruption/spec.md 顶部 D1 / W5-01-D1-01…06；本文件只交接实现与证据。

工作树：/Users/yijunwang/code/molis-anti-corruption-20261017/wt-project-artifact-operations
分支：feature/w5-01-project-artifact-operations
HEAD：eaca4ded6bdc20d8d2dfdd636dc22f04c1918ac0

## 精确未提交文件

```text
 M apps/local-host/src/plugin-host-services.ts
 M docs/system/SECURITY-INVARIANTS.md
 M packages/contracts/src/platform/plugin-artifacts.ts
 M packages/contracts/src/platform/plugin.ts
 M packages/plugin-sdk/README.md
 M plugins/native/artifacts/README.md
 M plugins/native/artifacts/src/index.ts
 M plugins/native/artifacts/src/plugin-client.ts
 M skills/molis-plugin-dev/authoring.md
 M specs/repository-anti-corruption/spec.md
 M tests/plugin-artifact-client.test.ts
 M tests/plugin-host-services.test.ts
?? plugins/native/artifacts/src/plugin-action-contracts.ts
?? plugins/native/artifacts/src/plugin-operations.ts
?? tests/plugin-artifact-operations.test.ts
```

其中新增出现的 SECURITY-INVARIANTS.md、plugin-sdk/README.md、artifacts/README.md、authoring.md 与唯一spec是root并行收尾的5份文档，本writer未编辑。源码/测试仍为本writer原10文件。

## 已实现

- contracts/platform/plugin 新增 PluginProcessItemHead、PluginConsumableVersion；process head/readOwn 与 artifacts listConsumable 为 required 作者方法；未额外扩 SDK 便利 type exports。
- artifacts owner 公开 createPluginArtifactOperations；clone Manifest，先核权限声明再可信 authorize。包内唯一 schema/白名单投影由 SDK actions 和直接 owner operations 共用；Host 注入 kernel 公开 assertActionInput，owner 不依赖 kernel。
- client 保留安装身份匹配、实时 grant、一次 provider、invokeSync、dispose；八个 handler 全委托同工厂，client/process 分开。原 read/head/own/publish/record @1 输入输出逐字段测试保持；同 provider 新增 process-head/process-own/list query @1（project/plugin/artifact:read/sync）。
- 过程 own 校验生产者 ID/签名/个人 owner，允许生产者 version 升级、归档/unavailable 自恢复且不要求 consumes；成果 own 保留仅 producer ID 的旧规则。
- 目录列两类全部可消费固定版本，成果先于过程且各守 owner 顺序；最小摘要、原样非空标题；read/list 共用消费判断、查询故障抛出。排除同引用过程使用全部成果集合（含不可消费成果），与 read 成果优先一致。
- 作者来源与 Module owner 不变；生产者停止后的固定合法版本仍能消费。真实 Host action 作者与安装 actor 不同的用例覆盖 created_by/owner 保留及过程 own 拒绝。
- 最后窄修正经 root 同意：client 向工厂显式传 api/process/manifest/project_id/actor_id/author/assertInput/authorize，不携入 actions/context 装配字段。该处之后再次整体构建与3份直接受影响测试重验通过。

- Review收口：consumptionIssue原先重读可变factory参数，现只取创建时捕获的api/process/project_id/actor_id；不deep-freeze owner端口，不改变动态权限与author callback。新增一条真实双store测试逐次修改原options的actor、project、api/process，再核read/list/own/write仍使用原身份。

未改 Module SQL/库、Runtime、Graph、Home invocation、Shelf/OwnerFiles/Alchemist；没有数据迁移、页面资源、门禁或阈值变动。没有调用远端、真实 Home、钥匙串或 Claude。

## 验证命令与原日志

所有命令在上述工作树运行；所有测试 --jobs 2，各自临时 Home。正式回归全部通过，无重试或放宽断言；另有一轮故意在修前代码运行新增回归、精确复现身份绑定问题的预期失败，见下方review收口。最终有效证据为 71 + 8 = 79 个不同文件、865 + 56 = 921 条通过，不重复计入初轮20条与中间55条。

1. `pnpm install --frozen-lockfile --offline`：成功；/tmp/molis-artifact-operations-d1-install.log。
2. `node scripts/machine-slot.mjs run build --label artifact-operations-d1 -- pnpm build`：成功；/tmp/molis-artifact-operations-d1-build.log。
3. `node scripts/run-tests.mjs --jobs 2 tests/plugin-artifact-client.test.ts tests/plugin-artifact-operations.test.ts tests/plugin-host-services.test.ts`：3文件20条；/tmp/molis-artifact-operations-d1-focused.log。
4. 3个包 README 必跑与 spec 显式要求共74文件，扣除上述3份后71文件865条通过，6.6分钟；/tmp/molis-artifact-operations-d1-required.log。去重清单 /tmp/molis-artifact-operations-d1-required-files.txt；完整命令原件 /tmp/molis-artifact-operations-d1-required-command.txt，内容如下：

```sh
node scripts/run-tests.mjs --jobs 2 tests/artifacts-module.test.ts tests/artifacts-actions.test.ts tests/artifact-browser.test.ts tests/artifact-document-import.test.ts tests/artifact-links.test.ts tests/artifact-source-and-links.test.ts tests/personal-artifact-owner.test.ts tests/artifact-subject-context.test.ts tests/artifact-search-summary.test.ts tests/action-schema-compiler.test.ts tests/action-plugin-audience.test.ts tests/plugin-manifest-v2.test.ts tests/plugin-declaration-rules.test.ts tests/action-read-compatibility.test.ts tests/runtime-provider-identity.test.ts tests/plugin-capability-availability.test.ts tests/action-error-model.test.ts tests/plugin-model-service.test.ts tests/action-availability-kind.test.ts tests/local-host.test.ts tests/host-periodic-tasks.test.ts tests/local-host-actions.test.ts tests/local-host-queue-scope.test.ts tests/web-mutation-key-settle.test.ts tests/action-before-effect.test.ts tests/action-directory-installation.test.ts tests/action-model-scheduling.test.ts tests/installer-symlink-dependencies.test.ts tests/system-search-host.test.ts tests/project-arrival.test.ts tests/project-deletion-hooks.test.ts tests/project-deletion-owners.test.ts tests/project-deletion-studios.test.ts tests/project-deletion-assistant.test.ts tests/onboarding-goals-actions.test.ts tests/project-deletion-declarations.test.ts tests/project-deletion-processes.test.ts tests/memory-learning.test.ts tests/goal-management-identity.test.ts tests/home-store-baselines.test.ts tests/private-store-versions.test.ts tests/project-deletion-service.test.ts tests/mcp-connection-identity.test.ts tests/management-door-identity.test.ts tests/plugin-development-artifacts.test.ts tests/mcp-session-authorship-nested.test.ts tests/action-gateway-session-authorship.test.ts tests/anysearch-single-owner.test.ts tests/alchemist-pulse-github.test.ts tests/lark-mcp-launch.test.ts tests/connector-mcp.test.ts tests/network-notices.test.ts tests/model-first-setup-http.test.ts tests/contextual-interaction.test.ts tests/local-web-actions.test.ts tests/verify-release-versions.test.ts tests/action-error-edges.test.ts tests/plugin-platform-home.test.ts tests/web-home-isolation.test.ts tests/feed-sync-authority.test.ts tests/action-gateway.test.ts tests/goals-mcp-actions.test.ts tests/security-invariants-gateway.test.ts tests/plugin-project-database.test.ts tests/settings-call-diagnostics.test.ts tests/runtime-plugin-http-discovery.test.ts tests/shelf-project-results-http.test.ts tests/cli-goals-actions.test.ts tests/shelf-jelly-cognia-images-error-model.test.ts tests/host-pages-error-model.test.ts tests/plugin-route-operations.test.ts
```

5. 窄修正后 `node scripts/machine-slot.mjs run build --label artifact-operations-d1-final -- pnpm build`：成功，刷新构建指纹；/tmp/molis-artifact-operations-d1-final-build.log。
6. 参数白名单修正后的中间重验与实际消费者，8文件55条通过，0.4分钟；/tmp/molis-artifact-operations-d1-final-tests.log：

```sh
node scripts/run-tests.mjs --jobs 2 tests/plugin-artifact-client.test.ts tests/plugin-artifact-operations.test.ts tests/plugin-host-services.test.ts tests/plugin-fixed-input-sdk.test.ts tests/plugin-host-executor.test.ts tests/plugin-runtime-integration.test.ts tests/plugin-sdk-exports.test.ts tests/plugin-input-graph.test.ts
```

7. `git diff --check` 最终通过。`node scripts/affected-tests.mjs --base HEAD` 的 D1 限定建议保存在 /tmp/molis-artifact-operations-d1-scoped-affected.log；因 contracts + 3包提示共享核心全量，交 CI，未在本机跑。

## Review 收口后的最终验证（替代中间3+5的完成状态）

只读评审报告：/Users/yijunwang/code/molis-anti-corruption-20261017/project-artifact-operations-code-review.md。该报告未发现当时项目SDK生产链Blocker/P1；指出新直调工厂参数变更可导致消费判断与取数身份不一致。本片已最小修正。

- 修前回归：新增测试后，保持原生产dist，运行 `node scripts/run-tests.mjs --jobs 2 tests/plugin-artifact-operations.test.ts`。旧7条通过，新1条在actor参数更改后精确失败（Missing expected exception，借读另一个人的过程项）；/tmp/molis-artifact-operations-d1-binding-before.log。此失败是证明新增回归能发现所修问题，未放宽断言。
- 修正只涉及 plugin-operations.ts 的捕获上下文/消费helper窄类型，以及 plugin-artifact-operations.test.ts 新增测试；原参数白名单修正保持。
- `node scripts/machine-slot.mjs run build --label artifact-operations-d1-bound-identity -- pnpm build`：exit 0；/tmp/molis-artifact-operations-d1-binding-build.log。
- 同上第6条完整8文件命令：最终8文件56条全通过（operations现在8/8），exit 0；/tmp/molis-artifact-operations-d1-binding-tests.log。
- 71文件865条有效结果按root决定保留，不重复运行。最终 `git diff --check` 通过，源码/测试已冻结；仍是原HEAD，writer源码/测试10文件dirty；root另有5份公共文档dirty，未提交。

## root 继续收尾

- 实读上述源码/测试10文件及root维护文档的 diff 后提交；唯一spec状态、包README/必要Skill、安全表由root串行维护。
- 按现 API/actions 脚本刷新与核对派生快照、boundary、merge-base health、资源与secrets门禁。本agent未运行这些，不能把本机测试当门禁通过。
- 私有SDK动作的动态availability需要安装身份，当前无安装身份的host动作快照可能不枚举它们；按actions:update实测，不为快照放宽availability。真实SDK discovery用例已逐字段固定8动作合同。
- 共享核心CI全量、PR、问题处理、合入main与最终交接由root按用户新授权执行。本agent未启动D2/D3或Shelf正式迁移。
